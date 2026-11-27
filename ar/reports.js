/* «📊 التقارير» (owner 2026-11-26 night: «تلم لي كل ما هو تقرير وتحطه في قائمه واحده اسمها تقارير… زرار واحد بيفتح على صفحه فيها كل التقارير معروضه بشكل معين مناسب للسيستم»، «هيبقى هو ده الزرار
   السادس»، then «ا، ابنيها» to the mockup mockups/reports_page_2026-11-26.png): ONE page, behind the sixth button (the first slot under the bottom bar, ar/shortcuts.js), with every report in four groups.
   A card opens the report where it lives. The reports that are screens of their own (اليوم، الربح، التقفيل، قيمة المخزون، حركة البيع) left the «المبيعات» tabs and live only here; the reports that sit
   inside a work screen stay there too. A report opened from here has «‹ التقارير» on top. Owner only (a staff member never reaches the tab).
   A NEW report goes into GROUPS here (and into ar/shortcuts.js ALL), never into a section's row of tabs. */
(function (root) {
  'use strict';
  const ICONS = {
    cal: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4', chart: 'M4 19h16M5 15l5-5 4 3 5-6', lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z',
    safe: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h12M16 13h3', bars: 'M4 19h16M7 16V10M12 16V6M17 16v-4',
    doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5', clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', pill: 'M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7zM8.5 8.5l7 7',
    users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7', box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
    season: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', back: 'M9 6L4 11l5 5M4 11h10a5 5 0 0 1 0 10h-2', find: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-4.3-4.3',
    swap: 'M7 4v16M17 4v16M4 8l3-4 3 4M14 16l3 4 3-4', fresh: 'M12 4v16M4 12h16M6.5 6.5l11 11M17.5 6.5l-11 11', inbox: 'M4 14h5l1.5 2.5h3L15 14h5M4 14l2-9h12l2 9v5H4z',
  };
  // a card: tab = the screen that holds the report (ar/app.js showTab); chip = the customers' filter it opens on; ve = the view inside the suppliers (list = their list, find = «الصنف ده جه من مين»);
  // anchor = the block to scroll to (open = a folded block is opened)
  const GROUPS = [
    // «الأصناف يوم بيوم» (ar/day-items.js, owner 2026-11-28, «صح ابعتها»): on top; one screen, the card picks which of the three it opens on
    ['الأصناف يوم بيوم', [
      { id: 'iret', tab: 'dayitems', chip: 'r', name: 'مرتجعات البيع', desc: 'الزباين رجّعت إيه', ic: 'back' },
      { id: 'inew', tab: 'dayitems', chip: 'n', name: 'أصناف جديدة', desc: 'كروت جت في مشتريات اليوم', ic: 'fresh' },
      { id: 'izero', tab: 'dayitems', chip: 'z', name: 'جه ورصيده صفر', desc: 'نواقص جت وبالطلب', ic: 'inbox' }]],
    ['الفلوس والربح', [
      { id: 'day', tab: 'day', name: 'اليوم', desc: 'النهارده عدّى إزاي', ic: 'cal' },
      { id: 'profit', tab: 'profit', name: 'الربح والهامش', desc: 'والصافي بعد المصروفات', ic: 'chart' },
      { id: 'dayclose', tab: 'dayclose', name: 'تقفيل اليوم', desc: 'العجز والزيادة', ic: 'lock' },
      { id: 'cash', tab: 'cash', name: 'الخزن', desc: 'رصيد كل خزنة وحركتها', ic: 'safe' }]],
    ['المبيعات والعملاء', [
      { id: 'sales', tab: 'sales', name: 'حركة البيع', desc: 'سنة: نقدي وآجل', ic: 'bars' },
      { id: 'custst', tab: 'customers', chip: 'all', name: 'كشف حساب عميل', desc: 'حركة حسابه', ic: 'doc' },
      { id: 'olddebt', tab: 'customers', chip: 'old', name: 'ديون قديمة', desc: 'فلوس مركونة', ic: 'clock' },
      { id: 'chronic', tab: 'customers', chip: 'chronic', name: 'المزمن المتأخر', desc: 'مين دواه خلص', ic: 'pill' },
      { id: 'users', tab: 'storeorders', anchor: 'siteUsers', open: true, name: 'مستخدمين الموقع', desc: 'مين فتحه ونزّله', ic: 'users' }]],
    ['المخزون', [
      { id: 'stockval', tab: 'stockval', name: 'قيمة المخزون', desc: 'بالتكلفة وبالجمهور', ic: 'box' },
      { id: 'expiry', tab: 'expiry', name: 'الصلاحيات', desc: 'منتهي وقرب ينتهي', ic: 'clock' },
      { id: 'season', tab: 'short', anchor: 'seasonBox', open: true, name: 'قبل الموسم', desc: 'اللي بيعه بيزيد', ic: 'season' }]],
    ['المشتريات والموردين', [
      { id: 'vendst', tab: 'vendors', ve: 'list', name: 'كشف حساب مورد', desc: 'وفواتيره', ic: 'doc' },
      { id: 'returns', tab: 'vendors', ve: 'list', anchor: 'rtBox', name: 'كشف المرتجعات', desc: 'اللي لسه ما راحتش', ic: 'back' },
      { id: 'whofrom', tab: 'vendors', ve: 'find', name: 'الصنف جه من مين', desc: 'كل مرات شراه', ic: 'find' },
      { id: 'compare', tab: 'drafts', anchor: 'cmpBox', open: true, name: 'الطلب × المشتريات', desc: 'اتطلب إيه وجه إيه', ic: 'swap' }]],
  ];
  const ALL = GROUPS.flatMap((g) => g[1]);
  // the reports that are screens of their own: they live only on this page, so «‹ التقارير» is on top of them however they were opened
  const OWN = ['day', 'profit', 'dayclose', 'stockval', 'sales', 'dayitems'];
  const showBack = (tab, from) => OWN.includes(tab) || (!!from && tab === from);
  const WORDS = ['📊 التقارير', '‹ التقارير', ...GROUPS.map((g) => g[0]), ...ALL.flatMap((r) => [r.name, r.desc])];
  const api = { GROUPS, ALL, OWN, ICONS, WORDS, showBack };
  root.AskerReportsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  let from = null, run = 0;   // from = the screen a card opened; run = which opening a waiting step belongs to
  function draw() {
    const box = $('rpMain');
    if (!box) return;
    box.innerHTML = GROUPS.map(([title, list]) => `<h3 class="rp-g">${esc(title)}</h3><div class="rp-grid">` +
      list.map((r) => `<button type="button" class="rp-card" data-rp="${r.id}">${svg(ICONS[r.ic])}<span><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></span></button>`).join('') + '</div>').join('');
  }
  // a block or a filter may still be loading (a screen that draws after its data arrives): look every quarter of a second for up to six seconds; stop if he has gone elsewhere
  function whenThere(find, then) {
    const mine = run;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (mine !== run || !from) return clearInterval(timer);
      const el = find();
      if (el) { clearInterval(timer); then(el); } else if (tries >= 24) clearInterval(timer); // nothing to show yet: the screen stays at its top
    }, 250);
  }
  function openReport(id) {
    const r = ALL.find((x) => x.id === id);
    if (!r) return;
    run++;
    from = r.tab; // set before the screen opens, so its «‹ التقارير» stays
    if (r.chip) (r.tab === 'dayitems' ? root.AskerDayItems : root.AskerCustomers)?.preset?.(r.chip); // before the screen draws, so its first drawing is already on this filter
    root.AskerApp?.showTab?.(r.tab);
    if (r.ve === 'list') root.AskerVendors?.home?.();
    window.scrollTo({ top: 0 });
    if (r.ve === 'find') root.AskerVendors?.findItem?.();
    setTimeout(() => root.AskerLook?.where?.(), 0);
    if (r.anchor) whenThere(() => { const el = $(r.anchor); return el && el.offsetParent !== null ? el : null; }, (el) => {
      if (r.open && el.tagName === 'DETAILS') el.open = true;
      el.style.scrollMarginTop = '76px'; // under the top bar
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  // ar/app.js tells us each screen it opens
  function onTab(tab) {
    if (from && tab !== from) from = null;
    $('rpBack')?.classList.toggle('hidden', tab === 'reports' || !showBack(tab, from));
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest ? e.target.closest('[data-rp]') : null;
    if (b) openReport(b.dataset.rp);
  });
  root.AskerReports = { open: () => { from = null; run++; draw(); }, onTab, openReport };
})(typeof window === 'undefined' ? globalThis : window);
