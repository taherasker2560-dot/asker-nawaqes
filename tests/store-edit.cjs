// Store (owner 2026-11-14): the description under each item and the owner's «✏️ عدّل» helpers. Made-up texts only.
const assert = require('node:assert/strict');
const S = require('../store/store.js');
const E = require('../store/edit.js');
// the description: hook, then the three sections, then the «not a replacement for the pharmacist» note
let h = S.descHtml({ h: 'صداع؟ <b>ده</b> بيسكّن', u: ['صداع', ''], f: [], w: ['متزودش عن 8'] });
assert.match(h, /^<p class="ds-lang">الوصف بالعربي بس<\/p><p class="ds-hook" translate="no" dir="auto">صداع؟ &lt;b&gt;ده&lt;\/b&gt; بيسكّن<\/p>/, 'escaped, never translated');
assert.match(h, /<details class="ds-sec" open><summary>بيستخدم في<\/summary><ul><li translate="no" dir="auto">صداع<\/li><\/ul><\/details>/, 'the first part is open');
assert.doesNotMatch(h, /مميزاته/, 'an empty section is not drawn');
assert.match(h, /<details class="ds-sec warn"><summary>تنبيهات وأضرار/, 'the others start closed');
assert.match(h, /مش بديل عن استشارة الصيدلي/);
assert.equal(S.descHtml(null), ''); assert.equal(S.descHtml({ h: ' ', u: [] }), '');
assert.equal((S.descHtml({ u: ['1', '2', '3', '4', '5', '6', '7'] }).match(/<li/g) || []).length, 5, 'at most 5 points');
// the owner's edit box -> the saved description
assert.deepEqual(E.descFromForm({ h: '  جملة ', u: '• أول\n\n- تاني', f: '', w: 'تحذير' }), { h: 'جملة', u: ['أول', 'تاني'], f: [], w: ['تحذير'] });
assert.equal(E.descFromForm({ h: '', u: '\n', f: ' ', w: '' }), null, 'all empty = no description of his own');
assert.equal(E.descFromForm({ h: 'x'.repeat(500) }).h.length, 300);
// a phone photo is made small before it is sent
assert.deepEqual(E.fitSize(4000, 3000, 800), { w: 800, h: 600 });
assert.deepEqual(E.fitSize(500, 300, 800), { w: 500, h: 300 }, 'never made bigger');
assert.deepEqual(E.fitSize(1000, 2000, 800), { w: 400, h: 800 });
// recent searches (store v2, 2026-11-15): newest first, no repeats (any case), at most 8, nothing under 2 letters
assert.deepEqual(S.rememberSearch(['panadol', 'فيتامين د'], '  Panadol '), ['Panadol', 'فيتامين د']);
assert.deepEqual(S.rememberSearch(['a1'], 'x'), ['a1']);
assert.equal(S.rememberSearch(Array.from({ length: 12 }, (_, i) => 'q' + i), 'new').length, S.MAX_RECENT);
assert.deepEqual(S.rememberSearch(null, 'bebelac'), ['bebelac']);
assert.ok(Object.values(S.SEC_PICS).every((id) => Number.isInteger(id)), 'a photo per section');
console.log('store-edit ok');
