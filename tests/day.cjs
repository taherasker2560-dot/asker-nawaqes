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
console.log('PASS: day: the file → the page (money, clock, dates, week, hours, an old file), the English');
