/* «📦 قيمة المخزون» (owner 2026-11-26: «ا، ابعتها» on the discussion chat's mockup): what the stock is worth, store by store, and how it moves day by day. Two bases he picks between: the LAST PURCHASE
   cost (the COST LAW, the page always opens on it) and PharmaFly's average cost on the item card; every store shows both its cost and its value at the public price, with a total, as PharmaFly's own report
   does (owner 2026-11-26: «تجيب لي القيمة بالتكلفة والقيمة بسعر البيع للجمهور، زي فارما فلاي»). Quantities are PharmaFly's own (table Work), above zero.
   The figure on top is the laptop's latest run (never frozen), with the time it is good up to. PharmaFly keeps no value of the past, so the history starts the day the laptop began to keep it: only the days
   that are over, one figure each = that pharmacy day's last run (the day turns at 6 in the morning, as on the day-close page), with its time; tapping a day shows that day's stores (2026-11-27).
   «💼 فلوسك في الصيدلية» on top (owner 2026-11-27, «ابعتها» on the discussion chat's mockup): the goods (every store but the waste one) + the cash boxes + what the credit customers owe (net) − what we owe the
   suppliers (net), from the same laptop snapshot, by the same rules as the cash, customers and suppliers pages; he may take any box out (kept on this phone, past days too); the waste store and the 90-day idle
   debts are said apart; the days that are over, each beside that day's profit after expenses and his withdrawals. It is not an accountant's balance sheet, and the change need not equal profit − withdrawals.
   Data (owner only): day/stock.json (+ day/day.json for the profit and withdrawals), written by the laptop (Hub\day\BUILD_DAY.ps1, read only). Nothing is written from here. */
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
    'المخزن', 'بالتكلفة', 'الإجمالي', 'القيمة يوم بيوم', 'المخزن الرئيسي بس، وللأيام اللي خلصت: كل يوم بآخر رقم اتحسب فيه. تبدأ من يوم ما اتبنت: فارمافلاي ما بيحفظش قيمة الأيام اللي فاتت.', 'لحد الساعة', 'لسه مفيش يوم خلص.', 'رجوع لآخر يوم', 'تحديث', 'الصفحة محتاجة ملف المخزون من اللاب: لسه ما وصلش.', 'جنيه',
    'فلوسك في الصيدلية', 'البضاعة (بآخر شرا)', 'البضاعة (بمتوسط تكلفة فارمافلاي)', '+ فلوس الخزن', '+ اللي على العملاء (صافي)', '− اللي للموردين (صافي)', '= الصافي', 'برّه الحساب:', 'من اللي على العملاء، ومن غير حركة 90 يوم:',
    'شيل العلامة من أي خزنة مش من فلوس الصيدلية. اختيارك بيتحفظ على الموبايل ده.', 'فلوسك يوم بيوم', 'صافي الربح', 'مسحوباتك', 'الفلوس محسوبة لحد الساعة', 'الفلوس لليوم ده ما اتسجلتش.',
    'مش ميزانية محاسب: من غير الأثاث والأجهزة والإيجار والمرتبات المستحقة، ومن غير أي فاتورة لسه ما اتدخلتش. الأرصدة زي ما هي في فارمافلاي، بنفس حساب صفحات الخزن والعملاء والموردين.',
    'صافي الربح = ربح اليوم على آخر شرا ناقص مصروفاته. تغيّر الصافي مش لازم يساوي صافي الربح ناقص مسحوباتك بالظبط.'];

  // ---------- pure helpers (also used by tests/stockvalue.cjs) ----------
  const store = (s) => ({ id: num(s.id), name: String(s.name || ''), items: num(s.items), law: num(s.law), avg: num(s.avg), sale: num(s.sale), noBuy: num(s.no_buy), noCost: num(s.no_cost), avgZero: num(s.avg_zero) });
  // the money beside a day's stock: null for the days before it was kept (a half-written one is no money, never zeros)
  const moneyOf = (m) => (m && typeof m === 'object' && Array.isArray(m.boxes) && m.cust && m.vend ? {
    at: String(m.at || ''), boxes: m.boxes.filter((b) => b && b.id != null).map((b) => ({ id: num(b.id), name: String(b.name || ''), bal: num(b.bal) })),
    cust: { owe: num(m.cust.owe), prepaid: num(m.cust.prepaid), idle90: num(m.cust.idle90) }, vend: { owe: num(m.vend.owe), owed: num(m.vend.owed) },
  } : null);
  // the laptop's file: { days: { 'YYYY-MM-DD': { at, stores: [...], money? } } } → the days newest first; anything else is «no data»
  function parse(o) {
    if (!o || typeof o !== 'object' || !o.days || typeof o.days !== 'object') return null;
    const days = Object.keys(o.days).filter((k) => /^\d{4}-\d\d-\d\d$/.test(k)).sort().reverse()
      .map((k) => ({ date: k, at: String((o.days[k] || {}).at || ''), stores: (Array.isArray((o.days[k] || {}).stores) ? o.days[k].stores : []).filter((s) => s && s.id != null).map(store), money: moneyOf((o.days[k] || {}).money) }))
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
  // the pharmacy day that is running at a moment: it turns at 6 in the morning (after midnight still counts for the day before), the day-close page's boundary and the laptop's
  function runningDay(now) {
    const d = new Date(now.getTime() - 6 * 3600e3), pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  // the main store day by day, newest first; `diff` = the move since the day before it in the file (null for the oldest). `running` = the pharmacy day still going: it is no figure of the record yet
  function history(data, basis, limit, running) {
    const rows = ((data && data.days) || []).map((d) => { const m = d.stores.find((s) => s.id === MAIN); return m ? { date: d.date, at: d.at, value: r2(valueOf(m, basis)), sale: m.sale } : null; }).filter(Boolean);
    return rows.map((x, i) => ({ ...x, diff: i + 1 < rows.length ? r2(x.value - rows[i + 1].value) : null })).filter((x) => !running || x.date < running).slice(0, limit || SHOWN);
  }
  const isWaste = (s) => s.name.indexOf('هالك') !== -1;
  // «فلوسك في الصيدلية» for one day under one basis; `out` = the ids of the boxes he took out
  function worth(day, basis, out) {
    if (!day || !day.money) return null;
    const m = day.money, skip = out || new Set();
    const sum = (list, f) => r2(list.reduce((a, x) => a + f(x), 0));
    const goods = sum(day.stores.filter((s) => !isWaste(s)), (s) => valueOf(s, basis));
    const boxes = m.boxes.map((b) => ({ ...b, in: !skip.has(b.id) }));
    const cash = sum(boxes.filter((b) => b.in), (b) => b.bal), cust = r2(m.cust.owe - m.cust.prepaid), vend = r2(m.vend.owe - m.vend.owed);
    return {
      goods, cash, cust, vend, net: r2(goods + cash + cust - vend), idle90: r2(m.cust.idle90), at: m.at, boxes,
      waste: day.stores.filter(isWaste).map((s) => ({ name: s.name, value: r2(valueOf(s, basis)) })), left: boxes.filter((b) => !b.in && Math.abs(b.bal) >= 0.005),
    };
  }
  // from day/day.json (read by ar/day.js): each day's profit (the cost law) after its own expenses, and what the owner took out
  function dayFacts(parsed) {
    const o = {};
    for (const d of (parsed && parsed.days) || []) o[d.date] = { profit: r2(d.profit - d.expenses.reduce((a, e) => a + e.amount, 0)), owner: r2(d.ownerOut) };
    return o;
  }
  // the net day by day, newest first, over the days that have the money; the same rules as the stock's record (the running day is not in it, the change is against the day before it in the file)
  function worthHistory(data, basis, out, limit, running, facts) {
    const rows = ((data && data.days) || []).map((d) => { const w = worth(d, basis, out); return w ? { date: d.date, at: w.at || d.at, net: w.net } : null; }).filter(Boolean);
    return rows.map((x, i) => ({ ...x, diff: i + 1 < rows.length ? r2(x.net - rows[i + 1].net) : null })).filter((x) => !running || x.date < running).slice(0, limit || SHOWN)
      .map((x) => { const f = facts && facts[x.date]; return { ...x, profit: f ? f.profit : null, owner: f ? f.owner : null }; });
  }
  const api = { WORDS, BASES, MAIN, SHOWN, parse, view, history, runningDay, isWaiting, isWaste, worth, worthHistory, dayFacts };
  root.AskerStockValueLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const { money, dateText, hm } = D;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = null, facts = {}, basis = 'law', picked = '', seq = 0, boxesOpen = false, daysOpen = false;
  // the boxes he took out of «فلوسك» (not the pharmacy's money): a choice of this phone
  const OUT_KEY = 'asker-money-boxes-out';
  let out = (() => { try { return new Set(JSON.parse(localStorage.getItem(OUT_KEY) || '[]').map(Number)); } catch (e) { return new Set(); } })();
  const saveOut = () => { try { localStorage.setItem(OUT_KEY, JSON.stringify([...out])); } catch (e) { /* private window: the choice lasts as long as the page */ } };
  async function download(path) {
    if (!db()) return null;
    try {
      const { data: blob, error } = await db().storage.from('asker-private').download(path);
      return error || !blob ? null : JSON.parse(await blob.text());
    } catch (e) { return null; }
  }
  const fetchStock = async () => { const o = await download('day/stock.json'); return o ? parse(o) : null; };
  const fetchFacts = async () => { const o = await download('day/day.json'); return dayFacts(o ? D.parse(o) : null); };
  const amount = (n) => `<bdi dir="ltr">${esc(money(n))}</bdi>`;
  const mline = (label, n, cls) => `<div class="sv-ml${cls ? ' ' + cls : ''}"><span>${label}</span>${amount(n)}</div>`;
  const signed = (n) => `<span dir="ltr" class="${n < 0 ? 'sv-down' : 'sv-up'}">${n > 0 ? '+' : ''}${esc(money(n))}</span>`;
  // «💼 فلوسك في الصيدلية», on top of the page
  function moneyCard(day) {
    const w = worth(day, basis, out);
    const title = '<h3 class="sv-mt"><span aria-hidden="true">💼</span> <span>فلوسك في الصيدلية</span></h3>';
    const hist = worthHistory(data, basis, out, SHOWN, runningDay(new Date()), facts).map((h) => `<div class="dy-tk dy-static sv-mday"><div class="dy-a"><span class="dy-v" dir="ltr">${esc(money(h.net))}</span><b>${esc(dateText(h.date))}</b></div>` +
      `<div class="dy-bb"><span>${h.profit == null ? '' : `<span>صافي الربح</span> ${amount(h.profit)} · <span>مسحوباتك</span> ${amount(h.owner)}`}</span>${h.diff == null ? '<span></span>' : signed(h.diff)}</div>` +
      (h.at ? `<div class="dy-bb"><span><span>لحد الساعة</span> <bdi>${esc(hm(h.at.slice(11, 16)))}</bdi></span><span></span></div>` : '') + '</div>').join('');
    const fold = `<details class="sv-mdays"${daysOpen ? ' open' : ''}><summary><span aria-hidden="true">📈</span> <span>فلوسك يوم بيوم</span></summary>` +
      (hist ? `<p class="hint">صافي الربح = ربح اليوم على آخر شرا ناقص مصروفاته. تغيّر الصافي مش لازم يساوي صافي الربح ناقص مسحوباتك بالظبط.</p>${hist}` : '<p class="hint">لسه مفيش يوم خلص.</p>') + '</details>';
    if (!w) return `<div class="dy-card sv-money">${title}<p class="hint">الفلوس لليوم ده ما اتسجلتش.</p>${fold}</div>`;
    const boxes = boxesOpen ? '<div class="sv-boxes">' + w.boxes.map((b) => `<label class="sv-box"><input type="checkbox" data-sv-box="${b.id}"${b.in ? ' checked' : ''}><bdi class="notr">${esc(b.name)}</bdi>${amount(b.bal)}</label>`).join('') +
      '<p class="hint">شيل العلامة من أي خزنة مش من فلوس الصيدلية. اختيارك بيتحفظ على الموبايل ده.</p></div>' : '';
    const apart = [...w.waste.map((s) => `<div class="sv-ml"><span><bdi class="notr">${esc(s.name)}</bdi></span>${amount(s.value)}</div>`), ...w.left.map((b) => `<div class="sv-ml"><span><bdi class="notr">${esc(b.name)}</bdi></span>${amount(b.bal)}</div>`)].join('');
    // the money carries its own moment: the same as the stock's, unless the last run could not read it
    const late = w.at && w.at !== day.at ? `<p class="status bad"><span>الفلوس محسوبة لحد الساعة</span> <bdi>${esc(hm(w.at.slice(11, 16)))}</bdi></p>` : '';
    return `<div class="dy-card sv-money">${title}${late}` +
      mline(basis === 'avg' ? 'البضاعة (بمتوسط تكلفة فارمافلاي)' : 'البضاعة (بآخر شرا)', w.goods) +
      `<button type="button" class="sv-ml sv-cash" data-sv-boxes aria-expanded="${boxesOpen}"><span><span>+ فلوس الخزن</span> <span aria-hidden="true">${boxesOpen ? '▴' : '▾'}</span></span>${amount(w.cash)}</button>` + boxes +
      mline('+ اللي على العملاء (صافي)', w.cust) + mline('− اللي للموردين (صافي)', w.vend) + mline('= الصافي', w.net, 'sv-net') +
      (apart ? `<div class="sv-apart"><span class="sv-apart-h">برّه الحساب:</span>${apart}</div>` : '') +
      mline('من اللي على العملاء، ومن غير حركة 90 يوم:', w.idle90, 'sv-idle') + fold +
      '<p class="hint">مش ميزانية محاسب: من غير الأثاث والأجهزة والإيجار والمرتبات المستحقة، ومن غير أي فاتورة لسه ما اتدخلتش. الأرصدة زي ما هي في فارمافلاي، بنفس حساب صفحات الخزن والعملاء والموردين.</p></div>';
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
    // the moment the figure is good up to: its own date (after midnight it is the next one, while the pharmacy day is still the one before)
    const when = `<span>حسب بيانات فارما فلاي لحد</span> <span>${esc(dateText(day.at.slice(0, 10) || day.date))}</span> · <bdi>${esc(hm(day.at.slice(11, 16)))}</bdi>`;
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
    const hist = history(data, basis, SHOWN, runningDay(new Date())).map((h) => `<button type="button" class="dy-tk sv-day${h.date === day.date ? ' sv-on' : ''}" data-sv-day="${esc(h.date)}"><div class="dy-a"><span class="dy-v" dir="ltr">${esc(money(h.value))}</span><b>${esc(dateText(h.date))}</b></div>` +
      `<div class="dy-bb"><span><span>بسعر الجمهور</span> <bdi dir="ltr">${esc(money(h.sale))}</bdi></span>` +
      (h.diff == null ? '<span></span>' : `<span dir="ltr" class="${h.diff < 0 ? 'sv-down' : 'sv-up'}">${h.diff > 0 ? '+' : ''}${esc(money(h.diff))}</span>`) + '</div>' +
      (h.at ? `<div class="dy-bb sv-at"><span><span>لحد الساعة</span> <bdi>${esc(hm(h.at.slice(11, 16)))}</bdi></span><span></span></div>` : '') + '</button>').join('') || '<p class="hint">لسه مفيش يوم خلص.</p>';
    main.innerHTML = head + moneyCard(day) + table + notes +
      `<h3 class="dy-h"><span aria-hidden="true">📈</span> <span>القيمة يوم بيوم</span></h3><p class="hint">المخزن الرئيسي بس، وللأيام اللي خلصت: كل يوم بآخر رقم اتحسب فيه. تبدأ من يوم ما اتبنت: فارمافلاي ما بيحفظش قيمة الأيام اللي فاتت.</p>${hist}`;
  }
  async function open() {
    bind();
    basis = 'law';   // it always opens on his law; the other basis is only for as long as he is looking
    picked = '';
    const mine = ++seq, [got, f] = await Promise.all([fetchStock(), fetchFacts()]);
    if (mine !== seq) return;
    data = got; facts = f;
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
      if (t('[data-sv-latest]')) { picked = ''; draw(); return; }
      if (t('[data-sv-boxes]')) { boxesOpen = !boxesOpen; draw(); }
    });
    p.addEventListener('change', (e) => {
      const box = e.target.closest('[data-sv-box]');
      if (!box) return;
      const id = Number(box.dataset.svBox);
      if (box.checked) out.delete(id); else out.add(id);
      saveOut(); draw();
    });
    // «فلوسك يوم بيوم» stays open while the card is drawn again («toggle» does not bubble: caught on the way down)
    p.addEventListener('toggle', (e) => { if (e.target.classList?.contains('sv-mdays')) daysOpen = e.target.open; }, true);
    $('svRefresh')?.addEventListener('click', () => { open(); });
  }
  root.AskerStockValue = { open };
})(typeof window === 'undefined' ? globalThis : window);
