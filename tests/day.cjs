// «📅 اليوم» (owner 2026-11-25): the pure helpers of ar/day.js (the laptop's day file → what the page draws: the money, the clock, the date words, the week, the hours, an old file) and the
// English for every fixed word and the composite lines. Made-up numbers only: the repository is public.
const assert = require('node:assert/strict');
const L = require('../ar/day.js');
global.window = global; require('../ar/i18n-en.js'); require('../ar/i18n.js'); const I = global.AskerI18n; I._use(global.AskerEN);

const mk = (date, o) => ({ date, net_sales: 1000, gross_sales: 1100, returns: 100, discounts: 10, misc: 0, tickets: 10, return_tickets: 1, zero_tickets: 0, items_revenue: 900, cost: 700, profit: 190, margin: 21.1, collected: 800,
  credit: { net_new: 300, paid: 50, sales: 320, customers: 4 }, hours: Array.from({ length: 24 }, (_, h) => (h >= 10 && h <= 14 ? 100 + h : 0)), boxes: [{ id: 1, name: 'درج مثال', in: 800, out: 50, balance: 5000 }],
  expenses: [{ name: 'كهرباء', amount: 120 }], supplier_paid: 0, owner_out: 0, purchases: { n: 2, total: 1500, returns_n: 1, returns: 200 }, below_cost: { n: 0, lines: [] }, ...o });
const file = (days, o) => ({ v: 1, source: 'pharmafly', generated_at: new Date().toISOString(), data_at: '2026-11-25 20:28:10', last_ticket_at: '2026-11-25 20:30:00', today: '2026-11-25', days, ...o });

// the file must look like what the laptop writes; anything else is «no data»
assert.equal(L.parse(null), null);
assert.equal(L.parse({}), null);
assert.equal(L.parse({ days: {} }), null, 'no days = no data');
assert.equal(L.parse({ days: { x: { date: 'not a date' } } }), null, 'a day with no date is dropped');
const d = L.parse(file({ '2026-11-24': mk('2026-11-24'), '2026-11-25': mk('2026-11-25', { net_sales: 2000, below_cost: { n: 2, lines: [{ ticket: 5, item: 'ITEM A', price: 10, cost: 12, at: '20:10' }, { ticket: 6, item: 'ITEM B', price: 5, cost: 6.5, at: '20:20' }] } }) }));
assert.deepEqual(d.days.map((x) => x.date), ['2026-11-25', '2026-11-24'], 'newest first');
assert.equal(d.today, '2026-11-25');
assert.equal(d.days[0].netSales, 2000);
assert.equal(d.days[0].belowCost.n, 2);
assert.deepEqual(d.days[0].belowCost.lines.map((l) => [l.ticket, l.item, l.price, l.cost, l.at]), [[5, 'ITEM A', 10, 12, '20:10'], [6, 'ITEM B', 5, 6.5, '20:20']]);
assert.deepEqual(d.days[0].boxes[0], { id: 1, name: 'درج مثال', in: 800, out: 50, balance: 5000 });
assert.equal(L.parse(file({ '2026-11-25': mk('2026-11-25', { boxes: [{ id: 2, name: 'خزنة', in: 1, out: 0 }, { id: 3 }] }) })).days[0].boxes.length, 1, 'a box with no name is dropped');
assert.equal(L.parse(file({ '2026-11-25': mk('2026-11-25', { margin: null }) })).days[0].margin, null);
assert.equal(L.parse(file({ '2026-11-25': mk('2026-11-25', { net_sales: 'abc' }) })).days[0].netSales, 0, 'a bad number is 0, never NaN');

// the words
assert.equal(L.money(21433.1), '21,433');
assert.equal(L.money(-957.5), '-957');
assert.equal(L.money2(12.5), '12.5');
assert.equal(L.money(undefined), '0');
assert.equal(L.clock('2026-11-25 20:28:10'), '8:28 م');
assert.equal(L.clock('2026-11-25T09:05:00'), '9:05 ص');
assert.equal(L.clock('2026-11-25 00:10:00'), '12:10 ص');
assert.equal(L.clock('2026-11-25 12:00:00'), '12:00 م');
assert.equal(L.clock('nonsense'), '');
assert.equal(L.dateText('2026-11-25'), 'الأربعاء 25 نوفمبر');
assert.equal(L.dateText('2026-12-01'), 'الثلاثاء 1 ديسمبر');
assert.equal(L.dateText('x'), '');
assert.equal(L.dayChar('2026-11-25'), 'ر');
assert.equal(L.stamp(d), '8:28 م', 'the time the pharmacy copy was taken');
assert.equal(L.stamp({ dataAt: '', lastTicketAt: '2026-11-25 19:00:00' }), '7:00 م', 'no copy time: the last ticket');
assert.equal(L.avgTicket({ tickets: 10, grossSales: 1100 }), 110);
assert.equal(L.avgTicket({ tickets: 0, grossSales: 5 }), 0);

