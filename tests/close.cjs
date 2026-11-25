// «🔒 تقفيل اليوم» (owner 2026-11-26): the pure helpers of ar/close.js (the laptop's closes → the shifts, the day's and the 30 days' totals, the word of a difference, the day the page opens on) and the
// English for every fixed word and the composite lines. Made-up numbers only: the repository is public.
const assert = require('node:assert/strict');
const D = require('../ar/day.js');
const C = require('../ar/close.js');
global.window = global; require('../ar/i18n-en.js'); require('../ar/i18n.js'); const I = global.AskerI18n; I._use(global.AskerEN);

// the day file passes the closes through untouched (day.js), and a file without them is still a file
const mk = (date) => ({ date, net_sales: 1, profit: 0 });
assert.deepEqual(D.parse({ days: { '2026-11-25': mk('2026-11-25') }, closes: { '2026-11-25': [] } }).closes, { '2026-11-25': [] });
assert.deepEqual(D.parse({ days: { '2026-11-25': mk('2026-11-25') } }).closes, {});

const raw = {
  '2026-11-25': [{ s: '2026-11-24 23:56', e: '2026-11-25 15:43', exp: 2484, cnt: 2485 }, { s: '2026-11-25 16:42', e: '2026-11-25 23:42', exp: 27552.89, cnt: 27420 }, { s: '2026-11-25 23:42', e: '2026-11-26 00:40', exp: 435, cnt: 435 }, { cnt: 5 }, null],
  '2026-11-24': [{ s: 'x', e: '2026-11-24 17:35', exp: 340, cnt: 440 }, { s: 'x', e: '2026-11-24 22:00', exp: 100, cnt: 100 }],
  '2026-10-27': [{ s: 'x', e: '2026-10-27 16:49', exp: 7483.94, cnt: 7390 }],
  '2026-10-20': [{ s: 'x', e: '2026-10-20 16:49', exp: 10, cnt: 90 }],
  'not-a-day': [{ e: '2026-11-25 10:00' }], '2026-11-01': 'x', '2026-11-02': [],
};
const c = C.parse(raw);
assert.deepEqual(Object.keys(c).sort(), ['2026-10-20', '2026-10-27', '2026-11-24', '2026-11-25'], 'a bad key, a bad list and an empty day are dropped');
assert.equal(c['2026-11-25'].length, 3, 'a shift with no end and a null are dropped');
assert.deepEqual(C.parse(null), {});
assert.deepEqual(C.days(c), ['2026-11-25', '2026-11-24', '2026-10-27', '2026-10-20'], 'newest first');

// a shift's difference and the sums
assert.equal(C.diffOf(c['2026-11-25'][1]), -132.89);
assert.equal(C.diffOf(c['2026-11-25'][0]), 1);
const t = C.sum(c['2026-11-25']);
assert.deepEqual(t, { n: 3, exp: 30471.89, cnt: 30340, diff: -131.89, short: 132.89, over: 1 });
assert.deepEqual(C.sum([]), { n: 0, exp: 0, cnt: 0, diff: 0, short: 0, over: 0 });
assert.deepEqual(C.word(-131.89), { k: 'short', t: 'عجز', v: 131.89 });
assert.deepEqual(C.word(0.5), { k: 'over', t: 'زيادة', v: 0.5 });
assert.deepEqual(C.word(0.001), { k: 'ok', t: 'مظبوط', v: 0 });

// the 30 days up to a day: the totals and the shifts whose difference reaches his line, newest first
const m = C.month(c, '2026-11-25', 50);
assert.equal(m.from, '2026-10-27');
assert.equal(m.totals.n, 6, 'the 20 October close is older than thirty days');
assert.deepEqual(m.big.map((x) => [x.day, C.diffOf(x)]), [['2026-11-25', -132.89], ['2026-11-24', 100], ['2026-10-27', -93.94]]);
assert.deepEqual(C.month(c, '2026-11-25', 100).big.map((x) => C.diffOf(x)), [-132.89, 100], 'exactly the line counts');
assert.equal(m.totals.short, 226.83);
assert.equal(m.totals.over, 101);

// the day the page opens on, and the clock
assert.equal(C.pickDay(c, '2026-11-25'), '2026-11-25');
assert.equal(C.pickDay(c, '2026-11-26'), '2026-11-25', 'no close yet today: the newest day that has one');
assert.equal(C.pickDay({}, '2026-11-26'), '2026-11-26');
assert.equal(C.clockOf('2026-11-25 23:42'), '11:42 م');
assert.equal(C.clockOf('2026-11-26 00:40'), '12:40 ص');

// the English: every fixed word, and the lines made of words + numbers
for (const s of C.WORDS) assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, 'Arabic left in English: ' + s + ' → ' + I.translate(s));
for (const s of ['المفروض 30,471.89', 'واتعدّ 30,340', 'عجز 132.89', 'زيادة 1', 'الخميس 25 نوفمبر · 11:42 م', 'تصحيح تسليم الدرج']) assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, 'Arabic left in English: ' + s + ' → ' + I.translate(s));
console.log('PASS: close: the shifts, the totals, the thirty days, the English');
