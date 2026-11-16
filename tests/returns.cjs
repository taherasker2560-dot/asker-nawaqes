// «↩️ المرتجعات» (ar/returns.js, owner 2026-11-16): the pure part. The laptop's file, who is shown, the totals, and the statement he copies for a company.
// Made-up companies and items only (the repo is public).
const assert = require('node:assert/strict');
global.window = global;
const R = require('../ar/returns.js');

const ret = (o) => ({ id: 1, at: '2026-11-15T16:54:08', no: '5001', code: '~11/26/5001', amount: 100, status: 'pending', notice: null, items: [{ n: 'TEST DRUG 10TAB', ar: '', p: 1, u: 0 }], ...o });
const vend = (o) => ({ id: 7, name: 'شركة تجربة', tracked_from: '2026-11-10', notices: 2, pending: { n: 1, amount: 100 }, handed: { n: 0, amount: 0 }, untracked: { n: 0, amount: 0 }, returns: [ret({})], ...o });
const FILE = { generated_at: '2026-11-16T01:00:00Z', vendors: [vend({}), { id: 9 }, null, { id: 3, name: 'x', returns: 'no' }] };
const d = R.parse(FILE);
assert.equal(d.vendors.length, 1, 'a row with no name or no list of returns is dropped');
assert.deepEqual([d.vendors[0].id, d.vendors[0].name, d.vendors[0].trackedFrom, d.vendors[0].pending.amount], [7, 'شركة تجربة', '2026-11-10', 100]);
assert.deepEqual(d.vendors[0].returns[0].items, [{ n: 'TEST DRUG 10TAB', ar: '', p: 1, u: 0 }]);
assert.equal(R.parse(null), null);
assert.equal(R.parse({}), null);
assert.equal(R.parse({ vendors: 'x' }), null, 'anything that is not the laptop\'s file is no data');
assert.deepEqual(R.parse({ vendors: [] }).vendors, []);
// a company with no notice at all has no tracking day
assert.equal(R.parse({ vendors: [vend({ tracked_from: null })] }).vendors[0].trackedFrom, '');

// who is shown: a return waiting or one that went; the rest is only counted
const many = R.parse({ vendors: [
  vend({ id: 1, name: 'أ', pending: { n: 2, amount: 300 }, handed: { n: 1, amount: 50 } }),
  vend({ id: 2, name: 'ب', pending: { n: 0, amount: 0 }, handed: { n: 2, amount: 80 } }),
  vend({ id: 3, name: 'ج', pending: { n: 0, amount: 0 }, handed: { n: 0, amount: 0 }, untracked: { n: 40, amount: 9000 } }),
  vend({ id: 4, name: 'د', pending: { n: 1, amount: 45.5 } }),
] });
assert.deepEqual(R.shown(many).map((v) => v.id), [1, 2, 4], 'a company with only untracked returns is not shown');
assert.deepEqual(R.totals(many), { n: 3, amount: 345.5, companies: 2 });
assert.deepEqual(R.totals(null), { n: 0, amount: 0, companies: 0 });
assert.deepEqual(R.shown(null), []);

// a file the laptop stopped updating (72 hours)
const NOW = new Date('2026-11-16T12:00:00Z');
assert.equal(R.isOld('2026-11-16T01:00:00Z', NOW), false);
assert.equal(R.isOld('2026-11-12T01:00:00Z', NOW), true);
assert.equal(R.isOld('', NOW), true);
// numbers and dates
assert.equal(R.money(412.2), '412.20');
assert.equal(R.money(1297), '1,297');
assert.equal(R.dm('2026-11-15T16:54:08'), '15/11');
assert.equal(R.dm(''), '');
assert.deepEqual(R.qtyOf({ p: 2, u: 0 }), { k: 'p', n: 2 });
assert.deepEqual(R.qtyOf({ p: 0, u: 3 }), { k: 'u', n: 3 });

// the statement he copies: the pending ones only, oldest first, by invoice number, with the Arabic name when there is one, and the total
const v = R.parse({ vendors: [vend({ returns: [
  ret({ id: 3, at: '2026-11-15T16:54:08', no: '106676', amount: 412.2, items: [{ n: 'OCEAN SPRAY', ar: 'اوشن بخاخ', p: 1, u: 0 }, { n: 'CALCI 100ML', ar: '', p: 0, u: 2 }] }),
  ret({ id: 2, at: '2026-11-12T18:25:10', no: '100210', amount: 77.42, items: [{ n: 'IVY SYRUP', ar: '', p: 1, u: 0 }] }),
  ret({ id: 1, at: '2026-11-11T10:00:00', no: '97692', amount: 155.53, status: 'handed', notice: { no: '28563', at: '2026-11-13 06:32:23', total: 155.53 } }),
] })] }).vendors[0];
assert.equal(R.statementText(v), [
  'كشف مرتجعات صيدلية عسكر',
  'لدى شركة تجربة',
  'مرتجعات لسه ما اتسلّمتش، بأرقام الفواتير:',
  '1) فاتورة 100210 (12/11): 77.42 ج — IVY SYRUP (1 علبة)',
  '2) فاتورة 106676 (15/11): 412.20 ج — اوشن بخاخ (1 علبة)، CALCI 100ML (2 وحدة)',
  'الإجمالي: 489.62 ج',
].join('\n'));
assert.equal(R.statementText(R.parse({ vendors: [vend({ returns: [ret({ status: 'handed' })] })] }).vendors[0]), '', 'nothing waiting = no statement');
console.log('PASS: returns: the file, who is shown, the totals, the statement');
