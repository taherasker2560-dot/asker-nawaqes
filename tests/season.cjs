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
// the quantity to order: what the season still needs on top of the stock, rounded up, at least 1
assert.equal(S.needQty(d.items[0]), 14, '22.5 expected - 9 in stock = 13.5 -> 14');
assert.equal(S.needQty({ ex: 5, have: 4.9 }), 1, 'at least one pack');
assert.equal(S.needQty({ ex: 10, have: 0 }), 10, 'an exact number is not rounded up to the next one');
assert.equal(S.needQty({ ex: 4, have: 9 }), 1, 'more in stock than expected: still one');
// the quantity he types: positive, two decimals, a comma counts as a point, anything else = nothing is written
assert.equal(S.cleanQty('14'), 14);
assert.equal(S.cleanQty('2,5'), 2.5);
assert.equal(S.cleanQty('0.333'), 0.33);
assert.equal(S.cleanQty(''), null);
assert.equal(S.cleanQty('0'), null);
assert.equal(S.cleanQty('-3'), null);
assert.equal(S.cleanQty('abc'), null);
assert.equal(S.cleanQty('100001'), null);
// the row it writes: the shape the bags page writes («🛒 أمر شراء»), the bag only when it is a real one
assert.deepEqual(S.poRow(d.items[0], 14, '2434'), {
  item_id: 1001, item_name: 'ALL-VENT 125ML SYP', bag: '2434', qty: 14, status: 'open',
  item: { have: 9, sold30: 4.5, need: 14, season: { ex: 22.5, y1: 24, y2: 21, avg: 4.5 } },
});
// the bag from the bags page's data
const BAGS = { bags: { list: [{ id: '2434', items: [{ id: 1003 }, { id: '1004' }] }, { id: 'pv', items: [{ id: 1005 }, null] }] } };
assert.equal(S.bagIn(BAGS, 1003), '2434');
assert.equal(S.bagIn(BAGS, 1004), '2434', 'an id that came as text');
assert.equal(S.bagIn(BAGS, 1005), 'pv');
assert.equal(S.bagIn(BAGS, 9999), null, 'in no bag');
assert.equal(S.bagIn(null, 1003), null, 'the data is not there yet');
assert.equal(S.bagIn({ bags: {} }, 1003), null);
assert.equal(S.poRow(d.items[0], 14, null).bag, null);
assert.equal(S.poRow(d.items[0], 14, 'x; drop table').bag, null, 'a bag that is not pv / gs / digits is not written');
assert.equal(S.poRow(d.items[0], 14, 'pv').bag, 'pv');
assert.equal(S.poRow({ ...d.items[0], n: 'N'.repeat(300) }, 1, null).item_name.length, 200);
console.log('PASS: season: the file, numbers in words, the strong ones, the purchase-order row');
