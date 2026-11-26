// «📦 قيمة المخزون» (owner 2026-11-26): the pure helpers of ar/stockvalue.js (the laptop's day/stock.json, one day on each basis with the waiting stores together, the main store day by day) and the
// English of every fixed word and composite line. Made-up numbers only: the repository is public.
const assert = require('node:assert/strict');
require('../ar/day.js');
const S = require('../ar/stockvalue.js');
global.window = global; require('../ar/i18n-en.js'); require('../ar/i18n.js'); const I = global.AskerI18n; I._use(global.AskerEN);

const st = (id, name, law, avg, sale, o) => ({ id, name, items: 10 * id, law, avg, sale, no_buy: 0, no_cost: 0, avg_zero: 0, ...o });
const day = (law) => ({ at: '2026-11-26 22:25', stores: [st(1, 'Main - مثال', law, law - 30, law + 500, { no_buy: 3, no_cost: 2, avg_zero: 4 }), st(2, 'مخزن هالك مثال', 40, 39, 52, { no_buy: 1 }),
  st(5, 'مخزن انتظار أ', 2.31, 2.32, 3), st(6, 'مخزن انتظار ب', 27.3, 26, 33)] });
const file = { v: 1, latest: '2026-11-26', days: { '2026-11-24': day(900), '2026-11-26': day(1000.5), '2026-11-25': day(980), 'junk': {}, '2026-11-23': { at: '', stores: [] } } };

const data = S.parse(file);
assert.deepEqual(data.days.map((d) => d.date), ['2026-11-26', '2026-11-25', '2026-11-24'], 'newest first; a bad key and an empty day are dropped');
assert.equal(S.parse(null), null);
assert.equal(S.parse({}), null);
assert.equal(S.parse({ days: {} }), null);
assert.equal(S.parse({ days: { '2026-11-26': { stores: [{ id: 1, law: 'x' }] } } }).days[0].stores[0].law, 0, 'a bad number is 0, never NaN');

const law = S.view(data.days[0], 'law');
assert.deepEqual(law.main, { value: 1000.5, sale: 1500.5, items: 10 });
assert.deepEqual(law.others, [{ id: 2, name: 'مخزن هالك مثال', value: 40, sale: 52, items: 20 }]);
assert.deepEqual(law.total, { value: 1070.11, sale: 1588.5 }, 'every store, at cost and at the public price');
assert.equal(law.waiting.sale, 36);
assert.equal(law.waiting.value, 29.61, 'the waiting stores together');
assert.deepEqual(law.waiting.list.map((s) => s.id), [5, 6]);
assert.deepEqual([law.noBuy, law.noCost, law.avgZero], [3, 2, 0], 'the gaps of the main store only');
const avg = S.view(data.days[0], 'avg');
assert.equal(avg.main.value, 970.5);
assert.equal(avg.main.sale, 1500.5, 'the public price is the same on both bases');
assert.equal(avg.waiting.value, 28.32);
assert.deepEqual(avg.total, { value: 1037.82, sale: 1588.5 });
assert.deepEqual([avg.noBuy, avg.noCost, avg.avgZero], [0, 0, 4], 'each basis says only its own gaps');
assert.equal(S.view(null, 'law'), null);
assert.equal(S.view({ date: 'x', at: '', stores: [{ id: 2, name: 'a', law: 1 }] }, 'law').main, null);

assert.deepEqual(S.history(data, 'law').map((h) => [h.date, h.value, h.diff]), [['2026-11-26', 1000.5, 20.5], ['2026-11-25', 980, 80], ['2026-11-24', 900, null]]);
assert.deepEqual(S.history(data, 'avg').map((h) => h.value), [970.5, 950, 870]);
assert.deepEqual(S.history(data, 'law').map((h) => h.sale), [1500.5, 1480, 1400], 'the public price beside each day');
assert.equal(S.history(data, 'law', 2).length, 2);
assert.equal(S.history(data, 'law', 2)[1].diff, 80, 'the change is against the day before it in the file, even when it is not listed');
assert.deepEqual(S.history(null, 'law'), []);
// only the days that are over are in the record: the day still running is the figure on top, not a line of the history (the change of the other days is unmoved)
assert.deepEqual(S.history(data, 'law', 31, '2026-11-26').map((h) => [h.date, h.diff]), [['2026-11-25', 80], ['2026-11-24', null]]);
assert.deepEqual(S.history(data, 'law', 31, '2026-11-27').map((h) => h.date), ['2026-11-26', '2026-11-25', '2026-11-24'], 'the day after, it is part of the record');
assert.equal(S.history(data, 'law')[0].at, '2026-11-26 22:25', 'each line keeps the moment it is good up to');
assert.equal(S.runningDay(new Date(2026, 10, 27, 0, 30)), '2026-11-26', 'after midnight it is still the pharmacy day before');
assert.equal(S.runningDay(new Date(2026, 10, 27, 5, 59)), '2026-11-26');
assert.equal(S.runningDay(new Date(2026, 10, 27, 9, 0)), '2026-11-27');
assert.deepEqual(S.BASES.map((b) => b[0]), ['law', 'avg']);

