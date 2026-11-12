/* The store site's colors and night look, the same choices as the bot's settings (owner 2026-11-12: «عاوزك تطبقلى نفس
   اعدادات البوت الجديده … بحيث اقدر اغير فيها براحتى او العميل يقدر كمان»).
   - The owner picks the default for every customer from the bot (إعدادات الموقع → ar_store_settings.theme_color/theme_night).
   - A customer can change it on his phone (⚙ on the home page); «رجّع لاختيار الصيدلية» goes back to the owner's choice.
   - The night look is only what was chosen, never the phone's own dark mode.
   Uses the bot's 25 colors and palette (ar/settings.js, loaded first). Loaded in <head> so the color is right before anything shows. */
(function (root) {
  'use strict';
  const S = root.AskerSettings;
  if (!S || typeof document === 'undefined') return;
  const KEY = 'asker-store-accent', NIGHT = 'asker-store-night', DEF = 'asker-store-default';
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private window */ } };
  const owner = () => { try { return JSON.parse(read(DEF, '{}')) || {}; } catch (e) { return {}; } };
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', '); };

  function choice() {
    const o = owner(), mine = read(KEY, ''), nv = read(NIGHT, '');
    const a = mine || o.color || 'asker';
    const p = S.PRESETS.find((x) => x.id === a);
    const hex = p ? p.hex : /^c:#[0-9a-f]{6}$/i.test(a) ? a.slice(2) : S.PRESETS[0].hex;
    return { id: p ? p.id : /^c:/.test(a) ? 'custom' : 'asker', hex, night: nv === '' ? !!o.night : nv === '1', own: !!mine || nv !== '' };
  }
  function apply() {
    const c = choice(), t = S.palette(c.hex, c.night), el = document.documentElement, s = el.style;
    s.setProperty('--accent', t.main);
    s.setProperty('--accent-deep', t.deep);
    s.setProperty('--accent-text', t.ink);
    s.setProperty('--accent-soft', t.soft);
    s.setProperty('--glow', rgb(t.main));
    s.setProperty('--bg', t.tint);
    if (c.night) s.setProperty('--card', t.tint2); else s.removeProperty('--card');
    el.classList.toggle('night', c.night);
    el.dataset.accent = c.id;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', c.night ? t.tint : t.main);
    return c;
  }
  // the owner's default (from ar_store_settings, read by store.js); kept on the phone so the next visit paints right away
  function setDefault(color, night) {
    const o = { color: color || null, night: !!night };
    if (JSON.stringify(o) === JSON.stringify(owner())) return;
    write(DEF, JSON.stringify(o));
    apply(); draw();
  }

  const $ = (id) => document.getElementById(id);
  function draw() {
    const box = $('themePick');
    if (!box) return;
    const c = choice();
    box.innerHTML = S.PRESETS.map((p) => `<button type="button" role="radio" aria-checked="${p.id === c.id}" data-accent="${p.id}" class="accent${p.id === c.id ? ' on' : ''}"><span style="background:${S.palette(p.hex, false).main}"></span>${p.name}</button>`).join('');
    $('themeCustom').value = c.hex;
    $('themeCustomRow').classList.toggle('on', c.id === 'custom');
    $('themeNight').checked = c.night;
    $('themeReset').hidden = !c.own;
  }
  function open(on) {
    const p = $('themeSheet');
    if (!p) return;
    p.hidden = !on;
    document.body.classList.toggle('sheet-open', on);
    $('themeBtn')?.setAttribute('aria-expanded', String(on));
    if (on) { draw(); $('themeClose').focus({ preventScroll: true }); }
  }
  function bind() {
    if (!$('themeSheet')) return;
    $('themeBtn')?.addEventListener('click', () => open(true));
    $('themeSheet').addEventListener('click', (e) => { if (e.target.closest('[data-theme-close]')) open(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('themeSheet').hidden) open(false); });
    $('themePick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-accent]');
      if (!b) return;
      write(KEY, b.dataset.accent); apply(); draw();
    });
    const custom = (e) => { if (!/^#[0-9a-f]{6}$/i.test(e.target.value)) return; write(KEY, 'c:' + e.target.value.toLowerCase()); apply(); draw(); };
    $('themeCustom').addEventListener('input', custom);
    $('themeCustom').addEventListener('change', custom);
    $('themeNight').addEventListener('change', (e) => { write(NIGHT, e.target.checked ? '1' : '0'); apply(); draw(); });
    $('themeReset').addEventListener('click', () => { write(KEY, null); write(NIGHT, null); apply(); draw(); });
  }
  apply(); // before the page paints
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  root.AskerStoreTheme = { apply, choice, setDefault, open };
})(typeof window === 'undefined' ? globalThis : window);
