/* «الرئيسية»: the quick buttons are his own (owner 2026-11-15, his idea of 11-14: «اقدر من السيستم اشيل النواقص من الرئيسية،
   واحط اي حاجة تانية … لحد 10 12 حاجه يبقوا في الوش»; mockup mockups/home_shortcuts_2026-11-15.html, «أيوه، ابدأ»).
   1) the grid under the numbers shows the sections he picked, up to 12, in his order (the first time: the six it always had);
   2) «✏️ عدّل الزراير» opens a sheet: the ones on the home in their order (▲ ▼ ✕), then every other section by group (+ ضيف);
   3) inside every section a 📌 at the end of its small tabs puts it on the home or takes it off (with «شيله» / «رجّعه»).
   Kept on this phone (localStorage); writes nothing to the server. Staff never see this home (they have their own).
   2026-11-19 (owner: «ارتب التابات اللي في الرئيسية … دوسة طويلة على التاب وأسحبه لأي مكان في الترتيب … عدد التابات لحد 30 … وتزود القايمة بناء على الشغل الجديد»):
   4) up to 30 buttons (was 12);
   5) press and HOLD a button on the home (about half a second): it lifts, follows the finger, the others make room, let go where you want it; a quick tap still opens the section;
   6) the list of what a button can open also has the new screens that live inside a section (المستخدمين، إعدادات الموقع، أصناف جديدة، مقارنة الطلبيات، فاتورة المندوب، كشف المرتجعات):
      such a button opens the section and scrolls to that screen.
   7) the work apps on his phone (owner 2026-11-19, ar/work-apps.js: واتساب بيزنس، الكاميرات، ابن سينا، فارما، دراج آي، الجرعات، إنستا باي) are buttons too:
      their button carries data-app (the app opens) instead of data-go (a section).
   8) «ألوان الأقسام» (owner 2026-11-19, ar/look.css): each button carries data-sec (the section it belongs to: purchases / accounts / home / sales / care) and wears that
      section's shade of the system color; a work app has a thick border in the shade of the section it serves.
   9) the same night, second round (owner: «زراير ملوّنة كاملة … والحاجة اللي خاصة بالمشتريات تبقى عليها علامة المشتريات»): the button is FILLED with the shade, and a small white mark
      on its top edge (i.qa-mk) is the section's own icon of the bottom bar. */
