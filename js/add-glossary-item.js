// js/add-glossary-item.js
(function(){
  if (window.__add_glossary_item_initialized__) return;
  window.__add_glossary_item_initialized__ = true;

  const sb = window.sb; // provided by js/sb-client.js
  if (!sb) return; // Supabase client not ready

  // Base categories and helpers for persistence across reloads
  const BASE_CATEGORIES = ['meat','dairy','vegetables','fruit','utility','other'];
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

  function saveCustomCategory(cat){
    const v = normalizeCategory(cat);
    const arr = loadCustomCategories();
    if (!arr.includes(v)){
      arr.push(v);
      try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
    }
  }

  async function populateCategories(selectEl){
    const set = new Set(BASE_CATEGORIES);
    // add local custom categories
    for (const c of loadCustomCategories()) set.add(normalizeCategory(c));
    // add distinct categories from DB
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
    } catch (_) { /* ignore */ }

    const list = Array.from(set).sort((a,b)=> a.localeCompare(b));
    selectEl.innerHTML = list.map(v => {
      const label = v.charAt(0).toUpperCase() + v.slice(1);
      return `<option value="${v}">${label}</option>`;
    }).join('');
  }

  function ensureDialog() {
    let dlg = document.getElementById('add-glossary-dialog');
    if (dlg) return dlg;

    // Build dialog lazily and append to body
    dlg = document.createElement('dialog');
    dlg.id = 'add-glossary-dialog';
    dlg.innerHTML = `
      <form id="add-glossary-form" method="dialog" style="min-width:320px; max-width:480px;">
        <h3 style="margin:0 0 8px 0;">Add Glossary Item</h3>
        <div class="muted" id="add-glossary-msg" style="margin-bottom:8px;"></div>
        <label style="display:block; margin-bottom:8px;">
          <div class="muted">Name</div>
          <input id="agi-name" type="text" placeholder="e.g., Milk" required />
        </label>
        <label style="display:block; margin-bottom:8px;">
          <div class="muted">Price (optional)</div>
          <input id="agi-price" type="number" step="0.01" placeholder="0.00" />
        </label>
        <label style="display:block; margin-bottom:8px;">
          <div class="muted">Price per lb (optional)</div>
          <input id="agi-price-lb" type="number" step="0.01" placeholder="0.00" />
        </label>
        <div style="display:flex; gap:12px; margin-bottom:8px;">
          <label style="flex:1;">
            <div class="muted">Category</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <select id="agi-category" style="flex:1;">
                <option value=\"meat\">Meat</option>
                <option value=\"dairy\">Dairy</option>
                <option value=\"vegetables\">Vegetable</option>
                <option value=\"fruit\">Fruit</option>
                <option value=\"utility\">Utility</option>
                <option value=\"other\" selected>Other</option>
              </select>
              <button type="button" id="agi-add-category-btn" class="ghost" title="Add category" aria-label="Add category" style="white-space:nowrap; padding:6px 10px;">Add</button>
            </div>
          </label>
          <label style="flex:1;">
            <div class="muted">Consumer</div>
            <select id="agi-consumer">
              <option value="both" selected>Both</option>
              <option value="grant">Grant</option>
              <option value="emily">Emily</option>
            </select>
          </label>
          <label style="flex:1;">
            <div class="muted">Store</div>
            <select id="agi-store" required>
              <option value="walmart" selected>Walmart</option>
              <option value="sams">Sams</option>
            </select>
          </label>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
          <button type="button" id="agi-cancel" class="ghost">Cancel</button>
          <button type="submit" id="agi-save">Save</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    return dlg;
  }

  function ensureCategoryDialog() {
    let dlg = document.getElementById('add-category-dialog');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'add-category-dialog';
    dlg.innerHTML = `
      <form id="add-category-form" method="dialog" style="min-width:280px; max-width:420px;">
        <h3 style="margin:0 0 8px 0;">Add Category</h3>
        <div class="muted" id="add-category-msg" style="margin-bottom:8px;"></div>
        <label style="display:block;">
          <div class="muted">Category name</div>
          <input id="new-category-name" type="text" placeholder="e.g., Snacks" required />
        </label>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
          <button type="button" id="add-category-cancel" class="ghost">Cancel</button>
          <button type="submit" id="add-category-save">Add</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    return dlg;
  }

  async function openDialog() {
    const dlg = ensureDialog();
    const form = dlg.querySelector('#add-glossary-form');
    const nameEl = dlg.querySelector('#agi-name');
    const priceEl = dlg.querySelector('#agi-price');
    const priceLbEl = dlg.querySelector('#agi-price-lb');
    const catEl = dlg.querySelector('#agi-category');
    const consEl = dlg.querySelector('#agi-consumer');
  const msgEl = dlg.querySelector('#add-glossary-msg');
  const storeEl = dlg.querySelector('#agi-store');
    const cancelBtn = dlg.querySelector('#agi-cancel');
    const addCatBtn = dlg.querySelector('#agi-add-category-btn');

    // populate categories each time from base + localStorage + DB
    await populateCategories(catEl);

    // reset
    msgEl.textContent = '';
    nameEl.value = '';
  priceEl.value = '';
  if (priceLbEl) priceLbEl.value = '';
    catEl.value = 'other';
  consEl.value = 'both';
  if (storeEl) storeEl.value = 'walmart';

    function close() {
      if (typeof dlg.close === 'function') dlg.close(); else dlg.open = false;
    }

    cancelBtn.onclick = (e) => { e.preventDefault(); close(); };

    if (addCatBtn) {
      addCatBtn.onclick = (e) => {
        e.preventDefault();
        const cdlg = ensureCategoryDialog();
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
          if (!v) { cMsg.textContent = 'Please enter a category name'; return; }
          // normalize
          v = normalizeCategory(v);
          // dedupe by value (case-insensitive)
          const values = Array.from(catEl.options).map(o => String(o.value).toLowerCase());
          if (!values.includes(v)) {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v.charAt(0).toUpperCase() + v.slice(1);
            catEl.appendChild(opt);
          }
          catEl.value = v;
          // persist locally so it stays after reloads even if no item saved yet
          saveCustomCategory(v);
          cMsg.textContent = 'Added ✓';
          setTimeout(()=> closeCat(), 150);
        };

        if (typeof cdlg.showModal === 'function') cdlg.showModal(); else cdlg.open = true;
        setTimeout(()=>{ try { cName.focus(); } catch(_){} }, 0);
      };
    }

    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = (nameEl.value || '').trim();
  const price = priceEl.value !== '' ? Number(priceEl.value) : null;
  const price_per_lb = (priceLbEl && priceLbEl.value !== '') ? Number(priceLbEl.value) : null;
      let category = (catEl.value || 'other').toLowerCase().trim();
      const consumer = (consEl.value || 'both').toLowerCase().trim();

      // Normalize category just in case (singular to plural)
      if (category === 'vegetable') category = 'vegetables';

      if (!name) {
        msgEl.textContent = 'Please enter a name';
        return;
      }
      msgEl.textContent = 'Saving…';

  const store = (storeEl && storeEl.value) ? String(storeEl.value).toLowerCase() : 'walmart';
  const payload = { name, price, price_per_lb, category, consumer, store };
      const { error } = await sb.from('item_glossary').insert(payload);
      if (error) {
        console.error(error);
        msgEl.textContent = 'Error: ' + (error.message || 'Failed to save');
        return;
      }

      msgEl.textContent = 'Saved ✓';
      // Notify listeners (e.g., glossary page) to refresh
      document.dispatchEvent(new CustomEvent('glossary-item-added', { detail: payload }));

      setTimeout(() => close(), 150);
    };

    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.open = true;
    // focus first field for convenience
    setTimeout(() => { try { nameEl.focus(); } catch(_){} }, 0);
  }

  // Expose a safe global opener so other scripts (e.g., glossary.js) can open the dialog
  if (!window.openAddGlossaryDialog) {
    window.openAddGlossaryDialog = () => openDialog();
  }

  function wireOpeners(){
    const desktopBtn = document.getElementById('open-add-item-btn');
    if (desktopBtn && !desktopBtn.__agi_wired) {
      desktopBtn.__agi_wired = true;
      desktopBtn.addEventListener('click', (e)=>{ e.preventDefault(); openDialog(); });
    }
    const mobileLink = document.getElementById('mobile-add-item-link');
    if (mobileLink && !mobileLink.__agi_wired) {
      mobileLink.__agi_wired = true;
      mobileLink.addEventListener('click', (e)=>{ e.preventDefault(); openDialog(); });
    }
  }

  document.addEventListener('DOMContentLoaded', wireOpeners);
})();
