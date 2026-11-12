/* English for the bot (owner 2026-11-12, choice «أ»): every screen and the item names in English; the phone's voice and the
   WhatsApp messages to the warehouses stay Arabic. Loaded in <head> right after its dictionary (ar/i18n-en.js), so in English
   the page is translated while it is being built (no Arabic flash). Arabic (the default) = nothing here runs.
   How a text is translated, in order:
     1) the exact text is in the dictionary;
     2) a text with numbers or names inside matches one of the code's templates («{0} من {1} صنف في الطلب…»);
     3) the text is made only of known pieces («آخر خصم 30% · قايمة 08/11»).
   A text that still has an unknown Arabic word after 3) is left exactly as it is: an item's Arabic name, a warehouse's own
   line, a WhatsApp message or a customer's note never comes out half translated. Message boxes (textarea) are never touched.
   The choice is kept on this phone (localStorage «asker-lang»); switching reloads the page. */
(function (root) {
  'use strict';
  const KEY = 'asker-lang';
  const AR = /[؀-ۿ]/;
  const read = () => { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ar'; } catch (e) { return 'ar'; } };
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // ---------- the dictionary, ready to use ----------
  function compile(src) {
    const exact = new Map(), pats = [];
    for (const [a, e] of Object.entries((src && src.exact) || {})) {
      const k = norm(a);
      if (!k || typeof e !== 'string') continue;
      if (!/\{\d+\}/.test(k)) { exact.set(k, e); continue; }
      // a template: its fixed words must match; each {n} takes the shortest text that fits
      const fixed = k.replace(/\{\d+\}/g, '');
      if ((fixed.match(/[؀-ۿ]/g) || []).length < 3) continue; // too little to recognise it safely
      const order = [];
      const re = k.split(/(\{\d+\})/).map((p) => { const m = /^\{(\d+)\}$/.exec(p); if (m) { order.push(+m[1]); return '(.+?)'; } return escRe(p); }).join('');
      pats.push({ re: new RegExp('^' + re + '$'), order, en: e, len: fixed.length });
    }
    pats.sort((x, y) => y.len - x.len); // the most specific template first
    const ph = Object.entries((src && src.phrases) || {}).map(([a, e]) => [norm(a), e]).filter(([a, e]) => AR.test(a) && a.length >= 2 && typeof e === 'string');
    // the exact texts can serve as pieces too (a label joined with a number: «النواقص 492»)
    for (const [a, e] of exact) if (a.length >= 3 && a.length <= 40 && !ph.some(([x]) => x === a)) ph.push([a, e]);
    ph.sort((x, y) => y[0].length - x[0].length);
    const phMap = new Map(ph);
    const phRe = ph.length ? new RegExp(ph.map(([a]) => escRe(a)).join('|'), 'g') : null;
    return { exact, pats, phMap, phRe };
  }

  let D = null;
  const cache = new Map();
  // only pieces: accepted when no Arabic is left
  function pieces(k) {
    if (!D.phRe) return null;
    // the clock and money first: «4:30 م» → «4:30 PM», «30 ج» → «30 EGP», Arabic digits → 0-9
    k = k.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/(\d{1,2}:\d\d)\s*ص(?![؀-ۿ])/g, '$1 AM').replace(/(\d{1,2}:\d\d)\s*م(?![؀-ۿ])/g, '$1 PM')
      .replace(/(\d[\d,.]*)\s*ج(?![؀-ۿ])/g, '$1 EGP');
    const r = k.replace(D.phRe, (a) => D.phMap.get(a));
    return AR.test(r) ? null : r.replace(/\s+([،,.:])/g, '$1').replace(/،/g, ',').replace(/؟/g, '?').replace(/؛/g, ';');
  }
  // a value inside a template: a known word is translated, anything else (a name, a number) stays
  function piece(v) {
    if (!AR.test(v)) return v;
    const k = norm(v);
    return D.exact.get(k) ?? pieces(k) ?? v;
  }
  function translate(text) {
    if (!D || !text || !AR.test(text)) return text;
    const k = norm(text);
    let out = cache.get(k);
    if (out === undefined) {
      out = D.exact.get(k);
      if (out == null) {
        for (const p of D.pats) {
          const m = p.re.exec(k);
          if (m) { out = p.en.replace(/\{(\d+)\}/g, (_, n) => { const i = p.order.indexOf(+n); return i >= 0 ? piece(m[i + 1]) : ''; }); break; }
        }
      }
      if (out == null) out = pieces(k);
      if (out == null) out = k; // unknown: left as it is (the test lists these)
      if (cache.size > 8000) cache.clear();
      cache.set(k, out);
    }
    if (out === k) return text;
    return (/^\s/.test(text) ? ' ' : '') + out + (/\s$/.test(text) ? ' ' : '');
  }

  // ---------- the page ----------
  // never touched: scripts, styles, message boxes, anything marked translate="no"; and the Arabic item names themselves (only
  // their own text: a tag inside the row, like «لسه ماتترجمش», is still translated)
  const SKIP = 'script,style,textarea,[translate="no"],.notr';
  const NAMES = '.sr-ar,.hs-names > strong,.st-item > strong';
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  function attrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && AR.test(v)) { const t = translate(v); if (t !== v) el.setAttribute(a, t); }
    }
  }
  function textNode(n) {
    const p = n.parentElement;
    if (!p || p.closest(SKIP) || p.matches(NAMES)) return;
    const v = n.nodeValue;
    if (!AR.test(v)) return;
    const t = translate(v);
    if (t !== v) n.nodeValue = t;
  }
  function walk(rootNode) {
    if (rootNode.nodeType === 3) return textNode(rootNode);
    if (rootNode.nodeType !== 1 || rootNode.closest(SKIP)) return;
    attrs(rootNode);
    const w = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (x) => (x.nodeType === 1 && x.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let x;
    while ((x = w.nextNode())) { if (x.nodeType === 3) textNode(x); else attrs(x); }
  }
  function start() {
    D = compile(root.AskerEN);
    const html = document.documentElement;
    html.lang = 'en';
    html.dir = 'ltr';
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') textNode(m.target);
        else if (m.type === 'attributes' && m.target.nodeType === 1 && !m.target.closest(SKIP)) attrs(m.target);
      }
      if (AR.test(document.title)) document.title = translate(document.title);
    }).observe(html, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    if (document.body) walk(document.body);
    if (AR.test(document.title)) document.title = translate(document.title);
  }

  // ---------- the switch in the settings sheet ----------
  function bindSwitch() {
    const now = read();
    document.querySelectorAll('[data-lang]').forEach((b) => {
      b.disabled = false;
      b.classList.toggle('secondary', b.dataset.lang !== now);
      b.setAttribute('aria-pressed', String(b.dataset.lang === now));
      b.addEventListener('click', () => { if (b.dataset.lang !== read()) set(b.dataset.lang); });
    });
  }
  function set(l) {
    try { localStorage.setItem(KEY, l === 'en' ? 'en' : 'ar'); } catch (e) {}
    location.reload();
  }

  root.AskerI18n = { lang: read, set, translate: (t) => translate(t), compile, _use: (src) => { D = compile(src); cache.clear(); } };
  if (typeof document === 'undefined') return;
  if (read() === 'en') start();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSwitch);
  else bindSwitch();
})(typeof window === 'undefined' ? globalThis : window);
