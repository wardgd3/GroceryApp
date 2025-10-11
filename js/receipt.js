// js/receipt.js
(function(){
    document.addEventListener('DOMContentLoaded', () => {
        const sb = window.sb;
        if (!sb) return;
        try { console.info('receipt.js v2025-10-09a loaded'); } catch {}

        // Mark Paid persistence now relies solely on the DB column `ticket.resolved`.

        // Edge Function config for ready-to-resolve email
        const EDGE_FUNCTION_URL = 'https://ktwvxfamdcwkguerkjal.functions.supabase.co/hello-email';
        // If your function enforces JWT verification, include anon key
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0d3Z4ZmFtZGN3a2d1ZXJramFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwOTUxNDUsImV4cCI6MjA3NDY3MTE0NX0.rU3I2WA0CksR601Pj4PoOwzrHbaReg-7aUfLLk1tNhw';
        // Avoid duplicate notifications per page session
        const readyNotified = (window.__readyNotified ||= new Set());

        async function sendReadyEmail(listId){
            try {
                if (!listId) return;
                const key = String(listId);
                if (readyNotified.has(key)) return; // already sent this session
                const group = lastGroups.get(listId) || [];
                if (!group.length) return;
                // Build list name and total from cached rows
                const listName = group[0]?.name || group[0]?.list_name || `List ${listId}`;
                const total = group.reduce((s, t) => s + Number(t.amount_due || 0), 0);
                const body = {
                    to: 'wardgd3@gmail.com',
                    list_id: listId,
                    list_name: listName,
                    total
                };
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                };
                fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                }).then(async (res) => {
                    if (!res.ok) {
                        const txt = await res.text().catch(()=> '');
                        console.warn('ready-email failed:', res.status, txt);
                        return;
                    }
                    readyNotified.add(key);
                    console.info('Ready email sent for list', listId);
                }).catch(err => console.warn('ready-email error:', err));
            } catch (e) {
                console.warn('sendReadyEmail error:', e);
            }
        }

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
                    .select('id, list_id, name, person, amount_due, status, resolved, created_at, shopping_lists!inner (list_name)')
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
                        resolved: !!r.resolved,
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
                        .select('id, list_id, name, person, amount_due, status, resolved, created_at')
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
                        resolved: !!r.resolved,
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

                const allPaid = items.every(t => t.resolved === true);

                const rowsHtml = items.map(t => {
                    let actionHtml = '';
                                        if (!isHistory) {
                                            const isResolved = (t.resolved === true);
                                            actionHtml = isResolved
                                              // Paid state is clickable to allow toggling back to open
                                              ? `<button class="btn-paid" data-toggle-pay="${t.id}" type="button"><span class="checkmark"></span> Paid</button>`
                                              : `<button class="ghost" data-toggle-pay="${t.id}" type="button">Mark paid</button>`;
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

        // Realtime: reflect resolved updates from other devices instantly
        let realtimeSetup = false;
        function setupRealtime() {
            if (realtimeSetup || !sb?.channel) return;
            try {
                sb.channel('ticket-resolved-sync')
                  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ticket' }, (payload) => {
                      const row = payload?.new;
                      if (!row) return;
                      // Ignore if ticket was moved to history (status resolved), it will disappear on next refresh
                      if (String(row.status || '').toLowerCase() === 'resolved') return;
                      const listId = row.list_id;
                      const id = row.id;
                      const resolved = !!row.resolved;

                      // Update cache
                      const key = String(listId);
                      if (lastGroups.has(key)) {
                          const group = lastGroups.get(key);
                          const idx = group.findIndex(t => String(t.id) === String(id));
                          if (idx !== -1) {
                              group[idx].resolved = resolved;
                          }
                      }

                      // Update DOM button and Resolve state if the card is visible
                      const card = listEl?.querySelector(`.ticket-card[data-list="${listId}"]`);
                      if (card) {
                          const btn = card.querySelector(`[data-toggle-pay="${id}"]`);
                          if (btn) {
                              if (resolved) {
                                  btn.className = 'btn-paid';
                                  btn.innerHTML = '<span class="checkmark"></span> Paid';
                              } else {
                                  btn.className = 'ghost';
                                  btn.textContent = 'Mark paid';
                              }
                          }
                          const group = lastGroups.get(key) || [];
                          const allPaidNow = group.length > 0 && group.every(t => t.resolved === true);
                          const foot = card.querySelector('.ticket-foot');
                          if (foot) {
                              const resolveEl = foot.querySelector('[data-resolve]');
                              if (resolveEl) {
                                  if (allPaidNow) resolveEl.removeAttribute('disabled');
                                  else resolveEl.setAttribute('disabled', '');
                              }
                          }
                          // If now ready, trigger email once
                          if (allPaidNow) {
                              sendReadyEmail(listId);
                          }
                      }
                  })
                  .subscribe();
                realtimeSetup = true;
            } catch (_) { /* no-op */ }
        }

        // Delegated action: mark a single ticket row as paid by setting resolved=true
        if (listEl) listEl.addEventListener('click', async (e)=>{
            const toggleBtn = e.target.closest('[data-toggle-pay]');
            if (toggleBtn) {
                const id = toggleBtn.getAttribute('data-toggle-pay');
                const row = toggleBtn.closest('.ticket-row');
                const card = toggleBtn.closest('.ticket-card');

                // Determine current state from cache if available, otherwise infer from class
                const listId = card?.dataset?.list;
                let group = listId && lastGroups.has(listId) ? lastGroups.get(listId) : [];
                const tIdx = group.findIndex(t => String(t.id) === String(id));
                const currentlyResolved = tIdx !== -1 ? group[tIdx].resolved : toggleBtn.classList.contains('btn-paid');

                // Optimistic UI swap based on the target state
                const original = toggleBtn.outerHTML;
                let newBtn = document.createElement('button');
                newBtn.type = 'button';
                if (!currentlyResolved) {
                    newBtn.className = 'btn-paid';
                    newBtn.setAttribute('data-toggle-pay', id);
                    newBtn.innerHTML = '<span class="checkmark"></span> Paid';
                } else {
                    newBtn.className = 'ghost';
                    newBtn.setAttribute('data-toggle-pay', id);
                    newBtn.textContent = 'Mark paid';
                }
                toggleBtn.replaceWith(newBtn);

                // Persist to DB below; UI will reflect DB on next load

                // Update cache and resolve button state
                try {
                    if (tIdx !== -1) {
                        group[tIdx].resolved = !currentlyResolved;
                        const allPaidNow = group.every(t => t.resolved === true);
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
                        // If now ready, trigger email once
                        if (allPaidNow) {
                            sendReadyEmail(listId);
                        }
                    }
                } catch(_) {}

                // Optional: still try to persist to DB; if it fails, revert local state and UI
                let affected = 0; let upErr = null;
                try {
                    const { data: updRows, error: e1 } = await sb
                        .from('ticket')
                        .update({ resolved: !currentlyResolved })
                        .eq('id', String(id))
                        .select('id');
                    if (e1) {
                        upErr = e1;
                    } else {
                        affected = Array.isArray(updRows) ? updRows.length : 0;
                    }
                } catch (ex1) { upErr = ex1; }

                if (affected === 0) {
                    // Revert UI on failure and notify
                    const revert = document.createElement('span');
                    revert.innerHTML = original;
                    newBtn.replaceWith(revert.firstElementChild);
                    const msg = upErr ? (upErr.message || 'Unknown') : 'No rows updated (RLS/permission?)';
                    // Revert cached state to avoid enabling Resolve incorrectly
                    try {
                        if (tIdx !== -1) {
                            group[tIdx].resolved = currentlyResolved;
                                const foot = card.querySelector('.ticket-foot');
                                if (foot) {
                                    const resolveEl = foot.querySelector('[data-resolve]');
                                    if (resolveEl) resolveEl.setAttribute('disabled', '');
                                }
                        }
                    } catch(_) {}
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
                // Gate on DB-backed resolved flag only so state is consistent across devices
                const allPaid = group.length > 0 && group.every(t => t.resolved === true);
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
                    const totalFromGroup = group.reduce((s, t) => s + Number(t.amount_due || 0), 0);
                    const tickets = group.map(t => ({
                        ticket_id: t.id,
                        person: t.person,
                        amount_due: Number(t.amount_due || 0),
                        status: t.status,
                        created_at: t.created_at
                    }));
                    // Load purchased items from the list before deletion
                    let items = [];
                    try {
                        const { data: itemsData } = await sb
                            .from('shopping_list_items')
                            .select('id, name, price, quantity, category, item_glossary ( name, price, category, store )')
                            .eq('list_id', listId)
                            .order('sort_order', { ascending: true });
                        items = (itemsData || []).map(r => {
                            const g = r.item_glossary?.[0] || r.item_glossary;
                            return {
                                name: r.name || g?.name || 'Item',
                                price: Number((r.price ?? g?.price) || 0),
                                quantity: Number(r.quantity || 1),
                                category: r.category || g?.category || null,
                                store: g?.store || null
                            };
                        });
                    } catch (_) { /* ignore, items remain empty */ }

                    // Prefer item-derived total if items present; else fall back to tickets sum
                    let total = totalFromGroup;
                    if (items.length) {
                        total = items.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 1), 0);
                    }

                    const receipt = {
                        list_id: listId,
                        name: listName,
                        created_at: createdAt,
                        total,
                        tickets,
                        items
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

                    // Local flags not used for render anymore; no cleanup required

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
                // ...existing delete flow...
            }

            // Delete history receipt
            const delBtn = e.target.closest('[data-delete-history]');
            if (delBtn) {
                e.preventDefault();
                const listId = delBtn.getAttribute('data-delete-history');
                if (!listId) return;
                if (!confirm('Delete this receipt from history? This cannot be undone.')) return;
                try {
                    const { error: delErr } = await sb.from('ticket_history').delete().eq('id', listId);
                    if (delErr) throw delErr;
                    // Remove card from DOM
                    const card = listEl?.querySelector(`.ticket-card[data-list="${listId}"]`);
                    if (card && card.parentNode) card.parentNode.removeChild(card);
                    if (listEl && listEl.querySelectorAll('.ticket-card').length === 0 && empty) {
                        empty.textContent = 'No history yet.';
                    }
                } catch (err) {
                    alert('Failed to delete history item: ' + (err?.message || 'Unknown error'));
                }
                return;
            }
        });

        setupRealtime();
        loadTickets();
    });
})();

