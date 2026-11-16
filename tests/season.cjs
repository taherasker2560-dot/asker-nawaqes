// «قبل الموسم» (ar/season.js, owner 2026-11-16, idea 6): the pure part. The laptop's file, the numbers in words, the strong ones.
const assert = require('node:assert/strict');
global.window = global;
const S = require('../ar/season.js');

const FILE = {
  generated_at: '2026-11-16T01:00:00Z', data_at: '2026-11-16T00:00:58', from: '2026-11-16', to: '2026-12-16', days: 30,
  items: [
    { i: 1001, n: 'ALL-VENT 125ML SYP', ex: 22.5, y1: 24, y2: 21, avg: 4.5, have: 9, strong: true },
    { i: 1002, n: 'TADALONG 20MG 4 TAB', ex: 21, y1: 39, y2: 3, avg: 6, have: 3, strong: false },
    { i: 1003, n: 'NO NORMAL MONTH', ex: 5, y1: 5, y2: 0, avg: 0, have: 0, strong: false },
    { n: 'no id' }, null, { i: 9, n: '' },
  ],
};
const d = S.parse(FILE);
assert.equal(d.items.length, 3, 'a row with no id or no name is dropped');
assert.deepEqual([d.from, d.to, d.days], ['2026-11-16', '2026-12-16', 30]);
assert.deepEqual(d.items[0], { i: 1001, n: 'ALL-VENT 125ML SYP', ex: 22.5, y1: 24, y2: 21, avg: 4.5, have: 9, strong: true });
assert.equal(S.parse(null), null);
assert.equal(S.parse({}), null);
assert.equal(S.parse({ items: 'x' }), null, 'anything that is not the laptop\'s file is no data');
assert.deepEqual(S.parse({ items: [] }).items, []);
// numbers as text: one decimal at most, no trailing .0
assert.equal(S.fmt(26), '26');
assert.equal(S.fmt(11.5), '11.5');
assert.equal(S.fmt(11.54), '11.5');
assert.equal(S.fmt(4.04), '4');
assert.equal(S.fmt('x'), '0');
// the day and month
assert.equal(S.dm('2026-11-16'), '16/11');
assert.equal(S.dm(''), '');
assert.equal(S.dm('junk'), '');
// how many times its normal month; none without a normal month
assert.equal(S.times(d.items[0]), 5, '22.5 / 4.5');
assert.equal(S.times(d.items[2]), 0);
// the home counts the ones that repeated in both years
assert.equal(S.strongCount(d), 1);
assert.equal(S.strongCount(null), 0);
console.log('PASS: season: the file, numbers in words, the strong ones');
