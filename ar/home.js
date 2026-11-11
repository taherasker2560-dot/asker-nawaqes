/* «الرئيسية» (asker-nawaqes-arabic.html, owner 2026-11-12): ONE search for an item. It puts together what the page already
   reads: the pharmacy's stock (ar_stock, ar/stock.js), the warehouses' lists (ar_supplier_items, ar/suppliers.js), the
   shortage list, the Arabic names and today's «اتطلب» (ar/app.js). One card per item, with its marks:
     the stock (green) or «ملوش رصيد», «ناقص» when it is on the shortage list, «اتطلب النهارده» when it was ordered today,
     and who sells it (best discount per warehouse, newest list).
   Lines of the warehouses' lists that are not surely one of our items are shown apart («في قوايم المخازن بس»).
   Reads only: nothing is written from here. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/home.cjs) ----------
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
  // src: { stock: ar_stock rows, lines: ar_supplier_items rows, shortages: [{product_name}], names: Map(name_key -> {arabic_name}),
  //        orders: [{name_key}], nk: name -> name_key, sure: line -> bool, fold: text -> searchable text }
  function buildIndex(src) {
    const nk = src.nk, fold = src.fold || ((s) => String(s || '').toLowerCase());
    const names = src.names || new Map();
    const arOf = (en, given) => String(given || '').trim() || String((names.get(nk(en)) || {}).arabic_name || '').trim();
    const byId = new Map(), byName = new Map(), items = [], extra = [];
    const add = (it) => { items.push(it); if (it.id != null) byId.set(String(it.id), it); if (it.en) byName.set(nk(it.en), it); return it; };
    for (const r of src.stock || []) {
      if (!r || r.item_id == null) continue;
      add({ id: r.item_id, en: String(r.name || ''), ar: arOf(r.name, r.arabic_name), stock: r, offers: [], short: false, ordered: false });
    }
    for (const l of src.lines || []) {
      if (!l) continue;
      if (!(src.sure ? src.sure(l) : l.item_id != null)) { extra.push(l); continue; }
      let it = byId.get(String(l.item_id));
      if (!it) it = add({ id: l.item_id, en: String(l.pharmafly_name || ''), ar: arOf(l.pharmafly_name), stock: null, offers: [], short: false, ordered: false });
      it.offers.push({ supplier: l.supplier, disc: l.discount_pct, price: l.price, date: l.list_date });
    }
    for (const x of src.shortages || []) {
      if (!x || !x.product_name) continue;
      const k = nk(x.product_name);
      let it = byName.get(k);
      if (!it) it = add({ id: null, en: String(x.product_name), ar: arOf(x.product_name), stock: null, offers: [], short: false, ordered: false });
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
  // «عند: AMG 22% · REDA 20%» (the best three)
  function offersText(it) {
    const o = (it.offers || []).slice(0, 3).map((x) => x.supplier + (num(x.disc) != null ? ' ' + num(x.disc) + '%' : ''));
    return o.length ? 'عند: ' + o.join(' · ') : '';
  }
  const api = { buildIndex, marks, offersText, bestOffers };
  root.AskerHomeLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the place ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fz = () => root.AskerFuzzy;
  const stockLib = () => root.AskerStockLib || {};
  let index = null, built = null, lines = null, linesLoading = null, linesFail = '', timer = null;

  function say(text, kind) {
    const el = $('hsStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  // the index is rebuilt only when one of its sources is a new object (a reload) or more data arrived
  function currentIndex() {
    const L = root.AskerApp && root.AskerApp.lookup ? root.AskerApp.lookup() : { shortages: [], knownNames: new Map(), orders: [], nk: (s) => String(s || '').toUpperCase().trim() };
    const stock = root.AskerStock ? root.AskerStock.rows() : [];
    const src = [stock, lines, L.shortages, L.knownNames, L.orders];
    if (index && built && src.every((x, i) => x === built[i])) return index;
    built = src;
    index = buildIndex({ stock, lines: lines || [], shortages: L.shortages, names: L.knownNames, orders: L.orders, nk: L.nk, sure: root.AskerSuppliers && root.AskerSuppliers.sure, fold: fz().fold });
    return index;
  }
  function card(it) {
    const lib = stockLib();
    const tags = marks(it, lib.qtyText).map((m) => `<span class="tag ${m.kind}">${esc(m.text)}</span>`).join('');
    const s = it.stock;
    const more = s ? [lib.expText ? lib.expText(s.exp_near) : '', Number(s.price) > 0 ? Math.round(Number(s.price) * 100) / 100 + ' ج' : ''].filter(Boolean).join(' · ') : '';
    const others = s && lib.otherText ? lib.otherText(s.other, s.parts).map((t) => `<div class="st-other">${esc(t)}</div>`).join('') : '';
    const offers = offersText(it);
    return `<div class="hs-item">
      <strong>${esc(it.ar || it.en)}</strong>
      ${it.ar && it.en ? `<div class="hs-en" dir="ltr">${esc(it.en)}</div>` : ''}
      <div class="hs-tags">${tags}</div>
      ${others}
      ${more ? `<div class="hint">${esc(more)}</div>` : ''}
      ${offers ? `<div class="hs-offers">${esc(offers)}</div>` : ''}
    </div>`;
  }
  function line(l) {
    const meta = [l.supplier, l.list_date, l.price != null ? l.price + ' ج' : '', l.discount_pct != null ? 'خصم ' + l.discount_pct + '%' : ''].filter(Boolean).join(' · ');
    return `<div class="item"><div>${esc(l.supplier_name)}</div><div class="hint">${esc(meta)}</div></div>`;
  }
  function draw() {
    const box = $('hsQ');
    if (!box) return;
    const q = box.value.trim();
    $('hsClear')?.classList.toggle('hidden', !box.value);
    if (!fz() || fz().words(q).join('').length < 2) {
      $('hsItems').innerHTML = '';
      $('hsLinesBox').classList.add('hidden');
      return say('اكتب حرفين من اسم الصنف، عربي أو إنجليزي.');
    }
    if (!lines && !linesLoading && !linesFail) loadLines();
    const ix = currentIndex();
    const hits = fz().rank(q, ix.items, (it) => it._h, 25);
    const extra = lines ? fz().rank(q, ix.extra, (l) => l._h, 10) : [];
    $('hsItems').innerHTML = hits.map(card).join('');
    $('hsLines').innerHTML = extra.map(line).join('');
    $('hsLinesBox').classList.toggle('hidden', !extra.length);
    const age = root.AskerStock ? root.AskerStock.age() : '';
    const wait = linesLoading ? 'بحمّل قوايم المخازن…' : linesFail;
    if (!hits.length && !extra.length) return say(wait || 'مفيش صنف بالاسم ده.', linesFail ? 'bad' : '');
    say([hits.length === 25 ? 'أقرب 25 صنف' : `${hits.length} صنف`, age, wait].filter(Boolean).join(' · '));
  }
  function loadLines() {
    if (!root.AskerSuppliers || !root.AskerSuppliers.lines) return;
    linesLoading = root.AskerSuppliers.lines()
      .then((all) => { lines = all; linesFail = ''; })
      .catch((e) => { linesFail = 'قوايم المخازن ماتحمّلتش: ' + ((e && e.message) || e); })
      .finally(() => { linesLoading = null; draw(); });
  }
  async function open() {
    if (!root.AskerStock) return;
    stockAsked = true;
    try { await root.AskerStock.ensure(); } catch (e) { stockAsked = false; }
    draw();
  }
  // the page opens here: the stock is read the first time something is typed (or when the place is opened again)
  let stockAsked = false;
  function askStock() {
    if (stockAsked || !root.AskerStock) return;
    stockAsked = true;
    root.AskerStock.ensure().then(draw, () => { stockAsked = false; });
  }
  function bind() {
    const box = $('hsQ');
    if (!box) return;
    box.addEventListener('input', () => { askStock(); clearTimeout(timer); timer = setTimeout(draw, 200); });
    $('hsClear')?.addEventListener('click', () => { box.value = ''; draw(); box.focus(); });
  }
  root.AskerHome = { open, draw };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
