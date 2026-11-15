// «أصناف جديدة» (ar/new-items.js, owner 2026-11-15): the pure part. The English name's key (the same as ar_names / ar_shortages),
// the price as he types it (Arabic digits, a comma or an Arabic decimal point, «ج»), the open and the closed ones.
const assert = require('node:assert/strict');
global.window = global;
const N = require('../ar/new-items.js');

// the key: upper-case, single spaces, at most 250 (the function and the database use the same)
assert.equal(N.key('  Zetapro   5mg  syrup '), 'ZETAPRO 5MG SYRUP');
assert.equal(N.key(null), '');
assert.equal(N.key('x'.repeat(300)).length, 250);

// the price: nothing = null (optional), a number as he types it, anything else = NaN
assert.equal(N.parsePrice(''), null);
assert.equal(N.parsePrice('   '), null);
assert.equal(N.parsePrice(undefined), null);
assert.equal(N.parsePrice('85'), 85);
assert.equal(N.parsePrice('85.5'), 85.5);
assert.equal(N.parsePrice('85,5'), 85.5);
assert.equal(N.parsePrice('٨٥٫٥'), 85.5, 'Arabic digits and the Arabic decimal point');
assert.equal(N.parsePrice('٢٥٠ ج'), 250);
assert.equal(N.parsePrice('120.456'), 120.46);
assert.ok(Number.isNaN(N.parsePrice('abc')));
assert.ok(Number.isNaN(N.parsePrice('12.5.3')));
assert.ok(Number.isNaN(N.parsePrice('-5')) === false || N.parsePrice('-5') === 5, 'a minus sign is dropped, never a negative price');
assert.ok(Number.isNaN(N.parsePrice('99999999')), 'too big');

// open ones (new, ordered) newest first; closed ones apart
const items = [
  { id: 1, name_en: 'A', status: 'new', created_at: '2026-11-10T10:00:00Z' },
  { id: 2, name_en: 'B', status: 'ordered', created_at: '2026-11-12T10:00:00Z' },
  { id: 3, name_en: 'C', status: 'arrived', created_at: '2026-11-14T10:00:00Z' },
  { id: 4, name_en: 'D', status: 'cancelled', created_at: '2026-11-13T10:00:00Z' },
  { id: 5, name_en: 'E', status: 'new', created_at: '2026-11-12T10:00:00Z' },
];
const s = N.split(items);
assert.deepEqual(s.open.map((x) => x.name_en), ['E', 'B', 'A'], 'newest first, a tie by id');
assert.deepEqual(s.closed.map((x) => x.name_en), ['C', 'D']);
assert.deepEqual(N.split(null), { open: [], closed: [] });
assert.equal(N.isOpen({ status: 'ordered' }), true);
assert.equal(N.isOpen({ status: 'arrived' }), false);
console.log('new items: ok');
