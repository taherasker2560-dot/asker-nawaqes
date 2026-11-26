/* The modern look's small helpers (owner 2026-11-12, new logo; styles in ar/look.css):
   1) the line under «صيدلية عسكر» in the header says where you are («المشتريات · النواقص»);
   2) «الرئيسية»: a greeting, three numbers (النواقص، اتطلب النهارده، آخر داتا) and quick buttons into the sections.
   Reads only what the page already loaded (AskerApp.lookup(), the data-age line); writes nothing anywhere. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const GROUP = { home: 'الرئيسية', purchases: 'المشتريات', accounts: 'الحسابات', sales: 'المبيعات', care: 'خدمة العملاء', reports: 'التقارير' };
  // the reports page and the reports that are screens of their own (ar/reports.js): no button of the bar is lit on them
  const REPORTS = ['reportsPanel', 'dayPanel', 'closePanel', 'profitPanel', 'stockValPanel', 'salesPanel'];
  const PANEL = {
    homePanel: '', shortPanel: 'النواقص', readPanel: 'الوارد', translatePanel: 'الترجمة', draftsPanel: 'الطلبيات',
    docsPanel: 'الفواتير', suppliersPanel: 'قوايم المخازن', stockPanel: 'المخزون', countPanel: 'جرد المخزون', expiryPanel: 'الصلاحيات',
    customersPanel: 'العملاء', vendorsPanel: 'الموردين', storeOrdersPanel: 'طلبات الموقع', salesPanel: 'حركة البيع',
    tempSalePanel: 'البيع المؤقت', cashPanel: 'الخزن', payPanel: 'المدفوعات', waitPanel: 'الانتظار', carePanel: '',
    reportsPanel: '', dayPanel: 'اليوم', closePanel: 'تقفيل اليوم', profitPanel: 'الربح والهامش', stockValPanel: 'قيمة المخزون',
  };

  // 1) where you are
  function where() {
    const p = document.querySelector('.brand p');
    if (!p || $('app')?.classList.contains('hidden')) return;
    const lit = document.querySelector('.bottomnav [data-group]:not(.secondary)')?.dataset.group;
    const g = lit || (REPORTS.some((id) => $(id) && !$(id).classList.contains('hidden')) ? 'reports' : 'home');
    const open = Object.keys(PANEL).find((id) => $(id) && !$(id).classList.contains('hidden'));
    const sub = open ? PANEL[open] : '';
    p.textContent = (GROUP[g] || '') + (sub ? ' · ' + sub : '');
  }

  // 2) «الرئيسية»
  const hello = () => (new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير');
  function numbers() {
    if (!$('homePanel') || $('homePanel').classList.contains('hidden')) return;
    if ($('hello')) $('hello').textContent = hello();
    const d = window.AskerApp?.lookup?.() || {};
    const short = (d.shortages || []).length;
    if ($('kShort')) $('kShort').textContent = short ? short.toLocaleString('en-US') : '—';
    const ordered = new Set((d.orders || []).map((o) => o.name_key)).size;
    if ($('kOrdered')) $('kOrdered').textContent = short || ordered ? String(ordered) : '—';
    // «آخر تحديث النهارده 10:45 ص · آخر بيع 10:40 ص» → «10:45 ص» (the update), and «من 5 دقايق» under it
    const m = /(\d{1,2}:\d\d)\s*([صم])/.exec($('dataAgeText')?.textContent || '');
    if ($('kAge')) $('kAge').textContent = m ? m[1] + ' ' + m[2] : '—';
    if ($('kAgo')) $('kAgo').textContent = $('dataAgeAgo')?.textContent || 'آخر داتا';
  }
  // `anchor`: a screen that lives inside the section (a home button of 2026-11-19: المستخدمين، أصناف جديدة …): open the section, then scroll to that block
  // once it has had a moment to draw (it may still be hidden, then the section simply opens at its top)
  function go(tab, anchor) {
    window.AskerApp?.showTab?.(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(where, 0);
    if (!anchor) return;
    // «الصنف جه من مين» is a view of its own inside the suppliers: it has to be opened, scrolling to it is not enough
    if (anchor === 'veFindBox') return window.AskerVendors?.findItem?.();
    // the block may still be loading (a screen that draws after its data arrives): look every quarter of a second, up to three seconds, and scroll once when it shows
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const el = $(anchor);
      if (el && el.offsetParent !== null) {
        clearInterval(timer);
        el.style.scrollMarginTop = '76px'; // under the top bar
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (tries >= 12) clearInterval(timer); // never shows (nothing to show yet, or he went elsewhere): the section stays at its top
    }, 250);
  }
  function bind() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (b) return go(b.dataset.go, b.dataset.anchor);
      if (e.target.closest('[data-group],[data-tab],[data-pgroup]')) setTimeout(() => { where(); numbers(); }, 0);
    });
    // the page shows «الرئيسية» after the sign in; the numbers fill in as the lists arrive
    const app = $('app');
    if (app) new MutationObserver(() => { where(); numbers(); }).observe(app, { attributes: true, attributeFilter: ['class'] });
    where();
    numbers();
    setInterval(numbers, 4000);
  }
  window.AskerLook = { where, numbers };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
