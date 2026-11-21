/* The two rows at the top of the system (the header and, for the owner, the five spare buttons) slide away when you scroll DOWN a list and come back when you scroll UP a little,
   when you are at the top of a page, and when you tap a section or a button of the bars (owner 2026-11-21: «متتطبقه عالصفين ده يدي مساحة أكبر»). The bottom bar stays where it is.
   It only toggles the class «bars-away» on <html>; ar/airy.css does the sliding and puts the sticky tabs of a section up under the screen's edge (--sticky-top: 0). */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const AT_TOP = 70, DOWN = 10, UP = 8, KEY = 'asker-bars-hide';
  let last = root.scrollY || 0, away = false, raf = 0;
  // the switch in ⚙️ الإعدادات (owner 2026-11-21: «خليه أوبشن في الإعدادات»): on unless he turned it off; kept on this phone
  const enabled = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } };
  function set(on) { if (on && !enabled()) on = false; if (on === away) return; away = on; html.classList.toggle('bars-away', on); }
  function onScroll() {
    raf = 0;
    const y = Math.max(0, root.scrollY || 0), dy = y - last;
    if (y <= AT_TOP) set(false);
    else if (dy >= DOWN) set(true);
    else if (dy <= -UP) set(false);
    if (Math.abs(dy) >= UP) last = y;
  }
  root.addEventListener('scroll', () => { if (!raf) raf = root.requestAnimationFrame(onScroll); }, { passive: true });
  // a tap on a section or on a button of the bars brings the rows back; so does focusing something in the header
  document.addEventListener('click', (e) => { if (away && e.target.closest && e.target.closest('.bottomnav, [data-go], .appbar')) set(false); }, true);
  document.addEventListener('focusin', (e) => { if (away && e.target.closest && e.target.closest('.appbar')) set(false); });
  function bindSwitch() {
    const box = document.getElementById('barHide');
    if (!box) return;
    box.checked = enabled();
    box.addEventListener('change', () => { try { localStorage.setItem(KEY, box.checked ? '1' : '0'); } catch (e) {} if (!box.checked) set(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSwitch); else bindSwitch();
  root.AskerBarHide = { set, away: () => away, enabled };
})(typeof window === 'undefined' ? globalThis : window);
