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
  // Dynamic category support
  const LS_KEY = 'customCategories';
  function normalizeCategory(v){
    let s = String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (s === 'vegetable') s = 'vegetables';
    return s || 'other';
  }
  function loadCustomCategories(){
    try { return Array.from(new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'))); }
    catch { return []; }
  }
  async function getAllCategories(){
    const set = new Set(CATEGORIES);
    for (const c of loadCustomCategories()) set.add(normalizeCategory(c));
    try {
      const { data, error } = await sb
        .from('item_glossary')
        .select('category')
        .order('category', { ascending: true });
      if (!error && Array.isArray(data)){
        data.forEach(row => {
          if (row && row.category != null) set.add(normalizeCategory(row.category));
        });
      }
    } catch(_){}
    return Array.from(set).sort((a,b)=> a.localeCompare(b));
  }
  // Shared category utilities (mirror add-glossary-item.js)
  function saveCustomCategory(cat){
    const v = normalizeCategory(cat);
    const arr = loadCustomCategories();
    if (!arr.includes(v)){
      arr.push(v);
      try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
    }
  }
  async function populateCategories(selectEl, selected){
    const set = new Set(CATEGORIES);
    for (const c of loadCustomCategories()) set.add(normalizeCategory(c));
    try {
      const { data, error } = await sb
        .from('item_glossary')
        .select('category')
        .order('category', { ascending: true });
      if (!error && Array.isArray(data)){
        data.forEach(row => {
          if (row && row.category != null) set.add(normalizeCategory(row.category));
        });
      }
    } catch(_) { /* ignore */ }
    const list = Array.from(set).sort((a,b)=> a.localeCompare(b));
    selectEl.innerHTML = list.map(v => `<option value="${v}">${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('');
    if (selected){
      const sv = normalizeCategory(selected);
      if (list.includes(sv)) selectEl.value = sv;
    }
  }
  let activeCategories = new Set();
  let currentTerm = '';
  let lastItems = [];

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
  if (it.store) parts.push(`<span class="g-tag">${escapeHtml(String(it.store))}</span>`);
  if (it.consumer) parts.push(`<span class="g-tag">${escapeHtml(it.consumer)}</span>`);
        const meta = parts.join('<span class="g-sep">•</span>');
        html += `
          <div class="g-item">
            <div class="g-name">${escapeHtml(it.name || '')}</div>
            <div class="g-meta" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
              ${meta}
              <div style="display:flex; gap:6px; margin-left:auto; position:relative;">
                <button class="ghost g-menu-btn" aria-haspopup="menu" aria-expanded="false" data-id="${it.id}" title="More" style="padding:4px 8px; line-height:1; font-size:18px;">⋮</button>
                <div class="g-menu" role="menu" data-menu-for="${it.id}" style="display:none; position:absolute; right:0; top:100%; background:#fff; border:1px solid #ddd; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.12); min-width:140px; z-index:20; overflow:hidden;">
                  <button class="g-menu-item" role="menuitem" data-action="edit" data-id="${it.id}" style="display:block; width:100%; text-align:left; padding:8px 12px; background:#fff; border:0; cursor:pointer;color:black;">Edit</button>
                  <button class="g-menu-item" role="menuitem" data-action="delete" data-id="${it.id}" style="display:block; width:100%; text-align:left; padding:8px 12px; background:#fff; border:0; cursor:pointer; color:#b91c1c;">Delete</button>
                </div>
                <button class="ghost" data-add-id="${it.id}" style="padding:4px 8px;">+</button>
              </div>
            </div>
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
    let query = sb.from('item_glossary').select('id, name, price, category, consumer, store');
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
    lastItems = items;
    render(items);
  }

  // --- Add to List dialog
  function ensureAddToListDialog(){
    let dlg = document.getElementById('add-to-list-dialog');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'add-to-list-dialog';
    dlg.innerHTML = `
      <form id="atl-form" method="dialog" style="min-width:320px; max-width:520px;">
        <h3 style="margin:0 0 8px 0;">Add to Shopping List</h3>
        <div class="muted" id="atl-msg" style="margin-bottom:8px;"></div>
        <label style="display:block; margin-bottom:8px;">
          <div class="muted">Select list</div>
          <select id="atl-list" required style="width:100%"></select>
        </label>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
          <button type="button" id="atl-cancel" class="ghost">Cancel</button>
          <button type="submit" id="atl-add">Add</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    return dlg;
  }

  async function fetchLists(){
    const { data, error } = await sb
      .from('shopping_lists')
      .select('id, list_name, list_date')
      .order('list_date', { ascending: false });
    if (error) return [];
    return data || [];
  }

  async function openAddToListDialog(glossaryItem){
    const dlg = ensureAddToListDialog();
    const form = dlg.querySelector('#atl-form');
    const msgEl = dlg.querySelector('#atl-msg');
    const selectEl = dlg.querySelector('#atl-list');
    const cancelBtn = dlg.querySelector('#atl-cancel');

    msgEl.textContent = '';
    selectEl.innerHTML = '<option disabled selected>Loading…</option>';
    const lists = await fetchLists();
    if (!lists.length){
      selectEl.innerHTML = '';
      msgEl.textContent = 'No shopping lists found. Create a list first.';
    } else {
      selectEl.innerHTML = lists.map(l => {
        const dateStr = l.list_date ? new Date(l.list_date).toLocaleDateString() : '';
        const label = dateStr ? `${l.list_name} — ${dateStr}` : l.list_name;
        return `<option value="${l.id}">${escapeHtml(label)}</option>`;
      }).join('');
    }

    function close(){ if (typeof dlg.close === 'function') dlg.close(); else dlg.open = false; }
    cancelBtn.onclick = (e)=>{ e.preventDefault(); close(); };

    form.onsubmit = async (e)=>{
      e.preventDefault();
      const listId = selectEl.value;
      if (!listId){ msgEl.textContent = 'Please choose a list'; return; }
      msgEl.textContent = 'Adding…';
      const payload = {
        list_id: listId,
        item_id: glossaryItem.id,
        name: glossaryItem.name,
        price: glossaryItem.price ?? null,
        quantity: 1,
        category: glossaryItem.category ?? null,
        consumer: (glossaryItem.consumer || 'both').toLowerCase(),
        is_checked: false
      };
      const { error } = await sb.from('shopping_list_items').insert(payload);
      if (error){ msgEl.textContent = 'Error: ' + (error.message || 'Failed to add'); return; }
      msgEl.textContent = 'Added ✓';
      setTimeout(()=> close(), 180);
    };

    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.open = true;
  }

  // --- Edit dialog for glossary items
  function ensureGlossaryEditDialog(){
    let dlg = document.getElementById('edit-glossary-dialog');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'edit-glossary-dialog';
    dlg.innerHTML = `
      <form id="edit-glossary-form" method="dialog" style="min-width:320px; max-width:520px;">
        <h3 style="margin:0 0 8px 0;">Edit Glossary Item</h3>
        <div class="muted" id="eg-msg" style="margin-bottom:8px;"></div>
        <label style="display:block; margin-bottom:8px;">
          <div class="muted">Name</div>
          <input id="eg-name" type="text" required />
        </label>
        <div style="display:flex; gap:12px;">
          <label style="flex:1;">
            <div class="muted">Price</div>
            <input id="eg-price" type="number" step="0.01" />
          </label>
          <label style="flex:1;">
            <div class="muted">Category</div>
            <select id="eg-category"></select>
          </label>
        </div>
        <div style="display:flex; gap:12px; margin-top:8px;">
          <label style="flex:1;">
            <div class="muted">Consumer</div>
            <select id="eg-consumer">
              <option value="both">Both</option>
              <option value="grant">Grant</option>
              <option value="emily">Emily</option>
            </select>
          </label>
          <label style="flex:1;">
            <div class="muted">Store</div>
            <select id="eg-store">
              <option value="walmart">Walmart</option>
              <option value="sams">Sams</option>
            </select>
          </label>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
          <button type="button" id="eg-cancel" class="ghost">Cancel</button>
          <button type="submit" id="eg-save">Save</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    return dlg;
  }

  async function openGlossaryEditDialog(item){
    const dlg = ensureGlossaryEditDialog();
    const form = dlg.querySelector('#edit-glossary-form');
    const msgEl = dlg.querySelector('#eg-msg');
    const nameEl = dlg.querySelector('#eg-name');
    const priceEl = dlg.querySelector('#eg-price');
    const catEl = dlg.querySelector('#eg-category');
    const consEl = dlg.querySelector('#eg-consumer');
  const cancelBtn = dlg.querySelector('#eg-cancel');
  const storeEl = dlg.querySelector('#eg-store');

    // Ensure an Add button appears next to the category select
    let addCatBtn = dlg.querySelector('#eg-add-category-btn');
    if (!addCatBtn){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'eg-add-category-btn';
      btn.className = 'ghost';
      btn.title = 'Add category';
      btn.setAttribute('aria-label','Add category');
      btn.style = 'white-space:nowrap; padding:6px 10px; margin-left:8px;';
      btn.textContent = 'Add';
      // parent is <label>; make it a flex row
      const parent = catEl.parentNode;
      parent.style.display = 'flex';
      parent.style.gap = '8px';
      parent.appendChild(btn);
      addCatBtn = btn;
    }

    // Populate categories from base + localStorage + DB
    let currentCategory = normalizeCategory(item.category || 'other');
    await populateCategories(catEl, currentCategory);

    msgEl.textContent = '';
    nameEl.value = item.name || '';
    priceEl.value = (item.price != null && item.price !== '') ? Number(item.price) : '';
    catEl.value = currentCategory;
  consEl.value = String(item.consumer || 'both').toLowerCase();
  if (storeEl) storeEl.value = String(item.store || 'walmart').toLowerCase() === 'sams' ? 'sams' : 'walmart';

    function close(){ if (typeof dlg.close === 'function') dlg.close(); else dlg.open = false; }
    cancelBtn.onclick = (e)=>{ e.preventDefault(); close(); };

    // Add Category popup (re-use global dialog if present, else create)
    addCatBtn.onclick = (e) => {
      e.preventDefault();
      let cdlg = document.getElementById('add-category-dialog');
      if (!cdlg){
        cdlg = document.createElement('dialog');
        cdlg.id = 'add-category-dialog';
        cdlg.innerHTML = `
          <form id="add-category-form" method="dialog" style="min-width:280px; max-width:420px;">
            <h3 style=\"margin:0 0 8px 0;\">Add Category</h3>
            <div class=\"muted\" id=\"add-category-msg\" style=\"margin-bottom:8px;\"></div>
            <label style=\"display:block;\">
              <div class=\"muted\">Category name</div>
              <input id=\"new-category-name\" type=\"text\" placeholder=\"e.g., Snacks\" required />
            </label>
            <div style=\"display:flex; justify-content:flex-end; gap:8px; margin-top:12px;\">
              <button type=\"button\" id=\"add-category-cancel\" class=\"ghost\">Cancel</button>
              <button type=\"submit\" id=\"add-category-save\">Add</button>
            </div>
          </form>
        `;
        document.body.appendChild(cdlg);
      }
      const cForm = cdlg.querySelector('#add-category-form');
      const cName = cdlg.querySelector('#new-category-name');
      const cMsg  = cdlg.querySelector('#add-category-msg');
      const cCancel = cdlg.querySelector('#add-category-cancel');
      cMsg.textContent = '';
      cName.value = '';
      function closeCat(){ if (typeof cdlg.close === 'function') cdlg.close(); else cdlg.open = false; }
      cCancel.onclick = (ev)=>{ ev.preventDefault(); closeCat(); };
      cForm.onsubmit = (ev) => {
        ev.preventDefault();
        let v = (cName.value || '').trim();
        if (!v){ cMsg.textContent = 'Please enter a category name'; return; }
        v = normalizeCategory(v);
        const values = Array.from(catEl.options).map(o => String(o.value).toLowerCase());
        if (!values.includes(v)){
          const opt = document.createElement('option');
          opt.value = v; opt.textContent = v.charAt(0).toUpperCase() + v.slice(1);
          catEl.appendChild(opt);
        }
        catEl.value = v;
        saveCustomCategory(v);
        // Notify filter to include this new category immediately
        document.dispatchEvent(new CustomEvent('category-added', { detail: { category: v } }));
        cMsg.textContent = 'Added ✓';
        setTimeout(()=> closeCat(), 150);
      };
      if (typeof cdlg.showModal === 'function') cdlg.showModal(); else cdlg.open = true;
      setTimeout(()=>{ try { cName.focus(); } catch(_){} }, 0);
    };

    form.onsubmit = async (e)=>{
      e.preventDefault();
      const name = (nameEl.value || '').trim();
      const price = priceEl.value !== '' ? Number(priceEl.value) : null;
  let category = normalizeCategory(catEl.value || 'other');
      const consumer = (consEl.value || 'both').toLowerCase();
      if (!name){ msgEl.textContent = 'Please enter a name'; return; }
      msgEl.textContent = 'Saving…';
  const store = (storeEl && storeEl.value) ? String(storeEl.value).toLowerCase() : 'walmart';
  const update = { name, price, category, consumer, store };
      const { error } = await sb.from('item_glossary').update(update).eq('id', item.id);
      if (error){ msgEl.textContent = 'Error: ' + (error.message || 'Failed to save'); return; }
      msgEl.textContent = 'Saved ✓';
      setTimeout(()=>{ close(); refresh(); }, 150);
    };

    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.open = true;
    setTimeout(()=>{ try { nameEl.focus(); } catch(_){} }, 0);
  }

  async function buildFilterPanel(){
    const cats = await getAllCategories();
    const chips = cats.map(cat=>{
      const id = `cat-${cat}`;
      const checked = activeCategories.has(cat) ? 'checked' : '';
      return `<label class="filter-chip"><input type="checkbox" id="${id}" data-cat="${cat}" ${checked} style="margin-right:6px;">${cat}</label>`;
    }).join('');

    // Row with filter, clear, and right-aligned + button (CSS classes for responsive layout)
    const filterRow = `
      <div class="filter-row">
        <div class="filter-actions">
          <button id="toggle-filter" class="ghost" type="button">Filter</button>
          <button id="clear-filter" class="ghost" type="button">Clear</button>
        </div>
        <button id="fp-add-glossary-btn" class="ghost add-btn" title="Add glossary item" aria-label="Add glossary item">+</button>
      </div>
    `;

    const manageBtn = `
      <div style="margin-top:10px;">
        <button id="manage-categories-btn" class="ghost">Manage categories</button>
      </div>`;
    const chipsWrap = `<div class="filter-chips">${chips}</div>`;
    filterPanel.innerHTML = filterRow + chipsWrap + manageBtn;

    // Wire up the new + button (scoped to filter panel to avoid conflicts with any static toolbar)
    const addBtn = filterPanel.querySelector('#fp-add-glossary-btn');
    if (addBtn && window.openAddGlossaryDialog) {
      addBtn.onclick = (e) => { e.preventDefault(); window.openAddGlossaryDialog(); };
    }
    // Re-wire filter/clear buttons (since we replaced innerHTML)
    const toggleBtn = filterPanel.querySelector('#toggle-filter');
    if (toggleBtn) {
      toggleBtn.onclick = ()=>{
        filterPanel.style.display = (filterPanel.style.display === 'none' || !filterPanel.style.display) ? 'block' : 'none';
      };
    }
    const clearBtn = filterPanel.querySelector('#clear-filter');
    if (clearBtn) {
      clearBtn.onclick = ()=>{
        activeCategories.clear();
        Array.from(filterPanel.querySelectorAll('input[type="checkbox"]')).forEach(cb=> cb.checked = false);
        refresh();
      };
    }
  }

  function getCustomCategories(){
    const arr = loadCustomCategories();
    return Array.from(new Set(arr.map(normalizeCategory))).sort((a,b)=> a.localeCompare(b));
  }
  function saveCustomCategoriesList(list){
    const unique = Array.from(new Set(list.map(normalizeCategory)));
    try { localStorage.setItem(LS_KEY, JSON.stringify(unique)); } catch {}
  }

  function ensureManageCategoriesDialog(){
    let dlg = document.getElementById('manage-categories-dialog');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'manage-categories-dialog';
    dlg.innerHTML = `
      <form method="dialog" id="manage-categories-form" style="min-width:320px; max-width:560px;">
        <h3 style="margin:0 0 8px 0;">Manage Categories</h3>
        <div class="muted" style="margin-bottom:8px;">These are custom categories saved on this device. Deleting here won't change existing items in the glossary.</div>
        <div id="mc-list" style="display:flex; flex-direction:column; gap:8px; max-height:50vh; overflow:auto;"></div>
        <div style="display:flex; gap:8px; align-items:flex-end; margin-top:8px;">
          <label style="flex:1;">
            <div class="muted">Add new category</div>
            <input type="text" id="mc-new" placeholder="e.g., Snacks" />
          </label>
          <button type="button" id="mc-add" class="ghost">Add</button>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
          <button type="submit" id="mc-close">Close</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    return dlg;
  }

  function renderManageCatsList(container){
    const cats = getCustomCategories();
    if (!cats.length){
      container.innerHTML = '<div class="muted">No custom categories yet.</div>';
      return;
    }
    container.innerHTML = cats.map(cat => {
      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      return `
        <div class="mc-row" data-cat="${cat}" style="display:flex; gap:8px; align-items:center;">
          <input type="text" class="mc-input" value="${label}" style="flex:1;" />
          <button type="button" class="mc-save ghost">Save</button>
          <button type="button" class="mc-del" style="background:#b91c1c; color:#fff;">Delete</button>
        </div>
      `;
    }).join('');
  }

  function openManageCategoriesDialog(){
    const dlg = ensureManageCategoriesDialog();
    const listEl = dlg.querySelector('#mc-list');
    const addBtn = dlg.querySelector('#mc-add');
    const newInput = dlg.querySelector('#mc-new');
    const form = dlg.querySelector('#manage-categories-form');
    renderManageCatsList(listEl);

    function close(){ if (typeof dlg.close === 'function') dlg.close(); else dlg.open = false; }

    listEl.onclick = (e)=>{
      const row = e.target.closest('.mc-row');
      if (!row) return;
      const oldCat = row.getAttribute('data-cat');
      if (e.target.classList.contains('mc-del')){
        if (!confirm(`Delete category "${oldCat}"?`)) return;
        const cats = getCustomCategories().filter(c => c !== oldCat);
        saveCustomCategoriesList(cats);
        renderManageCatsList(listEl);
        document.dispatchEvent(new CustomEvent('categories-changed'));
        buildFilterPanel();
        return;
      }
      if (e.target.classList.contains('mc-save')){
        const input = row.querySelector('.mc-input');
        let val = (input.value || '').trim();
        if (!val) { input.focus(); return; }
        const newCat = normalizeCategory(val);
        let cats = getCustomCategories();
        cats = cats.filter(c => c !== oldCat);
        if (!cats.includes(newCat)) cats.push(newCat);
        saveCustomCategoriesList(cats);
        renderManageCatsList(listEl);
        document.dispatchEvent(new CustomEvent('categories-changed'));
        buildFilterPanel();
        return;
      }
    };

    addBtn.onclick = ()=>{
      let v = (newInput.value || '').trim();
      if (!v) { newInput.focus(); return; }
      v = normalizeCategory(v);
      const cats = getCustomCategories();
      if (!cats.includes(v)){
        cats.push(v);
        saveCustomCategoriesList(cats);
        renderManageCatsList(listEl);
        document.dispatchEvent(new CustomEvent('categories-changed'));
        buildFilterPanel();
      }
      newInput.value = '';
      newInput.focus();
    };

    form.onsubmit = (e)=>{ e.preventDefault(); close(); };
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.open = true;
    setTimeout(()=>{ try { newInput.focus(); } catch(_){} }, 0);
  }

  if (toggleFilterBtn) {
    toggleFilterBtn.addEventListener('click', ()=>{
      filterPanel.style.display = (filterPanel.style.display === 'none' || !filterPanel.style.display) ? 'block' : 'none';
    });
  }
  if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', ()=>{
      activeCategories.clear();
      Array.from(filterPanel.querySelectorAll('input[type="checkbox"]')).forEach(cb=> cb.checked = false);
      refresh();
    });
  }

  // Also wire the static toolbar Add button if present
  const headerAddBtn = document.getElementById('add-glossary-btn');
  if (headerAddBtn && window.openAddGlossaryDialog && !headerAddBtn.__wired) {
    headerAddBtn.__wired = true;
    headerAddBtn.addEventListener('click', (e)=>{ e.preventDefault(); window.openAddGlossaryDialog(); });
  }

  // Change handler (attach once)
  filterPanel.addEventListener('change', (e)=>{
    const input = e.target.closest('input[type="checkbox"][data-cat]');
    if (!input) return;
    const cat = input.getAttribute('data-cat');
    if (input.checked) activeCategories.add(cat); else activeCategories.delete(cat);
    refresh();
  });
  // Click handler for Manage categories button (event delegation)
  filterPanel.addEventListener('click', (e)=>{
    const btn = e.target.closest('#manage-categories-btn');
    if (!btn) return;
    e.preventDefault();
    openManageCategoriesDialog();
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
    await buildFilterPanel();
    await refresh();
  });

  // Global listeners to close any open item menus
  document.addEventListener('click', (e)=>{
    // ignore clicks on menu buttons or menus themselves
    if (e.target.closest('.g-menu') || e.target.closest('.g-menu-btn')) return;
    document.querySelectorAll('.g-menu').forEach(m => { m.style.display = 'none'; });
    document.querySelectorAll('.g-menu-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded','false'));
  });
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape'){
      document.querySelectorAll('.g-menu').forEach(m => { m.style.display = 'none'; });
      document.querySelectorAll('.g-menu-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded','false'));
    }
  });

  // Refresh if a new glossary item is added via the shared modal
  document.addEventListener('glossary-item-added', async () => {
    // New items might introduce new categories
    await buildFilterPanel();
    refresh();
  });
  document.addEventListener('category-added', async (e) => {
    // Custom category added via dialogs; rebuild filter list immediately
    await buildFilterPanel();
  });

  // handle Edit clicks
  resultsEl.addEventListener('click', (e)=>{
    // Overflow menu toggle
    const menuBtn = e.target.closest('.g-menu-btn');
    if (menuBtn){
      e.preventDefault();
      const id = menuBtn.getAttribute('data-id');
      // close any other open menus
      document.querySelectorAll('.g-menu').forEach(m => { m.style.display = 'none'; });
      document.querySelectorAll('.g-menu-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded','false'));
      // toggle this one
      const menu = document.querySelector(`.g-menu[data-menu-for="${CSS.escape(id)}"]`);
      if (menu){
        const isOpen = menu.style.display !== 'none';
        menu.style.display = isOpen ? 'none' : 'block';
        menuBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      }
      return;
    }

    // Menu items (edit/delete)
    const menuItem = e.target.closest('.g-menu-item');
    if (menuItem){
      e.preventDefault();
      const id = menuItem.getAttribute('data-id');
      const action = menuItem.getAttribute('data-action');
      const it = lastItems.find(x => String(x.id) === String(id));
      // close menu
      const menu = document.querySelector(`.g-menu[data-menu-for="${CSS.escape(id)}"]`);
      const btn  = document.querySelector(`.g-menu-btn[data-id="${CSS.escape(id)}"]`);
      if (menu) menu.style.display = 'none';
      if (btn) btn.setAttribute('aria-expanded','false');
      if (!it) return;
      if (action === 'edit'){
        openGlossaryEditDialog(it);
        return;
      }
      if (action === 'delete'){
        if (!confirm(`Delete glossary item "${it.name}"?`)) return;
        (async ()=>{
          const { error } = await sb.from('item_glossary').delete().eq('id', it.id);
          if (error){ alert('Error deleting: ' + (error.message || 'Failed')); return; }
          refresh();
        })();
        return;
      }
    }
    const addBtn = e.target.closest('[data-add-id]');
    if (addBtn){
      const id = addBtn.getAttribute('data-add-id');
      const it = lastItems.find(x => String(x.id) === String(id));
      if (it) openAddToListDialog(it);
      return;
    }
  });
})();