// «💼 فلوسك في الصيدلية»: goods (every store but the waste one) + the boxes he counts + the customers' net - the suppliers' net
const withMoney = (law, bal) => ({ ...day(law), money: { at: '2026-11-26 22:25', boxes: [{ id: 2, name: 'خزنة مثال', bal }, { id: 9, name: 'استثمار مثال', bal: 60 }, { id: 7, name: 'فاضية', bal: 0 }],
  cust: { owe: 300.5, owe_n: 3, prepaid: 20.25, prepaid_n: 1, idle90: 55, idle90_n: 1 }, vend: { owe: 480, owe_n: 4, owed: 6, owed_n: 1 } } });
const mf = S.parse({ days: { '2026-11-26': withMoney(1000.5, 291), '2026-11-25': withMoney(980, 250), '2026-11-24': day(900) } });
assert.equal(mf.days[2].money, null, 'a day from before the money was kept has none, never zeros');
assert.equal(S.parse({ days: { '2026-11-26': { ...day(1), money: { boxes: 'x' } } } }).days[0].money, null, 'a half-written money part is none');
const w = S.worth(mf.days[0], 'law');
// goods: 1000.5 + 2.31 + 27.3 (the waste store's 40 stays out)
assert.equal(w.goods, 1030.11);
assert.deepEqual([w.cash, w.cust, w.vend, w.net], [351, 280.25, 474, 1187.36]);
assert.deepEqual(w.waste, [{ name: 'مخزن هالك مثال', value: 40 }]);
assert.equal(w.idle90, 55);
assert.deepEqual(w.left, []);
const noInv = S.worth(mf.days[0], 'law', new Set([9, 7]));
assert.deepEqual([noInv.cash, noInv.net], [291, 1127.36], 'a box taken out leaves the net');
assert.deepEqual(noInv.left.map((b) => b.id), [9], 'an empty box taken out is not listed apart');
assert.equal(S.worth(mf.days[0], 'avg').goods, 998.82, 'the goods follow the basis chosen');
assert.equal(S.worth(mf.days[2], 'law'), null);
const facts = S.dayFacts({ days: [{ date: '2026-11-25', profit: 190, ownerOut: 100, expenses: [{ name: 'كهربا', amount: 40 }, { name: 'مصروف', amount: 10 }] }] });
assert.deepEqual(facts, { '2026-11-25': { profit: 140, owner: 100 } }, "the day's profit after its expenses, the withdrawals apart");
const wh = S.worthHistory(mf, 'law', new Set([9]), 31, '2026-11-26', facts);
assert.deepEqual(wh.map((h) => [h.date, h.net, h.diff, h.profit, h.owner]), [['2026-11-25', 1065.86, null, 140, 100]], 'the running day is not a line; the box taken out leaves the past days too');
assert.equal(S.worthHistory(mf, 'law', null, 31, '2026-11-27', {})[0].diff, 61.5, 'the change against the day before');

// the English: every fixed word, and the lines made of words + numbers
for (const s of S.WORDS) assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, 'Arabic left in English: ' + s + ' → ' + I.translate(s));
for (const s of ['حسب بيانات فارما فلاي لحد', 'بسعر الجمهور', 'منهم من غير تكلفة خالص (اتحسبوا صفر)']) assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, s);
console.log('PASS: stock value: the file, each basis with the waiting stores together, the main store day by day, the English');
