// js/script.js
document.addEventListener("DOMContentLoaded", () => {
  if (!window.sb) return;

  // --- Elements
  const listNameEl   = document.getElementById("list-name");
  const listDateEl   = document.getElementById("list-date");
  const createBtn    = document.getElementById("create-list-btn");
  const createMsg    = document.getElementById("create-list-msg");
  const createDialog = document.getElementById("create-list-dialog");
  const openCreateBtn= document.getElementById("open-create-list-btn");
  const closeCreate  = document.getElementById("close-create-list");

  const listsGrid    = document.getElementById("lists-grid");
  const listsEmpty   = document.getElementById("lists-empty");
  const refreshLists = document.getElementById("refresh-lists-btn");

  const detail       = document.getElementById("detail");
  const detailTitle  = document.getElementById("detail-title");
  const detailSub    = document.getElementById("detail-subtitle");
  const closeDetail  = document.getElementById("close-detail-btn");
  const deleteListBtn= document.getElementById("delete-list-btn");

  // Typeahead elements
  const gSearchEl    = document.getElementById("g-search");
  const gSuggBox     = document.getElementById("g-suggestions");
  const gQtyEl       = document.getElementById("g-qty");
  const gPriceEl     = document.getElementById("g-price");
  const addFromGlossaryBtn = document.getElementById("add-from-glossary-btn");

  // Custom item
  const cNameEl  = document.getElementById("c-name");
  const cQtyEl   = document.getElementById("c-qty");
  const cPriceEl = document.getElementById("c-price");
  const addCustomBtn = document.getElementById("add-custom-btn");

  // Items area
  const itemsBox  = document.getElementById("items");
  const itemsEmpty= document.getElementById("items-empty");
  const refreshItemsBtn = document.getElementById("refresh-items-btn");
  const totalsEl  = document.getElementById("totals");

  // --- State
  let currentList = null;     
  let items = [];             
  let sugg = [];              
  let activeIndex = -1;       
  let selectedGlossary = null; 

  // --- Helpers
  function fmtDateInput(d = new Date()) {
    const iso = new Date(d).toISOString();
    return iso.slice(0,10);
  }
  function fmtMoney(n) {
    if (n == null || isNaN(n)) return "$0.00";
    return `$${(+n).toFixed(2)}`;
  }
  function msg(el, text) {
    el.textContent = text || "";
  }
  const debounce = (fn, ms=250) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  // Init date
  listDateEl.value = fmtDateInput();

  // --- Lists
  async function loadLists() {
    listsGrid.innerHTML = "";
    msg(listsEmpty, "Loading...");
    const { data, error } = await sb
      .from("shopping_lists")
      .select("id, list_name, list_date, created_at")
      .order("list_date", { ascending: false });
    if (error) { console.error(error); msg(listsEmpty, "Error loading lists"); return; }

    if (!data || data.length === 0) {
      msg(listsEmpty, "No lists yet. Create one above.");
      return;
    }
    listsEmpty.textContent = "";

    data.forEach(l => {
      const card = document.createElement("div");
      card.className = "card";
      const dateStr = new Date(l.list_date).toLocaleDateString();
      card.innerHTML = `
        <div class="split">
          <div>
            <strong>${l.list_name}</strong><br/>
            <span class="muted">${dateStr}</span>
          </div>
          <div class="actions">
            <button class="ghost" data-open="${l.id}">Open</button>
            <button class="ghost" data-edit="${l.id}" data-name="${l.list_name.replace(/"/g, '&quot;')}">Edit</button>
            <button class="ghost" data-del="${l.id}">Delete</button>
          </div>
        </div>
      `;
      card.addEventListener("click", async (e) => {
        const openId = e.target.getAttribute("data-open");
        const editId = e.target.getAttribute("data-edit");
        const delId  = e.target.getAttribute("data-del");
        if (openId) { openList(openId); }
        if (editId)  { await editListName(editId, e.target.getAttribute('data-name') || ''); }
        if (delId)  { await deleteList(delId); }
      });
      listsGrid.appendChild(card);
    });
  }

  async function editListName(listId, currentName) {
    const newName = (prompt("Rename list:", currentName || "") || "").trim();
    if (!newName || newName === currentName) return;
    const { error } = await sb.from("shopping_lists").update({ list_name: newName }).eq("id", listId);
    if (error) { console.error(error); alert("Error renaming list"); return; }
    await loadLists();
    if (currentList && String(currentList.id) === String(listId)) {
      currentList.list_name = newName;
      detailTitle.textContent = newName;
    }
  }

  async function createList() {
    const name = (listNameEl.value || "").trim();
    const date = listDateEl.value || fmtDateInput();
    if (!name) { msg(createMsg, "Please enter a list name."); return; }

    msg(createMsg, "Creating...");
    const { data, error } = await sb
      .from("shopping_lists")
      .insert({ list_name: name, list_date: date })
      .select("id, list_name, list_date")
      .single();

    if (error) { console.error(error); msg(createMsg, "Error creating list."); return; }
    msg(createMsg, "List created ✓");
    listNameEl.value = "";
    await loadLists();
    await openList(data.id);
  }

  async function openList(listId) {
    const { data: list, error: e1 } = await sb
      .from("shopping_lists")
      .select("*")
      .eq("id", listId)
      .single();

    if (e1 || !list) { console.error(e1); return; }
    currentList = list;

    document.getElementById("detail-title").textContent = list.list_name;
    document.getElementById("detail-subtitle").textContent = new Date(list.list_date).toLocaleString();
    detail.classList.remove("hidden");

    clearTypeahead();

    await loadItems();
    window.scrollTo({ top: detail.offsetTop - 12, behavior: "smooth" });
  }

  async function deleteList(listId) {
    if (!confirm("Delete this list?")) return;
    await sb.from("shopping_list_items").delete().eq("list_id", listId);
    const { error } = await sb.from("shopping_lists").delete().eq("id", listId);
    if (error) { console.error(error); alert("Error deleting list"); return; }
    if (currentList && currentList.id === listId) {
      currentList = null;
      detail.classList.add("hidden");
    }
    await loadLists();
  }

  function closeDetailView() {
    currentList = null;
    detail.classList.add("hidden");
  }

  // --- Items
  async function loadItems() {
    if (!currentList) return;
    itemsBox.innerHTML = "";
    msg(itemsEmpty, "Loading items…");

    const { data, error } = await sb
      .from("shopping_list_items")
      .select("id, item_id, name, price, quantity, category, consumer, is_checked, created_at")
      .eq("list_id", currentList.id)
      .order("is_checked", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) { console.error(error); msg(itemsEmpty, "Error loading items"); return; }

    items = data || [];
    if (items.length === 0) {
      msg(itemsEmpty, "No items yet.");
      totalsEl.textContent = "";
      return;
    }
    itemsEmpty.textContent = "";
    items.forEach(renderItemRow);
    renderTotals();
  }

  function renderItemRow(it) {
    const row = document.createElement("div");
    row.className = "item";
    const checked = !!it.is_checked;

    // Dropdown menu HTML
    const dropdownId = `dropdown-${it.id}`;
    row.innerHTML = `
      <input type="checkbox" ${checked ? "checked" : ""} data-check="${it.id}" />
      <div style="display:flex; align-items:center; gap:8px;">
        ${checked ? `<del>${it.name} × ${it.quantity}</del>` : `${it.name} × ${it.quantity}`}
        <div style="position:relative; margin-left:auto;">
          <button class="ghost dropdown-toggle" aria-haspopup="true" aria-expanded="false" aria-controls="${dropdownId}" style="padding:4px 8px; font-size:18px;">&#8942;</button>
          <div class="dropdown-menu hidden" id="${dropdownId}" style="position:absolute; right:0; top:110%; background:#fff; border:1px solid #ccc; border-radius:8px; min-width:90px; z-index:10; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <button class="dropdown-item" data-edit-item="${it.id}" style="width:100%; text-align:left; padding:8px 12px; background:none; border:none; cursor:pointer;color:black;">Edit</button>
            <button class="dropdown-item" data-del="${it.id}" style="width:100%; text-align:left; padding:8px 12px; background:none; border:none; cursor:pointer; color:#b00;">Delete</button>
          </div>
        </div>
      </div>
      <div class="actions">
        <span class="muted" title="Price">${fmtMoney((it.price || 0) * (it.quantity || 1))}</span>
      </div>
    `;

    // Dropdown logic
    const toggleBtn = row.querySelector('.dropdown-toggle');
    const menu = row.querySelector('.dropdown-menu');
    if (toggleBtn && menu) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !menu.classList.contains('hidden');
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
        if (!isOpen) menu.classList.remove('hidden');
        else menu.classList.add('hidden');
      });
      // Close dropdown on outside click
      document.addEventListener('click', (e) => {
        if (!row.contains(e.target)) menu.classList.add('hidden');
      });
    }

    // Action handlers
    row.addEventListener("click", async (e) => {
      const idCheck = e.target.getAttribute("data-check");
      const idEdit  = e.target.getAttribute("data-edit-item");
      const idDel   = e.target.getAttribute("data-del");
      if (idCheck) {
        await toggleItem(idCheck, !it.is_checked);
      }
      if (idEdit) {
        const found = items.find(x => String(x.id) === String(idEdit));
        if (found) openItemEditDialog(found);
      }
      if (idDel) {
        await deleteItem(idDel);
      }
    });
    itemsBox.appendChild(row);
  }

  // --- Item edit dialog
  function ensureItemEditDialog() {
    let dlg = document.getElementById('edit-item-dialog');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'edit-item-dialog';
    dlg.innerHTML = `
      <form id="edit-item-form" method="dialog" style="min-width:320px; max-width:520px;">
        <h3 style="margin:0 0 8px 0;">Edit Item</h3>
        <div class="muted" id="edit-item-msg" style="margin-bottom:8px;"></div>
        <label style="display:block; margin-bottom:8px;">
          <div class="muted">Name</div>
          <input id="ei-name" type="text" required />
        </label>
        <div style="display:flex; gap:12px;">
          <label style="flex:1;">
            <div class="muted">Qty</div>
            <input id="ei-qty" type="number" min="1" value="1" />
          </label>
          <label style="flex:1;">
            <div class="muted">Price</div>
            <input id="ei-price" type="number" step="0.01" />
          </label>
        </div>
        <div style="display:flex; gap:12px; margin-top:8px;">
          <label style="flex:1;">
            <div class="muted">Category</div>
            <select id="ei-category">
              <option value="meat">Meat</option>
              <option value="dairy">Dairy</option>
              <option value="vegetables">Vegetable</option>
              <option value="fruit">Fruit</option>
              <option value="utility">Utility</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label style="flex:1;">
            <div class="muted">Consumer</div>
            <select id="ei-consumer">
              <option value="grant">Grant</option>
              <option value="emily">Emily</option>
              <option value="both">Both</option>
            </select>
          </label>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
          <button type="button" id="ei-cancel" class="ghost">Cancel</button>
          <button type="submit" id="ei-save">Save</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    return dlg;
  }

  function openItemEditDialog(item) {
    const dlg = ensureItemEditDialog();
    const msgEl = dlg.querySelector('#edit-item-msg');
    const nameEl = dlg.querySelector('#ei-name');
    const qtyEl = dlg.querySelector('#ei-qty');
    const priceEl = dlg.querySelector('#ei-price');
    const catEl = dlg.querySelector('#ei-category');
    const consEl = dlg.querySelector('#ei-consumer');
    const cancelBtn = dlg.querySelector('#ei-cancel');
    const form = dlg.querySelector('#edit-item-form');

    // Reset and fill
    msgEl.textContent = '';
    nameEl.value = item.name || '';
    qtyEl.value = Number(item.quantity) || 1;
    priceEl.value = (item.price != null && item.price !== '') ? Number(item.price) : '';
    let category = String(item.category || 'other').toLowerCase();
    if (category === 'vegetable') category = 'vegetables';
    catEl.value = ['meat','dairy','vegetables','fruit','utility','other'].includes(category) ? category : 'other';
    consEl.value = String(item.consumer || 'both').toLowerCase();

    function close(){ if (typeof dlg.close === 'function') dlg.close(); else dlg.open = false; }
    cancelBtn.onclick = (e)=>{ e.preventDefault(); close(); };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = (nameEl.value || '').trim();
      const quantity = Number(qtyEl.value) || 1;
      const price = priceEl.value !== '' ? Number(priceEl.value) : null;
      let category = (catEl.value || 'other').toLowerCase();
      if (category === 'vegetable') category = 'vegetables';
      const consumer = (consEl.value || 'both').toLowerCase();
      if (!name) { msgEl.textContent = 'Please enter a name'; return; }
      msgEl.textContent = 'Saving…';
      const update = { name, quantity, price, category, consumer };
      const { error } = await sb.from('shopping_list_items').update(update).eq('id', item.id);
      if (error) { console.error(error); msgEl.textContent = 'Error: ' + (error.message || 'Failed to save'); return; }
      msgEl.textContent = 'Saved ✓';
      setTimeout(()=>{ close(); loadItems(); }, 150);
    };

    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.open = true;
    setTimeout(()=>{ try { nameEl.focus(); } catch(_){} }, 0);
  }

  function renderTotals() {
    const n = (v) => Number(v) || 0;

    let subtotalGrant = 0;
    let subtotalEmily = 0;

    items.forEach((i) => {
      const qty = n(i.quantity) || 1;
      const line = n(i.price) * qty;

      const consumer = String(i.consumer ?? "both").trim().toLowerCase();
      const isMeat = String(i.category ?? "").trim().toLowerCase() === "meat";

      if (consumer === "grant") {
        subtotalGrant += line;
      } else if (consumer === "emily") {
        subtotalEmily += line;
      } else { 
        if (isMeat) {
          subtotalGrant += line * 0.60;
          subtotalEmily += line * 0.40;
        } else {
          subtotalGrant += line * 0.50;
          subtotalEmily += line * 0.50;
        }
      }
    });

    const taxGrant = subtotalGrant * 0.05;
    const taxEmily = subtotalEmily * 0.05;

    const totalGrant = subtotalGrant + taxGrant;
    const totalEmily = subtotalEmily + taxEmily;

    const grandTotal = totalGrant + totalEmily;

    totalsEl.innerHTML = `
      <div>
        Grant: $${totalGrant.toFixed(2)} <span class="muted">(incl. 5% tax)</span><br/>
        Emily: $${totalEmily.toFixed(2)} <span class="muted">(incl. 5% tax)</span>
        <br/><strong>Grand Total: $${grandTotal.toFixed(2)}</strong>
      </div>
    `;
  }

  async function toggleItem(itemId, checked) {
    const { error } = await sb
      .from("shopping_list_items")
      .update({ is_checked: checked })
      .eq("id", itemId);
    if (error) { console.error(error); return; }
    await loadItems();
  }

  async function deleteItem(itemId) {
    const { error } = await sb
      .from("shopping_list_items")
      .delete()
      .eq("id", itemId);
    if (error) { console.error(error); return; }
    await loadItems();
  }

  // --- Typeahead: Supabase search as you type
  const doSearch = debounce(async (q) => {
    if (!q || q.length < 1) { hideSuggestions(); return; }

    const { data, error } = await sb
      .from("item_glossary")
      .select("id, name, price, category, consumer")
      .ilike("name", `%${q}%`)
      .order("name", { ascending: true })
      .limit(12);

    if (error) { console.error(error); hideSuggestions(); return; }

    sugg = data || [];
    activeIndex = -1;
    renderSuggestions();
  }, 180);

  function renderSuggestions() {
    if (!sugg.length) { hideSuggestions(); return; }
    gSuggBox.innerHTML = "";
    sugg.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = "sugg" + (i === activeIndex ? " active" : "");
      el.setAttribute("role", "option");
      el.dataset.idx = i;
      el.innerHTML = `
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="meta">${s.category ?? ""} ${s.consumer ? "· " + escapeHtml(s.consumer) : ""} ${s.price != null ? "· $" + Number(s.price).toFixed(2) : ""}</div>
      `;
      el.addEventListener("mousedown", async (e) => {
        e.preventDefault();
        await chooseSuggestion(i);
      });
      gSuggBox.appendChild(el);
    });
    gSuggBox.classList.remove("hidden");
  }

  function hideSuggestions() {
    gSuggBox.classList.add("hidden");
    gSuggBox.innerHTML = "";
  }

  function clearTypeahead() {
    gSearchEl.value = "";
    gPriceEl.value = "";
    gQtyEl.value = 1;
    selectedGlossary = null;
    sugg = [];
    activeIndex = -1;
    hideSuggestions();
  }

  async function chooseSuggestion(i) {
    const s = sugg[i];
    if (!s) return;
    selectedGlossary = s;
    gSearchEl.value = s.name;
    gPriceEl.value = s.price ?? "";
    hideSuggestions();
    // Auto-add to list if possible
    if (currentList) {
      const qty = Number(gQtyEl.value) || 1;
      const price = gPriceEl.value !== "" ? Number(gPriceEl.value) : (s.price ?? null);
      const payload = {
        list_id: currentList.id,
        item_id: s.id,
        name: s.name,
        price: price,
        quantity: qty,
        category: s.category ?? null,
        consumer: (s.consumer || "both").toLowerCase(),
        is_checked: false
      };
      const { error } = await sb.from("shopping_list_items").insert(payload);
      if (error) { console.error(error); alert("Error adding item"); return; }
      clearTypeahead();
      await loadItems();
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  // Keyboard navigation
  gSearchEl.addEventListener("keydown", (e) => {
    if (gSuggBox.classList.contains("hidden")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min((activeIndex + 1), sugg.length - 1);
      renderSuggestions();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max((activeIndex - 1), 0);
      renderSuggestions();
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        chooseSuggestion(activeIndex);
      }
    } else if (e.key === "Escape") {
      hideSuggestions();
    }
  });

  gSearchEl.addEventListener("input", (e) => {
    selectedGlossary = null; 
    const q = e.target.value.trim();
    doSearch(q);
  });

  gSearchEl.addEventListener("blur", () => {
    setTimeout(() => hideSuggestions(), 100);
  });

  // Add from glossary
  async function addFromGlossary() {
    if (!currentList) return;
    if (!selectedGlossary) { alert("Pick an item from the suggestions first."); return; }

    const qty = Number(gQtyEl.value) || 1;
    const price = gPriceEl.value !== "" ? Number(gPriceEl.value) : (selectedGlossary.price ?? null);

    const payload = {
      list_id: currentList.id,
      item_id: selectedGlossary.id,
      name: selectedGlossary.name,
      price: price,
      quantity: qty,
      category: selectedGlossary.category ?? null,
      consumer: (selectedGlossary.consumer || "both").toLowerCase(),
      is_checked: false
    };

    const { error } = await sb.from("shopping_list_items").insert(payload);
    if (error) { console.error(error); alert("Error adding item"); return; }

    clearTypeahead();
    await loadItems();
  }

  // --- Custom item
  async function addCustom() {
    if (!currentList) return;
    const name = (cNameEl.value || "").trim();
    const qty  = Number(cQtyEl.value) || 1;
    const price= cPriceEl.value !== "" ? Number(cPriceEl.value) : null;

    if (!name) { alert("Enter a name"); return; }

    const payload = {
      list_id: currentList.id,
      name, price, quantity: qty,
      category: null,
      consumer: "both",
      is_checked: false
    };

    const { error } = await sb.from("shopping_list_items").insert(payload);
    if (error) { console.error(error); alert("Error adding item"); return; }

    cNameEl.value = ""; cQtyEl.value = 1; cPriceEl.value = "";
    await loadItems();
  }

  // --- Events
  createBtn.addEventListener("click", createList);
  if (openCreateBtn) {
    openCreateBtn.addEventListener("click", (e)=>{
      e.preventDefault();
      if (createDialog && typeof createDialog.showModal === 'function') createDialog.showModal();
      else if (createDialog) createDialog.open = true;
      setTimeout(()=>{ try { listNameEl.focus(); } catch(_){} }, 0);
    });
  }
  if (closeCreate && createDialog) {
    closeCreate.addEventListener("click", (e)=>{
      e.preventDefault();
      if (typeof createDialog.close === 'function') createDialog.close(); else createDialog.open = false;
    });
  }
  refreshLists.addEventListener("click", loadLists);

  closeDetail.addEventListener("click", closeDetailView);
  deleteListBtn.addEventListener("click", async () => { if (currentList) await deleteList(currentList.id); });

  addFromGlossaryBtn.addEventListener("click", addFromGlossary);
  if (addCustomBtn) {
    addCustomBtn.addEventListener("click", addCustom);
  }
  refreshItemsBtn.addEventListener("click", loadItems);

  listNameEl.addEventListener("keydown", (e) => { if (e.key === "Enter") createList(); });
  if (cNameEl) {
    cNameEl.addEventListener("keydown", (e) => { if (e.key === "Enter") addCustom(); });
  }

  // First load
  loadLists();
});
