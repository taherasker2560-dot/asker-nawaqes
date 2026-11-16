/* The bot's motion (owner 2026-11-16, «كبسولة وموجة»; the look itself is ar/capsule.css). Three small things, none of them changes what the page says:
   1. the home's parts rise one after another the first time it shows (the class «fresh» on #homePanel for a second);
   2. the two numbers under the greeting (#kShort, #kOrdered) count up to their value once, the first time they get one;
   3. the bottom bar's color pill slides to the section you are in (--ind-x / --ind-w on .bottomnav, drawn by capsule.css).
   «Reduce motion» = none of it. A browser driven by a test (navigator.webdriver) shows the final numbers at once, because the
   tests read them; window.__askerMotion = true forces the motion on (the motion's own test). Never adds text. */
(function (root) {
  'use strict';

  // «1,250.5 ج» → the first number of a line and what is around it
  function countParts(text) {
    const s = String(text == null ? '' : text);
    const m = /\d[\d,]*(?:\.\d+)?/.exec(s);
    if (!m) return null;
    const value = parseFloat(m[0].replace(/,/g, ''));
    if (!(value > 0)) return null;
    return { before: s.slice(0, m.index), after: s.slice(m.index + m[0].length), value, decimals: (m[0].split('.')[1] || '').length, comma: m[0].indexOf(',') >= 0 };
  }
  // the line while counting: p from 0 to 1 (an ease-out), at 1 exactly the original number
  function shown(parts, p) {
    const k = p >= 1 ? 1 : 1 - Math.pow(1 - Math.max(0, p), 3);
    let t = (parts.value * k).toFixed(parts.decimals);
    if (parts.comma) { const [i, d] = t.split('.'); t = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : ''); }
    return parts.before + t + parts.after;
  }
  const api = { countParts, shown };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') { root.AskerMotion = api; return; }
  root.AskerMotion = api;

  const reduce = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const still = () => reduce || (navigator.webdriver && !root.__askerMotion);
  // the endless decorations (the wave, the floating capsules) cost a frame every frame; a test-driven browser (software drawing) gets slow and
  // its timing-sensitive tests flaky, so there they stay still (the class «cap-still»; «reduce motion» does the same in the CSS)
  if (still()) document.documentElement.classList.add('cap-still');

  function countUp(el, done) {
    const text = el.textContent, parts = countParts(text);
    if (!parts) { done(); return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = shown(parts, p);
      if (p < 1) requestAnimationFrame(step); else done();
    };
    el.textContent = shown(parts, 0);
    requestAnimationFrame(step);
  }
  // an element that shows «—» and later gets its number: it counts up the first time only
  function watchNumber(el) {
    let done = false, busy = false;
    const check = () => {
      if (done || busy || !countParts(el.textContent)) return;
      done = true;
      if (still()) return;
      busy = true;
      countUp(el, () => { busy = false; });
    };
    new MutationObserver(check).observe(el, { childList: true, characterData: true, subtree: true });
    check();
  }

  function watchHome() {
    const home = document.getElementById('homePanel');
    if (!home) return;
    let timer = 0, shownNow = false;
    const check = () => {
      const on = !home.classList.contains('hidden');
      if (!on) { shownNow = false; return; }
      if (shownNow) return;
      shownNow = true;
      if (still()) return;
      home.classList.add('fresh');
      clearTimeout(timer);
      timer = setTimeout(() => home.classList.remove('fresh'), 1200);
    };
    new MutationObserver(check).observe(home, { attributes: true, attributeFilter: ['class'] });
    check();
    ['kShort', 'kOrdered'].forEach((id) => { const el = document.getElementById(id); if (el) watchNumber(el); });
  }

  function placePill() {
    const bar = document.querySelector('.bottomnav');
    if (!bar) return;
    const on = bar.querySelector('button:not(.secondary)');
    if (!on || !on.offsetWidth) { bar.style.setProperty('--ind-o', '0'); return; }
    const b = bar.getBoundingClientRect(), a = on.getBoundingClientRect();
    const first = !document.documentElement.classList.contains('cap-ind');
    if (first || still()) bar.classList.add('no-tr');
    bar.style.setProperty('--ind-x', (a.left - b.left) + 'px');
    bar.style.setProperty('--ind-w', a.width + 'px');
    bar.style.setProperty('--ind-o', '1');
    document.documentElement.classList.add('cap-ind');
    if (bar.classList.contains('no-tr')) requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.remove('no-tr')));
  }
  function watchBar() {
    const bar = document.querySelector('.bottomnav');
    if (!bar) return;
    let queued = false;
    const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; placePill(); }); };
    new MutationObserver(later).observe(bar, { attributes: true, subtree: true, attributeFilter: ['class', 'hidden'] });
    // the bar is inside #app: it shows after the sign-in, so its place is taken again then
    const app = document.getElementById('app');
    if (app) new MutationObserver(later).observe(app, { attributes: true, attributeFilter: ['class'] });
    root.addEventListener('resize', later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
    later();
  }

  function start() { watchHome(); watchBar(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof window === 'undefined' ? globalThis : window);
