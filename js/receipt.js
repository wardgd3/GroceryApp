// js/receipt.js
(function(){
    document.addEventListener('DOMContentLoaded', () => {
        const sb = window.sb;
        if (!sb) return;

        // Local paid-state persistence (per ticket id)
        const PAID_LS_KEY = 'ticket_paid_v1';
        const getPaidState = () => { try { return JSON.parse(localStorage.getItem(PAID_LS_KEY) || '{}'); } catch { return {}; } };
        const setPaidState = (id, paid) => {
            const map = getPaidState(); const k = String(id);
            if (paid) map[k] = 1; else delete map[k];
            localStorage.setItem(PAID_LS_KEY, JSON.stringify(map));
        };
        const isPaidLocal = (id) => !!getPaidState()[String(id)];
        const clearPaidForIds = (ids=[]) => {
            const map = getPaidState(); let changed = false;
            for (const id of ids) {
                const k = String(id);
                if (k in map) { delete map[k]; changed = true; }
            }
            if (changed) localStorage.setItem(PAID_LS_KEY, JSON.stringify(map));
        };

        const listEl = document.getElementById('tickets-list');
        const empty = document.getElementById('tickets-empty');
        const refreshBtn = document.getElementById('refresh-tickets-btn');
        const backBtn = document.getElementById('back-btn');
        const historyBtn = document.getElementById('history-btn');
        const isHistory = (document.body && document.body.dataset && document.body.dataset.view === 'history');

        // Cache of last groups for resolve actions
        const lastGroups = new Map(); // key: list_id, value: array of tickets

        async function loadTickets(){
            if (!listEl) return;
            listEl.innerHTML = '';
            if (empty) empty.textContent = 'Loading…';

            let rows = [];
            if (isHistory) {
                // Load receipts from ticket_history simplified schema
                const { data: hist, error: he } = await sb
                    .from('ticket_history')
                    .select('id, name, created_at, receipt_jsonb')
                    .order('created_at', { ascending: false });
                if (he) {
                    console.error('Error loading ticket_history:', he);
                    if (empty) empty.textContent = 'Error loading history';
                    return;
                }
                // Flatten each receipt's tickets into row items for grouped rendering
                rows = [];
                (hist || []).forEach(r => {
                    const tickets = (r.receipt_jsonb && Array.isArray(r.receipt_jsonb.tickets)) ? r.receipt_jsonb.tickets : [];
                    if (!tickets.length) {
                        // create a single summary row if no tickets array provided
                        rows.push({
                            id: r.id,
                            list_id: r.id,
                            name: r.name,
                            person: 'total',
                            amount_due: Number(r.receipt_jsonb?.total || 0),
                            status: 'resolved',
                            created_at: r.created_at,
                            list_name: r.name
                        });
                    } else {
                        tickets.forEach((t, idx) => {
                            rows.push({
                                id: `${r.id}:${idx}`,
                                list_id: r.id,
                                name: r.name,
                                person: t.person || t.name || 'person',
                                amount_due: Number(t.amount_due ?? t.amount ?? 0),
                                status: 'resolved',
                                created_at: r.created_at,
                                list_name: r.name
                            });
                        });
                    }
                });
            } else {
                // Active view from ticket table
                // Base query
                let query = sb.from('ticket')
                    .select('id, list_id, name, person, amount_due, status, created_at, shopping_lists!inner (list_name)')
                    .order('created_at', { ascending: false });

                query = query.neq('status', 'resolved');

                const { data, error } = await query;
                if (!error && Array.isArray(data)){
                    rows = data.map(r => ({
                        id: r.id,
                        list_id: r.list_id,
                        name: r.name,
                        person: r.person,
                        amount_due: r.amount_due,
                        status: String(r.status || '').toLowerCase(),
                        created_at: r.created_at,
                        list_name: r.shopping_lists?.list_name || ''
                    }));
                } else {
                    // Join not available: filter bare tickets to only those with an existing parent list
                    let listIdSet = null;
                    try {
                        const { data: lists, error: le } = await sb.from('shopping_lists').select('id');
                        if (!le && Array.isArray(lists)) {
                            listIdSet = new Set(lists.map(x => x.id));
                        } else if (le) {
                            console.warn('shopping_lists fetch failed; falling back to raw tickets:', le);
                        }
                    } catch (ex) {
                        console.warn('shopping_lists fetch threw; falling back to raw tickets:', ex);
                    }

                    const { data: bare, error: e2 } = await sb
                        .from('ticket')
                        .select('id, list_id, name, person, amount_due, status, created_at')
                        .neq('status', 'resolved')
                        .order('created_at', { ascending: false });
                    if (e2) {
                        console.error('Error loading tickets:', e2);
                        if (empty) empty.textContent = 'Error loading tickets';
                        return;
                    }
                    const baseRows = (bare || []).map(r => ({
                        id: r.id,
                        list_id: r.list_id,
                        name: r.name,
                        person: r.person,
                        amount_due: r.amount_due,
                        status: String(r.status || '').toLowerCase(),
                        created_at: r.created_at
                    }));
                    rows = listIdSet ? baseRows.filter(r => listIdSet.has(r.list_id)) : baseRows;
                }
            }

            // Defensive: remove any rows already resolved even if DB had case variants
            if (!isHistory && Array.isArray(rows) && rows.length) {
                rows = rows.filter(r => String(r.status || '').toLowerCase() !== 'resolved');
            }

            if (!rows.length){
                if (empty) empty.textContent = isHistory ? 'No history yet.' : 'No tickets yet.';
                return;
            }
            if (empty) empty.textContent = '';

            const fmt = (n)=> `$${Number(n||0).toFixed(2)}`;

            // Group by list_id
            const groups = rows.reduce((acc, r) => {
                const key = r.list_id || 'unknown';
                if (!acc[key]) acc[key] = [];
                acc[key].push(r);
                return acc;
            }, {});

            // Update cache
            lastGroups.clear();
            Object.keys(groups).forEach(k => lastGroups.set(k, groups[k]));

            // Render a card per list
            const cardsHtml = Object.keys(groups).map(listId => {
                const items = groups[listId];
                // sort items newest first within group
                items.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
                const headerCreated = items[0]?.created_at ? new Date(items[0].created_at).toLocaleString() : '';
                const listName = items[0]?.name || items[0]?.list_name || listId;

                const allPaid = items.every(t => t.status === 'paid' || t.status === 'resolved' || isPaidLocal(t.id));

                const rowsHtml = items.map(t => {
                    let actionHtml = '';
                    if (!isHistory) {
                        const isPaid = (t.status === 'paid' || isPaidLocal(t.id));
                        actionHtml = isPaid
                          ? `<button class="btn-paid" data-toggle-pay="${t.id}" data-current="paid" type="button"><span class="checkmark"></span> Paid</button>`
                          : `<button class="ghost" data-toggle-pay="${t.id}" data-current="open" type="button">Mark paid</button>`;
                    } else {
                        actionHtml = `<span class="badge success">resolved</span>`;
                    }

                    return `
                        <div class="ticket-row" style="display:flex; align-items:center; gap:8px; padding:6px 0; border-top:1px solid #f2f2f2;">
                            <div style="min-width:90px; text-transform:capitalize;">${escapeHtml(t.person)}</div>
                            <div style="margin-left:auto; text-align:right; font-variant-numeric: tabular-nums;">${fmt(t.amount_due)}</div>
                            <div>${actionHtml}</div>
                        </div>`;
                }).join('');

                const total = items.reduce((s, t)=> s + Number(t.amount_due||0), 0);

                const reviewBtn = `<button class="ghost" data-review="${listId}" type="button">Review</button>`;
                const actionBtn = (isHistory)
                    ? `<div class="resolve-wrap">${reviewBtn} <button class="ghost" data-delete-history="${listId}">Delete</button></div>`
                    : `<div class="resolve-wrap" style="display:flex; gap:8px;">
                        ${reviewBtn}
                        <button class="primary" data-resolve="${listId}" ${allPaid ? '' : 'disabled'}>Resolve</button>
                    </div>`;

                return `
                    <div class="ticket-card" data-list="${listId}" style="border:1px solid #e5e7eb; border-radius:10px; padding:12px;">
                        <div class="ticket-head" style="display:flex; gap:8px; align-items:center;">
                            <div style="font-weight:600;">${escapeHtml(listName)}</div>
                            <div class="muted" style="margin-left:auto;">${headerCreated}</div>
                        </div>
                        <div class="ticket-body" style="margin-top:6px;">
                            ${rowsHtml}
                        </div>
                        <div class="ticket-foot" style="display:flex; gap:8px; align-items:center; margin-top:8px;">
                            <div class="muted">List total</div>
                            <div style="margin-left:auto; font-weight:600;">${fmt(total)}</div>
                            ${actionBtn}
                        </div>
                    </div>`;
            }).join('');

            listEl.innerHTML = cardsHtml;
        }

        function escapeHtml(s){
            return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        }

        if (refreshBtn) refreshBtn.addEventListener('click', loadTickets);
        if (backBtn) backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
        if (historyBtn) historyBtn.addEventListener('click', () => {
            window.location.href = 'ticketHistory.html';
        });

        // Delegated action: toggle paid
        if (listEl) listEl.addEventListener('click', async (e)=>{
            const toggleBtn = e.target.closest('[data-toggle-pay]');
            if (toggleBtn) {
                const id = toggleBtn.getAttribute('data-toggle-pay');
                const current = toggleBtn.getAttribute('data-current'); // 'open' | 'paid'
                const nextStatus = current === 'paid' ? 'open' : 'paid';

                const row = toggleBtn.closest('.ticket-row');
                const card = toggleBtn.closest('.ticket-card');

                // Optimistic UI swap
                const original = toggleBtn.outerHTML;
                const newBtn = document.createElement('button');
                if (nextStatus === 'paid') {
                    newBtn.className = 'btn-paid';
                    newBtn.type = 'button';
                    newBtn.setAttribute('data-toggle-pay', id);
                    newBtn.setAttribute('data-current', 'paid');
                    newBtn.innerHTML = '<span class="checkmark"></span> Paid';
                } else {
                    newBtn.className = 'ghost';
                    newBtn.type = 'button';
                    newBtn.setAttribute('data-toggle-pay', id);
                    newBtn.setAttribute('data-current', 'open');
                    newBtn.textContent = 'Mark paid';
                }
                toggleBtn.replaceWith(newBtn);

                // Update localStorage immediately so it survives refresh
                setPaidState(id, nextStatus === 'paid');

                // Update cache and resolve button state
                try {
                    const listId = card?.dataset?.list;
                    if (listId && lastGroups.has(listId)) {
                        const group = lastGroups.get(listId);
                        const tIdx = group.findIndex(t => String(t.id) === String(id));
                        if (tIdx !== -1) {
                            group[tIdx].status = nextStatus;
                            const allPaidNow = group.every(t => (isPaidLocal(t.id) || t.status === 'paid' || t.status === 'resolved'));
                            const foot = card.querySelector('.ticket-foot');
                            if (foot) {
                                let resolveEl = foot.querySelector('[data-resolve]');
                                if (!resolveEl) {
                                    const wrap = document.createElement('div');
                                    wrap.className = 'resolve-wrap';
                                    wrap.innerHTML = `<button class="primary" data-resolve="${listId}" ${allPaidNow ? '' : 'disabled'}>Resolve</button>`;
                                    foot.appendChild(wrap);
                                    resolveEl = wrap.firstElementChild;
                                } else {
                                    if (allPaidNow) resolveEl.removeAttribute('disabled');
                                    else resolveEl.setAttribute('disabled', '');
                                }
                            }
                        }
                    }
                } catch(_) {}

                // Optional: still try to persist to DB; if it fails, revert local state and UI
                let affected = 0; let upErr = null;
                try {
                    const { error: e1 } = await sb.from('ticket').update({ status: nextStatus }).eq('id', String(id));
                    if (!e1) affected = 1; else upErr = e1;
                } catch (ex1) { upErr = ex1; }

                if (affected === 0) {
                    // Revert LS + UI if you want strict DB-sync; otherwise comment this block out to keep LS as source of truth
                    setPaidState(id, current === 'paid');
                    const revert = document.createElement('span');
                    revert.innerHTML = original;
                    newBtn.replaceWith(revert.firstElementChild);
                 const msg = upErr ? (upErr.message || 'Unknown') : 'No rows updated';
                    alert('Error updating status: ' + msg);
                    return;
                }
                return;
            }

            const reviewBtn = e.target.closest('[data-review]');
            if (reviewBtn) {
                e.preventDefault();
                const listId = reviewBtn.getAttribute('data-review');
                try {
                    await openReviewDialog(listId);
                } catch (err) {
                    alert('Failed to load review: ' + (err?.message || 'Unknown error'));
                }
                return;
            }

            const resolveBtn = e.target.closest('[data-resolve]');
            if (resolveBtn) {
                e.preventDefault();
                e.stopPropagation();
                const listId = resolveBtn.getAttribute('data-resolve');
                const group = lastGroups.get(listId) || [];
                // Consider localStorage-paid flags in addition to DB status
                const allPaid = group.length > 0 && group.every(t => (t.status === 'paid' || t.status === 'resolved' || isPaidLocal(t.id)));
                if (!allPaid) {
                    alert('All rows must be paid before resolving.');
                    return;
                }
                if (!confirm('Resolve receipt? This will move it to history.')) return;
                // Optimistic UI: remove the card immediately
                let card = resolveBtn.closest('.ticket-card');
                if (!card) {
                    // Fallback lookup by data-list
                    card = listEl.querySelector(`.ticket-card[data-list="${listId}"]`);
                }
                if (card && card.parentNode) {
                    card.parentNode.removeChild(card);
                }
                // Update empty state if no more cards
                if (listEl && listEl.querySelectorAll('.ticket-card').length === 0 && empty && !isHistory) {
                    empty.textContent = 'No tickets yet.';
                }
                // Prune cache to avoid re-rendering this group from a stale reference
                try { lastGroups.delete(listId); } catch(_) {}
                try {
                    // Build a single receipt payload
                    const listName = group[0]?.name || group[0]?.list_name || `Receipt ${new Date().toLocaleString()}`;
                    const createdAt = new Date().toISOString();
                    const total = group.reduce((s, t) => s + Number(t.amount_due || 0), 0);
                    const tickets = group.map(t => ({
                        ticket_id: t.id,
                        person: t.person,
                        amount_due: Number(t.amount_due || 0),
                        status: t.status,
                        created_at: t.created_at
                    }));
                    const receipt = {
                        list_id: listId,
                        name: listName,
                        created_at: createdAt,
                        total,
                        tickets
                    };

                    // Insert one row into ticket_history with simplified columns
                    const { error: ihErr } = await sb.from('ticket_history').insert({
                        name: listName,
                        created_at: createdAt,
                        receipt_jsonb: receipt
                    });
                    if (ihErr) throw ihErr;

                    // After recording the receipt, mark all group tickets as resolved
                    let ids = group.map(t => t.id);
                    // Coerce ID types if numeric-like
                    if (ids.length && /^\d+$/.test(String(ids[0]))) {
                        ids = ids.map(v => Number(v));
                    }
                    const listIdDb = group[0]?.list_id || listId;
                    let updated = 0;
                    let upErr = null;
                    // Primary: update by list_id (unconditional)
                    try {
                        const { data: updRows, error: eqErr } = await sb
                            .from('ticket')
                            .update({ status: 'resolved' })
                            .eq('list_id', listIdDb)
                            .select('id');
                        if (eqErr) throw eqErr;
                        updated = Array.isArray(updRows) ? updRows.length : 0;
                    } catch (e1) {
                        upErr = e1;
                        console.warn('list_id update failed, will try id IN:', e1);
                    }
                    if (updated === 0 && ids.length) {
                        try {
                            const { data: updRows2, error: inErr } = await sb
                                .from('ticket')
                                .update({ status: 'resolved' })
                                .in('id', ids)
                                .select('id');
                            if (inErr) throw inErr;
                            updated = Array.isArray(updRows2) ? updRows2.length : 0;
                        } catch (e2) {
                            upErr = e2;
                            console.warn('Tickets updated to resolved (fallback) failed:', e2);
                        }
                    }
                    if (updated === 0) {
                        // Last resort: verify and individually update remaining tickets
                        try {
                            const { data: stillOpen } = await sb
                                .from('ticket')
                                .select('id, status')
                                .eq('list_id', listIdDb)
                                .neq('status', 'resolved');
                            if (Array.isArray(stillOpen) && stillOpen.length) {
                                for (const row of stillOpen) {
                                    await sb.from('ticket').update({ status: 'resolved' }).eq('id', row.id);
                                }
                            }
                        } catch (e3) {
                            console.warn('Per-row resolve attempts failed:', e3);
                        }
                    }

                    // Delete tickets (belt-and-suspenders) and then delete the shopping list to prevent orphans
                    try {
                        try {
                            await sb.from('ticket').delete().eq('list_id', listIdDb);
                        } catch (delTixEx) {
                            console.warn('Deleting tickets failed (non-fatal):', delTixEx);
                        }
                        const { error: delErr } = await sb
                            .from('shopping_lists')
                            .delete()
                            .eq('id', listIdDb);
                        if (delErr) {
                            console.warn('Deleting shopping list failed:', delErr);
                        }
                    } catch (delEx) {
                        console.warn('Shopping list delete threw:', delEx);
                    }

                    // Clear any saved local Paid flags for tickets in this list
                    try { clearPaidForIds(ids); } catch(_) {}

                    await loadTickets();
                    // Safety: if the card still exists due to a race, remove it now
                    try {
                        const leftover = listEl?.querySelector(`.ticket-card[data-list="${listId}"]`);
                        if (leftover && leftover.parentNode) {
                            leftover.parentNode.removeChild(leftover);
                            if (listEl.querySelectorAll('.ticket-card').length === 0 && empty && !isHistory) {
                                empty.textContent = 'No tickets yet.';
                            }
                        }
                    } catch(_) {}
                } catch (err) {
                    console.error(err);
                    alert('Failed to resolve: ' + (err?.message || 'Unknown error'));
                    // Restore UI via reload on failure
                    await loadTickets();
                }
            }

            // Delete entire active ticket list
            const delListBtn = e.target.closest('[data-delete-list]');
            if (delListBtn && !isHistory) {
                // Also clear LS paid flags for that list's current tickets (if cached)
                const listId = delListBtn.getAttribute('data-delete-list');
                const group = lastGroups.get(listId) || [];
                clearPaidForIds(group.map(t => t.id));
                // ...existing delete flow...
            }

            // Delete history receipt
            const delBtn = e.target.closest('[data-delete-history]');
            if (delBtn) {
                // no LS needed for history
                // ...existing history delete flow...
            }
        });

        loadTickets();
    });
})();

