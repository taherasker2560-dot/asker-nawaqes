/* The pages update THEMSELVES (owner 2026-11-19 night: «انت سبت السيستم نفسه بكل صفحاته ما اتغيرتش … الشريط اللي تحت لسه برتقالي»): the system stays open on his phone for days,
   so a new version of the code never reached it until somebody closed and reopened the app. This small script is loaded by the system, the customers' app and the suppliers' page:
   - at the start it reads the page's own HTML once (the copy this phone is running) and keeps the ?v= tokens of its scripts and stylesheets;
   - every 5 minutes, and when the page comes back to the screen after being away for a while, it asks the server for the page again (no cache) and compares the tokens;
   - when they differ it reloads the page, but only when that costs nothing: the page is on screen, no field is being typed in, nothing was touched for 20 seconds, no camera is running,
     and the address is not a «share» import in progress. Otherwise it tries again in 30 seconds. At most one automatic reload every 10 minutes (a loop is impossible).
   Nothing is sent anywhere but a GET for the page itself. window.AskerAutoUpdate.check() is for the tests. */
(function (root) {
  'use strict';
  const TAG = /(?:src|href)="((?:ar|store|supplier)\/[\w./-]+\.(?:js|css)\?v=[\w-]+)"/g;
  const sigOfHtml = (html) => [...String(html).replace(/<!--[\s\S]*?-->/g, '').matchAll(TAG)].map((m) => m[1]).sort().join('|');
  const api = { sigOfHtml };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  const EVERY = 5 * 60 * 1000, QUIET = 20 * 1000, RETRY = 30 * 1000, ONCE_IN = 10 * 60 * 1000, KEY = 'asker-autoupd';
  let base = '', lastTouch = Date.now(), hiddenAt = 0, pending = false, timer = 0, busy = false;
  ['pointerdown', 'keydown', 'input', 'touchstart', 'scroll'].forEach((t) => document.addEventListener(t, () => { lastTouch = Date.now(); }, { passive: true, capture: true }));
  const url = () => location.pathname + location.search;
  const recentlyReloaded = () => { try { return Date.now() - Number(sessionStorage.getItem(KEY) || 0) < ONCE_IN; } catch (e) { return false; } };

  function costsNothing() {
    if (document.visibilityState !== 'visible') return false;
    if (Date.now() - lastTouch < QUIET) return false;
    const a = document.activeElement;
    if (a && a !== document.body && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return false;
    for (const v of document.querySelectorAll('video')) if (v.srcObject || (!v.paused && !v.ended)) return false;
    if (/[?&]share=/.test(location.search)) return false;
    return true;
  }
  function apply() {
    clearTimeout(timer);
    if (!pending) return;
    if (recentlyReloaded()) { pending = false; return; } // it did not help last time: no loop
    if (costsNothing()) { try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) {} try { location.reload(); } catch (e) {} return; }
    timer = setTimeout(apply, RETRY);
  }
  async function get(cache) { const r = await fetch(url(), { cache, credentials: 'same-origin' }); return r && r.ok ? sigOfHtml(await r.text()) : ''; }
  // true when the server has a newer version of this page's code
  async function check() {
    if (busy) return pending;
    busy = true;
    try {
      if (!base) base = await get('default'); // the copy this phone is running
      const theirs = base ? await get('no-store') : '';
      if (base && theirs && theirs !== base) { pending = true; apply(); }
    } catch (e) { /* offline: the next time */ } finally { busy = false; }
    return pending;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    // back on the screen after a while: look at once (the system was probably left open for hours)
    if (hiddenAt && Date.now() - hiddenAt > 30 * 1000) { lastTouch = Date.now() - QUIET; check(); }
    if (pending) { lastTouch = Date.now() - QUIET; apply(); }
  });
  setTimeout(check, 3000);
  setInterval(check, EVERY);
  root.AskerAutoUpdate = Object.assign({ check, pending: () => pending, base: () => base, untouched: () => { lastTouch = 0; } }, api); // (untouched: for the tests)
})(typeof window === 'undefined' ? globalThis : window);
