// «💹 الربح والهامش» (owner 2026-11-25): the pure helpers of ar/profit.js (the periods, the headline numbers added up from the day file, the bars, the period file the laptop writes, the thin-margin line,
// the searches) and the English for every fixed word and the composite lines. Made-up numbers only: the repository is public.
const assert = require('node:assert/strict');
const D = require('../ar/day.js');
const P = require('../ar/profit.js');
global.window = global; require('../ar/i18n-en.js'); require('../ar/i18n.js'); const I = global.AskerI18n; I._use(global.AskerEN);

const mk = (date, o) => ({ date, net_sales: 1000, gross_sales: 1100, returns: 100, discounts: 10, misc: 0, tickets: 10, return_tickets: 1, zero_tickets: 0, items_revenue: 900, cost: 700, profit: 190, margin: 21.3, collected: 800,
  credit: { net_new: 300, paid: 50, sales: 320, customers: 4 }, hours: [], boxes: [], expenses: [], supplier_paid: 0, owner_out: 0, purchases: { n: 2, total: 1500, returns_n: 0, returns: 0 }, below_cost: { n: 0, lines: [] },
  free: { lines: 2, cost: 50 }, cost_fallback: { lines: 1, of: 100 }, ...o });
// 100 days of data ending 2026-11-25 (the laptop keeps 91: today and 90 before it)
const days = {}; for (let i = 0; i <= 90; i++) { const k = D.addDays('2026-11-25', -i); days[k] = mk(k, i === 0 ? { profit: 400, net_sales: 2000, items_revenue: 1800, cost: 1390, discounts: 10 } : {}); }
const data = D.parse({ v: 2, generated_at: new Date().toISOString(), today: '2026-11-25', days });

// the day file now carries the items' sales and their cost (the cost law)
assert.equal(data.days[0].itemsRevenue, 1800);
assert.equal(data.days[0].cost, 1390);
assert.equal(D.parse({ days: { '2026-11-25': { date: '2026-11-25' } } }).days[0].itemsRevenue, 0, 'a missing number is 0');

// the periods: the last N days up to today; a month = its days that the 90-day window holds
assert.deepEqual(P.range(data, '7'), { from: '2026-11-19', to: '2026-11-25' });
assert.deepEqual(P.range(data, '30'), { from: '2026-10-27', to: '2026-11-25' });
assert.deepEqual(P.range(data, '90'), { from: '2026-08-28', to: '2026-11-25' });
assert.deepEqual(P.range(data, 'm2026-11'), { from: '2026-11-01', to: '2026-11-25' });
assert.deepEqual(P.range(data, 'm2026-10'), { from: '2026-10-01', to: '2026-10-31' });
assert.deepEqual(P.range(data, 'm2026-08'), { from: '2026-08-28', to: '2026-08-31' }, 'the oldest month starts where the 90-day window starts (the 91st day is not counted)');
assert.equal(P.range(data, 'm2025-01'), null, 'a month with no days');
assert.equal(P.range(data, 'nonsense'), null);
assert.equal(P.range(null, '7'), null);
assert.deepEqual(P.months(data), ['2026-11', '2026-10', '2026-09', '2026-08'], 'newest first; the 91st day (08-27) adds nothing new');
assert.equal(P.monthLabel('2026-11'), 'نوفمبر 2026');

