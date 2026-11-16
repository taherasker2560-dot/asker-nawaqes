// «صور الأصناف في كشف حساب العميل» (ar/item-photos.js, owner 2026-11-16): the pure part. The item names of a statement, the store link, which picture an item has.
// Made-up items only (the repo is public).
const assert = require('node:assert/strict');
global.window = global;
const P = require('../ar/item-photos.js');

const stmt = { rows: [
  { id: 1, kind: 'payment', items: [{ n: 'أصناف متنوعة' }] },                       // a payment's placeholder line is not an item
  { id: 2, kind: 'sale', items: [{ n: 'PANADOL EXTRA 24 TAB' }, { n: ' VITACID C 1000 ' }, { n: '' }, null] },
  { id: 3, kind: 'return', items: [{ n: 'OMEZ 40 20 CAP' }, { n: 'PANADOL EXTRA 24 TAB' }] },
  { id: 4, kind: 'sale', items: null },
  { id: 5, kind: 'sale', items: [{ n: 'B' }] },
] };
assert.deepEqual(P.namesOf(stmt), ['PANADOL EXTRA 24 TAB', 'VITACID C 1000', 'OMEZ 40 20 CAP', 'B'], 'sales and returns only, distinct, in order, trimmed');
assert.deepEqual(P.namesOf(stmt, 2), ['PANADOL EXTRA 24 TAB', 'VITACID C 1000'], 'at most max');
assert.deepEqual(P.namesOf(null), []);
assert.deepEqual(P.namesOf({ rows: [] }), []);
const many = { rows: [{ kind: 'sale', items: Array.from({ length: 400 }, (_, i) => ({ n: 'ITEM ' + i })) }] };
assert.equal(P.namesOf(many).length, P.MAX_NAMES, 'a long statement is capped');

// the item's page in the store, next to the page that is open
assert.equal(P.storeLink(77, 'https://x.github.io/asker-nawaqes/asker-nawaqes-arabic.html'), 'https://x.github.io/asker-nawaqes/store.html#item=77');
assert.equal(P.storeLink('12', 'https://x.github.io/asker-nawaqes/'), 'https://x.github.io/asker-nawaqes/store.html#item=12');
assert.equal(P.storeLink(7, 'not a url'), '', 'a bad base = no link');

// which picture: his own change wins; «من غير صورة» = none; else the catalog's
const idx = { 10: '10.jpg', 20: '20.jpg' };
assert.equal(P.picUrl(10, idx, null, 'https://s/e/'), 'store/img/10.jpg');
assert.equal(P.picUrl(10, idx, { img: 'mine.jpg' }, 'https://s/e/'), 'https://s/e/mine.jpg');
assert.equal(P.picUrl(10, idx, { img_off: true, img: 'mine.jpg' }, 'https://s/e/'), '', 'the owner turned the picture off');
assert.equal(P.picUrl(99, idx, null, ''), '', 'an item with no picture');
assert.equal(P.picUrl(99, idx, { img: 'mine.jpg' }, 'https://s/e/'), 'https://s/e/mine.jpg', 'his picture for an item the catalog has none for');
assert.equal(P.picUrl(10, null, null, ''), '', 'no index');
assert.deepEqual(P.chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepEqual(P.chunks([], 40), []);
console.log('PASS: item-photos: the names, the store link, the picture choice');
