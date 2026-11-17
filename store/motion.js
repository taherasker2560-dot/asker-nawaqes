/* The store's motion (owner 2026-11-16, «كبسولة وموجة»; the look itself is store/capsule.css). Three small things, none of them changes what the page says:
   1. the account's balance counts up to its number once, when the account first shows (the text ends exactly as the page wrote it);
   2. the account's cards rise one after another the first time they show (the class «fresh» on #acctBox for a second);
   3. the bottom bar's color pill slides to the page you are on (--ind-x / --ind-w on .tabbar, drawn by capsule.css).
   «Reduce motion» = none of it. A browser driven by a test (navigator.webdriver) shows the final numbers at once, because the
   tests read them; window.__askerMotion = true forces the motion on (the motion's own test). Never adds text. */
(function (root) {
  'use strict';

  // «عليك 1,250.5 ج» → the first number of a line and what is around it
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
  if (typeof document === 'undefined') { root.AskerStoreMotion = api; return; }
  root.AskerStoreMotion = api;

  const reduce = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const still = () => reduce || (navigator.webdriver && !root.__askerMotion);

  function countUp(el) {
    const text = el.textContent, parts = countParts(text);
    if (!parts) return;
    const t0 = performance.now(), dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = shown(parts, p);
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = shown(parts, 0);
    requestAnimationFrame(step);
  }

  function watchAccount() {
    const box = document.getElementById('acctBox'), view = document.querySelector('[data-view="account"]');
    if (!box) return;
    let seen = false, timer = 0;
    const check = () => {
      if (!box.querySelector('.ac-bal')) { if (!box.querySelector('.ac-tabs')) seen = false; return; }   // another tab of the account (no balance card) is not «leaving»: going back to the home does not play it again
      if (seen) return;
      seen = true;
      if (still()) return;
      box.classList.add('fresh');
      clearTimeout(timer);
      timer = setTimeout(() => box.classList.remove('fresh'), 1200);
      const big = box.querySelector('.ac-big');
      if (big) countUp(big);
    };
    new MutationObserver(check).observe(box, { childList: true });
    check(); // the account may be drawn before this runs
    // leaving the account and coming back shows it again
    if (view) new MutationObserver(() => { if (view.hidden) seen = false; }).observe(view, { attributes: true, attributeFilter: ['hidden'] });
  }

  function placePill() {
    const bar = document.querySelector('.tabbar');
    if (!bar) return;
    const on = bar.querySelector('a.on:not([hidden])');
    if (!on) { bar.style.setProperty('--ind-o', '0'); return; }
    const b = bar.getBoundingClientRect(), a = on.getBoundingClientRect();
    if (!a.width) return;
    const first = !document.documentElement.classList.contains('cap-ind');
    if (first || still()) bar.classList.add('no-tr');
    bar.style.setProperty('--ind-x', (a.left - b.left) + 'px');
    bar.style.setProperty('--ind-w', a.width + 'px');
    bar.style.setProperty('--ind-o', '1');
    document.documentElement.classList.add('cap-ind');
    if (bar.classList.contains('no-tr')) requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.remove('no-tr')));
  }
  function watchBar() {
    const bar = document.querySelector('.tabbar');
    if (!bar) return;
    let queued = false;
    const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; placePill(); }); };
    new MutationObserver(later).observe(bar, { attributes: true, subtree: true, attributeFilter: ['class', 'hidden'] });
    root.addEventListener('resize', later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
    later();
  }

  function start() { watchAccount(); watchBar(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof window === 'undefined' ? globalThis : window);