// ---- Review dialog logic ----
async function openReviewDialog(listId){
    const sb = window.sb;
    const dlg = document.getElementById('review-dialog');
    const content = document.getElementById('review-content');
    const title = document.getElementById('review-title');
    if (!sb || !dlg || !content) return;

    content.innerHTML = '<div class="muted">Loading…</div>';

    // Fetch list name
    let listName = `List ${listId}`;
    try {
        const { data: listRows, error: listErr } = await sb
            .from('shopping_lists')
            .select('list_name')
            .eq('id', listId)
            .limit(1);
        if (!listErr && Array.isArray(listRows) && listRows[0]?.list_name) {
            listName = listRows[0].list_name;
        }
    } catch {}
    if (title) title.textContent = `Order Review — ${listName}`;

    // Try to load from history receipt_jsonb first if listId looks like a UUID present in history
    let items = [];
    try {
        const { data: hist } = await sb.from('ticket_history').select('receipt_jsonb').eq('id', listId).limit(1);
        const rec = Array.isArray(hist) && hist[0]?.receipt_jsonb;
        if (rec && Array.isArray(rec.items)) {
            items = rec.items;
        }
    } catch {}

    if (!items.length) {
        // Active list: join shopping_list_items with item_glossary when available
        const { data, error } = await sb
            .from('shopping_list_items')
            .select('id, name, price, quantity, category, item_glossary ( name, price, category, store )')
            .eq('list_id', listId)
            .order('sort_order', { ascending: true });

        if (error) {
            content.innerHTML = `<div class="muted">Failed to load items: ${escapeHtml(error.message)}</div>`;
            showDialog(dlg);
            return;
        }

        items = (data || []).map(r => {
            const g = r.item_glossary?.[0] || r.item_glossary; // handle nested object/array
            return {
                name: r.name || g?.name || 'Item',
                price: Number((r.price ?? g?.price) || 0),
                quantity: Number(r.quantity || 1),
                category: r.category || g?.category || null,
                store: g?.store || null
            };
        });
    }

    // Compute totals
    let subtotal = 0;
    items.forEach(it => { subtotal += Number(it.price || 0) * Number(it.quantity || 1); });

    const rows = items.map((it, i) => `
        <tr>
            <td>${i+1}</td>
            <td>${escapeHtml(it.name || '')}</td>
            <td class="muted">${escapeHtml(it.category || '')}</td>
            <td style="text-align:right;">${Number(it.quantity||1)}</td>
            <td style="text-align:right;">$${Number(it.price||0).toFixed(2)}</td>
            <td style="text-align:right;">$${(Number(it.price||0)*Number(it.quantity||1)).toFixed(2)}</td>
        </tr>`).join('');

    const html = `
        <div class="muted" style="margin-bottom:8px;">Review the items for this order.</div>
        <div style="overflow:auto; max-height:60vh;">
            <table class="loot-table" style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr>
                        <th>#</th><th>Item</th><th>Category</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="6" class="muted">No items</td></tr>'}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="5" style="text-align:right; font-weight:600;">Total</td>
                        <td style="text-align:right; font-weight:600;">$${subtotal.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

    content.innerHTML = html;
    showDialog(dlg);
}

function showDialog(dlg){
    try {
        if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.open = true;
    } catch { dlg.open = true; }
}

    // Global HTML escaper for safe rendering
    function escapeHtml(s){
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&':'&amp;',
            '<':'&lt;',
            '>':'&gt;',
            '"':'&quot;',
            "'":'&#39;'
        })[c] || c);
    }
