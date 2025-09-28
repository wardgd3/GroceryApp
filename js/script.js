// --- Simple test section to display grocery_list rows ---
async function loadGroceryList() {
	const { data, error } = await sb.from('grocery_list').select('name, price, category, consumer');
	const tableEl = document.getElementById('grocery-table');
	if (error) {
		if (tableEl) tableEl.outerHTML = `<div style="color:red;">Error: ${error.message}</div>`;
		else document.body.insertAdjacentHTML('beforeend', `<div style="color:red;">Error: ${error.message}</div>`);
		return;
	}
	if (tableEl) tableEl.outerHTML = renderGroceryTable(data);
	else document.body.insertAdjacentHTML('beforeend', renderGroceryTable(data));
}

function renderGroceryTable(data) {
	let html = `<table border="1" cellpadding="6" style="margin:1em 0;" id="grocery-table"><tr><th>Name</th><th>Price</th><th>Category</th><th>Consumer</th></tr>`;
	for (const row of data) {
		html += `<tr><td>${row.name || ''}</td><td>${row.price ?? ''}</td><td>${row.category || ''}</td><td>${row.consumer || ''}</td></tr>`;
	}
	html += '</table>';
	return html;
}

if (window.__grocery_app_initialized__) {
    // Prevent double init if the script is accidentally loaded twice
    console.warn('Grocery app already initialized.');
} else {
    window.__grocery_app_initialized__ = true;
    window.addEventListener('DOMContentLoaded', () => {
	// Only render table once in a dedicated container
	let tableContainer = document.getElementById('grocery-table-container');
	if (!tableContainer) {
		tableContainer = document.createElement('div');
		tableContainer.id = 'grocery-table-container';
		document.body.insertBefore(tableContainer, document.body.firstChild);
	}

	let currentQuery = '';
	async function renderAndReplaceTable() {
		let query = sb.from('grocery_list').select('name, price, category, consumer');
		if (currentQuery) {
			// ILIKE search across name, category, consumer
			const q = `%${currentQuery}%`;
			query = query.or(`name.ilike.${q},category.ilike.${q},consumer.ilike.${q}`);
		}
		const { data, error } = await query;
		if (error) {
			tableContainer.innerHTML = `<div style="color:red;">Error: ${error.message}</div>`;
			return;
		}
		tableContainer.innerHTML = renderGroceryTable(data);
	}

	renderAndReplaceTable();

	// Modal logic
	const addBtn = document.getElementById('add-item-btn');
	const modal = document.getElementById('add-item-modal');
	const form = document.getElementById('add-item-form');
	const cancelBtn = document.getElementById('cancel-add-item');
	const errorDiv = document.getElementById('add-item-error');

	addBtn.addEventListener('click', () => {
		modal.style.display = 'flex';
		form.reset();
		errorDiv.textContent = '';
	});
	cancelBtn.addEventListener('click', () => {
		modal.style.display = 'none';
	});
	modal.addEventListener('click', (e) => {
		if (e.target === modal) modal.style.display = 'none';
	});

	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		errorDiv.textContent = '';
		const formData = new FormData(form);
		const name = formData.get('name').trim();
		const price = parseFloat(formData.get('price'));
		const category = formData.get('category').trim();
		const consumer = formData.get('consumer').trim();
		if (!name || isNaN(price) || !category || !consumer) {
			errorDiv.textContent = 'Please fill out all fields.';
			return;
		}
		const { error } = await sb.from('grocery_list').insert([{ name, price, category, consumer }]);
		if (error) {
			errorDiv.textContent = error.message;
			return;
		}
		modal.style.display = 'none';
		await renderAndReplaceTable();
	});

	// Search logic
	const searchInput = document.getElementById('grocery-search');
	const suggestions = document.getElementById('search-suggestions');
	let debounceTimer;

	function hideSuggestions() {
		suggestions.style.display = 'none';
		suggestions.innerHTML = '';
	}

	function showSuggestions(items) {
		if (!items.length) { hideSuggestions(); return; }
		suggestions.innerHTML = items.map(it => `<div class="suggestion-item" data-name="${it.name || ''}" data-category="${it.category || ''}" data-consumer="${it.consumer || ''}" style="padding:8px 12px;cursor:pointer;">${
			[it.name, it.category, it.consumer].filter(Boolean).join(' • ')
		}</div>`).join('');
		suggestions.style.display = 'block';
		Array.from(suggestions.children).forEach(child => {
			child.addEventListener('click', () => {
				const text = child.getAttribute('data-name');
				searchInput.value = text || '';
				currentQuery = (text || '').trim();
				hideSuggestions();
				renderAndReplaceTable();
			});
		});
	}

	async function runSuggestionQuery(term) {
		const like = `%${term}%`;
		const { data, error } = await sb
			.from('grocery_list')
			.select('name, category, consumer')
			.or(`name.ilike.${like},category.ilike.${like},consumer.ilike.${like}`)
			.limit(8);
		if (error) { hideSuggestions(); return; }
		showSuggestions(data || []);
	}

	searchInput?.addEventListener('input', (e) => {
		const term = e.target.value.trim();
		currentQuery = term;
		clearTimeout(debounceTimer);
		if (!term) { hideSuggestions(); renderAndReplaceTable(); return; }
		debounceTimer = setTimeout(() => runSuggestionQuery(term), 220);
	});

	searchInput?.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			hideSuggestions();
			currentQuery = searchInput.value.trim();
			renderAndReplaceTable();
		}
	});

	document.addEventListener('click', (e) => {
		if (!suggestions.contains(e.target) && e.target !== searchInput) {
			hideSuggestions();
		}
	});
    });
}
