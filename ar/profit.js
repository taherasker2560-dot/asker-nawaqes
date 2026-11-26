/* «💹 الربح والهامش» (owner 2026-11-25, «ا» on the mockup profit_page_2026-11-25): the pharmacy's profit over a period (7 / 30 / 90 days or one calendar month), each day's profit as a bar,
   and the lists behind it: the items that earned the most, the thin margins (his own number, default 10%), the sales BELOW cost, and what was given away at price 0. Every item opens its latest sales
   and every sale opens the whole invoice, as in «اليوم». COST LAW (his order 2026-11-25): the cost of an item is its LAST PURCHASE, never the card's; the profit stays approximate and says so.
   Data (owner only, written by the laptop, Hub\day\BUILD_DAY.ps1): the headline numbers and the bars come from day/day.json (the same file «اليوم» reads); the lists come from day/p_<period>.json
   (p_7, p_30, p_90, p_m2026-11 …) and a sale's invoice from day/d_<date>.json. Nothing is written from here.
   «الصافي بعد المصروفات» (owner 2026-11-26): the profit above minus the expenses PharmaFly's cash boxes paid on the same days (ar_cash_moves, owner only, written by Store\SYNC_CASH.ps1), each heading
   opening its moves; the owner's own withdrawals are shown apart. It is NOT PharmaFly's «الدخل» (that one is sales − purchases + stock difference − expenses). */