// the headline numbers: the sum of the days; the margin = the profit over the items' sales after the tickets' discounts, as each day computes it
const t7 = P.totals(data, '7');
assert.equal(t7.days, 7);
assert.equal(t7.profit, 400 + 6 * 190);
assert.equal(t7.sales, 2000 + 6 * 1000);
assert.equal(t7.rev, 1800 + 6 * 900);
assert.equal(t7.cost, 1390 + 6 * 700);
assert.equal(t7.free.lines, 14);
assert.equal(t7.free.cost, 350);
assert.equal(t7.fb, 7);
assert.equal(t7.margin, Math.round(((400 + 1140) / (1800 + 5400 - 70)) * 1000) / 10);
assert.equal(P.totals(data, '90').days, 90, 'ninety days, not the 91 the file holds');
assert.equal(P.totals(data, 'm2026-08').days, 4);
assert.equal(P.totals(data, 'm2025-01'), null);
const few = D.parse({ today: '2026-11-25', days: { '2026-11-25': mk('2026-11-25', {}), '2026-11-24': mk('2026-11-24', {}) } });
assert.equal(P.totals(few, '30').days, 2, 'a period longer than the data = the days that exist');
assert.equal(P.totals(D.parse({ today: '2026-11-25', days: { '2026-11-25': mk('2026-11-25', { items_revenue: 0, discounts: 0 }) } }), '7').margin, null, 'no sales = no margin, never NaN');

