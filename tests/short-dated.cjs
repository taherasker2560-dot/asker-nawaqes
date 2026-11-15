// «الصلاحيات ← اتقبلت قصيرة» (ar/short-dated.js, owner 2026-11-15): the pure part. The months to an expiry, the period's start, and
// the lines of the purchase invoices that are still with us (not returned) with an expiry under 18 months, shortest first.
const assert = require('node:assert/strict');
global.window = global;
const S = require('../ar/short-dated.js');

const now = new Date(2026, 10, 15, 14, 0, 0); // 15 Nov 2026
assert.equal(S.LIMIT_MONTHS, 18);
// months: an expiry is the end of its month
assert.equal(S.monthsLeft('2027-11-30', now), 12);
assert.equal(S.monthsLeft('2028-04-30', now), 17);
assert.equal(S.monthsLeft('2028-05-31', now), 18, '18 months is NOT «less than 18»');
assert.equal(S.monthsLeft('2026-11-30', now), 0);
assert.equal(S.monthsLeft('2026-10-31', now), -1);
assert.equal(S.monthsLeft(null, now), null);
assert.equal(S.monthsLeft('garbage', now), null);
// the period's start
assert.equal(S.sinceOf('today', now), '2026-11-15T00:00:00');
assert.equal(S.sinceOf('3', now), '2026-11-13T00:00:00');
assert.equal(S.sinceOf('7', now), '2026-11-09T00:00:00');
assert.equal(S.sinceOf('30', now), '2026-10-17T00:00:00');
assert.equal(S.sinceOf('nonsense', now), '2026-11-13T00:00:00', 'an unknown key = the default (3 days)');

const L = (i, p, k, x, extra = {}) => ({ i, p, u: 0, k, b: 0, c: 100, t: 20, x, ...extra });
const purchases = [
  { id: 1, vendor_id: 5, at: '2026-11-14T10:00:00', code: '11/26/1', lines: [L(101, 10, 1, '2027-06-30', { b: 1 }), L(102, 5, 1, '2029-01-31'), L(103, 2, 24, '2028-03-31')] },
  { id: 2, vendor_id: 6, at: '2026-11-15T09:00:00', code: '11/26/9', lines: [L(101, 4, 1, '2027-06-30')] },
  { id: 3, vendor_id: 5, at: '2026-11-15T10:00:00', code: '11/26/2', lines: [L(104, 5, 1, '2027-02-28'), L(104, 5, 1, '2027-08-31'), { i: 0 }, null].filter(Boolean) },
  { id: 4, vendor_id: 5, at: '2026-11-15T10:30:00', code: null, lines: null },
];
// no returns: only the short ones, shortest expiry first; the long one (102, 26 months) is not listed
let r = S.shortLines(purchases, [], now);
assert.deepEqual(r.map((q) => [q.item, q.x, q.vendor_id]), [[104, '2027-02-28', 5], [101, '2027-06-30', 6], [101, '2027-06-30', 5], [104, '2027-08-31', 5], [103, '2028-03-31', 5]]);
assert.equal(r.find((q) => q.item === 101 && q.vendor_id === 5).left, 11, '10 packs + 1 bonus pack are with us');
assert.deepEqual(r.find((q) => q.item === 103).units, 48);
assert.equal(r.find((q) => q.item === 104 && q.x === '2027-02-28').months, 3);

// returns: from the same supplier, for the same item, entered after the purchase
const returns = [
  { id: 10, vendor_id: 5, at: '2026-11-15T11:00:00', lines: [L(101, -3, 1, '2027-06-30')] },        // 3 of 11 go back (minus signs are fine)
  { id: 11, vendor_id: 6, at: '2026-11-15T12:00:00', lines: [L(101, 4, 1, '2027-06-30')] },         // all 4 of the other supplier's go back
  { id: 12, vendor_id: 7, at: '2026-11-15T12:30:00', lines: [L(103, 2, 24, '2028-03-31')] },        // another supplier: nothing to take from
  { id: 13, vendor_id: 5, at: '2026-11-10T09:00:00', lines: [L(103, 1, 24, '2028-03-31')] },        // BEFORE the purchase: not this one
  { id: 14, vendor_id: 5, at: '2026-11-15T13:00:00', lines: [L(104, 5, 1, '2027-08-31')] },         // the same expiry goes first
];
r = S.shortLines(purchases, returns, now);
assert.deepEqual(r.map((q) => [q.item, q.x, q.vendor_id, q.left]), [[104, '2027-02-28', 5, 5], [101, '2027-06-30', 5, 8], [103, '2028-03-31', 5, 48]]);
assert.equal(S.leftText(r[1]), '8 علبة');
assert.equal(S.leftText(r[2]), '2 علبة');
// a half pack returned: what is left is in packs with a fraction
r = S.shortLines(purchases, [{ id: 15, vendor_id: 5, at: '2026-11-15T15:00:00', lines: [{ i: 103, p: 0, u: 12, k: 24, b: 0, x: '2028-03-31' }] }], now);
const q103 = r.find((q) => q.item === 103);
assert.equal(q103.left, 36);
assert.equal(S.leftText(q103), '1.5 علبة');
// a return with another expiry text still takes from the supplier's oldest line of that item
r = S.shortLines(purchases, [{ id: 16, vendor_id: 5, at: '2026-11-15T16:00:00', lines: [L(104, 5, 1, null)] }], now);
assert.deepEqual(r.filter((q) => q.item === 104).map((q) => q.x), ['2027-08-31'], 'the oldest purchase line (the 02/2027 one) went back');
// nothing at all
assert.deepEqual(S.shortLines(null, null, now), []);
assert.deepEqual(S.shortLines([], [], now), []);
// the words
assert.equal(S.expText('2027-06-30'), '06/2027');
assert.equal(S.monthsText(-1), 'منتهية');
assert.equal(S.monthsText(0), 'الشهر ده');
assert.equal(S.monthsText(1), 'باقي شهر');
assert.equal(S.monthsText(2), 'باقي شهرين');
assert.equal(S.monthsText(7), 'باقي 7 شهور');
assert.equal(S.monthsText(14), 'باقي 14 شهر');
assert.equal(S.dayText('2026-11-14T10:00:00'), '14/11');
console.log('short-dated: ok');
