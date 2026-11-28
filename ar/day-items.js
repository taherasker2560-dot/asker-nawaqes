/* «الأصناف يوم بيوم» (owner 2026-11-27/28: «بيان مرتجعات المبيعات اليومي بالاصناف… وبيان بالاصناف الجديدة لوحده، وبيان بالاصناف اللي جت الصيدلية وكان رصيدها 0… لكل يوم… وجنبه رصيده الحالي»,
   then «صح ابعتها» to the rule; mockup mockups/items_daily_reports_2026-11-27.png). Three reports of «📊 التقارير» on one screen:
   «مرتجعات البيع» (what customers brought back; a company return is not one), «أصناف جديدة» (a card made that day that came on that day's purchases), and «جه ورصيده صفر»: an OLD item that arrived
   with nothing on the shelf AND (1) «نواقص جت»: it was in the general shortage list the day before, or (2) «بالطلب»: it had no shortage tick at all before he ordered it (even if he ticked it to get it),
   or (3) «كمية كبيرة»: it sells one or two boxes a month and many came at once, or (4) «كان في الانتظار»: a customer was waiting for it. A fast item shown in its bag because it ran out is not listed.
   OVER A PERIOD (his word after the first release, 2026-11-28: «لو كل يوم لازم أخشه لوحده فما بقاش شايف الباقي عشان أقارن… من يوم كذا ليوم كذا لحد شهر، براحتي»; «ا» to the drawing):
   «من يوم» to «لحد يوم», a month at most (يوم / أسبوع / 15 يوم / شهر), the period's total, one line per day with its count and a bar to compare by eye (returns: by value; the others: by count),
   a tap opens a day's items under it, several can be open, or all of them; one day alone = «يوم» or the same date twice. The arrows move the whole period back and forth.
   Beside every item: its stock now, from the last copy. Data (owner only): day/items.json, day/i_<date>.json, day/items_stock.json, written by the laptop (Hub\day\BUILD_ITEMS.ps1, read only); the
   waiting list (ar_waitlist) is matched here. Nothing is written from here. */
