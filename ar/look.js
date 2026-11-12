/* The modern look's small helpers (owner 2026-11-12, new logo; styles in ar/look.css):
   1) the line under «صيدلية عسكر» in the header says where you are («المشتريات · النواقص»);
   2) «الرئيسية»: a greeting, three numbers (النواقص، اتطلب النهارده، آخر داتا) and quick buttons into the sections.
   Reads only what the page already loaded (AskerApp.lookup(), the data-age line); writes nothing anywhere. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const GROUP = { home: 'الرئيسية', purchases: 'المشتريات', accounts: 'الحسابات', sales: 'المبيعات', care: 'خدمة العملاء' };
  const PANEL = {
    homePanel: '', shortPanel: 'النواقص', readPanel: 'الوارد', translatePanel: 'الترجمة', draftsPanel: 'الطلبيات',
    docsPanel: 'الفواتير', suppliersPanel: 'قوايم المخازن', stockPanel: 'المخزون', countPanel: 'جرد المخزون', expiryPanel: 'الصلاحيات',
    customersPanel: 'العملاء', vendorsPanel: 'الموردين', storeOrdersPanel: 'طلبات الموقع', salesPanel: 'حركة البيع',
    tempSalePanel: 'البيع المؤقت', carePanel: '',
  };

  // 1) where you are
  function where() {
    const p = document.querySelector('.brand p');
    if (!p || $('app')?.classList.contains('hidden')) return;
    const g = document.querySelector('.bottomnav [data-group]:not(.secondary)')?.dataset.group || 'home';
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
    // «داتا الصيدلية: النهارده 10:45 ص» → «10:45 ص», and «من 5 دقايق» under it
    const m = /(\d{1,2}:\d\d)\s*([صم])/.exec($('dataAgeText')?.textContent || '');
    if ($('kAge')) $('kAge').textContent = m ? m[1] + ' ' + m[2] : '—';
    if ($('kAgo')) $('kAgo').textContent = $('dataAgeAgo')?.textContent || 'آخر داتا';
  }
  function go(tab) {
    window.AskerApp?.showTab?.(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(where, 0);
  }
  function bind() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (b) return go(b.dataset.go);
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
