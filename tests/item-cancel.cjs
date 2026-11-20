// «الملغى» in the search (owner 2026-11-20/21): the laptop's lists (word / dup / idle) + the owner's «ارجعه» read into one map, what each item does with its entry
// (hidden, kept on screen with a mark, or back for good after a purchase), the index split into visible / gone, the buttons' rule, the reasons in his words, and the English.
// Made-up items only.
const assert = require('node:assert/strict');
const H = require('../ar/home.js');

// ---- the lists -> one map ----
const rows = [
  { kind: 'idle', ids: '5:202103,6:000000,7:202011,8:202201' },
  { kind: 'word', ids: '1:20261121,7:20261121' },
  { kind: 'dup', ids: '2:20261121:85.5,8:20261121:20,9:20261121' },
  { kind: 'restored', ids: '6,9' },
];
const m = H.parseCancel(rows);
assert.deepEqual(m.get('1'), { kind: 'word', first: '2026-11-21' });
assert.deepEqual(m.get('2'), { kind: 'dup', first: '2026-11-21', keep: 85.5 });
assert.deepEqual(m.get('5'), { kind: 'idle', last: '2021-03' });
assert.equal(m.get('7').kind, 'word', 'word beats idle for the same item');
assert.equal(m.get('8').kind, 'dup', 'dup beats idle');
assert.equal(m.has('6'), false, 'the owner put 6 back: gone from the map for good (even with a list line)');
assert.equal(m.has('9'), false, 'a dup line with no keep price is also dropped when restored');
assert.equal(H.parseCancel(null).size, 0); assert.equal(H.parseCancel([{ kind: 'idle', ids: 'x,5:2021,:1' }]).size, 0, 'broken tokens are skipped');
assert.deepEqual(H.parseCancel([{ kind: 'idle', ids: '6:000000' }]).get('6'), { kind: 'idle', last: null }, '000000 = never moved');

// ---- one item against its entry ----
const it = (o) => ({ id: 1, stock: null, short: false, offers: [], buys: [], ...o });
const idle = { kind: 'idle', last: '2021-03' }, word = { kind: 'word', first: '2026-11-21' }, dup = { kind: 'dup', first: '2026-11-21', keep: 30 };
assert.equal(H.cancelState(it({}), undefined), null, 'no entry = not cancelled');
assert.equal(H.cancelState(it({}), idle).hidden, true, 'idle, nothing else: hidden');
assert.equal(H.cancelState(it({}), word).hidden, true); assert.equal(H.cancelState(it({}), dup).hidden, true);
// stock, the shortage list: stays on screen (with the mark); an idle item in a warehouse's list stays too, a word/dup one does not
assert.equal(H.cancelState(it({ stock: { packs: 2, units: 0 } }), word).hidden, false, 'with stock: stays');
assert.equal(H.cancelState(it({ stock: { packs: 0, units: 0 } }), word).hidden, true, 'a stock row of zero is no stock');
assert.equal(H.cancelState(it({ short: true }), dup).hidden, false, 'on the shortage list: stays');
assert.equal(H.cancelState(it({ offers: [{ supplier: 'AMG' }] }), idle).hidden, false, 'idle but in a warehouse list: stays');
assert.equal(H.cancelState(it({ offers: [{ supplier: 'AMG' }] }), word).hidden, true, 'a «ملغى» item in a list is still cancelled');
// a purchase brings it back for good: after the day it was first seen (word, dup) or after its last month (idle)
assert.equal(H.cancelState(it({ buys: [{ date: '2026-11-22' }] }), word), null, 'bought after the day it was first seen: back');
assert.equal(H.cancelState(it({ buys: [{ date: '2026-11-21' }] }), dup).hidden, true, 'the same day is not after');
assert.equal(H.cancelState(it({ buys: [{ date: '2021-04-02' }] }), idle), null, 'bought in a month after its last one: back');
assert.equal(H.cancelState(it({ buys: [{ date: '2021-03-30' }] }), idle).hidden, true, 'the same month is the same movement');
assert.equal(H.cancelState(it({ buys: [{ date: '2019-05-01' }] }), idle).hidden, true, 'an older purchase changes nothing');
assert.equal(H.cancelState(it({ buys: [{ date: '2024-01-01' }] }), { kind: 'idle', last: null }), null, 'never moved, then bought: back');

