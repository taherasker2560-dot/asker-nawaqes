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
    // the English name in Arabic letters (AskerFuzzy.arabize): an Arabic word typed or SAID (owner 2026-11-22: «انت ليه ما عملتش بحث في الكل … بالصوت برضه») finds an English-only item
    const sound = (s) => (src.arabize && s ? fold(src.arabize(s)) : '');
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
      it._h = [fold(it.ar), fold(it.en)]; it._s = sound(it.en);
    }
    for (const l of extra) l._h = [fold(l.supplier_name), fold(l.pharmafly_name || '')];
    // «الملغى» (owner 2026-11-21): the cancelled items (src.cancel, parseCancel) leave «الكل» and the other buttons: visible / gone
    const visible = [], gone = [];
    for (const it of items) {
      const st = src.cancel && it.id != null ? cancelState(it, src.cancel.get(String(it.id))) : null;
      if (st && st.hidden) { it.cancel = st; gone.push(it); } else { if (st) it.cancelNote = st; visible.push(it); }
    }
    return { items, extra, visible, gone, byId };
  }
  // ---------- «الملغى» (owner 2026-11-20/21: «الاخفاء هيبقا عالملغى أو اللي جنب اسمه ملغى أو اللي ليه اسم تاني بسعر اعلى … والأصناف اللي ما عليهاش حركة من سنتين …
  // ويرجع بشكل أوتوماتيك لو دخل مشتريات بعدين») ----------
  // the laptop's lists (ar_item_cancel_sets, Store\SYNC_ITEM_CANCEL.ps1) + the owner's «ارجعه» (ar_item_cancel_restored) as rows {kind, ids}:
  //   word «id:YYYYMMDD» (the day it was first seen), dup «id:YYYYMMDD:price of the card that stays», idle «id:YYYYMM» (the last month anything moved; 000000 = never),
  //   restored «id,id,…». -> Map(id -> {kind, first | last, keep}); an id the owner put back is not in it
  function parseCancel(rows) {
    const rank = { word: 0, dup: 1, idle: 2 };
    const map = new Map(), back = new Set();
    const day = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    for (const r of [...(rows || [])].sort((a, b) => (rank[a && a.kind] ?? 9) - (rank[b && b.kind] ?? 9))) {
      if (!r || !r.kind) continue;
      for (const tok of String(r.ids || '').split(',')) {
        if (!tok) continue;
        const p = tok.split(':'), id = p[0];
        if (r.kind === 'restored') { back.add(id); continue; }
        if (map.has(id)) continue; // word beats dup beats idle
        if (r.kind === 'word' && /^\d{8}$/.test(p[1] || '')) map.set(id, { kind: 'word', first: day(p[1]) });
        else if (r.kind === 'dup' && /^\d{8}$/.test(p[1] || '')) map.set(id, { kind: 'dup', first: day(p[1]), keep: num(p[2]) });
        else if (r.kind === 'idle' && /^\d{6}$/.test(p[1] || '')) map.set(id, { kind: 'idle', last: p[1] === '000000' ? null : p[1].slice(0, 4) + '-' + p[1].slice(4, 6) });
      }
    }
    for (const id of back) map.delete(id);
    return map;
  }
  // one item against its entry: null = not cancelled (a purchase after the day it was first seen, or after its last month, brought it back for good; an idle item a warehouse lists
  // today is a market item that is alive: owner 2026-11-21 «الموجود في قوايم المخازن متلغيهوش لان دي اصناف سوق وشغالة»); else {hidden}: an item with stock or on the shortage list
  // stays on screen with a «🚫 ملغي» mark instead of going to «الملغى»
  function cancelState(it, e) {
    if (!e) return null;
    const buys = (it.buys || []).map((b) => String((b && b.date) || ''));
    if (e.kind === 'idle') { if (buys.some((d) => d.slice(0, 7) > (e.last || '0000-00')) || (it.offers || []).length > 0) return null; }
    else if (buys.some((d) => d.slice(0, 10) > e.first)) return null;
    const s = it.stock, has = !!s && (num(s.packs) || 0) + (num(s.units) || 0) > 0;
    return Object.assign({ hidden: !(has || !!it.short) }, e);
  }
  // why it is cancelled, in the owner's words (the card under «الملغى»)
  function cancelWhy(it) {
    const c = it.cancel || it.cancelNote;
    if (!c) return '';
    if (c.kind === 'word') return /لاغ[ىي]/.test(String(it.en || it.ar || '')) ? 'مكتوب جنب اسمه «لاغى»' : 'مكتوب جنب اسمه «ملغى»';
    if (c.kind === 'dup') return c.keep != null ? `نفس الاسم بسعر أعلى: ${r2(c.keep)} ج` : 'نفس الاسم بسعر أعلى';
    return c.last ? `مفيش حركة من سنتين · آخر حركة ${c.last.slice(5)}/${c.last.slice(0, 4)}` : 'مفيش حركة من سنتين · عمره ما اتباع ولا اتشترى';
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
    if (it.cancelNote) out.push({ text: '🚫 ملغي', kind: 'warn' }); // cancelled but kept on screen (stock, shortage list, a warehouse's list)
    return out;
  }
  // «في القوايم: AMG 22% · رضا عطية 20% · …» every warehouse (there are four lists; 2026-11-12: the fourth was cut before)
  function offersText(it) {
    const o = (it.offers || []).slice(0, 6).map((x) => supName(x.supplier) + (num(x.disc) != null ? ' ' + num(x.disc) + '%' : ''));
    return o.length ? 'في القوايم: ' + o.join(' · ') : '';
  }
  // «القوايم» (owner 2026-11-13: «تظهر لي المخازن اللي بره بس بكروتها بفرق الخصومات»): one row per warehouse, the best
  // discount first and green, the others with how much lower. [{ name, disc, best, less }]
  const r2 = (x) => Math.round(x * 100) / 100;
  function offerRows(it) {
    const o = (it.offers || []).slice(0, 6);
    const top = o.length ? num(o[0].disc) : null;
    return o.map((x) => {
      const d = num(x.disc);
      const best = d != null && top != null && d === top;
      return { name: supName(x.supplier), disc: d, best, less: !best && d != null && top != null && top > d ? r2(top - d) : null };
    });
  }
  // «آخر شرا: AMG 27% (24/9) ← النهارده أحسن بـ 3%»: the newest purchase against the best discount in the lists now
  function buysVsLists(it, now) {
    const t = buysText(it, now);
    if (!t) return '';
    const last = (it.buys || []).slice().sort((x, y) => String(y.date).localeCompare(String(x.date)))[0];
    const top = (it.offers || []).length ? num(it.offers[0].disc) : null, was = last ? num(last.disc) : null;
    if (top == null || was == null) return t;
    const d = r2(top - was);
    return t + ' ← ' + (d > 0 ? `النهارده أحسن بـ ${d}%` : d < 0 ? `آخر شرا كان أحسن بـ ${-d}%` : 'زي آخر شرا');
  }
  // the four buttons under the box (owner 2026-11-12): الكل / المخزون (has stock now) / القوايم (in a warehouse's list) /
  // النواقص (on the shortage list)
  function inScope(it, scope) {
    if (scope === 'cancelled') return !!it.cancel;
    if (it.cancel) return false; // a cancelled item is only under «الملغى»
    if (scope === 'stock') { const s = it.stock; return !!s && (num(s.packs) || 0) + (num(s.units) || 0) > 0; }
    if (scope === 'lists') return (it.offers || []).length > 0;
    if (scope === 'short') return !!it.short;
    return true;
  }
  const SCOPE_WORDS = { stock: 'في المخزون', lists: 'في القوايم', short: 'في النواقص', cancelled: 'في الملغى' };
  // a warehouse list priced differently from ours (owner 2026-11-15: «لو … سعره عندي جنيه، وفي حد في القوائم سعره جنيه وربع، تكتب
  // لي جنبه وفي القوائم مخزن كذا جنيه وربع»): the newest line of each warehouse whose price is not ours
  function listPriceText(it, ours) {
    const p = num(ours);
    if (!(p > 0)) return '';
    const seen = new Set(), diff = [];
    for (const x of [...(it.offers || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))) {
      const s = String(x.supplier || '').toUpperCase(), lp = num(x.price);
      if (seen.has(s) || !(lp > 0)) continue;
      seen.add(s);
      if (Math.abs(lp - p) >= 0.01) diff.push(supName(x.supplier) + ' ' + r2(lp) + ' ج');
    }
    return diff.length ? 'وفي القوايم ' + diff.join(' · ') : '';
  }
  // ---------- «🔁 بدائل» (owner 2026-11-28, after the drawing: «انا عاوز يظهر البدايل حتى لو فيه رصيد للصنف احيانا العميل حاجه بسعر اعلى او اقل») ----------
  // rows = ar_store_generic {item_id, gkey, confident, ingredients, form} (Store\generic\generic.txt, Store\generic\INGREDIENT.md): the same gkey = the same active
  // ingredients, strengths and form (an injection's key carries its route and pack too). The store shows only the sure ones; here an unsure one says «اتأكد».
  function buildSubs(rows) {
    const byItem = new Map(), byKey = new Map();
    for (const r of rows || []) {
      if (!r || r.item_id == null || !r.gkey) continue;
      const id = String(r.item_id);
      byItem.set(id, { gkey: String(r.gkey), sure: !!r.confident, ing: String(r.ingredients || ''), form: String(r.form || '') });
      if (!byKey.has(r.gkey)) byKey.set(String(r.gkey), []);
      byKey.get(String(r.gkey)).push(id);
    }
    return { byItem, byKey };
  }
  const stockOf = (it) => { const s = it && it.stock; return s ? (num(s.packs) || 0) + (num(s.units) || 0) : 0; };
  const priceOf = (it) => { const s = it && it.stock; return s && num(s.price) > 0 ? num(s.price) : it && num(it.price) > 0 ? num(it.price) : null; };
  // the alternatives of one item that have stock now, cheapest first (no price last), up to 8; diff = their price against this item's; sure = both lines checked
  function subsOf(it, subs, byId, max = 8) {
    if (!it || it.id == null || !subs || !byId) return [];
    const me = subs.byItem.get(String(it.id));
    if (!me) return [];
    const p0 = priceOf(it), out = [];
    for (const id of subs.byKey.get(me.gkey) || []) {
      if (id === String(it.id)) continue;
      const a = byId.get(id);
      if (!a || a.cancel || stockOf(a) <= 0) continue;
      const p = priceOf(a);
      out.push({ it: a, price: p, diff: p != null && p0 != null ? r2(p - p0) : null, sure: me.sure && subs.byItem.get(id).sure });
    }
    out.sort((x, y) => (x.price ?? Infinity) - (y.price ?? Infinity) || String(x.it.en).localeCompare(String(y.it.en)));
    return out.slice(0, max);
  }
  // «أرخص بـ 6 ج» / «أغلى بـ 86 ج» / «نفس السعر»
  const diffText = (d) => (d == null ? '' : d < 0 ? `أرخص بـ ${r2(-d)} ج` : d > 0 ? `أغلى بـ ${r2(d)} ج` : 'نفس السعر');
  const FORM_AR = { tab: 'أقراص', tab_mr: 'أقراص ممتدة المفعول', cap: 'كبسول', eff: 'فوار', sach: 'أكياس', syrup: 'شراب', susp: 'معلق', oral_drops: 'نقط بالفم', eye: 'للعين', ear: 'للودن',
    nasal: 'للأنف', cream: 'كريم', oint: 'مرهم', gel: 'جل', lotion: 'لوشن', spray_skin: 'سبراي', inhaler: 'بخاخ صدر', inj: 'حقن', supp: 'لبوس', vaginal: 'مهبلي', patch: 'لزقة', mouth: 'للفم', other: '' };
  // the key in words: «pantoprazole 40mg» + «أقراص»; an injection: «ceftriaxone 1g» + «حقن عضل»
  function subsWhy(m) {
    if (!m) return { ing: '', form: '' };
    const parts = m.ing.split(';').map((x) => x.trim());
    const route = (parts.find((x) => /^route /.test(x)) || '').replace(/^route /, '');
    const r = route === 'im' ? ' عضل' : route === 'iv' ? ' وريد' : route === 'sc' ? ' تحت الجلد' : '';
    return { ing: parts[0] || '', form: (FORM_AR[m.form] ?? m.form) + (m.form === 'inj' ? r : '') };
  }
  // «pantoprazole» typed: the items whose active ingredient has every typed English word (4 letters at least in all), one group per strength and form,
  // the groups with more stock first; in a group the items with stock first, then by price
  function ingredientGroups(q, subs, byId, maxGroups = 6) {
    const text = String(q || '');
    if (!subs || !byId || /[^\x00-\x7f]/.test(text)) return [];
    const words = text.toLowerCase().match(/[a-z]{3,}/g) || [];
    if (!words.length || words.join('').length < 4) return [];
    const groups = new Map();
    for (const [id, m] of subs.byItem) {
      const ws = m.ing.split(';')[0].toLowerCase().match(/[a-z]+/g) || [];
      if (!words.every((w) => ws.some((x) => x.startsWith(w)))) continue;
      const it = byId.get(id);
      if (!it || it.cancel) continue;
      if (!groups.has(m.gkey)) groups.set(m.gkey, { gkey: m.gkey, m, items: [], have: 0 });
      const g = groups.get(m.gkey);
      g.items.push(it);
      if (stockOf(it) > 0) g.have++;
    }
    for (const g of groups.values()) g.items.sort((a, b) => (stockOf(b) > 0) - (stockOf(a) > 0) || (priceOf(a) ?? Infinity) - (priceOf(b) ?? Infinity) || String(a.en).localeCompare(String(b.en)));
    return [...groups.values()].sort((a, b) => b.have - a.have || b.items.length - a.items.length || a.gkey.localeCompare(b.gkey)).slice(0, maxGroups);
  }
  const api = { buildIndex, marks, offersText, bestOffers, buysText, supName, shortDate, inScope, SCOPE_WORDS, offerRows, buysVsLists, listPriceText, parseCancel, cancelState, cancelWhy,
    buildSubs, subsOf, diffText, subsWhy, ingredientGroups };
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
  let cancelRows = null, cancelMap = null, cancelLoading = null; // «الملغى» (ar_item_cancel_sets + ar_item_cancel_restored): quiet when the tables are not there yet
  let subs = null, subsLoading = null; // «🔁 بدائل» (ar_store_generic): the owner and the staff the server lets read it; nobody else sees the box
  const subsOpen = new Set(); // the cards (in stock) whose «🔁 بدائل» he opened
  // the owner and the staff who may search read the cancelled lists; only the owner has «الملغى» and «ارجعه»
  const isOwner = () => !(root.AskerStaff && root.AskerStaff.isStaff && root.AskerStaff.isStaff());
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
    // each page with a time limit and one more try (ar/cache.js), so a weak line never holds the search
    const build = (a, z, opts) => () => orderBy.split(',').reduce((q, c) => q.order(c.trim(), { ascending: true }), db().from(table).select(cols, opts)).range(a, z);
    const page = (a, z, opts) => (root.AskerCache && root.AskerCache.limited ? root.AskerCache.limited(build(a, z, opts), 30000) : build(a, z, opts)());
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
  // every item of the system and the last purchases: the copy kept on this phone (ar/cache.js) at once, read again in
  // the background when it is older than 30 minutes (owner 2026-11-13 «بتغيب على ما تحمّل»)
  const FRESH_MS = 30 * 60 * 1000;
  const cache = () => root.AskerCache;
  async function keptOrRead(key, read, onFresh) {
    const copy = cache() ? await cache().get(key) : null;
    const reread = () => read().then((rows) => { cache() && cache().set(key, { at: Date.now(), rows }); return rows; });
    if (copy && Array.isArray(copy.rows) && copy.rows.length) {
      if (!(Date.now() - (copy.at || 0) < FRESH_MS)) reread().then(onFresh, () => {});
      return copy.rows;
    }
    return reread();
  }
  function keepCatalog() { if (catalog && cache()) cache().set('hs-catalog-v1', { at: Date.now(), rows: catalog }); }
  // the item that has exactly a PharmaFly name (owner 2026-11-21: the lists that carry only the NAME, like the shortages, show the item's photo too): nk(name) -> id; of two cards with the same name
  // the one that is not cancelled (parseCancel) wins, else the first. Rebuilt when the items or the cancelled lists arrive; the lists that looked ids up are told to draw again.
  let catIds = null;
  function indexIds() {
    if (!catalog) return;
    const L = root.AskerApp && root.AskerApp.lookup ? root.AskerApp.lookup() : null;
    const key = L && L.nk ? L.nk : (s) => String(s || '').toUpperCase().trim();
    const m = new Map(), spare = new Map();
    for (const r of catalog) {
      if (!r || r.id == null || !r.name) continue;
      const k = key(r.name), gone = !!(cancelMap && cancelMap.has(String(r.id)));
      if (gone) { if (!spare.has(k)) spare.set(k, r.id); } else if (!m.has(k)) m.set(k, r.id);
    }
    for (const [k, id] of spare) if (!m.has(k)) m.set(k, id);
    catIds = { m, key };
    if (root.AskerItemMedia && root.AskerItemMedia.refresh) root.AskerItemMedia.refresh();
  }
  const idOf = (name) => (catIds && name ? catIds.m.get(catIds.key(name)) ?? null : null);
  function loadCatalog() {
    if (catalog || catLoading || !db()) return;
    catLoading = keptOrRead('hs-catalog-v1', readCatalog, (all) => { catalog = all; indexIds(); draw(); })
      .then((all) => { catalog = all; catFail = ''; indexIds(); })
      .catch((e) => { catFail = 'أصناف السيستم ماتحمّلتش: ' + ((e && e.message) || e); })
      .finally(() => { catLoading = null; draw(); });
  }
  function loadBuys() {
    if (buys || buysLoading || !db()) return;
    buysLoading = keptOrRead('hs-buys-v1', () => readAll('ar_item_buys', 'item_id,supplier,last_date,discount_pct,bonus', 'item_id,supplier'), (all) => { buys = all; draw(); })
      .then((all) => { buys = all; })
      .catch(() => { buys = []; }) // not there yet (before its migration) or not readable: the cards just have no «آخر شرا»
      .finally(() => { buysLoading = null; draw(); });
  }
  // the laptop's cancelled lists (3 short rows of text) + the ids the owner put back: one small read, kept on the phone like the other lists
  async function readCancel() {
    const one = (table, cols) => (root.AskerCache && root.AskerCache.limited ? root.AskerCache.limited(() => db().from(table).select(cols), 30000) : db().from(table).select(cols));
    const s = await one('ar_item_cancel_sets', 'kind,ids');
    if (s.error) throw s.error;
    const rows = [...(s.data || [])];
    const r = await one('ar_item_cancel_restored', 'item_id');
    if (!r.error) rows.push({ kind: 'restored', ids: (r.data || []).map((x) => x.item_id).join(',') });
    return rows;
  }
  function keepCancel() { if (cancelRows && cache()) cache().set('hs-cancel-v1', { at: Date.now(), rows: cancelRows }); }
  // the kept copy shows at once, but the server is ALWAYS read too (it is a few short rows): an item the owner put back must never come back cancelled from an old copy
  function loadCancel() {
    if (cancelRows || cancelLoading || !db()) return;
    cancelLoading = (async () => {
      const copy = cache() ? await cache().get('hs-cancel-v1') : null;
      if (copy && Array.isArray(copy.rows) && copy.rows.length) { cancelRows = copy.rows; cancelMap = parseCancel(cancelRows); draw(); }
      const rows = await readCancel();
      cancelRows = rows; cancelMap = parseCancel(rows);
      keepCancel();
    })()
      .catch(() => { if (!cancelRows) { cancelRows = []; cancelMap = new Map(); } }) // not there yet (before its migration) or no line: the kept copy stays, else nothing is cancelled
      .finally(() => { cancelLoading = null; indexIds(); draw(); });
  }
  // the active ingredients (about 2,800 short rows), kept on the phone like the items; not readable (staff without the right) = no box, quietly
  function loadSubs() {
    if (subs || subsLoading || !db()) return;
    subsLoading = keptOrRead('hs-subs-v1', () => readAll('ar_store_generic', 'item_id,gkey,confident,ingredients,form', 'item_id'), (all) => { subs = buildSubs(all); draw(); })
      .then((all) => { subs = buildSubs(all); })
      .catch(() => { subs = buildSubs([]); })
      .finally(() => { subsLoading = null; draw(); });
  }
  // «الملغى» is the owner's button (staff never see it)
  function showScopeChip() { const b = document.querySelector('#hsScope [data-scope="cancelled"]'); if (b) b.classList.toggle('hidden', !isOwner()); }
  function loadLines() {
    if (lines || linesLoading || !root.AskerSuppliers || !root.AskerSuppliers.lines) return;
    linesLoading = root.AskerSuppliers.lines()
      .then((all) => { lines = all; linesFail = ''; })
      .catch((e) => { linesFail = 'قوايم المخازن ماتحمّلتش: ' + ((e && e.message) || e); })
      .finally(() => { linesLoading = null; draw(); });
  }
  // the item sheet (ar/item-media.js) fixed an Arabic name: the card, the kept rows and the search words follow at once
  root.addEventListener && root.addEventListener('asker-item-name', (e) => {
    const d = e.detail || {};
    if (d.id == null) return;
    const it = index && index.items.find((x) => String(x.id) === String(d.id));
    if (it) { it.ar = d.ar || ''; it._h = [fz().fold(it.ar), fz().fold(it.en)]; it._s = fz().arabize ? fz().fold(fz().arabize(it.en)) : ''; }
    const c = catalog && catalog.find((r) => String(r.id) === String(d.id));
    if (c) { c.arabic_name = d.ar || ''; keepCatalog(); }
    if (it && it.stock) it.stock.arabic_name = d.ar || '';
    draw();
  });
  // a fixed photo or a written active ingredient (item sheet): the cards on screen are drawn again
  if (root.AskerItemMedia && root.AskerItemMedia.onChange) root.AskerItemMedia.onChange(() => draw());
  // the lists newer than the kept copy arrived in the background (ar/suppliers.js)
  root.addEventListener && root.addEventListener('asker-lines', (e) => { if (Array.isArray(e.detail)) { lines = e.detail; draw(); } });
  // ready before the first search: start reading (the kept copies, then the server) a moment after the bot opens
  let preloaded = false;
  function preload() {
    if (preloaded || !db() || !$('app') || $('app').classList.contains('hidden')) return;
    if (root.AskerStaff && root.AskerStaff.isStaff && root.AskerStaff.isStaff() && !(root.AskerStaff.can && root.AskerStaff.can('search'))) return;
    preloaded = true;
    showScopeChip();
    loadCatalog(); loadLines(); loadBuys(); loadCancel(); loadSubs(); askStock();
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
    const src = [catalog, stock, lines, buys, cancelMap, L.shortages, L.knownNames, L.orders];
    if (index && built && src.every((x, i) => x === built[i])) return index;
    built = src;
    index = buildIndex({ items: catalog || [], stock, lines: lines || [], buys: buys || [], cancel: cancelMap, shortages: L.shortages, names: L.knownNames, orders: L.orders, nk: L.nk, sure: root.AskerSuppliers && root.AskerSuppliers.sure, fold: fz().fold, arabize: fz().arabize });
    return index;
  }
  const PEN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function publicPrice(it) {
    const s = it.stock;
    if (s && Number(s.price) > 0) return Number(s.price);
    if (Number(it.price) > 0) return Number(it.price);
    const o = [...(it.offers || [])].filter((x) => Number(x.price) > 0).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    return o ? Number(o.price) : null;
  }
  // «💊 ديكلوفيناك بوتاسيوم ٥٠ مجم» under the name: the active ingredient he wrote in the item sheet (owner 2026-11-21)
  function activeLine(it) {
    const a = root.AskerItemMedia && it.id != null && root.AskerItemMedia.active ? root.AskerItemMedia.active(it.id) : '';
    return a ? `<div class="hs-act" translate="no">💊 ${esc(a)}</div>` : '';
  }
  // the card follows the button under the box (owner 2026-11-13): «المخزون» = the pharmacy only (no warehouse, no «آخر شرا»);
  // «القوايم» = the warehouses only (one row each with the discount difference, «آخر شرا» against today; no stock)
  function card(it) {
    const lib = stockLib();
    const lists = scope === 'lists', pharmacy = scope === 'stock';
    const tags = marks(it, lib.qtyText).filter((m) => !lists || m.kind === 'bad' || m.kind === 'warn').map((m) => `<span class="tag ${m.kind}">${esc(m.text)}</span>`).join('')
      + (it.cancel ? `<span class="tag warn">${esc(cancelWhy(it))}</span>` : ''); // under «الملغى»: why it is there
    const s = lists ? null : it.stock;
    // the public price in every view, «القوايم» too (owner 2026-11-15: «السعر الجمهور ما بيظهرش في كارت الصنف … انا ببحث اعرف
    // سعره»): the pharmacy's price, else the store's, else the newest warehouse list's
    const price = publicPrice(it);
    const more = [s && lib.expText ? lib.expText(s.exp_near) : '', price > 0 ? 'سعر الجمهور ' + Math.round(price * 100) / 100 + ' ج' : ''].filter(Boolean).join(' · ');
    // our price against the warehouses' lists: only when a list says another price
    const ourPrice = it.stock && Number(it.stock.price) > 0 ? Number(it.stock.price) : Number(it.price) > 0 ? Number(it.price) : null;
    const listPrice = listPriceText(it, ourPrice);
    const others = s && lib.otherText ? lib.otherText(s.other, s.parts).map((t) => `<div class="st-other">${esc(t)}</div>`).join('') : '';
    const offers = pharmacy || lists ? '' : offersText(it), bought = pharmacy ? '' : lists ? buysVsLists(it) : buysText(it);
    const table = lists ? offerRows(it).map((r) => `<tr class="${r.best ? 'best' : ''}"><td>${esc(r.name)}${r.best ? ' ✓ الأعلى' : ''}${r.less != null ? ` <span class="less">(أقل ${r.less}%)</span>` : ''}</td><td class="d">${r.disc != null ? r.disc + '%' : '—'}</td></tr>`).join('') : '';
    return `<div class="hs-item" data-k="${esc(it.key)}">
      <div class="hs-top">
        ${root.AskerItemMedia && it.id != null ? root.AskerItemMedia.thumb(it.id, it.en, it.ar || it.en) : ''}
        <div class="hs-names"><strong>${esc(it.ar || it.en)}</strong>${it.ar && it.en ? `<div class="hs-en" dir="ltr">${esc(it.en)}</div>` : ''}${activeLine(it)}</div>
        <button type="button" class="hs-pen" data-edit aria-label="عدّل الاسم العربي" title="عدّل الاسم العربي">${PEN}</button>
      </div>
      ${tags ? `<div class="hs-tags">${tags}</div>` : ''}
      ${others}
      ${more ? `<div class="hint">${esc(more)}</div>` : ''}
      ${listPrice ? `<div class="hs-listprice">${esc(listPrice)}</div>` : ''}
      ${table ? `<table class="hs-offers-t">${table}</table>` : ''}
      ${bought ? `<div class="hs-buys">${esc(bought)}</div>` : ''}
      ${offers ? `<div class="hs-offers">${esc(offers)}</div>` : ''}
      ${subsBox(it)}
      ${appsRow(it)}
      ${actionsRow(it)}
    </div>`;
  }
  // one alternative (or one item of an ingredient group): name, stock, price, and against the item he looks at «أرخص بـ / أغلى بـ»; a tap opens its card
  function subRow(x) {
    const lib = stockLib(), n = stockOf(x.it);
    const q = n > 0 ? (lib.qtyText ? lib.qtyText(x.it.stock.packs, x.it.stock.units, x.it.stock.parts) : String(n)) : 'ملوش رصيد';
    const d = diffText(x.diff);
    return `<button type="button" class="hs-sub" data-sub="${esc(x.it.id)}"><span class="hs-sub-n" dir="ltr">${esc(x.it.en || x.it.ar)}</span>` +
      `<span class="hs-sub-q${n > 0 ? '' : ' zero'}">${esc(q)}</span><span class="hs-sub-p">${x.price != null ? esc(r2(x.price) + ' ج') : '—'}</span>` +
      (d ? `<span class="hs-sub-d ${x.diff < 0 ? 'lo' : x.diff > 0 ? 'hi' : ''}">${esc(d)}</span>` : '') + (x.sure ? '' : '<span class="tag warn">اتأكد</span>') + '</button>';
  }
  const whyLine = (m) => { const w = subsWhy(m); return `<div class="hs-subs-w"><span dir="ltr" translate="no">${esc(w.ing)}</span>${w.form ? ` · <span>${esc(w.form)}</span>` : ''}</div>`; };
  // «🔁 بدائل»: open under an item with no stock; a button «🔁 بدائل (3)» under an item in stock (owner 2026-11-28: a customer may want a cheaper or a dearer one)
  function subsBox(it) {
    if (scope === 'lists' || scope === 'cancelled' || !subs || !index) return '';
    const list = subsOf(it, subs, index.byId);
    if (!list.length) return '';
    const inStock = stockOf(it) > 0, open = !inStock || subsOpen.has(it.key);
    if (!open) return `<div class="hs-subs-c"><button type="button" class="chip" data-subs>🔁 بدائل (${list.length})</button></div>`;
    return `<div class="hs-subs"><div class="hs-subs-h">🔁 بدائل عندك رصيدها</div>${whyLine(subs.byItem.get(String(it.id)))}` +
      list.map(subRow).join('') + '<div class="hs-subs-f">نفس المادة والتركيز والشكل · القرار للصيدلي</div>' +
      (inStock ? '<button type="button" class="chip hs-subs-x" data-subs>اقفل البدائل</button>' : '') + '</div>';
  }
  // «💊 بالمادة الفعالة» on top of the cards when the typed English words are an active ingredient (pantoprazole, para…)
  function ingBlock(q) {
    if (scope === 'lists' || scope === 'cancelled' || !subs || !index) return '';
    const gs = ingredientGroups(q, subs, index.byId);
    if (!gs.length) return '';
    return '<div class="hs-ing"><div class="hs-subs-h">💊 بالمادة الفعالة</div>' + gs.map((g) => `<div class="hs-ing-g">${whyLine(g.m)}` +
      (g.have ? `<div class="hs-ing-n"><span class="tag good">${g.have} عندك</span></div>` : '') +
      g.items.slice(0, 12).map((it) => subRow({ it, price: priceOf(it), diff: null, sure: g.m.sure })).join('') + '</div>').join('') +
      '<div class="hs-subs-f">نفس المادة والتركيز والشكل · القرار للصيدلي</div></div>';
  }
  // «⚙️ عمليات وتقارير» (owner 2026-11-20, ar/item-actions.js): the item's reports and operations, for any item that has a PharmaFly code (in stock or not); not for staff (phase 1)
  function actionsRow(it) {
    if (root.AskerStaff && root.AskerStaff.isStaff && root.AskerStaff.isStaff()) return '';
    if (it.id == null) return '<div class="hs-ia"><button type="button" class="chip" disabled>⚙️ عمليات وتقارير</button> <small class="hint">الصنف ده لسه مش متسجل في فارما فلاي</small></div>';
    return `<div class="hs-ia"><button type="button" class="chip on" data-ia>⚙️ عمليات وتقارير</button>${it.cancel ? '<button type="button" class="chip on" data-restore>↩️ ارجعه</button>' : ''}</div>`;
  }
  // «ارجعه» (owner): the item goes back to the search for good (ar_item_cancel_restored); the laptop's lists never take it again
  async function restoreItem(it, btn) {
    btn.disabled = true;
    const { error } = await db().from('ar_item_cancel_restored').upsert({ item_id: Number(it.id) }, { onConflict: 'item_id', ignoreDuplicates: true });
    if (error) { btn.disabled = false; return say('ماترجعش: ' + (error.message || error), 'bad'); }
    const prev = (cancelRows || []).find((r) => r.kind === 'restored');
    const ids = new Set(String((prev && prev.ids) || '').split(',').filter(Boolean));
    ids.add(String(it.id));
    cancelRows = [...(cancelRows || []).filter((r) => r.kind !== 'restored'), { kind: 'restored', ids: [...ids].join(',') }];
    cancelMap = parseCancel(cancelRows);
    keepCancel();
    draw();
    say('«' + (it.ar || it.en) + '» رجع للبحث', 'good');
  }
  // «دراج آي» / «الجرعات» on the phone (owner 2026-11-19, ar/work-apps.js): the item's trade name is copied and the app opens (Android only)
  function appsRow(it) {
    const W = root.AskerWorkApps;
    if (!W || !W.android() || !it.en) return '';
    const b = esc(W.brandOf(it.en));
    return `<div class="hs-apps"><button type="button" class="chip" data-app="drugeye" data-copy="${b}" data-copy-what="اسم الصنف">👁️ دراج آي</button>` +
      `<button type="button" class="chip" data-app="doses" data-copy="${b}" data-copy-what="اسم الصنف">🧮 الجرعات</button></div>`;
  }
  function editor(it) {
    return `<div class="hs-editbox">
      <label for="hsAr">الاسم العربي</label>
      <input id="hsAr" type="text" maxlength="250" dir="rtl" value="${esc(it.ar)}" placeholder="اكتب الاسم الصح بالعربي" />
      <div class="hs-editrow"><button type="button" data-save>احفظ الاسم</button><button type="button" class="secondary" data-cancel>إلغاء</button></div>
      <p class="hint">التصليح بيظهر في النواقص والمخزون والموقع، وبيساعد السيستم يفهم رسايل المخازن. فاضي = يرجع للاسم التلقائي.</p>
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
    if (!on) { $('hsItems').innerHTML = ''; $('hsLinesBox').classList.add('hidden'); $('hsCx')?.classList.add('hidden'); editing = null; return say(''); }
    if (editing && document.activeElement && document.activeElement.id === 'hsAr') return; // never wipe what is being typed
    showScopeChip();
    loadCatalog(); loadLines(); loadBuys(); loadCancel(); loadSubs(); askStock();
    if (scope === 'cancelled' && !isOwner()) scope = 'all';
    const ix = currentIndex();
    // «الكل» and the other buttons leave the cancelled items out; «الملغى» (owner) holds only them
    const pool = scope === 'cancelled' ? ix.gone : scope === 'all' ? ix.visible : ix.visible.filter((it) => inScope(it, scope));
    // only the names close to the best one (owner 2026-11-13: «Abimol» filled 25 cards with ALFABRIMO, CARBIMAZOLE…)
    const hits0 = fz().rank(q, pool, (it) => it._h, 25, { rel: 0.75 });
    // an Arabic word (typed or SAID, owner 2026-11-22) also meets English-only names written in Arabic letters: after the usual hits, and strict (inside one word, no letter forgiven)
    const hits = /[؀-ۿ]/.test(q) && hits0.length < 25 ? hits0.concat(fz().rank(q, pool.filter((it) => it._s && !hits0.includes(it)), (it) => [it._s], 25 - hits0.length, { strict: true })) : hits0;
    // the warehouses' lines that are not surely one of our items belong to «الكل» and «القوايم»
    // strict: each word inside one word of the line, no letter forgiven, and close enough (owner 2026-11-13: «ابيمول» showed
    // «اب كير امبول»: «اصناف تانية غريبة كده ملهاش علاقة بيه»)
    const extra = lines && (scope === 'all' || scope === 'lists') ? fz().rank(q, ix.extra, (l) => l._h, 10, { strict: true, min: 0.6 }) : [];
    shown = new Map(hits.map((it) => [it.key, it]));
    const ing = ingBlock(q);
    $('hsItems').innerHTML = ing + hits.map(card).join('');
    // the owner is told when the same name has cancelled items too (so a missing item is never taken for «not in the system»)
    const cx = $('hsCx');
    if (cx) {
      const n = isOwner() && scope !== 'cancelled' && ix.gone.length ? fz().rank(q, ix.gone, (it) => it._h, 25, { rel: 0.75 }).length : 0;
      cx.classList.toggle('hidden', !n);
      cx.textContent = n ? `وفيه ${n} في «الملغى» بالاسم ده · شوفهم` : '';
    }
    if (editing && shown.has(editing)) openEditor(editing);
    $('hsLines').innerHTML = extra.map(line).join('');
    $('hsLinesBox').classList.toggle('hidden', !extra.length);
    const age = root.AskerStock && scope !== 'lists' ? root.AskerStock.age() : ''; // «القوايم» = the warehouses only
    const wait = [catLoading ? 'بحمّل كل أصناف السيستم…' : catFail, linesLoading ? 'بحمّل قوايم المخازن…' : linesFail].filter(Boolean).join(' · ');
    const where = SCOPE_WORDS[scope] || '';
    if (!hits.length && !extra.length && !ing) return say(wait || (where ? `مفيش صنف بالاسم ده ${where}. دوس «الكل» تدوّر في كله.` : 'مفيش صنف بالاسم ده.'), catFail || linesFail ? 'bad' : '');
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
    it._h = [fz().fold(it.ar), fz().fold(it.en)]; it._s = fz().arabize ? fz().fold(fz().arabize(it.en)) : '';
    const c = catalog && catalog.find((r) => String(r.id) === String(it.id));
    if (c) { c.arabic_name = shownName; keepCatalog(); } // the kept copy shows the fixed name next time too
    if (it.stock) it.stock.arabic_name = shownName;
    msg.textContent = '';
    return shownName;
  }
  function bind() {
    const box = $('hsQ');
    if (!box) return;
    // a moment after the bot opens (signed in), the search's lists start loading by themselves
    let tries = 0;
    const warm = setInterval(() => { tries++; setTimeout(preload, 0); if (preloaded || tries > 60) clearInterval(warm); }, 2000);
    box.addEventListener('input', () => { editing = null; clearTimeout(timer); timer = setTimeout(draw, 220); });
    $('hsClear')?.addEventListener('click', () => { box.value = ''; editing = null; draw(); box.focus(); });
    const pickScope = (name) => {
      const b = $('hsScope').querySelector(`[data-scope="${name}"]`);
      if (!b) return;
      scope = name;
      $('hsScope').querySelectorAll('[data-scope]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
      editing = null;
      draw();
      if (!box.value) box.focus();
    };
    $('hsScope')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-scope]');
      if (b) pickScope(b.dataset.scope);
    });
    $('hsCx')?.addEventListener('click', () => pickScope('cancelled')); // «وفيه 5 في «الملغى» بالاسم ده · شوفهم»
    $('hsItems')?.addEventListener('click', async (e) => {
      // an alternative (or an item of an ingredient group): its own card comes up, by its name in the box
      const sub = e.target.closest('[data-sub]');
      if (sub) {
        const a = index && index.byId.get(String(sub.dataset.sub));
        if (a) { box.value = a.en || a.ar; editing = null; draw(); $('hsQ')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }
        return;
      }
      const cardEl = e.target.closest('[data-k]');
      if (!cardEl) return;
      const key = cardEl.dataset.k, it = shown.get(key);
      if (!it) return;
      if (e.target.closest('[data-subs]')) { if (subsOpen.has(key)) subsOpen.delete(key); else subsOpen.add(key); cardEl.outerHTML = card(it); return; }
      if (e.target.closest('[data-ia]')) { if (root.AskerItemActions) root.AskerItemActions.open(it); return; }
      const back = e.target.closest('[data-restore]');
      if (back) return restoreItem(it, back);
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
  root.AskerHome = { draw, close, open: () => {}, idOf };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
