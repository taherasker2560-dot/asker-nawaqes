// store/motion.js (owner 2026-11-16, «كبسولة وموجة»): the pure part, the balance that counts up. At the end the line is EXACTLY what the page wrote.
const assert = require('node:assert/strict');
global.window = global;
const M = require('../store/motion.js');

// the number inside a line, and what is around it
let p = M.countParts('عليك 7,174.50 ج');
assert.deepEqual({ ...p }, { before: 'عليك ', after: ' ج', value: 7174.5, decimals: 2, comma: true });
p = M.countParts('ليك عندنا 300 ج');
assert.deepEqual({ ...p }, { before: 'ليك عندنا ', after: ' ج', value: 300, decimals: 0, comma: false });
assert.equal(M.countParts('حسابك خالص'), null, 'no number: nothing to count');
assert.equal(M.countParts('عليك 0 ج'), null, 'a zero does not count');
assert.equal(M.countParts(''), null);
assert.equal(M.countParts(null), null);

// the line while counting: starts at zero, grows, ends exactly as written (the same commas and decimals)
p = M.countParts('عليك 7,174.50 ج');
assert.equal(M.shown(p, 0), 'عليك 0.00 ج');
assert.equal(M.shown(p, 1), 'عليك 7,174.50 ج', 'at the end: exactly the page\'s own text');
assert.equal(M.shown(p, 1.5), 'عليك 7,174.50 ج', 'past the end is still the end');
assert.equal(M.shown(p, -1), 'عليك 0.00 ج');
let last = -1;
for (let i = 0; i <= 20; i++) {
  const v = parseFloat(M.shown(p, i / 20).replace(/[^\d.]/g, ''));
  assert.ok(v >= last, 'never goes back');
  last = v;
}
assert.ok(parseFloat(M.shown(p, 0.5).replace(/[^\d.]/g, '')) > 7174.5 * 0.5, 'an ease-out: more than half done at half the time');
// no commas when the page wrote none
assert.equal(M.shown(M.countParts('ليك عندنا 300 ج'), 1), 'ليك عندنا 300 ج');
assert.match(M.shown(M.countParts('ليك عندنا 300 ج'), 0.3), /^ليك عندنا \d+ ج$/);
console.log('PASS: store motion: the balance counts up and ends exactly as written');
