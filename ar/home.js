/* The search on top of every section (asker-nawaqes-arabic.html, owner 2026-11-12: «عايز البحث ثابت زي ما كان فوق كل الأقسام»).
   ONE box, one card per item. It puts together:
     every item of the system (ar_store_items, about 32,000: the hub sends them all every hour; the owner may read them all),
     the pharmacy's stock (ar_stock, ar/stock.js), the warehouses' lists (ar_supplier_items, ar/suppliers.js), the shortage
     list, the Arabic names and today's «اتطلب» (ar/app.js).
   Marks: the stock (green) or «ملوش رصيد», «ناقص» (on the shortage list), «اتطلب النهارده», and who sells it (best discount
   per warehouse, newest list). Lines of the lists that are not surely one of our items are shown apart.
   ✏️ fixes the Arabic name (owner: «معظم العربي فيه مشاكل»): the server's ar_store_owner_set_arabic (the owner's name wins in
   the store site and the stock) and ar_names «approved» (the shortages and the reading of the warehouses' messages). */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests) ----------
  const num = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };
  // the best offer per warehouse: the newest list wins, then the higher discount
  function bestOffers(offers) {
    const by = new Map();
    for (const o of offers || []) {
      if (!o || !o.supplier) continue;
      const k = String(o.supplier).toUpperCase(), cur = by.get(k);
      const newer = !cur || String(o.date || '') > String(cur.date || '') || (String(o.date || '') === String(cur.date || '') && (num(o.disc) ?? -1) > (num(cur.disc) ?? -1));
      if (newer) by.set(k, o);
    }
    return [...by.values()].sort((a, b) => (num(b.disc) ?? -1) - (num(a.disc) ?? -1));
  }
  // the suppliers' short codes (lists and purchases) as the owner says them
  const SUP = { NEWCITY: 'نيو سيتي', NEWC: 'نيو سيتي', AMG: 'AMG', REDA: 'رضا عطية', SKY: 'رضا عطية', ELFATH: 'الفتح', ELFT: 'الفتح', PHARMA: 'فارما', PHAR: 'فارما', IBNSINA: 'ابن سينا', RAMA: 'صيدلية رمضان' };
  const supName = (s) => SUP[String(s || '').toUpperCase()] || String(s || '');
  // «9/11» this year, «9/11/25» before
  function shortDate(d, now) {
    const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    const y = (now || new Date()).getFullYear();
    return `${+m[3]}/${+m[2]}` + (+m[1] === y ? '' : '/' + m[1].slice(2));
  }
  // «آخر شرا: الفتح 21% (9/11) · AMG 20% (3/10)» (the newest three)
  function buysText(it, now) {
    const b = (it.buys || []).slice().sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, 3);
    if (!b.length) return '';
    return 'آخر شرا: ' + b.map((x) => supName(x.supplier) + (num(x.disc) != null ? ' ' + num(x.disc) + '%' : '') + (num(x.bonus) > 0 ? ' + بونص' : '') + ' (' + shortDate(x.date, now) + ')').join(' · ');
  }
  // src: { items: ar_store_items rows, stock: ar_stock rows, lines: ar_supplier_items rows, buys: ar_item_buys rows,
  //        shortages: [{product_name}], names: Map(name_key -> {arabic_name}), orders: [{name_key}], nk, sure, fold }
  function buildIndex(src) {
    const nk = src.nk, fold = src.fold || ((s) => String(s || '').toLowerCase());
    const names = src.names || new Map();
    const arOf = (en, given) => String(given || '').trim() || String((names.get(nk(en)) || {}).arabic_name || '').trim();
    const byId = new Map(), byName = new Map(), items = [], extra = [];
    const add = (it) => { it.key = it.id != null ? 'i' + it.id : 's' + nk(it.en); items.push(it); if (it.id != null) byId.set(String(it.id), it); if (it.en) byName.set(nk(it.en), it); return it; };
    const blank = (id, en, ar) => ({ id, en: String(en || ''), ar: arOf(en, ar), stock: null, price: null, offers: [], buys: [], short: false, ordered: false });
    for (const r of src.items || []) {
      if (!r || r.id == null) continue;
      const it = add(blank(r.id, r.name, r.arabic_name));
      it.price = num(r.price);
    }
    for (const r of src.stock || []) {
      if (!r || r.item_id == null) continue;
      let it = byId.get(String(r.item_id));
      if (!it) it = add(blank(r.item_id, r.name, r.arabic_name));
      it.stock = r;
      if (!it.ar) it.ar = arOf(r.name, r.arabic_name);
    }
    for (const l of src.lines || []) {
      if (!l) continue;
      if (!(src.sure ? src.sure(l) : l.item_id != null)) { extra.push(l); continue; }
      let it = byId.get(String(l.item_id));
      if (!it) it = add(blank(l.item_id, l.pharmafly_name));
      it.offers.push({ supplier: l.supplier, disc: l.discount_pct, price: l.price, date: l.list_date });
    }
    // the last real purchase from each supplier (only for items the system knows)
    for (const b of src.buys || []) {
      if (!b || b.item_id == null) continue;
      const it = byId.get(String(b.item_id));
      if (it) it.buys.push({ supplier: b.supplier, date: b.last_date, disc: b.discount_pct, bonus: b.bonus });
    }
    for (const x of src.shortages || []) {
      if (!x || !x.product_name) continue;
      let it = byName.get(nk(x.product_name));
      if (!it) it = add(blank(null, x.product_name));
      it.short = true;
    }
    const ordered = new Set((src.orders || []).map((o) => o && o.name_key).filter(Boolean));
    for (const it of items) {
      if (ordered.has(nk(it.en))) it.ordered = true;
      it.offers = bestOffers(it.offers);
      it._h = [fold(it.ar), fold(it.en)];
    }
    for (const l of extra) l._h = [fold(l.supplier_name), fold(l.pharmafly_name || '')];
    return { items, extra };
  }
  // the marks under the name, in this order: stock, ناقص, اتطلب النهارده
  function marks(it, qtyText) {
    const out = [];
    const s = it.stock;
    const main = s ? (num(s.packs) || 0) + (num(s.units) || 0) : 0;
    if (s && main > 0) out.push({ text: qtyText ? qtyText(s.packs, s.units, s.parts) : String(main), kind: 'good' });
    else out.push({ text: 'ملوش رصيد', kind: 'none' });
    if (it.short) out.push({ text: 'ناقص', kind: 'bad' });
    if (it.ordered) out.push({ text: 'اتطلب النهارده', kind: 'warn' });
    return out;
  }
  // «في القوايم: AMG 22% · رضا عطية 20% · …» every warehouse (there are four lists; 2026-11-12: the fourth was cut before)
  function offersText(it) {
    const o = (it.offers || []).slice(0, 6).map((x) => supName(x.supplier) + (num(x.disc) != null ? ' ' + num(x.disc) + '%' : ''));
    return o.length ? 'في القوايم: ' + o.join(' · ') : '';
  }
  // the four buttons under the box (owner 2026-11-12): الكل / المخزون (has stock now) / القوايم (in a warehouse's list) /
  // النواقص (on the shortage list)
  function inScope(it, scope) {
    if (scope === 'stock') { const s = it.stock; return !!s && (num(s.packs) || 0) + (num(s.units) || 0) > 0; }
    if (scope === 'lists') return (it.offers || []).length > 0;
    if (scope === 'short') return !!it.short;
    return true;
  }
  const SCOPE_WORDS = { stock: 'في المخزون', lists: 'في القوايم', short: 'في النواقص' };
  const api = { buildIndex, marks, offersText, bestOffers, buysText, supName, shortDate, inScope, SCOPE_WORDS };
  root.AskerHomeLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the search on top ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fz = () => root.AskerFuzzy;
  const db = () => root.AskerApp && root.AskerApp.client;
  const stockLib = () => root.AskerStockLib || {};
  const ITEM_COLS = 'id,name,arabic_name,price';
  let index = null, built = null, timer = null, shown = new Map();
  let lines = null, linesLoading = null, linesFail = '';
  let catalog = null, catLoading = null, catFail = '';
  let buys = null, buysLoading = null; // «آخر شرا» (ar_item_buys): quiet when the table is not there yet
  let scope = 'all'; // the button under the box; every page open starts on «الكل», so nothing is hidden by a forgotten choice

  function say(text, kind) {
    const el = $('hsStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  // a whole owner-only table, 1000 a page, 4 pages at a time (read once, kept until the page is closed)
  async function readCatalog() { return readAll('ar_store_items', ITEM_COLS, 'id'); }
  async function readAll(table, cols, orderBy) {
    // a stable order (every key column), so pages never skip or repeat a row
    const page = (a, z, opts) => orderBy.split(',').reduce((q, c) => q.order(c.trim(), { ascending: true }), db().from(table).select(cols, opts)).range(a, z);
    const first = await page(0, 999, { count: 'exact' });
    if (first.error) throw first.error;
    const out = [...(first.data || [])];
    const size = out.length, total = first.count == null ? null : first.count;
    if (size && (total == null ? size === 1000 : total > size)) {
      for (let from = size; total == null || from < total; from += size * 4) {
        const parts = await Promise.all([0, 1, 2, 3].map((k) => page(from + k * size, from + (k + 1) * size - 1)));
        let short = false;
        for (const p of parts) { if (p.error) throw p.error; out.push(...(p.data || [])); if ((p.data || []).length < size) short = true; }
        if (short) break;
      }
    }
    return out;
  }
  function loadCatalog() {
    if (catalog || catLoading || !db()) return;
    catLoading = readCatalog()
      .then((all) => { catalog = all; catFail = ''; })
      .catch((e) => { catFail = 'أصناف السيستم ماتحمّلتش: ' + ((e && e.message) || e); })
      .finally(() => { catLoading = null; draw(); });
  }
  function loadBuys() {
    if (buys || buysLoading || !db()) return;
    buysLoading = readAll('ar_item_buys', 'item_id,supplier,last_date,discount_pct,bonus', 'item_id,supplier')
      .then((all) => { buys = all; })
      .catch(() => { buys = []; }) // not there yet (before its migration) or not readable: the cards just have no «آخر شرا»
      .finally(() => { buysLoading = null; draw(); });
  }
  function loadLines() {
    if (lines || linesLoading || !root.AskerSuppliers || !root.AskerSuppliers.lines) return;
    linesLoading = root.AskerSuppliers.lines()
      .then((all) => { lines = all; linesFail = ''; })
      .catch((e) => { linesFail = 'قوايم المخازن ماتحمّلتش: ' + ((e && e.message) || e); })
      .finally(() => { linesLoading = null; draw(); });
  }
  let stockAsked = false;
  function askStock() {
    if (stockAsked || !root.AskerStock) return;
    stockAsked = true;
    root.AskerStock.ensure().then(draw, () => { stockAsked = false; });
  }
  // the index is rebuilt only when one of its sources is a new object (a reload) or more data arrived
  function currentIndex() {
    const L = root.AskerApp && root.AskerApp.lookup ? root.AskerApp.lookup() : { shortages: [], knownNames: new Map(), orders: [], nk: (s) => String(s || '').toUpperCase().trim() };
    const stock = root.AskerStock ? root.AskerStock.rows() : [];
    const src = [catalog, stock, lines, buys, L.shortages, L.knownNames, L.orders];
    if (index && built && src.every((x, i) => x === built[i])) return index;
    built = src;
    index = buildIndex({ items: catalog || [], stock, lines: lines || [], buys: buys || [], shortages: L.shortages, names: L.knownNames, orders: L.orders, nk: L.nk, sure: root.AskerSuppliers && root.AskerSuppliers.sure, fold: fz().fold });
    return index;
  }
  const PEN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function card(it) {
    const lib = stockLib();
    const tags = marks(it, lib.qtyText).map((m) => `<span class="tag ${m.kind}">${esc(m.text)}</span>`).join('');
    const s = it.stock;
    const price = s && Number(s.price) > 0 ? Number(s.price) : it.price;
    const more = [s && lib.expText ? lib.expText(s.exp_near) : '', price > 0 ? Math.round(price * 100) / 100 + ' ج' : ''].filter(Boolean).join(' · ');
    const others = s && lib.otherText ? lib.otherText(s.other, s.parts).map((t) => `<div class="st-other">${esc(t)}</div>`).join('') : '';
    const offers = offersText(it), bought = buysText(it);
    return `<div class="hs-item" data-k="${esc(it.key)}">
      <div class="hs-top">
        <div class="hs-names"><strong>${esc(it.ar || it.en)}</strong>${it.ar && it.en ? `<div class="hs-en" dir="ltr">${esc(it.en)}</div>` : ''}</div>
        <button type="button" class="hs-pen" data-edit aria-label="عدّل الاسم العربي" title="عدّل الاسم العربي">${PEN}</button>
      </div>
      <div class="hs-tags">${tags}</div>
      ${others}
      ${more ? `<div class="hint">${esc(more)}</div>` : ''}
      ${bought ? `<div class="hs-buys">${esc(bought)}</div>` : ''}
      ${offers ? `<div class="hs-offers">${esc(offers)}</div>` : ''}
    </div>`;
  }
  function editor(it) {
    return `<div class="hs-editbox">
      <label for="hsAr">الاسم العربي</label>
      <input id="hsAr" type="text" maxlength="250" dir="rtl" value="${esc(it.ar)}" placeholder="اكتب الاسم الصح بالعربي" />
      <div class="hs-editrow"><button type="button" data-save>احفظ الاسم</button><button type="button" class="secondary" data-cancel>إلغاء</button></div>
      <p class="hint">التصليح بيظهر في النواقص والمخزون والموقع، وبيساعد البوت يفهم رسايل المخازن. فاضي = يرجع للاسم التلقائي.</p>
      <p class="status" data-msg></p>
    </div>`;
  }
  function line(l) {
    const meta = [l.supplier, l.list_date, l.price != null ? l.price + ' ج' : '', l.discount_pct != null ? 'خصم ' + l.discount_pct + '%' : ''].filter(Boolean).join(' · ');
    return `<div class="item"><div>${esc(l.supplier_name)}</div><div class="hint">${esc(meta)}</div></div>`;
  }
  let editing = null; // the key of the card being edited (kept across redraws while data keeps arriving)
  function draw() {
    const box = $('hsQ');
    if (!box) return;
    const q = box.value.trim();
    const on = !!(fz() && fz().words(q).join('').length >= 2);
    $('hsClear')?.classList.toggle('hidden', !box.value);
    $('hsOut')?.classList.toggle('hidden', !on);
    $('app')?.classList.toggle('searching', on);
    if (!on) { $('hsItems').innerHTML = ''; $('hsLinesBox').classList.add('hidden'); editing = null; return say(''); }
    if (editing && document.activeElement && document.activeElement.id === 'hsAr') return; // never wipe what is being typed
    loadCatalog(); loadLines(); loadBuys(); askStock();
    const ix = currentIndex();
    const pool = scope === 'all' ? ix.items : ix.items.filter((it) => inScope(it, scope));
    const hits = fz().rank(q, pool, (it) => it._h, 25);
    // the warehouses' lines that are not surely one of our items belong to «الكل» and «القوايم»
    const extra = lines && (scope === 'all' || scope === 'lists') ? fz().rank(q, ix.extra, (l) => l._h, 10) : [];
    shown = new Map(hits.map((it) => [it.key, it]));
    $('hsItems').innerHTML = hits.map(card).join('');
    if (editing && shown.has(editing)) openEditor(editing);
    $('hsLines').innerHTML = extra.map(line).join('');
    $('hsLinesBox').classList.toggle('hidden', !extra.length);
    const age = root.AskerStock ? root.AskerStock.age() : '';
    const wait = [catLoading ? 'بحمّل كل أصناف السيستم…' : catFail, linesLoading ? 'بحمّل قوايم المخازن…' : linesFail].filter(Boolean).join(' · ');
    const where = SCOPE_WORDS[scope] || '';
    if (!hits.length && !extra.length) return say(wait || (where ? `مفيش صنف بالاسم ده ${where}. دوس «الكل» تدوّر في كله.` : 'مفيش صنف بالاسم ده.'), catFail || linesFail ? 'bad' : '');
    say([(hits.length === 25 ? 'أقرب 25 صنف' : `${hits.length} صنف`) + (where ? ' ' + where : ''), age, wait].filter(Boolean).join(' · '), catFail || linesFail ? 'bad' : '');
  }
  function openEditor(key) {
    const it = shown.get(key), cardEl = $('hsItems').querySelector(`[data-k="${CSS.escape(key)}"]`);
    if (!it || !cardEl) return;
    editing = key;
    cardEl.querySelector('.hs-editbox')?.remove();
    cardEl.insertAdjacentHTML('beforeend', editor(it));
    const inp = cardEl.querySelector('#hsAr');
    inp.focus();
    inp.select();
  }
  async function saveName(it, value, msg) {
    const v = String(value || '').replace(/\s+/g, ' ').trim();
    if (v && v.length < 2) throw new Error('الاسم قصير قوي');
    const L = root.AskerApp.lookup();
    let shownName = v;
    if (it.id != null) {
      const { data, error } = await db().rpc('ar_store_owner_set_arabic', { p_id: Number(it.id), p_arabic: v });
      if (error) throw error;
      if (!data || !data.ok) throw new Error(data && data.error === 'too_short' ? 'الاسم قصير قوي' : 'الصنف مش موجود في السيستم');
      shownName = data.arabic_name || '';
    }
    if (v && it.en) {
      const row = { name_key: L.nk(it.en), english_name: it.en, arabic_name: v, status: 'approved', updated_at: new Date().toISOString() };
      const { error } = await db().from('ar_names').upsert(row, { onConflict: 'name_key' });
      if (error) throw error;
      root.AskerApp.setName && root.AskerApp.setName(row);
    }
    // this page at once: the card, the kept rows, and the search words
    it.ar = shownName;
    it._h = [fz().fold(it.ar), fz().fold(it.en)];
    const c = catalog && catalog.find((r) => String(r.id) === String(it.id));
    if (c) c.arabic_name = shownName;
    if (it.stock) it.stock.arabic_name = shownName;
    msg.textContent = '';
    return shownName;
  }
  function bind() {
    const box = $('hsQ');
    if (!box) return;
    box.addEventListener('input', () => { editing = null; clearTimeout(timer); timer = setTimeout(draw, 220); });
    $('hsClear')?.addEventListener('click', () => { box.value = ''; editing = null; draw(); box.focus(); });
    $('hsScope')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-scope]');
      if (!b) return;
      scope = b.dataset.scope;
      $('hsScope').querySelectorAll('[data-scope]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
      editing = null;
      draw();
      if (!box.value) box.focus();
    });
    $('hsItems')?.addEventListener('click', async (e) => {
      const cardEl = e.target.closest('[data-k]');
      if (!cardEl) return;
      const key = cardEl.dataset.k, it = shown.get(key);
      if (!it) return;
      if (e.target.closest('[data-edit]')) return openEditor(key);
      if (e.target.closest('[data-cancel]')) { editing = null; cardEl.querySelector('.hs-editbox')?.remove(); return; }
      const save = e.target.closest('[data-save]');
      if (!save) return;
      const msg = cardEl.querySelector('[data-msg]');
      save.disabled = true;
      msg.className = 'status';
      msg.textContent = 'بيحفظ…';
      try {
        const name = await saveName(it, cardEl.querySelector('#hsAr').value, msg);
        editing = null;
        cardEl.outerHTML = card(it);
        const fresh = $('hsItems').querySelector(`[data-k="${CSS.escape(key)}"]`);
        fresh?.insertAdjacentHTML('beforeend', `<p class="status good">${name ? 'الاسم اتحفظ: ' + esc(name) : 'رجع للاسم التلقائي'}</p>`);
      } catch (err) {
        save.disabled = false;
        msg.className = 'status bad';
        msg.textContent = 'ماتحفظش: ' + ((err && err.message) || err);
      }
    });
    $('hsItems')?.addEventListener('keydown', (e) => {
      if (e.target && e.target.id === 'hsAr' && e.key === 'Enter') { e.preventDefault(); e.target.closest('[data-k]')?.querySelector('[data-save]')?.click(); }
    });
  }
  // choosing a section leaves the search
  function close() {
    const box = $('hsQ');
    if (box && box.value) { box.value = ''; editing = null; draw(); }
  }
  root.AskerHome = { draw, close, open: () => {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
