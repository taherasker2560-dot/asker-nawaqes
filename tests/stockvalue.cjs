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
assert.deepEqual(law.others, [{ id: 2, name: 'مخزن هالك مثال', value: 40, items: 20 }]);
assert.equal(law.waiting.value, 29.61, 'the waiting stores together');
assert.deepEqual(law.waiting.list.map((s) => s.id), [5, 6]);
assert.deepEqual([law.noBuy, law.noCost, law.avgZero], [3, 2, 0], 'the gaps of the main store only');
const avg = S.view(data.days[0], 'avg');
assert.equal(avg.main.value, 970.5);
assert.equal(avg.main.sale, 1500.5, 'the public price is the same on both bases');
assert.equal(avg.waiting.value, 28.32);
assert.deepEqual([avg.noBuy, avg.noCost, avg.avgZero], [0, 0, 4], 'each basis says only its own gaps');
assert.equal(S.view(null, 'law'), null);
assert.equal(S.view({ date: 'x', at: '', stores: [{ id: 2, name: 'a', law: 1 }] }, 'law').main, null);

assert.deepEqual(S.history(data, 'law').map((h) => [h.date, h.value, h.diff]), [['2026-11-26', 1000.5, 20.5], ['2026-11-25', 980, 80], ['2026-11-24', 900, null]]);
assert.deepEqual(S.history(data, 'avg').map((h) => h.value), [970.5, 950, 870]);
assert.equal(S.history(data, 'law', 2).length, 2);
assert.equal(S.history(data, 'law', 2)[1].diff, 80, 'the change is against the day before it in the file, even when it is not listed');
assert.deepEqual(S.history(null, 'law'), []);
assert.deepEqual(S.BASES.map((b) => b[0]), ['law', 'avg']);

// the English: every fixed word, and the lines made of words + numbers
for (const s of S.WORDS) assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, 'Arabic left in English: ' + s + ' → ' + I.translate(s));
for (const s of ['حسب بيانات فارما فلاي لحد', 'بسعر الجمهور', 'منهم من غير تكلفة خالص (اتحسبوا صفر)']) assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, s);
console.log('PASS: stock value: the file, each basis with the waiting stores together, the main store day by day, the English');
