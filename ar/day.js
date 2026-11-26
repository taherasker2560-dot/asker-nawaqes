/* «📅 اليوم» (owner 2026-11-25: «النهارده عدّى إزاي؟ … ابني على أداء فارما فلاي نفسه … ومش هنسجل اللي بيحصل في السيستم بتاعنا بس، هنسجل اللي بيحصل في فارما فلاي كمان لحد ما ننقل على البرنامج بتاعنا»;
   mockups day_page_2026-11-25 + day_page_v2_2026-11-25, his «ابنيها» twice): the pharmacy's day on ONE page, PharmaFly's own figures first (sales, profit, cash boxes, purchases, below-cost sales,
   the hours), our own system's events under them, and the last 7 days. v2 (the same night, his notes): a date picker (any of the last 90 days), and every number opens its list with a search box:
   المبيعات / اتحصّل كاش / آجل جديد (what was taken on credit today) / مرتجع / خصومات (cash or credit) / أصناف متنوعة (what it is, and the purchase of the same amount) / من غير سعر; a tap on a ticket
   opens the whole invoice. The profit is not a button. A card on «الرئيسية» carries today's two headline numbers.
   Data: asker-private/day/day.json (the summary of up to 90 days) and asker-private/day/d_<date>.json (one day's tickets with their lines), both from the laptop (Hub\day\BUILD_DAY.ps1, read only,
   owner only). The page reads THESE FILES only: when the pharmacy moves to the Agza cashier the cashier writes the same files and nothing here changes. COST LAW (his order): the profit is on the cost
   of each item's LAST PURCHASE, never the card's; it is still approximate and says so. Nothing is written from here. */
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
    'أصناف متنوعة (بالقيمة)', 'مرتجع', 'خصومات', 'مرتجع للشركات', 'فواتير شراء', 'الربح تقريبي: بتكلفة آخر شرا لكل صنف.', 'اتباع بأقل من التكلفة', 'اتجمّعت من فارما فلاي',
    'المشتريات', 'أصناف جديدة', 'أسعار اتغيّرت', 'أسعار جمهور اتغيّرت', 'مرتجع منفصل', 'مفيش فواتير هنا', 'تفاصيل المشتريات لليوم ده لسه ما وصلتش من اللاب', 'ابحث بالمورد أو رقم الفاتورة أو الصنف', 'سعر الجمهور',
    'تذكرة', 'المتوسط', 'منه سداد عملاء', 'عميل', 'بيع آجل', 'لحد', 'البيانات', 'بقيمة', 'بيع', 'والتكلفة', ...DAYS, ...MONTHS,
    'اختار يوم', 'النهارده', 'امبارح', 'من أسبوع', 'من شهر', 'ابحث بالاسم أو الصنف أو الرقم أو المبلغ', 'رجوع', 'نقدي', 'الكل', 'كاش', 'آجل', 'تذاكر', 'باقي', 'باقي عليهم', 'دفع', 'خصم', 'الإجمالي', 'الباقي عليه',
    'الصنف', 'الكمية', 'السعر', 'بأقل من التكلفة', 'من غير سعر', 'سداد عميل', 'بيع نقدي', 'مرتجع مدفوع', 'مفيش تذاكر هنا', 'الصافي', 'مرتجع على حساب العميل', 'دفعة', 'ملاحظة', 'الأيام من', 'لحد النهارده',
    'سحب من العلبة', 'وحدة', 'تكلفتها', 'نفس المبلغ اتسجّل شرا من', 'الساعة', 'مرتجع الشركات', 'التذاكر اللي فيها أصناف متنوعة', 'اتصرفت من غير سعر', 'عميل نقدي', 'الفاتورة دي مش لاقيها', 'فتح الفاتورة', 'اللي اتصرف من غير سعر', 'تكلفة', 'الأيام المتاحة'];

  // ---------- pure helpers (also used by tests/day.cjs) ----------
  const money = (n) => Math.round(num(n)).toLocaleString('en-US');
  const money2 = (n) => num(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const clock = (iso) => { const m = /(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)/.exec(String(iso || '')); if (!m) return ''; const h = Number(m[4]); return (h % 12 || 12) + ':' + m[5] + (h < 12 ? ' ص' : ' م'); };
  const hm = (t) => { const m = /^(\d{1,2}):(\d\d)/.exec(String(t || '')); if (!m) return ''; const h = Number(m[1]); return (h % 12 || 12) + ':' + m[2] + (h < 12 ? ' ص' : ' م'); };
  const dateText = (ymd) => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(ymd || '')); if (!m) return ''; const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); return DAYS[d.getDay()] + ' ' + Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1]; };
  const dayChar = (ymd) => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(ymd || '')); return m ? DAY_CH[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()] : ''; };
  const ymdOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (ymd, n) => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(ymd || '')); if (!m) return ''; const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); d.setDate(d.getDate() + n); return ymdOf(d); };
  // a quantity of packs: whole, or a fraction of a pack (a strip of a box): ½ ¼ ¾ ⅓ ⅔, else two places
  function qtyText(q) {
    const v = num(q), s = v < 0 ? '-' : '', a = Math.abs(v), w = Math.floor(a + 1e-9), f = a - w;
    const FR = [[0.5, '½'], [0.25, '¼'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔'], [0.2, '⅕'], [0.1, '⅒']];
    if (f < 0.005) return s + w;
    const hit = FR.find((x) => Math.abs(f - x[0]) < 0.006);
    if (hit) return s + (w ? w + ' ' : '') + hit[1];
    return s + String(Math.round(a * 100) / 100);
  }
  const box = (b) => ({ id: num(b && b.id), name: String((b && b.name) || ''), in: num(b && b.in), out: num(b && b.out), balance: b && b.balance != null ? num(b.balance) : null });
  function day(d) {
    if (!d || typeof d !== 'object' || !/^\d{4}-\d\d-\d\d$/.test(String(d.date || ''))) return null;
    const cr = d.credit || {}, pu = d.purchases || {}, bc = d.below_cost || {}, fr = d.free || {}, fb = d.cost_fallback || {};
    return {
      date: String(d.date), netSales: num(d.net_sales), grossSales: num(d.gross_sales), returns: num(d.returns), discounts: num(d.discounts), misc: num(d.misc),
      tickets: num(d.tickets), returnTickets: num(d.return_tickets), profit: num(d.profit), margin: d.margin == null ? null : num(d.margin), collected: num(d.collected),
      itemsRevenue: num(d.items_revenue), cost: num(d.cost),   // the items' sales and their cost (the cost law): «💹 الربح» adds them up over a period
      // the other basis «💹 الربح» can show when he picks it (PharmaFly's own cost on the sale lines); null = the laptop has not worked this day out yet
      pf: d.pf && typeof d.pf === 'object' ? { cost: num(d.pf.cost), profit: num(d.pf.profit), below: num(d.pf.below), noCost: num(d.pf.no_cost), freeCost: num(d.pf.free_cost) } : null,
      free: { lines: num(fr.lines), cost: num(fr.cost) }, fallback: { lines: num(fb.lines), of: num(fb.of) },
      credit: { netNew: num(cr.net_new), paid: num(cr.paid), sales: num(cr.sales), customers: num(cr.customers) },
      hours: Array.isArray(d.hours) ? d.hours.slice(0, 24).map(num) : [],
      boxes: (Array.isArray(d.boxes) ? d.boxes : []).filter((b) => b && b.name).map(box),
      expenses: (Array.isArray(d.expenses) ? d.expenses : []).filter((e) => e && e.name).map((e) => ({ name: String(e.name), amount: num(e.amount) })),
      supplierPaid: num(d.supplier_paid), ownerOut: num(d.owner_out),
      purchases: { n: num(pu.n), total: num(pu.total), returnsN: num(pu.returns_n), returns: num(pu.returns), newN: num(pu.new_n), pricesN: num(pu.prices_n) },
      belowCost: { n: num(bc.n), lines: (Array.isArray(bc.lines) ? bc.lines : []).filter((l) => l && l.ticket != null).map((l) => ({ ticket: num(l.ticket), item: String(l.item || ''), price: num(l.price), cost: num(l.cost), at: String(l.at || '') })) },
    };
  }
  // the file must look like what the laptop writes; anything else is «no data»
  function parse(o) {
    if (!o || typeof o !== 'object' || !o.days || typeof o.days !== 'object') return null;
    const days = Object.keys(o.days).map((k) => day(o.days[k])).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
    if (!days.length) return null;
    return { generatedAt: String(o.generated_at || ''), dataAt: String(o.data_at || ''), lastTicketAt: String(o.last_ticket_at || ''), today: String(o.today || days[0].date), days, closes: o.closes && typeof o.closes === 'object' ? o.closes : {} };   // closes: the drawer's shifts, read by ar/close.js
  }
  // one day's detail file: the tickets with their lines
  function parseDetail(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.tickets)) return null;
    const tickets = o.tickets.filter((t) => t && t.id != null).map((t) => ({
      id: num(t.id), t: String(t.t || ''), k: t.k === 'r' ? 'r' : 's', ty: t.ty === 'a' ? 'a' : 'c', cu: String(t.cu || ''), total: num(t.total), d: num(t.d), p: num(t.p), memo: String(t.memo || ''),
      mp: t.mp && typeof t.mp === 'object' ? { vendor: String(t.mp.vendor || ''), at: String(t.mp.at || ''), code: String(t.mp.code || '') } : null,
      lines: (Array.isArray(t.lines) ? t.lines : []).filter((l) => l && l.n != null).map((l) => ({ n: String(l.n), q: num(l.q), pr: num(l.pr), t: num(l.t), bc: !!l.bc, m: !!l.m, fr: !!l.fr, ct: !!l.ct, u: l.u == null ? 0 : num(l.u), c: l.c == null ? null : num(l.c), k: l.k == null ? null : num(l.k), memo: String(l.memo || '') })),
    }));
    return { date: String(o.date || ''), tickets, buys: parseBuys(o.buys), supplierReturns: (Array.isArray(o.supplier_returns) ? o.supplier_returns : []).filter((r) => r && r.code != null).map((r) => ({ code: String(r.code), vendor: String(r.vendor || ''), total: num(r.total), t: String(r.t || '') })) };
  }
  // the day's purchases (owner 2026-11-26, «ا، ابنيها»: the end-of-day purchase report): each invoice with what it sent back, the item cards made that day that came on
  // them, and the public prices that moved from the item's previous purchase. null = a file written before this.
  function parseBuys(b) {
    if (!b || typeof b !== 'object' || !Array.isArray(b.invoices)) return null;
    const list = (a) => (Array.isArray(a) ? a : []).filter((x) => x && typeof x === 'object');
    return {
      invoices: list(b.invoices).filter((x) => x.code != null).map((x) => ({ code: String(x.code), vendor: String(x.vendor || ''), t: String(x.t || ''), net: num(x.net), lines: num(x.lines), ret: num(x.ret) })),
      newCards: list(b.new_cards).filter((x) => x.n != null).map((x) => ({ n: String(x.n), price: num(x.price) })),
      prices: list(b.prices).filter((x) => x.n != null).map((x) => ({ n: String(x.n), was: num(x.was), now: num(x.now) })),
    };
  }
  // what the purchases list shows, narrowed by the search (the vendor, the invoice number, an amount, an item name). The separate return documents (not a «~» one of
  // an invoice, like the PMM one) are shown apart.
  function buysView(det, q) {
    const b = det && det.buys;
    if (!b) return null;
    const words = norm(q || '').split(' ').filter(Boolean);
    const hit = (...parts) => { if (!words.length) return true; const x = norm(parts.join(' ')); return words.every((w) => x.includes(w)); };
    const invoices = b.invoices.filter((v) => hit(v.vendor, v.code, v.net, v.ret || ''));
    const apart = (det.supplierReturns || []).filter((r) => !String(r.code).startsWith('~') && hit(r.vendor, r.code, Math.abs(r.total)));
    const round = (x) => Math.round(x * 100) / 100;
    return { invoices, apart, newCards: b.newCards.filter((x) => hit(x.n, x.price)), prices: b.prices.filter((x) => hit(x.n, x.was, x.now)),
      sum: round(invoices.reduce((a, v) => a + v.net, 0)), ret: round(invoices.reduce((a, v) => a + v.ret, 0)) };
  }
  const rem = (t) => Math.round((t.total - t.d - t.p) * 100) / 100;       // what an account ticket left on the customer (negative for a return)
  const who = (t) => (t.cu ? t.cu : (t.ty === 'a' ? 'عميل' : 'عميل نقدي'));
  // the lists behind the numbers. Each row: the ticket and the figure that list is about.
  function listFor(kind, det, filter) {
    const T = (det && det.tickets) || [];
    const row = (t, v, tag) => ({ t, v, tag: tag || '' });
    let rows = [], title = '', sum = 0, extra = {};
    if (kind === 'sales') { title = 'المبيعات'; rows = T.filter((t) => t.k === 's' && t.total > 0).map((t) => row(t, t.total)); }
    else if (kind === 'cash') {
      title = 'اتحصّل كاش';
      rows = T.filter((t) => Math.abs(t.p) > 0.004).map((t) => row(t, t.p, t.k === 'r' ? 'مرتجع مدفوع' : (t.ty === 'a' ? 'سداد عميل' : 'بيع نقدي')));
    } else if (kind === 'credit') {
      title = 'آجل جديد';
      rows = T.filter((t) => t.ty === 'a' && Math.abs(rem(t)) > 0.004).map((t) => row(t, rem(t), t.k === 'r' ? 'مرتجع على حساب العميل' : ''));
      extra.customers = new Set(rows.filter((r) => r.t.cu).map((r) => r.t.cu)).size;
    } else if (kind === 'returns') { title = 'مرتجع'; rows = T.filter((t) => t.k === 'r').map((t) => row(t, -t.total)); extra.supplier = (det && det.supplierReturns) || []; }
    else if (kind === 'disc') {
      title = 'خصومات'; rows = T.filter((t) => t.k === 's' && t.d > 0.004).map((t) => row(t, t.d));
      extra.counts = { all: rows.length, c: rows.filter((r) => r.t.ty === 'c').length, a: rows.filter((r) => r.t.ty === 'a').length };
      if (filter === 'c' || filter === 'a') rows = rows.filter((r) => r.t.ty === filter);
    } else if (kind === 'misc') { title = 'أصناف متنوعة (بالقيمة)'; rows = T.filter((t) => t.lines.some((l) => l.m)).map((t) => row(t, t.lines.filter((l) => l.m).reduce((a, l) => a + l.t, 0))); }
    else if (kind === 'free') { title = 'من غير سعر'; rows = T.filter((t) => t.lines.some((l) => l.fr)).map((t) => row(t, t.lines.filter((l) => l.fr).reduce((a, l) => a + num(l.c) * l.q, 0))); }
    sum = Math.round(rows.reduce((a, r) => a + r.v, 0) * 100) / 100;
    return { kind, title, rows, sum, extra };
  }
  // search: the customer, the item, the ticket number, the amounts, the time, the memo; every word must match (Arabic digits and marks are ignored)
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
  function ticketText(t) {
    const nums = [t.id, t.total, t.d, t.p, rem(t), Math.abs(t.total), Math.abs(rem(t))].map((x) => String(x));
    return norm([t.cu, t.id, t.t, hm(t.t), t.memo, nums.join(' '), (t.lines || []).map((l) => l.n + ' ' + l.memo).join(' ')].join(' '));
  }
  function search(rows, q) {
    const words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return rows;
    return rows.filter((r) => { const x = ticketText(r.t); return words.every((w) => x.includes(w)); });
  }
  const stamp = (data) => clock(data && (data.dataAt || data.lastTicketAt));
  // the laptop writes every ~10 minutes: a file older than 2 hours means it is off or has no internet
  const isOld = (data, now) => { const t = Date.parse(data && data.generatedAt); return !Number.isFinite(t) || (num(now) || Date.now()) - t > 2 * 3600e3; };
  // the week: the 7 days up to the shown one, oldest first (a day with no data = 0)
  function week(data, date) {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const k = addDays(date, -i);
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
  const api = { WORDS, money, money2, clock, hm, dateText, dayChar, addDays, qtyText, parse, parseDetail, day, listFor, buysView, search, norm, rem, who, stamp, isOld, week, hours, avgTicket };
  root.AskerDayLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const isStaff = () => !!(root.AskerStaff && root.AskerStaff.isStaff && root.AskerStaff.isStaff());
  let data = null, loading = null, loadedAt = 0, picked = '', ours = {}, timer = null, view = null, dets = {};
  const cur = () => (data && (data.days.find((d) => d.date === picked) || null));
  const kpi = (label, big, sub, c, open, star) => `<${open ? 'button type="button" data-dy-open="' + open + '"' : 'div'} class="dy-k${open ? ' dy-tap' : ''}${star ? ' dy-star' : ''}"><small>${esc(label)}</small><b${c ? ' class="dy-c"' : ''} dir="ltr">${esc(big)}</b><i>${sub}</i></${open ? 'button' : 'div'}>`;
  const row = (cells, head) => `<tr>${cells.map((c, i) => (head ? `<th${i ? ' class="dy-n"' : ''}>${esc(c)}</th>` : `<td${i ? ' class="dy-n"' : ''}>${c}</td>`)).join('')}</tr>`;
  const pill = (txt, open) => `<button type="button" class="dy-pill dy-ptap" data-dy-open="${open}">${txt} ›</button>`;

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
  // the date bar: the picker (the days the laptop has), quick days, and the arrows
  function dateBar(d) {
    const first = data.days[data.days.length - 1].date;
    const has = (k) => data.days.some((x) => x.date === k);
    const quick = [['النهارده', data.today], ['امبارح', addDays(data.today, -1)], ['من أسبوع', addDays(data.today, -7)], ['من شهر', addDays(data.today, -30)]];
    const i = d ? data.days.findIndex((x) => x.date === d.date) : -1, isToday = picked === data.today;
    return `<div class="dy-card"><div class="dy-pick"><button type="button" class="dy-b" data-dy-prev aria-label="اليوم اللي قبله"${picked <= first ? ' disabled' : ''}>›</button>` +
      `<label class="dy-date"><span>${esc(dateText(picked))}</span><small>📅 اختار يوم</small><input id="dyDate" type="date" min="${esc(first)}" max="${esc(data.today)}" value="${esc(picked)}" aria-label="اختار يوم" /></label>` +
      `<button type="button" class="dy-b" data-dy-next aria-label="اليوم اللي بعده"${picked >= data.today ? ' disabled' : ''}>‹</button></div>` +
      `<div class="dy-line">${quick.map(([l, k]) => `<button type="button" class="dy-chip${k === picked ? ' on' : ''}" data-dy-go="${esc(k)}"${has(k) ? '' : ' disabled'}>${esc(l)}</button>`).join('')}</div>` +
      `<div class="dy-stamp">${isToday && stamp(data) ? 'البيانات <b>لحد ' + esc(stamp(data)) + '</b> · اتجمّعت من فارما فلاي' : 'اتجمّعت من فارما فلاي'} · الأيام من ${esc(dateText(first))}</div></div>`;
  }
  function drawPage() {
    const main = $('dyMain');
    if (!main) return;
    $('dyOld')?.classList.toggle('hidden', !(data && isOld(data)));
    if (!data) { main.innerHTML = '<p class="hint">الصفحة محتاجة ملف اليوم من اللاب: لسه ما وصلش.</p>'; return; }
    const d = cur();
    if (!d) { main.innerHTML = dateBar(null) + '<p class="hint">مفيش بيانات لليوم ده</p>'; return; }
    const isToday = d.date === data.today;
    const kp = '<div class="dy-grid">' +
      kpi('المبيعات', money(d.netSales), `${esc(d.tickets)} تذكرة · المتوسط ${esc(money(avgTicket(d)))}`, true, 'sales') +
      kpi('الربح (تقريبي)', money(d.profit), d.margin == null ? '' : esc(d.margin) + '٪ · الربح تقريبي: بتكلفة آخر شرا لكل صنف.', true) +
      kpi('اتحصّل كاش', money(d.collected), `${esc(money(d.credit.paid))} منه سداد عملاء`, false, 'cash') +
      kpi('آجل جديد', money(d.credit.netNew), `${esc(d.credit.customers)} عميل · بيع آجل ${esc(money(d.credit.sales))}`, true, 'credit', true) + '</div>';
    const pills = [d.returns ? pill(`مرتجع ${money(d.returns)}`, 'returns') : '', d.discounts ? pill(`خصومات ${money(d.discounts)}`, 'disc') : '', d.misc ? pill(`أصناف متنوعة (بالقيمة) ${money(d.misc)}`, 'misc') : '',
      d.free.lines ? pill(`من غير سعر ${esc(d.free.lines)} · تكلفتها ${money(d.free.cost)}`, 'free') : ''].filter(Boolean);
    const extraHtml = pills.length ? `<div class="dy-line">${pills.join('')}</div>` : '';
    const boxes = d.boxes.length ? `<h3 class="dy-h">الخزن</h3><div class="dy-card"><table>${row(['الخزنة', 'داخل', 'خارج', 'الرصيد الآن'], true)}${d.boxes.map((b) => row([`<span class="notr">${esc(b.name)}</span>`, money(b.in), money(b.out), b.balance == null ? '' : money(b.balance)])).join('')}</table>` +
      ([d.expenses.length ? 'مصروفات: ' + d.expenses.map((e) => `<span class="notr">${esc(e.name)}</span> ${esc(money(e.amount))}`).join('، ') : '', d.supplierPaid ? 'دفعات للموردين: ' + money(d.supplierPaid) : '', d.ownerOut ? 'سحب المالك: ' + money(d.ownerOut) : ''].filter(Boolean).map((x) => `<div class="dy-sub">${x}</div>`).join('')) + '</div>' : '';
    const puIn = `🧾 فواتير شراء <b dir="ltr">${esc(d.purchases.n)}</b> بقيمة <b dir="ltr">${esc(money(d.purchases.total))}</b>` +
      (d.purchases.returnsN ? ` · مرتجع للشركات <b dir="ltr">${esc(money(d.purchases.returns))}</b>` : '') + (d.returns ? ` · مرتجع <b dir="ltr">${esc(money(d.returns))}</b>` : '') +
      (d.purchases.newN ? ` · أصناف جديدة <b dir="ltr">${esc(d.purchases.newN)}</b>` : '') + (d.purchases.pricesN ? ` · أسعار اتغيّرت <b dir="ltr">${esc(d.purchases.pricesN)}</b>` : '');
    const pu = '<h3 class="dy-h">المشتريات والمرتجعات</h3>' + (d.purchases.n ? `<button type="button" class="dy-card dy-text dy-buys" data-dy-open="buys">${puIn} <span class="dy-more">›</span></button>` : `<div class="dy-card dy-text">${puIn}</div>`);
    const hs = hours(d);
    const hr = hs.length ? `<h3 class="dy-h">حسب الساعة</h3><div class="dy-card dy-chart"><div class="dy-bars">${bars(hs.map((x) => ({ v: x.v, lbl: x.h % 12 || 12 })), 'v', () => '')}</div></div>` : '';
    const bc = d.belowCost.n ? `<div class="dy-warn"><b>${esc(d.belowCost.n)}</b> اتباع بأقل من التكلفة` + d.belowCost.lines.map((l) => `<button type="button" class="dy-bl" data-dy-t="${esc(l.ticket)}">تذكرة <bdi class="notr">${esc(l.ticket)}</bdi> · <bdi class="notr">${esc(l.item)}</bdi> · بيع <bdi class="notr">${esc(money2(l.price))}</bdi> والتكلفة <bdi class="notr">${esc(money2(l.cost))}</bdi>${l.at ? ' · <bdi class="notr">' + esc(l.at) + '</bdi>' : ''}</button>`).join('') + '</div>' : '<div class="dy-card"><span class="dy-ok">✓ مفيش بيع تحت التكلفة</span></div>';
    const o = ours[d.date];
    const ev = o ? `<h3 class="dy-h">من سيستمنا</h3><div class="dy-line"><span class="dy-pill">🤖 فواتير اتدخلت <b>${esc(o.entered)}</b></span><span class="dy-pill">وقفات الروبوت <b>${esc(o.stops)}</b></span><span class="dy-pill">طلبات الموقع <b>${esc(o.store)}</b></span><span class="dy-pill">بيع مؤقت <b>${esc(o.temp)}</b></span></div>` : '';
    const wk = week(data, d.date);
    const wkHtml = `<h3 class="dy-h">آخر ٧ أيام (المبيعات)</h3><div class="dy-card dy-chart"><div class="dy-bars">${bars(wk.map((x) => ({ v: x.v, lbl: x.ch, date: x.date })), 'v', (x) => (x.date === d.date ? 't' : ''))}</div></div>`;
    main.innerHTML = dateBar(d) + kp + extraHtml + boxes + pu + hr + `<h3 class="dy-h">بيع غريب</h3>` + bc + ev + wkHtml;
  }

  // ---------- a list behind a number, and one invoice ----------
  const FILT = [['all', 'الكل'], ['c', 'كاش'], ['a', 'آجل']];
  function rowHtml(r, kind) {
    const t = r.t, a = t.ty === 'a';
    const sub = [hm(t.t), 'تذكرة ' + t.id];
    if (kind === 'sales' || kind === 'disc') { if (t.d > 0) sub.push('خصم ' + money2(t.d)); }
    if (kind === 'credit') { if (t.p) sub.push('دفع ' + money2(t.p)); }
    if (kind === 'misc') { const m = [t.memo].concat(t.lines.filter((l) => l.m).map((l) => l.memo)).filter(Boolean).join('، '); if (m) sub.push(m); }
    if (r.tag) sub.unshift(r.tag);
    const extra = kind === 'sales' && a ? '<small class="dy-badge">آجل</small>' : '';
    const mp = kind === 'misc' && t.mp ? `<div class="dy-mp">نفس المبلغ اتسجّل شرا من <bdi class="notr">${esc(t.mp.vendor)}</bdi> الساعة ${esc(hm(t.mp.at))}</div>` : '';
    const neg = r.v < 0 ? ' dy-neg' : '';
    return `<button type="button" class="dy-tk" data-dy-t="${esc(t.id)}"><div class="dy-a"><span class="dy-v${neg}" dir="ltr">${esc(money2(r.v))}</span><b class="notr">${esc(who(t))}</b> ${extra}</div><div class="dy-bb"><span>${esc(sub.join(' · '))}</span>${kind === 'credit' && t.k === 's' && rem(t) > 0 ? `<span class="dy-rem">باقي ${esc(money2(rem(t)))}</span>` : ''}</div>${mp}</button>`;
  }
  function rowsHtml(L, q) {
    const rows = search(L.rows, q);
    if (!rows.length) return '<p class="hint">مفيش تذاكر هنا</p>';
    let html = rows.map((r) => rowHtml(r, L.kind)).join('');
    if (L.kind === 'returns' && !q && L.extra.supplier.length) {
      html += '<h3 class="dy-h">مرتجع الشركات</h3>' + L.extra.supplier.map((s) => `<div class="dy-tk dy-static"><div class="dy-a"><span class="dy-v dy-neg" dir="ltr">${esc(money2(s.total))}</span><b class="notr">${esc(s.vendor)}</b></div><div class="dy-bb"><span>${esc(hm(s.t))} · <bdi class="notr">${esc(s.code)}</bdi></span></div></div>`).join('');
    }
    return html;
  }
  function totalsLine(L, rows) {
    const sum = Math.round(rows.reduce((a, r) => a + r.v, 0) * 100) / 100, n = rows.length;
    const lbl = L.kind === 'credit' ? 'الصافي' : (L.kind === 'free' ? 'تكلفة' : '');
    const cus = L.kind === 'credit' ? ` · ${esc(L.extra.customers)} عميل` : '';
    return `<div class="dy-tot"><span>${esc(n)} تذاكر${cus}</span><b dir="ltr">${lbl ? esc(lbl) + ' ' : ''}${esc(money2(sum))}</b></div>`;
  }
  // the purchases list: the invoices (with their «-» returns), the separate returns, the new cards, the public prices that moved
  const stat = (v, name, sub, extra, neg) => `<div class="dy-tk dy-static"><div class="dy-a"><span class="dy-v${neg ? ' dy-neg' : ''}" dir="ltr">${v}</span><b class="notr">${esc(name)}</b></div><div class="dy-bb"><span>${sub}</span>${extra || ''}</div></div>`;
  function buysHtml(B) {
    const inv = B.invoices.map((v) => stat(esc(money2(v.net)), v.vendor, `${esc(hm(v.t))} · <bdi class="notr">${esc(v.code)}</bdi> · ${esc(v.lines)} سطر`, v.ret ? `<span class="dy-rem">مرتجع ${esc(money2(v.ret))}</span>` : '')).join('');
    const apart = B.apart.length ? '<h3 class="dy-h">مرتجع منفصل</h3>' + B.apart.map((r) => stat(esc(money2(r.total)), r.vendor, `${esc(hm(r.t))} · <bdi class="notr">${esc(r.code)}</bdi>`, '', true)).join('') : '';
    const nw = B.newCards.length ? '<h3 class="dy-h">أصناف جديدة</h3>' + B.newCards.map((x) => stat(esc(money2(x.price)), x.n, 'سعر الجمهور')).join('') : '';
    const pr = B.prices.length ? '<h3 class="dy-h">أسعار جمهور اتغيّرت</h3>' + B.prices.map((x) => stat(esc(money2(x.now)), x.n, `من <bdi class="notr">${esc(money2(x.was))}</bdi> إلى <bdi class="notr">${esc(money2(x.now))}</bdi>`)).join('') : '';
    return (inv || '<p class="hint">مفيش فواتير هنا</p>') + apart + nw + pr;
  }
  const buysTotals = (B) => `<div class="dy-tot"><span>${esc(B.invoices.length)} فاتورة${B.ret ? ` · مرتجع ${esc(money2(B.ret))}` : ''}</span><b dir="ltr">${esc(money2(B.sum))}</b></div>`;
  function drawBuys() {
    const main = $('dyMain'), B = buysView(dets[picked], view.q);
    const head = `<button type="button" class="dy-back" data-dy-back>› رجوع</button><h3 class="dy-h2">المشتريات · ${esc(dateText(picked))}</h3>`;
    if (!B) { main.innerHTML = head + '<p class="hint">تفاصيل المشتريات لليوم ده لسه ما وصلتش من اللاب</p>'; return; }
    main.innerHTML = head + `<div class="dy-search"><span aria-hidden="true">🔎</span><input id="dySearch" type="search" inputmode="search" autocomplete="off" placeholder="ابحث بالمورد أو رقم الفاتورة أو الصنف" aria-label="ابحث بالمورد أو رقم الفاتورة أو الصنف" value="${esc(view.q || '')}" /></div>` +
      `<div id="dyTot">${buysTotals(B)}</div><div id="dyRows">${buysHtml(B)}</div>`;
  }
  function drawList() {
    const main = $('dyMain'), d = cur(), det = dets[picked];
    if (!main || !d) return;
    if (!det) { main.innerHTML = '<p class="hint">الصفحة محتاجة ملف اليوم من اللاب: لسه ما وصلش.</p><button type="button" class="dy-back" data-dy-back>› رجوع</button>'; return; }
    if (view.kind === 'buys') { drawBuys(); return; }
    const L = listFor(view.kind, det, view.f);
    const filt = view.kind === 'disc' ? `<div class="dy-line">${FILT.map(([k, l]) => `<button type="button" class="dy-chip${(view.f || 'all') === k ? ' on' : ''}" data-dy-f="${k}">${esc(l)}${L.extra.counts ? ' ' + esc(L.extra.counts[k]) : ''}</button>`).join('')}</div>` : '';
    const note = view.kind === 'misc' ? '<p class="hint">التذاكر اللي فيها أصناف متنوعة</p>' : (view.kind === 'free' ? '<p class="hint">اتصرفت من غير سعر</p>' : '');
    main.innerHTML = `<button type="button" class="dy-back" data-dy-back>› رجوع</button><h3 class="dy-h2">${esc(L.title)} · ${esc(dateText(picked))}</h3>` +
      `<div class="dy-search"><span aria-hidden="true">🔎</span><input id="dySearch" type="search" inputmode="search" autocomplete="off" placeholder="ابحث بالاسم أو الصنف أو الرقم أو المبلغ" aria-label="ابحث بالاسم أو الصنف أو الرقم أو المبلغ" value="${esc(view.q || '')}" /></div>` +
      filt + note + `<div id="dyTot">${totalsLine(L, search(L.rows, view.q))}</div><div id="dyRows">${rowsHtml(L, view.q)}</div>`;
  }
  function drawTicket() {
    const main = $('dyMain'), det = dets[picked];
    if (!main) return;
    const t = det && det.tickets.find((x) => x.id === view.ticket);
    const back = '<button type="button" class="dy-back" data-dy-back>› رجوع</button>';
    if (!t) { main.innerHTML = back + '<p class="hint">الفاتورة دي مش لاقيها</p>'; return; }
    const r = rem(t), a = t.ty === 'a';
    const lines = t.lines.map((l) => `<tr${l.bc || l.fr ? ' class="dy-red"' : ''}><td><span class="notr">${esc(l.n)}</span>${l.bc ? ' <span class="dy-flag">· بأقل من التكلفة</span>' : ''}${l.fr ? ` <span class="dy-flag">· من غير سعر · تكلفتها ${esc(money2(l.c))}</span>` : ''}${l.ct ? ` <span class="dy-note">· سحب من العلبة${l.u ? ' · ' + esc(qtyText(l.u)) + ' وحدة' : ''}</span>` : ''}${l.memo ? `<div class="dy-sub"><span class="notr">${esc(l.memo)}</span></div>` : ''}</td><td class="dy-n">${esc(qtyText(l.q))}</td><td class="dy-n">${esc(money2(l.pr))}</td><td class="dy-n">${esc(money2(l.t))}</td></tr>`).join('');
    main.innerHTML = back + `<h3 class="dy-h2">تذكرة <bdi class="notr">${esc(t.id)}</bdi></h3>` +
      `<div class="dy-card"><b class="notr">${esc(who(t))}</b> · ${a ? 'آجل' : 'نقدي'}${t.k === 'r' ? ' · مرتجع' : ''}<div class="dy-stamp">${esc(dateText(picked))} · ${esc(hm(t.t))}</div>${t.memo ? `<div class="dy-sub">ملاحظة: <span class="notr">${esc(t.memo)}</span></div>` : ''}</div>` +
      `<div class="dy-card"><table>${row(['الصنف', 'الكمية', 'السعر', 'الإجمالي'], true)}${lines}</table>` +
      `<div class="dy-tot"><span>الإجمالي</span><b dir="ltr">${esc(money2(t.total))}</b></div><div class="dy-tot"><span>خصم</span><b dir="ltr">${esc(money2(t.d))}</b></div><div class="dy-tot"><span>دفع</span><b dir="ltr">${esc(money2(t.p))}</b></div>` +
      (a ? `<div class="dy-tot"><span>الباقي عليه</span><b dir="ltr" class="${r > 0 ? 'dy-neg' : ''}">${esc(money2(r))}</b></div>` : '') + '</div>' +
      (t.mp ? `<div class="dy-card dy-mp">نفس المبلغ اتسجّل شرا من <bdi class="notr">${esc(t.mp.vendor)}</bdi> الساعة ${esc(hm(t.mp.at))}</div>` : '');
  }
  function draw() {
    if (view && view.ticket != null) drawTicket();
    else if (view) drawList();
    else drawPage();
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
  // one day's tickets (a past day is read once; today again at every refresh)
  async function loadDetail(date, force) {
    if (!db() || !date) return null;
    if (dets[date] && !force && date !== (data && data.today)) return dets[date];
    try {
      const { data: blob, error } = await db().storage.from('asker-private').download('day/d_' + date + '.json');
      dets[date] = error || !blob ? null : parseDetail(JSON.parse(await blob.text()));
    } catch (e) { dets[date] = null; }
    return dets[date];
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
        if (data && (!picked || !data.days.some((d) => d.date === picked)) && !(view && picked)) picked = data.today;
      } catch (e) { data = null; } finally { loading = null; }
      drawHome();
      if (!$('dayPanel')?.classList.contains('hidden')) {
        const d = cur();
        if (d) { await loadOurs(d.date); if (view) await loadDetail(picked, true); }
        const typing = document.activeElement && document.activeElement.id === 'dySearch';
        if (!typing) draw();
      }
      return data;
    })();
    return loading;
  }
  async function show(date) {
    picked = date; view = null; await loadOurs(date); draw();
    const d = cur(); if (d) loadDetail(date);   // the detail waits in the background for his first tap
  }
  async function openList(kind) {
    view = { kind, q: '', f: 'all' };
    await loadDetail(picked);
    draw();
    const s = $('dySearch'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
  }
  function bind() {
    const p = $('dayPanel');
    if (!p || p.dataset.bound) return;
    p.dataset.bound = '1';
    p.addEventListener('click', (e) => {
      if (!data) return;
      const t = (s) => e.target.closest(s);
      let el;
      if ((el = t('[data-dy-open]'))) { openList(el.dataset.dyOpen); return; }
      if ((el = t('[data-dy-t]'))) {
        const id = Number(el.dataset.dyT), keep = view && view.ticket == null ? view : null;
        view = { ...(keep || { kind: 'sales', q: '', f: 'all' }), ticket: id, from: keep ? 'list' : 'page' };
        loadDetail(picked).then(() => { draw(); window.scrollTo({ top: 0 }); });
        return;
      }
      if (t('[data-dy-back]')) {
        if (view && view.ticket != null && view.from === 'list') { view = { kind: view.kind, q: view.q, f: view.f }; draw(); }
        else { view = null; draw(); }
        return;
      }
      if ((el = t('[data-dy-f]'))) { view.f = el.dataset.dyF; draw(); return; }
      if ((el = t('[data-dy-go]'))) { if (!el.disabled) show(el.dataset.dyGo); return; }
      if (t('[data-dy-prev]') && !view) { const k = addDays(picked, -1); const f = data.days[data.days.length - 1].date; if (k >= f) show(k); return; }
      if (t('[data-dy-next]') && !view) { const k = addDays(picked, 1); if (k <= data.today) show(k); }
    });
    p.addEventListener('input', (e) => {
      if (e.target.id === 'dySearch' && view && view.ticket == null) {
        view.q = e.target.value;
        if (view.kind === 'buys') { const B = buysView(dets[picked], view.q); if (B) { $('dyRows').innerHTML = buysHtml(B); $('dyTot').innerHTML = buysTotals(B); } return; }
        const L = listFor(view.kind, dets[picked], view.f);
        $('dyRows').innerHTML = rowsHtml(L, view.q);
        $('dyTot').innerHTML = totalsLine(L, search(L.rows, view.q));
      }
    });
    p.addEventListener('change', (e) => { if (e.target.id === 'dyDate' && e.target.value) show(e.target.value); });
    $('dyRefresh')?.addEventListener('click', () => { load(true); });
  }
  function open() {
    bind();
    view = null;
    picked = data ? data.today : '';
    load(true);
    clearInterval(timer);
    timer = setInterval(() => { if ($('dayPanel') && !$('dayPanel').classList.contains('hidden') && !document.hidden) load(true); }, 5 * 60e3);
  }
  function close() { clearInterval(timer); timer = null; }
  // the home card: read once when the page is up, and again with the other counts every few minutes
  setTimeout(() => { load(false); }, 2500);
  setInterval(() => { if (!document.hidden) load(false); }, 5 * 60e3);
  root.AskerDay = { open, close, load: () => load(true), data: () => data, show, openList };
})(typeof window === 'undefined' ? globalThis : window);