// ---- the index: visible / gone, the marks ----
const nk = (s) => String(s || '').toUpperCase().trim(), fold = (s) => String(s || '').toLowerCase();
const catalog = [101, 102, 103, 104, 105].map((id) => ({ id, name: 'ITEM ' + id, arabic_name: null, price: 10 }));
const cancel = H.parseCancel([{ kind: 'word', ids: '101:20261121,102:20261121' }, { kind: 'idle', ids: '103:202103,104:202103' }]);
const ix = H.buildIndex({ items: catalog, stock: [{ item_id: 102, name: 'ITEM 102', packs: 1, units: 0 }], lines: [], buys: [{ item_id: 104, supplier: 'AMG', last_date: '2026-11-01' }], shortages: [], names: new Map(), orders: [], nk, fold, cancel });
assert.deepEqual(ix.gone.map((x) => x.id), [101, 103], '101 and 103 are cancelled and have nothing to keep them');
assert.deepEqual(ix.visible.map((x) => x.id), [102, 104, 105], '102 has stock (kept with a mark), 104 was bought after its last month (back), 105 was never in a list');
assert.equal(ix.visible.find((x) => x.id === 102).cancelNote.kind, 'word'); assert.equal(ix.visible.find((x) => x.id === 104).cancelNote, undefined);
assert.deepEqual(H.marks(ix.visible.find((x) => x.id === 102), () => '1 علبة').map((x) => x.text), ['1 علبة', '🚫 ملغي'], 'the mark after the stock');
assert.deepEqual(H.marks(ix.visible.find((x) => x.id === 105)).map((x) => x.text), ['ملوش رصيد']);
// without lists nothing changes (before the migration / laptop upload)
const plain = H.buildIndex({ items: catalog, stock: [], lines: [], buys: [], shortages: [], names: new Map(), orders: [], nk, fold });
assert.equal(plain.visible.length, 5); assert.equal(plain.gone.length, 0);

// ---- the buttons ----
assert.equal(H.inScope(ix.gone[0], 'cancelled'), true); assert.equal(H.inScope(ix.visible[0], 'cancelled'), false);
for (const s of ['all', 'stock', 'lists', 'short']) assert.equal(H.inScope(ix.gone[0], s), false, 'a cancelled item is under «الملغى» only (' + s + ')');
assert.equal(H.inScope(ix.visible[2], 'all'), true); assert.equal(H.SCOPE_WORDS.cancelled, 'في الملغى');

// ---- the reasons, in his words ----
const w = (en, kind, extra) => ({ en, ar: '', cancel: { kind, ...extra } });
assert.equal(H.cancelWhy(w('ابيمول 500 ق ملغى', 'word')), 'مكتوب جنب اسمه «ملغى»');
assert.equal(H.cancelWhy(w('TANTUM VERDE P 20 LOZENGESG لاغى', 'word')), 'مكتوب جنب اسمه «لاغى»');
assert.equal(H.cancelWhy(w('AMRIZOLE', 'dup', { keep: 30 })), 'نفس الاسم بسعر أعلى: 30 ج'); assert.equal(H.cancelWhy(w('X', 'dup', { keep: 12.5 })), 'نفس الاسم بسعر أعلى: 12.5 ج');
assert.equal(H.cancelWhy(w('X', 'idle', { last: '2019-02' })), 'مفيش حركة من سنتين · آخر حركة 02/2019');
assert.equal(H.cancelWhy(w('X', 'idle', { last: null })), 'مفيش حركة من سنتين · عمره ما اتباع ولا اتشترى');
assert.equal(H.cancelWhy({ en: 'X' }), '');

// ---- English: every text this feature draws comes out with no Arabic left ----
global.window = global; require('../ar/i18n-en.js'); require('../ar/i18n.js');
const I = global.AskerI18n; I._use(global.AskerEN);
const AR = /[؀-ۿ]/, bad = [];
const texts = ['الملغى', 'في الملغى', '🚫 ملغي', '↩️ ارجعه', 'مكتوب جنب اسمه «لاغى»', 'مكتوب جنب اسمه «ملغى»', 'نفس الاسم بسعر أعلى: 30 ج', 'نفس الاسم بسعر أعلى',
  'مفيش حركة من سنتين · آخر حركة 02/2019', 'مفيش حركة من سنتين · عمره ما اتباع ولا اتشترى', 'وفيه 5 في «الملغى» بالاسم ده · شوفهم', '«كونكور ٥» رجع للبحث', 'ماترجعش: network error',
  '3 صنف في الملغى', 'مفيش صنف بالاسم ده في الملغى. دوس «الكل» تدوّر في كله.'];
for (const t of texts) { const e = I.translate(t); if (AR.test(e.replace(/كونكور ٥/g, ''))) bad.push(t + ' -> ' + e); }
assert.deepEqual(bad, [], 'untranslated: ' + bad.join(' | '));
assert.equal(I.translate('وفيه 5 في «الملغى» بالاسم ده · شوفهم'), '5 more in «Cancelled» with this name · see them');
assert.equal(I.translate('نفس الاسم بسعر أعلى: 30 ج'), 'Same name at a higher price: 30 EGP');
console.log('item-cancel: ok');