// an old file: the laptop writes every ~10 minutes; over 2 hours = off or no internet
const now = Date.parse('2026-11-25T20:30:00Z');
assert.equal(L.isOld({ generatedAt: '2026-11-25T20:20:00Z' }, now), false);
assert.equal(L.isOld({ generatedAt: '2026-11-25T17:00:00Z' }, now), true);
assert.equal(L.isOld({ generatedAt: '' }, now), true, 'no time = old');

// the hours: from the first to the last one that sold; a night with nothing is not drawn
assert.deepEqual(L.hours({ hours: [0, 0, 5, 0, 7, 0] }).map((x) => [x.h, x.v]), [[2, 5], [3, 0], [4, 7]]);
assert.deepEqual(L.hours({ hours: [0, 0, 0] }), []);
assert.deepEqual(L.hours({}), []);
assert.equal(L.hours({ hours: [0, -5, 3] })[0].v, 0, 'a negative hour (more returns than sales) is drawn flat');

// the week: seven days up to the shown one, oldest first; a day with no data is 0
const w = L.week(d, '2026-11-25');
assert.equal(w.length, 7);
assert.deepEqual(w.map((x) => x.date), ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25']);
assert.deepEqual(w.map((x) => x.v), [0, 0, 0, 0, 0, 1000, 2000]);
assert.deepEqual(w.map((x) => x.has), [false, false, false, false, false, true, true]);
assert.equal(L.week(d, '2026-11-24').length, 7, 'the week of an older day too');

// the English: every fixed word, and the lines made of words + numbers
for (const s of L.WORDS) assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, 'Arabic left in English: ' + s + ' → ' + I.translate(s));
for (const s of ['118 تذكرة · المتوسط 182', '4,500 منه سداد عملاء', '24 عميل · بيع آجل 8,956', 'البيانات لحد 8:28 م · اتجمّعت من فارما فلاي', 'الأربعاء 25 نوفمبر', '🧾 فواتير شراء 9 بقيمة 11,742 · مرتجع للشركات 1,162', 'مرتجع 957', 'خصومات 130', '2 اتباع بأقل من التكلفة', 'تذكرة 5 · بيع 10 والتكلفة 12']) {
  assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, 'Arabic left in English: ' + s + ' → ' + I.translate(s));
}

