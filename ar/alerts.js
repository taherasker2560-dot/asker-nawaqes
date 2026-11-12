/* The alerts (owner 2026-11-12: «جهز مكان مناسب للتنبيهات بتاعة الاكسبير والصلاحيات المتلخبطة بسبب البيع وحدود العملا …
   اعملها كل حاجة في القسم الأنسب ليها»). The laptop (Hub\alerts\BUILD_ALERTS.ps1, read only on PharmaFly) writes
   asker-private/alerts/alerts.json every hour; this file only READS it (owner's login).
     «المشتريات ← مخزون ← الصلاحيات»: today's PharmaFly tasks (a sale took the wrong expiry = the batches' dates are mixed up;
        sold with no stock; sold expired), expired stock still on the system (outside the damaged store), and what expires
        within 3 months. Each item with its batches now, so it can be fixed in PharmaFly by hand (nothing is changed here).
     «الحسابات ← العملاء»: customers above their credit limit and close to it (balance by the verified rule).
     «الرئيسية»: the «محتاج شغل» card (ar/notify.js adds the incoming, the invoices and the store orders to it). */
(function (root) {
  'use strict';
  const PATH = 'alerts/alerts.json';
  const OLD_HOURS = 30;

  // ---------- pure helpers (also used by tests/alerts.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const money = (n) => String(Math.round(num(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // «2026-06-28» -> «06/2026»
  const monthOf = (d) => { const m = /^(\d{4})-(\d\d)/.exec(String(d || '')); return m ? `${m[2]}/${m[1]}` : 'من غير صلاحية'; };
  // «2026-11-11T22:34:52» -> «10:34 م» today, «امبارح 10:34 م», «10/11 10:34 م»
  function when(iso, dayStartIso) {
    const t = new Date(iso);
    if (isNaN(t)) return '';
    const h = t.getHours(), clock = (h % 12 || 12) + ':' + String(t.getMinutes()).padStart(2, '0') + (h < 12 ? ' ص' : ' م');
    const start = new Date(dayStartIso);
    if (!isNaN(start) && t >= start) return clock;
    if (!isNaN(start) && t >= new Date(start.getTime() - 864e5)) return 'امبارح ' + clock;
    return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')} ${clock}`;
  }
  // a batch: «07/2028: 2 علبة» (+ the store when it is not the main one)
  function batchText(b, qtyText, parts) {
    const q = qtyText ? qtyText(b.packs, b.units, parts) : `${num(b.packs)} علبة` + (num(b.units) ? ` و${num(b.units)} شريط` : '');
    const store = b.store && b.store !== 1 ? ` (${String(b.store_name || 'مخزن ' + b.store).replace(/^مخزن\s*/, '')})` : '';
    return `${monthOf(b.exp)}: ${q}${store}`;
  }
  function parse(o) {
    if (!o || typeof o !== 'object' || !o.tasks || !o.expiry || !o.customers) return null;
    const arr = (x) => (Array.isArray(x) ? x : []);
    return {
      generatedAt: o.generated_at || '', dataAt: o.data_at || '', dayStart: o.day_start || '', soonUntil: o.soon_until || '',
      mix: arr(o.tasks.expiry_mix), negative: arr(o.tasks.negative), expiredSold: arr(o.tasks.expired_sold),
      expired: arr(o.expiry.expired), soon: arr(o.expiry.soon),
      customers: { owing: num(o.customers.owing), owed: num(o.customers.owed), prepaid: num(o.customers.prepaid), over: arr(o.customers.over), near: arr(o.customers.near) },
      counts: o.counts || {},
    };
  }
  // what needs work today, for the home card and the badges
  function todo(a) {
    if (!a) return [];
    const today = (l) => l.filter((x) => num(x.today) > 0).length;
    return [
      { key: 'mix', tab: 'expiry', view: 'today', n: today(a.mix), text: 'صنف صلاحياته اتلخبطت من البيع النهارده' },
      { key: 'negative', tab: 'expiry', view: 'today', n: today(a.negative), text: 'صنف اتباع بالسالب النهارده' },
      { key: 'expiredSold', tab: 'expiry', view: 'today', n: today(a.expiredSold), text: 'صنف منتهي اتباع النهارده' },
      { key: 'expired', tab: 'expiry', view: 'expired', n: a.expired.length, text: 'صنف منتهي الصلاحية وليه رصيد' },
      { key: 'over', tab: 'customers', view: '', n: a.customers.over.length, text: 'عميل عدّى الحد' },
    ].filter((x) => x.n > 0);
  }
  const value = (list) => list.reduce((s, x) => s + num(x.value), 0);
  const api = { PATH, parse, todo, when, monthOf, batchText, money, value };
  root.AskerAlertsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const qtyText = () => (root.AskerStockLib && root.AskerStockLib.qtyText) || null;
  let data = null, loading = null, loadedAt = 0, view = 'today', failed = '';

  async function load(force) {
    if (!db()) return null;
    if (loading) return loading;
    if (data && !force && Date.now() - loadedAt < 5 * 60e3) return data;
    loading = (async () => {
      try {
        // a staff member with «الصلاحيات» but not «العملاء» reads the same alerts without the customers (owner 2026-11-13)
        const st = root.AskerStaff, path = st && st.isStaff() && !st.can('customers') ? 'alerts/expiry.json' : PATH;
        const { data: blob, error } = await db().storage.from('asker-private').download(path);
        if (error || !blob) { failed = 'لسه مفيش تنبيهات: اللاب بيجهزها مع كل تحديث، كل ساعة.'; return data; }
        const p = parse(JSON.parse(await blob.text()));
        if (!p) { failed = 'ملف التنبيهات شكله مش مظبوط، استنى التحديث الجاي.'; return data; }
        data = p; failed = ''; loadedAt = Date.now();
        return data;
      } catch (e) {
        failed = 'مقدرتش أجيب التنبيهات: ' + ((e && e.message) || e);
        return data;
      } finally {
        loading = null;
        drawAll();
      }
    })();
    return loading;
  }
  function ageText(a) {
    const t = new Date(a.dataAt);
    if (isNaN(t)) return '';
    const old = (Date.now() - new Date(a.generatedAt)) / 36e5 > OLD_HOURS;
    return `حسب داتا الصيدلية ${when(a.dataAt, a.dayStart) || ''} ${old ? '· قديمة، اللاب لسه ما حدّثهاش' : ''}`.trim();
  }
  function itemCard(x, line, warn) {
    const q = qtyText();
    const bs = (x.batches || []).map((b) => `<span class="al-batch">${esc(batchText(b, q, x.parts))}</span>`).join('');
    return `<div class="al-item${warn ? ' warn' : ''}"><strong dir="ltr">${esc(x.name)}</strong>` +
      (line ? `<div class="al-line">${esc(line)}</div>` : '') +
      (bs ? `<div class="al-batches">${bs}</div>` : '<div class="hint">مفيش رصيد على أي تشغيلة دلوقتي</div>') + '</div>';
  }
  function list(title, items, line, empty, warn) {
    return `<h3 class="al-h">${esc(title)} <b class="al-n">${items.length}</b></h3>` +
      (items.length ? items.map((x) => itemCard(x, line(x), warn)).join('') : `<p class="hint">${esc(empty)}</p>`);
  }
  function drawExpiry() {
    const box = $('alExpiry');
    if (!box) return;
    const a = data;
    $('alAge').textContent = a ? ageText(a) : failed;
    $('alAge').className = 'status' + (failed && !a ? ' bad' : '');
    document.querySelectorAll('#alViews [data-al-view]').forEach((b) => b.classList.toggle('secondary', b.dataset.alView !== view));
    if (!a) { box.innerHTML = ''; return; }
    const tn = (l) => l.filter((x) => num(x.today) > 0).length;
    const setBadge = (id, n) => { const el = $(id); if (el) { el.textContent = n; el.classList.toggle('hidden', !n); } };
    setBadge('alTodayN', tn(a.mix) + tn(a.negative) + tn(a.expiredSold));
    setBadge('alExpiredN', a.expired.length);
    setBadge('alSoonN', a.soon.length);
    const times = (x) => `${num(x.today) ? `النهارده ${num(x.today)} مرة` : 'مش النهارده'} · ${num(x.n7)} في 7 أيام · آخر مرة ${when(x.last, a.dayStart)}`;
    if (view === 'today') {
      const today = (l) => l.filter((x) => num(x.today) > 0), week = (l) => l.filter((x) => !num(x.today));
      box.innerHTML =
        '<p class="hint">من شاشة المهام في فارمافلاي. صحّح التشغيلات من فارمافلاي نفسه: البوت مابيغيّرش حاجة.</p>' +
        list('صلاحيات اتلخبطت من البيع', today(a.mix), times, 'مفيش النهارده.', true) +
        list('بيع بالسالب', today(a.negative), times, 'مفيش النهارده.', true) +
        list('اتباع منتهي الصلاحية', today(a.expiredSold), times, 'مفيش النهارده.', true) +
        (week(a.mix).length + week(a.negative).length + week(a.expiredSold).length
          ? `<details class="al-week"><summary>آخر 7 أيام (قبل النهارده): ${week(a.mix).length + week(a.negative).length + week(a.expiredSold).length} صنف</summary>` +
            [...week(a.mix), ...week(a.negative), ...week(a.expiredSold)].map((x) => itemCard(x, times(x))).join('') + '</details>'
          : '');
    } else if (view === 'expired') {
      box.innerHTML = `<p class="hint">تشغيلات صلاحيتها خلصت (الشهر ده أو قبل كده) ولسه عليها رصيد على السيستم، من غير مخزن الهالك. قيمتهم حوالي ${money(value(a.expired))} ج.</p>` +
        list('منتهية وليها رصيد', a.expired, (x) => `${monthOf(x.exp)} · ${num(x.packs)} علبة · حوالي ${money(x.value)} ج`, 'مفيش.', true);
    } else {
      box.innerHTML = `<p class="hint">هتخلص قبل ${monthOf(a.soonUntil)}: ارجعها للمورد أو بيعها الأول. قيمتهم حوالي ${money(value(a.soon))} ج.</p>` +
        list('هتخلص خلال 3 شهور', a.soon, (x) => `${monthOf(x.exp)} · ${num(x.packs)} علبة · حوالي ${money(x.value)} ج`, 'مفيش.');
    }
  }
  function customerRow(c, a) {
    return `<div class="al-item${c.over > 0 ? ' warn' : ''}"><strong>${esc(c.name)}</strong>` +
      `<div class="al-line">عليه ${money(c.balance)} ج · الحد ${money(c.limit)} ج${c.over > 0 ? ` · زيادة ${money(c.over)} ج` : ` · ${num(c.pct)}% من الحد`}</div>` +
      `<div class="hint">آخر حركة ${esc(when(c.last_at, a.dayStart))} (${c.last_kind === 'payment' ? 'دفع' : 'بيع'}) · كود ${esc(c.id)}</div></div>`;
  }
  function drawCustomers() {
    const box = $('alCustomers');
    if (!box) return;
    const a = data;
    $('alCustAge').textContent = a ? ageText(a) : failed;
    if (!a) { box.innerHTML = ''; return; }
    const c = a.customers;
    box.innerHTML =
      `<div class="grid"><div class="stat"><strong>${c.over.length}</strong>عدّوا الحد</div><div class="stat"><strong>${c.owing}</strong>عليهم فلوس</div><div class="stat"><strong>${money(c.owed)}</strong>ج إجمالي</div></div>` +
      `<h3 class="al-h">عدّوا الحد <b class="al-n">${c.over.length}</b></h3>` + (c.over.length ? c.over.map((x) => customerRow(x, a)).join('') : '<p class="hint">مفيش عميل عدّى حده.</p>') +
      (c.near.length ? `<h3 class="al-h">قربوا من الحد (90% أو أكتر) <b class="al-n">${c.near.length}</b></h3>` + c.near.map((x) => customerRow(x, a)).join('') : '') +
      `<p class="hint">الرصيد = آخر حركة للعميل في فارمافلاي (بيع أو دفع)، والحد من كارت العميل. ${c.prepaid} عميل دافعين مقدّم.</p>`;
  }
  function drawAll() {
    drawExpiry();
    drawCustomers();
    root.AskerNotify?.refresh?.();
  }
  function bind() {
    $('alViews')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-al-view]');
      if (!b) return;
      view = b.dataset.alView;
      drawExpiry();
    });
  }
  // open a view from the home card or a notification
  function show(v) { if (v) view = v; drawExpiry(); }
  root.AskerAlerts = { open: () => load(false), load, show, data: () => data, todo: () => todo(data) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