(function (root) {
  'use strict';
  const MAX = 30;
  const KEY = 'asker-home-buttons';
  const DEFAULT = ['short', 'read', 'drafts', 'docs', 'tempsale', 'stock'];
  // [tab, label, group, icon]: every section a button can open (the tabs of ar/app.js showTab)
  const ALL = [
    ['short', 'النواقص', 'المشتريات', 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'],
    ['read', 'الوارد', 'المشتريات', 'M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13h5l1 2h4l1-2h5'],
    ['translate', 'الترجمة', 'المشتريات', 'M4 5h8M8 3v2M5 9c1.5 3 4 5 7 6M11 5c-1 4-3.5 7-7 9M13 21l4-9 4 9M14.5 18h5'],
    ['bags', 'الحقائب', 'المشتريات', 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2'],
    ['drafts', 'الطلبيات', 'المشتريات', 'M4 5h2l2 10h10l2-7H7M10 19a1 1 0 1 0 0 .01M17 19a1 1 0 1 0 0 .01'],
    ['docs', 'الفواتير', 'المشتريات', 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5'],
    ['review', 'مراجعة الفواتير', 'المشتريات', 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h3M13 12l1.5 1.5L17 11', 'docs', 'reviewPanel'],
    ['wait', 'الانتظار', 'المشتريات', 'M6 3h12v4a6 6 0 0 1-3 5.2 6 6 0 0 1 3 5.2V21H6v-3.6A6 6 0 0 1 9 12.2 6 6 0 0 1 6 7zM9 6h6'],
    ['suppliers', 'قوايم المخازن', 'المشتريات', 'M3 21V9l9-5 9 5v12M7 21v-7h10v7M7 17h10'],
    ['stock', 'المخزون', 'المشتريات', 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9'],
    ['count', 'جرد المخزون', 'المشتريات', 'M9 4h6v3H9zM15 6h3v15H6V6h3M9 13l2 2 4-4'],
    ['expiry', 'الصلاحيات', 'المشتريات', 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18'],
    ['customers', 'العملاء', 'الحسابات', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7'],
    ['vendors', 'الموردين', 'الحسابات', 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0 .01M17 19a2 2 0 1 0 0 .01'],
    ['cash', 'الخزن', 'الحسابات', 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h12M16 13h3'],
    ['pay', 'المدفوعات', 'الحسابات', 'M3 8h18v10H3zM3 12h18M7 16h3M17 4l-3 3M17 4l3 3M17 4v5'],
    ['ops', 'العمليات', 'الحسابات', 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3M5 11a7 7 0 0 0 14 0M12 18v3'],
    ['storeorders', 'الموقع', 'المبيعات', 'M4 9l1.5-5h13L20 9M4 9h16v11H4zM9 20v-6h6v6'],
    ['tempsale', 'البيع المؤقت', 'المبيعات', 'M4 7h16v12H4zM8 7V5h8v2M8 12h8M8 15h5'],
    ['care', 'الرسايل', 'خدمة العملاء', 'M4 5h16v11H9l-5 4z'],
    // «📊 التقارير» (owner 2026-11-26): its page and the reports that are screens of their own (ar/reports.js)
    ['reports', 'التقارير', 'التقارير', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
    ['day', 'اليوم', 'التقارير', 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4'],
    ['profit', 'الربح والهامش', 'التقارير', 'M4 19h16M5 15l5-5 4 3 5-6'],
    ['dayclose', 'تقفيل اليوم', 'التقارير', 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z'],
    ['stockval', 'قيمة المخزون', 'التقارير', 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9'],
    ['sales', 'حركة البيع', 'التقارير', 'M4 19h16M7 16V10M12 16V6M17 16v-4'],
    // the screens that live INSIDE a section (owner 2026-11-19): [id, label, group, icon, the section it opens, the block it scrolls to]
    ['users', 'المستخدمين', 'المبيعات', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0', 'storeorders', 'siteUsers'],
    ['sitesettings', 'إعدادات الموقع', 'المبيعات', 'M4 8h9M17 8h3M4 16h3M11 16h9M15 5v6M7 13v6', 'storeorders', 'storeSettings'],
    ['newitems', 'أصناف جديدة', 'المشتريات', 'M5 4h14v16H5zM12 9v6M9 12h6', 'short', 'niBox'],
    ['compare', 'مقارنة الطلبيات', 'المشتريات', 'M7 4v16M17 4v16M4 8l3-4 3 4M14 16l3 4 3-4', 'drafts', 'cmpBox'],
    ['repinv', 'فاتورة المندوب', 'المشتريات', 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6', 'drafts', 'repBox'],
    ['returns', 'كشف المرتجعات', 'الحسابات', 'M9 6L4 11l5 5M4 11h10a5 5 0 0 1 0 10h-2', 'vendors', 'rtBox'],
    ['sitelink', 'رابط الموقع', 'المبيعات', 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1', 'storeorders', 'storeLink'],
    ['sitepay', 'الدفع بتحويل', 'المبيعات', 'M3 8h18v10H3zM3 12h18M7 16h3', 'storeorders', 'ssPayBox'],
    ['sitelook', 'شكل الموقع', 'المبيعات', 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2.2-.6-1.4.2-2.8 1.8-2.8H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01', 'storeorders', 'ssThemeBox'],
    ['ordneeds', 'محتاج قرارك', 'المشتريات', 'M12 8v5M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'drafts', 'stBox'],
    ['ordnew', 'جديد في أمر الشراء', 'المشتريات', 'M4 5h2l2 10h10l2-7H7M12 8v5M9.5 10.5h5', 'drafts', 'odNewBox'],
    ['whofrom', 'الصنف جه من مين', 'الحسابات', 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-4.3-4.3M11 8v3l2 1', 'vendors', 'veFindBox'],
    ['todo', 'محتاج شغل', 'الرئيسية', 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9', 'home', 'todoCard'],
    ['notes', 'ملاحظاتي', 'الرئيسية', 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5', 'home', 'notesCard'],
    // the work apps on his phone (owner 2026-11-19, ar/work-apps.js): [id, label, group, icon, , , the app it opens]
    ['app_wab', 'واتساب بيزنس', 'تطبيقات الشغل', 'M4 20l1.3-3.9A8 8 0 1 1 8 19zM9 10h.01M12 10h.01M15 10h.01', '', '', 'wab'],
    ['app_cams', 'الكاميرات', 'تطبيقات الشغل', 'M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8', '', '', 'cams'],
    ['app_ibnsina', 'ابن سينا', 'تطبيقات الشغل', 'M4 21V7l8-4 8 4v14M10 21v-5h4v5M12 7v4M10 9h4', '', '', 'ibnsina'],
    ['app_pharma', 'فارما', 'تطبيقات الشغل', 'M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7zM8.5 8.5l7 7', '', '', 'pharma'],
    ['app_drugeye', 'دراج آي', 'تطبيقات الشغل', 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6', '', '', 'drugeye'],
    ['app_doses', 'الجرعات', 'تطبيقات الشغل', 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01', '', '', 'doses'],
    ['app_instapay', 'إنستا باي', 'تطبيقات الشغل', 'M3 6h18v12H3zM3 10h18M7 15h4', '', '', 'instapay'],
  ];
  const LABEL = Object.fromEntries(ALL.map((x) => [x[0], x[1]]));
  const ICON = Object.fromEntries(ALL.map((x) => [x[0], x[3]]));
  // what a button opens: its own section, or (for a screen inside a section) that section and the block to scroll to
  const TAB_OF = Object.fromEntries(ALL.map((x) => [x[0], x[4] || x[0]]));
  const ANCHOR_OF = Object.fromEntries(ALL.filter((x) => x[5]).map((x) => [x[0], x[5]]));
  // a work app on the phone (ar/work-apps.js opens it): the button carries data-app instead of a section
  const APP_OF = Object.fromEntries(ALL.filter((x) => x[6]).map((x) => [x[0], x[6]]));
  const GROUPS = [...new Set(ALL.map((x) => x[2]))];
  // «ألوان الأقسام» (owner 2026-11-19, ar/look.css): the section a button belongs to decides its shade of the system color; a work app wears the shade of the section it serves
  const SEC_OF_GROUP = { 'المشتريات': 'purchases', 'الحسابات': 'accounts', 'المبيعات': 'sales', 'خدمة العملاء': 'care', 'الرئيسية': 'home', 'التقارير': 'home' };
  const APP_SEC = { wab: 'care', cams: 'home', ibnsina: 'purchases', pharma: 'purchases', drugeye: 'home', doses: 'home', instapay: 'accounts' };
  const SEC = Object.fromEntries(ALL.map((x) => [x[0], x[6] ? APP_SEC[x[6]] || 'home' : SEC_OF_GROUP[x[2]] || 'home']));
  // the small white mark on every button = its section's own icon of the bottom bar (owner 2026-11-19: «الحاجة اللي خاصة بالمشتريات تبقى عليها علامة المشتريات»);
  // the same paths as the five buttons of the bar in asker-nawaqes-arabic.html
  const SEC_ICON = {
    purchases: 'M4 5h2l2 10h10l2-7H7M10 19a1 1 0 1 0 0 .01M17 19a1 1 0 1 0 0 .01',
    accounts: 'M5 4h11l3 3v13H5zM9 9h6M9 13h6M9 17h4',
    home: 'M4 11l8-6.5 8 6.5M6 9.5V19a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1V9.5',
    sales: 'M4 19h16M7 16V10M12 16V6M17 16v-4',
    care: 'M4 13a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-2v-6h4M4 13v4a2 2 0 0 0 2 2h2v-6H4',
  };

  // ---------- pure helpers (tests/home-shortcuts.cjs) ----------
  // known sections only, each once, at most 30
  function clean(list) {
    const out = [];
    for (const t of Array.isArray(list) ? list : []) if (LABEL[t] && !out.includes(t) && out.length < MAX) out.push(t);
    return out;
  }
  // what the phone kept; nothing kept (or something broken) = the six the home always had. An empty list is his choice.
  function parse(raw) {
    if (raw == null || raw === '') return DEFAULT.slice();
    try { const v = JSON.parse(raw); return Array.isArray(v) ? clean(v) : DEFAULT.slice(); } catch (e) { return DEFAULT.slice(); }
  }
  // on → off, off → on (at the end); a 31st is refused
  function toggle(list, tab) {
    if (!LABEL[tab]) return { list, changed: false };
    if (list.includes(tab)) return { list: list.filter((t) => t !== tab), changed: true, added: false };
    if (list.length >= MAX) return { list, changed: false, full: true };
    return { list: [...list, tab], changed: true, added: true };
  }
  // one place up (dir -1) or down (+1)
  function move(list, tab, dir) {
    const i = list.indexOf(tab), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const out = list.slice();
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  }
  // «الخانات الاحتياطي» (owner 2026-11-21: «٥ أزرار احتياطيين تحت الهيدر»; the system's owner only): five slots under the header, each EMPTY (a dashed «+») or holding one of the sections above
  const SPARE_KEY = 'asker-spare-buttons', SPARE_N = 5;
  function spareParse(raw) {
    let v = null;
    try { v = JSON.parse(raw); } catch (e) { /* nothing kept */ }
    const out = Array.isArray(v) ? v.slice(0, SPARE_N) : [];
    while (out.length < SPARE_N) out.push(null);
    return out.map((t) => (typeof t === 'string' && LABEL[t] ? t : null));
  }
  // «الزرار السادس» (owner 2026-11-26: «هيبقى هو ده الزرار السادس، ده بتاع التقارير»): the first slot is always «التقارير». What he had there moves to the first empty slot (with none empty it stays
  // reachable from its own section and the picker); «التقارير» picked into another slot before this is taken out of it.
  const FIXED = 'reports';
  function pinReports(list) {
    const out = list.slice(0, SPARE_N).map((t, i) => (i && t === FIXED ? null : t));
    const had = out[0];
    out[0] = FIXED;
    if (had && had !== FIXED && !out.slice(1).includes(had)) { const j = out.indexOf(null, 1); if (j > 0) out[j] = had; }
    return out;
  }
  const api = { MAX, KEY, DEFAULT, ALL, LABEL, TAB_OF, ANCHOR_OF, APP_OF, SEC, APP_SEC, SPARE_KEY, SPARE_N, FIXED, clean, parse, toggle, move, spareParse, pinReports };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  let mine = DEFAULT.slice();
  try { mine = parse(localStorage.getItem(KEY)); } catch (e) {}
  let current = 'home';
  let toastTimer = 0;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch (e) {} };

  // 1) the home's grid
  function drawHome() {
    const box = document.querySelector('#homePanel .qa');
    if (!box) return;
    // data-go = the section it opens, data-qa = which button it is (the order after a drag is read from these), data-anchor = the block to scroll to
    box.innerHTML = mine.map((t) => `<button type="button" ${APP_OF[t] ? `data-app="${APP_OF[t]}" class="qa-app"` : `data-go="${TAB_OF[t]}"`} data-qa="${t}" data-sec="${SEC[t]}"${ANCHOR_OF[t] ? ` data-anchor="${ANCHOR_OF[t]}"` : ''}>${svg(ICON[t])}<span>${esc(LABEL[t])}</span><i class="qa-mk" aria-hidden="true">${svg(SEC_ICON[SEC[t]] || SEC_ICON.home)}</i></button>`).join('');
    box.classList.toggle('qa-none', !mine.length);
  }

  // ---------- press and hold, then drag a button where he wants it (owner 2026-11-19) ----------
  // A quick tap opens the section as before. About half a second of holding (a finger that moves before that is only scrolling) lifts the button:
  // a copy follows the finger, the real one stays as a dashed place-holder and moves between the others, the page scrolls itself near the top / bottom edge
  // (thirty buttons are more than a screen), and where he lets go is the new order, kept on this phone.
  const HOLD_MS = 450, SLOP = 9, EDGE = 90, BOTTOM = 160, STEP = 14;
  let press = null, drag = null, swallowUntil = 0;
  const homeBox = () => document.querySelector('#homePanel .qa');
  const buttonsOf = (box) => [...box.querySelectorAll(':scope > button[data-qa]')].filter((b) => !b.classList.contains('qa-ghost'));
  function endPress() { if (press) { clearTimeout(press.timer); press = null; } }
  function lift() {
    const p = press, box = homeBox();
    press = null;
    if (!p || !box || !p.el.isConnected) return;
    const r = p.el.getBoundingClientRect();
    const ghost = p.el.cloneNode(true);
    ghost.classList.add('qa-ghost');
    ['data-go', 'data-qa', 'data-anchor', 'data-app'].forEach((a) => ghost.removeAttribute(a)); // (data-sec stays: the copy keeps its color)
    ghost.setAttribute('aria-hidden', 'true');
    ghost.tabIndex = -1;
    ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:60;pointer-events:none`;
    box.appendChild(ghost);
    p.el.classList.add('qa-ph');
    document.body.classList.add('qa-dragging');
    drag = { el: p.el, ghost, pid: p.pid, dx: p.x - r.left, dy: p.y - r.top, x: p.x, y: p.y, scroller: setInterval(autoScroll, 16) };
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* no vibration here */ }
  }
  // the copy follows the finger; the place-holder takes the place of the button the finger is over (a swap, so it never flickers back and forth)
  function place() {
    const d = drag;
    if (!d) return;
    d.ghost.style.left = d.x - d.dx + 'px';
    d.ghost.style.top = d.y - d.dy + 'px';
    const under = document.elementFromPoint(d.x, d.y);
    const t = under && under.closest ? under.closest('#homePanel .qa > button[data-qa]') : null;
    if (!t || t === d.el || t.classList.contains('qa-ghost')) return;
    const list = buttonsOf(d.el.parentNode);
    if (list.indexOf(t) > list.indexOf(d.el)) t.after(d.el); else t.before(d.el);
  }
  function autoScroll() {
    const d = drag;
    if (!d) return;
    const dy = d.y < EDGE ? -STEP : d.y > window.innerHeight - BOTTOM ? STEP : 0; // BOTTOM leaves room for the bar at the bottom
    if (dy) { window.scrollBy(0, dy); place(); }
  }
  function drop() {
    const d = drag;
    drag = null;
    if (!d) return;
    clearInterval(d.scroller);
    d.ghost.remove();
    d.el.classList.remove('qa-ph');
    document.body.classList.remove('qa-dragging');
    const next = clean(buttonsOf(d.el.parentNode).map((b) => b.dataset.qa));
    if (next.length === mine.length && next.some((t, i) => t !== mine[i])) { mine = next; save(); }
    drawHome();
    swallowUntil = Date.now() + 500; // the click that follows the let-go must not open the section
  }
  function onDown(e) {
    if (drag || press || (e.button != null && e.button > 0)) return;
    const b = e.target.closest ? e.target.closest('#homePanel .qa > button[data-qa]') : null;
    if (!b) return;
    press = { el: b, x: e.clientX, y: e.clientY, pid: e.pointerId, timer: setTimeout(lift, HOLD_MS) };
  }
  function onMove(e) {
    if (press && e.pointerId === press.pid) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) endPress(); // moved before the hold: he is scrolling or sliding off, not holding
      return;
    }
    if (drag && e.pointerId === drag.pid) { drag.x = e.clientX; drag.y = e.clientY; place(); }
  }
  function onUp() { endPress(); drop(); }
  function bindDrag() {
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp); // whatever the phone does mid-drag, what is lifted is dropped where it is: nothing is lost
    // a lifted button must not scroll the page under the finger (only the page's own edge scrolling moves it)
    document.addEventListener('touchmove', (e) => { if (drag && e.cancelable) e.preventDefault(); }, { passive: false });
    // the phone's long-press menu is not wanted on the buttons
    document.addEventListener('contextmenu', (e) => { if ((press || drag) || (e.target.closest && e.target.closest('#homePanel .qa > button'))) e.preventDefault(); });
    document.addEventListener('click', (e) => { if (Date.now() < swallowUntil) { swallowUntil = 0; e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // 3) the 📌 at the end of each row of small tabs (and on top of «الرسايل», which has none)
  function pinRows() {
    const rows = [...document.querySelectorAll('.subbar .chips, .subbar.chips')];
    const care = $('carePanel');
    if (care && !care.querySelector('.qa-pinrow')) {
      const r = document.createElement('div');
      r.className = 'qa-pinrow';
      care.prepend(r);
    }
    if (care) rows.push(care.querySelector('.qa-pinrow'));
    for (const r of rows) {
      if (!r || r.querySelector(':scope > .qa-pin')) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip qa-pin';
      b.dataset.pin = '';
      b.textContent = '📌';
      r.appendChild(b);
    }
  }
  function drawPins() {
    const on = mine.includes(current);
    document.querySelectorAll('.qa-pin').forEach((b) => {
      b.classList.toggle('on-home', on);
      b.setAttribute('aria-pressed', String(on));
      const t = on ? 'في الرئيسية: دوس تشيله' : 'حطه في الرئيسية';
      b.setAttribute('aria-label', t);
      b.title = t;
    });
  }
  function toast(html) {
    let t = $('qaToast');
    if (!t) { t = document.createElement('div'); t.id = 'qaToast'; t.className = 'qa-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = html;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
  }
  function flip(tab, fromPin) {
    const r = toggle(mine, tab);
    if (r.full) {
      toast(`<span>الرئيسية مليانة (${MAX} زرار). شيل واحد الأول من «✏️ عدّل الزراير».</span>`);
      return;
    }
    if (!r.changed) return;
    mine = r.list;
    save();
    drawHome();
    drawPins();
    if (fromPin) {
      toast(`<span>✅</span> <b>${esc(LABEL[tab])}</b> <span>${r.added ? 'بقى في الرئيسية' : 'اتشال من الرئيسية'}</span> ` +
        `<button type="button" class="small secondary" data-qa-undo="${tab}">${r.added ? 'شيله' : 'رجّعه'}</button>`);
    }
    if ($('qaSheet') && !$('qaSheet').classList.contains('hidden')) drawSheet();
  }

  // 2) «✏️ عدّل الزراير»
  function drawSheet() {
    let sh = $('qaSheet');
    if (!sh) { sh = document.createElement('div'); sh.id = 'qaSheet'; sh.className = 'bg-sheet qa-sheet hidden'; document.body.appendChild(sh); }
    const full = mine.length >= MAX;
    const onRows = mine.map((t, i) => `<div class="qa-row on"><span class="qa-n">${i + 1}</span><span class="qa-l">${esc(LABEL[t])}</span>` +
      `<button type="button" class="qa-b" data-qa-up="${t}" aria-label="لفوق"${i === 0 ? ' disabled' : ''}>▲</button>` +
      `<button type="button" class="qa-b" data-qa-down="${t}" aria-label="لتحت"${i === mine.length - 1 ? ' disabled' : ''}>▼</button>` +
      `<button type="button" class="qa-b qa-x" data-qa-flip="${t}" aria-label="شيل">✕</button></div>`).join('');
    const rest = GROUPS.map((g) => {
      const rows = ALL.filter((x) => x[2] === g && !mine.includes(x[0]));
      if (!rows.length) return '';
      return `<h4>${esc(g)}</h4>` + rows.map(([t, l]) => `<div class="qa-row"><span class="qa-l">${esc(l)}</span>` +
        `<button type="button" class="small qa-add" data-qa-flip="${t}"${full ? ' disabled' : ''}>+ ضيف</button></div>`).join('');
    }).join('');
    sh.innerHTML = `<div class="bg-sheet-in qa-sheet-in" role="dialog" aria-label="زراير الرئيسية">` +
      `<h3><span>زراير الرئيسية</span> <small>${mine.length} من ${MAX} زرار</small></h3>` +
      `<p class="hint">اللي هنا ظاهر في الرئيسية بالترتيب ده: الأسهم بترتّبهم، و✕ بيشيل الزرار. وفي الرئيسية نفسها دوس دوسة طويلة على أي زرار واسحبه لمكانه.</p>` +
      (onRows || '<p class="hint">مفيش زراير في الرئيسية. ضيف من تحت.</p>') +
      (rest ? `<h3 class="qa-more">ضيف من الأقسام</h3>` + (full ? `<p class="hint">الرئيسية فيها ${MAX} زرار. شيل واحد الأول عشان تضيف.</p>` : '') + rest : '') +
      keyRow() +
      `<div class="bg-sheet-btns"><button type="button" id="qaDone">تمام</button><button type="button" class="secondary" id="qaReset">رجّع الأصلي</button></div></div>`;
  }
  // «مفتاح التطبيقات» (ar/work-apps.js, apps-android/): the one-tap helper for the work apps, Android only
  function keyRow() {
    const W = root.AskerWorkApps;
    if (!W || !W.android()) return '';
    return `<p class="hint qa-key">${esc(W.TEXTS.keyHint)} <a id="qaKeyApk" href="${esc(W.KEY_APK)}" rel="noopener">${esc(W.TEXTS.keyLink)}</a></p>`;
  }
  function openSheet() { drawSheet(); $('qaSheet').classList.remove('hidden'); }
  function closeSheet() { $('qaSheet')?.classList.add('hidden'); }

  function onClick(e) {
    const t = e.target;
    if (onSpareClick(e)) return;
    if (t.closest('#qaEdit')) return openSheet();
    if (t.closest('[data-pin]')) return flip(current, true);
    const u = t.closest('[data-qa-undo]');
    if (u) { $('qaToast').hidden = true; return flip(u.dataset.qaUndo, false); }
    const sh = $('qaSheet');
    if (!sh || !sh.contains(t)) return;
    if (t === sh || t.closest('#qaDone')) return closeSheet();
    if (t.closest('#qaReset')) { mine = DEFAULT.slice(); save(); drawHome(); drawPins(); return drawSheet(); }
    const up = t.closest('[data-qa-up]'), down = t.closest('[data-qa-down]'), f = t.closest('[data-qa-flip]');
    if (up || down) { mine = move(mine, (up || down).dataset[up ? 'qaUp' : 'qaDown'], up ? -1 : 1); save(); drawHome(); return drawSheet(); }
    if (f) return flip(f.dataset.qaFlip, false);
  }
  // 3) the five spare buttons: a tap on a full one opens its section (ar/look.js, data-go / data-app), a tap on an empty one or a long press on a full one opens the picker; kept on this phone
  const PLUS = 'M12 5v14M5 12h14';
  let spare = spareParse(null);
  try { spare = spareParse(localStorage.getItem(SPARE_KEY)); } catch (e) {}
  spare = pinReports(spare);
  const saveSpare = () => { try { localStorage.setItem(SPARE_KEY, JSON.stringify(spare)); } catch (e) {} };
  saveSpare();
  let spareAt = -1, spareSwallow = 0;
  function drawSpare() {
    const box = $('spareBar');
    if (!box) return;
    box.innerHTML = spare.map((t, i) => (t
      ? `<button type="button" class="sp-slot on${i === 0 ? ' sp-fix' : ''}" data-sp="${i}" ${APP_OF[t] ? `data-app="${APP_OF[t]}"` : `data-go="${TAB_OF[t]}"`}${ANCHOR_OF[t] ? ` data-anchor="${ANCHOR_OF[t]}"` : ''}>${svg(ICON[t])}<span>${esc(LABEL[t])}</span></button>`
      : `<button type="button" class="sp-slot" data-sp="${i}" aria-label="خانة فاضية: اضغط واختار شاشة">${svg(PLUS)}</button>`)).join('');
  }
  function drawSpareSheet() {
    let sh = $('spSheet');
    if (!sh) { sh = document.createElement('div'); sh.id = 'spSheet'; sh.className = 'bg-sheet qa-sheet hidden'; document.body.appendChild(sh); }
    const cur = spare[spareAt];
    const groups = GROUPS.map((g) => {
      const rows = ALL.filter((x) => x[2] === g && x[0] !== FIXED); // «التقارير» already sits in the first slot
      return rows.length ? `<h4>${esc(g)}</h4>` + rows.map(([t, l]) => `<div class="sp-sheet-row"><span class="qa-l">${esc(l)}</span><button type="button" class="small qa-add${t === cur ? ' on' : ''}" data-sp-pick="${t}">اختار</button></div>`).join('') : '';
    }).join('');
    sh.innerHTML = `<div class="bg-sheet-in qa-sheet-in" role="dialog" aria-label="خانة احتياطي"><h3><span>اختار شاشة للخانة دي</span></h3>` + groups +
      `<div class="bg-sheet-btns">${cur ? '<button type="button" class="secondary" id="spClear">فضّي الخانة</button>' : ''}<button type="button" class="secondary" id="spCancel">إلغاء</button></div></div>`;
  }
  function openSpare(i) { spareAt = i; drawSpareSheet(); $('spSheet').classList.remove('hidden'); }
  function closeSpare() { $('spSheet')?.classList.add('hidden'); spareAt = -1; }
  function bindSpare() {
    const box = $('spareBar');
    if (!box) return;
    let timer = 0;
    const stop = () => { clearTimeout(timer); timer = 0; };
    box.addEventListener('pointerdown', (e) => {
      const b = e.target.closest ? e.target.closest('.sp-slot.on:not(.sp-fix)') : null; // the sixth button is fixed
      if (!b) return;
      stop();
      timer = setTimeout(() => { timer = 0; spareSwallow = Date.now() + 700; openSpare(Number(b.dataset.sp)); }, 500);
    });
    ['pointerup', 'pointerleave', 'pointercancel', 'pointermove'].forEach((ev) => box.addEventListener(ev, stop));
    box.addEventListener('click', (e) => { if (Date.now() < spareSwallow) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    box.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function onSpareClick(e) {
    const t = e.target;
    const slot = t.closest ? t.closest('#spareBar .sp-slot') : null;
    if (slot) { if (!slot.classList.contains('on')) openSpare(Number(slot.dataset.sp)); return true; }
    const sp = $('spSheet');
    if (!sp || !sp.contains(t)) return false;
    if (t === sp || t.closest('#spCancel')) { closeSpare(); return true; }
    if (t.closest('#spClear')) { spare[spareAt] = null; saveSpare(); drawSpare(); closeSpare(); return true; }
    const pk = t.closest('[data-sp-pick]');
    if (pk) { spare[spareAt] = pk.dataset.spPick; saveSpare(); drawSpare(); closeSpare(); return true; }
    return true;
  }
  // ar/app.js tells us each tab it opens (the 📌 shows whether that section is on the home)
  function onTab(tab) { current = tab; drawPins(); }

  function start() {
    drawHome();
    drawSpare();
    bindSpare();
    pinRows();
    drawPins();
    document.addEventListener('click', onClick);
    bindDrag();
  }
  Object.assign(api, { onTab, open: openSheet, mine: () => mine.slice(), spare: () => spare.slice() });
  root.AskerShortcuts = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window === 'undefined' ? globalThis : window);
