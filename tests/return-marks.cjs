// «↩️ إرجاع» (ar/return-marks.js, owner 2026-11-19): the pure part. The boxes text, the open marks grouped by supplier, and the statement the staff prepare from.
const assert = require('node:assert/strict');
global.window = global;
require('../ar/short-dated.js'); // the invoice number and the day text come from there
const R = require('../ar/return-marks.js');

assert.deepEqual(R.OPEN, ['marked', 'prepared']);
assert.equal(R.keyOf(7, 103, '2027-02-28'), '7:103:2027-02-28');
assert.equal(R.keyOf(7, 103, null), '7:103:');
assert.equal(R.boxesText(12, 12), '1 علبة');
assert.equal(R.boxesText(30, 12), '2.5 علبة');
assert.equal(R.boxesText(5, 12), '5 وحدة', 'less than a box of a many-unit pack is in units');
assert.equal(R.boxesText(3, 1), '3 علبة');
assert.equal(R.boxesText(0.5, 1), '0.5 علبة', 'a pack of one unit is never counted in units');

const M = (id, vendor, vname, item, name, ar, x, units, k, code, at, status, extra = {}) => ({ id, vendor_id: vendor, vendor_name: vname, item_id: item, item_name: name, item_ar: ar, expiry: x, units, k, code, invoiced_at: at, status, ...extra });
const rows = [
  M(1, 5, 'ELFT', 101, 'PANADOL EXTRA 24 TAB', null, '2027-06-30', 10, 1, '11/26/474411', '2026-11-18T16:43:00', 'marked'),
  M(2, 5, 'ELFT', 103, 'FLAGYL 125MG SYRUP', 'فلاجيل ١٢٥ شراب', '2027-02-28', 1, 1, '11/26/474411', '2026-11-18T16:43:00', 'prepared', { prepared_by: 'أحمد' }),
  M(3, 6, 'AMG', 104, 'OLDER ONE', null, null, 30, 12, '10/26/2026115794560', '2026-10-29T16:59:00', 'marked'),
  M(4, 6, 'AMG', 105, 'GONE', null, '2027-01-31', 1, 1, '11/26/9', '2026-11-18T10:00:00', 'returned'),
  M(5, 7, null, 106, 'NO NAME SUPPLIER', null, '2027-03-31', 2, 1, '11/26/5', '2026-11-18T10:00:00', 'cancelled'),
  M(6, 8, null, 107, 'ONLY OPEN', null, '2027-03-31', 2, 1, '11/26/6', '2026-11-18T10:00:00', 'marked'),
];
const g = R.groupByVendor(rows);
assert.deepEqual(g.map((x) => [x.vendor_id, x.vendor_name, x.rows.map((r) => r.id)]), [[8, '#8', [6]], [6, 'AMG', [3]], [5, 'ELFT', [2, 1]]], 'open marks only (not returned / cancelled); suppliers by name; a supplier with no name shows its number; shortest expiry first');
assert.deepEqual(R.groupByVendor(null), []);
assert.deepEqual(R.groupByVendor([rows[3], rows[4]]), []);
// a line with no expiry goes last
assert.deepEqual(R.groupByVendor([rows[2], M(9, 6, 'AMG', 108, 'ZZ', null, '2028-01-31', 1, 1, 'c', '2026-11-18T10:00:00', 'marked')])[0].rows.map((r) => r.id), [9, 3]);

const s = R.statementText(g[2]);
assert.equal(s, [
  'مرتجعات للمورد ELFT:',
  '1) FLAGYL 125MG SYRUP (فلاجيل ١٢٥ شراب) | 1 علبة | صلاحية 02/2027 | فاتورة 474411 (اتدخلت 18/11/2026)',
  '2) PANADOL EXTRA 24 TAB | 10 علبة | صلاحية 06/2027 | فاتورة 474411 (اتدخلت 18/11/2026)',
  'الإجمالي: 2 صنف',
].join('\n'));
assert.match(R.statementText(g[1]), /^مرتجعات للمورد AMG:\n1\) OLDER ONE \| 2\.5 علبة \| صلاحية من غير صلاحية \| فاتورة 2026115794560 \(اتدخلت 29\/10\/2026\)\nالإجمالي: 1 صنف$/);
assert.equal(R.statementAll(g).split('\n\n').length, 3, 'one statement per supplier, a blank line between');
assert.equal(R.statementAll([]), '');
console.log('return-marks: ok');
