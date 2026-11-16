// ar/motion.js (owner 2026-11-16, «كبسولة وموجة»): the pure part, the numbers that count up. At the end the line is EXACTLY what the page wrote.
const assert = require('node:assert/strict');
global.window = global;
const M = require('../ar/motion.js');

let p = M.countParts('1,250.5 ج');
assert.deepEqual({ ...p }, { before: '', after: ' ج', value: 1250.5, decimals: 1, comma: true });
p = M.countParts('3');
assert.deepEqual({ ...p }, { before: '', after: '', value: 3, decimals: 0, comma: false });
assert.equal(M.countParts('—'), null, 'no number yet: nothing to count');
assert.equal(M.countParts('0'), null, 'a zero does not count');
assert.equal(M.countParts(''), null);
assert.equal(M.countParts(null), null);

p = M.countParts('1,250.5 ج');
assert.equal(M.shown(p, 0), '0.0 ج');
assert.equal(M.shown(p, 1), '1,250.5 ج', 'at the end: exactly the page\'s own text');
assert.equal(M.shown(p, 2), '1,250.5 ج', 'past the end is still the end');
assert.equal(M.shown(p, -1), '0.0 ج');
let last = -1;
for (let i = 0; i <= 20; i++) {
  const v = parseFloat(M.shown(p, i / 20).replace(/[^\d.]/g, ''));
  assert.ok(v >= last, 'never goes back');
  last = v;
}
const three = M.countParts('3');
assert.equal(M.shown(three, 0), '0');
assert.equal(M.shown(three, 1), '3');
assert.match(M.shown(three, 0.4), /^\d$/);
console.log('PASS: app motion: the numbers count up and end exactly as written');
