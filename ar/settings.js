/* Settings (asker-nawaqes-arabic.html, owner 2026-11-12): the bot's color and the night look, kept on this phone only
   (localStorage); the language choice (English comes later, the button is there but off).
   «ليه عامل 8 ألوان بس؟ أنا عايز ألوان كتير»: 24 ready colors plus «لون من اختيارك» (any color), and «الوضع الليلي» works
   with every color. Each color gives the page's 5 main tokens (ar/app.css :root), worked out so white text on the color and
   the color's text on the page stay readable. Loaded first, so the color is right before anything shows. */
(function (root) {
  'use strict';
  // «برتقالي فاقع» first and the DEFAULT (owner 2026-11-15: «عايز اللون الأساسي يبقى الأورنج الفاقع ده … يبقى عندهم هم الأوبشن يغيروا»): the bot's
  // color unless someone picks another one. «أزرق عسكر» (the blue of the round logo, the default 2026-11-12 to 11-15) is the second one.
  // 2026-11-19 night (owner: «هختار اللبني وعاوزك تمشي النمط ده حالا في كل تفاصيل المشروع»): «لبني هادي» is the DEFAULT now (white pages, color only in small touches:
  // ar/airy.css, store/airy.css, supplier/vendor.css); «برتقالي هادي» stays in the list.
  const PRESETS = [
    ['calmsky', 'لبني هادي', '#217bab'], ['terra', 'برتقالي هادي', '#c0522a'], ['flame', 'برتقالي فاقع', '#d84315'], ['asker', 'أزرق عسكر', '#0a4aa6'], ['crimson', 'عنابي', '#7d1028'], ['red', 'أحمر', '#b3261e'], ['rose', 'وردي', '#c2185b'], ['fuchsia', 'فوشيا', '#a3127a'],
    ['purple', 'بنفسجي', '#5b3a8c'], ['violet', 'موف غامق', '#4527a0'], ['indigo', 'نيلي', '#283593'], ['blue', 'أزرق', '#1d4f91'],
    ['sky', 'لبني', '#0277bd'], ['cyan', 'سماوي', '#00838f'], ['teal', 'تركواز', '#0e6b72'], ['emerald', 'زمردي', '#00796b'],
    ['green', 'أخضر', '#1d6f48'], ['leaf', 'أخضر زرعي', '#2e7d32'], ['olive', 'زيتوني', '#556b2f'], ['lime', 'ليموني غامق', '#827717'],
    ['gold', 'دهبي', '#9a7414'], ['orange', 'برتقالي', '#a8501a'], ['copper', 'نحاسي', '#8d4e2a'],
    ['brown', 'بني', '#5d4037'], ['gray', 'رمادي', '#3f4650'], ['slate', 'رصاصي', '#455a64'], ['charcoal', 'فحمي', '#263238'],
  ].map(([id, name, hex]) => ({ id, name, hex }));
  const KEY = 'asker-accent', NIGHT = 'asker-night', STRIPS = 'asker-strips', DEFAULT_ID = 'calmsky'; // the calm sky blue (owner 2026-11-19 night); the calm orange (2026-11-17) and «برتقالي فاقع» stay in the list
  // the dark surfaces of the new look (the bottom bar, the greeting, the balance card, the footer). Owner 2026-11-16: the navy was «مش حلو», then the aqua green
  // («أخضر مائي»); 2026-11-17: «عاوز استخدم ال calm orange بدل الأورانج والأخضر المائي في جميع المواضع»: the calm orange is the DEFAULT surface now (white text on it
  // reads, 4.7:1) and the aqua green is gone (a phone that kept it falls back to the default). Four sets, none of them blue or green, plus any color of his own;
  // each gives the surface, a lighter step of it and the near-black one for the night look.
  // The bot keeps its choice under asker-dark, the store under asker-store-dark (store/theme.js).
  const DARKS = [
    ['calmsky', 'لبني هادي', '#217bab', '#3b8fbd', '#0d2631'], ['terra', 'برتقالي هادي', '#c0522a', '#d0653a', '#3a190d'], ['warm', 'قهوة دافية', '#3a2018', '#5b3322', '#1c0e0a'],
    ['charcoal', 'فحمي', '#25282c', '#3d434b', '#101214'], ['plum', 'برقوقي', '#3a1c33', '#5a2d4f', '#1a0c17'],
  ].map(([id, name, dark, dark2, deep]) => ({ id, name, dark, dark2, deep }));
  const DARK_KEY = 'asker-dark', DARK_DEFAULT = 'calmsky';
  // «c:#rrggbb» = a color of his own: darkened until white text on it reads, with its lighter step and its near-black worked out
  function darkOf(id) {
    const own = /^c:(#[0-9a-f]{6})$/i.exec(String(id || ''));
    if (own) {
      const rgb = hexToRgb(own[1]);
      let [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
      let dark = hslToHex(h, s, l);
      while (contrast(dark, '#ffffff') < 4.5 && l > 4) { l -= 2; dark = hslToHex(h, s, l); }
      return { id: 'custom', name: '', dark, dark2: hslToHex(h, s, Math.min(l + 10, 60)), deep: hslToHex(h, Math.min(s, 70), Math.max(l * 0.4, 4)) };
    }
    return DARKS.find((x) => x.id === id) || DARKS[0];
  }

  // ---------- colors (pure) ----------
  function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join(''); }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
    if (!s) return rgbToHex(l * 255, l * 255, l * 255);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return rgbToHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
  }
  function lum(hex) { const c = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  // the 5 tokens from one color: main (buttons, white text on it), deep (the bar's dark end), ink (the color as text),
  // soft (light tint behind secondary buttons), line (borders). night = the page is dark.
  function palette(hex, night) {
    const rgb = hexToRgb(hex) || hexToRgb('#7d1028');
    let [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    let main = hslToHex(h, s, l);
    while (contrast(main, '#ffffff') < 4.6 && l > 4) { l -= 2; main = hslToHex(h, s, l); }
    const deep = hslToHex(h, s, Math.max(l - 13, 6));
    // tint / tint2: the page behind the cards and the quiet surfaces, a breath of the color (the modern look, ar/look.css)
    if (night) return { main, deep, ink: hslToHex(h, Math.min(s, 80), 80), soft: hslToHex(h, Math.min(s, 30), 19), line: hslToHex(h, Math.min(s, 22), 30), tint: hslToHex(h, Math.min(s, 28), 7), tint2: hslToHex(h, Math.min(s, 22), 12) };
    let il = Math.min(l - 4, 32), ink = hslToHex(h, s, il);
    while (contrast(ink, '#fbf8f8') < 7 && il > 4) { il -= 2; ink = hslToHex(h, s, il); }
    return { main, deep, ink, soft: hslToHex(h, Math.min(s, 55), 95), line: hslToHex(h, Math.min(s, 40), 86), tint: hslToHex(h, Math.min(s, 45), 97), tint2: hslToHex(h, Math.min(s, 40), 93) };
  }

  // ---------- kept on the phone ----------
  function read(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  // the stored choice: a ready color's id, or «c:#rrggbb» (any color); the old «night» color (8-color version) = purple at night.
  // The new logo is blue (2026-11-12): once, a phone still on the old default (crimson, the old red logo's color) or on
  // nothing moves to «أزرق عسكر»; any other color he picked stays.
  // 2026-11-15: the default is the vivid orange now. Once, a phone on nothing, on the old crimson or on «أزرق عسكر» (the default of the last days;
  // nobody could tell a chosen blue from the default) moves to it; any other color somebody picked stays, and he can change it again.
  const LOOK = 'asker-look-3';
  function choice() {
    if (read(LOOK, '') !== '1') {
      const was = read(KEY, '');
      if (!was || was === 'crimson' || was === 'asker') write(KEY, DEFAULT_ID);
      write(LOOK, '1');
    }
    // 2026-11-17: whoever still has the old default (the vivid orange, «flame», that nobody picked on purpose: it was written as the default)
    // moves once to the calm orange; any other color somebody picked stays, and «برتقالي فاقع» can still be picked again.
    if (read('asker-calm', '') !== '1') {
      if (read(KEY, '') === 'flame') write(KEY, DEFAULT_ID);
      write('asker-calm', '1');
    }
    // 2026-11-19 night: whoever is still on the calm orange (it was written as the default, nobody picked it on purpose) moves once to the calm sky blue;
    // any other color somebody picked stays, and «برتقالي هادي» can still be picked again from the list.
    if (read('asker-airy', '') !== '1') {
      if (read(KEY, '') === 'terra') write(KEY, DEFAULT_ID);
      if (read(DARK_KEY, '') === 'terra') write(DARK_KEY, DARK_DEFAULT);
      write('asker-airy', '1');
    }
    let a = read(KEY, DEFAULT_ID), night = read(NIGHT, '') === '1';
    if (a === 'night') { a = 'purple'; night = true; write(KEY, a); write(NIGHT, '1'); }
    const p = PRESETS.find((x) => x.id === a);
    const hex = p ? p.hex : /^c:#[0-9a-f]{6}$/i.test(a) ? a.slice(2) : PRESETS[0].hex;
    return { id: p ? p.id : /^c:/.test(a) ? 'custom' : DEFAULT_ID, hex, night };
  }
  // the dark set on the page: --dark (the surface), --dark-2 (a lighter step), --dark-deep (the night look's near-black), --dark-rgb (for soft shadows)
  function applyDark(id) {
    const d = darkOf(id), s = document.documentElement.style;
    s.setProperty('--dark', d.dark);
    s.setProperty('--dark-2', d.dark2);
    s.setProperty('--dark-deep', d.deep);
    s.setProperty('--dark-rgb', hexToRgb(d.dark).join(', '));
    document.documentElement.dataset.dark = d.id;
    return d;
  }
  function apply() {
    const c = choice(), t = palette(c.hex, c.night), s = document.documentElement.style;
    applyDark(read(DARK_KEY, DARK_DEFAULT));
    s.setProperty('--crimson', t.main);
    s.setProperty('--crimson-deep', t.deep);
    s.setProperty('--crimson-ink', t.ink);
    s.setProperty('--rose', t.soft);
    s.setProperty('--rose-line', t.line);
    s.setProperty('--tint', t.tint);
    s.setProperty('--tint-2', t.tint2);
    s.setProperty('--glow', hexToRgb(t.main).join(', ')); // for soft colored shadows: rgba(var(--glow), .5)
    document.documentElement.dataset.accent = c.id;
    document.documentElement.classList.toggle('night', c.night);
    // the phone's top bar AND the three Android buttons at the bottom take this color: the header is the system color again (owner 2026-11-21, ar/airy.css), day and night
    const meta = document.querySelector('meta[name="theme-color"]');
    // the switch «الشريط الرفيع وأزرار الأندرويد بلون التطبيق» (owner 2026-11-21: «ولو مفتاح للنافيجيشن بار»): on = the color, off = white by day / the dark page at night; the two strips share this one color
    if (meta) meta.setAttribute('content', read(STRIPS, '1') !== '0' ? t.main : (c.night ? t.tint : '#ffffff'));
    return c;
  }
  root.AskerSettings = { PRESETS, DEFAULT_ID, palette, contrast, apply, choice, DARKS, DARK_DEFAULT, darkOf, applyDark };
  if (typeof document === 'undefined') return;
  apply(); // before the page paints

  const $ = (id) => document.getElementById(id);
  function drawPick() {
    const box = $('accentPick');
    if (!box) return;
    const c = choice();
    box.innerHTML = PRESETS.map((p) => `<button type="button" role="radio" aria-checked="${p.id === c.id}" data-accent="${p.id}" class="accent${p.id === c.id ? ' on' : ''}"><span style="background:${palette(p.hex, false).main}"></span>${p.name}</button>`).join('');
    if ($('accentCustom')) $('accentCustom').value = c.hex;
    $('accentCustomRow')?.classList.toggle('on', c.id === 'custom');
    if ($('nightMode')) $('nightMode').checked = c.night;
    if ($('stripsColor')) $('stripsColor').checked = read(STRIPS, '1') !== '0';
    drawDark();
  }
  function drawDark() {
    const box = $('darkPick');
    if (!box) return;
    const d0 = darkOf(read(DARK_KEY, DARK_DEFAULT)), cur = d0.id;
    box.innerHTML = DARKS.map((d) => `<button type="button" role="radio" aria-checked="${d.id === cur}" data-dark="${d.id}" class="accent${d.id === cur ? ' on' : ''}"><span style="background:linear-gradient(135deg,${d.dark},${d.dark2})"></span>${d.name}</button>`).join('');
    if ($('darkCustom')) $('darkCustom').value = d0.dark;
    $('darkCustomRow')?.classList.toggle('on', cur === 'custom');
  }
  function openSheet(on) {
    const p = $('settingsPanel');
    if (!p) return;
    p.classList.toggle('hidden', !on);
    $('settingsBtn')?.setAttribute('aria-expanded', String(on));
    if (on) { drawPick(); $('settingsClose')?.focus(); }
  }
  function bind() {
    $('settingsBtn')?.addEventListener('click', () => openSheet(true));
    $('settingsClose')?.addEventListener('click', () => openSheet(false));
    $('settingsPanel')?.addEventListener('click', (e) => { if (e.target === $('settingsPanel')) openSheet(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('settingsPanel')?.classList.contains('hidden')) openSheet(false); });
    $('accentPick')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-accent]');
      if (!b) return;
      write(KEY, b.dataset.accent);
      apply();
      drawPick();
    });
    $('darkPick')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dark]');
      if (!b) return;
      write(DARK_KEY, b.dataset.dark);
      applyDark(b.dataset.dark);
      drawDark();
    });
    const darkOwn = (e) => { if (!/^#[0-9a-f]{6}$/i.test(e.target.value)) return; write(DARK_KEY, 'c:' + e.target.value.toLowerCase()); applyDark(read(DARK_KEY, DARK_DEFAULT)); drawDark(); };
    $('darkCustom')?.addEventListener('input', darkOwn);
    $('darkCustom')?.addEventListener('change', darkOwn);
    // any color: «input» while the picker moves, «change» when it closes
    const custom = (e) => { if (!/^#[0-9a-f]{6}$/i.test(e.target.value)) return; write(KEY, 'c:' + e.target.value.toLowerCase()); apply(); drawPick(); };
    $('accentCustom')?.addEventListener('input', custom);
    $('accentCustom')?.addEventListener('change', custom);
    $('nightMode')?.addEventListener('change', (e) => { write(NIGHT, e.target.checked ? '1' : '0'); apply(); drawPick(); });
    if ($('stripsColor')) $('stripsColor').checked = read(STRIPS, '1') !== '0';
    $('stripsColor')?.addEventListener('change', (e) => { write(STRIPS, e.target.checked ? '1' : '0'); apply(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
