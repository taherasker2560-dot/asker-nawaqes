/* «⚙️ عمليات وتقارير» on an item's card in the search (owner 2026-11-20: «زرار في كارت الصنف في البحث ادوس عليه يفتحلي قايمة عمليات اعملها عالصنف بعدين تتنفذ بالريموت على السيستم
   وتقارير استقصائية زي حركة الصنف تفصيلية وتاريخية وحركة مشتريات الصنف … لما يظهر فاتورة معينة مشتريات او مبيعات ادوس عليها يفتحلي الفاتورة … جرد وطباعة باركود»;
   mockup mockups/item_card_actions_2026-11-20.png). A sheet over the page, for any item that has a PharmaFly code (in stock or not), owner only (phase 1):
   - «📈 حركة الصنف» (all), «🛒 المشتريات», «🧾 المبيعات»: one list, newest first: purchases and purchase returns (ar_vendor_moves since 2018, ar_vendor_item_moves) and sales and
     sale returns (ar_sales: the last 12 months, ar_sales_list); filters all / purchases / sales / returns and last month / last year / all; a tap on a row opens the whole invoice
     (a sale ticket with its lines and names; a purchase invoice with its lines, discounts, expiries and the balance after it).
   - «📅 المبيعات الشهرية» (owner 2026-11-20, «أ»): a line a month per item since 2018 (ar_item_sales_monthly, migration 202611202300, filled once a day by the laptop's Store\SYNC_ITEM_SALES.ps1):
     packs sold, returned, value, invoices; a block per year (the latest two open), a bar against the item's busiest month; a month with no sale is a row of zeros.
   - «📋 جرد»: opens the existing count screen (ar/count.js) on this item (items with stock in PharmaFly only: the count works on what the system holds).
   - «🏷️ طباعة باركود»: records the operation (ar_item_ops, migration 202611202100) with the number of labels: it waits as «مستنية» in «الحسابات ← العمليات» (cancel there) until the laptop carries it
     out on PharmaFly's own screens (a later phase). Nothing here writes to PharmaFly or prints. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/item-actions.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const pad = (n) => String(n).padStart(2, '0');
  function money(n) {
    const v = Math.abs(num(n)) < 0.005 ? 0 : num(n);
    const frac = Math.abs(v % 1) > 0.005;
    return v.toLocaleString('en-US', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  }
  // «2026-11-18T12:00:00» → «18/11/2026»
  function dmy(s) { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
  const expText = (x) => { const m = /^(\d{4})-(\d\d)/.exec(String(x || '')); return m ? `${m[2]}/${m[1]}` : '—'; };
  const r2 = (n) => Math.round(num(n) * 100) / 100;
  // a purchase line in words: «10 + 1 بونص», «2 وحدة»
  function buyQty(l) {
    const p = r2(l && l.p), u = r2(l && l.u), b = r2(l && l.b), bits = [];
    if (p) bits.push(String(p));
    if (u) bits.push(`${u} وحدة`);
    let s = bits.join(' + ') || '0';
    if (b) s += ` + ${b} بونص`;
    return s;
  }
  // a sale line in words: «2 علبة», «3 وحدة», «2 علبة + 3 وحدة»
  function saleQty(l) {
    const p = r2(l && l.p), u = r2(l && l.u), bits = [];
    if (p) bits.push(`${p} علبة`);
    if (u) bits.push(`${u} وحدة`);
    return bits.join(' + ') || '0';
  }
  // a purchase line is worth (packs + units / units in a pack) × the pack's cost; a sale line (packs + units / units in a pack) × the pack's price − the line discount
  const buyValue = (l) => (num(l.p) + num(l.u) / (num(l.k) > 0 ? num(l.k) : 1)) * num(l.c);
  const saleValue = (l) => (num(l.p) + num(l.u) / (num(l.k) > 0 ? num(l.k) : 1)) * num(l.s) - num(l.d);
  const KINDS = { buy: 'شراء', buyret: 'مرتجع شراء', cash: 'بيع نقدي', credit: 'بيع آجل', saleret: 'مرتجع بيع' };
  const PILL = { buy: 'buy', buyret: 'ret', cash: 'sale', credit: 'sale', saleret: 'ret' };
  // the tab's meaning: which sources and which kinds it shows
  const TABS = [['all', 'الكل'], ['buy', 'مشتريات'], ['sale', 'مبيعات'], ['ret', 'مرتجعات']];
  const PERIODS = [['month', 'آخر شهر'], ['year', 'آخر سنة'], ['all', 'من 2018']];
  const keepKind = (tab, kind) => tab === 'all' || (tab === 'buy' && kind === 'buy') || (tab === 'sale' && (kind === 'cash' || kind === 'credit')) || (tab === 'ret' && (kind === 'buyret' || kind === 'saleret'));
  // the date a period starts at (as the server's timestamp text), or null = from the beginning
  function periodFrom(period, now) {
    const days = period === 'month' ? 30 : period === 'year' ? 365 : 0;
    if (!days) return null;
    const d = new Date((now || new Date()).getTime() - days * 864e5);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00`;
  }
  // a row of the report from a purchase / purchase-return move (ar_vendor_item_moves): `line` is the item's own line of the invoice
  function buyRow(m, vendorName) {
    const l = m.line || {};
    return { key: 'b' + m.id, src: 'buy', id: m.id, at: String(m.at || ''), kind: m.kind === 'return' ? 'buyret' : 'buy', party: vendorName || '', code: m.code || '',
      qty: buyQty(l), line: l, price: l.c != null ? r2(l.c) : null, disc: l.t != null ? r2(l.t) : null, exp: l.x || null };
  }
  // a row from a sale / return ticket (ar_sales_list: the whole ticket with names); `mine` = the lines that are this item
  function saleRow(s, itemId) {
    const lines = Array.isArray(s.lines) ? s.lines : [], mine = lines.filter((l) => String(l.i) === String(itemId));
    const kind = s.kind === 'return' ? 'saleret' : s.customer_id != null ? 'credit' : 'cash';
    const first = mine[0] || {};
    return { key: 's' + s.id, src: 'sale', id: s.id, at: String(s.at || ''), kind, party: s.customer || (s.customer_id != null ? '#' + s.customer_id : 'نقدي'), code: String(s.id),
      qty: mine.length ? mine.map(saleQty).join(' + ') : '', price: first.s != null ? r2(first.s) : null, total: num(s.total), lines, mine };
  }
  // newest first; the same moment: the higher id first
  const newer = (a, b) => (a.at === b.at ? num(b.id) - num(a.id) : a.at < b.at ? 1 : -1);
  const PAGE = 50;
  // a source read page by page, newest first: fetchPage(beforeId) → Promise<rows>; `keep` filters what the tab shows; `stop(row)` ends it (older than the period)
  function makeStream(fetchPage, keep, stop) {
    const s = { buf: [], done: false, before: null };
    s.fill = async () => {
      if (s.done) return;
      const rows = (await fetchPage(s.before)) || [];
      if (rows.length) s.before = rows[rows.length - 1].id;
      if (rows.length < PAGE) s.done = true;
      for (const r of rows) {
        if (stop && stop(r)) { s.done = true; break; }
        if (!keep || keep(r)) s.buf.push(r);
      }
    };
    return s;
  }
  // up to n rows of several streams merged newest first (a stream is read again only when its buffer is empty)
  async function takeMerged(streams, n) {
    const out = [];
    while (out.length < n) {
      for (const s of streams) if (!s.buf.length && !s.done) await s.fill();
      const heads = streams.filter((s) => s.buf.length);
      if (!heads.length) break;
      heads.sort((x, y) => newer(x.buf[0], y.buf[0]));
      out.push(heads[0].buf.shift());
    }
    return out;
  }
  const hasMore = (streams) => streams.some((s) => s.buf.length || !s.done);
  // how many labels he typed (Arabic digits read): 1 to 500, else NaN
  function parseCopies(s) {
    const t = String(s ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();
    if (!/^\d{1,3}$/.test(t)) return NaN;
    const n = Number(t);
    return n >= 1 && n <= 500 ? n : NaN;
  }
  // ---- the monthly sales (ar_item_sales_monthly, one row per item: {"2018-03": [packs sold, packs returned, value, invoices], ...}) ----
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  // the years newest first, each with its months newest first and its totals. From the item's first month to the current month (or its last month if later) every month has a row:
  // a month with no sale is a row of zeros, so «nothing sold» is not mistaken for «not loaded».
  function byYear(months, now) {
    const keys = Object.keys(months && typeof months === 'object' && !Array.isArray(months) ? months : {}).filter((k) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k) && Array.isArray(months[k])).sort();
    if (!keys.length) return [];
    const d = now || new Date(), cur = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const last = keys[keys.length - 1] > cur ? keys[keys.length - 1] : cur;
    const [fy, fm] = keys[0].split('-').map(Number), [ly, lm] = last.split('-').map(Number);
    const years = [];
    for (let y = ly; y >= fy; y--) {
      const g = { year: y, rows: [], tot: { s: 0, r: 0, v: 0, n: 0 } };
      for (let m = (y === ly ? lm : 12); m >= (y === fy ? fm : 1); m--) {
        const a = months[`${y}-${pad(m)}`] || [], row = { ym: `${y}-${pad(m)}`, month: m, s: num(a[0]), r: num(a[1]), v: num(a[2]), n: num(a[3]) };
        g.rows.push(row);
        for (const k of ['s', 'r', 'v', 'n']) g.tot[k] += row[k];
      }
      for (const k of ['s', 'r', 'v']) g.tot[k] = r2(g.tot[k]);
      years.push(g);
    }
    return years;
  }
  const grandTotal = (years) => { const t = { s: 0, r: 0, v: 0, n: 0 }; for (const g of years) for (const k of ['s', 'r', 'v', 'n']) t[k] += g.tot[k]; for (const k of ['s', 'r', 'v']) t[k] = r2(t[k]); return t; };
  const maxSold = (years) => years.reduce((m, g) => g.rows.reduce((x, r) => Math.max(x, r.s), m), 0);
  // a bar's width in percent: the month's packs against the busiest month of the item; a small stub when something sold, nothing when not
  const barPct = (s, max) => (max > 0 && s > 0 ? Math.max(3, Math.min(100, Math.round((s / max) * 100))) : 0);
  // «2026-11-20T18:30:00+00:00» → «20/11/2026» in the viewer's own time
  function localDmy(iso) { const t = new Date(iso); return Number.isNaN(t.getTime()) ? '' : `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}`; }
  const api = { money, dmy, expText, buyQty, saleQty, buyValue, saleValue, KINDS, PILL, TABS, PERIODS, keepKind, periodFrom, buyRow, saleRow, newer, makeStream, takeMerged, hasMore, parseCopies, PAGE, MONTHS, byYear, grandTotal, maxSold, barPct, localDmy };
  root.AskerItemActionsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the sheet ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const missing = (e) => /schema cache|does not exist|Could not find/i.test(String(e && (e.message || e)));
  const ownerHere = () => !(root.AskerStaff && root.AskerStaff.isStaff && root.AskerStaff.isStaff());
  // st: the open item: {item:{id,en,ar}, view:'menu'|'move', tab, period, rows, streams, busy, open:Set, inv:Map, msg, copies}
  let st = null, seq = 0;
  const vendors = new Map(), names = new Map();
  const title = (it) => it.ar || it.en || '#' + it.id;

  function ensureSheet() {
    let el = $('iaSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'iaSheet';
    el.className = 'ia-sheet hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="ia-box"><div class="ia-head"><b id="iaTitle" class="notr"></b><button type="button" class="secondary small" data-ia-close aria-label="إغلاق">✕</button></div><div id="iaBody"></div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    el.addEventListener('input', (e) => { if (e.target.id === 'iaCopies' && st) st.copies = e.target.value; });
    el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-ia-row]')) { e.preventDefault(); e.target.click(); } });
    return el;
  }
  function open(it) {
    if (!it || it.id == null || !ownerHere()) return;
    st = { item: { id: it.id, en: it.en || '', ar: it.ar || '' }, view: 'menu', tab: 'all', period: 'year', rows: [], streams: [], busy: false, open: new Set(), inv: new Map(), msg: '', copies: '10', ok: false };
    ensureSheet().classList.remove('hidden');
    document.body.classList.add('ia-lock');
    draw();
  }
  function close() { st = null; seq++; const el = $('iaSheet'); if (el) el.classList.add('hidden'); document.body.classList.remove('ia-lock'); }

  function menuHtml() {
    return '<h2 class="ia-h">📊 تقارير</h2>' +
      '<button type="button" class="ia-tile" data-ia-go="all"><i>📈</i><span><b>حركة الصنف</b><small>مشتريات ومبيعات ومرتجعات بالتاريخ، وتدوس على الفاتورة تتفتح</small></span></button>' +
      '<button type="button" class="ia-tile" data-ia-go="buy"><i>🛒</i><span><b>حركة المشتريات</b><small>كل شراء: الشركة، الفاتورة، الكمية والبونص، الخصم، الصلاحية</small></span></button>' +
      '<button type="button" class="ia-tile" data-ia-go="sale"><i>🧾</i><span><b>حركة المبيعات</b><small>كل بيعة: التذكرة، الكمية، السعر، نقدي ولا آجل</small></span></button>' +
      '<button type="button" class="ia-tile" data-ia-monthly><i>📅</i><span><b>المبيعات الشهرية</b><small>كام اتباع من الصنف كل شهر من 2018، سنة بسنة</small></span></button>' +
      '<h2 class="ia-h">⚙️ عمليات على الصنف</h2>' +
      '<button type="button" class="ia-tile op" data-ia-count><i>📋</i><span><b>جرد</b><small>تسجّل اللي لقيته لكل صلاحية (للصنف اللي عليه رصيد)</small></span></button>' +
      `<div class="ia-tile op ia-bar"><i>🏷️</i><span><b>طباعة باركود</b><small>عدد الملصقات:</small></span><input id="iaCopies" type="text" inputmode="numeric" maxlength="3" value="${esc(st.copies)}" aria-label="عدد الملصقات" /><button type="button" class="py-p small" data-ia-barcode${st.busy ? ' disabled' : ''}>سجّل</button></div>` +
      (st.msg ? `<p class="status ${st.ok ? 'good' : 'bad'}" id="iaMsg">${esc(st.msg)}</p>` : '') +
      '<p class="hint">العملية بتتسجّل في «الحسابات ← العمليات» بحالة «مستنية» وتقدر تلغيها هناك. بتتنفذ على فارما فلاي بالريموت لما نخلّص ربط الشاشة دي.</p>';
  }
  // the quantity as pieces the English page can translate one by one: «10 + 1 بونص» = 10 · «+ 1» bonus; «2 علبة + 3 وحدة»
  function qtyHtml(l, sale) {
    const p = r2(l && l.p), u = r2(l && l.u), b = r2(l && l.b), bits = [];
    const n = (x) => `<bdi class="notr">${esc(x)}</bdi>`;
    if (p) bits.push(sale ? `${n(p)} <span>علبة</span>` : n(p));
    if (u) bits.push(`${n(u)} <span>وحدة</span>`);
    if (!bits.length) bits.push(n(0));
    return bits.join(' + ') + (!sale && b ? ` + ${n(b)} <span>بونص</span>` : '');
  }
  const lab = (word, val) => `<span>${esc(word)}</span> <bdi class="notr" dir="ltr">${esc(val)}</bdi>`;
  function rowHtml(r) {
    const open = st.open.has(r.key), buy = r.src === 'buy';
    const mine = buy ? [qtyHtml(r.line, false)] : (r.mine || []).map((l) => qtyHtml(l, true));
    const second = [r.code ? lab(buy ? 'رقم الفاتورة' : 'رقم التذكرة', r.code) : '', ...mine, r.price != null ? lab(buy ? 'التكلفة' : 'السعر', money(r.price)) : '',
      r.disc != null ? lab('الخصم', money(r.disc) + '%') : '', r.exp ? lab('الصلاحية', expText(r.exp)) : ''].filter(Boolean);
    return `<div class="ia-mv${open ? ' open' : ''}" data-ia-row="${esc(r.key)}" role="button" tabindex="0"><div class="ia-l1"><span class="ia-pill ${PILL[r.kind]}">${esc(KINDS[r.kind])}</span>${r.kind === 'cash' ? '<b dir="auto"><span>نقدي</span></b>' : `<b class="notr" dir="auto">${esc(r.party)}</b>`}<span class="ia-d">${esc(dmy(r.at))}</span></div>` +
      `<div class="ia-l2">${second.join(' · ')}</div>${open ? invoiceHtml(r) : ''}</div>`;
  }
  // the whole invoice: a sale ticket with the lines it came with; a purchase invoice read when opened
  function invoiceHtml(r) {
    if (r.src === 'sale') {
      const rows = r.lines.map((l) => `<tr class="${String(l.i) === String(st.item.id) ? 'me' : ''}"><td><span class="notr" dir="ltr">${esc(l.n || '#' + l.i)}</span>${l.a ? `<small class="notr">${esc(l.a)}</small>` : ''}</td><td>${esc(saleQty(l))}</td><td class="n" dir="ltr">${esc(money(l.s))}</td><td class="n" dir="ltr">${num(l.d) ? esc(money(l.d)) : '—'}</td><td class="n" dir="ltr">${esc(money(saleValue(l)))}</td></tr>`).join('');
      return `<table class="ia-lines"><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>القيمة</th></tr>${rows}</table><p class="hint"><span>الإجمالي:</span> <b dir="ltr">${esc(money(r.total))}</b> <span>ج</span></p>`;
    }
    const inv = st.inv.get(r.key);
    if (!inv) return '<p class="hint">بيفتح الفاتورة…</p>';
    if (inv.error) return `<p class="status bad">${esc(inv.error)}</p>`;
    const rows = (inv.lines || []).map((l) => { const n = names.get(String(l.i)) || { name: '#' + l.i };
      return `<tr class="${String(l.i) === String(st.item.id) ? 'me' : ''}"><td><span class="notr" dir="ltr">${esc(n.name)}</span>${n.arabic_name ? `<small class="notr">${esc(n.arabic_name)}</small>` : ''}</td><td>${esc(buyQty(l))}</td><td class="n" dir="ltr">${l.t != null ? esc(money(l.t)) + '%' : '—'}</td><td class="n">${esc(expText(l.x))}</td><td class="n" dir="ltr">${esc(money(buyValue(l)))}</td></tr>`; }).join('');
    return `<table class="ia-lines"><tr><th>الصنف</th><th>الكمية</th><th>الخصم</th><th>الصلاحية</th><th>القيمة</th></tr>${rows}</table>` +
      `<p class="hint"><span>الإجمالي:</span> <b dir="ltr">${esc(money(inv.total != null ? inv.total : inv.amount))}</b> <span>ج</span>${inv.balance != null ? `<bdi class="notr"> · </bdi><span>الرصيد بعدها</span> <b dir="ltr">${esc(money(inv.balance))}</b>` : ''}</p>`;
  }
  function moveHtml() {
    const seg = (list, cur, attr) => `<div class="ia-seg">${list.map(([k, l]) => `<button type="button" class="${k === cur ? 'on' : ''}" ${attr}="${k}">${esc(l)}</button>`).join('')}</div>`;
    let body;
    if (st.error) body = `<p class="status bad">${esc(st.error)}</p>`;
    else if (st.busy && !st.rows.length) body = '<p class="hint">بيجيب الحركة…</p>';
    else if (!st.rows.length) body = '<p class="hint">ما اتعاملناش على الصنف ده في الفترة دي.</p>';
    else body = st.rows.map(rowHtml).join('');
    return '<button type="button" class="secondary small" data-ia-back>‹ رجوع للقايمة</button>' + seg(TABS, st.tab, 'data-ia-tab') + seg(PERIODS, st.period, 'data-ia-period') + `<div id="iaRows">${body}</div>` +
      (hasMore(st.streams) && st.rows.length ? `<button type="button" class="secondary small" data-ia-more${st.busy ? ' disabled' : ''}>عرض أكتر</button>` : '') +
      '<p class="hint">المشتريات من 2018. المبيعات التفصيلية آخر سنة بس، وقبلها في «المبيعات الشهرية».</p>';
  }
  // «📅 المبيعات الشهرية»: a block per year (the latest two open), a line per month with a bar against the item's busiest month
  const cnt = (n) => `<bdi class="notr" dir="ltr">${esc(money(n))}</bdi>`;
  const sep = '<bdi class="notr"> · </bdi>';
  function monthlyHtml() {
    const mo = st.mon || {}, back = '<button type="button" class="secondary small" data-ia-back>‹ رجوع للقايمة</button>';
    if (mo.error) return back + `<p class="status bad">${esc(mo.error)}</p>`;
    if (mo.busy) return back + '<p class="hint">بيجيب الملخص الشهري…</p>';
    if (mo.notLoaded) return back + '<p class="hint">الملخص الشهري لسه ما اتحمّلش من اللابتوب.</p>';
    const years = mo.years || [];
    if (!years.length) return back + '<p class="hint">الصنف ده ما اتباعش في أي شهر من 2018.</p>';
    const tot = grandTotal(years), max = maxSold(years), first = years[years.length - 1].rows[years[years.length - 1].rows.length - 1].ym.split('-');
    const figs = (t) => !t.s && !t.r && !t.v && !t.n ? '<span>مفيش مبيعات</span>' : [`${cnt(t.s)} <span>علبة</span>`, `${cnt(t.v)} <span>ج</span>`, `<span>فواتير</span> ${cnt(t.n)}`].join(sep) + (t.r ? sep + `<span>مرتجع</span> ${cnt(t.r)}` : '');
    const rows = (g) => g.rows.map((r) => {
      const empty = !r.s && !r.r && !r.v && !r.n;
      return `<div class="ia-mo${empty ? ' none' : ''}"><div class="ia-mr"><span class="ia-mn"><span>${esc(MONTHS[r.month - 1])}</span></span><span class="ia-mb"><i style="width:${barPct(r.s, max)}%"></i></span><b class="ia-mq">${empty ? '—' : cnt(r.s)}</b></div>` +
        (empty ? '' : `<div class="ia-l2">${[`${cnt(r.v)} <span>ج</span>`, `<span>فواتير</span> ${cnt(r.n)}`].join(sep)}${r.r ? sep + `<span>مرتجع</span> ${cnt(r.r)}` : ''}</div>`) + '</div>';
    }).join('');
    const blocks = years.map((g) => { const on = mo.open.has(g.year);
      return `<section class="ia-yr${on ? ' open' : ''}"><button type="button" class="ia-yh" data-ia-year="${g.year}" aria-expanded="${on}"><b class="notr">${g.year}</b><span class="ia-ys">${figs(g.tot)}</span><i class="ia-ch" aria-hidden="true">${on ? '▾' : '‹'}</i></button>${on ? rows(g) : ''}</section>`; }).join('');
    return back + `<p class="ia-tot"><span>الإجمالي من</span> <bdi class="notr" dir="ltr">${esc(first[1] + '/' + first[0])}</bdi><br>${figs(tot)}</p>` + `<div id="iaMonthly">${blocks}</div>` +
      `<p class="hint"><span>الأرقام بالعلب (العلب + الوحدات ÷ عدد الوحدات في العلبة). الشهر الحالي بيكتمل مع التحديث اليومي.</span>${mo.at ? ` <span>آخر تحديث من اللابتوب:</span> <bdi class="notr" dir="ltr">${esc(mo.at)}</bdi>` : ''}</p>`;
  }
  function draw() {
    const body = $('iaBody');
    if (!st || !body) return;
    $('iaTitle').textContent = (st.view === 'move' ? '📈 ' : st.view === 'monthly' ? '📅 ' : '') + title(st.item);
    body.innerHTML = st.view === 'menu' ? menuHtml() : st.view === 'monthly' ? monthlyHtml() : moveHtml();
  }

  // ---------- the report ----------
  async function vendorNames(ids) {
    const need = [...new Set(ids)].filter((i) => i != null && !vendors.has(String(i)));
    if (!need.length) return;
    const { data } = await db().from('ar_vendors').select('id,name,short').in('id', need);
    for (const v of data || []) vendors.set(String(v.id), v.name || v.short);
    for (const i of need) if (!vendors.has(String(i))) vendors.set(String(i), '#' + i);
  }
  function buildStreams() {
    const id = Number(st.item.id), from = periodFrom(st.period), tab = st.tab, streams = [];
    const stop = from ? (r) => r.at < from : null;
    if (tab !== 'sale') {
      const kind = tab === 'buy' ? 'purchase' : tab === 'ret' ? 'return' : null;
      streams.push(makeStream(async (before) => {
        const { data, error } = await db().rpc('ar_vendor_item_moves', { p_item: id, p_kind: kind, p_before: before, p_limit: PAGE });
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        await vendorNames(rows.map((m) => m.vendor_id));
        return rows.map((m) => buyRow(m, vendors.get(String(m.vendor_id))));
      }, (r) => keepKind(tab, r.kind), stop));
    }
    if (tab !== 'buy') {
      const to = '2100-01-01T00:00:00', since = from || '2000-01-01T00:00:00';
      streams.push(makeStream(async (before) => {
        const { data, error } = await db().rpc('ar_sales_list', { p_from: since, p_to: to, p_kind: tab === 'ret' ? 'return' : null, p_item: id, p_customer: null, p_before: before, p_limit: PAGE });
        if (error) throw error;
        return (Array.isArray(data) ? data : []).map((s) => saleRow(s, id));
      }, (r) => keepKind(tab, r.kind), null));
    }
    return streams;
  }
  async function load(more) {
    const me = st;
    if (!me || me.busy) return;
    const token = ++seq;
    me.busy = true; me.error = '';
    if (!more) { me.rows = []; me.open = new Set(); me.streams = buildStreams(); }
    draw();
    try {
      const got = await takeMerged(me.streams, PAGE);
      if (st !== me || token !== seq) return;
      me.rows = me.rows.concat(got);
    } catch (e) {
      if (st === me && token === seq) me.error = missing(e) ? 'التقارير دي لسه مش متاحة: محتاجة تفعيل على السيرفر الأول.' : 'مقدرتش أجيب الحركة: ' + (e && e.message);
    } finally {
      if (st === me && token === seq) { me.busy = false; draw(); }
    }
  }
  // the monthly summary: the item's own row and the heartbeat row (-1: when the laptop last sent); no heartbeat = the table was never filled
  async function loadMonthly() {
    const me = st;
    if (!me) return;
    const token = ++seq;
    me.view = 'monthly'; me.mon = { busy: true, open: new Set() };
    draw();
    const mo = { open: new Set() };
    try {
      const { data, error } = await db().from('ar_item_sales_monthly').select('item_id,months,updated_at').in('item_id', [Number(me.item.id), -1]);
      if (error) throw error;
      const mine = (data || []).find((x) => Number(x.item_id) === Number(me.item.id)), beat = (data || []).find((x) => Number(x.item_id) === -1);
      if (!beat) mo.notLoaded = true;
      mo.years = byYear(mine && mine.months);
      mo.at = beat ? localDmy(beat.updated_at) : '';
      for (const g of mo.years.slice(0, 2)) mo.open.add(g.year);
    } catch (e) {
      mo.error = missing(e) ? 'التقارير دي لسه مش متاحة: محتاجة تفعيل على السيرفر الأول.' : 'مقدرتش أجيب الملخص الشهري: ' + (e && e.message);
    }
    if (st === me && token === seq) { me.mon = mo; draw(); }
  }
  async function openInvoice(key) {
    const me = st, r = me && me.rows.find((x) => x.key === key);
    if (!r) return;
    if (me.open.has(key)) { me.open.delete(key); draw(); return; }
    me.open.add(key);
    draw();
    if (r.src !== 'buy' || me.inv.has(key)) return;
    try {
      const { data, error } = await db().from('ar_vendor_moves').select('id,at,kind,code,amount,total,balance,lines').eq('id', r.id).limit(1);
      if (error) throw error;
      const m = data && data[0];
      if (!m) { me.inv.set(key, { error: 'الفاتورة مش موجودة.' }); }
      else {
        me.inv.set(key, m);
        const ids = [...new Set((m.lines || []).map((l) => l.i))].filter((i) => !names.has(String(i)));
        if (ids.length) {
          const { data: its } = await db().from('ar_store_items').select('id,name,arabic_name').in('id', ids);
          for (const x of its || []) names.set(String(x.id), x);
        }
      }
    } catch (e) { me.inv.set(key, { error: 'مقدرتش أفتح الفاتورة: ' + (e && e.message) }); }
    if (st === me) draw();
  }

  // ---------- the operations ----------
  async function addBarcode() {
    const me = st;
    if (!me || me.busy) return;
    const n = parseCopies(me.copies);
    if (Number.isNaN(n)) { me.msg = 'عدد الملصقات من 1 لـ 500.'; me.ok = false; return draw(); }
    me.busy = true; me.msg = ''; draw();
    try {
      const { error } = await db().from('ar_item_ops').insert({ kind: 'barcode', item_id: Number(me.item.id), item_name: title(me.item).slice(0, 200), qty: n, status: 'pending' });
      if (error) throw error;
      me.msg = 'اتسجّلت في «العمليات»: طباعة باركود (مستنية).'; me.ok = true;
      if (root.AskerOps && root.AskerOps.open) root.AskerOps.open();
    } catch (e) {
      me.msg = missing(e) ? 'العمليات لسه مش متاحة: محتاجة تفعيل على السيرفر الأول.' : 'ما اتسجّلتش: ' + (e && e.message); me.ok = false;
    }
    me.busy = false;
    if (st === me) draw();
  }
  // «جرد»: the count screen on this item (only an item the count data holds, i.e. with stock in PharmaFly; the screen says so otherwise)
  async function goCount() {
    const id = st && st.item.id;
    close();
    if (!root.AskerApp || !root.AskerApp.showTab || !root.AskerCount || !root.AskerCount.openItem) return;
    root.AskerApp.showTab('count');
    await root.AskerCount.openItem(id);
  }

  function onClick(e) {
    if (e.target === $('iaSheet') || e.target.closest('[data-ia-close]')) return close();
    if (!st) return;
    const go = e.target.closest('[data-ia-go]');
    if (go) { st.view = 'move'; st.tab = go.dataset.iaGo; return load(false); }
    if (e.target.closest('[data-ia-monthly]')) return loadMonthly();
    const yr = e.target.closest('[data-ia-year]');
    if (yr && st.mon && st.mon.open) { const y = Number(yr.dataset.iaYear); if (st.mon.open.has(y)) st.mon.open.delete(y); else st.mon.open.add(y); return draw(); }
    if (e.target.closest('[data-ia-back]')) { st.view = 'menu'; seq++; st.busy = false; return draw(); }
    const tab = e.target.closest('[data-ia-tab]');
    if (tab) { st.tab = tab.dataset.iaTab; return load(false); }
    const per = e.target.closest('[data-ia-period]');
    if (per) { st.period = per.dataset.iaPeriod; return load(false); }
    if (e.target.closest('[data-ia-more]')) return load(true);
    const row = e.target.closest('[data-ia-row]');
    if (row) return openInvoice(row.dataset.iaRow);
    if (e.target.closest('[data-ia-barcode]')) return addBarcode();
    if (e.target.closest('[data-ia-count]')) return goCount();
  }
  root.AskerItemActions = { open, close };
})(typeof window === 'undefined' ? globalThis : window);
