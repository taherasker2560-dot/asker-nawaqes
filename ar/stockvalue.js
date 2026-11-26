/* «📦 قيمة المخزون» (owner 2026-11-26: «ا، ابعتها» on the discussion chat's mockup): what the stock is worth, store by store, and how it moves day by day. Two bases he picks between: the LAST PURCHASE
   cost (the COST LAW, the page always opens on it) and PharmaFly's average cost on the item card; every store shows both its cost and its value at the public price, with a total, as PharmaFly's own report
   does (owner 2026-11-26: «تجيب لي القيمة بالتكلفة والقيمة بسعر البيع للجمهور، زي فارما فلاي»). Quantities are PharmaFly's own (table Work), above zero.
   PharmaFly keeps no value of the past, so the history starts the day the laptop began to keep it (one snapshot a day, the day's last run); tapping a day shows that day's stores.
   Data (owner only): day/stock.json, written by the laptop (Hub\day\BUILD_DAY.ps1, read only). Nothing is written from here. */
(function (root) {
  'use strict';
  const D = root.AskerDayLib || (typeof require !== 'undefined' ? require('./day.js') : null);
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const r2 = (x) => Math.round(num(x) * 100) / 100;
  const BASES = [['law', 'آخر شرا (قانونك)'], ['avg', 'متوسط تكلفة فارمافلاي']];
  const MAIN = 1;            // PharmaFly's main store
  const SHOWN = 31;          // the days listed under the numbers
  // every fixed word the page draws, whole or as a piece next to a number (the English lines are checked against this list in tests/stockvalue.cjs)
  const WORDS = ['📦 قيمة المخزون', 'احسب على', ...BASES.map((x) => x[1]), 'حسب بيانات فارما فلاي لحد', 'كل الكمية متسعّرة بتكلفة آخر شرا للصنف', 'إنت شايف على متوسط تكلفة فارمافلاي، مش على آخر شرا', 'كل الكمية متسعّرة بمتوسط التكلفة اللي على كارت الصنف',
    'المخزن الرئيسي', 'في المخزن الرئيسي:', 'بسعر الجمهور', 'صنف', 'مخازن الانتظار', 'صنف من غير شرا قبل كده: اتسعّر بتكلفة الكارت', 'منهم من غير تكلفة خالص (اتحسبوا صفر)', 'صنف متوسطه صفر على الكارت', 'الرصيد اللي صفر أو بالسالب مش محسوب.',
    'المخزن', 'بالتكلفة', 'الإجمالي', 'القيمة يوم بيوم', 'المخزن الرئيسي بس. تبدأ من يوم ما اتبنت: فارمافلاي ما بيحفظش قيمة الأيام اللي فاتت.', 'رجوع لآخر يوم', 'تحديث', 'الصفحة محتاجة ملف المخزون من اللاب: لسه ما وصلش.', 'جنيه'];

  // ---------- pure helpers (also used by tests/stockvalue.cjs) ----------
  const store = (s) => ({ id: num(s.id), name: String(s.name || ''), items: num(s.items), law: num(s.law), avg: num(s.avg), sale: num(s.sale), noBuy: num(s.no_buy), noCost: num(s.no_cost), avgZero: num(s.avg_zero) });
  // the laptop's file: { days: { 'YYYY-MM-DD': { at, stores: [...] } } } → the days newest first; anything else is «no data»
  function parse(o) {
    if (!o || typeof o !== 'object' || !o.days || typeof o.days !== 'object') return null;
    const days = Object.keys(o.days).filter((k) => /^\d{4}-\d\d-\d\d$/.test(k)).sort().reverse()
      .map((k) => ({ date: k, at: String((o.days[k] || {}).at || ''), stores: (Array.isArray((o.days[k] || {}).stores) ? o.days[k].stores : []).filter((s) => s && s.id != null).map(store) }))
      .filter((d) => d.stores.length);
    return days.length ? { days } : null;
  }
  const isWaiting = (s) => s.name.indexOf('انتظار') !== -1;
  const valueOf = (s, basis) => (basis === 'avg' ? s.avg : s.law);
  // one day under one basis: the main store, every other store on its own, the waiting stores together, and what the page must say about the costs
  function view(day, basis) {
    if (!day) return null;
    const main = day.stores.find((s) => s.id === MAIN) || null;
    const rest = day.stores.filter((s) => s.id !== MAIN);
    const waiting = rest.filter(isWaiting);
    const sum = (list, f) => r2(list.reduce((a, s) => a + f(s), 0));
    const count = (f) => (main ? f(main) : 0);   // the cost gaps are said for the main store (summed over the stores, one item would be counted more than once)
    const one = (s) => ({ id: s.id, name: s.name, value: r2(valueOf(s, basis)), sale: s.sale, items: s.items });
    return {
      date: day.date, at: day.at,
      main: main ? { value: r2(valueOf(main, basis)), sale: main.sale, items: main.items } : null,
      others: rest.filter((s) => !isWaiting(s)).map(one),
      waiting: waiting.length ? { value: sum(waiting, (s) => valueOf(s, basis)), sale: sum(waiting, (s) => s.sale), list: waiting.map(one) } : null,
      total: { value: sum(day.stores, (s) => valueOf(s, basis)), sale: sum(day.stores, (s) => s.sale) },
      noBuy: basis === 'avg' ? 0 : count((s) => s.noBuy), noCost: basis === 'avg' ? 0 : count((s) => s.noCost), avgZero: basis === 'avg' ? count((s) => s.avgZero) : 0,
    };
  }
  // the main store day by day, newest first; `diff` = the move since the day before it in the file (null for the oldest)
  function history(data, basis, limit) {
    const rows = ((data && data.days) || []).map((d) => { const m = d.stores.find((s) => s.id === MAIN); return m ? { date: d.date, value: r2(valueOf(m, basis)), sale: m.sale } : null; }).filter(Boolean);
    return rows.map((x, i) => ({ ...x, diff: i + 1 < rows.length ? r2(x.value - rows[i + 1].value) : null })).slice(0, limit || SHOWN);
  }
  const api = { WORDS, BASES, MAIN, SHOWN, parse, view, history, isWaiting };
  root.AskerStockValueLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const { money, dateText, hm } = D;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = null, basis = 'law', picked = '', seq = 0;
  async function fetchStock() {
    if (!db()) return null;
    try {
      const { data: blob, error } = await db().storage.from('asker-private').download('day/stock.json');
      return error || !blob ? null : parse(JSON.parse(await blob.text()));
    } catch (e) { return null; }
  }
  const line = (label, s, cls) => `<tr class="${cls || ''}"><td>${label}</td><td class="sv-n sv-c"><bdi dir="ltr">${esc(money(s.value))}</bdi></td><td class="sv-n"><bdi dir="ltr">${esc(money(s.sale))}</bdi></td></tr>`;
  function draw() {
    const main = $('svMain');
    if (!main) return;
    if (!data) { main.innerHTML = '<p class="hint">الصفحة محتاجة ملف المخزون من اللاب: لسه ما وصلش.</p>'; return; }
    const day = data.days.find((d) => d.date === picked) || data.days[0], v = view(day, basis), other = basis === 'avg';
    const chips = `<div class="dy-line pf-basis"><span class="pf-by">احسب على</span>${BASES.map(([k, l]) => `<button type="button" class="dy-chip${k === basis ? ' on' : ''}" data-sv-basis="${k}" aria-pressed="${k === basis}">${esc(l)}</button>`).join('')}</div>`;
    const how = other ? '<b>إنت شايف على متوسط تكلفة فارمافلاي، مش على آخر شرا</b><br>كل الكمية متسعّرة بمتوسط التكلفة اللي على كارت الصنف' : 'كل الكمية متسعّرة بتكلفة آخر شرا للصنف';
    const old = day.date !== data.days[0].date;
    const when = `<span>حسب بيانات فارما فلاي لحد</span> <span>${esc(dateText(day.date))}</span> · <bdi>${esc(hm(day.at.slice(11, 16)))}</bdi>`;
    const head = `<div class="dy-card${other ? ' pf-other' : ''}">${chips}<div class="dy-stamp">${when}<br>${how}</div></div>` +
      (old ? `<div class="dy-line"><button type="button" class="dy-pill dy-ptap" data-sv-latest>رجوع لآخر يوم ›</button></div>` : '');
    const rows = (v.main ? line(`<span>المخزن الرئيسي</span><small><bdi dir="ltr">${esc(money(v.main.items))}</bdi> <span>صنف</span></small>`, v.main, 'sv-main') : '') +
      v.others.map((s) => line(`<bdi class="notr">${esc(s.name)}</bdi>`, s)).join('') +
      (v.waiting ? line('مخازن الانتظار', v.waiting) + v.waiting.list.map((s) => line(`<bdi class="notr">${esc(s.name)}</bdi>`, s, 'sv-sub')).join('') : '');
    const table = `<div class="dy-card sv-stores"><table class="sv-tbl"><thead><tr><th>المخزن</th><th class="sv-n">بالتكلفة</th><th class="sv-n">بسعر الجمهور</th></tr></thead><tbody>${rows}${line('الإجمالي', v.total, 'sv-total')}</tbody></table></div>`;
    const notes = [
      v.noBuy ? `<span>في المخزن الرئيسي:</span> <bdi dir="ltr">${esc(v.noBuy)}</bdi> <span>صنف من غير شرا قبل كده: اتسعّر بتكلفة الكارت</span>` + (v.noCost ? ` · <bdi dir="ltr">${esc(v.noCost)}</bdi> <span>منهم من غير تكلفة خالص (اتحسبوا صفر)</span>` : '') : '',
      v.avgZero ? `<span>في المخزن الرئيسي:</span> <bdi dir="ltr">${esc(v.avgZero)}</bdi> <span>صنف متوسطه صفر على الكارت</span>` : '',
      '<span>الرصيد اللي صفر أو بالسالب مش محسوب.</span>',
    ].filter(Boolean).map((x) => `<p class="hint">${x}</p>`).join('');
    const hist = history(data, basis).map((h) => `<button type="button" class="dy-tk sv-day${h.date === day.date ? ' sv-on' : ''}" data-sv-day="${esc(h.date)}"><div class="dy-a"><span class="dy-v" dir="ltr">${esc(money(h.value))}</span><b>${esc(dateText(h.date))}</b></div>` +
      `<div class="dy-bb"><span><span>بسعر الجمهور</span> <bdi dir="ltr">${esc(money(h.sale))}</bdi></span>` +
      (h.diff == null ? '<span></span>' : `<span dir="ltr" class="${h.diff < 0 ? 'sv-down' : 'sv-up'}">${h.diff > 0 ? '+' : ''}${esc(money(h.diff))}</span>`) + '</div></button>').join('');
    main.innerHTML = head + table + notes +
      `<h3 class="dy-h"><span aria-hidden="true">📈</span> <span>القيمة يوم بيوم</span></h3><p class="hint">المخزن الرئيسي بس. تبدأ من يوم ما اتبنت: فارمافلاي ما بيحفظش قيمة الأيام اللي فاتت.</p>${hist}`;
  }
  async function open() {
    bind();
    basis = 'law';   // it always opens on his law; the other basis is only for as long as he is looking
    picked = '';
    const mine = ++seq, got = await fetchStock();
    if (mine !== seq) return;
    data = got;
    draw();
  }
  function bind() {
    const p = $('stockValPanel');
    if (!p || p.dataset.bound) return;
    p.dataset.bound = '1';
    p.addEventListener('click', (e) => {
      const t = (s) => e.target.closest(s);
      let el;
      if ((el = t('[data-sv-basis]'))) { basis = el.dataset.svBasis === 'avg' ? 'avg' : 'law'; draw(); return; }
      if ((el = t('[data-sv-day]'))) { picked = el.dataset.svDay; draw(); window.scrollTo({ top: 0 }); return; }
      if (t('[data-sv-latest]')) { picked = ''; draw(); }
    });
    $('svRefresh')?.addEventListener('click', () => { open(); });
  }
  root.AskerStockValue = { open };
})(typeof window === 'undefined' ? globalThis : window);
