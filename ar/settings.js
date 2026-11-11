/* Settings (asker-nawaqes-arabic.html, owner 2026-11-12): the bot's color, chosen from 8 («كل يوم اغيره بلون»), kept on this
   phone only (localStorage), plus the language choice (English comes later, the button is there but off).
   Loaded first, so the color is right before anything shows. */
(function (root) {
  'use strict';
  // each color sets the page's main tokens (ar/app.css :root); «ليلي» also turns the page dark
  const ACCENTS = [
    { id: 'crimson', name: 'عنابي', main: '#7d1028', deep: '#560a1b', ink: '#6a0d22', soft: '#f7e9ec', line: '#ead2d8' },
    { id: 'blue', name: 'أزرق', main: '#1d4f91', deep: '#123563', ink: '#173f75', soft: '#e7eef8', line: '#cddbef' },
    { id: 'green', name: 'أخضر', main: '#1d6f48', deep: '#124a2f', ink: '#185c3b', soft: '#e4f3eb', line: '#c8e4d4' },
    { id: 'purple', name: 'بنفسجي', main: '#5b3a8c', deep: '#3d2661', ink: '#4c3075', soft: '#efe9f7', line: '#dcd0ec' },
    { id: 'teal', name: 'تركواز', main: '#0e6b72', deep: '#08474c', ink: '#0b5a60', soft: '#e2f2f3', line: '#c4e3e5' },
    { id: 'orange', name: 'برتقالي', main: '#a8501a', deep: '#733510', ink: '#8c4315', soft: '#fbede3', line: '#f0d6c4' },
    { id: 'gray', name: 'رمادي', main: '#3f4650', deep: '#2a2f36', ink: '#353b44', soft: '#eceef1', line: '#d8dce1' },
    { id: 'night', name: 'ليلي', main: '#6d4fc2', deep: '#2a2140', ink: '#c9b8ff', soft: '#2d2740', line: '#3d3555', dark: true },
  ];
  const KEY = 'asker-accent';
  const byId = (id) => ACCENTS.find((a) => a.id === id) || ACCENTS[0];
  function read() { try { return localStorage.getItem(KEY) || 'crimson'; } catch (e) { return 'crimson'; } }
  function write(id) { try { localStorage.setItem(KEY, id); } catch (e) {} }
  function apply(id) {
    const a = byId(id), s = document.documentElement.style;
    s.setProperty('--crimson', a.main);
    s.setProperty('--crimson-deep', a.deep);
    s.setProperty('--crimson-ink', a.ink);
    s.setProperty('--rose', a.soft);
    s.setProperty('--rose-line', a.line);
    document.documentElement.dataset.accent = a.id;
    document.documentElement.classList.toggle('night', !!a.dark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', a.dark ? a.deep : a.main);
    return a;
  }
  root.AskerSettings = { ACCENTS, apply, current: read };
  if (typeof document === 'undefined') return;
  apply(read()); // before the page paints

  const $ = (id) => document.getElementById(id);
  function drawPick() {
    const box = $('accentPick');
    if (!box) return;
    const cur = read();
    box.innerHTML = ACCENTS.map((a) => `<button type="button" role="radio" aria-checked="${a.id === cur}" data-accent="${a.id}" class="accent${a.id === cur ? ' on' : ''}"><span style="background:${a.dark ? '#17161a' : a.main}"></span>${a.name}</button>`).join('');
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
      write(b.dataset.accent);
      apply(b.dataset.accent);
      drawPick();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
