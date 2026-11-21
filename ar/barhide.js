/* The bars of the system slide away when you scroll DOWN a list and come back when you scroll UP a little, when you are at the top of a page, and when you tap a section or a button of the bars
   (owner 2026-11-21: «متتطبقه عالصفين ده يدي مساحة أكبر», then «عاوز مفتاح للهيدر ومفتاح لكل بوتوم»): THREE switches in ⚙️ الإعدادات, one for each bar:
   the header (on by default), the row of the five spare buttons under the bottom bar (on by default) and the bottom bar itself (off by default: it stays where it is until he asks).
   This file only keeps the choices and puts the classes on <html>: «bars-away» (any bar is away), «hd-away», «sp-away», «bt-away»; ar/airy.css does the sliding and puts the sticky tabs of a section
   up to what is still showing (--sticky-top). */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const AT_TOP = 70, DOWN = 10, UP = 8, LEGACY = 'asker-bars-hide';
  const OPT = { head: ['asker-hide-head', true, 'hideHead'], spare: ['asker-hide-spare', true, 'hideSpare'], bottom: ['asker-hide-bottom', false, 'hideBottom'] };
  let last = root.scrollY || 0, away = false, raf = 0;
  // the choice of one bar, kept on this phone; the one switch of the first version (asker-bars-hide = 0) still turns the header and the spare row off
  function opt(n) {
    const [k, d] = OPT[n];
    try {
      const v = localStorage.getItem(k);
      if (v !== null) return v === '1';
      if (n !== 'bottom' && localStorage.getItem(LEGACY) === '0') return false;
    } catch (e) { /* private window */ }
    return d;
  }
  function apply() {
    const hd = away && opt('head'), sp = away && opt('spare'), bt = away && opt('bottom');
    html.classList.toggle('hd-away', hd);
    html.classList.toggle('sp-away', sp);
    html.classList.toggle('bt-away', bt);
    html.classList.toggle('bars-away', hd || sp || bt);
  }
  function set(on) { if (on === away) return; away = on; apply(); }
  function onScroll() {
    raf = 0;
    const y = Math.max(0, root.scrollY || 0), dy = y - last;
    if (y <= AT_TOP) set(false);
    else if (dy >= DOWN) set(true);
    else if (dy <= -UP) set(false);
    if (Math.abs(dy) >= UP) last = y;
  }
  root.addEventListener('scroll', () => { if (!raf) raf = root.requestAnimationFrame(onScroll); }, { passive: true });
  // a tap on a section or on a button of the bars brings them back; so does focusing something in the header
  document.addEventListener('click', (e) => { if (away && e.target.closest && e.target.closest('.bottomnav, #spareBar, [data-go], .appbar')) set(false); }, true);
  document.addEventListener('focusin', (e) => { if (away && e.target.closest && e.target.closest('.appbar')) set(false); });
  function bindSwitches() {
    Object.keys(OPT).forEach((n) => {
      const box = document.getElementById(OPT[n][2]);
      if (!box) return;
      box.checked = opt(n);
      box.addEventListener('change', () => { try { localStorage.setItem(OPT[n][0], box.checked ? '1' : '0'); } catch (e) { /* private window */ } apply(); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSwitches); else bindSwitches();
  root.AskerBarHide = { set, away: () => away, opt };
})(typeof window === 'undefined' ? globalThis : window);
