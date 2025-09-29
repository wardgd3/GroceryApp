// glossary.js - lists all items grouped A-Z with search and category filter
(function(){
  if (window.__glossary_initialized__) return;
  window.__glossary_initialized__ = true;

  const sb = window.sb; // from sb-client.js
  const resultsEl = document.getElementById('glossary-results');
  const searchInput = document.getElementById('glossary-search');
  const filterPanel = document.getElementById('filter-panel');
  const toggleFilterBtn = document.getElementById('toggle-filter');
  const clearFilterBtn = document.getElementById('clear-filter');

  const CATEGORIES = ['meat','dairy','vegetables','fruit','utility','other'];
  let activeCategories = new Set();
  let currentTerm = '';

  function byLetter(items){
    const groups = new Map();
    for(const it of items){
      const n = (it.name || '').trim();
      const key = /^[A-Za-z]/.test(n) ? n[0].toUpperCase() : '#';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    // sort keys A-Z with # at end
    const keys = Array.from(groups.keys()).sort((a,b)=>{
      if (a === '#') return 1; if (b === '#') return -1; return a.localeCompare(b);
    });
    // sort items in each group by name
    for (const k of keys){
      groups.get(k).sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    }
    return { groups, keys };
  }

  function render(items){
    if (!items.length){
      resultsEl.innerHTML = '<div class="muted">No items found.</div>';
      return;
    }
    const { groups, keys } = byLetter(items);
    let html = '';
    for (const k of keys){
      html += `<section class="g-section"><h2>${k}</h2>`;
      for (const it of groups.get(k)){
        const parts = [];
        if (it.category) parts.push(`<span class="g-tag">${escapeHtml(it.category)}</span>`);
        if (typeof it.price === 'number') parts.push(`<span class="g-tag">$${Number(it.price).toFixed(2)}</span>`);
        if (it.consumer) parts.push(`<span class="g-tag">${escapeHtml(it.consumer)}</span>`);
        const meta = parts.join('<span class="g-sep">•</span>');
        html += `
          <div class="g-item">
            <div class="g-name">${escapeHtml(it.name || '')}</div>
            <div class="g-meta">${meta}</div>
          </div>
        `;
      }
      html += `</section>`;
    }
    resultsEl.innerHTML = html;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  async function fetchItems(){
    let query = sb.from('item_glossary').select('name, price, category, consumer');
    if (currentTerm){
      const like = `%${currentTerm}%`;
      query = query.or(`name.ilike.${like},category.ilike.${like},consumer.ilike.${like}`);
    }
    if (activeCategories.size){
      const cats = Array.from(activeCategories).map(c=>`"${c}"`).join(',');
      query = query.in('category', Array.from(activeCategories));
    }
    const { data, error } = await query.order('name', { ascending: true });
    if (error){
      resultsEl.innerHTML = `<div style="color:red;">${escapeHtml(error.message)}</div>`;
      return [];
    }
    return data || [];
  }

  async function refresh(){
    const items = await fetchItems();
    render(items);
  }

  function buildFilterPanel(){
    filterPanel.innerHTML = CATEGORIES.map(cat=>{
      const id = `cat-${cat}`;
      return `<label class="filter-chip"><input type="checkbox" id="${id}" data-cat="${cat}" style="margin-right:6px;">${cat}</label>`;
    }).join('');
    // mark active
    CATEGORIES.forEach(cat=>{
      // nothing to preload
    });

    filterPanel.addEventListener('change', (e)=>{
      const input = e.target.closest('input[type="checkbox"][data-cat]');
      if (!input) return;
      const cat = input.getAttribute('data-cat');
      if (input.checked) activeCategories.add(cat); else activeCategories.delete(cat);
      refresh();
    });
  }

  toggleFilterBtn.addEventListener('click', ()=>{
    filterPanel.style.display = (filterPanel.style.display === 'none' || !filterPanel.style.display) ? 'block' : 'none';
  });
  clearFilterBtn.addEventListener('click', ()=>{
    activeCategories.clear();
    Array.from(filterPanel.querySelectorAll('input[type="checkbox"]')).forEach(cb=> cb.checked = false);
    refresh();
  });

  let debounce;
  searchInput.addEventListener('input', (e)=>{
    const term = e.target.value.trim();
    clearTimeout(debounce);
    debounce = setTimeout(()=>{
      currentTerm = term;
      refresh();
    }, 220);
  });

  document.addEventListener('DOMContentLoaded', async ()=>{
    buildFilterPanel();
    await refresh();
  });

  // Refresh if a new glossary item is added via the shared modal
  document.addEventListener('glossary-item-added', () => {
    refresh();
  });
})();
