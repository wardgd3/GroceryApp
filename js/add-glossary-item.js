// js/add-glossary-item.js
(function(){
  if (window.__add_glossary_item_initialized__) return;
  window.__add_glossary_item_initialized__ = true;

  const sb = window.sb; // provided by js/sb-client.js
  if (!sb) return; // Supabase client not ready

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
        <div style="display:flex; gap:12px; margin-bottom:8px;">
          <label style="flex:1;">
            <div class="muted">Category</div>
            <select id="agi-category">
              <option value=\"meat\">Meat</option>
              <option value=\"dairy\">Dairy</option>
              <option value=\"vegetables\">Vegetable</option>
              <option value=\"fruit\">Fruit</option>
              <option value=\"utility\">Utility</option>
              <option value=\"other\" selected>Other</option>
            </select>
          </label>
          <label style="flex:1;">
            <div class="muted">Consumer</div>
            <select id="agi-consumer">
              <option value="both" selected>Both</option>
              <option value="grant">Grant</option>
              <option value="emily">Emily</option>
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

  function openDialog() {
    const dlg = ensureDialog();
    const form = dlg.querySelector('#add-glossary-form');
    const nameEl = dlg.querySelector('#agi-name');
    const priceEl = dlg.querySelector('#agi-price');
    const catEl = dlg.querySelector('#agi-category');
    const consEl = dlg.querySelector('#agi-consumer');
    const msgEl = dlg.querySelector('#add-glossary-msg');
    const cancelBtn = dlg.querySelector('#agi-cancel');

    // reset
    msgEl.textContent = '';
    nameEl.value = '';
    priceEl.value = '';
    catEl.value = 'other';
    consEl.value = 'both';

    function close() {
      if (typeof dlg.close === 'function') dlg.close(); else dlg.open = false;
    }

    cancelBtn.onclick = (e) => { e.preventDefault(); close(); };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = (nameEl.value || '').trim();
      const price = priceEl.value !== '' ? Number(priceEl.value) : null;
      let category = (catEl.value || 'other').toLowerCase().trim();
      const consumer = (consEl.value || 'both').toLowerCase().trim();

      // Normalize category just in case (singular to plural)
      if (category === 'vegetable') category = 'vegetables';

      if (!name) {
        msgEl.textContent = 'Please enter a name';
        return;
      }
      msgEl.textContent = 'Saving…';

      const payload = { name, price, category, consumer };
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
