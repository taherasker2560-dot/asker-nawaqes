// ONE brand color (owner 2026-11-17: «عاوز استخدم ال calm orange بدل الأورانج والأخضر المائي في جميع المواضع في جميع التصميمات»).
// The pages' stylesheets and the designs the code draws (the statement PDF, the QR card, the manifests) hold no green and no other orange:
// every color of those hues is the calm orange family below (the tokens), or a warm neutral / a dark brown / a red (errors).
// A new green or a vivid orange anywhere in them fails this test: use the tokens (var(--accent) / var(--crimson) and their soft, ink and line steps).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

// the calm orange family: main, deep, ink, soft, line, its lighter step and the near-black one of the dark set
const FAMILY = new Set(['#c0522a', '#8a3b1e', '#86391d', '#f9efeb', '#ead5cd', '#ead4cd', '#d0653a', '#3a190d', '#fbf6f4', '#f4eae6']);

function toRgb(tok) {
  if (tok[0] === '#') { let x = tok.slice(1); if (x.length === 3 || x.length === 4) x = x.split('').map((c) => c + c).join(''); return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; }
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(tok); return m ? [+m[1], +m[2], +m[3]] : null;
}
function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s, l];
}
// a green (any visible one), or an orange / amber / yellow that is saturated and not a dark brown
function offBrand(tok) {
  const rgb = toRgb(tok); if (!rgb) return false;
  const [h, s, l] = hsl(rgb[0], rgb[1], rgb[2]);
  if (h >= 70 && h < 200 && s >= 0.12 && l > 0.06 && l < 0.99) return true;
  if (h >= 12 && h < 70 && s >= 0.4 && l >= 0.22 && l < 0.995) return true;
  return false;
}
const COLOR = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d+[,\s]+\d+[,\s]+\d+(?:[,\s/]+[\d.]+)?\s*\)/g;
function strip(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1'); }
function check(rel, opts) {
  const text = strip(fs.readFileSync(path.join(root, rel), 'utf8'));
  const bad = [];
  text.split('\n').forEach((ln, i) => {
    for (const m of ln.matchAll(COLOR)) {
      const tok = m[0].toLowerCase();
      if (FAMILY.has(tok)) continue;
      if (opts && opts.allow && opts.allow.has(tok)) continue;
      if (offBrand(tok)) bad.push(`${rel}:${i + 1} ${tok}  ${ln.trim().slice(0, 90)}`);
    }
  });
  return bad;
}

const css = [...fs.readdirSync(path.join(root, 'store')).filter((f) => f.endsWith('.css')).map((f) => 'store/' + f),
  ...fs.readdirSync(path.join(root, 'ar')).filter((f) => f.endsWith('.css')).map((f) => 'ar/' + f)];
assert.ok(css.length >= 9, 'the stylesheets are found: ' + css.length);
let bad = [];
for (const f of css) bad = bad.concat(check(f));
// the designs drawn by the code: the statement PDF, the QR card, the customer page's installable manifest, the two manifests
for (const f of ['ar/statement-pdf.js', 'ar/store-link.js', 'store/account.js', 'manifest-store.json', 'manifest-arabic.json']) bad = bad.concat(check(f));
assert.deepEqual(bad, [], 'no green and no other orange in the designs (use the calm orange tokens):\n' + bad.join('\n'));
// the colors the people can PICK (ar/settings.js PRESETS) are choices, not the design: the default is the calm orange and the dark default too
global.window = global;
require('../ar/settings.js');
const S = global.AskerSettings;
assert.equal(S.PRESETS[0].id, 'terra');
assert.equal(S.PRESETS[0].hex, '#c0522a');
assert.equal(S.DARK_DEFAULT, 'terra');
for (const f of ['store.html', 'asker-nawaqes-arabic.html']) assert.match(fs.readFileSync(path.join(root, f), 'utf8'), /<meta name="theme-color" content="#c0522a"/, f + ': the phone bar is the calm orange');
for (const f of ['manifest-store.json', 'manifest-arabic.json']) { const m = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); assert.equal(m.theme_color, '#c0522a', f); assert.equal(m.background_color, '#ffffff', f); }
console.log('one-color ok');