(function (root) {
  'use strict';
  const D = root.AskerDayLib || (typeof require !== 'undefined' ? require('./day.js') : null);
  const stockLib = () => root.AskerStockLib || (typeof require !== 'undefined' ? require('./stock.js') : null);   // ar/stock.js comes later on the page
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
  const KINDS = [['r', 'مرتجعات البيع'], ['n', 'أصناف جديدة'], ['z', 'جه ورصيده صفر']];
  const REASONS = { g: 'نواقص جت', r: 'بالطلب', b: 'كمية كبيرة', w: 'كان في الانتظار' };
  const QUICK = [[1, 'يوم'], [7, 'أسبوع'], [15, '15 يوم'], [30, 'شهر']];
  const MAX_SPAN = 31;          // «لحد شهر»
  const WORDS = ['📦 الأصناف يوم بيوم', ...KINDS.map((k) => k[1]), ...Object.values(REASONS), ...QUICK.map((q) => q[1]), 'من يوم', 'لحد يوم', 'تختار أي يومين، وأقصى فترة شهر.', 'الفترة اللي قبلها', 'الفترة اللي بعدها',
    'الرصيد والبيانات لحد', '(آخر نسخة)', 'رصيده', 'صفر', 'رجع', 'جه', 'الجمهور', 'ج', 'بيعه حوالي', 'في الشهر', 'صنف', 'أصناف', 'يوم', 'أيام', 'في', 'تذكرة', 'تذاكر', 'الأيام', 'افتح كل الأيام', 'اقفل كل الأيام',
    'دوس على أي يوم تتفتح أصنافه تحته. تقدر تفتح كذا يوم مع بعض.', 'مفيش', 'مفيش في اليوم ده.', 'بحمّل…',
    'الصفحة محتاجة ملف الأصناف من اللاب: لسه ما وصلش.', 'اليوم ده لسه ما وصلش من اللاب.', 'تحديث',
    'الأيام قبل 28/11: «بالطلب» مش محسوبة، لأن فارمافلاي ما بيحفظش علامات الأيام اللي فاتت.', '«نواقص جت» مش محسوبة لبعض الأيام دي: قايمة النواقص العامة لليوم اللي قبلها مش محفوظة.',
    'مرتجعات اليوم ده لسه ما وصلتش من اللاب.', 'قايمة الانتظار ما اتقرتش: «كان في الانتظار» مش ظاهر دلوقتي.'];

  // ---------- pure helpers (also used by tests/day-items.cjs) ----------
  const isDate = (k) => /^\d{4}-\d\d-\d\d$/.test(String(k));
  function parseIndex(o) {
    if (!o || typeof o !== 'object' || !o.days || typeof o.days !== 'object') return null;
    const days = {};
    for (const k of Object.keys(o.days).filter(isDate)) {
      const d = o.days[k] || {}, ok = d.ok || {};
      days[k] = { r: num(d.r), n: num(d.nw), z: num(d.z), zo: arr(d.zo).map(num), rv: d.rv == null ? null : num(d.rv), ok: { r: !!ok.r, g: !!ok.g, q: !!ok.q } };
    }
    const dates = Object.keys(days).sort().reverse();
    return dates.length ? { today: isDate(o.today) ? String(o.today) : dates[0], dataAt: String(o.data_at || ''), days, dates } : null;
  }
  const line = (x) => ({ i: x.i == null ? null : num(x.i), n: String(x.n || ''), q: num(x.q), v: num(x.v), t: String(x.t || ''), tk: num(x.tk), s: String(x.s || ''), pr: num(x.pr), at: String(x.at || ''),
    why: arr(x.why).map(String).filter((w) => REASONS[w]), m: x.m == null ? null : num(x.m),
    // the invoice a return goes against (the laptop, 2026-11-28): mv = its ar_vendor_moves id, ex = the lot's expiry, ed = its day (a customer's return only)
    mv: x.mv == null || !num(x.mv) ? null : num(x.mv), ex: /^\d{4}-\d\d-\d\d$/.test(String(x.ex || '')) ? String(x.ex) : '', ed: String(x.ed || '') });
  // «↩️ رجّعه» (owner 2026-11-28): how many boxes to offer = what is in hand, not more than what came (or came back) on that line; 0 = nothing to return
  const offerBoxes = (inHand, came) => { const h = Math.max(0, num(inHand)), c = num(came) > 0 ? num(came) : h; return Math.round(Math.min(h, c) * 100) / 100; };
  function parseDay(o) {
    if (!o || typeof o !== 'object' || !isDate(o.date)) return null;
    const ok = o.ok || {}, list = (a) => arr(a).filter((x) => x && x.n).map(line);
    return { date: String(o.date), ok: { r: !!ok.r, g: !!ok.g, q: !!ok.q }, r: list(o.r), n: list(o.nw), z: list(o.z) };
  }
  const parseStock = (o) => (o && typeof o === 'object' && o.s && typeof o.s === 'object' ? { dataAt: String(o.data_at || ''), s: o.s } : null);
  // was a customer waiting for this item when it came that day? a request made before it arrived and not closed before that day (a cancelled one never counts); times are the phone's own
  function waitedFor(wait, itemId, date, at) {
    const from = new Date(date + 'T00:00:00').getTime(), to = new Date(date + 'T' + (/^\d\d:\d\d$/.test(at || '') ? at : '23:59') + ':59').getTime();
    return arr(wait).some((w) => w && Number(w.item_id) === Number(itemId) && w.status !== 'cancelled' && new Date(w.created_at).getTime() <= to && (!w.closed_at || new Date(w.closed_at).getTime() >= from));
  }
  // the «came to an empty shelf» lines that are shown, each with all its reasons (the waiting list's added here)
  function zeroShown(day, wait) {
    return day.z.map((e) => ({ ...e, why: waitedFor(wait, e.i, day.date, e.at) ? e.why.concat('w') : e.why })).filter((e) => e.why.length).sort((a, b) => a.at.localeCompare(b.at));
  }
  const linesOf = (day, kind, wait) => (kind === 'z' ? zeroShown(day, wait) : kind === 'n' ? day.n : day.r.slice().sort((a, b) => a.t.localeCompare(b.t)).reverse());
  // how many on a day, for the list of days (the waiting list adds the ones the laptop did not mark)
  function countOf(index, date, kind, wait) {
    const d = index.days[date];
    if (!d) return 0;
    if (kind !== 'z') return d[kind];
    return d.z + d.zo.filter((id) => waitedFor(wait, id, date, null)).length;
  }
  // a day's line in the period: how many, and for returns their value (null until it is known); the day's own file, once read, is the last word
  function figures(index, date, kind, wait, day) {
    const n = day ? linesOf(day, kind, wait).length : countOf(index, date, kind, wait);
    let v = null;
    if (kind === 'r') v = day ? day.r.reduce((a, e) => a + e.v, 0) : index.days[date] && index.days[date].rv;
    return { n, v: v == null ? null : v };
  }
  // ---------- the period ----------
  const spanOf = (from, to) => Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 864e5) + 1;
  const within = (d, first, last) => (d < first ? first : d > last ? last : d);
  // he moved one end (changed = 'from' | 'to'): that end is his; the other follows so the period is in order and a month at most
  function fitRange(from, to, changed, first, last) {
    let a = within(from, first, last), b = within(to, first, last);
    if (a > b) { if (changed === 'from') b = a; else a = b; }
    if (spanOf(a, b) > MAX_SPAN) { if (changed === 'from') b = D.addDays(a, MAX_SPAN - 1); else a = D.addDays(b, -(MAX_SPAN - 1)); }
    return { from: a, to: b };
  }
  // «أسبوع», «شهر»…: that many days ending where the period ends now
  const lastDays = (len, to, first) => ({ from: within(D.addDays(to, -(len - 1)), first, to), to });
  // an arrow: the same length just before (dir < 0) or just after; null = nothing there
  function shiftRange(from, to, dir, first, last) {
    if (dir < 0 ? from <= first : to >= last) return null;
    const len = spanOf(from, to);
    const a = dir < 0 ? D.addDays(from, -len) : D.addDays(to, 1), b = D.addDays(a, len - 1);
    return { from: within(a, first, last), to: within(b, first, last) };
  }
  const datesIn = (index, from, to) => index.dates.filter((d) => d >= from && d <= to);   // newest first
  // a quantity in boxes as the shelf has it: whole boxes and the loose units of an opened one; a fraction of an item with no units stays a fraction
  function boxes(q, parts) {
    const p = num(parts), v = Math.max(0, num(q));
    if (p > 1) {
      let packs = Math.floor(v + 1e-6), units = Math.round((v - packs) * p);
      if (units >= p) { packs++; units = 0; }
      return stockLib().qtyText(packs, units, p);
    }
    const w = D.qtyText(Math.round(v * 100) / 100);
    return Math.abs(v - Math.round(v)) < 0.005 ? stockLib().qtyText(Math.round(v), 0, 1) : w + ' علبة';
  }
  const stockOf = (stock, id) => (stock && id != null && Array.isArray(stock.s[id]) ? { q: num(stock.s[id][0]), parts: num(stock.s[id][1]) } : null);
  // what came back: a whole number is said as a number (a «بالقرص» card's one is one tablet, not a box); an opened box is said in its units
  const returned = (q, parts) => (Math.abs(num(q) - Math.round(num(q))) < 0.005 ? String(Math.round(num(q))) : boxes(q, parts));
  // Arabic counting, as he reads it: 3 to 10 take the plural
  const counted = (n, one, few) => (n % 100 >= 3 && n % 100 <= 10 ? few : one);
  const api = { WORDS, KINDS, REASONS, QUICK, MAX_SPAN, parseIndex, parseDay, parseStock, waitedFor, zeroShown, linesOf, countOf, figures, spanOf, fitRange, lastDays, shiftRange, datesIn, boxes, stockOf, returned, counted, offerBoxes };
  root.AskerDayItemsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const { money, dateText, hm, addDays } = D;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let index = null, stock = null, wait = [], waitOk = true, kind = 'r', from = '', to = '', opened = new Set(), cache = {}, asked = {}, seq = 0, loading = false;
  async function download(path) {
    if (!db()) return null;
    try {
      const { data: blob, error } = await db().storage.from('asker-private').download(path);
      return error || !blob ? null : JSON.parse(await blob.text());
    } catch (e) { return null; }
  }
  async function readWait() {
    try {
      const { data, error } = await db().from('ar_waitlist').select('item_id,status,created_at,closed_at').not('item_id', 'is', null).order('created_at', { ascending: false }).limit(2000);
      waitOk = !error; return error ? [] : data || [];
    } catch (e) { waitOk = false; return []; }
  }
  // the days' files, four at a time, each once; the screen is drawn again as they come
  async function read(dates) {
    const need = dates.filter((d) => cache[d] === undefined && !asked[d]);
    if (!need.length) return;
    const mine = seq;
    need.forEach((d) => { asked[d] = true; });
    const worker = async () => {
      for (let d = need.shift(); d !== undefined; d = need.shift()) {
        const o = await download('day/i_' + d + '.json');
        if (mine !== seq) return;
        cache[d] = o ? parseDay(o) : null; delete asked[d];
        draw();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }
  const figs = (d) => figures(index, d, kind, wait, cache[d]);
  const inPeriod = () => datesIn(index, from, to);
  // what is open when a period is shown: the newest day that has something (one day alone is always open)
  function openFirst() {
    const days = inPeriod(), hit = days.find((d) => figs(d).n > 0);
    opened = new Set(days.length === 1 ? days : hit ? [hit] : []);
  }
  // the files the screen needs now: the open days, and on the returns any day of the period whose value the index does not carry (a laptop file from before it did)
  const wanted = () => [...new Set([...opened, ...(kind === 'r' ? inPeriod().filter((d) => index.days[d].rv == null) : [])])];
  function setRange(r) {
    if (!r) return;
    from = r.from; to = r.to; openFirst(); draw();
    read(wanted());
  }
  const bdi = (n) => `<bdi dir="ltr">${esc(n)}</bdi>`;
  const shortDay = (d) => `${dateText(d).split(' ')[0]} ${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
  const many = (n, one, few) => `${bdi(n)} <span>${counted(n, one, few)}</span>`;
  const pill = (id) => {
    const s = stockOf(stock, id);
    if (!s) return '';
    return s.q > 0.0005 ? `<span class="di-st"><span>رصيده</span>: <bdi>${esc(boxes(s.q, s.parts))}</bdi></span>` : '<span class="di-st di-zero"><span>رصيده</span>: <span>صفر</span></span>';
  };
  const parts = (e) => { const s = stockOf(stock, e.i); return s ? s.parts : 1; };
  function sub(e) {
    if (kind === 'r') return `<span>رجع</span> <bdi>${esc(returned(e.q, parts(e)))}</bdi> · ${bdi(money(e.v))} <span>ج</span> · <bdi>${esc(hm(e.t))}</bdi>`;
    const came = `${e.s ? `<bdi class="notr">${esc(e.s)}</bdi> · ` : ''}<span>جه</span> ${bdi(D.qtyText(e.q))}`;
    if (kind === 'n') return came + ` · <span>الجمهور</span> ${bdi(money(e.pr))}`;
    return came;
  }
  const chips = (e) => (kind !== 'z' ? '' : '<div class="di-why">' + e.why.map((w) => `<span class="di-w di-w-${w}"><span>${REASONS[w]}</span>${w === 'b' && e.m != null ? ` <small><span>بيعه حوالي</span> ${bdi(e.m)} <span>في الشهر</span></small>` : ''}</span>`).join('') + '</div>');
  // ---------- «↩️ رجّعه» (owner 2026-11-28: «زرار في كل صنف اللي انا عايز ارجعه يتعمل له عمليه مرتجع … على فاتورته اللى جاى بيها»): the owner only. It marks the lot for return
  // (ar_return_marks, ar/return-marks.js): it goes to the list «↩️ مرتجعات» the staff with «تجهيز المرتجعات» prepare; it closes by itself when the return is entered in PharmaFly.
  const retKey = (d, e) => `${d}|${kind}|${e.i}|${e.mv}`;
  let retOpen = '', retQty = '', retNote = '';
  const lotOf = (e) => ({ move: e.mv, item: e.i, x: e.ex || null });
  const shortD = (s) => (/^\d{4}-\d\d-\d\d$/.test(s) ? `${Number(s.slice(8))}/${Number(s.slice(5, 7))}` : '');
  function retBlock(e, d) {
    const RM = root.AskerReturnMarks, L = root.AskerReturnMarksLib;
    if (!RM || !RM.canMark() || e.i == null || !e.mv) return '';
    const m = RM.markOf(lotOf(e));
    if (m) {
      const prepared = m.status === 'prepared';
      return `<div class="di-ret"><span class="rm-chip ${prepared ? 'prepared' : 'marked'}">${prepared ? '✓ اتجهّز للإرجاع' : '↩️ مطلوب إرجاعه'} · ${esc(L ? L.boxesText(m.units, m.k) : m.units)}</span>` +
        `<button type="button" class="secondary" data-di-unmark="${esc(m.id)}">شيل العلامة</button></div>`;
    }
    const s = stockOf(stock, e.i);
    if (!s || !(s.q > 0.0005)) return '';   // nothing in hand to send back
    const key = retKey(d, e);
    if (retOpen === key) {
      const who = String(e.s || '').split('،')[0].trim(), day = shortD(e.ed || d);
      return `<div class="di-ret di-ret-box"><label><span>كام علبة ترجع؟</span> <input type="text" inputmode="decimal" dir="ltr" size="4" value="${esc(retQty)}" data-di-qty></label>` +
        `<p class="di-ret-inv"><span>على فاتورة</span> ${who ? `<span class="di-ret-who notr">${esc(who)}</span> ` : ''}<span>اللي جه بيها</span>${day ? ` <bdi>(${esc(day)})</bdi>` : ''}</p>` +
        `<div class="di-ret-acts"><button type="button" data-di-ret-ok="${esc(key)}">↩️ رجّعه</button><button type="button" class="secondary" data-di-ret-x>إلغاء</button></div>` +
        (retNote ? `<p class="status bad">${esc(retNote)}</p>` : '') + '</div>';
    }
    return `<div class="di-ret"><button type="button" class="secondary" data-di-ret="${esc(key)}">↩️ رجّعه</button></div>`;
  }
  const row = (e, d) => `<div class="di-row"><div class="di-a"><b class="notr" dir="auto">${esc(e.n)}</b><small>${sub(e)}</small>${chips(e)}${retBlock(e, d)}</div>${pill(e.i)}</div>`;
  // the line a key belongs to (the open days only)
  function lineOfKey(key) {
    const [d, k, i, mv] = key.split('|'), day = cache[d];
    if (!day || k !== kind) return null;
    return linesOf(day, kind, wait).find((e) => String(e.i) === i && String(e.mv) === mv) || null;
  }
  // inside an open day: what its line cannot say (the tickets of the returns; why the empty-shelf ones are shown), then its items
  function inside(d) {
    const day = cache[d];
    if (day === undefined) return '<p class="hint">بحمّل…</p>';
    if (!day) return '<p class="hint">اليوم ده لسه ما وصلش من اللاب.</p>';
    const list = linesOf(day, kind, wait);
    const late = kind === 'r' && !day.ok.r ? '<p class="hint">مرتجعات اليوم ده لسه ما وصلتش من اللاب.</p>' : '';
    if (!list.length) return late + '<p class="hint">مفيش في اليوم ده.</p>';
    let head = '';
    if (kind === 'r') { const t = new Set(list.map((e) => e.tk)).size; head = `<span>في</span> ${many(t, 'تذكرة', 'تذاكر')}`; }
    if (kind === 'z') head = Object.keys(REASONS).map((w) => [w, list.filter((e) => e.why.includes(w)).length]).filter((x) => x[1]).map((x) => `<span>${REASONS[x[0]]}</span> ${bdi(x[1])}`).join(' · ');
    return late + (head ? `<p class="di-in">${head}</p>` : '') + list.map((e) => row(e, d)).join('');
  }
  function periodCard() {
    const first = index.dates[index.dates.length - 1], len = spanOf(from, to);
    const quick = `<div class="di-quick">${QUICK.map(([k, label]) => `<button type="button" class="dy-chip${k === len ? ' on' : ''}" data-di-quick="${k}" aria-pressed="${k === len}">${label}</button>`).join('')}</div>`;
    const box = (id, label, value) => `<label class="dy-date di-date"><small>${label}</small><span>📅 <bdi>${esc(shortDay(value))}</bdi></span><input id="${id}" type="date" min="${esc(first)}" max="${esc(index.today)}" value="${esc(value)}" aria-label="${label}" /></label>`;
    return `<div class="dy-card">${quick}<div class="di-range"><button type="button" class="dy-b" data-di-shift="-1" aria-label="الفترة اللي قبلها"${from <= first ? ' disabled' : ''}>›</button>` +
      box('diFrom', 'من يوم', from) + box('diTo', 'لحد يوم', to) +
      `<button type="button" class="dy-b" data-di-shift="1" aria-label="الفترة اللي بعدها"${to >= index.today ? ' disabled' : ''}>‹</button></div>` +
      '<p class="hint">تختار أي يومين، وأقصى فترة شهر.</p>' +
      `<div class="dy-stamp"><span>الرصيد والبيانات لحد</span> <bdi>${esc(hm(String((stock && stock.dataAt) || index.dataAt).slice(11, 16)))}</bdi> <span>(آخر نسخة)</span></div></div>`;
  }
  // what the whole period is missing, said once
  function periodNotes(days) {
    const out = [];
    if (kind === 'z') {
      if (days.some((d) => !index.days[d].ok.q)) out.push('الأيام قبل 28/11: «بالطلب» مش محسوبة، لأن فارمافلاي ما بيحفظش علامات الأيام اللي فاتت.');
      if (days.some((d) => !index.days[d].ok.g)) out.push('«نواقص جت» مش محسوبة لبعض الأيام دي: قايمة النواقص العامة لليوم اللي قبلها مش محفوظة.');
      if (!waitOk) out.push('قايمة الانتظار ما اتقرتش: «كان في الانتظار» مش ظاهر دلوقتي.');
    }
    return out.map((x) => `<p class="hint">${x}</p>`).join('');
  }
  function draw() {
    const main = $('diMain');
    if (!main) return;
    if (!index) { main.innerHTML = loading ? '' : '<p class="hint">الصفحة محتاجة ملف الأصناف من اللاب: لسه ما وصلش.</p>'; return; }
    const tabs = `<div class="di-kinds">${KINDS.map(([k, label]) => `<button type="button" class="dy-chip${k === kind ? ' on' : ''}" data-di-kind="${k}" aria-pressed="${k === kind}">${label}</button>`).join('')}</div>`;
    const days = inPeriod(), all = days.map((d) => ({ d, ...figs(d) }));
    const total = all.reduce((a, x) => a + x.n, 0), valued = kind === 'r' && all.every((x) => x.v != null);
    const sum = `<div class="di-sum"><span>${days.length > 1 ? many(days.length, 'يوم', 'أيام') + ' · ' : ''}${many(total, 'صنف', 'أصناف')}</span>${valued ? `<b>${bdi(money(all.reduce((a, x) => a + x.v, 0)))} <span>ج</span></b>` : ''}</div>`;
    const bar = (x) => (kind === 'r' && valued ? x.v : x.n);
    const max = Math.max(0, ...all.map(bar));
    const lines = all.map((x) => {
      const isOpen = opened.has(x.d), width = max > 0 && bar(x) > 0 ? Math.max(4, Math.round((bar(x) / max) * 100)) : 0;
      const what = x.n ? `${many(x.n, 'صنف', 'أصناف')}${kind === 'r' && x.v != null ? ` · ${bdi(money(x.v))} <span>ج</span>` : ''}` : '<span>مفيش</span>';
      return `<div class="di-block${isOpen ? ' open' : ''}"><button type="button" class="di-dl" data-di-open="${x.d}" aria-expanded="${isOpen}"><b>${esc(shortDay(x.d))}</b><span class="di-bar"><i style="width:${width}%"></i></span>` +
        `<span class="di-n">${what} <span aria-hidden="true">${isOpen ? '▴' : '▾'}</span></span></button>${isOpen ? inside(x.d) : ''}</div>`;
    }).join('');
    const withSome = all.filter((x) => x.n > 0).map((x) => x.d), allOpen = withSome.length > 0 && withSome.every((d) => opened.has(d));
    const head = days.length > 1
      ? `<div class="di-hd"><h3 class="dy-h"><span>الأيام</span></h3>${withSome.length ? `<button type="button" class="di-all" data-di-all>${allOpen ? 'اقفل كل الأيام' : 'افتح كل الأيام'}</button>` : ''}</div><p class="hint">دوس على أي يوم تتفتح أصنافه تحته. تقدر تفتح كذا يوم مع بعض.</p>`
      : '';
    main.innerHTML = tabs + periodCard() + sum + periodNotes(days) + head + lines;
  }
  async function open() {
    bind();
    const mine = ++seq;
    loading = !index; cache = {}; asked = {}; draw();
    const RM = root.AskerReturnMarks;
    const [i, s, w] = await Promise.all([download('day/items.json'), download('day/items_stock.json'), readWait(), RM && RM.canMark() ? RM.ensure().catch(() => {}) : null]);
    if (mine !== seq) return;
    loading = false; index = parseIndex(i); stock = parseStock(s); wait = w;
    if (!index) return draw();
    // a week ending today; just after midnight, when nothing has happened yet, ending on the day that is over
    const y = addDays(index.today, -1), empty = !KINDS.some(([k]) => countOf(index, index.today, k, wait));
    const end = empty && index.days[y] ? y : index.days[index.today] ? index.today : index.dates[0];
    setRange(lastDays(7, end, index.dates[index.dates.length - 1]));
  }
  // «📊 التقارير» opens it on the report he tapped
  const preset = (k) => { if (KINDS.some((x) => x[0] === k)) kind = k; };
  function bind() {
    const p = $('dayItemsPanel');
    if (!p || p.dataset.bound) return;
    p.dataset.bound = '1';
    p.addEventListener('click', (e) => {
      const t = (s) => e.target.closest(s);
      let el;
      if (!index) return;
      const first = index.dates[index.dates.length - 1];
      if ((el = t('[data-di-kind]'))) {
        kind = el.dataset.diKind;
        if (![...opened].some((d) => figs(d).n > 0)) openFirst();
        draw(); read(wanted()); return;
      }
      if ((el = t('[data-di-quick]'))) { setRange(lastDays(Number(el.dataset.diQuick), to, first)); return; }
      if ((el = t('[data-di-shift]'))) { setRange(shiftRange(from, to, Number(el.dataset.diShift), first, index.today)); return; }
      if (t('[data-di-all]')) {
        const some = inPeriod().filter((d) => figs(d).n > 0);
        opened = some.every((d) => opened.has(d)) ? new Set() : new Set(some);
        draw(); read(wanted()); return;
      }
      if ((el = t('[data-di-open]'))) {
        const d = el.dataset.diOpen;
        if (opened.has(d)) opened.delete(d); else opened.add(d);
        draw(); read(wanted());
        return;
      }
      // «↩️ رجّعه»: ask how many boxes (what is in hand, up to what came), then mark the lot on its invoice
      const RM = root.AskerReturnMarks;
      if ((el = t('[data-di-ret]'))) {
        const e2 = lineOfKey(el.dataset.diRet), s = e2 ? stockOf(stock, e2.i) : null;
        retOpen = el.dataset.diRet; retNote = ''; retQty = e2 && s ? String(offerBoxes(s.q, e2.q)) : '';
        draw(); const inp = $('dayItemsPanel').querySelector('[data-di-qty]'); if (inp) { inp.focus(); inp.select(); }
        return;
      }
      if (t('[data-di-ret-x]')) { retOpen = ''; retNote = ''; draw(); return; }
      if ((el = t('[data-di-ret-ok]')) && RM) {
        const e2 = lineOfKey(el.dataset.diRetOk), s = e2 ? stockOf(stock, e2.i) : null;
        if (!e2 || !s) return;
        const n = Number(String(retQty).replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(',', '.').replace('٫', '.'));
        if (!(n > 0)) { retNote = 'اكتب عدد العلب اللي هترجعها.'; draw(); return; }
        if (n > s.q + 0.001) { retNote = 'أكبر من رصيدك.'; draw(); return; }
        const k = s.parts > 1 ? s.parts : 1;
        el.disabled = true;
        RM.mark(lotOf(e2), Math.round(n * k * 100) / 100).then((res) => {
          if (res && res.ok) { retOpen = ''; retNote = ''; } else retNote = RM.errText(res && res.error);
          draw();
        });
        return;
      }
      if ((el = t('[data-di-unmark]')) && RM) { RM.unmark(el.dataset.diUnmark).then((res) => { retNote = res && res.ok ? '' : RM.errText(res && res.error); draw(); }); }
    });
    p.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('[data-di-qty]')) retQty = e.target.value; });
    p.addEventListener('change', (e) => {
      if (!index || !e.target.value || (e.target.id !== 'diFrom' && e.target.id !== 'diTo')) return;
      const side = e.target.id === 'diFrom' ? 'from' : 'to';
      setRange(fitRange(side === 'from' ? e.target.value : from, side === 'to' ? e.target.value : to, side, index.dates[index.dates.length - 1], index.today));
    });
    $('diRefresh')?.addEventListener('click', () => { open(); });
  }
  root.AskerDayItems = { open, preset };
})(typeof window === 'undefined' ? globalThis : window);