// the bars: one per day, oldest first, a day with no data is 0 and flagged
const ch = P.chart(few, '7');
assert.equal(ch.length, 7);
assert.deepEqual(ch.map((x) => x.date), ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25']);
assert.deepEqual(ch.map((x) => x.has), [false, false, false, false, false, true, true]);
assert.deepEqual(ch.map((x) => x.v), [0, 0, 0, 0, 0, 190, 190]);
assert.equal(ch[6].ch, 'ر');
assert.equal(ch[6].day, 25);
assert.equal(P.chart(data, '90').length, 90);
assert.deepEqual(P.chart(data, 'zzz'), []);
assert.equal(P.barPct([{ v: 100 }, { v: 50 }, { v: 0 }, { v: -20 }], 100), 100);
assert.equal(P.barPct([{ v: 100 }, { v: 50 }, { v: 0 }, { v: -20 }], 50), 50);
assert.equal(P.barPct([{ v: 100 }, { v: 50 }, { v: 0 }, { v: -20 }], 0), 3, 'a day with no profit is a thin line');
assert.equal(P.barPct([{ v: 100 }], -20), 3, 'a loss is drawn flat too');

// the period file the laptop writes
assert.equal(P.parse(null), null);
assert.equal(P.parse({}), null);
assert.equal(P.parse({ items: 'x' }), null);
const it = (i, n, q, rev, cost, margin, o) => ({ i, n, q, rev, cost, profit: rev - cost, margin, cf: 0, ls: [{ d: '2026-11-25', tk: 10 + i, q: 1, pr: rev / q, c: cost / q }], ...o });
const pf = P.parse({ v: 1, key: '7', from: '2026-11-19', to: '2026-11-25', days: 7,
  items: [it(1, 'ITEM A 10MG', 10, 1000, 700, 30), it(2, 'ITEM B SYRUP', 5, 500, 450, 10), null, { i: 3 }],
  low: [it(4, 'ITEM D', 4, 400, 396, 1), it(2, 'ITEM B SYRUP', 5, 500, 450, 10), it(5, 'ITEM E', 2, 100, 112, -12, { cf: 1 }), it(6, 'ITEM F', 1, 60, 55, null)],
  below: { n: 3, loss: 30, lines: [{ d: '2026-11-25', tk: 7, t: '14:20', n: 'ITEM C', q: 2, pr: 95, c: 99 }, { d: '2026-11-24', tk: 5, t: '09:05', n: 'ITEM G', q: 1, pr: 10, c: 12.5 }, { tk: null }] },
  free: { lines: 4, cost: 250, items: [{ i: 9, n: 'ITEM H', q: 3, cost: 200, tickets: 2, ls: [{ d: '2026-11-25', tk: 30, q: 3, pr: 0, c: 66.67 }] }, { i: 8, n: 'ITEM I', q: 1, cost: 50, tickets: 1, ls: [] }] } });
assert.equal(pf.items.length, 2, 'a null and a row with no name are dropped');
assert.deepEqual(pf.items[0], { i: 1, n: 'ITEM A 10MG', q: 10, rev: 1000, cost: 700, profit: 300, margin: 30, cf: false, ls: [{ d: '2026-11-25', tk: 11, q: 1, pr: 100, c: 70, t: '', n: '' }] });
assert.equal(pf.low[2].cf, true);
assert.equal(pf.below.lines.length, 2, 'a line with no ticket is dropped');
assert.equal(pf.below.n, 3);
assert.equal(pf.free.items[0].ls[0].c, 66.67);
assert.equal(P.parse({ items: [{ n: 'X', q: 'abc', rev: 'zz' }] }).items[0].q, 0, 'a bad number is 0, never NaN');
assert.deepEqual(P.parse({ items: [] }).below, { n: 0, loss: 0, lines: [] });

// the thin margins: under his line, thinnest first; a margin the laptop could not compute is left out
assert.deepEqual(P.lowList(pf, 10).map((e) => e.n), ['ITEM E', 'ITEM D'], 'under 10٪ (exactly 10 is not under it), the loss first');
assert.deepEqual(P.lowList(pf, 11).map((e) => e.n), ['ITEM E', 'ITEM D', 'ITEM B SYRUP']);
assert.deepEqual(P.lowList(pf, 0).map((e) => e.n), ['ITEM E'], 'a loss is under any line');
assert.deepEqual(P.lowList(null, 10), []);
assert.equal(P.unitCost(pf.items[0]), 70, 'the cost per pack');
assert.equal(P.unitCost({ q: 0, cost: 5 }), 0);
assert.equal(P.lineProfit({ pr: 100, c: 70, q: 2 }), 60);
assert.equal(P.lineProfit({ pr: 50, c: 70, q: -1 }), 20, 'a return gives the profit back');
assert.equal(P.loss({ pr: 95, c: 99, q: 2 }), 8);

// the searches: an item's name (any case, Arabic marks ignored); a below-cost line by name, ticket, date or time
assert.deepEqual(P.searchItems(pf.low, 'item d').map((e) => e.n), ['ITEM D']);
assert.deepEqual(P.searchItems(pf.low, 'syrup b').map((e) => e.n), ['ITEM B SYRUP'], 'every word must match, in any order');
assert.deepEqual(P.searchItems(pf.low, '').length, 4);
assert.deepEqual(P.searchItems(pf.low, 'zzz'), []);
assert.deepEqual(P.searchBelow(pf.below.lines, 'item g').map((l) => l.tk), [5]);
assert.deepEqual(P.searchBelow(pf.below.lines, '7').map((l) => l.tk), [7], 'the ticket number');
assert.deepEqual(P.searchBelow(pf.below.lines, '2026-11-24').map((l) => l.tk), [5], 'the date');
assert.deepEqual(P.searchBelow(pf.below.lines, '2:20').map((l) => l.tk), [7], 'the time of day');

// the English: every fixed word, and the lines made of words + numbers
for (const s of P.WORDS) assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, 'Arabic left in English: ' + s + ' → ' + I.translate(s));
for (const s of ['الفترة من الأربعاء 19 نوفمبر إلى الأربعاء 25 نوفمبر', '7 يوم', '3 سطر اتحسب بتكلفة الكارت (مفيش شرا قبله)', 'تحت التكلفة 3', 'بيع بصفر سعر 28 · تكلفتها 1,745', '10 علبة · هامش 30%', 'تكلفة آخر شرا 70', 'تذكرة 5 · 2 × 95',
  '3 سطر · ظاهر أحدث 300 بيعة بس', 'خسارة 30', 'تكلفتها 250', 'نوفمبر 2026', 'الأصناف دي في الفترة · الربح قبل خصم التذكرة', 'الهامش أقل من']) {
  assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, 'Arabic left in English: ' + s + ' → ' + I.translate(s));
}
console.log('PASS: profit: the periods, the headline numbers, the bars, the period file, the thin margins, the searches, the English');
