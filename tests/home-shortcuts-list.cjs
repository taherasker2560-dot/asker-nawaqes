// «الرئيسية»: the list of what a home button can open (ar/shortcuts.js). Owner 2026-11-19: «ارتب التابات اللي في الرئيسية … لحد 30 … وتزود القايمة بناء على الشغل الجديد»:
// at least 30 things to pick (so thirty places can be filled), including the screens that live INSIDE a section: such a button opens the section and scrolls to that block.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
global.window = global;
const S = require('../ar/shortcuts.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'asker-nawaqes-arabic.html'), 'utf8');

const ids = S.ALL.map((x) => x[0]);
assert.equal(new Set(ids).size, ids.length, 'each button once');
assert.ok(ids.length >= S.MAX, 'there are at least as many things to pick as places for them: ' + ids.length);
for (const x of S.ALL) {
  assert.ok(x[1] && x[1].length <= 24, 'a short label: ' + x[0]);
  assert.match(x[3], /^[MmLlHhVvCcSsAaZz0-9 .,\-]+$/, 'an icon path: ' + x[0]);
}
// the screens inside a section name the section they open and the block they scroll to; both are in the page
const tabs = new Set([...html.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]).concat(['home', 'care']));
let inside = 0;
for (const x of S.ALL) {
  const [id, , , , tab, anchor] = x;
  assert.equal(S.TAB_OF[id], tab || id, 'what it opens: ' + id);
  assert.ok(tabs.has(S.TAB_OF[id]), id + ' opens a real section: ' + S.TAB_OF[id]);
  if (anchor) {
    inside++;
    assert.ok(tab, id + ' with a block to scroll to also names its section');
    assert.equal(S.ANCHOR_OF[id], anchor);
    assert.ok(new RegExp('id="' + anchor + '"').test(html), id + ' scrolls to a block that is in the page: #' + anchor);
  } else assert.equal(S.ANCHOR_OF[id], undefined);
}
assert.ok(inside >= 14, 'the new screens are in the list: ' + inside);
for (const id of ['users', 'sitesettings', 'newitems', 'compare', 'repinv', 'returns', 'wait', 'pay']) assert.ok(ids.includes(id), 'on the list: ' + id);
// the first six are the same as always
assert.deepEqual(S.DEFAULT, ['short', 'read', 'drafts', 'docs', 'tempsale', 'stock']);
// each once, only known ones, thirty at most
assert.equal(S.clean(ids.concat(ids)).length, S.MAX);
assert.deepEqual(S.clean(['short', 'short', 'nope', 'read']), ['short', 'read']);
// a screen inside a section goes on the home like any other
assert.equal(S.toggle(['short'], 'users').added, true);
// English: every label and group
require('../ar/i18n-en.js'); require('../ar/i18n.js');
const I = global.AskerI18n; I._use(global.AskerEN);
for (const x of S.ALL) assert.notEqual(I.translate(x[1]), x[1], 'has English: ' + x[1]);
for (const g of new Set(S.ALL.map((x) => x[2]))) assert.notEqual(I.translate(g), g, 'the group has English: ' + g);
assert.equal(I.translate('الرئيسية مليانة (30 زرار). شيل واحد الأول من «✏️ عدّل الزراير».'), 'Home is full (30 buttons). Remove one first in «✏️ Edit buttons».');
assert.equal(I.translate('الرئيسية فيها 30 زرار. شيل واحد الأول عشان تضيف.'), 'Home has 30 buttons. Remove one first to add.');
assert.equal(I.translate('7 من 30 زرار'), '7 of 30 buttons');
assert.match(I.translate('اللي هنا ظاهر في الرئيسية بالترتيب ده: الأسهم بترتّبهم، و✕ بيشيل الزرار. وفي الرئيسية نفسها دوس دوسة طويلة على أي زرار واسحبه لمكانه.'), /press and hold a button and drag it/);
// the page's files moved to a new version together (a phone must not keep the old ones)
const v = (f) => new RegExp(f.replace(/[./]/g, '\\$&') + '\\?v=([\\w-]+)').exec(html)[1];
assert.equal(v('ar/shortcuts.js'), v('ar/look.js'));
console.log('home-shortcuts-list ok');
