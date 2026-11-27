/* «الأصناف يوم بيوم» (owner 2026-11-27/28: «بيان مرتجعات المبيعات اليومي بالاصناف… وبيان بالاصناف الجديدة لوحده، وبيان بالاصناف اللي جت الصيدلية وكان رصيدها 0… لكل يوم… وجنبه رصيده الحالي»,
   then «صح ابعتها» to the rule; mockup mockups/items_daily_reports_2026-11-27.png). Three reports of «📊 التقارير» on one screen, a day at a time, up to 90 days back:
   «مرتجعات البيع» (what customers brought back; a company return is not one), «أصناف جديدة» (a card made that day that came on that day's purchases), and «جه ورصيده صفر»: an OLD item that arrived
   with nothing on the shelf AND (1) «نواقص جت»: it was in the general shortage list the day before, or (2) «بالطلب»: it had no shortage tick at all before he ordered it (even if he ticked it to get it),
   or (3) «كمية كبيرة»: it sells one or two boxes a month and many came at once, or (4) «كان في الانتظار»: a customer was waiting for it. A fast item shown in its bag because it ran out is not listed.
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
  const WORDS = ['📦 الأصناف يوم بيوم', ...KINDS.map((k) => k[1]), ...Object.values(REASONS), 'اختار يوم', 'اليوم اللي قبله', 'اليوم اللي بعده', 'الرصيد والبيانات لحد', '(آخر نسخة)', 'رصيده', 'صفر',
    'رجع', 'جه', 'الجمهور', 'ج', 'بيعه حوالي', 'في الشهر', 'صنف', 'أصناف', 'في', 'تذكرة', 'تذاكر','كل يوم كان فيه كام', 'مفيش', 'لحد دلوقتي', 'مفيش في اليوم ده.', 'وهكذا لحد 90 يوم ورا',
    'الصفحة محتاجة ملف الأصناف من اللاب: لسه ما وصلش.', 'اليوم ده لسه ما وصلش من اللاب.', 'تحديث',
    'الأيام قبل 28/11: «بالطلب» مش محسوبة، لأن فارمافلاي ما بيحفظش علامات الأيام اللي فاتت.', '«نواقص جت» مش محسوبة لليوم ده: قايمة النواقص العامة لليوم اللي قبله مش محفوظة.',
    'مرتجعات اليوم ده لسه ما وصلتش من اللاب.', 'قايمة الانتظار ما اتقرتش: «كان في الانتظار» مش ظاهر دلوقتي.'];

  // ---------- pure helpers (also used by tests/day-items.cjs) ----------
  const isDate = (k) => /^\d{4}-\d\d-\d\d$/.test(String(k));
  function parseIndex(o) {
    if (!o || typeof o !== 'object' || !o.days || typeof o.days !== 'object') return null;
    const days = {};
    for (const k of Object.keys(o.days).filter(isDate)) {
      const d = o.days[k] || {}, ok = d.ok || {};
      days[k] = { r: num(d.r), n: num(d.nw), z: num(d.z), zo: arr(d.zo).map(num), ok: { r: !!ok.r, g: !!ok.g, q: !!ok.q } };
    }
    const dates = Object.keys(days).sort().reverse();
    return dates.length ? { today: isDate(o.today) ? String(o.today) : dates[0], dataAt: String(o.data_at || ''), days, dates } : null;
  }
  const line = (x) => ({ i: x.i == null ? null : num(x.i), n: String(x.n || ''), q: num(x.q), v: num(x.v), t: String(x.t || ''), tk: num(x.tk), s: String(x.s || ''), pr: num(x.pr), at: String(x.at || ''),
    why: arr(x.why).map(String).filter((w) => REASONS[w]), m: x.m == null ? null : num(x.m) });
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
  const api = { WORDS, KINDS, REASONS, parseIndex, parseDay, parseStock, waitedFor, zeroShown, linesOf, countOf, boxes, stockOf, returned, counted };
  root.AskerDayItemsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const { money, dateText, hm, addDays } = D;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let index = null, stock = null, wait = [], waitOk = true, kind = 'r', picked = '', cache = {}, seq = 0, loading = false, allDays = false;
  const SHOWN_DAYS = 14;
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
  const pill = (id) => {
    const s = stockOf(stock, id);
    if (!s) return '';
    return s.q > 0.0005 ? `<span class="di-st"><span>رصيده</span>: <bdi>${esc(boxes(s.q, s.parts))}</bdi></span>` : '<span class="di-st di-zero"><span>رصيده</span>: <span>صفر</span></span>';
  };
  const bdi = (n) => `<bdi dir="ltr">${esc(n)}</bdi>`;
  const parts = (e) => { const s = stockOf(stock, e.i); return s ? s.parts : 1; };
  function sub(e) {
    if (kind === 'r') return `<span>رجع</span> <bdi>${esc(returned(e.q, parts(e)))}</bdi> · ${bdi(money(e.v))} <span>ج</span> · <bdi>${esc(hm(e.t))}</bdi>`;
    const came = `${e.s ? `<bdi class="notr">${esc(e.s)}</bdi> · ` : ''}<span>جه</span> ${bdi(D.qtyText(e.q))}`;
    if (kind === 'n') return came + ` · <span>الجمهور</span> ${bdi(money(e.pr))}`;
    return came;
  }
  const chips = (e) => (kind !== 'z' ? '' : '<div class="di-why">' + e.why.map((w) => `<span class="di-w di-w-${w}"><span>${REASONS[w]}</span>${w === 'b' && e.m != null ? ` <small><span>بيعه حوالي</span> ${bdi(e.m)} <span>في الشهر</span></small>` : ''}</span>`).join('') + '</div>');
  const row = (e) => `<div class="di-row"><div class="di-a"><b class="notr" dir="auto">${esc(e.n)}</b><small>${sub(e)}</small>${chips(e)}</div>${pill(e.i)}</div>`;
  function summary(list) {
    if (kind === 'r') {
      const tickets = new Set(list.map((e) => e.tk)).size;
      return `<div class="di-sum"><span>${bdi(list.length)} <span>${counted(list.length, 'صنف', 'أصناف')}</span> <span>في</span> ${bdi(tickets)} <span>${counted(tickets, 'تذكرة', 'تذاكر')}</span></span><b>${bdi(money(list.reduce((a, e) => a + e.v, 0)))} <span>ج</span></b></div>`;
    }
    const by = kind === 'z' ? Object.keys(REASONS).map((w) => [w, list.filter((e) => e.why.includes(w)).length]).filter((x) => x[1]).map((x) => `<span>${REASONS[x[0]]}</span> ${bdi(x[1])}`).join(' · ') : '';
    return `<div class="di-sum"><span>${bdi(list.length)} <span>${counted(list.length, 'صنف', 'أصناف')}</span></span>${by ? `<small>${by}</small>` : ''}</div>`;
  }
  function notes(day) {
    const out = [];
    if (kind === 'r' && !day.ok.r) out.push('مرتجعات اليوم ده لسه ما وصلتش من اللاب.');
    if (kind === 'z') {
      if (!day.ok.q) out.push('الأيام قبل 28/11: «بالطلب» مش محسوبة، لأن فارمافلاي ما بيحفظش علامات الأيام اللي فاتت.');
      if (!day.ok.g) out.push('«نواقص جت» مش محسوبة لليوم ده: قايمة النواقص العامة لليوم اللي قبله مش محفوظة.');
      if (!waitOk) out.push('قايمة الانتظار ما اتقرتش: «كان في الانتظار» مش ظاهر دلوقتي.');
    }
    return out.map((x) => `<p class="hint">${x}</p>`).join('');
  }
  function dayList() {
    const list = allDays ? index.dates : index.dates.slice(0, SHOWN_DAYS);
    return `<h3 class="dy-h"><span>كل يوم كان فيه كام</span></h3>` + list.map((d) => {
      const n = countOf(index, d, kind, wait);
      return `<button type="button" class="di-day${d === picked ? ' on' : ''}" data-di-day="${d}"><b>${esc(dateText(d))}</b><span>${n ? `${bdi(n)} <span>${counted(n, 'صنف', 'أصناف')}</span> ‹` : '<span>مفيش</span>'}</span></button>`;
    }).join('') + (index.dates.length > SHOWN_DAYS ? `<button type="button" class="di-more" data-di-more>${allDays ? '▴' : '<span>وهكذا لحد 90 يوم ورا</span> ▾'}</button>` : '');
  }
  function draw() {
    const main = $('diMain');
    if (!main) return;
    if (!index) { main.innerHTML = loading ? '' : '<p class="hint">الصفحة محتاجة ملف الأصناف من اللاب: لسه ما وصلش.</p>'; return; }
    const first = index.dates[index.dates.length - 1], day = cache[picked];
    const tabs = `<div class="di-kinds">${KINDS.map(([k, label]) => `<button type="button" class="dy-chip${k === kind ? ' on' : ''}" data-di-kind="${k}" aria-pressed="${k === kind}">${label}</button>`).join('')}</div>`;
    const nav = `<div class="dy-card"><div class="dy-pick"><button type="button" class="dy-b" data-di-prev aria-label="اليوم اللي قبله"${picked <= first ? ' disabled' : ''}>›</button>` +
      `<label class="dy-date"><span>${esc(dateText(picked))}</span><small>📅 <span>اختار يوم</span></small><input id="diDate" type="date" min="${esc(first)}" max="${esc(index.today)}" value="${esc(picked)}" aria-label="اختار يوم" /></label>` +
      `<button type="button" class="dy-b" data-di-next aria-label="اليوم اللي بعده"${picked >= index.today ? ' disabled' : ''}>‹</button></div>` +
      `<div class="dy-stamp"><span>الرصيد والبيانات لحد</span> <bdi>${esc(hm(String((stock && stock.dataAt) || index.dataAt).slice(11, 16)))}</bdi> <span>(آخر نسخة)</span></div></div>`;
    let body;
    if (day === undefined) body = '';
    else if (!day) body = '<p class="hint">اليوم ده لسه ما وصلش من اللاب.</p>';
    else {
      const list = linesOf(day, kind, wait);
      body = notes(day) + (list.length ? summary(list) + list.map(row).join('') : `<p class="hint">مفيش في اليوم ده.</p>`);
    }
    main.innerHTML = tabs + nav + body + dayList();
  }
  async function show(date) {
    picked = date;
    draw();
    if (cache[date] === undefined) {
      const mine = seq, o = await download('day/i_' + date + '.json');
      if (mine !== seq) return;
      cache[date] = o ? parseDay(o) : null;
      if (picked === date) draw();
    }
  }
  async function open() {
    bind();
    const mine = ++seq;
    loading = !index; cache = {}; allDays = false; draw();
    const [i, s, w] = await Promise.all([download('day/items.json'), download('day/items_stock.json'), readWait()]);
    if (mine !== seq) return;
    loading = false; index = parseIndex(i); stock = parseStock(s); wait = w;
    if (!index) return draw();
    // today; just after midnight, when nothing has happened yet, the day that is over
    const y = addDays(index.today, -1), empty = !KINDS.some(([k]) => countOf(index, index.today, k, wait));
    await show(empty && index.days[y] ? y : index.days[index.today] ? index.today : index.dates[0]);
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
      if ((el = t('[data-di-kind]'))) { kind = el.dataset.diKind; draw(); return; }
      if ((el = t('[data-di-day]'))) { show(el.dataset.diDay); window.scrollTo({ top: 0 }); return; }
      if (t('[data-di-prev]')) { const k = index.dates.find((d) => d < picked); if (k) show(k); return; }
      if (t('[data-di-next]')) { const k = index.dates.slice().reverse().find((d) => d > picked); if (k) show(k); return; }
      if (t('[data-di-more]')) { allDays = !allDays; draw(); }
    });
    p.addEventListener('change', (e) => {
      if (e.target.id !== 'diDate' || !index || !e.target.value) return;
      const v = e.target.value; show(index.days[v] ? v : index.dates.find((d) => d <= v) || index.dates[index.dates.length - 1]);
    });
    $('diRefresh')?.addEventListener('click', () => { open(); });
  }
  root.AskerDayItems = { open, preset };
})(typeof window === 'undefined' ? globalThis : window);