// ---- v2 (his notes the same night): the day's detail file, the lists behind the numbers, the search, one invoice ----
assert.equal(L.parseDetail(null), null);
assert.equal(L.parseDetail({}), null);
const tk = (id, o) => ({ id, t: '14:05', k: 's', ty: 'c', cu: '', total: 100, d: 0, p: 100, memo: '', lines: [{ n: 'ITEM A 10MG', q: 1, pr: 100, t: 100 }], ...o });
const det = L.parseDetail({ date: '2026-11-25', tickets: [
  tk(1, {}),
  tk(2, { ty: 'a', cu: 'عميل مثال ١', total: 4650, p: 0, lines: [{ n: 'أصناف متنوعة', q: 4650, pr: 1, t: 4650, m: 1, memo: 'فاتورة قديمة' }], mp: { vendor: 'صيدلية مثال', at: '20:27', code: '686347' } }),
  tk(3, { ty: 'a', cu: 'زبون تاني', total: 520, p: 300, d: 20, lines: [{ n: 'ITEM B', q: 0.5, pr: 400, t: 200 }, { n: 'ITEM C', q: 1, pr: 95, t: 95, bc: 1 }] }),
  tk(4, { k: 'r', total: -50, p: -50, lines: [{ n: 'ITEM A 10MG', q: -1, pr: 50, t: -50 }] }),
  tk(5, { ty: 'a', cu: 'زبون تاني', k: 'r', total: -80, p: 0, lines: [{ n: 'ITEM D', q: -1, pr: 80, t: -80 }] }),
  tk(6, { total: 200, d: 5, p: 195, lines: [{ n: 'ITEM E', q: 2, pr: 100, t: 200 }, { n: 'ITEM F', q: 1, pr: 0, t: 0, fr: 1, c: 12.5 }] }),
  tk(7, { total: 0, p: 0, lines: [] }),
  { id: null }, null,
], supplier_returns: [{ code: '~11/26/232796', vendor: 'مورد مثال', total: -302.4, t: '14:24' }, { vendor: 'x' }] });
assert.equal(det.tickets.length, 7, 'a row with no id and a null are dropped');
assert.equal(det.supplierReturns.length, 1);
assert.equal(det.tickets[1].mp.vendor, 'صيدلية مثال');
assert.equal(det.tickets[2].lines[1].bc, true);
assert.equal(det.tickets[5].lines[1].fr, true);
assert.equal(det.tickets[5].lines[1].c, 12.5);
assert.equal(L.rem(det.tickets[2]), 200, '520 - 20 discount - 300 paid');
assert.equal(L.rem(det.tickets[4]), -80, 'a return on an account takes from what he owes');
assert.equal(L.who(det.tickets[0]), 'عميل نقدي');
assert.equal(L.who(det.tickets[1]), 'عميل مثال ١');
const ids = (x) => x.rows.map((r) => r.t.id);
const sales = L.listFor('sales', det);
assert.deepEqual(ids(sales), [1, 2, 3, 6], 'sales with a total: not the returns, not the empty ticket');
assert.equal(sales.sum, 5470);
const cash = L.listFor('cash', det);
assert.deepEqual(ids(cash), [1, 3, 4, 6], 'what was paid: the cash sales, an account customer\'s payment, a refund');
assert.deepEqual(cash.rows.map((r) => r.tag), ['بيع نقدي', 'سداد عميل', 'مرتجع مدفوع', 'بيع نقدي']);
assert.equal(cash.sum, 100 + 300 - 50 + 195, 'the same sum as the day\'s «اتحصّل كاش»');
const credit = L.listFor('credit', det);
assert.deepEqual(ids(credit), [2, 3, 5], 'the account tickets that left something on a customer, a return too');
assert.deepEqual(credit.rows.map((r) => r.v), [4650, 200, -80]);
assert.equal(credit.sum, 4770, 'the same sum as the day\'s «آجل جديد»');
assert.equal(credit.extra.customers, 2);
assert.equal(credit.rows[2].tag, 'مرتجع على حساب العميل');
const rets = L.listFor('returns', det);
assert.deepEqual(ids(rets), [4, 5]);
assert.equal(rets.sum, 130);
assert.equal(rets.extra.supplier[0].total, -302.4);
const disc = L.listFor('disc', det);
assert.deepEqual(ids(disc), [3, 6]);
assert.deepEqual(disc.extra.counts, { all: 2, c: 1, a: 1 });
assert.deepEqual(ids(L.listFor('disc', det, 'a')), [3]);
assert.deepEqual(ids(L.listFor('disc', det, 'c')), [6]);
const misc = L.listFor('misc', det);
assert.deepEqual(ids(misc), [2]);
assert.equal(misc.sum, 4650);
const free = L.listFor('free', det);
assert.deepEqual(ids(free), [6]);
assert.equal(free.sum, 12.5, 'the cost of what was given away');
assert.deepEqual(L.listFor('nonsense', det).rows, []);
assert.deepEqual(L.listFor('sales', null).rows, []);
// the search: the customer, an item, the ticket number, an amount, the time, the memo; every word must match; Arabic digits and marks do not matter
const s = (q) => L.search(sales.rows, q).map((r) => r.t.id);
assert.deepEqual(s(''), [1, 2, 3, 6]);
assert.deepEqual(s('مثال ١'), [2], 'a customer');
assert.deepEqual(s('عميل مثال'), [2], 'two words');
assert.deepEqual(s('زبون'), [3], 'another customer');
assert.deepEqual(s('ITEM B'), [3], 'an item');
assert.deepEqual(s('item b'), [3], 'any case');
assert.deepEqual(s('4650'), [2], 'an amount');
assert.deepEqual(s('٤٦٥٠'), [2], 'Arabic digits');
assert.deepEqual(s('6'), [2, 6], 'a number matches the ticket number and any amount that holds it (a loose search, never a miss)');
assert.deepEqual(s('قديمه'), [2], 'a memo, ة = ه');
assert.deepEqual(s('2:05'), [1, 2, 3, 6], 'the time of day');
assert.deepEqual(s('zzz'), []);
assert.deepEqual(L.search(credit.rows, '200').map((r) => r.t.id), [3], 'the remaining amount is searchable too');
// quantities: whole packs, fractions of a pack, returns
assert.equal(L.qtyText(2), '2');
assert.equal(L.qtyText(0.5), '½');
assert.equal(L.qtyText(1.25), '1 ¼');
assert.equal(L.qtyText(0.333), '⅓');
assert.equal(L.qtyText(-1), '-1');
assert.equal(L.qtyText(-0.5), '-½');
assert.equal(L.qtyText(0.37), '0.37');
assert.equal(L.hm('20:28'), '8:28 م');
assert.equal(L.hm('09:05'), '9:05 ص');
assert.equal(L.addDays('2026-11-25', -7), '2026-11-18');
assert.equal(L.addDays('2026-03-01', -1), '2026-02-28');
assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
// the day's summary now carries the cost law's facts
assert.deepEqual(L.parse(file({ '2026-11-25': mk('2026-11-25', { free: { lines: 3, cost: 99.5 }, cost_fallback: { lines: 2, of: 300 } }) })).days[0].free, { lines: 3, cost: 99.5 });
assert.deepEqual(L.parse(file({ '2026-11-25': mk('2026-11-25', { free: { lines: 3, cost: 99.5 }, cost_fallback: { lines: 2, of: 300 } }) })).days[0].fallback, { lines: 2, of: 300 });
for (const x of ['5 تذاكر · 3 عميل', 'باقي 4,650', 'تذكرة 5 · الساعة 8:28 م', 'الأيام من الأربعاء 25 نوفمبر', 'من غير سعر 28 · تكلفتها 1,745', 'تذكرة 386436 · بأقل من التكلفة', 'الصافي 8,157', 'نفس المبلغ اتسجّل شرا من الساعة 8:27 م']) {
  assert.doesNotMatch(I.translate(x), /[؀-ۿ]/, 'Arabic left in English: ' + x + ' → ' + I.translate(x));
}
console.log('PASS: day: the file → the page (money, clock, dates, week, hours, an old file), the English');
