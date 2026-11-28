// «🔁 بدائل» on the search card + «💊 بالمادة الفعالة» (ar/home.js, owner 2026-11-28: «انا عاوز يظهر البدايل حتى لو فيه رصيد للصنف احيانا العميل حاجه بسعر اعلى او اقل»). Pure part only.
const assert = require('node:assert/strict');
global.window = global;
const H = require('../ar/home.js');

const rows = [
  { item_id: 1, gkey: 'tab|pantoprazole 40mg', confident: true, ingredients: 'pantoprazole 40mg', form: 'tab' },     // PANTOLOC
  { item_id: 2, gkey: 'tab|pantoprazole 40mg', confident: true, ingredients: 'pantoprazole 40mg', form: 'tab' },     // CONTROLOC
  { item_id: 3, gkey: 'tab|pantoprazole 40mg', confident: false, ingredients: 'pantoprazole 40mg', form: 'tab' },    // ZURCAL (unsure)
  { item_id: 4, gkey: 'tab|pantoprazole 40mg', confident: true, ingredients: 'pantoprazole 40mg', form: 'tab' },     // no stock
  { item_id: 5, gkey: 'tab|pantoprazole 20mg', confident: true, ingredients: 'pantoprazole 20mg', form: 'tab' },     // another strength
  { item_id: 6, gkey: 'inj|pantoprazole 40mg ; route iv ; per pack 40mg', confident: true, ingredients: 'pantoprazole 40mg ; route iv ; per pack 40mg', form: 'inj' },
  { item_id: 7, gkey: 'tab|pantoprazole 40mg', confident: true, ingredients: 'pantoprazole 40mg', form: 'tab' },     // cancelled
  { item_id: 8, gkey: 'tab|pantoprazole 40mg', confident: true, ingredients: 'pantoprazole 40mg', form: 'tab' },     // no price
];
const S = H.buildSubs(rows);
const it = (id, en, packs, price, extra) => Object.assign({ id, en, key: 'i' + id, stock: packs == null ? null : { packs, units: 0, price }, price }, extra || {});
const items = [
  it(1, 'PANTOLOC 40MG 14TAB', 0, 102), it(2, 'CONTROLOC 40MG 14T', 29, 188), it(3, 'ZURCAL 40MG 14 TAB', 13, 96), it(4, 'PANTOPRAZOLE 40MG 14TABS', 0, 90),
  it(5, 'PANTOLOC 20MG', 5, 60), it(6, 'PANTAZOL VIAL 40MG', 10, 70), it(7, 'OLD PANTO 40', 3, 50, { cancel: { hidden: true } }), it(8, 'PANTONAP 40 TAB', 2, null),
];
const byId = new Map(items.map((x) => [String(x.id), x]));

// an item with no stock: the ones in stock, same key only, cheapest first, no price last, cancelled never
let a = H.subsOf(items[0], S, byId);
assert.deepEqual(a.map((x) => x.it.id), [3, 2, 8], 'same strength + form, stock only, by price; another strength, an injection, no stock, cancelled: out');
assert.deepEqual(a.map((x) => x.diff), [-6, 86, null], 'against PANTOLOC 102: 96 is 6 cheaper, 188 is 86 dearer');
assert.deepEqual(a.map((x) => x.sure), [false, true, true], 'ZURCAL is an unsure line: «اتأكد»');
// an item IN stock has alternatives too (the owner's correction)
a = H.subsOf(items[1], S, byId);
assert.deepEqual(a.map((x) => x.it.id), [3, 8], 'CONTROLOC in stock: its cheaper alternatives still show');
assert.equal(H.diffText(-6), 'أرخص بـ 6 ج');
assert.equal(H.diffText(86), 'أغلى بـ 86 ج');
assert.equal(H.diffText(0), 'نفس السعر');
assert.equal(H.diffText(null), '');
assert.equal(H.subsOf({ id: null, en: 'X' }, S, byId).length, 0, 'an item with no PharmaFly code: nothing');
assert.equal(H.subsOf(it(99, 'NO LINE', 0, 10), S, byId).length, 0, 'an item with no ingredient line: nothing');
assert.equal(H.subsOf(items[0], S, byId, 1).length, 1, 'the limit holds');

// the key in words
assert.deepEqual(H.subsWhy(S.byItem.get('1')), { ing: 'pantoprazole 40mg', form: 'أقراص' });
assert.deepEqual(H.subsWhy(S.byItem.get('6')), { ing: 'pantoprazole 40mg', form: 'حقن وريد' });

// «pantoprazole» typed: one group per strength + form, more stock first; the cancelled item stays out
const g = H.ingredientGroups('pantoprazole', S, byId);
assert.equal(g.length, 3);
assert.equal(g[0].gkey, 'tab|pantoprazole 40mg');
assert.equal(g[0].have, 3, 'CONTROLOC, ZURCAL, PANTONAP have stock');
assert.deepEqual(g[0].items.map((x) => x.id), [3, 2, 8, 4, 1], 'in stock first (by price, no price last), then the rest by price');
assert.equal(H.ingredientGroups('panto', S, byId).length, 3, 'the start of the word is enough');
assert.equal(H.ingredientGroups('pan', S, byId).length, 0, 'three letters are too few');
assert.equal(H.ingredientGroups('بانتو', S, byId).length, 0, 'Arabic words are the name search, not this');
assert.equal(H.ingredientGroups('pantoloc', S, byId).length, 0, 'a brand name is not an ingredient');
assert.equal(H.ingredientGroups('pantoprazole', null, byId).length, 0, 'no ingredient list (staff without the right): nothing');
console.log('home-subs ok');
