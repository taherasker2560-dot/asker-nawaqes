/* «البيع المؤقت» (owner 2026-11-12: «ماشي» on the screen). At rush hour a sale is recorded here in seconds, by the PharmaFly
   sticker's barcode (the camera), the item's name or its code; it is entered into PharmaFly later, when it is quiet.
   - A PharmaFly sticker's number is 100000 + the item's code (101060 = code 1060, AUGMENTIN 1G 14TAB; checked on 3 stickers).
   - Items come from the stock list (ar_stock, ar/stock.js), customers from ar_customers; both are kept on the phone too, so a
     sale can be recorded with no internet.
   - A sale is kept on the phone first (localStorage) and sent to ar_temp_sales (migration 202611122330) when the internet is
     there; the phone makes its id, so sending it twice keeps one sale.
   - Nothing here touches PharmaFly. «مستنية» = not entered yet; the owner marks «اتدخلت» (later: the laptop, by itself). */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/tempsale.cjs) ----------
  const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
  // a typed code or sticker number -> the PharmaFly item code (null: not a sticker / not a code).
  // From the camera (scanned = true) only a whole sticker number counts (6 digits, 1xxxxx): a shorter or longer reading is a
  // misread or another barcode, never taken as a code (the owner: «الباركود ينطق اصناف غلط», 2026-11-13).
  function stickerCode(raw, scanned) {
    const s = String(raw || '').replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).trim();
    if (scanned) { const r = stickerRead(s); return r ? r.code : null; }
    const d = s.replace(/\D/g, '');
    const r = stickerRead(d);
    if (r) return r.code;
    if (/^\d{1,5}$/.test(d)) return Number(d) || null;
    return null;
  }
  // The sticker's barcode (an ITF of 10 digits, found 2026-11-13 from the owner's scan 1634760729 = FEMOGESAL TAB, code
  // 63476, its batch 07/2029): 1 + the item code (5 digits) + the batch's expiry month (2) + year (2). The number printed
  // above it is the first 6 digits. -> {code, exp: 'YYYY-MM'} (exp null for the 6 digits alone), null when it is neither.
  function stickerRead(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/^1(\d{5})(0[1-9]|1[0-2])(\d{2})$/);
    // a year far from now is a misread too (stickers are printed on stock that has a real expiry)
    const y = m ? 2000 + Number(m[3]) : 0, now = new Date().getFullYear();
    if (m) return Number(m[1]) && y >= now - 3 && y <= now + 15 ? { code: Number(m[1]), exp: `20${m[3]}-${m[2]}` } : null;
    if (/^1\d{5}$/.test(s)) return Number(s) - 100000 ? { code: Number(s) - 100000, exp: null } : null;
    return null;
  }
  // one box, or one unit (strip / ampoule) when the box is split in PharmaFly (parts > 1)
  function priceOf(base, parts, unit) {
    const k = Number(parts) > 1 ? Number(parts) : 1;
    return unit === 'unit' && k > 1 ? r2(base / k) : r2(base);
  }
  // a line has TWO boxes (owner 2026-11-21: «مكان للوحدات ومكان للعبوات»): q = boxes (packs), w = units; the price is
  // q × the box's price + w × the unit's price (an item that does not split has no units)
  const lineTotal = (l) => r2(l.q * l.p + l.w * l.pu);
  const total = (lines) => r2((lines || []).reduce((s, l) => s + lineTotal(l), 0));
  // a tap on an item adds one box; the same item AND the same expiry again = one more box. x = the expiry the owner chose
  // ('YYYY-MM'; null when the item has none or it is not known): the same item with another expiry is another line
  function addItem(lines, it, x) {
    const c = Number(it.item_id ?? it.id), key = x || null;
    const same = lines.find((l) => l.c === c && (l.x || null) === key);
    if (same) { same.q += 1; return same; }
    const base = Number(it.price) || 0, k = Number(it.parts) > 1 ? Number(it.parts) : 1;
    const line = { c, n: String(it.name || ''), ar: String(it.arabic_name || ''), q: 1, w: 0, k, base, p: priceOf(base, k, 'pack'), pu: priceOf(base, k, 'unit'), x: key, vp: !!it.vp,
      // the stock shown on the line as in PharmaFly's sale (never sent to the server): the whole item's, or the chosen expiry's (bs)
      sp: Number(it.packs) || 0, su: Number(it.units) || 0, bs: null, nostock: !!it.nostock };
    lines.push(line);
    return line;
  }
  // «🔁 بدائل» on a bill line (owner 2026-11-28: «عاوزة لو اختارته ينزل مكان الصنف الاساسى اللى بحثت عنه و نزلته الفاتورة»): the chosen alternative takes
  // the line's place in the bill, with its quantity; its own price, parts and stock; its expiry is asked again (x = null), as when an item is added.
  // Units stay only on an item that splits (else the line keeps at least one box).
  function swapItem(line, it) {
    const base = Number(it.price) || 0, k = Number(it.parts) > 1 ? Number(it.parts) : 1;
    Object.assign(line, { c: Number(it.item_id ?? it.id), n: String(it.name || ''), ar: String(it.arabic_name || ''), k, base, p: priceOf(base, k, 'pack'), pu: priceOf(base, k, 'unit'),
      x: null, bs: null, xmiss: false, vp: !!it.vp, sp: Number(it.packs) || 0, su: Number(it.units) || 0, nostock: !!it.nostock, sold0: false });
    if (!(k > 1) && line.w) { line.q = Math.max(1, line.q); line.w = 0; }
    return line;
  }
  // «سعر متغيّر» (PharmaFly's Items.VariableSalesPrice; owner 2026-11-22, for everyone who sells: «يظهر لي خانة اغير فيها السعر»): the box's price
  // typed on the line, the unit's price follows (price ÷ parts); nothing at or below 0. The robot types this price in PharmaFly's «أدخل سعر البيع».
  function setPrice(line, v) {
    const n = r2(String(v == null ? '' : v).replace(',', '.'));
    if (!(n > 0) || n > 100000) return line;
    line.p = n; line.pu = priceOf(n, line.k, 'unit');
    return line;
  }
  // the box «علب» (which = 'q') or «وحدات» ('w') set to n (typed or +/−): never below 0, never both 0 (the line would sell
  // nothing), units only on an item that splits
  function setQty(line, which, n) {
    const v = Math.min(9999, Math.max(0, Math.floor(Number(n) || 0)));
    if (which === 'w') { if (!(line.k > 1)) return line; if (line.q + v > 0) line.w = v; return line; }
    if (v + line.w > 0) line.q = v;
    return line;
  }
  // the line's quantity in units against the stock in units (a box = parts units); the chosen expiry's stock when it has one
  const unitsOf = (l) => l.q * l.k + l.w;
  const stockUnits = (l) => (l.bs ? l.bs.k * l.k + l.bs.u : l.sp * l.k + l.su);
  const overStock = (l) => !l.nostock && unitsOf(l) > stockUnits(l) + 1e-9;
  // an item's batches that have stock: [{x:'YYYY-MM', k: boxes, u: units}] oldest expiry first (a negative or empty batch cannot be sold from)
  function sellable(batches, parts) {
    const p = Number(parts) > 1 ? Number(parts) : 1;
    return (batches || []).filter((b) => b && b.x && b.k * p + b.u > 0).sort((a, b) => String(a.x).localeCompare(String(b.x)));
  }
  // «صلاحية 03/2028» (nothing for an item with no expiry in PharmaFly); soon = within 3 months from now
  function expInfo(exp, now) {
    const m = String(exp || '').match(/^(\d{4})-(\d{2})/);
    if (!m) return null;
    const n = now || new Date(), months = (+m[1] - n.getFullYear()) * 12 + (+m[2] - 1 - n.getMonth());
    return { text: `صلاحية ${m[2]}/${m[1]}`, soon: months <= 3, gone: months <= 0 };
  }
  // an expiry typed by hand, as it is written in PharmaFly (owner 2026-11-21): month and year -> 'YYYY-MM' (null when it is not one).
  // «03/2028», «3/28», «03-2028», «0328», «032028», «328», Arabic digits too; the year within 5 years back and 15 ahead
  function parseExp(raw, now) {
    const s = String(raw || '').replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).trim();
    let mo, y, m = /^(\d{1,2})\s*[/\-. ]\s*(\d{2}|\d{4})$/.exec(s);
    if (m) { mo = +m[1]; y = +m[2]; } else {
      const g = s.replace(/\D/g, '');
      if (s !== g || !(g.length === 3 || g.length === 4 || g.length === 6)) return null;
      mo = g.length === 3 ? +g[0] : +g.slice(0, 2); y = +g.slice(g.length === 3 ? 1 : 2);
    }
    if (y < 100) y += 2000;
    const n = now || new Date();
    if (!(mo >= 1 && mo <= 12) || y < n.getFullYear() - 5 || y > n.getFullYear() + 15) return null;
    return `${y}-${String(mo).padStart(2, '0')}`;
  }
  // the customer's balance after this sale (paid part taken off) above the limit on his card
  function overLimit(cust, amount, paid) {
    if (!cust) return null;
    const lim = Number(cust.credit_limit) || 0, bal = Number(cust.balance) || 0, after = r2(bal + (Number(amount) || 0) - (Number(paid) || 0));
    return lim > 0 && after > lim ? { bal: r2(bal), lim: r2(lim), after } : null;
  }
  // the customer's account with this bill (owner 2026-11-13): his balance before, the bill (a sale adds it, a return takes
  // it off), what he paid now (a return: what was given back to him in cash), and his balance after
  function account(cust, kind, amount, paid) {
    if (!cust) return null;
    const before = r2(Number(cust.balance) || 0), amt = r2(Number(amount) || 0), cash = r2(Number(paid) || 0), ret = kind === 'return';
    return { before, amount: amt, paid: cash, ret, after: r2(ret ? before - amt + cash : before + amt - cash) };
  }
  // «الفكة» (owner 2026-11-13 «خصم مبلغ او اضافة مبلغ»): the bill rounded down / up to 5 pounds, and the amount that
  // gets there; adjust is taken off (minus) or added (plus) on the whole bill
  function roundOptions(sum) {
    const s = r2(sum);
    if (!(s > 0)) return [];
    const down = Math.floor(s / 5) * 5, up = Math.ceil(s / 5) * 5, out = [];
    if (down !== s && down > 0) out.push({ to: down, adj: r2(down - s) });
    if (up !== s) out.push({ to: up, adj: r2(up - s) });
    return out;
  }
  const due = (lines, adj) => r2(total(lines) + (Number(adj) || 0));
  // the row kept on the phone and sent to ar_temp_sales
  // kind: 'sale' or 'return' (مرتجع: a bill of its own, as in PharmaFly; a return has no paid part)
  // adjust: «الفكة» (− off the bill, + added); total is what is asked for, after it
  function record({ id, soldAt, lines, customer, paid, note, kind, adjust }) {
    const adj = r2(adjust);
    return {
      id, sold_at: soldAt, kind: kind === 'return' ? 'return' : 'sale',
      customer_id: customer ? Number(customer.id) : null,
      customer_name: customer ? String(customer.name || '').slice(0, 120) : null,
      // a line with boxes AND units goes as two entries, so everything that reads items ({c,n,q,u,p}) works as before;
      // x = the expiry chosen for it (only when there is one)
      items: lines.flatMap((l) => {
        const x = l.x ? { x: l.x } : {}, out = [];
        if (l.q > 0) out.push({ c: l.c, n: l.n, q: l.q, u: 'pack', p: l.p, ...x });
        if (l.w > 0) out.push({ c: l.c, n: l.n, q: l.w, u: 'unit', p: l.pu, ...x });
        return out;
      }),
      total: due(lines, adj),
      adjust: adj || null,
      paid: customer && kind !== 'return' && Number(paid) > 0 ? r2(paid) : null,
      note: String(note || '').trim().slice(0, 300) || null,
      status: 'pending',
    };
  }
  // Arabic counting with western digits: 1 علبة، 3 علب، 11 علبة
  const word = (n, one, few) => (n >= 3 && n <= 10 ? few : one);
  const qtyText = (q, u) => `${q} ${u === 'unit' ? word(q, 'وحدة', 'وحدات') : word(q, 'علبة', 'علب')}`;
  const countText = (n) => (n === 1 ? 'صنف واحد' : n === 2 ? 'صنفين' : `${n} ${word(n, 'صنف', 'أصناف')}`);
  const money = (x) => {
    const v = r2(x);
    return (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' ج';
  };
  function clock(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const h = d.getHours() % 12 || 12, m = String(d.getMinutes()).padStart(2, '0');
    const today = new Date(), same = d.toDateString() === today.toDateString();
    return (same ? '' : `${d.getDate()}/${d.getMonth() + 1} `) + `${h}:${m} ${d.getHours() < 12 ? 'ص' : 'م'}`;
  }
  // the list: sales kept on the phone (not sent yet) first, then the server's; one row per id
  function merged(server, queued) {
    const out = (queued || []).map((q) => ({ ...q, queued: true }));
    for (const s of server || []) if (!out.some((q) => q.id === s.id)) out.push(s);
    return out.sort((a, b) => String(b.sold_at).localeCompare(String(a.sold_at)));
  }
  // the phone's main back camera among its cameras (Android: «camera2 0, facing back»; the others are wide / zoom lenses)
  function mainBack(list) {
    const back = (list || []).filter((d) => /back|rear|environment|خلف/i.test(d.label || ''));
    return back.find((d) => /camera2?\s*0\b/i.test(d.label || '')) || back[0] || null;
  }
  // the part of the camera's picture shown in the thin strip (object-fit: cover, centred, width : height = a): the barcode
  // is read only there, so what is read is what the owner sees (owner 2026-11-13: «7 في 2 … اخد بيها الباركود وخلاص»)
  function stripBox(vw, vh, a) {
    if (!vw || !vh) return null;
    if (vw / vh > a) { const sw = Math.round(vh * a); return { sx: Math.round((vw - sw) / 2), sy: 0, sw, sh: vh }; }
    const sh = Math.round(vw / a);
    return { sx: 0, sy: Math.round((vh - sh) / 2), sw: vw, sh };
  }
  // a balance in words: «250 ج», or «له 50 ج» when the pharmacy owes him
  const balText = (x) => (r2(x) < 0 ? 'له ' + money(-x) : money(x));
  // up to 3 bills open together (owner 2026-11-21): each is a whole bill of its own; all kept on the phone
  const MAX_BILLS = 3;
  const blankBill = () => ({ kind: 'sale', cart: [], cust: null, custOpen: false, paid: '', note: '', adj: 0, adjOpen: false, adjSign: -1, wait: null });
  const okLine = (l) => l && Number.isFinite(Number(l.c)) && Number.isFinite(Number(l.q)) && Number.isFinite(Number(l.p));
  // what was kept on the phone, made safe: 1..3 bills, every line complete, the open one in range
  function cleanBills(raw) {
    const list = raw && Array.isArray(raw.bills) ? raw.bills.slice(0, MAX_BILLS) : [];
    const bills = list.filter((b) => b && Array.isArray(b.cart)).map((b) => {
      const cart = b.cart.filter(okLine).map((l) => {
        const k = Number(l.k) > 1 ? Number(l.k) : 1, base = Number(l.base) || Number(l.p) || 0;
        return { ...l, c: Number(l.c), q: Math.max(0, Math.floor(Number(l.q)) || 0), w: k > 1 ? Math.max(0, Math.floor(Number(l.w)) || 0) : 0, k, base,
          p: Number(l.p), pu: Number.isFinite(Number(l.pu)) ? Number(l.pu) : priceOf(base, k, 'unit'), x: l.x || null, bs: l.bs && Number.isFinite(Number(l.bs.k)) ? { k: Number(l.bs.k), u: Number(l.bs.u) || 0 } : null };
      }).filter((l) => l.q + l.w > 0);
      const cu = b.cust && b.cust.id != null ? { id: b.cust.id, name: String(b.cust.name || ''), credit_limit: b.cust.credit_limit, balance: b.cust.balance } : null;
      return { ...blankBill(), kind: b.kind === 'return' ? 'return' : 'sale', cart, cust: cu, custOpen: !!b.custOpen && !cu, paid: b.kind === 'return' ? '' : String(b.paid || ''), note: String(b.note || '').slice(0, 300),
        adj: r2(b.adj), wait: b.wait != null && b.wait !== '' ? String(b.wait).slice(0, 20) : null, adjOpen: false, adjSign: Number(b.adjSign) > 0 ? 1 : -1 };
    });
    if (!bills.length) bills.push(blankBill());
    return { cur: Math.min(Math.max(0, Math.floor(Number(raw && raw.cur)) || 0), bills.length - 1), bills };
  }
  // ---- «⚡ سريع» (owner 2026-11-27, «ابعت»): PharmaFly's own quick-sale grid (table HandyItems), carried in the count file's `q` by the laptop (Hub\count\BUILD_COUNT.ps1):
  // each button {d: page, r: row, c: column, t: the button's name, i: item, n, sp: price, p: parts, e: has an expiry, vp, off: a cancelled card}. His places are kept.
  const quickRows = (list) => (Array.isArray(list) ? list : []).filter((q) => q && Number(q.i) > 0 && Number(q.d) >= 0 && Number(q.r) >= 0 && Number(q.c) >= 0)
    .map((q) => ({ d: Number(q.d), r: Number(q.r), c: Number(q.c), t: String(q.t || q.n || ''), i: Number(q.i), n: String(q.n || ''), sp: Number(q.sp) || 0, p: Number(q.p) > 1 ? Number(q.p) : 1, e: !!q.e, vp: !!q.vp, off: !!q.off }));
  const quickPages = (rows) => [...new Set(rows.map((q) => q.d))].sort((a, b) => a - b);
  const quickCols = (rows) => rows.reduce((m, q) => Math.max(m, q.c + 1), 1);
  // a button whose item has no stock and was not sold this year: it goes in like any item with no stock, from the button's own data
  const quickItem = (q) => ({ item_id: q.i, name: q.n || q.t, arabic_name: '', price: q.sp, parts: q.p, packs: 0, units: 0, nostock: true, sold0: true, hasExp: q.e });
  const api = { quickRows, quickPages, quickCols, quickItem, stickerRead, overStock, expInfo, parseExp, stripBox, mainBack, stickerCode, priceOf, lineTotal, total, addItem, swapItem, setQty, setPrice, sellable, blankBill, cleanBills, MAX_BILLS, overLimit, account, balText, roundOptions, due, record, qtyText, countText, money, merged };
  root.AskerTempSaleLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the place ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  // the item's small photo (a tap opens «تعديل الصنف» over the bill and touches nothing in it; owner 2026-11-21, group 4). Every place carries the item's code
  const IM = () => root.AskerItemMedia;
  const photo = (id, en, title) => (IM() && id != null && id !== '' && Number.isFinite(Number(id)) ? IM().thumb(id, en, title) : '');
  const photoRow = (id, en, title, inner) => (IM() && id != null && id !== '' && Number.isFinite(Number(id)) ? IM().row(id, en, title, inner) : inner);
  const QKEY = 'asker-ts-queue', IKEY = 'asker-ts-items', CKEY = 'asker-ts-cust', BKEY = 'asker-ts-bills', XKEY = 'asker-ts-batches', SKEY = 'asker-ts-stopped';
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (e) { return d; } };
  const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  let items = [], byId = new Map(), customers = [], cart = [], cust = null, custOpen = false, way = 'name', kind = 'sale';
  // the waiting-list request this bill came from (owner 2026-11-22, «🧾 بيعها»): saved = handed over; askQty = the quantity of that request for the line about to be added
  let waitId = null, askQty = null;
  // the bills open together (up to 3): `cart` / `cust` / `kind` / the fields are the CURRENT one's; bills[cur] is refreshed from them (snap)
  let bills = [blankBill()], cur = 0;
  // the expiry batches of every item with stock (the count's file from the laptop): Map code -> {p: parts, b: [{x, k, u}]}
  let batches = null, batchAt = 0, batchData = '', batchP = null, expFor = null;
  // the items SOLD in the last 12 months that have no stock (z of the same file; owner 2026-11-21): rows [code, name, price, parts, has an expiry, Arabic name]
  let zRows = [], zItems = [], zById = new Map();
  // the quick buttons and how he left them (open or folded, which page), on this phone
  const QKKEY = 'asker-ts-quick';
  let quick = [], qk = null;
  const qkState = () => { if (!qk) { const v = load(QKKEY, null); qk = { open: !v || v.open !== false, page: Number((v && v.page) || 0) }; } return qk; };
  let stopped = new Set(); // customers whose credit the owner stopped
  // «الفكة»: the amount off (−) or added (+) on this bill; any change in the lines clears it
  let adj = 0, adjOpen = false, adjSign = -1;
  const clearAdj = () => { adj = 0; adjOpen = false; };
  let queue = load(QKEY, []), server = [], view = 'new', listKind = 'pending', openRow = '', flushing = false, ready = false;

  function say(id, text, kind) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  const nameOf = (x) => String(x.ar || x.arabic_name || '').trim() || String(x.n || x.name || '');

  // ---------- data: items and customers (also kept on the phone for no-internet use) ----------
  function useItems(rows) {
    items = rows;
    byId = new Map(rows.map((r) => [Number(r.item_id), r]));
  }
  async function loadItems() {
    try {
      const rows = root.AskerStock ? await root.AskerStock.ensure() : [];
      if (rows && rows.length) {
        useItems(rows);
        keep(IKEY, rows.map((r) => [r.item_id, r.name, r.arabic_name || '', r.price, r.parts, r.packs, r.units, r.exp_near || null]));
        return;
      }
    } catch (e) {}
    const saved = load(IKEY, []);
    useItems(saved.map((a) => ({ item_id: a[0], name: a[1], arabic_name: a[2], price: a[3], parts: a[4], packs: a[5], units: a[6], exp_near: a[7] || null })));
  }
  async function loadCustomers() {
    try {
      const out = [];
      for (let from = 0; from < 10000; from += 1000) {
        const { data, error } = await db().from('ar_customers').select('id,name,credit_limit,balance').order('id').range(from, from + 999);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      customers = out;
      keep(CKEY, out.map((c) => [c.id, c.name, c.credit_limit, c.balance]));
    } catch (e) {
      customers = load(CKEY, []).map((a) => ({ id: a[0], name: a[1], credit_limit: a[2], balance: a[3] }));
    }
    // who the owner stopped (ar_customer_stops, «وقّف الآجل» 2026-11-13): said on the bill; the table may not be there yet
    // kept on the phone too (review 2026-11-23): a failed read used to leave the list EMPTY after a reload, so the «⛔ موقوف» line vanished
    try {
      const { data, error } = await db().from('ar_customer_stops').select('customer_id').range(0, 4999);
      if (error) throw error;
      stopped = new Set((data || []).map((r) => String(r.customer_id)));
      keep(SKEY, [...stopped]);
    } catch (e) { if (!stopped.size) stopped = new Set(load(SKEY, []).map(String)); }
  }
  // an item with no stock (not in the stock list) is looked up by its code on the server
  async function itemByCode(code) {
    if (byId.has(code)) return byId.get(code);
    if (zById.has(code)) return zById.get(code);   // sold in the last year, no stock: PharmaFly's current price and parts
    if (!db()) return null;
    try {
      const { data } = await db().from('ar_store_items').select('id,name,arabic_name,price').eq('id', code).limit(1);
      const it = data && data[0];
      return it ? { item_id: it.id, name: it.name, arabic_name: it.arabic_name, price: it.price, parts: 1, packs: 0, units: 0, nostock: true } : null;
    } catch (e) { return null; }
  }

  // ---------- the expiry batches (the count's file from the laptop, every update; kept on the phone) ----------
  // Readable for the owner and for a staff member with «جرد المخزون»; with no file the sale still works, a line just says its expiry is not known
  let batchFail = 0;
  function useBatches(rows, at) {
    batches = new Map(rows.map((r) => [Number(r[0]), { p: Number(r[1]) > 1 ? Number(r[1]) : 1, b: (r[2] || []).map((a) => ({ x: a[0] || null, k: Number(a[1]) || 0, u: Number(a[2]) || 0 })), vp: Number(r[3]) === 1 }]));
    batchData = String(at || '');
  }
  // «سعر متغيّر» items with no stock (the count file's z, vp = 1)
  let vpZ = new Set();
  function useVz(list) { vpZ = new Set((list || []).map(Number)); }
  const isVp = (c) => !!((batches && batches.get(Number(c)) && batches.get(Number(c)).vp) || vpZ.has(Number(c)));
  // the sold-without-stock items as the sale's items: «مفيش رصيد» tagged, sold with no stock as PharmaFly does
  function useZ(rows) {
    zRows = rows;
    zItems = rows.map((r) => ({ item_id: Number(r[0]), name: String(r[1] || ''), arabic_name: String(r[5] || ''), price: Number(r[2]) || 0, parts: Number(r[3]) > 1 ? Number(r[3]) : 1, packs: 0, units: 0, nostock: true, sold0: true, hasExp: !!r[4] }));
    zById = new Map(zItems.map((x) => [x.item_id, x]));
  }
  function useQuick(list) { quick = quickRows(list); drawQuick(); }
  // under the search, so what he types shows right under the box: the buttons step aside while there is text (and while the camera is open)
  function showQuick() {
    const el = $('tsQuick');
    if (el) el.classList.toggle('hidden', !quick.length || way === 'scan' || !!($('tsQ') && $('tsQ').value.trim()));
  }
  function drawQuick() {
    const el = $('tsQuick');
    if (!el) return;
    if (!quick.length) { el.innerHTML = ''; return showQuick(); }
    const s = qkState(), pages = quickPages(quick), page = pages.includes(s.page) ? s.page : pages[0];
    const head = `<div class="ts-qk-head"><button type="button" class="ts-qk-toggle" data-ts-qk aria-expanded="${s.open}"><span>⚡ سريع</span> <span aria-hidden="true">${s.open ? '▴' : '▾'}</span></button>` +
      (s.open ? `<div class="ts-qk-pages">${pages.map((d, k) => `<button type="button" class="ts-qk-page${d === page ? ' on' : ''}" data-ts-qkpage="${d}" aria-pressed="${d === page}">${k + 1}</button>`).join('')}</div>` : '') + '</div>';
    const grid = s.open ? `<div class="ts-qk-grid" style="grid-template-columns:repeat(${quickCols(quick)},minmax(0,1fr))">` + quick.map((q, k) => (q.d === page
      ? `<button type="button" class="ts-qk-btn${q.off ? ' off' : ''}" data-ts-quick="${k}" style="grid-row:${q.r + 1};grid-column:${q.c + 1}"><span class="notr${/[A-Za-z]{6}/.test(q.t) ? ' ts-qk-lat' : ''}" dir="auto">${esc(q.t)}</span></button>` : '')).join('') + '</div>' : '';
    el.innerHTML = head + grid;
    showQuick();
  }
  async function quickTap(k) {
    const q = quick[k];
    if (!q) return;
    if (q.off) return say('tsFind', 'الكارت ملغي في فارمافلاي، عدّل الزرار', 'bad');
    const it = byId.get(q.i) || zById.get(q.i) || quickItem(q);
    if (await pick(it)) say('tsFind', 'اتضاف: ' + nameOf(it), 'ok');
  }
  // their Arabic names (the search is often typed in Arabic): asked once from the items table, then kept with the rest
  async function loadZNames() {
    try {
      const need = zRows.filter((r) => r[5] === undefined).map((r) => r[0]);
      for (let i = 0; i < need.length; i += 200) {
        const chunk = need.slice(i, i + 200);
        const { data, error } = await db().from('ar_store_items').select('id,arabic_name').in('id', chunk);
        if (error) return;
        const m = new Map((data || []).map((x) => [Number(x.id), String(x.arabic_name || '').trim()]));
        for (const r of zRows) if (r[5] === undefined && chunk.includes(r[0])) r[5] = m.get(Number(r[0])) || '';
      }
      useZ(zRows);
      const c = load(XKEY, null);
      if (c) keep(XKEY, { ...c, z: zRows });
    } catch (e) { /* the names are a help only */ }
  }
  function loadBatches() {
    if (batchP) return batchP;
    if (batches && Date.now() - batchAt < 3 * 60 * 1000) return Promise.resolve();
    if (Date.now() - batchFail < 60 * 1000) return Promise.resolve();
    batchP = (async () => {
      try {
        const { data: blob, error } = await db().storage.from('asker-private').download('count/stock.json');
        if (error || !blob) throw error || new Error('no file');
        const d = JSON.parse(await blob.text());
        const rows = (d.items || []).map((it) => [it.i, it.p, (it.b || []).map((b) => [b.x || null, b.k, b.u]), it.vp ? 1 : 0]);
        const vz = (d.z || []).filter((it) => it.vp).map((it) => Number(it.i));
        // keep the Arabic names already found for the same items
        const had = new Map(zRows.filter((r) => r[5] !== undefined).map((r) => [r[0], r[5]]));
        const z = (d.z || []).map((it) => { const r = [Number(it.i), it.n, it.sp, it.p, it.e ? 1 : 0]; if (had.has(r[0])) r.push(had.get(r[0])); return r; });
        const q = d.q || [];
        useBatches(rows, d.data_at); useZ(z); useVz([...vz, ...q.filter((x) => x && x.vp).map((x) => Number(x.i))]); useQuick(q); batchAt = Date.now(); batchFail = 0;
        keep(XKEY, { at: Date.now(), data_at: d.data_at, rows, z, vz: [...vpZ], q });
        loadZNames();
      } catch (e) {
        batchFail = Date.now();
        if (!batches) { const c = load(XKEY, null); if (c && Array.isArray(c.rows) && Date.now() - c.at < 36 * 36e5) { useBatches(c.rows, c.data_at); useZ(Array.isArray(c.z) ? c.z : []); useVz(c.vz); useQuick(c.q); batchAt = c.at; } }
      }
      batchP = null;
    })();
    return batchP;
  }
  // what the batches say about an item: unknown (no file), nostock (not in the file), noexp (PharmaFly says «له تاريخ: لأ»),
  // empty (dated batches but none with stock), or list (batches to choose from)
  function batchInfo(code) {
    if (!batches) return { state: 'unknown' };
    const e = batches.get(Number(code));
    if (!e) return { state: 'nostock' };
    if (!e.b.some((b) => b.x)) return { state: 'noexp' };
    const list = sellable(e.b, e.p);
    return list.length ? { state: 'list', list, p: e.p } : { state: 'empty' };
  }

  // ---------- adding items ----------
  function add(it, x, bs, extra) {
    const line = addItem(cart, it, x);
    if (!line.vp && isVp(line.c)) line.vp = true;
    if (askQty && askQty.c === line.c) { if (line.q === 1 && !line.w) setQty(line, 'q', askQty.q); askQty = null; }
    if (x) { line.x = x; line.bs = bs || null; line.xmiss = false; }
    if (extra) Object.assign(line, extra);
    clearAdj();
    drawCart();
    return line;
  }
  // an item that was sold in the last year but has NO stock (owner 2026-11-21): it goes in like any item, with no stock, as PharmaFly sells it;
  // the expiry is typed by him as PharmaFly asks for it (there is no batch to choose from). Not asked: the sticker's own expiry, or an item
  // PharmaFly says has no expiry
  function pickZero(it, sr) {
    if (sr && sr.exp) return add(it, sr.exp, { k: 0, u: 0 }, { sold0: true });
    if (!it.hasExp) return add(it, null, null, { sold0: true });
    openType(it, null);
    return null;
  }
  // An item goes in with an expiry the owner CHOSE (owner 2026-11-21: «ما ينزلش اي صلاحية»): the system asks which batch is sold and never
  // takes one for him. Not asked: the sticker's own barcode (its month and year ARE the batch in his hand), an item with no expiry in
  // PharmaFly, or one with nothing in stock to choose from. Returns the line, or null while the question is open.
  async function pick(it, sr) {
    if (it.sold0) return pickZero(it, sr);
    const wait = (p) => Promise.race([p, new Promise((r) => setTimeout(r, 4000))]);
    if (batchP) await wait(batchP);
    else if (!batches) await wait(loadBatches());
    else if (Date.now() - batchAt > 3 * 60 * 1000) loadBatches();   // refreshed behind the sale, never waited for
    const info = batchInfo(it.item_id), sx = sr && sr.exp;
    if (sx) {
      const b = info.list ? info.list.find((r) => r.x === sx) : null;
      return add(it, sx, info.state === 'unknown' ? null : b ? { k: b.k, u: b.u } : { k: 0, u: 0 });
    }
    if (info.state === 'unknown') { const line = add(it, null); line.xmiss = true; drawCart(); return line; }
    // a RETURN of an item with nothing in stock to choose from: PharmaFly asks for the expiry printed on the box (owner 2026-11-22), so the system asks the same
    if (kind === 'return' && (info.state === 'nostock' || info.state === 'empty') && it.hasExp !== false) { openType(it, null, 'return'); return null; }
    if (info.state !== 'list') return add(it, null);
    openExp(it, info, null);
    return null;
  }
  // ---------- the question «أنهي صلاحية؟» ----------
  function expSheet() {
    let el = $('tsExp');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tsExp'; el.className = 'ts-expsheet hidden';
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-ts-xpick],[data-ts-xclose],[data-ts-xok],[data-ts-xtype]');
        if (!t) return;
        if (t.hasAttribute('data-ts-xclose')) { expFor = null; drawExp(); return; }
        if (t.hasAttribute('data-ts-xok')) { submitType(); return; }
        if (t.hasAttribute('data-ts-xtype')) { const f = expFor; if (f) openType(f.it, f.line, 'return'); return; }
        chooseExp(t.dataset.tsXpick);
      });
      document.body.appendChild(el);
    }
    return el;
  }
  function drawExp() {
    const el = expSheet(), f = expFor;
    if (!f) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    if (f.type) return drawType(el, f);
    const was = f.line ? f.line.x : null;
    const qt = (b) => (root.AskerStockLib ? root.AskerStockLib.qtyText(b.k, b.u, f.info.p) : String(b.k));
    const rows = f.info.list.map((b) => {
      const e = expInfo(b.x);
      return `<button type="button" class="ts-exp-row${e.soon ? ' soon' : ''}${b.x === was ? ' on' : ''}" data-ts-xpick="${esc(b.x)}"><span class="ts-exp-d" dir="ltr">${esc(b.x.slice(5, 7))}/${esc(b.x.slice(0, 4))}</span>${e.gone ? '<small>منتهية</small>' : e.soon ? '<small>قربت</small>' : ''}<b>${esc(qt(b))}</b></button>`;
    }).join('');
    el.innerHTML = `<div class="ts-exp-back" data-ts-xclose></div><div class="ts-exp-card"><strong class="notr">${esc(nameOf(f.it))}</strong>` +
      `<p class="hint"><span>${kind === 'return' ? 'اختار صلاحية العلبة اللي رجعت' : 'اختار الصلاحية اللي هتتباع'}</span>${f.line ? '' : ' <span>(الصنف مش هيتضاف قبل ما تختار)</span>'}</p><div class="ts-exp-list">${rows}</div>` +
      // a return whose box carries an expiry that is not in stock any more (owner 2026-11-22: «لو مش موجودة اكنسلها … ويعمل لي مكان اكتب فيه الصلاحية الفعلية»): type it, as in PharmaFly
      (kind === 'return' ? '<button type="button" class="secondary ts-exp-other" data-ts-xtype>الصلاحية مش هنا؟ اكتبها</button>' : '') +
      (batchData ? `<p class="hint"><span>الرصيد حسب داتا</span> <span dir="ltr">${esc(batchData.replace('T', ' ').slice(0, 16))}</span></p>` : '') +
      '<button type="button" class="secondary" data-ts-xclose>إلغاء</button></div>';
    el.classList.remove('hidden');
    const first = el.querySelector('.ts-exp-row.on') || el.querySelector('.ts-exp-row');
    if (first) first.focus();
  }
  function openExp(it, info, line) { expFor = { it, info, line }; drawExp(); }
  // ---------- an item with no stock: the expiry is TYPED, as PharmaFly asks for it (owner 2026-11-21: «اكتبه لها زي فارما فلاي») ----------
  // why: 'return' = a returned box whose expiry is typed from the box itself; otherwise an item with no stock
  function openType(it, line, why) { expFor = { it, line, type: true, why: why || '' }; drawExp(); }
  function drawType(el, f) {
    const was = f.line && f.line.x ? `${f.line.x.slice(5, 7)}/${f.line.x.slice(0, 4)}` : '';
    el.innerHTML = `<div class="ts-exp-back" data-ts-xclose></div><div class="ts-exp-card"><strong class="notr">${esc(nameOf(f.it))}</strong>` +
      (f.why === 'return'
        ? '<p class="hint"><span>اكتب الصلاحية اللي على العلبة اللي رجعت، زي ما بتكتبها في فارمافلاي (شهر وسنة):</span></p>'
        : '<p class="hint"><span>مفيش رصيد على الصنف ده. اكتب الصلاحية زي ما بتكتبها في فارمافلاي (شهر وسنة):</span></p>') +
      `<input id="tsExpIn" class="ts-exp-in" type="text" inputmode="numeric" autocomplete="off" dir="ltr" maxlength="7" placeholder="03/2028" aria-label="الصلاحية" value="${esc(was)}" />` +
      '<p id="tsExpMsg" class="hint ts-exp-msg"></p>' +
      '<div class="ts-exp-acts"><button type="button" class="ts-exp-ok" data-ts-xok>ضيف</button><button type="button" class="secondary" data-ts-xclose>إلغاء</button></div></div>';
    el.classList.remove('hidden');
    const inp = $('tsExpIn');
    inp.addEventListener('input', typeMsg);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitType(); } });
    typeMsg();
    inp.focus(); inp.select();
  }
  // under the box: the date as it is read («صلاحية 03/2028»), or what is wrong with it
  function typeMsg(bad) {
    const inp = $('tsExpIn'), msg = $('tsExpMsg');
    if (!inp || !msg) return;
    const x = parseExp(inp.value), e = x ? expInfo(x) : null;
    msg.className = 'hint ts-exp-msg';
    if (bad === 'gone') { msg.className += ' bad'; msg.innerHTML = '<span>الصلاحية دي خلصت: الصنف منتهي</span>'; return; }
    if (!inp.value.trim()) { msg.innerHTML = ''; return; }
    if (!x) { msg.className += ' bad'; msg.innerHTML = '<span>اكتب الشهر والسنة، زي 03/2028</span>'; return; }
    msg.innerHTML = `<span>${esc(e.text)}</span> ✓`;
  }
  function submitType() {
    const f = expFor;
    if (!f || !f.type) return;
    const x = parseExp($('tsExpIn') ? $('tsExpIn').value : '');
    if (!x) return typeMsg();
    if (kind !== 'return' && expInfo(x).gone) return typeMsg('gone');   // a sale never takes an expired batch
    expFor = null; drawExp();
    if (f.line) {
      const l = f.line;
      if ((l.x || null) === x) return;
      const other = cart.find((o) => o !== l && o.c === l.c && (o.x || null) === x);
      if (other) { other.q += l.q; other.w += l.w; cart.splice(cart.indexOf(l), 1); } else { l.x = x; l.bs = { k: 0, u: 0 }; l.xmiss = false; }
      clearAdj(); drawCart();
      return;
    }
    add(f.it, x, { k: 0, u: 0 }, { sold0: true });
    say('tsFind', 'اتضاف: ' + nameOf(f.it), 'ok');
  }
  function chooseExp(x) {
    const f = expFor;
    if (!f) return;
    const b = f.info.list.find((r) => r.x === x), bs = b ? { k: b.k, u: b.u } : null;
    expFor = null; drawExp();
    if (f.line) {
      const l = f.line;
      if ((l.x || null) === x) return;
      const other = cart.find((o) => o !== l && o.c === l.c && (o.x || null) === x);
      if (other) { other.q += l.q; other.w += l.w; other.bs = bs; cart.splice(cart.indexOf(l), 1); } else { l.x = x; l.bs = bs; l.xmiss = false; }
      clearAdj(); drawCart();
      return;
    }
    add(f.it, x, bs);
    say('tsFind', 'اتضاف: ' + nameOf(f.it), 'ok');
  }
  function hitCard(it) {
    const stock = root.AskerStockLib ? root.AskerStockLib.qtyText(it.packs, it.units, it.parts) : '';
    const price = Number(it.price) ? ' · ' + money(it.price) : '';
    // the photo BESIDE the button (a button inside a button is not valid): the name adds the item, the photo opens «تعديل الصنف»
    return photoRow(it.item_id, it.name, nameOf(it), `<button type="button" class="ts-hit" data-ts-add="${esc(it.item_id)}">
      <strong class="notr">${esc(nameOf(it))}</strong>${it.sold0 ? ' <span class="ts-tag">مفيش رصيد</span>' : ''}
      <small>كود ${esc(it.item_id)}${esc(price)} · رصيد ${esc(it.nostock ? 'مفيش' : stock)}</small></button>`);
  }
  async function find() {
    const q = $('tsQ').value.trim();
    $('tsClear').classList.toggle('hidden', !q);
    showQuick();
    if (way === 'code') {
      const code = stickerCode(q);
      if (!q) { $('tsHits').innerHTML = ''; return say('tsFind', ''); }
      if (!code) { $('tsHits').innerHTML = ''; return say('tsFind', 'اكتب كود الصنف أو الرقم اللي فوق الباركود', 'bad'); }
      const it = await itemByCode(code);
      if ($('tsQ').value.trim() !== q) return; // typed more meanwhile
      $('tsHits').innerHTML = it ? hitCard(it) : '';
      return say('tsFind', it ? '' : `مفيش صنف بالكود ${code}`, it ? '' : 'bad');
    }
    if (q.length < 2) { $('tsHits').innerHTML = ''; return say('tsFind', items.length ? '' : 'بيحمّل الأصناف…'); }
    const hits = root.AskerStockLib ? root.AskerStockLib.search(q, items, 8) : [];
    // then the ones SOLD in the last 12 months that have no stock now (owner 2026-11-21): tagged «مفيش رصيد», sold with no stock as PharmaFly does
    const zh = root.AskerStockLib && zItems.length ? root.AskerStockLib.search(q, zItems.filter((z) => !byId.has(z.item_id)), 6) : [];
    $('tsHits').innerHTML = hits.map(hitCard).join('') + (zh.length ? `<div class="ts-sep">اتباعوا قبل كده ومفيش رصيد دلوقتي</div>${zh.map(hitCard).join('')}` : '');
    say('tsFind', hits.length || zh.length ? '' : zItems.length ? 'مفيش صنف بالاسم ده: لا عليه رصيد ولا اتباع في آخر سنة' : 'مفيش صنف عليه رصيد بالاسم ده');
  }
  // a picked item closes the list at once, in sale and return, by name as by code (owner 2026-11-15: the list stayed open
  // under the search after picking Augmentin); the box empties for the next item and keeps its focus
  function closeHits() {
    $('tsQ').value = '';
    $('tsHits').innerHTML = '';
    $('tsClear').classList.add('hidden');
    showQuick();
  }
  function setWay(w) {
    way = w;
    document.querySelectorAll('[data-ts-way]').forEach((b) => b.classList.toggle('on', b.dataset.tsWay === w));
    const box = $('tsQ');
    box.value = '';
    box.inputMode = w === 'code' ? 'numeric' : 'text';
    box.placeholder = w === 'code' ? 'كود الصنف أو الرقم اللي فوق الباركود' : 'اكتب حرفين من اسم الصنف…';
    $('tsHits').innerHTML = '';
    say('tsFind', '');
    $('tsSearch').classList.toggle('hidden', w === 'scan');
    showQuick();
    if (w === 'scan') startScan(); else stopScan();
  }

  // ---------- the camera (the PharmaFly sticker's barcode) ----------
  // a reading counts only when the same value comes twice in a row (one frame can misread a bar)
  let stream = null, timer = null, detector = null, busy = false, lastRaw = '', lastAt = 0, seenRaw = '', seenAt = 0;
  // The camera (owner 2026-11-13 «مبتقراش خالص … الكاميرا اللي انت مختارها»): every straight-line barcode kind is read
  // again (the sticker's kind is not known yet: leaving out ITF/codabar stopped every reading); safety comes from the same
  // value twice in a row and a whole sticker number only. The back camera is asked at a high resolution with continuous
  // focus; «🔄 كاميرا تانية» goes through the phone's cameras (the choice is kept on this phone).
  // The right camera stays by itself (owner 2026-11-13 «عاوز يثبت عالكاميرا الصح، معايا بهايم»): with no choice yet the
  // phone's main back camera is taken (Android names it «camera2 0, facing back»; the others are the wide / zoom lenses);
  // the camera that reads a sticker is kept on this phone (CAMKEY) and the switch hides; it shows again only after
  // QUIET_MS with nothing read.
  const CAMKEY = 'asker-ts-cam', QUIET_MS = 10000;
  let cams = [], lastGood = 0, quietTimer = null;
  const camNow = () => (stream && stream.getVideoTracks()[0] ? stream.getVideoTracks()[0].getSettings().deviceId || '' : '');
  function showSwitch(on) { const b = $('tsCam'); if (b) b.classList.toggle('hidden', !on || cams.length < 2); }
  async function openCamera(deviceId) {
    const video = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    if (deviceId) video.deviceId = { exact: deviceId }; else video.facingMode = { ideal: 'environment' };
    const s = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const track = s.getVideoTracks()[0];
    try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
    return s;
  }
  // the phone's cameras, back ones first (names are known only after the first permission)
  async function listCams() {
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const back = all.filter((d) => /back|rear|environment|خلف/i.test(d.label));
      cams = back.length ? [...back, ...all.filter((d) => !back.includes(d))] : all;
    } catch (e) { cams = []; }
  }
  // the usual scanner beep on a sticker read (a low buzz when the reading is not a sticker); started on the tap itself so
  // the phone allows the sound (owner 2026-11-13: «تطلع صوت زي اصوات الباركود المعتاده»)
  let actx = null;
  function unlockBeep() {
    try { actx = actx || new (root.AudioContext || root.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; }
  }
  function beep(ok) {
    try {
      if (!actx) return;
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime, len = ok ? 0.12 : 0.28;
      o.type = 'square';
      o.frequency.value = ok ? 2700 : 380;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.setValueAtTime(0.12, t + len - 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + len + 0.01);
    } catch (e) {}
  }
  async function startScan(deviceId) {
    unlockBeep();
    $('tsScanBox').classList.remove('hidden');
    if (!('BarcodeDetector' in root) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('tsScanBox').classList.add('hidden');
      return say('tsFind', 'الموبايل ده مش بيقرا الباركود من السيستم. اكتب الرقم اللي فوق الباركود في «الكود».', 'bad');
    }
    try {
      const all = await root.BarcodeDetector.getSupportedFormats();
      const formats = all.filter((f) => /^(code_128|code_39|code_93|codabar|ean_13|ean_8|itf|upc_a|upc_e)$/.test(f));
      detector = new root.BarcodeDetector(formats.length ? { formats } : undefined);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const saved = deviceId || load(CAMKEY, '');
      try { stream = await openCamera(saved); } catch (e) { if (!saved) throw e; stream = await openCamera(''); }
      await listCams();
      // no camera kept yet: the main back camera instead of whatever the phone gave
      const main = !saved && mainBack(cams);
      if (main && main.deviceId !== camNow()) {
        try { const s2 = await openCamera(main.deviceId); stream.getTracks().forEach((t) => t.stop()); stream = s2; } catch (e) {}
      }
      const v = $('tsVideo');
      v.srcObject = stream;
      await v.play();
      say('tsFind', 'وجّه الكاميرا على باركود الملصق، وثبّت الموبايل ثانية');
      clearInterval(timer);
      timer = setInterval(tick, 250);
      // the switch only when this camera reads nothing for a while
      showSwitch(false);
      lastGood = Date.now();
      clearInterval(quietTimer);
      quietTimer = setInterval(() => { if (stream && Date.now() - lastGood > QUIET_MS) showSwitch(true); }, 1000);
    } catch (e) {
      stopScan();
      say('tsFind', 'الكاميرا ما اتفتحتش: ' + (e && e.message ? e.message : e), 'bad');
    }
  }
  // the next camera on the phone
  async function nextCam() {
    if (cams.length < 2) return;
    const now = stream && stream.getVideoTracks()[0] ? stream.getVideoTracks()[0].getSettings().deviceId : '';
    const i = cams.findIndex((c) => c.deviceId === now), next = cams[(i + 1) % cams.length];
    keep(CAMKEY, next.deviceId);
    await startScan(next.deviceId);
  }
  const STRIP = 7 / 2;
  let canvas = null;
  // the strip's part of the picture, on a canvas (the whole picture when the camera has no size yet)
  function stripOf(v) {
    const b = stripBox(v.videoWidth, v.videoHeight, STRIP);
    if (!b) return v;
    canvas = canvas || document.createElement('canvas');
    if (canvas.width !== b.sw || canvas.height !== b.sh) { canvas.width = b.sw; canvas.height = b.sh; }
    canvas.getContext('2d').drawImage(v, b.sx, b.sy, b.sw, b.sh, 0, 0, b.sw, b.sh);
    return canvas;
  }
  async function tick() {
    if (busy || !detector || !stream) return;
    busy = true;
    try {
      const found = await detector.detect(stripOf($('tsVideo')));
      if (found && found.length) await scanned(String(found[0].rawValue || ''), false, found[0].format);
    } catch (e) {}
    busy = false;
  }
  // sure = the camera read the same value twice in a row (tests and a typed reading pass true)
  // Owner 2026-11-13 («بعض مرة بيقرا كده … مش هينفع», a misread 1634036085 of the sticker 1634760729):
  // - the sticker's kind (ITF) has no check digit, so its value must come 3 times in a row (other kinds 2);
  // - a reading that is not a sticker (or names no item) is a misread: ignored quietly, the camera keeps looking; only a
  //   steady barcode of another kind (a factory EAN on the box) is told, once;
  // - the same sticker still in front of the camera counts once: it must leave the view (GONE_MS) to add one more box.
  const NEED = { itf: 3 }, GONE_MS = 2000;
  let streak = 0, toldRaw = '';
  async function scanned(raw, sure, format) {
    raw = String(raw || '').trim();
    const now = Date.now();
    if (!raw || expFor) return;   // while «أنهي صلاحية؟» is open the camera waits
    if (raw === lastRaw && now - lastAt < GONE_MS) { lastAt = now; return; }
    if (!sure) {
      if (raw === seenRaw && now - seenAt < 1200) streak++; else { seenRaw = raw; streak = 1; }
      seenAt = now;
      if (streak < (NEED[format] || 2)) return;
    }
    seenRaw = ''; streak = 0;
    // every counted reading is kept on this phone (the last 20), to learn the barcodes; never sent anywhere
    const shown = raw + (format ? ` (${format})` : '');
    keep('asker-ts-raw', [shown, ...load('asker-ts-raw', []).filter((x) => x !== shown)].slice(0, 20));
    const sr = stickerRead(raw), it = sr ? await itemByCode(sr.code) : null;
    if (!it) {
      if (!sure && (format === 'itf' || toldRaw === raw)) return; // a misread of the sticker's bars: keep looking
      toldRaw = raw;
      beep(false);
      return say('tsFind', `الكاميرا قرت ${shown}: ده مش رقم ملصق فارمافلاي. اكتب الرقم اللي فوق الباركود في «الكود».`, 'bad');
    }
    lastRaw = raw; lastAt = now;
    beep(true);
    // the sticker carries its own batch's expiry: the line takes that one with no question (it is the batch in his hand, as
    // PharmaFly does when it sells that batch); a sticker with the 6 digits only asks for the expiry like any other way in
    const added = await pick(it, sr);
    // this camera reads the stickers: kept on this phone, the switch hides
    if (stream && camNow()) keep(CAMKEY, camNow());
    lastGood = Date.now();
    showSwitch(false);
    if (navigator.vibrate) navigator.vibrate(60);
    say('tsFind', added ? `اتضاف: ${nameOf(it)} (الباركود ${raw})` : '', added ? 'ok' : '');
  }
  function stopScan() {
    clearInterval(timer); timer = null;
    clearInterval(quietTimer); quietTimer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    const box = $('tsScanBox');
    if (box) box.classList.add('hidden');
  }

  // ---------- the bill ----------
  // under the item's name, as in PharmaFly's sale: its stock (the chosen expiry's when there is one); red when the bill asks more than the stock
  function lineInfo(l) {
    const stock = l.nostock ? 'مفيش' : root.AskerStockLib ? (l.bs ? root.AskerStockLib.qtyText(l.bs.k, l.bs.u, l.k) : root.AskerStockLib.qtyText(l.sp, l.su, l.k)) : '';
    const short = kind !== 'return' && (overStock(l) || l.nostock);
    // sold in the last year with no stock: sold with no stock, as PharmaFly does: a quiet note, not the red warning (owner 2026-11-21)
    const warn = l.sold0 ? (kind !== 'return' ? '<div class="ts-note">مفيش رصيد: هتتباع من غير رصيد (زي فارمافلاي)</div>' : '') : short ? '<div class="ts-warn">⚠️ الكمية أكتر من الرصيد</div>' : '';
    return `<div class="ts-info"><span>${l.bs && !l.sold0 ? 'رصيد التشغيلة' : 'رصيد'} ${esc(stock)}</span>${warn}</div>`;
  }
  // the expiry the owner chose for this line (✓ + «تغيير»); «مش متاحة» when the batches file could not be read
  function expRow(l) {
    if (l.x) {
      const e = expInfo(l.x), more = e.gone ? ' · <span>منتهية</span>' : e.soon ? ' · <span>قربت</span>' : '';
      return `<div class="ts-exp${e.soon ? ' soon' : ''}"><span>${esc(e.text)} ✓${more}</span>${l.sold0 || batchInfo(l.c).state === 'list' ? '<button type="button" class="linklike" data-ts-xchg>تغيير</button>' : ''}</div>`;
    }
    // an alternative that took a line's place (no expiry yet): its batch is chosen, never taken for him
    if (!l.sold0 && kind !== 'return' && batchInfo(l.c).state === 'list') return '<div class="ts-exp none"><span>اختار الصلاحية</span><button type="button" class="linklike" data-ts-xchg>اختار</button></div>';
    return l.xmiss ? '<div class="ts-exp none"><span>الصلاحية مش متاحة دلوقتي</span></div>' : '';
  }
  // ---------- «🔁 بدائل» on a bill line (owner 2026-11-28; the list and its rules: ar/home.js, ar_store_generic) ----------
  const subsOpen = new WeakSet();
  // the ingredient list arrives after the bill was drawn: the buttons appear
  if (root.addEventListener) root.addEventListener('asker-subs', () => { if (cart.length && $('tsCart')) drawCart(); });
  // the alternatives of a line that have stock now, from this screen's stock list; none on a return
  function lineSubs(l) {
    const H = root.AskerHomeLib, S = root.AskerHome && root.AskerHome.subs ? root.AskerHome.subs() : null;
    if (!H || !H.subsOf || !S || kind === 'return') return [];
    const asIt = (r) => ({ id: r.item_id, en: r.name, ar: r.arabic_name, stock: { packs: r.packs, units: r.units, price: r.price, parts: r.parts }, price: r.price });
    const me = { id: l.c, en: l.n, stock: { packs: l.sp, units: l.su, price: l.base }, price: l.base };
    return H.subsOf(me, S, { get: (id) => { const r = byId.get(Number(id)); return r ? asIt(r) : undefined; } });
  }
  function subsChip(l, list) {
    return list.length ? `<button type="button" class="chip ts-subs-b${subsOpen.has(l) ? ' on' : ''}" data-ts-subs>🔁 بدائل (${list.length})</button>` : '';
  }
  function subsPanel(l, list) {
    if (!list.length || !subsOpen.has(l)) return '';
    const H = root.AskerHomeLib, lib = root.AskerStockLib, S = root.AskerHome.subs(), w = H.subsWhy(S && S.byItem.get(String(l.c)));
    const rows = list.map((x) => {
      const s = x.it.stock, q = lib ? lib.qtyText(s.packs, s.units, s.parts) : '', d = H.diffText(x.diff);
      return `<button type="button" class="hs-sub" data-ts-swap="${esc(x.it.id)}"><span class="hs-sub-n" dir="ltr">${esc(x.it.en)}</span><span class="hs-sub-q">${esc(q)}</span>` +
        `<span class="hs-sub-p">${x.price != null ? esc(money(x.price)) : '—'}</span>` + (d ? `<span class="hs-sub-d ${x.diff < 0 ? 'lo' : x.diff > 0 ? 'hi' : ''}">${esc(d)}</span>` : '') +
        (x.sure ? '' : '<span class="tag warn">اتأكد</span>') + '</button>';
    }).join('');
    return `<div class="hs-subs ts-subs"><div class="hs-subs-w"><span dir="ltr" translate="no">${esc(w.ing)}</span>${w.form ? ` · <span>${esc(w.form)}</span>` : ''}</div>${rows}` +
      '<div class="hs-subs-f">البديل اللي تختاره بينزل مكان الصنف ده · القرار للصيدلي</div></div>';
  }
  // «سعر متغيّر»: the tag and the box's price, typed (PharmaFly's price shown beside it once it is changed)
  function vpRow(l) {
    if (!l.vp) return '';
    const was = l.base && Math.abs(l.base - l.p) > 0.004 ? `<span class="ts-was">في فارمافلاي <b>${esc(money(l.base))}</b></span>` : '';
    return `<div class="ts-vp"><span class="ts-vptag">سعر متغيّر</span><label class="ts-vpl"><span>${l.k > 1 ? 'سعر العلبة' : 'السعر'}</span><input class="ts-vpin" data-ts-vp type="number" inputmode="decimal" min="0" step="0.25" value="${esc(l.p)}" aria-label="سعر الصنف" /></label>${was}</div>`;
  }
  // «علب» / «وحدات»: a box each (owner 2026-11-21), − and + and typed; an item that does not split has no units
  function qbox(l, which) {
    const label = which === 'q' ? 'علب' : 'وحدات';
    if (which === 'w' && !(l.k > 1)) return `<div class="ts-qbox off"><span class="ts-ql">${label}</span><span class="ts-qoff">ما بتتقسمش</span></div>`;
    const v = which === 'q' ? l.q : l.w;
    return `<div class="ts-qbox"><span class="ts-ql">${label}</span><span class="ts-qctl"><button type="button" data-ts-minus="${which}" aria-label="أقل">−</button><input class="ts-qn" data-ts-n="${which}" type="number" inputmode="numeric" min="0" step="1" value="${esc(v)}" aria-label="${label}" /><button type="button" data-ts-plus="${which}" aria-label="أكتر">+</button></span></div>`;
  }
  function drawCart() {
    const box = $('tsCart');
    if (!box) return;
    if (!cart.length) {
      box.innerHTML = '<p class="hint">لسه مفيش أصناف. دوّر على صنف ودوس عليه.</p>';
    } else {
      // the newest line on top, the oldest at the bottom (owner 2026-11-22: «الاصناف الاقدم تحت والاحدث فوق … بضطر افر الفاتورة كلها»);
      // only the drawing is turned: the bill keeps its order (data-i = the line's place in the bill), so the saved sale and PharmaFly's typing stay oldest first
      box.innerHTML = cart.map((l, i) => {
        const head = `<div class="ts-l1"><strong class="notr">${esc(nameOf(l))}</strong><span class="ts-amt">${esc(money(lineTotal(l)))}</span></div>${lineInfo(l)}${expRow(l)}${vpRow(l)}`;
        const calc = l.q > 0 && l.w > 0 ? `<div class="ts-calc"><span>${esc(l.q)}</span> × <span>${esc(money(l.p))}</span> + <span>${esc(l.w)}</span> × <span>${esc(money(l.pu))}</span></div>` : '';
        const alts = lineSubs(l);
        return `<div class="ts-line" data-i="${i}">${photoRow(l.c, l.n, nameOf(l), head)}
        <div class="ts-qrow">${qbox(l, 'q')}${qbox(l, 'w')}</div>${calc}
        <div class="ts-l2"><span class="ts-code">كود ${esc(l.c)}</span>${subsChip(l, alts)}<button type="button" class="ts-del" data-ts-del aria-label="شيل الصنف">✕</button></div>${subsPanel(l, alts)}</div>`;
      }).reverse().join('') +
        `<div class="ts-total"><span>الإجمالي (تقريبي)</span><b>${esc(money(total(cart)))}</b></div>` + adjHtml();
    }
    drawCust();
    drawBills();
  }
  // ---------- the bills open together (up to 3; owner 2026-11-21) ----------
  // the current bill's state, as a bill (what bills[cur] keeps, and what is kept on the phone)
  function snap() {
    return { kind, cart, cust, custOpen, paid: kind === 'return' ? '' : $('tsPaid') ? $('tsPaid').value : '', note: $('tsNote') ? $('tsNote').value : '', adj, adjOpen, adjSign, wait: waitId };
  }
  function persist() { bills[cur] = snap(); keep(BKEY, { cur, bills }); }
  function applyBill(b) {
    kind = b.kind; cart = b.cart; cust = b.cust; custOpen = b.custOpen; adj = b.adj; adjOpen = b.adjOpen; adjSign = b.adjSign; waitId = b.wait || null;
    $('tsPaid').value = b.paid || ''; $('tsNote').value = b.note || '';
    $('tsQ').value = ''; $('tsHits').innerHTML = ''; $('tsClear').classList.add('hidden');
  }
  function drawBills() {
    const el = $('tsBills');
    if (!el) return;
    el.innerHTML = bills.map((b0, i) => {
      const b = i === cur ? { kind, cart, adj } : b0, ret = b.kind === 'return';
      return `<button type="button" class="ts-bill${i === cur ? ' on' : ''}${ret ? ' ret' : ''}" data-ts-bill="${i}"><span>${ret ? 'مرتجع' : 'بيعة'}</span> <b>${i + 1}</b>${b.cart.length ? ` <small>${esc(money(due(b.cart, b.adj)))}</small>` : ''}</button>`;
    }).join('') + (bills.length < MAX_BILLS ? '<button type="button" class="ts-bill add" data-ts-billadd aria-label="بيعة جديدة">＋</button>' : '');
  }
  function switchBill(i) {
    if (i === cur || !bills[i]) return;
    bills[cur] = snap();
    cur = i;
    applyBill(bills[cur]);
    setKind(kind);
  }
  function newBill() {
    if (bills.length >= MAX_BILLS) return;
    bills[cur] = snap();
    bills.push(blankBill());
    cur = bills.length - 1;
    applyBill(bills[cur]);
    setKind('sale');
  }
  // «الفكة»: round down / up to 5 pounds in one tap, or any amount off or added; then «المطلوب»
  function adjHtml() {
    const opts = roundOptions(total(cart));
    return `<div class="chips ts-adj"><span class="ts-adj-l">فكة</span>${opts.map((o) => `<button type="button" class="chip${adj === o.adj && !adjOpen ? ' on' : ''}" data-ts-adj="${o.adj}">${o.adj < 0 ? 'خصم' : 'زوّد'} ${esc(money(Math.abs(o.adj)))}</button>`).join('')}<button type="button" class="chip${adjOpen ? ' on' : ''}" data-ts-adjx>مبلغ تاني</button>${adj || adjOpen ? '<button type="button" class="chip ts-adj-x" data-ts-adj0 aria-label="شيل الفكة">✕</button>' : ''}</div>` +
      (adjOpen ? `<div class="ts-adjx"><span class="chips seg"><button type="button" class="chip${adjSign < 0 ? ' on' : ''}" data-ts-sign="-1">− خصم</button><button type="button" class="chip${adjSign > 0 ? ' on' : ''}" data-ts-sign="1">+ زيادة</button></span><input id="tsAdj" type="number" inputmode="decimal" min="0" step="0.5" aria-label="مبلغ الفكة" placeholder="0" value="${adj ? Math.abs(adj) : ''}" /></div>` : '') +
      (adj || adjOpen ? `<div class="ts-total ts-due"><span>المطلوب${adj ? ` (${adj < 0 ? 'خصم' : 'زيادة'} ${esc(money(Math.abs(adj)))})` : ''}</span><b id="tsDue">${esc(money(due(cart, adj)))}</b></div>` : '');
  }
  // a staff member (ar/staff.js): «مرتجع» and credit customers only when the owner opened them; the owner always
  const can = (p) => !root.AskerStaff || root.AskerStaff.can(p);
  const staffNow = () => !!(root.AskerStaff && root.AskerStaff.isStaff());
  function drawCust() {
    const box = $('tsCust');
    if (!box) return;
    if (!can('credit')) { cust = null; custOpen = false; }
    const ret = kind === 'return', paid = ret ? 0 : Number($('tsPaid').value) || 0, over = ret ? null : overLimit(cust, due(cart, adj), paid);
    let html = `<div class="chips"><button type="button" class="chip${!cust && !custOpen ? ' on' : ''}" data-ts-cash>نقدي</button>${can('credit') ? `<button type="button" class="chip${cust || custOpen ? ' on' : ''}" data-ts-credit>عميل آجل</button>` : ''}</div>`;
    if (cust) {
      // his account with this bill, like a PharmaFly invoice (owner 2026-11-13): before, the bill, paid, after
      const a = account(cust, kind, due(cart, adj), paid);
      html += `<div class="ts-cust${over ? ' warn' : ''}"><strong class="notr">${esc(cust.name)}</strong> <small>كود ${esc(cust.id)}${Number(cust.credit_limit) ? ' · الحد ' + esc(money(cust.credit_limit)) : ''}</small>
        <div class="ts-acct">
          <div><span>حسابه السابق</span><b>${esc(balText(a.before))}</b></div>
          <div><span>${a.ret ? 'قيمة المرتجع' : 'قيمة الفاتورة'}</span><b class="${a.ret ? 'neg' : 'pos'}">${a.ret ? '−' : '+'} ${esc(money(a.amount))}</b></div>
          ${a.paid ? `<div><span>${a.ret ? 'رجّعتله فلوس' : 'دفع'}</span><b class="${a.ret ? 'pos' : 'neg'}">${a.ret ? '+' : '−'} ${esc(money(a.paid))}</b></div>` : ''}
          <div class="ts-acct-after"><span>${a.ret ? 'حسابه بعد المرتجع' : 'حسابه بعد الفاتورة'}</span><b>${esc(balText(a.after))}</b></div>
        </div>
        ${!ret && stopped.has(String(cust.id)) ? '<div class="ts-warn ts-stop">⛔ العميل ده موقوف: البيع ليه كاش بس</div>' : ''}
        ${over ? `<div class="ts-warn">⚠️ هيبقى عليه ${esc(money(over.after))} والحد ${esc(money(over.lim))}: هيعدّي الحد بالبيعة دي</div>` : ''}
        <button type="button" class="linklike" data-ts-change>غيّر العميل</button></div>`;
    } else if (custOpen) {
      html += `<div class="search"><input id="tsCQ" type="search" autocomplete="off" aria-label="العميل" placeholder="اسم العميل أو الكود…" />${root.AskerVoice ? root.AskerVoice.button('#tsCQ', 'قول اسم العميل', 'replace') : ''}</div><div id="tsCHits"></div>`;
    }
    const q = $('tsCQ') ? $('tsCQ').value : '';
    box.innerHTML = html;
    // a credit customer: what he paid now. A return has no such box: «مفيش مرتجع ولا بيع نقدي بيندفع منه جزء» (his rule 2026-11-22), and the robot
    // never typed it anyway (review 2026-11-23 money-12: the drawer could come up short with no trace)
    $('tsPaidRow').classList.toggle('hidden', !cust || ret);
    $('tsPaidLbl').textContent = 'دفع كام؟';
    if ($('tsCQ')) { $('tsCQ').value = q; drawCustHits(); }
    // the bill changed after the «over the limit» question: the question starts again
    if (overSure && overSure !== overKey()) { overSure = ''; saveLabel(); }
    persist();   // every change of the bill (lines, kind, customer, what he paid) passes here: the bills stay on the phone
  }
  function drawCustHits() {
    const q = $('tsCQ').value.trim(), F = root.AskerFuzzy;
    let hits = [];
    if (/^\d+$/.test(q)) hits = customers.filter((c) => String(c.id) === q);
    else if (q.length >= 2 && F) hits = F.rank(q, customers, (c) => [F.fold(c.name)], 8);
    $('tsCHits').innerHTML = hits.map((c) => `<button type="button" class="ts-hit" data-ts-cust="${esc(c.id)}"><strong class="notr">${esc(c.name)}${stopped.has(String(c.id)) ? ' ⛔' : ''}</strong><small>كود ${esc(c.id)} · عليه ${esc(money(Math.max(0, Number(c.balance) || 0)))}</small></button>`).join('') ||
      (q.length >= 2 ? '<p class="status">مفيش عميل بالاسم ده</p>' : '');
  }

  // ---------- saving: on the phone first, then to the server ----------
  const uuid = () => (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
  // a credit bill over the customer's limit (owner 2026-11-22: «لازم يبان لي على السيستم إنه متجاوز، وانا اقرر ساعتها … لكن انا لو وافقت خلاص»): the owner's first tap only
  // says so; a second tap saves it WITH his approval (when, by how much; the server signs who), and the robot then passes PharmaFly's «متجاوز» without asking.
  // A staff member's bill over the limit carries no approval: the robot stops on it and asks the owner.
  let overSure = '', stopSure = '';
  const overKey = () => (cust ? `${cust.id}|${due(cart, adj)}|${Number($('tsPaid') && $('tsPaid').value) || 0}` : '');
  const overNow = () => (kind !== 'return' && cust ? overLimit(cust, due(cart, adj), Number($('tsPaid') && $('tsPaid').value) || 0) : null);
  function saveLabel() {
    const b = $('tsSave');
    if (b) b.textContent = kind === 'return' ? 'احفظ المرتجع' : overSure ? 'موافق: احفظها متجاوزة الحد' : 'احفظ البيعة';
  }
  async function save() {
    if (!cart.length) return say('tsStatus', 'ضيف صنف الأول', 'bad');
    // «وقّف الآجل» (review 2026-11-23 money-6): a credit sale for a customer the owner stopped is his call only. Staff cannot save it (it used to be a warning,
    // and the robot then typed it on credit); the owner saves it with a second tap, like the limit.
    if (kind !== 'return' && cust && stopped.has(String(cust.id))) {
      if (staffNow()) return say('tsStatus', '⛔ العميل ده موقوف: البيع ليه كاش بس. غيّر العميل لـ «نقدي» أو كلّم صاحب الصيدلية.', 'bad');
      const sk = 'stop|' + overKey();
      if (stopSure !== sk) { stopSure = sk; return say('tsStatus', '⛔ العميل ده موقوف والبيع ليه كاش بس. لو عاوز تبيعه آجل برضه دوس «احفظ» تاني.', 'bad'); }
    }
    stopSure = '';
    const over = overNow();
    let ok = null;
    if (over && !staffNow()) {
      if (overSure !== overKey()) {
        overSure = overKey(); saveLabel();
        return say('tsStatus', `العميل هيعدّي الحد: هيبقى عليه ${money(over.after)} والحد ${money(over.lim)}. لو موافق دوس «احفظ» تاني.`, 'bad');
      }
      ok = { at: new Date().toISOString(), over: r2(over.after - over.lim) };
    }
    overSure = '';
    const rec = record({ id: uuid(), soldAt: new Date().toISOString(), lines: cart, customer: cust, paid: $('tsPaid').value, note: $('tsNote').value, kind, adjust: adj });
    if (ok) { rec.limit_ok_at = ok.at; rec.limit_over = ok.over; }
    if (rec.items.length > 60) return say('tsStatus', 'البيعة كبيرة: احفظ جزء منها وافتح بيعة تانية للباقي', 'bad');   // the server keeps 60 entries a bill (a line with boxes and units is two)
    queue.push(rec);
    keep(QKEY, queue);
    // only THIS bill is saved and emptied; the other open bills stay as they are
    const forWait = kind === 'sale' ? waitId : null;
    bills[cur] = blankBill();
    applyBill(bills[cur]);
    setKind('sale');
    drawBadge();
    say('tsStatus', 'اتحفظت على الموبايل…', 'ok');
    if (forWait) markWait(forWait);
    const left = await flush();
    say('tsStatus', left ? 'اتحفظت على الموبايل، وهتتبعت أول ما النت يرجع' : 'اتحفظت ✓', 'ok');
  }
  // the waiting-list request this bill came from (owner 2026-11-22): a saved bill = the medicine was handed over, «اتسلّم»; best effort (the waiting list has the same button by hand)
  async function markWait(id) { try { if (db()) await db().rpc('ar_waitlist_set', { p_id: Number(id), p_action: 'delivered' }); } catch (e) {} }
  // «🧾 بيعها» on the waiting list (owner 2026-11-22: «ادوس عليه يعمل لي الصنف بيعة ويدخله هنا في الفواتير»): the request's item goes into a NEW bill (the open one when it is still empty),
  // the usual way (the batch is chosen, a variable-price box shows), with the customer in the note; saving that bill marks the request «اتسلّم»
  async function startFor(o) {
    bind();
    if (!ready) await open();
    for (let i = 0; i < 40 && !items.length; i++) await new Promise((r) => setTimeout(r, 150));   // the screen's items are still loading (opened a moment ago): wait for them, up to 6 s
    showView('new');
    if (cart.length) {
      if (bills.length >= MAX_BILLS) { say('tsFind', 'فيه 3 بيعات مفتوحة. احفظ واحدة الأول وجرّب تاني', 'bad'); return false; }
      newBill();
    }
    setKind('sale');
    waitId = String(o.wait_id);
    $('tsNote').value = ('طلب انتظار: ' + (o.who ? o.who + ' · ' : '') + (o.phone || '')).slice(0, 300);
    askQty = { c: Number(o.item_id), q: Math.max(1, Math.floor(Number(o.qty)) || 1) };
    const it = await itemByCode(Number(o.item_id));
    if (!it) { askQty = null; say('tsFind', 'الصنف ده مش لاقيه في أصناف البيع', 'bad'); return false; }
    await pick(it);
    persist();
    return true;
  }
  // «بيع» or «مرتجع» for the whole bill
  function setKind(k) {
    kind = k === 'return' ? 'return' : 'sale';
    document.querySelectorAll('[data-ts-type]').forEach((b) => b.classList.toggle('on', b.dataset.tsType === kind));
    $('tsNew').classList.toggle('ts-return', kind === 'return');
    overSure = '';
    saveLabel();
    drawCart();
  }
  // sends what is kept on the phone; returns how many are still waiting
  async function flush() {
    if (flushing || !db() || !queue.length) return queue.length;
    flushing = true;
    try {
      for (const rec of [...queue]) {
        const { error } = await db().from('ar_temp_sales').upsert(rec, { onConflict: 'id' });
        if (error) break;
        queue = queue.filter((x) => x.id !== rec.id);
        keep(QKEY, queue);
      }
    } catch (e) {}
    flushing = false;
    drawBadge();
    if (view === 'list') loadList();
    return queue.length;
  }

  // ---------- the list ----------
  async function loadList() {
    if (db()) {
      try {
        const since = new Date(Date.now() - 7 * 864e5).toISOString();
        const cols = 'id,no,sold_at,kind,customer_id,customer_name,items,total,paid,note,status,entered_ticket,created_by';
        // limit_ok_by: the owner's approval of a bill over the limit (migration 202611220100); robot_*: his «ادخلها دلوقتي» and what the robot is doing
        // (migration 202611221500); before they are on the server the list loads without them
        let data = null, error = null;
        for (const extra of [',limit_ok_by,robot_ask_at,robot_state,robot_state_at', ',limit_ok_by', '']) {
          ({ data, error } = await db().from('ar_temp_sales').select(cols + extra).gte('sold_at', since).order('sold_at', { ascending: false }).range(0, 299));
          if (!error || !/limit_ok|robot_/i.test(String(error.message))) break;
        }
        if (!error) server = data || [];
      } catch (e) {}
    }
    drawList();
  }
  const isPending = (s) => s.queued || s.status === 'pending';
  // «🤖 ادخلها دلوقتي» (owner 2026-11-22: «لما ادوس عليه المدخل ينفذ الامر»): the owner's button on a waiting bill that is already on the server. The ask is
  // signed as his by the server; the robot on the laptop takes the bill within a minute (even if somebody is on the laptop) and its state shows on the bill.
  const fresh = (t, min) => !!t && Date.now() - new Date(t).getTime() < min * 60000;
  const canRobot = (s) => !s.queued && s.status === 'pending' && !staffNow();
  function robotState(s) {
    if (s.queued || s.status !== 'pending') return '';
    if (s.robot_state === 'typing' && fresh(s.robot_state_at, 10)) return 'typing';
    if (s.robot_state === 'stopped') return 'stopped';
    return s.robot_ask_at ? 'asked' : '';
  }
  const ROBOT_TAG = { asked: '<span class="ts-st go">🤖 <span>طلبك وصل</span></span> ', typing: '<span class="ts-st go">🤖 <span>بيكتبها دلوقتي</span></span> ', stopped: '<span class="ts-st bad">🤖 <span>وقف</span></span> ' };
  const ROBOT_NOTE = { asked: 'الروبوت هياخدها في أقل من دقيقة · لو الهَب شغال يستنى يخلص', typing: 'فارمافلاي قدام الروبوت على اللاب', stopped: 'الروبوت وقف · سؤاله في «الروبوت محتاج رأيك»' };
  async function robotAsk(ids) {
    if (!db() || !ids.length) return;
    const patch = { robot_ask_at: new Date().toISOString(), robot_state: null, robot_state_at: null };
    const { error } = await db().from('ar_temp_sales').update(patch).in('id', ids);
    if (error) return say('tsListStatus', /robot_/i.test(String(error.message)) ? 'الزرار لسه مش جاهز على السيستم' : 'ماتبعتش: ' + error.message, 'bad');
    for (const s of server) if (ids.includes(s.id)) Object.assign(s, patch);
    say('tsListStatus', ids.length > 1 ? 'طلبك وصل للروبوت: هياخدهم في أقل من دقيقة' : 'طلبك وصل للروبوت: هياخدها في أقل من دقيقة', 'ok');
    drawList();
  }
  // while a bill is asked or being typed, the list looks again every few seconds to show where the robot got to (and stops when nothing is waiting on it)
  let robotT = null;
  function robotWatch() {
    clearTimeout(robotT); robotT = null;
    if (view !== 'list' || !merged(server, queue).some((s) => !s.queued && s.status === 'pending' && (s.robot_ask_at || s.robot_state === 'typing'))) return;
    robotT = setTimeout(() => { robotT = null; loadList(); }, 5000);
  }
  function drawBadge() {
    const n = merged(server, queue).filter(isPending).length, b = $('tsPendN');
    if (!b) return;
    b.textContent = n ? String(n) : '';
    b.classList.toggle('hidden', !n);
  }
  function saleRow(s) {
    const its = Array.isArray(s.items) ? s.items : [];
    const who = s.customer_id ? `<span class="notr">${esc(s.customer_name || '')}</span> (آجل)` : 'نقدي';
    const rs = robotState(s);
    const pay = s.kind === 'payment';   // a customer's payment (owner 2026-11-23, «💵 دفعة» in his statement): no items, the amount is «paid»
    const tag = (rs ? ROBOT_TAG[rs] : '') + (s.kind === 'return' ? '<span class="ts-st r">مرتجع</span> ' : pay ? '<span class="ts-st p">💵 دفعة</span> ' : '') +
      (s.limit_ok_by || s.limit_ok_at ? '<span class="ts-st ok">✓ موافق على التجاوز</span> ' : '') +
      (s.queued ? '<span class="ts-st q">لسه ما اتبعتتش</span>' : s.status === 'entered' ? `<span class="ts-st d"><span>اتدخلت</span>${s.entered_ticket ? ` <span dir="ltr">#${esc(s.entered_ticket)}</span>` : ''}</span>` : '<span class="ts-st w">مستنية</span>');
    const open = openRow === s.id;
    // the owner sees who sold it, always (owner 2026-11-22: «يبقى مكتوب مين اللي باعها كمان، ده شيء اساسي»): a staff member's name, «إنت» for his own
    const sname = !staffNow() && s.created_by && root.AskerStaff ? root.AskerStaff.nameOf(s.created_by) : '';
    const seller = staffNow() ? '' : sname ? `<span class="notr">${esc(sname)}</span>` : '<span>إنت</span>';
    return `<div class="ts-sale${open ? ' open' : ''}" data-ts-row="${esc(s.id)}">
      <button type="button" class="ts-sale-h" data-ts-open><span>${s.no ? '#' + esc(s.no) + ' · ' : ''}${who}${seller ? ` <span class="ts-seller">· <span>باعها</span> ${seller}</span>` : ''}</span>${tag}</button>
      <small>${pay ? `${esc(clock(s.sold_at))} · <span>دفع</span> ${esc(money(s.paid))}` : `${esc(clock(s.sold_at))} · ${esc(countText(its.length))} · ${esc(money(s.total))}${s.paid ? (s.kind === 'return' ? ' · رجعله ' : ' · دفع ') + esc(money(s.paid)) : ''}`}</small>
      ${rs ? `<small class="ts-rn">${esc(ROBOT_NOTE[rs])}</small>` : ''}
      ${open ? `<ul class="ts-items">${pay ? '' : its.map((x) => `<li class="ts-li">${photo(x.c, x.n, x.n)}<span class="ts-li-m"><span class="notr">${esc(x.n)}</span> <small>كود ${esc(x.c)}</small>${x.x && expInfo(x.x) ? ` <small>${esc(expInfo(x.x).text)}</small>` : ''}</span><b>${esc(qtyText(x.q, x.u))}</b></li>`).join('')}</ul>
        ${s.note ? `<p class="hint notr">${esc(s.note)}</p>` : ''}
        ${!s.queued && s.status === 'pending' && !staffNow() ? `<div class="ts-acts"><button type="button" class="ts-robot" data-ts-robot${rs === 'asked' || rs === 'typing' ? ' disabled' : ''}>🤖 <span>ادخلها دلوقتي</span></button><button type="button" data-ts-done>اتدخلت في فارمافلاي</button><button type="button" class="secondary" data-ts-cancel>الغيها</button></div>` : ''}
        ${canDelete(s) ? `<div class="ts-acts"><button type="button" class="secondary ts-delsale${delSure === s.id ? ' sure' : ''}" data-ts-delsale>${delSure === s.id ? 'متأكد؟ دوس تاني تتمسح خالص' : '🗑 امسح'}</button></div>` : ''}` : ''}
    </div>`;
  }
  // «🗑 امسح» (owner 2026-11-22: «المسح ده للفواتير اللي هي ما هياش فعليه … لكن الفواتير اللي بعد كده لازم تفضل مستنيه»): the owner only, a second tap, and only for a bill that never went
  // into PharmaFly with a ticket number (a trial, or one marked «اتدخلت» by hand). One with a PharmaFly ticket stays: it is undone by a return there.
  const canDelete = (s) => !staffNow() && !s.entered_ticket;
  let delSure = '';
  async function delSale(id) {
    const s = merged(server, queue).find((x) => x.id === id);
    if (!s || !canDelete(s)) return;
    if (delSure !== id) { delSure = id; return drawList(); }
    delSure = '';
    if (s.queued) { queue = queue.filter((x) => x.id !== id); keep(QKEY, queue); return drawList(); }
    if (!db()) return;
    const { error } = await db().from('ar_temp_sales').delete().eq('id', id);
    if (error) return say('tsListStatus', 'ماتمسحتش: ' + error.message, 'bad');
    server = server.filter((x) => x.id !== id);
    openRow = '';
    say('tsListStatus', 'اتمسحت', 'ok');
    drawList();
  }
  function drawList() {
    const all = merged(server, queue).filter((s) => s.status !== 'cancelled');
    const pend = all.filter(isPending), done = all.filter((s) => !isPending(s));
    $('tsChips').innerHTML = `<button type="button" class="chip${listKind === 'pending' ? ' on' : ''}" data-ts-kind="pending">مستنية ${pend.length}</button><button type="button" class="chip${listKind === 'entered' ? ' on' : ''}" data-ts-kind="entered">اتدخلت ${done.length}</button>`;
    const rows = listKind === 'pending' ? pend : done;
    // the owner's «ادخّل كل المستني دلوقتي»: every waiting bill already on the server that the robot is not already on
    const robotIds = listKind === 'pending' ? pend.filter((s) => canRobot(s) && !['asked', 'typing'].includes(robotState(s))).map((s) => s.id) : [];
    const topBtn = robotIds.length ? `<button type="button" class="ts-robot-all" data-ts-robot-all>🤖 <span>ادخّل كل المستني دلوقتي</span> <b>${esc(robotIds.length)}</b></button>` : '';
    $('tsRows').innerHTML = topBtn + (rows.map(saleRow).join('') || `<p class="hint">${listKind === 'pending' ? 'مفيش بيعات مستنية' : 'مفيش بيعات اتدخلت آخر 7 أيام'}</p>`);
    drawBadge();
    robotWatch();
  }
  async function mark(id, status) {
    if (!db()) return;
    const now = new Date().toISOString();
    const patch = status === 'entered' ? { status, entered_at: now, updated_at: now } : { status, updated_at: now };
    const { error } = await db().from('ar_temp_sales').update(patch).eq('id', id);
    if (error) return say('tsListStatus', 'ماتحفظش: ' + error.message, 'bad');
    const s = server.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
    drawList();
  }
  function showView(v) {
    view = v;
    document.querySelectorAll('[data-ts-view]').forEach((b) => b.classList.toggle('secondary', b.dataset.tsView !== v));
    $('tsNew').classList.toggle('hidden', v !== 'new');
    $('tsList').classList.toggle('hidden', v !== 'list');
    if (v === 'list') { stopScan(); drawList(); loadList(); }
  }

  // ---------- events ----------
  function bind() {
    const panel = $('tempSalePanel');
    if (!panel || panel.dataset.bound) return;
    panel.dataset.bound = '1';
    $('tsQ').addEventListener('input', find);
    $('tsQ').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const first = $('tsHits').querySelector('[data-ts-add]');
      if (first) { e.preventDefault(); first.click(); }
    });
    $('tsClear').onclick = () => { $('tsQ').value = ''; find(); $('tsQ').focus(); };
    $('tsSave').onclick = save;
    $('tsPaid').addEventListener('input', drawCust);
    panel.addEventListener('input', (e) => {
      if (e.target.id === 'tsCQ') drawCustHits();
      // typing the change amount: only «المطلوب» and the customer's account follow (the box keeps its focus)
      if (e.target.id === 'tsAdj') {
        adj = r2(adjSign * Math.abs(Number(e.target.value) || 0));
        const d = $('tsDue');
        if (d) { d.textContent = money(due(cart, adj)); const lab = d.previousElementSibling; if (lab) lab.textContent = 'المطلوب' + (adj ? ` (${adj < 0 ? 'خصم' : 'زيادة'} ${money(Math.abs(adj))})` : ''); }
        drawCust();
      }
    });
    // a box typed by hand (when he leaves it): «علب» or «وحدات»
    panel.addEventListener('change', (e) => {
      const vpIn = e.target.closest && e.target.closest('.ts-vpin');
      if (vpIn) {
        // «سعر متغيّر»: the price typed by hand (when he leaves the box)
        const line = vpIn.closest('.ts-line'), l = line ? cart[Number(line.dataset.i)] : null;
        if (!l) return;
        setPrice(l, vpIn.value);
        clearAdj(); drawCart();
        return;
      }
      const inp = e.target.closest && e.target.closest('.ts-qn');
      if (!inp) return;
      const line = inp.closest('.ts-line'), l = line ? cart[Number(line.dataset.i)] : null;
      if (!l) return;
      setQty(l, inp.dataset.tsN === 'w' ? 'w' : 'q', inp.value);
      clearAdj(); drawCart();
    });
    $('tsNote').addEventListener('input', persist);
    panel.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t || !panel.contains(t)) return;
      if (t.dataset.tsView) return showView(t.dataset.tsView);
      if (t.dataset.tsWay) return setWay(t.dataset.tsWay);
      if (t.dataset.tsType) return setKind(t.dataset.tsType);
      if (t.id === 'tsCam') return nextCam();
      if (t.dataset.tsBill != null) return switchBill(Number(t.dataset.tsBill));
      if (t.hasAttribute('data-ts-billadd')) return newBill();
      if (t.hasAttribute('data-ts-qk')) { const s = qkState(); s.open = !s.open; keep(QKKEY, s); return drawQuick(); }
      if (t.dataset.tsQkpage != null) { const s = qkState(); s.page = Number(t.dataset.tsQkpage); keep(QKKEY, s); return drawQuick(); }
      if (t.dataset.tsQuick != null) return quickTap(Number(t.dataset.tsQuick));
      if (t.dataset.tsAdd) {
        closeHits();
        const it = await itemByCode(Number(t.dataset.tsAdd));
        if (it && (await pick(it))) say('tsFind', 'اتضاف: ' + nameOf(it), 'ok');
        return;
      }
      const line = t.closest('.ts-line'), l = line ? cart[Number(line.dataset.i)] : null;
      // the two boxes: «علب» (q) and «وحدات» (w)
      if (l && (t.dataset.tsPlus || t.dataset.tsMinus)) {
        const w = (t.dataset.tsPlus || t.dataset.tsMinus) === 'w' ? 'w' : 'q';
        setQty(l, w, (w === 'w' ? l.w : l.q) + (t.dataset.tsPlus ? 1 : -1));
        clearAdj(); return drawCart();
      }
      if (l && t.hasAttribute('data-ts-xchg')) {
        if (l.sold0) { openType({ item_id: l.c, name: l.n, arabic_name: l.ar }, l, kind === 'return' ? 'return' : ''); return; }
        const info = batchInfo(l.c);
        if (info.state === 'list') openExp({ item_id: l.c, name: l.n, arabic_name: l.ar }, info, l);
        return;
      }
      if (l && t.hasAttribute('data-ts-subs')) { if (subsOpen.has(l)) subsOpen.delete(l); else subsOpen.add(l); return drawCart(); }
      // the chosen alternative takes this line's place (owner 2026-11-28), then its batch is asked as when it is added
      if (l && t.dataset.tsSwap) {
        const it = byId.get(Number(t.dataset.tsSwap));
        if (!it) return;
        const was = nameOf(l);
        swapItem(l, it);
        if (isVp(l.c)) l.vp = true;
        subsOpen.delete(l);
        clearAdj(); drawCart();
        say('tsFind', `اتبدّل: ${nameOf(l)} مكان ${was}`, 'ok');
        const wait = (p) => Promise.race([p, new Promise((r) => setTimeout(r, 4000))]);
        if (batchP) await wait(batchP); else if (!batches) await wait(loadBatches());
        const info = batchInfo(l.c);
        if (info.state === 'list') openExp({ item_id: l.c, name: l.n, arabic_name: l.ar }, info, l);
        else if (info.state === 'unknown') { l.xmiss = true; drawCart(); }
        return;
      }
      if (l && t.hasAttribute('data-ts-del')) { cart.splice(Number(line.dataset.i), 1); clearAdj(); return drawCart(); }
      // «الفكة»
      if (t.dataset.tsAdj != null) { adj = Number(t.dataset.tsAdj) || 0; adjOpen = false; return drawCart(); }
      if (t.hasAttribute('data-ts-adjx')) { adjOpen = !adjOpen; if (!adjOpen) adj = 0; drawCart(); if (adjOpen && $('tsAdj')) $('tsAdj').focus(); return; }
      if (t.dataset.tsSign) { adjSign = Number(t.dataset.tsSign) < 0 ? -1 : 1; adj = r2(adjSign * Math.abs(adj)); drawCart(); if ($('tsAdj')) $('tsAdj').focus(); return; }
      if (t.hasAttribute('data-ts-adj0')) { clearAdj(); return drawCart(); }
      if (t.hasAttribute('data-ts-cash')) { cust = null; custOpen = false; return drawCust(); }
      if (t.hasAttribute('data-ts-credit') || t.hasAttribute('data-ts-change')) { cust = null; custOpen = true; drawCust(); if ($('tsCQ')) $('tsCQ').focus(); return; }
      if (t.dataset.tsCust) { cust = customers.find((c) => String(c.id) === t.dataset.tsCust) || null; custOpen = false; return drawCust(); }
      if (t.dataset.tsKind) { listKind = t.dataset.tsKind; return drawList(); }
      const row = t.closest('[data-ts-row]');
      if (row && t.hasAttribute('data-ts-open')) { openRow = openRow === row.dataset.tsRow ? '' : row.dataset.tsRow; return drawList(); }
      if (t.hasAttribute('data-ts-robot-all')) {
        const ids = merged(server, queue).filter((s) => isPending(s) && canRobot(s) && !['asked', 'typing'].includes(robotState(s))).map((s) => s.id);
        return robotAsk(ids);
      }
      if (row && t.hasAttribute('data-ts-robot')) return robotAsk([row.dataset.tsRow]);
      if (row && t.hasAttribute('data-ts-done')) return mark(row.dataset.tsRow, 'entered');
      if (row && t.hasAttribute('data-ts-cancel')) { if (root.confirm('تلغي البيعة دي؟ مش هتتدخل في فارمافلاي.')) mark(row.dataset.tsRow, 'cancelled'); }
      if (row && t.hasAttribute('data-ts-delsale')) { delSale(row.dataset.tsRow); return; }
    });
    root.addEventListener('online', flush);
  }
  async function open() {
    bind();
    drawQuick();
    loadBatches();   // the expiry batches: fresh each time the screen opens, never waited for here
    if (!ready) {
      ready = true;
      // the bills kept on the phone (up to 3) come back as they were, even after the page was closed
      const saved = cleanBills(load(BKEY, null));
      bills = saved.bills; cur = saved.cur;
      applyBill(bills[cur]);
      setKind(kind);
      say('tsFind', 'بيحمّل الأصناف…');
      await Promise.all([loadItems(), db() && can('credit') ? loadCustomers() : Promise.resolve()]);
      if (!$('tsQ').value) say('tsFind', items.length ? '' : 'الأصناف لسه ما اتحمّلتش. جرّب تاني لما النت يرجع.', items.length ? '' : 'bad');
    }
    // «مرتجع» only when it is open for him
    const ret = document.querySelector('[data-ts-type="return"]');
    if (ret) ret.classList.toggle('hidden', !can('return'));
    if (!can('return') && kind === 'return') setKind('sale');
    drawBadge();
    flush();
  }
  // leaving the screen turns the camera off
  function close() { stopScan(); if (way === 'scan') setWay('name'); }
  // «💵 دفعة» (owner 2026-11-22/23: «ا، الدفعات», mockup customer_payment_2026-11-22): a customer's payment, recorded from his statement, waits here like a bill
  // (kept on the phone first, then sent) and the robot enters it in PharmaFly his way: one «أصناف متنوعة» line at 0, the customer, the amount in «المدفوع».
  function queuePayment({ customer, amount, note }) {
    const amt = r2(Number(amount) || 0);
    if (!customer || !(Number(customer.id) > 0) || !(amt > 0)) return null;
    const rec = {
      id: uuid(), sold_at: new Date().toISOString(), kind: 'payment',
      customer_id: Number(customer.id), customer_name: String(customer.name || '').slice(0, 120),
      items: [{ c: 1, n: 'أصناف متنوعة', q: 1, u: 'pack', p: 0 }], total: 0, paid: amt, adjust: null,
      note: note ? String(note).trim().slice(0, 300) || null : null, status: 'pending',
    };
    queue.push(rec); keep(QKEY, queue); drawBadge();
    return flush().then(() => rec);
  }
  root.AskerTempSale = { open, close, flush, scanned, startFor, queuePayment };
})(typeof window === 'undefined' ? globalThis : window);
