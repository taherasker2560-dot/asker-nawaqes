/* «📅 اليوم» (owner 2026-11-25: «النهارده عدّى إزاي؟ … ابني على أداء فارما فلاي نفسه … ومش هنسجل اللي بيحصل في السيستم بتاعنا بس، هنسجل اللي بيحصل في فارما فلاي كمان لحد ما ننقل على البرنامج بتاعنا»;
   mockup mockups/day_page_2026-11-25, his «ابنيها»): the pharmacy's day on ONE page, PharmaFly's own figures first (sales, profit, cash boxes, purchases, below-cost sales, the hours), our own
   system's events (invoices entered, the purchase robot's stops, site orders, temporary sales) under them, and the last 7 days. A card on «الرئيسية» carries today's two headline numbers.
   Data: asker-private/day/day.json from the laptop (Hub\day\BUILD_DAY.ps1, read only, owner only). The page reads THIS FILE only: when the pharmacy moves to the Agza cashier the cashier writes the
   same file and nothing here changes. The profit is APPROXIMATE (cost from PharmaFly's tickets) and every figure carries the time the pharmacy's copy was taken («لحد ٨:٢٨ م»). Nothing is written from here. */
(function (root) {
  'use strict';
  const PATH = 'day/day.json';
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const pad = (n) => String(n).padStart(2, '0');
  const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const DAY_CH = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  // every fixed word the page draws, whole or as a piece next to a number (the English lines are checked against this list in tests/day.cjs)
  const WORDS = ['📅 اليوم', '📅 النهارده', 'اليوم', 'تفاصيل اليوم ←', 'المبيعات', 'الربح (تقريبي)', 'اتحصّل كاش', 'آجل جديد', 'الخزن', 'الخزنة', 'داخل', 'خارج', 'الرصيد الآن', 'المشتريات والمرتجعات',
    'مصروفات', 'دفعات للموردين', 'سحب المالك', 'حسب الساعة', 'بيع غريب', '✓ مفيش بيع تحت التكلفة', 'من سيستمنا', 'آخر ٧ أيام (المبيعات)', 'تحديث', 'مفيش بيانات لليوم ده',
    'الصفحة محتاجة ملف اليوم من اللاب: لسه ما وصلش.', 'الملف قديم: اللاب مش بيحدّث (مقفول أو من غير نت؟)', 'اليوم اللي بعده', 'اليوم اللي قبله', '🤖 فواتير اتدخلت', 'وقفات الروبوت', 'طلبات الموقع', 'بيع مؤقت',
    'أصناف متنوعة (بالقيمة)', 'مرتجع', 'خصومات', 'مرتجع للشركات', 'فواتير شراء', 'الربح تقريبي: التكلفة من تذاكر فارما فلاي.', 'اتباع بأقل من التكلفة', 'اتجمّعت من فارما فلاي',
    'تذكرة', 'المتوسط', 'منه سداد عملاء', 'عميل', 'بيع آجل', 'لحد', 'البيانات', 'بقيمة', 'بيع', 'والتكلفة', ...DAYS, ...MONTHS];

  // ---------- pure helpers (also used by tests/day.cjs) ----------
  const money = (n) => Math.round(num(n)).toLocaleString('en-US');
  const money2 = (n) => num(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const clock = (iso) => { const m = /(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)/.exec(String(iso || '')); if (!m) return ''; const h = Number(m[4]); return (h % 12 || 12) + ':' + m[5] + (h < 12 ? ' ص' : ' م'); };
  const dateText = (ymd) => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(ymd || '')); if (!m) return ''; const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); return DAYS[d.getDay()] + ' ' + Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1]; };
  const dayChar = (ymd) => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(ymd || '')); return m ? DAY_CH[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()] : ''; };
  const box = (b) => ({ id: num(b && b.id), name: String((b && b.name) || ''), in: num(b && b.in), out: num(b && b.out), balance: b && b.balance != null ? num(b.balance) : null });
  function day(d) {
    if (!d || typeof d !== 'object' || !/^\d{4}-\d\d-\d\d$/.test(String(d.date || ''))) return null;
    const cr = d.credit || {}, pu = d.purchases || {}, bc = d.below_cost || {};
    return {
      date: String(d.date), netSales: num(d.net_sales), grossSales: num(d.gross_sales), returns: num(d.returns), discounts: num(d.discounts), misc: num(d.misc),
      tickets: num(d.tickets), returnTickets: num(d.return_tickets), profit: num(d.profit), margin: d.margin == null ? null : num(d.margin), collected: num(d.collected),
      credit: { netNew: num(cr.net_new), paid: num(cr.paid), sales: num(cr.sales), customers: num(cr.customers) },
      hours: Array.isArray(d.hours) ? d.hours.slice(0, 24).map(num) : [],
      boxes: (Array.isArray(d.boxes) ? d.boxes : []).filter((b) => b && b.name).map(box),
      expenses: (Array.isArray(d.expenses) ? d.expenses : []).filter((e) => e && e.name).map((e) => ({ name: String(e.name), amount: num(e.amount) })),
      supplierPaid: num(d.supplier_paid), ownerOut: num(d.owner_out),
      purchases: { n: num(pu.n), total: num(pu.total), returnsN: num(pu.returns_n), returns: num(pu.returns) },
      belowCost: { n: num(bc.n), lines: (Array.isArray(bc.lines) ? bc.lines : []).filter((l) => l && l.ticket != null).map((l) => ({ ticket: num(l.ticket), item: String(l.item || ''), price: num(l.price), cost: num(l.cost), at: String(l.at || '') })) },
    };
  }
  // the file must look like what the laptop writes; anything else is «no data»
  function parse(o) {
    if (!o || typeof o !== 'object' || !o.days || typeof o.days !== 'object') return null;
    const days = Object.keys(o.days).map((k) => day(o.days[k])).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
    if (!days.length) return null;
    return { generatedAt: String(o.generated_at || ''), dataAt: String(o.data_at || ''), lastTicketAt: String(o.last_ticket_at || ''), today: String(o.today || days[0].date), days };
  }
  const stamp = (data) => clock(data && (data.dataAt || data.lastTicketAt));
  // the laptop writes every ~10 minutes: a file older than 2 hours means it is off or has no internet
  const isOld = (data, now) => { const t = Date.parse(data && data.generatedAt); return !Number.isFinite(t) || (num(now) || Date.now()) - t > 2 * 3600e3; };
  // the week: the 7 days up to the shown one, oldest first (a day with no data = 0)
  function week(data, date) {
    const out = [], base = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base); d.setDate(d.getDate() - i);
      const k = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const f = (data.days || []).find((x) => x.date === k);
      out.push({ date: k, ch: dayChar(k), v: f ? f.netSales : 0, has: !!f });
    }
    return out;
  }
  // the hours with sales: from the first to the last one that sold (an empty night is not drawn)
  function hours(d) {
    const h = (d && d.hours) || [];
    let a = h.findIndex((x) => num(x) !== 0), b = -1;
    for (let i = h.length - 1; i >= 0; i--) if (num(h[i]) !== 0) { b = i; break; }
    if (a < 0 || b < 0) return [];
    const out = [];
    for (let i = a; i <= b; i++) out.push({ h: i, v: Math.max(0, num(h[i])) });
    return out;
  }
  const avgTicket = (d) => (d && d.tickets > 0 ? d.grossSales / d.tickets : 0);
  const api = { WORDS, money, money2, clock, dateText, dayChar, parse, day, stamp, isOld, week, hours, avgTicket };
  root.AskerDayLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const isStaff = () => !!(root.AskerStaff && root.AskerStaff.isStaff && root.AskerStaff.isStaff());
  let data = null, loading = null, loadedAt = 0, picked = '', ours = {}, timer = null;
  const cur = () => (data && (data.days.find((d) => d.date === picked) || data.days.find((d) => d.date === data.today) || data.days[0])) || null;
  const kpi = (label, big, sub, c) => `<div class="dy-k"><small>${esc(label)}</small><b${c ? ' class="dy-c"' : ''} dir="ltr">${esc(big)}</b><i>${sub}</i></div>`;
  const row = (cells, head) => `<tr>${cells.map((c, i) => (head ? `<th${i ? ' class="dy-n"' : ''}>${esc(c)}</th>` : `<td${i ? ' class="dy-n"' : ''}>${c}</td>`)).join('')}</tr>`;

  // the box on «الرئيسية»: today's two numbers and the way into the page
  function drawHome() {
    const el = $('dayCard');
    if (!el) return;
    const d = data && data.days.find((x) => x.date === data.today);
    if (!d || isStaff()) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<div class="dy-hd"><h3 class="qa-h">📅 النهارده</h3><small>${stamp(data) ? 'لحد ' + esc(stamp(data)) : ''}</small></div>` +
      `<div class="dy-two">${kpi('المبيعات', money(d.netSales), esc(d.tickets) + ' تذكرة', true)}${kpi('الربح (تقريبي)', money(d.profit), d.margin == null ? '' : esc(d.margin) + '٪', true)}</div>` +
      '<button type="button" class="dy-go" data-go="day">تفاصيل اليوم ←</button>';
  }
  function bars(list, key, cls) {
    const mx = Math.max(1, ...list.map((x) => x[key]));
    return list.map((x) => `<div class="${cls(x)}" style="height:${Math.max(4, Math.round((x[key] / mx) * 100))}%" title="${esc(money(x[key]))}"><span>${esc(x.lbl)}</span></div>`).join('');
  }
  function drawPage() {
    const main = $('dyMain');
    if (!main) return;
    $('dyOld')?.classList.toggle('hidden', !(data && isOld(data)));
    if (!data) { main.innerHTML = '<p class="hint">الصفحة محتاجة ملف اليوم من اللاب: لسه ما وصلش.</p>'; return; }
    const d = cur();
    const i = data.days.findIndex((x) => x.date === d.date), isToday = d.date === data.today;
    const nav = `<div class="dy-card"><div class="dy-nav"><button type="button" class="dy-b" data-dy-prev aria-label="اليوم اللي قبله"${i >= data.days.length - 1 ? ' disabled' : ''}>›</button><b>${esc(dateText(d.date))}</b>` +
      `<button type="button" class="dy-b" data-dy-next aria-label="اليوم اللي بعده"${i <= 0 ? ' disabled' : ''}>‹</button></div>` +
      `<div class="dy-stamp">${isToday && stamp(data) ? 'البيانات <b>لحد ' + esc(stamp(data)) + '</b> · اتجمّعت من فارما فلاي' : 'اتجمّعت من فارما فلاي'}</div></div>`;
    const kp = '<div class="dy-grid">' +
      kpi('المبيعات', money(d.netSales), `${esc(d.tickets)} تذكرة · المتوسط ${esc(money(avgTicket(d)))}`, true) +
      kpi('الربح (تقريبي)', money(d.profit), d.margin == null ? '' : esc(d.margin) + '٪ · الربح تقريبي: التكلفة من تذاكر فارما فلاي.', true) +
      kpi('اتحصّل كاش', money(d.collected), `${esc(money(d.credit.paid))} منه سداد عملاء`) +
      kpi('آجل جديد', money(d.credit.netNew), `${esc(d.credit.customers)} عميل · بيع آجل ${esc(money(d.credit.sales))}`) + '</div>';
    const extra = [d.returns ? `مرتجع ${money(d.returns)}` : '', d.discounts ? `خصومات ${money(d.discounts)}` : '', d.misc ? `أصناف متنوعة (بالقيمة) ${money(d.misc)}` : ''].filter(Boolean);
    const extraHtml = extra.length ? `<div class="dy-line">${extra.map((x) => `<span class="dy-pill">${esc(x)}</span>`).join('')}</div>` : '';
    const boxes = d.boxes.length ? `<h3 class="dy-h">الخزن</h3><div class="dy-card"><table>${row(['الخزنة', 'داخل', 'خارج', 'الرصيد الآن'], true)}${d.boxes.map((b) => row([`<span class="notr">${esc(b.name)}</span>`, money(b.in), money(b.out), b.balance == null ? '' : money(b.balance)])).join('')}</table>` +
      ([d.expenses.length ? 'مصروفات: ' + d.expenses.map((e) => `<span class="notr">${esc(e.name)}</span> ${esc(money(e.amount))}`).join('، ') : '', d.supplierPaid ? 'دفعات للموردين: ' + money(d.supplierPaid) : '', d.ownerOut ? 'سحب المالك: ' + money(d.ownerOut) : ''].filter(Boolean).map((x) => `<div class="dy-sub">${x}</div>`).join('')) + '</div>' : '';
    const pu = `<h3 class="dy-h">المشتريات والمرتجعات</h3><div class="dy-card dy-text">🧾 فواتير شراء <b dir="ltr">${esc(d.purchases.n)}</b> بقيمة <b dir="ltr">${esc(money(d.purchases.total))}</b>` +
      (d.purchases.returnsN ? ` · مرتجع للشركات <b dir="ltr">${esc(money(d.purchases.returns))}</b>` : '') + (d.returns ? ` · مرتجع <b dir="ltr">${esc(money(d.returns))}</b>` : '') + '</div>';
    const hs = hours(d);
    const hr = hs.length ? `<h3 class="dy-h">حسب الساعة</h3><div class="dy-card dy-chart"><div class="dy-bars">${bars(hs.map((x) => ({ v: x.v, lbl: x.h % 12 || 12 })), 'v', () => '')}</div></div>` : '';
    const bc = d.belowCost.n ? `<div class="dy-warn"><b>${esc(d.belowCost.n)}</b> اتباع بأقل من التكلفة` + d.belowCost.lines.map((l) => `<div>تذكرة <bdi class="notr">${esc(l.ticket)}</bdi> · <bdi class="notr">${esc(l.item)}</bdi> · بيع <bdi class="notr">${esc(money2(l.price))}</bdi> والتكلفة <bdi class="notr">${esc(money2(l.cost))}</bdi>${l.at ? ' · <bdi class="notr">' + esc(l.at) + '</bdi>' : ''}</div>`).join('') + '</div>' : '<div class="dy-card"><span class="dy-ok">✓ مفيش بيع تحت التكلفة</span></div>';
    const o = ours[d.date];
    const ev = o ? `<h3 class="dy-h">من سيستمنا</h3><div class="dy-line"><span class="dy-pill">🤖 فواتير اتدخلت <b>${esc(o.entered)}</b></span><span class="dy-pill">وقفات الروبوت <b>${esc(o.stops)}</b></span><span class="dy-pill">طلبات الموقع <b>${esc(o.store)}</b></span><span class="dy-pill">بيع مؤقت <b>${esc(o.temp)}</b></span></div>` : '';
    const wk = week(data, d.date);
    const wkHtml = `<h3 class="dy-h">آخر ٧ أيام (المبيعات)</h3><div class="dy-card dy-chart"><div class="dy-bars">${bars(wk.map((x) => ({ v: x.v, lbl: x.ch, date: x.date })), 'v', (x) => (x.date === d.date ? 't' : ''))}</div></div>`;
    main.innerHTML = nav + kp + extraHtml + boxes + pu + hr + `<h3 class="dy-h">بيع غريب</h3>` + bc + ev + wkHtml;
  }
  // our own system's events of the shown day (the laptop file has PharmaFly's; these come from the system's tables)
  async function loadOurs(date) {
    if (!db() || !date) return;
    const a = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
    const from = a.toISOString(), to = new Date(a.getTime() + 864e5).toISOString();
    const within = (rows, col) => (rows || []).filter((r) => String(r[col] || '') < to).length;
    const get = async (t, col, extra) => { try { const q = db().from(t).select('id,' + col).gte(col, from); const { data: rows, error } = await (extra ? extra(q) : q).limit(500); return error ? 0 : within(rows, col); } catch (e) { return 0; } };
    const [entered, stops, store, temp] = await Promise.all([get('ar_invoice_reviews', 'done_at', (q) => q.eq('status', 'entered')), get('ar_robot_reports', 'created_at', (q) => q.eq('job', 'purchases')), get('ar_store_orders', 'created_at'), get('ar_temp_sales', 'created_at')]);
    ours[date] = { entered, stops, store, temp };
  }
  async function load(force) {
    if (!db() || isStaff()) { data = null; drawHome(); return null; }
    if (loading) return loading;
    if (data && !force && Date.now() - loadedAt < 4 * 60e3) return data;
    loading = (async () => {
      try {
        const { data: blob, error } = await db().storage.from('asker-private').download(PATH);
        data = error || !blob ? null : parse(JSON.parse(await blob.text()));
        loadedAt = Date.now();
        if (data && !picked) picked = data.today;
      } catch (e) { data = null; } finally { loading = null; }
      drawHome();
      if (!$('dayPanel')?.classList.contains('hidden')) { const d = cur(); if (d) await loadOurs(d.date); drawPage(); }
      return data;
    })();
    return loading;
  }
  async function show(date) {
    picked = date; await loadOurs(date); drawPage();
  }
  function bind() {
    const p = $('dayPanel');
    if (!p || p.dataset.bound) return;
    p.dataset.bound = '1';
    p.addEventListener('click', (e) => {
      const d = cur();
      if (!d || !data) return;
      const i = data.days.findIndex((x) => x.date === d.date);
      if (e.target.closest('[data-dy-prev]') && i < data.days.length - 1) show(data.days[i + 1].date);
      else if (e.target.closest('[data-dy-next]') && i > 0) show(data.days[i - 1].date);
    });
    $('dyRefresh')?.addEventListener('click', () => { load(true); });
  }
  function open() {
    bind();
    picked = data ? data.today : '';
    load(true);
    clearInterval(timer);
    timer = setInterval(() => { if ($('dayPanel') && !$('dayPanel').classList.contains('hidden') && !document.hidden) load(true); }, 5 * 60e3);
  }
  function close() { clearInterval(timer); timer = null; }
  // the home card: read once when the page is up, and again with the other counts every few minutes
  setTimeout(() => { load(false); }, 2500);
  setInterval(() => { if (!document.hidden) load(false); }, 5 * 60e3);
  root.AskerDay = { open, close, load: () => load(true), data: () => data };
})(typeof window === 'undefined' ? globalThis : window);
