// js/receipt.js
(function(){
	document.addEventListener('DOMContentLoaded', () => {
		const sb = window.sb;
		if (!sb) return;

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
						status: r.status,
						created_at: r.created_at,
						list_name: r.shopping_lists?.list_name || ''
					}));
				} else {
					// basic fetch without join
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
					rows = bare || [];
				}
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

				const allPaid = items.every(t => t.status === 'paid' || t.status === 'resolved');

				const rowsHtml = items.map(t => {
					let actionHtml = '';
					if (!isHistory) {
						const isPaid = (t.status === 'paid');
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

				const actionBtn = (isHistory)
					? `<div class="resolve-wrap"><button class="ghost" data-delete-history="${listId}">Delete</button></div>`
					: `<div class="resolve-wrap" style="display:flex; gap:8px;">
						<button class="danger" data-delete-list="${listId}">Delete</button>
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

				// Update cache and resolve button state
				try {
					const listId = card?.dataset?.list;
					if (listId && lastGroups.has(listId)) {
						const group = lastGroups.get(listId);
						const tIdx = group.findIndex(t => String(t.id) === String(id));
						if (tIdx !== -1) {
							group[tIdx].status = nextStatus;
							const allPaidNow = group.every(t => t.status === 'paid' || t.status === 'resolved');
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

				// Persist change
				const { error } = await sb.from('ticket').update({ status: nextStatus }).eq('id', id);
				if (error) {
					// Revert UI
					const revert = document.createElement('span');
					revert.innerHTML = original;
					newBtn.replaceWith(revert.firstElementChild);
					alert('Error updating status: ' + (error.message || 'Unknown'));
					return;
				}
				return;
			}

			const resolveBtn = e.target.closest('[data-resolve]');
			if (resolveBtn) {
				e.preventDefault();
				e.stopPropagation();
				const listId = resolveBtn.getAttribute('data-resolve');
				const group = lastGroups.get(listId) || [];
				const allPaid = group.length > 0 && group.every(t => t.status === 'paid' || t.status === 'resolved');
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

					// Delete the shopping list to fully remove the receipt entity
					try {
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
				e.preventDefault();
				e.stopPropagation();
				const listId = delListBtn.getAttribute('data-delete-list');
				if (!confirm('Delete this ticket list? This will remove all its tickets and the list.')) return;
				// Optimistic removal
				let card = delListBtn.closest('.ticket-card');
				if (card && card.parentNode) card.parentNode.removeChild(card);
				try { lastGroups.delete(listId); } catch(_) {}
				if (listEl && listEl.querySelectorAll('.ticket-card').length === 0 && empty) {
					empty.textContent = 'No tickets yet.';
				}
				try {
					// Delete all tickets under list
					await sb.from('ticket').delete().eq('list_id', listId);
					// Delete the list itself
					await sb.from('shopping_lists').delete().eq('id', listId);
					await loadTickets();
				} catch (err) {
					console.error('Delete list failed:', err);
					alert('Failed to delete list: ' + (err?.message || 'Unknown error'));
					await loadTickets();
				}
				return;
			}

			// Delete history receipt
			const delBtn = e.target.closest('[data-delete-history]');
			if (delBtn) {
				e.preventDefault();
				e.stopPropagation();
				const histKey = delBtn.getAttribute('data-delete-history');
				if (!confirm('Delete this receipt from history?')) return;
				// Remove optimistically
				let card = delBtn.closest('.ticket-card');
				if (card && card.parentNode) card.parentNode.removeChild(card);
				try { lastGroups.delete(histKey); } catch(_) {}
				if (listEl && listEl.querySelectorAll('.ticket-card').length === 0 && empty) {
					empty.textContent = 'No history yet.';
				}

				try {
					// In history mode, listId is actually the ticket_history id key we set
					const { error: dErr } = await sb
						.from('ticket_history')
						.delete()
						.eq('id', histKey);
					if (dErr) throw dErr;
					await loadTickets();
				} catch (err) {
					console.error('Delete history failed:', err);
					alert('Failed to delete history item: ' + (err?.message || 'Unknown error'));
					await loadTickets();
				}
			}
		});

		loadTickets();
	});
})();
