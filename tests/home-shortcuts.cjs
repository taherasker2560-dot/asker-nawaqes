// «الرئيسية»: his own buttons (ar/shortcuts.js, owner 2026-11-15: «اقدر من السيستم اشيل النواقص من الرئيسية، واحط اي حاجة تانية …
// لحد 10 12 حاجه يبقوا في الوش»). Pure part only: what the phone kept, on/off, the order, at most 30 (owner 2026-11-19, it was 12).
const assert = require('node:assert/strict');
global.window = global;
const S = require('../ar/shortcuts.js');

// nothing kept yet (or broken): the six the home always had
assert.deepEqual(S.parse(null), ['short', 'read', 'drafts', 'docs', 'tempsale', 'stock']);
assert.deepEqual(S.parse(''), S.DEFAULT);
assert.deepEqual(S.parse('{oops'), S.DEFAULT);
assert.deepEqual(S.parse('{"a":1}'), S.DEFAULT);
// his choice, even an empty one; unknown sections and repeats are dropped
assert.deepEqual(S.parse('[]'), []);
assert.deepEqual(S.parse(JSON.stringify(['bags', 'vendors', 'nothing', 'bags', 'care'])), ['bags', 'vendors', 'care']);
// every section of the bot can be a button, each once, and the labels are the tabs' own names
const tabs = S.ALL.map((x) => x[0]);
assert.equal(new Set(tabs).size, tabs.length);
for (const t of ['short', 'read', 'translate', 'bags', 'drafts', 'docs', 'suppliers', 'stock', 'count', 'expiry', 'customers', 'vendors', 'ops', 'storeorders', 'sales', 'tempsale', 'care']) assert.ok(S.LABEL[t], t);
assert.equal(S.LABEL.vendors, 'الموردين');
// at most 30 (owner 2026-11-19: «لحد 30»; it was 12), and a list saved under the old limit stays exactly as it was
assert.equal(S.parse(JSON.stringify(tabs)).length, 30);
assert.equal(S.MAX, 30);
const old12 = ['short', 'read', 'translate', 'bags', 'drafts', 'docs', 'suppliers', 'stock', 'count', 'expiry', 'customers', 'vendors'];
assert.deepEqual(S.parse(JSON.stringify(old12)), old12);

// on → off, off → on at the end; the 31st is refused
let r = S.toggle(['short', 'read'], 'vendors');
assert.deepEqual(r, { list: ['short', 'read', 'vendors'], changed: true, added: true });
r = S.toggle(r.list, 'short');
assert.deepEqual(r.list, ['read', 'vendors']);
assert.equal(r.added, false);
const full = tabs.slice(0, 30);
r = S.toggle(full, tabs[30]);
assert.equal(r.full, true);
assert.equal(r.changed, false);
assert.equal(r.list, full);
assert.equal(S.toggle(full, full[0]).list.length, 29, 'taking one off a full home works');
assert.equal(S.toggle(['short'], 'nothing').changed, false);

// the order: one place up or down; the ends stay
assert.deepEqual(S.move(['a', 'b', 'c'], 'c', -1), ['a', 'c', 'b']);
assert.deepEqual(S.move(['a', 'b', 'c'], 'a', 1), ['b', 'a', 'c']);
assert.deepEqual(S.move(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
assert.deepEqual(S.move(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);
assert.deepEqual(S.move(['a', 'b'], 'x', 1), ['a', 'b']);
console.log('home shortcuts: ok');
