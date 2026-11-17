// The dark surfaces of the new look (ar/settings.js, owner 2026-11-16: the navy was «مش حلو»; «قهوة دافية و اعملها اوبشن اغيرها براحتى»).
// Four sets that suit the orange, none of them blue; the default is the warm brown; text on every one of them is readable.
const assert = require('node:assert/strict');
global.window = global;
require('../ar/settings.js');
const S = global.AskerSettings;
assert.ok(S && S.DARKS, 'the sets are exported');

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hsl = (h) => {
  let [r, g, b] = hex(h).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let hue = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hue = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue *= 60;
  }
  return { h: hue, s: s * 100, l: l * 100 };
};

assert.deepEqual(S.DARKS.map((d) => d.id), ['terra', 'warm', 'charcoal', 'plum']);
assert.equal(S.DARK_DEFAULT, 'terra', 'the default is the calm orange (owner 2026-11-17: no aqua green)');
assert.equal(S.darkOf('warm').name, 'قهوة دافية');
assert.equal(S.darkOf('terra').dark, '#c0522a', 'the surface is exactly the calm orange');
assert.equal(S.darkOf('terra').dark2, '#d0653a');
assert.equal(S.darkOf('teal').id, 'terra', 'a phone that kept the old aqua green falls back to the calm orange');
assert.equal(S.darkOf('nonsense').id, 'terra', 'an unknown choice falls back to the default');
assert.equal(S.darkOf(undefined).id, 'terra');
// a color of his own: darkened until white text reads, always with a lighter step and a near-black one
for (const own of ['c:#e0a030', 'c:#ffffff', 'c:#000000', 'c:#066f74']) {
  const o = S.darkOf(own);
  assert.equal(o.id, 'custom');
  assert.ok(S.contrast(o.dark, '#ffffff') >= 4.5, own + ': white text reads on it: ' + o.dark);
  for (const k of ['dark', 'dark2', 'deep']) assert.match(o[k], /^#[0-9a-f]{6}$/, own + ' ' + k);
}
assert.equal(S.darkOf('c:#zzzzzz').id, 'terra', 'a broken color falls back to the default');
assert.equal(new Set(S.DARKS.map((d) => d.name)).size, 4, 'four different names');
for (const d of S.DARKS) {
  for (const k of ['dark', 'dark2', 'deep']) {
    assert.match(d[k], /^#[0-9a-f]{6}$/, d.id + ' ' + k);
    const c = hsl(d[k]);
    // no navy: a saturated blue (hue 200-265) is exactly what he refused (a faint gray-blue tint in the charcoal is not navy)
    assert.ok(!(c.h >= 200 && c.h <= 265 && c.s >= 25), `${d.id}.${k} must not be navy: ${JSON.stringify(c)}`);
    // and no aqua green (owner 2026-11-17: the calm orange instead of the orange and the aqua green, everywhere)
    assert.ok(!(c.h >= 70 && c.h <= 200 && c.s >= 12), `${d.id}.${k} must not be green: ${JSON.stringify(c)}`);
  }
  assert.ok(S.contrast(d.dark, '#ffffff') >= 4.5, d.id + ': white text on the surface reads (AA)');
  assert.ok(S.contrast(d.dark2, '#ffffff') >= 3, d.id + ': white big text on the lighter step reads (the gradient\'s end, large text)');
  assert.ok(hsl(d.deep).l < hsl(d.dark).l && hsl(d.dark).l < hsl(d.dark2).l, d.id + ': deep < surface < lighter step');
}
// the page gets the variables (a tiny stand-in document)
const set = {};
global.document = { documentElement: { style: { setProperty: (k, v) => { set[k] = v; } }, dataset: {}, classList: { toggle() {} } }, querySelector: () => null, getElementById: () => null, readyState: 'complete', addEventListener() {} };
global.localStorage = { getItem: () => null, setItem() {} };
delete require.cache[require.resolve('../ar/settings.js')];
require('../ar/settings.js');
const S2 = global.AskerSettings;
const d = S2.applyDark('charcoal');
assert.equal(d.id, 'charcoal');
assert.equal(set['--dark'], '#25282c');
assert.equal(set['--dark-2'], '#3d434b');
assert.equal(set['--dark-deep'], '#101214');
assert.equal(set['--dark-rgb'], '37, 40, 44');
assert.equal(document.documentElement.dataset.dark, 'charcoal');
console.log('PASS: dark sets: four that suit the orange, none navy or green, the calm orange the default, readable text, the variables set');
