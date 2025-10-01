// js/receipt.js
(function(){
	document.addEventListener('DOMContentLoaded', () => {
		const sb = window.sb;
		if (!sb) return;

			const listEl = document.getElementById('tickets-list');
		const empty = document.getElementById('tickets-empty');
		const refreshBtn = document.getElementById('refresh-tickets-btn');

		async function loadTickets(){
				if (!listEl) return;
				listEl.innerHTML = '';
			if (empty) empty.textContent = 'Loading…';
			// join to show list name if available
			// If you have a foreign key, you can select via RPC; else fetch names separately
					const { data, error } = await sb
						.from('ticket')
						.select('id, list_id, name, person, amount_due, status, created_at, shopping_lists!inner (list_name)')
				.order('created_at', { ascending: false });

			// Fallback if join alias not available
			let rows = [];
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
					.order('created_at', { ascending: false });
				if (e2) {
					if (empty) empty.textContent = 'Error loading tickets';
					return;
				}
				rows = bare || [];
			}

					if (!rows.length){
				if (empty) empty.textContent = 'No tickets yet.';
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

					// Render a card per list
					const cardsHtml = Object.keys(groups).map(listId => {
						const items = groups[listId];
						// sort items newest first within group
						items.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
						const headerCreated = items[0]?.created_at ? new Date(items[0].created_at).toLocaleString() : '';
						const listName = items[0]?.name || items[0]?.list_name || listId;
						const rowsHtml = items.map(t => {
							const statusBadge = t.status === 'paid' ? '<span class="badge success">paid</span>' : '<span class="badge">open</span>';
							const payBtn = t.status === 'open' ? `<button class="ghost" data-pay="${t.id}">Mark paid</button>` : '';
							return `
								<div class="ticket-row" style="display:flex; align-items:center; gap:8px; padding:6px 0; border-top:1px solid #f2f2f2;">
									<div style="min-width:90px; text-transform:capitalize;">${escapeHtml(t.person)}</div>
									<div style="margin-left:auto; text-align:right; font-variant-numeric: tabular-nums;">${fmt(t.amount_due)}</div>
									<div>${statusBadge}</div>
									<div>${payBtn}</div>
								</div>`;
						}).join('');
						const total = items.reduce((s, t)=> s + Number(t.amount_due||0), 0);
						return `
							<div class="ticket-card" style="border:1px solid #e5e7eb; border-radius:10px; padding:12px;">
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
								</div>
							</div>`;
					}).join('');

					listEl.innerHTML = cardsHtml;
		}

		function escapeHtml(s){
			return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
		}

		if (refreshBtn) refreshBtn.addEventListener('click', loadTickets);

		// Delegated action: mark paid
			if (listEl) listEl.addEventListener('click', async (e)=>{
			const btn = e.target.closest('[data-pay]');
			if (!btn) return;
			const id = btn.getAttribute('data-pay');
			const { error } = await sb.from('ticket').update({ status: 'paid' }).eq('id', id);
			if (error) {
				alert('Error marking paid: ' + (error.message || 'Unknown'));
				return;
			}
			loadTickets();
		});

		loadTickets();
	});
})();