// ---- Review dialog logic ----
async function openReviewDialog(listId){
    const sb = window.sb;
    if (!sb) return;

    // Ensure dialog exists on both pages
    let dlg = document.getElementById('review-dialog');
    let content = document.getElementById('review-content');
    let title = document.getElementById('review-title');
    if (!dlg || !content || !title) {
        dlg = document.createElement('dialog');
        dlg.id = 'review-dialog';
        dlg.setAttribute('aria-labelledby', 'review-title');
        dlg.innerHTML = `
            <form method="dialog" style="margin:0;">
                <header style="display:flex; align-items:center; gap:8px;">
                    <h3 id="review-title" style="margin:0;">Order Review</h3>
                    <button type="submit" class="ghost" style="margin-left:auto;">Close</button>
                </header>
                <div id="review-content" style="margin-top:10px;"></div>
            </form>`;
        document.body.appendChild(dlg);
        content = dlg.querySelector('#review-content');
        title = dlg.querySelector('#review-title');
    }

    content.innerHTML = '<div class="muted">Loading…</div>';

    // Try history first: if listId is a history id, get name and receipt_jsonb
    let listName = `List ${listId}`;
    let historyReceipt = null;
    try {
        const { data: hist } = await sb
            .from('ticket_history')
            .select('id, name, receipt_jsonb')
            .eq('id', listId)
            .limit(1);
        if (Array.isArray(hist) && hist[0]) {
            listName = hist[0].name || listName;
            historyReceipt = hist[0].receipt_jsonb || null;
        }
    } catch {}

    // If not found in history, fall back to active list name
    if (!historyReceipt) {
        try {
            const { data: listRows } = await sb
                .from('shopping_lists')
                .select('list_name')
                .eq('id', listId)
                .limit(1);
            if (Array.isArray(listRows) && listRows[0]?.list_name) {
                listName = listRows[0].list_name;
            }
        } catch {}
    }
    if (title) title.textContent = `Order Review — ${listName}`;

    // Build items either from history receipt_jsonb or active list
    let items = [];
    if (historyReceipt) {
        if (Array.isArray(historyReceipt.items)) {
            items = historyReceipt.items;
        } else if (Array.isArray(historyReceipt.tickets)) {
            // Map ticket summary into an item-like structure
            items = historyReceipt.tickets.map(t => ({
                name: t.person ? `Paid by ${t.person}` : 'Paid',
                price: Number(t.amount_due || 0),
                quantity: 1,
                category: 'Share',
                store: null
            }));
        }
    }

    if (!items.length) {
        // Active list: join shopping_list_items with item_glossary when available
        try {
            const { data, error } = await sb
                .from('shopping_list_items')
                .select('id, name, price, quantity, category, item_glossary ( name, price, category, store )')
                .eq('list_id', listId)
                .order('sort_order', { ascending: true });
            if (error) throw error;
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
        } catch (error) {
            content.innerHTML = `<div class="muted">Failed to load items: ${escapeHtml(error.message)}</div>`;
            showDialog(dlg);
            return;
        }
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