(function (root) {
  'use strict';
  const D = root.AskerDayLib || (typeof require !== 'undefined' ? require('./day.js') : null);
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const FIXED = [['7', '٧ أيام'], ['30', '٣٠ يوم'], ['90', '٩٠ يوم']];
  const WINDOW = 90;          // the laptop builds the period files over the last 90 days (today included)
  const LOW_DEFAULT = 10;     // the thin-margin line, in %: his own number, changed on the screen
  // every fixed word the page draws, whole or as a piece next to a number (the English lines are checked against this list in tests/profit.cjs)
  const WORDS = ['💹 الربح', '💹 الربح والهامش', ...FIXED.map((x) => x[1]), 'شهر معيّن', 'الربح', 'الهامش', 'المبيعات الصافية', 'الفترة من', 'إلى', 'التكلفة من آخر فاتورة شرا للصنف', 'الربح تقريبي',
    'الربح كل يوم (دوسة على العمود تفتح «اليوم»)', 'أكتر أصناف ربحًا', 'هامش ضعيف', 'تحت التكلفة', 'بيع بصفر سعر', 'رجوع', 'ابحث باسم الصنف', 'علبة', 'هامش', 'تكلفة آخر شرا', 'الكمية', 'المبيعات',
    'التكلفة', 'تذكرة', 'بيع', 'والتكلفة', 'خسارة', '✓ مفيش بيع تحت التكلفة', 'تكلفتها (برّه الربح)', 'سطر', 'الأصناف دي في الفترة', 'الربح قبل خصم التذكرة', 'تحديث', 'في الفترة دي', 'الهامش أقل من', 'يوم',
    'بعد المرتجع والخصم', 'من مبيعات الأصناف', 'سطر اتحسب بتكلفة الكارت (مفيش شرا قبله)', 'الصفحة محتاجة ملف اليوم من اللاب: لسه ما وصلش.', 'ملف الأصناف لسه ما وصلش: اللاب بيجهّزه.',
    'آخر بيعات الصنف', 'مفيش أصناف هنا', 'ظاهر أحدث 300 بيعة بس', 'اتصرف من غير سعر', 'تذاكر', 'السعر', 'الإجمالي', 'الصنف', 'خصم', 'دفع', 'الباقي عليه', 'ملاحظة', 'آجل', 'نقدي', 'مرتجع',
    'عميل', 'عميل نقدي', 'الفاتورة دي مش لاقيها', 'من غير سعر', 'بأقل من التكلفة', 'نفس المبلغ اتسجّل شرا من', 'الساعة', 'تكلفتها', 'الأيام اللي فيها بيانات', 'سحب من العلبة', 'وحدة',
    // «الصافي بعد المصروفات» (owner 2026-11-26)
    'الصافي بعد المصروفات', 'الربح من البيع', 'المصروفات', 'الصافي', 'مسحوبات صاحب المنشأة', 'لوحدها، مش مصروف', 'المصروف بيتحسب يوم ما اتدفع: المرتبات والضرايب على دفعات، فصافي الأيام القليلة ممكن يبان غريب.',
    'المصروفات بتتحمّل…', 'المصروفات ما وصلتش من السيرفر: دوس تحديث.', 'مفيش مصروفات متسجلة في الفترة دي', 'حركة', 'ابحث بالملاحظة أو التاريخ', 'من غير ملاحظة', 'مفيش حركات هنا', 'مصروف', ...MONTHS];

  // ---------- pure helpers (also used by tests/profit.cjs) ----------
  const monthLabel = (ym) => MONTHS[Number(String(ym).slice(5, 7)) - 1] + ' ' + String(ym).slice(0, 4);
  // the calendar months the laptop holds days of, newest first ('2026-11')
  function months(data) {
    const seen = [];
    ((data && data.days) || []).forEach((d) => { const k = d.date.slice(0, 7); if (!seen.includes(k)) seen.push(k); });
    return seen.sort().reverse();
  }
  // the first and last day of a period: the last N days up to today, or the days of one month that the laptop's 90-day window holds
  function range(data, key) {
    if (!data || !data.today) return null;
    const today = data.today, lo = D.addDays(today, -(WINDOW - 1));
    if (/^\d+$/.test(String(key))) { const n = Math.min(WINDOW, Math.max(1, Number(key))); return { from: D.addDays(today, -(n - 1)), to: today }; }
    const m = /^m(\d{4}-\d\d)$/.exec(String(key));
    if (!m) return null;
    const ds = data.days.map((d) => d.date).filter((x) => x.slice(0, 7) === m[1] && x >= lo && x <= today).sort();
    return ds.length ? { from: ds[0], to: ds[ds.length - 1] } : null;
  }
  // the headline numbers of a period: the sum of the days' own numbers (day.json), the margin on the items' sales after the tickets' discounts, as each day computes it
  function totals(data, key) {
    const r = range(data, key);
    if (!r) return null;
    const t = { from: r.from, to: r.to, days: 0, sales: 0, rev: 0, disc: 0, cost: 0, profit: 0, free: { lines: 0, cost: 0 }, fb: 0, margin: null };
    for (const d of data.days) {
      if (d.date < r.from || d.date > r.to) continue;
      t.days++; t.sales += d.netSales; t.rev += d.itemsRevenue; t.disc += d.discounts; t.cost += d.cost; t.profit += d.profit;
      t.free.lines += d.free.lines; t.free.cost += d.free.cost; t.fb += d.fallback.lines;
    }
    t.margin = t.rev - t.disc > 0 ? Math.round((t.profit / (t.rev - t.disc)) * 1000) / 10 : null;
    return t;
  }
  // one bar per day of the period, oldest first (a day with no data = 0)
  function chart(data, key) {
    const r = range(data, key), out = [];
    if (!r) return out;
    for (let k = r.from, n = 0; k <= r.to && n < 400; k = D.addDays(k, 1), n++) {
      const f = data.days.find((d) => d.date === k);
      out.push({ date: k, ch: D.dayChar(k), day: Number(k.slice(8, 10)), v: f ? f.profit : 0, has: !!f });
    }
    return out;
  }
  const ls = (a) => (Array.isArray(a) ? a : []).filter((l) => l && l.tk != null).map((l) => ({ d: String(l.d || ''), tk: num(l.tk), q: num(l.q), pr: num(l.pr), c: num(l.c), t: String(l.t || ''), n: String(l.n || '') }));
  const item = (e) => ({ i: num(e.i), n: String(e.n || ''), q: num(e.q), rev: num(e.rev), cost: num(e.cost), profit: num(e.profit), margin: e.margin == null ? null : num(e.margin), cf: !!e.cf, ls: ls(e.ls) });
  // a period file must look like what the laptop writes; anything else is «no data»
  function parse(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.items)) return null;
    const b = o.below && typeof o.below === 'object' ? o.below : {}, f = o.free && typeof o.free === 'object' ? o.free : {};
    return {
      key: String(o.key || ''), from: String(o.from || ''), to: String(o.to || ''), days: num(o.days),
      items: o.items.filter((e) => e && e.n != null).map(item),
      low: (Array.isArray(o.low) ? o.low : []).filter((e) => e && e.n != null).map(item),
      below: { n: num(b.n), loss: num(b.loss), lines: ls(b.lines) },
      free: { lines: num(f.lines), cost: num(f.cost), items: (Array.isArray(f.items) ? f.items : []).filter((e) => e && e.n != null).map((e) => ({ i: num(e.i), n: String(e.n), q: num(e.q), cost: num(e.cost), tickets: num(e.tickets), ls: ls(e.ls) })) },
    };
  }
  // the thin margins: under his line (the list the laptop wrote holds the 150 thinnest items with sales of at least 30; a line above that shows what it has)
  const lowList = (pf, thr) => ((pf && pf.low) || []).filter((e) => e.margin != null && e.margin < num(thr)).sort((a, b) => a.margin - b.margin);
  const unitCost = (e) => (Math.abs(e.q) > 0.0005 ? e.cost / e.q : 0);
  const lineProfit = (l) => Math.round((l.pr - l.c) * l.q * 100) / 100;
  const loss = (l) => Math.round((l.c - l.pr) * l.q * 100) / 100;
  const norm = (s) => D.norm(s);
  const searchItems = (rows, q) => { const w = norm(q).split(' ').filter(Boolean); return w.length ? rows.filter((r) => { const x = norm(r.n); return w.every((y) => x.includes(y)); }) : rows; };
  const searchBelow = (rows, q) => { const w = norm(q).split(' ').filter(Boolean); return w.length ? rows.filter((r) => { const x = norm(r.n + ' ' + r.tk + ' ' + r.d + ' ' + r.t + ' ' + D.hm(r.t)); return w.every((y) => x.includes(y)); }) : rows; };
  // the heights of the bars: the biggest day is full, a day with no profit is a thin line (a loss is drawn flat too)
  const barPct = (list, v) => { const mx = Math.max(1, ...list.map((x) => x.v)); return Math.max(3, Math.round((Math.max(0, v) / mx) * 100)); };
  // «الصافي بعد المصروفات» (owner 2026-11-26, «ا، ابعتها»): the cash moves of the period's own days (ar_cash_moves, the same calendar days as the profit). A move's amount is what it did to the box
  // (minus = money out), so «spent» = −amount: an expense paid back takes itself off. The expense headings are PharmaFly's; the owner's withdrawals are kept apart and are never an expense.
  const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  function spending(rows, r) {
    const heads = new Map(), own = { total: 0, moves: [] };
    let total = 0, n = 0;
    for (const x of Array.isArray(rows) ? rows : []) {
      if (!x || (x.kind !== 'expense' && x.kind !== 'owner')) continue;
      const at = String(x.at || ''), d = at.slice(0, 10);
      if (!r || d < r.from || d > r.to) continue;
      const m = { d, t: at.slice(11, 16), v: round2(-num(x.amount)), memo: String(x.memo || '') };
      if (x.kind === 'owner') { own.total += m.v; own.moves.push(m); continue; }
      const name = String(x.who || '').trim() || 'مصروف';
      if (!heads.has(name)) heads.set(name, { name, total: 0, moves: [] });
      const h = heads.get(name); h.total += m.v; h.moves.push(m); total += m.v; n++;
    }
    const newest = (a, b) => (b.d + b.t).localeCompare(a.d + a.t);
    const list = [...heads.values()].map((h) => ({ name: h.name, total: round2(h.total), moves: h.moves.sort(newest) })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return { total: round2(total), n, heads: list, own: { total: round2(own.total), moves: own.moves.sort(newest) } };
  }
  const searchMoves = (rows, q) => { const w = norm(q).split(' ').filter(Boolean); return w.length ? rows.filter((m) => { const x = norm(m.memo + ' ' + m.d + ' ' + m.t + ' ' + Math.abs(m.v)); return w.every((y) => x.includes(y)); }) : rows; };
  const api = { WORDS, FIXED, WINDOW, LOW_DEFAULT, monthLabel, months, range, totals, chart, parse, lowList, unitCost, lineProfit, loss, searchItems, searchBelow, barPct, spending, searchMoves };
  root.AskerProfitLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const { money, money2, hm, dateText, qtyText, rem, who } = D;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = null, key = '7', files = {}, dets = {}, spends = {}, view = null, thr = LOW_DEFAULT;
  try { const v = Number(root.localStorage && root.localStorage.getItem('pf_low')); if (Number.isFinite(v) && v > 0) thr = v; } catch (e) { /* a private window: the default stays */ }
  const row = (cells, head) => `<tr>${cells.map((c, i) => (head ? `<th${i ? ' class="dy-n"' : ''}>${esc(c)}</th>` : `<td${i ? ' class="dy-n"' : ''}>${c}</td>`)).join('')}</tr>`;
  const pill = (txt, open) => `<button type="button" class="dy-pill dy-ptap" data-pf-open="${open}">${txt} ›</button>`;
  const neg = (v) => (v < 0 ? ' dy-neg' : '');

  async function fetchJson(path) {
    if (!db()) return null;
    try {
      const { data: blob, error } = await db().storage.from('asker-private').download(path);
      return error || !blob ? null : JSON.parse(await blob.text());
    } catch (e) { return null; }
  }
  async function loadDay(force) {
    if (!root.AskerDay) return null;
    data = (!force && root.AskerDay.data && root.AskerDay.data()) || (await root.AskerDay.load());
    return data;
  }
  async function ensure(k, force) {
    const f = files[k];
    if (f && !force && Date.now() - f.at < 4 * 60e3) return f.v;
    const v = parse(await fetchJson('day/p_' + k + '.json'));
    files[k] = { v, at: Date.now() };
    return v;
  }
  // the period's expense and owner moves, page by page (the server gives at most 1000 rows a page: nothing may be cut silently)
  async function fetchMoves(r) {
    const out = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data: page, error } = await db().from('ar_cash_moves').select('id,at,kind,amount,who,memo').in('kind', ['expense', 'owner'])
        .gte('at', r.from + 'T00:00:00').lt('at', D.addDays(r.to, 1) + 'T00:00:00').order('id').range(from, from + 999);
      if (error) throw error;
      out.push(...(page || []));
      if (!page || page.length < 1000) return out;
    }
    throw new Error('too many moves');
  }
  const spendKey = (r) => r.from + '|' + r.to;
  // the net card's data for the period on screen: {v} = ready, {err} = the server did not answer (no net is shown then: a net without its expenses would be false)
  async function ensureSpend(force) {
    const r = data && range(data, key);
    if (!r || !db()) return;
    const k = spendKey(r), c = spends[k];
    if (c && !force && (c.busy || (c.v && Date.now() - c.at < 4 * 60e3))) return;
    spends[k] = { busy: true, v: c && c.v, at: c ? c.at : 0 };
    try { spends[k] = { v: spending(await fetchMoves(r), r), at: Date.now() }; } catch (e) { spends[k] = { err: true, at: Date.now() }; }
    const now = data && range(data, key);
    if (!view && now && spendKey(now) === k) draw();
  }
  const spendNow = () => { const r = data && range(data, key); return (r && spends[spendKey(r)]) || null; };
  const headRow = (label, v, attr, cls) => `<button type="button" class="pf-head${cls || ''}" ${attr}><span>${label}</span><b dir="ltr">${esc(money(v))}</b><i aria-hidden="true">›</i></button>`;
  function netCard(T) {
    const c = spendNow(), S = c && c.v;
    const title = '<h3 class="dy-h">الصافي بعد المصروفات</h3>';
    if (!S) return title + `<div class="dy-card pf-net"><p class="hint">${c && c.err ? 'المصروفات ما وصلتش من السيرفر: دوس تحديث.' : 'المصروفات بتتحمّل…'}</p></div>`;
    const net = round2(T.profit - S.total);
    const heads = S.heads.length ? S.heads.map((h, i) => headRow(`<bdi class="notr">${esc(h.name)}</bdi>`, h.total, `data-pf-head="${i}"`)).join('') : '<p class="hint">مفيش مصروفات متسجلة في الفترة دي</p>';
    const own = S.own.moves.length ? `<div class="dy-card pf-net">${headRow('<span>مسحوبات صاحب المنشأة</span><small>لوحدها، مش مصروف</small>', S.own.total, 'data-pf-own', ' pf-own')}</div>` : '';
    return title + `<div class="dy-card pf-net"><div class="dy-tot"><span>الربح من البيع</span><b dir="ltr">${esc(money(T.profit))}</b></div>` +
      `<div class="dy-tot pf-minus"><span><em>−</em> <span>المصروفات</span></span><b dir="ltr">${esc(money(S.total))}</b></div>${heads}` +
      `<div class="dy-tot pf-total"><span><em>=</em> <span>الصافي</span></span><b dir="ltr" class="${neg(net).trim()}">${esc(money(net))}</b></div>` +
      '<p class="hint">المصروف بيتحسب يوم ما اتدفع: المرتبات والضرايب على دفعات، فصافي الأيام القليلة ممكن يبان غريب.</p></div>' + own;
  }
  // one heading's moves (or the owner's withdrawals), newest first
  function movesOf() {
    const c = spendNow(), S = c && c.v;
    if (!S) return null;
    if (view.kind === 'own') return { name: 'مسحوبات صاحب المنشأة', own: true, total: S.own.total, moves: S.own.moves };
    const h = S.heads.find((x) => x.name === view.head);
    return h ? { name: h.name, total: h.total, moves: h.moves } : null;
  }
  function movesBody() {
    const g = movesOf();
    if (!g) return { rows: '<p class="hint">مفيش حركات هنا</p>', tot: '' };
    const r = searchMoves(g.moves, view.q || '');
    const rows = r.map((m) => `<div class="dy-tk dy-static"><div class="dy-a"><span class="dy-v" dir="ltr">${esc(money2(m.v))}</span><b>${esc(dateText(m.d))}</b></div><div class="dy-bb"><span>${m.memo ? `<bdi class="notr">${esc(m.memo)}</bdi>` : 'من غير ملاحظة'}</span><span>${esc(hm(m.t))}</span></div></div>`).join('');
    return { rows: rows || '<p class="hint">مفيش حركات هنا</p>', tot: `<span>${esc(r.length)} حركة</span><b dir="ltr">${esc(money2(r.reduce((a, m) => a + m.v, 0)))}</b>` };
  }
  function drawMoves() {
    const main = $('pfMain'), g = movesOf(), r = data && range(data, key), b = movesBody();
    const name = !g ? '' : g.own ? esc(g.name) : `<bdi class="notr">${esc(g.name)}</bdi>`;
    main.innerHTML = `<button type="button" class="dy-back" data-pf-back>› رجوع</button><h3 class="dy-h2">${name}</h3>` +
      (g && g.own ? '<p class="hint">لوحدها، مش مصروف</p>' : '') +
      `<div class="dy-search"><span aria-hidden="true">🔎</span><input id="pfSearch" type="search" inputmode="search" autocomplete="off" placeholder="ابحث بالملاحظة أو التاريخ" aria-label="ابحث بالملاحظة أو التاريخ" value="${esc(view.q || '')}" /></div>` +
      (r ? `<p class="hint">الفترة من ${esc(dateText(r.from))} إلى ${esc(dateText(r.to))}</p>` : '') + `<div class="dy-tot" id="pfTot">${b.tot}</div><div id="pfRows">${b.rows}</div>`;
  }
  async function loadTicket(date) {
    if (dets[date]) return dets[date];
    const d = D.parseDetail(await fetchJson('day/d_' + date + '.json'));
    if (d) dets[date] = d;
    return d;
  }

  function bars(list) {
    const few = list.length <= 14, step = list.length > 40 ? 10 : (list.length > 14 ? 5 : 1);
    return list.map((x, i) => `<button type="button" class="pf-bar${i === list.length - 1 ? ' t' : ''}" data-pf-day="${esc(x.date)}" style="height:${barPct(list, x.v)}%" aria-label="${esc(dateText(x.date))}">${few && x.has ? `<em dir="ltr">${esc(money(x.v))}</em>` : ''}<span>${(few || i % step === 0 || i === list.length - 1) ? esc(few ? x.ch : x.day) : ''}</span></button>`).join('');
  }
  function drawMain() {
    const main = $('pfMain');
    if (!main) return;
    if (!data) { main.innerHTML = '<p class="hint">الصفحة محتاجة ملف اليوم من اللاب: لسه ما وصلش.</p>'; return; }
    const T = totals(data, key), f = files[key] && files[key].v;
    const chips = FIXED.map(([k, l]) => `<button type="button" class="dy-chip${k === key ? ' on' : ''}" data-pf-key="${k}">${esc(l)}</button>`).join('');
    const sel = `<select id="pfMonth" class="pf-month${/^m/.test(key) ? ' on' : ''}" aria-label="شهر معيّن"><option value="">شهر معيّن</option>${months(data).map((ym) => `<option value="m${esc(ym)}"${key === 'm' + ym ? ' selected' : ''}>${esc(monthLabel(ym))}</option>`).join('')}</select>`;
    if (!T) { main.innerHTML = `<div class="dy-card"><div class="dy-line">${chips}${sel}</div></div><p class="hint">مفيش بيانات لليوم ده</p>`; return; }
    const kp = `<div class="dy-grid"><div class="dy-k"><small>الربح</small><b class="dy-c" dir="ltr">${esc(money(T.profit))}</b><i>${esc(T.days)} يوم</i></div>` +
      `<div class="dy-k"><small>الهامش</small><b class="dy-c" dir="ltr">${T.margin == null ? '' : esc(T.margin) + '%'}</b><i>من مبيعات الأصناف</i></div>` +
      `<div class="dy-k pf-wide"><small>المبيعات الصافية</small><b dir="ltr">${esc(money(T.sales))}</b><i>بعد المرتجع والخصم</i></div></div>`;
    const ch = chart(data, key);
    const chartHtml = `<h3 class="dy-h">الربح كل يوم (دوسة على العمود تفتح «اليوم»)</h3><div class="dy-card pf-chart"><div class="pf-bars">${bars(ch)}</div></div>`;
    const pills = [pill('أكتر أصناف ربحًا', 'top'), pill('هامش ضعيف', 'low')];
    if (f) pills.push(f.below.n ? pill(`تحت التكلفة ${esc(f.below.n)}`, 'below') : '');
    if (T.free.lines) pills.push(pill(`بيع بصفر سعر ${esc(T.free.lines)} · تكلفتها ${esc(money(T.free.cost))}`, 'free'));
    const ok = f && !f.below.n ? '<div class="dy-card"><span class="dy-ok">✓ مفيش بيع تحت التكلفة</span></div>' : '';
    const fb = T.fb ? `<p class="hint">${esc(T.fb)} سطر اتحسب بتكلفة الكارت (مفيش شرا قبله)</p>` : '';
    main.innerHTML = `<div class="dy-card"><div class="dy-line">${chips}${sel}</div><div class="dy-stamp">الفترة من ${esc(dateText(T.from))} إلى ${esc(dateText(T.to))}<br>التكلفة من آخر فاتورة شرا للصنف · الربح تقريبي</div></div>` +
      kp + netCard(T) + chartHtml + (f ? `<div class="dy-line">${pills.filter(Boolean).join('')}</div>` : '<p class="hint">ملف الأصناف لسه ما وصلش: اللاب بيجهّزه.</p>') + ok + fb;
  }

  // ---------- the lists, one item, one invoice ----------
  const KINDS = { top: 'أكتر أصناف ربحًا', low: 'هامش ضعيف', below: 'تحت التكلفة', free: 'بيع بصفر سعر' };
  function itemRow(e) {
    const m = e.margin == null ? '' : ' · هامش <bdi dir="ltr">' + esc(e.margin) + '%</bdi>';
    return `<button type="button" class="dy-tk" data-pf-i="${esc(e.i)}"><div class="dy-a"><span class="dy-v${neg(e.profit)}" dir="ltr">${esc(money2(e.profit))}</span><b class="notr">${esc(e.n)}</b></div>` +
      `<div class="dy-bb"><span>${esc(qtyText(e.q))} علبة${m}${e.cf ? ' *' : ''}</span><span>تكلفة آخر شرا <bdi class="notr">${esc(money2(unitCost(e)))}</bdi></span></div></button>`;
  }
  function freeRow(e) {
    return `<button type="button" class="dy-tk" data-pf-i="${esc(e.i)}"><div class="dy-a"><span class="dy-v dy-neg" dir="ltr">${esc(money2(e.cost))}</span><b class="notr">${esc(e.n)}</b></div>` +
      `<div class="dy-bb"><span>${esc(qtyText(e.q))} علبة · ${esc(e.tickets)} تذاكر</span><span>تكلفتها</span></div></button>`;
  }
  function belowRow(l) {
    return `<button type="button" class="dy-tk" data-pf-d="${esc(l.d)}" data-pf-t="${esc(l.tk)}"><div class="dy-a"><span class="dy-v dy-neg" dir="ltr">${esc(money2(-loss(l)))}</span><b class="notr">${esc(l.n)}</b></div>` +
      `<div class="dy-bb"><span>${esc(dateText(l.d))} · ${esc(hm(l.t))} · تذكرة ${esc(l.tk)}</span><span>بيع <bdi class="notr">${esc(money2(l.pr))}</bdi> والتكلفة <bdi class="notr">${esc(money2(l.c))}</bdi></span></div></button>`;
  }
  // the rows and the total line of the list on screen (also redrawn on every key typed in the search box)
  function listBody() {
    const f = files[key] && files[key].v, q = view.q || '';
    if (!f) return { rows: '<p class="hint">ملف الأصناف لسه ما وصلش: اللاب بيجهّزه.</p>', tot: '' };
    let rows = [], tot = '';
    if (view.kind === 'top' || view.kind === 'low') {
      const all = view.kind === 'top' ? f.items : lowList(f, thr), r = searchItems(all, q);
      rows = r.map(itemRow);
      tot = `<span>${esc(r.length)} سطر</span><b dir="ltr">${esc(money2(r.reduce((a, e) => a + e.profit, 0)))}</b>`;
    } else if (view.kind === 'below') {
      const r = searchBelow(f.below.lines, q);
      rows = r.map(belowRow);
      tot = `<span>${esc(f.below.n)} سطر${f.below.n > f.below.lines.length ? ' · ظاهر أحدث 300 بيعة بس' : ''}</span><b dir="ltr">خسارة ${esc(money2(f.below.loss))}</b>`;
    } else if (view.kind === 'free') {
      const r = searchItems(f.free.items, q);
      rows = r.map(freeRow);
      tot = `<span>${esc(f.free.lines)} سطر</span><b dir="ltr">تكلفتها ${esc(money2(f.free.cost))}</b>`;
    }
    return { rows: rows.length ? rows.join('') : '<p class="hint">مفيش أصناف هنا</p>', tot };
  }
  function drawList() {
    const main = $('pfMain'), T = totals(data, key);
    const thrBox = view.kind === 'low' ? `<div class="pf-thr"><label for="pfThr">الهامش أقل من</label><input id="pfThr" type="number" inputmode="decimal" min="0" step="1" value="${esc(thr)}" /><span>%</span></div>` : '';
    const note = view.kind === 'top' || view.kind === 'low' ? `<p class="hint">الأصناف دي في الفترة · الربح قبل خصم التذكرة${T ? ' · ' + esc(dateText(T.from)) + ' ← ' + esc(dateText(T.to)) : ''}</p>` : (view.kind === 'free' ? '<p class="hint">اتصرف من غير سعر</p>' : '');
    const b = listBody();
    main.innerHTML = `<button type="button" class="dy-back" data-pf-back>› رجوع</button><h3 class="dy-h2">${esc(KINDS[view.kind])}</h3>` +
      `<div class="dy-search"><span aria-hidden="true">🔎</span><input id="pfSearch" type="search" inputmode="search" autocomplete="off" placeholder="ابحث باسم الصنف" aria-label="ابحث باسم الصنف" value="${esc(view.q || '')}" /></div>` +
      thrBox + note + `<div class="dy-tot" id="pfTot">${b.tot}</div><div id="pfRows">${b.rows}</div>`;
  }
  function findItem(f, id) {
    const hit = (a) => (a || []).find((e) => e.i === id);
    return (view.kind === 'free' ? hit(f.free.items) : (hit(f.items) || hit(f.low))) || hit(f.free.items) || null;
  }
  function drawItem() {
    const main = $('pfMain'), f = files[key] && files[key].v, back = '<button type="button" class="dy-back" data-pf-back>› رجوع</button>';
    const e = f && findItem(f, view.item);
    if (!e) { main.innerHTML = back + '<p class="hint">مفيش أصناف هنا</p>'; return; }
    const isFree = view.kind === 'free';
    const head = isFree
      ? `<div class="dy-tot"><span>الكمية</span><b dir="ltr">${esc(qtyText(e.q))}</b></div><div class="dy-tot"><span>تكلفتها</span><b dir="ltr" class="dy-neg">${esc(money2(e.cost))}</b></div>`
      : `<div class="dy-tot"><span>الكمية</span><b dir="ltr">${esc(qtyText(e.q))}</b></div><div class="dy-tot"><span>المبيعات</span><b dir="ltr">${esc(money2(e.rev))}</b></div><div class="dy-tot"><span>التكلفة</span><b dir="ltr">${esc(money2(e.cost))}</b></div>` +
        `<div class="dy-tot"><span>الربح</span><b dir="ltr" class="${neg(e.profit).trim()}">${esc(money2(e.profit))}${e.margin == null ? '' : ' · ' + esc(e.margin) + '%'}</b></div>`;
    const lines = e.ls.map((l) => `<button type="button" class="dy-tk" data-pf-d="${esc(l.d)}" data-pf-t="${esc(l.tk)}"><div class="dy-a"><span class="dy-v${neg(isFree ? -l.c * l.q : lineProfit(l))}" dir="ltr">${esc(money2(isFree ? -l.c * l.q : lineProfit(l)))}</span><b>${esc(dateText(l.d))}</b></div>` +
      `<div class="dy-bb"><span>تذكرة ${esc(l.tk)} · ${esc(qtyText(l.q))} × ${esc(money2(l.pr))}</span><span>تكلفة <bdi class="notr">${esc(money2(l.c))}</bdi></span></div></button>`).join('');
    main.innerHTML = back + `<h3 class="dy-h2"><span class="notr">${esc(e.n)}</span></h3><div class="dy-card">${head}</div><h3 class="dy-h">آخر بيعات الصنف</h3>${lines}${e.cf ? '<p class="hint">* سطر اتحسب بتكلفة الكارت (مفيش شرا قبله)</p>' : ''}`;
  }
  function drawTicket() {
    const main = $('pfMain'), date = view.date, det = dets[date];
    const t = det && det.tickets.find((x) => x.id === view.ticket);
    const back = '<button type="button" class="dy-back" data-pf-back>› رجوع</button>';
    if (!t) { main.innerHTML = back + '<p class="hint">الفاتورة دي مش لاقيها</p>'; return; }
    const r = rem(t), a = t.ty === 'a';
    const lines = t.lines.map((l) => `<tr${l.bc || l.fr ? ' class="dy-red"' : ''}><td><span class="notr">${esc(l.n)}</span>${l.bc ? ' <span class="dy-flag">· بأقل من التكلفة</span>' : ''}${l.fr ? ` <span class="dy-flag">· من غير سعر · تكلفتها ${esc(money2(l.c))}</span>` : ''}${l.ct ? ` <span class="dy-note">· سحب من العلبة${l.u ? ' · ' + esc(qtyText(l.u)) + ' وحدة' : ''}</span>` : ''}${l.memo ? `<div class="dy-sub"><span class="notr">${esc(l.memo)}</span></div>` : ''}</td><td class="dy-n">${esc(qtyText(l.q))}</td><td class="dy-n">${esc(money2(l.pr))}</td><td class="dy-n">${esc(money2(l.t))}</td></tr>`).join('');
    main.innerHTML = back + `<h3 class="dy-h2">تذكرة <bdi class="notr">${esc(t.id)}</bdi></h3>` +
      `<div class="dy-card"><b class="notr">${esc(who(t))}</b> · ${a ? 'آجل' : 'نقدي'}${t.k === 'r' ? ' · مرتجع' : ''}<div class="dy-stamp">${esc(dateText(date))} · ${esc(hm(t.t))}</div>${t.memo ? `<div class="dy-sub">ملاحظة: <span class="notr">${esc(t.memo)}</span></div>` : ''}</div>` +
      `<div class="dy-card"><table>${row(['الصنف', 'الكمية', 'السعر', 'الإجمالي'], true)}${lines}</table>` +
      `<div class="dy-tot"><span>الإجمالي</span><b dir="ltr">${esc(money2(t.total))}</b></div><div class="dy-tot"><span>خصم</span><b dir="ltr">${esc(money2(t.d))}</b></div><div class="dy-tot"><span>دفع</span><b dir="ltr">${esc(money2(t.p))}</b></div>` +
      (a ? `<div class="dy-tot"><span>الباقي عليه</span><b dir="ltr" class="${r > 0 ? 'dy-neg' : ''}">${esc(money2(r))}</b></div>` : '') + '</div>' +
      (t.mp ? `<div class="dy-card dy-mp">نفس المبلغ اتسجّل شرا من <bdi class="notr">${esc(t.mp.vendor)}</bdi> الساعة ${esc(hm(t.mp.at))}</div>` : '');
  }
  function draw() {
    if (!$('pfMain')) return;
    if (view && view.ticket != null) drawTicket();
    else if (view && view.item != null) drawItem();
    else if (view && (view.kind === 'exp' || view.kind === 'own')) drawMoves();
    else if (view) drawList();
    else drawMain();
  }
  async function open() {
    bind();
    view = null;
    await loadDay(true);
    if (data && !range(data, key)) key = '7';
    if (data) await ensure(key, true);
    draw();
    ensureSpend(true);
  }
  async function setKey(k) { key = k; view = null; if (data) await ensure(k); draw(); ensureSpend(); }
  function bind() {
    const p = $('profitPanel');
    if (!p || p.dataset.bound) return;
    p.dataset.bound = '1';
    p.addEventListener('click', (e) => {
      const t = (s) => e.target.closest(s);
      let el;
      if ((el = t('[data-pf-key]'))) { setKey(el.dataset.pfKey); return; }
      if ((el = t('[data-pf-open]'))) { view = { kind: el.dataset.pfOpen, q: '' }; draw(); return; }
      if ((el = t('[data-pf-head]'))) { const c = spendNow(), h = c && c.v && c.v.heads[Number(el.dataset.pfHead)]; if (h) { view = { kind: 'exp', head: h.name, q: '' }; draw(); window.scrollTo({ top: 0 }); } return; }
      if (t('[data-pf-own]')) { view = { kind: 'own', q: '' }; draw(); window.scrollTo({ top: 0 }); return; }
      if ((el = t('[data-pf-i]'))) { view = { kind: view.kind, q: view.q, item: Number(el.dataset.pfI), prev: view }; draw(); window.scrollTo({ top: 0 }); return; }
      if ((el = t('[data-pf-t]'))) {
        const date = el.dataset.pfD, id = Number(el.dataset.pfT);
        loadTicket(date).then(() => { view = { kind: view.kind, q: view.q, ticket: id, date, prev: view }; draw(); window.scrollTo({ top: 0 }); });
        return;
      }
      if ((el = t('[data-pf-day]'))) {
        const date = el.dataset.pfDay;
        if (root.AskerApp && root.AskerApp.showTab) root.AskerApp.showTab('day');
        if (root.AskerDay && root.AskerDay.show) root.AskerDay.show(date);
        return;
      }
      if (t('[data-pf-back]')) { view = (view && view.prev) || null; draw(); }
    });
    p.addEventListener('input', (e) => {
      if (e.target.id === 'pfSearch' && view) { view.q = e.target.value; const b = view.kind === 'exp' || view.kind === 'own' ? movesBody() : listBody(); $('pfRows').innerHTML = b.rows; $('pfTot').innerHTML = b.tot; }
      if (e.target.id === 'pfThr' && view) {
        const v = Number(e.target.value);
        if (Number.isFinite(v) && v > 0) { thr = v; try { root.localStorage.setItem('pf_low', String(v)); } catch (x) { /* nothing to keep it in */ } }
        const b = listBody(); $('pfRows').innerHTML = b.rows; $('pfTot').innerHTML = b.tot;
      }
    });
    p.addEventListener('change', (e) => { if (e.target.id === 'pfMonth' && e.target.value) setKey(e.target.value); });
    $('pfRefresh')?.addEventListener('click', () => { open(); });
  }
  root.AskerProfit = { open, close: () => {}, data: () => data, setKey };
})(typeof window === 'undefined' ? globalThis : window);
