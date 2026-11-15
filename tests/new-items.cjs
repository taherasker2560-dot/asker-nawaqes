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

// the form of an item, from its name («تعرف تقسمه بقى إذا كان حبوب إذا كان كريم»)
const F = (n) => N.formOf(n);
assert.equal(F('ZURCAL 40MG 14 TAB'), 'حبوب');
assert.equal(F('Panadol Extra 24 tablets'), 'حبوب');
assert.equal(F('LAMIFEN CREAM 15GM'), 'كريم');
assert.equal(F('FLAGYL 125MG SYRUP'), 'شراب');
assert.equal(F('BRUFEN 100MG/5ML SUSP'), 'شراب');
assert.equal(F('TOTAVIT 20 CAP'), 'كبسول');
assert.equal(F('DIAMEDIZEN 60MG CAPSULES'), 'كبسول');
assert.equal(F('ALGASON CREAM 40GM'), 'كريم');
assert.equal(F('NEVILOB EYE DROPS 5ML'), 'نقط', 'EYE DROPS is drops');
assert.equal(F('CEFIX HAIR LOTION'), 'لوشن');
assert.equal(F('PRO ORGANA ANTIDANDRUFF SHAMPOO 120ML'), 'شامبو', 'a shampoo is a shampoo even with ML');
assert.equal(F('MOONY MOUTH SPRAY'), 'سبراي');
assert.equal(F('EPIFENAC 50 ML 5 SUPP'), 'لبوس');
assert.equal(F('CEFTRIAXONE 1GM VIAL'), 'حقن');
assert.equal(F('SOLPADEINE EFF 24 TAB'), 'فوار/أكياس', 'effervescent before tablets');
assert.equal(F('VOLTAREN EMULGEL GEL 50GM'), 'جيل');
assert.equal(F('كريم ترطيب 50 جم'), 'كريم', 'Arabic words work too');
assert.equal(F('زيركال ٤٠ قرص'), 'حبوب');
assert.equal(F('SOMETHING NEW 30'), '', 'not known = empty');
assert.equal(F(''), '');
assert.equal(F(null), '');
assert.ok(N.isOpen({ status: 'approved' }), 'approved is still open');
assert.equal(N.STATUS.approved, 'في أمر الشراء');
console.log('new items (form): ok');