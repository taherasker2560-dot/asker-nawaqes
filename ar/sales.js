/* «المبيعات ← حركة البيع» (owner 2026-11-14: «بيان بالمبيعات التاريخية … متقسمة مبيعات بالاجل ومبيعات نقدي، وفيها بحث عن الصنف
   جوه الفواتير، وفيها بحث عن مشتريات عميل», then «خلوه لي سنة واحدة بس، آخر سنة … تشيل يوم وتحط يوم»; mockup
   mockups\sales_history_2026-11-14.png).
   A period (النهارده / امبارح / آخر 7 أيام / الشهر ده / السنة / من–لحد): the sales, cash and credit apart, the returns, the
   sales per hour / day / month as bars, and the invoices newest first (a tap opens the items). «دوّر على صنف جوه الفواتير»:
   the invoices that have that item and how much of it went. «مشتريات عميل آجل»: one credit customer's invoices and what he
   takes most.
   Data: ar_sales (migration 202611141900), one year of tickets sent by the laptop (Store\SYNC_SALES.ps1, read only on
   PharmaFly) every ~10 minutes; read through ar_sales_summary / ar_sales_list / ar_sales_find_items. Nothing is written. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/sales.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  function money(n) {
    const v = Math.abs(num(n)) < 0.005 ? 0 : num(n);
    const frac = Math.abs(v % 1) > 0.005;
    return v.toLocaleString('en-US', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  }
  const pad = (n) => String(n).padStart(2, '0');
  // the server's time: "2026-11-14T13:18:00" (Cairo, no zone) both ways
  const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  function parseAt(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
  }
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  // a period → [from, to) as the server's times
  function range(period, now, custom) {
    const t = dayStart(now || new Date());
    let from = t, to = addDays(t, 1);
    if (period === 'yesterday') { from = addDays(t, -1); to = t; }
    else if (period === 'week') from = addDays(t, -6);
    else if (period === 'month') from = new Date(t.getFullYear(), t.getMonth(), 1);
    else if (period === 'year') from = addDays(t, -365);
    else if (period === 'custom' && custom) {
      const a = parseAt(String(custom.from || '') + 'T00:00'), b = parseAt(String(custom.to || '') + 'T00:00');
      if (a && b) { from = a <= b ? a : b; to = addDays(a <= b ? b : a, 1); }
    }
    return { from: stamp(from), to: stamp(to) };
  }
  const clock = (t) => { const h = t.getHours(); return `${h % 12 || 12}:${pad(t.getMinutes())} ${h < 12 ? 'ص' : 'م'}`; };
  function whenText(s, now) {
    const t = parseAt(s);
    if (!t) return '';
    const diff = Math.round((dayStart(now || new Date()) - dayStart(t)) / 864e5);
    return (diff === 0 ? 'النهارده ' : diff === 1 ? 'امبارح ' : `${pad(t.getDate())}/${pad(t.getMonth() + 1)} `) + clock(t);
  }
  // a line: (packs + units / units in a pack) × price of a pack − line discount
  function lineValue(l) {
    const k = num(l.k) > 0 ? num(l.k) : 1;
    return (num(l.p) + num(l.u) / k) * num(l.s) - num(l.d);
  }
  // Arabic counting with western digits: 1 علبة، 3 علب، 11 علبة
  const word = (n, one, few) => (n >= 3 && n <= 10 ? few : one);
  function qtyText(p, u) {
    const a = Math.round(num(p) * 100) / 100, b = Math.round(num(u) * 100) / 100, bits = [];
    if (a) bits.push(`${a} ${word(a, 'علبة', 'علب')}`);
    if (b) bits.push(`${b} ${word(b, 'وحدة', 'وحدات')}`);
    return bits.join(' + ') || '0';
  }
  const UNIT_WORD = { hour: 'البيع كل ساعة', day: 'البيع كل يوم', month: 'البيع كل شهر' };
  function barLabel(t, unit) {
    const d = parseAt(t);
    if (!d) return '';
    if (unit === 'hour') return clock(d);
    if (unit === 'day') return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    return `${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  // a customer's invoices → what he takes most: [{name, packs, units, n}] by how many invoices, then packs
  function topItems(rows, limit) {
    const by = new Map();
    for (const r of rows || []) {
      if (r.kind !== 'sale') continue;
      for (const l of r.lines || []) {
        const key = String(l.i);
        const x = by.get(key) || { name: l.n || l.a || '#' + l.i, packs: 0, units: 0, n: 0 };
        x.packs += num(l.p); x.units += num(l.u); x.n += 1;
        by.set(key, x);
      }
    }
    return [...by.values()].sort((a, b) => b.n - a.n || b.packs - a.packs).slice(0, limit || 3);
  }
  const api = { money, range, whenText, lineValue, qtyText, barLabel, topItems, stamp, parseAt, UNIT_WORD };
  root.AskerSalesLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the place ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const PAGE = 50, FRESH_MS = 2 * 60 * 1000;
  const st = { period: 'today', custom: null, kind: null, item: null, customer: null };
  let sum = null, rows = [], done = false, loadedAt = 0, seq = 0, busy = false, failText = '', lastAt = null;
  let customers = null, findSeq = 0, findTimer = null;
  const open1 = new Set();

  function say(text, kind) {
    const el = $('saStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  // the server's functions not there yet (a refusal is said as it is: «permission denied» = not signed in as the owner)
  const missing = (e) => /schema cache|does not exist|Could not find/i.test(String(e && (e.message || e)));
  function args(extra) {
    const r = range(st.period, new Date(), st.custom);
    return Object.assign({ p_from: r.from, p_to: r.to, p_item: st.item ? st.item.id : null, p_customer: st.customer ? st.customer.id : null }, extra || {});
  }
  async function rpc(name, a) {
    const { data, error } = await db().rpc(name, a);
    if (error) throw error;
    return data;
  }
  async function load() {
    if (!db()) return;
    const me = ++seq;
    busy = true; failText = ''; draw();
    try {
      const lim = st.customer ? 500 : PAGE;
      const [s, list, last] = await Promise.all([
        rpc('ar_sales_summary', args()),
        rpc('ar_sales_list', args({ p_kind: st.kind, p_before: null, p_limit: lim })),
        db().from('ar_sales').select('at').order('id', { ascending: false }).limit(1),
      ]);
      if (me !== seq) return;
      sum = s || null; rows = Array.isArray(list) ? list : []; done = rows.length < lim;
      lastAt = last && Array.isArray(last.data) && last.data[0] ? last.data[0].at : lastAt;
      loadedAt = Date.now();
    } catch (e) {
      if (me !== seq) return;
      sum = null; rows = []; done = true;
      failText = missing(e) ? 'حركة البيع لسه مش متاحة: محتاج تفعيل على السيرفر الأول.' : 'مقدرتش أجيب حركة البيع: ' + (e && e.message);
    } finally {
      if (me === seq) { busy = false; draw(); }
    }
  }
  async function more() {
    if (busy || done || !rows.length) return;
    const me = ++seq;
    busy = true; draw();
    try {
      const list = await rpc('ar_sales_list', args({ p_kind: st.kind, p_before: rows[rows.length - 1].id, p_limit: PAGE }));
      if (me !== seq) return;
      const add = Array.isArray(list) ? list : [];
      rows = rows.concat(add); done = add.length < PAGE;
    } catch (e) {
      if (me === seq) failText = 'مقدرتش أجيب فواتير تانية: ' + (e && e.message);
    } finally {
      if (me === seq) { busy = false; draw(); }
    }
  }

  // ---------- drawing ----------
  function drawTop() {
    document.querySelectorAll('[data-sa-period]').forEach((b) => b.classList.toggle('on', b.dataset.saPeriod === st.period));
    $('saRange')?.classList.toggle('hidden', st.period !== 'custom');
    document.querySelectorAll('[data-sa-kind]').forEach((b) => {
      b.classList.toggle('on', (b.dataset.saKind || null) === (st.kind || null) || (!st.kind && b.dataset.saKind === 'all'));
      if (b.dataset.saKind === 'cash') b.hidden = !!st.customer;
    });
    if ($('saAge')) $('saAge').textContent = lastAt ? 'آخر فاتورة: ' + whenText(lastAt) : '';
    // the item or the customer chosen: a pill with ✕
    let who = '';
    if (st.item) who = `<div class="sa-who"><span>🔎 <span class="notr" dir="auto">${esc(st.item.arabic_name || st.item.name)}</span></span><button type="button" class="linklike" data-sa-clear aria-label="شيل الصنف">✕</button></div>`;
    else if (st.customer) who = `<div class="sa-who"><span>👤 <span class="notr">${esc(st.customer.name)}</span> · <span>كود ${esc(st.customer.id)}</span></span><button type="button" class="linklike" data-sa-clear aria-label="شيل العميل">✕</button></div>`;
    if ($('saWho')) $('saWho').innerHTML = who;
    $('saFindBox')?.classList.toggle('hidden', !!st.customer);
    $('saCustBtn')?.classList.toggle('hidden', !!st.item || !!st.customer);
  }
  function card(v, label, n, cls) {
    return `<div class="sa-s ${cls || ''}"><b dir="ltr">${esc(money(v))}</b><span><span>${esc(label)}</span> · <span>${esc(n)} فاتورة</span></span></div>`;
  }
  function drawSum() {
    const el = $('saSum');
    if (!el) return;
    if (!sum) { el.innerHTML = ''; if ($('saBars')) $('saBars').innerHTML = ''; return; }
    let html = '';
    if (st.item && sum.item) {
      const it = sum.item;
      html += `<div class="sa-item"><div class="sa-item-n"><span class="notr" dir="ltr">${esc(st.item.name)}</span>${st.item.arabic_name ? `<small class="notr">${esc(st.item.arabic_name)}</small>` : ''}</div>` +
        `<p><span>اتباع منه</span> <b>${esc(qtyText(it.packs, it.units))}</b> <span>في</span> <b>${esc(sum.sales_n)}</b> <span>فاتورة</span> · <span>بقيمة</span> <b dir="ltr">${esc(money(it.value))}</b> <span>ج</span></p>` +
        `<p class="hint"><span>نقدي</span> ${esc(sum.cash_n)} · <span>آجل</span> ${esc(sum.credit_n)}${num(sum.returns_n) ? ` · <span>مرتجع</span> ${esc(sum.returns_n)}` : ''}</p></div>`;
    } else if (st.customer) {
      const n = num(sum.sales_n), avg = n ? num(sum.sales) / n : 0;
      html += `<div class="sa-sum">${card(sum.sales, 'اشترى بـ', n, 'credit')}<div class="sa-s"><b dir="ltr">${esc(money(Math.round(avg)))}</b><span>متوسط الفاتورة</span></div></div>`;
      const top = topItems(rows, 3);
      if (top.length) html += `<p class="hint sa-top3"><span>أكتر أصناف بياخدها:</span> ${top.map((x) => `<span class="notr" dir="ltr">${esc(x.name)}</span> (${esc(x.n)})`).join(' · ')}</p>`;
      if (num(sum.returns_n)) html += `<p class="hint"><span>مرتجع</span> ${esc(sum.returns_n)} · <span dir="ltr">${esc(money(sum.returns))}</span> <span>ج</span></p>`;
    } else {
      html += '<div class="sa-sum">' + card(sum.sales, 'إجمالي البيع', num(sum.sales_n), '') + card(sum.cash, 'نقدي', num(sum.cash_n), 'cash') +
        card(sum.credit, 'آجل', num(sum.credit_n), 'credit') + card(sum.returns, 'مرتجع', num(sum.returns_n), 'ret') + '</div>';
    }
    el.innerHTML = html;
    // the bars (sales only)
    const bars = Array.isArray(sum.bars) ? sum.bars : [];
    const top = Math.max(1, ...bars.map((b) => num(b.v)));
    $('saBars').innerHTML = bars.length > 1
      ? `<div class="sa-bars" role="img" aria-label="${esc(UNIT_WORD[sum.unit] || '')}">${bars.map((b) => `<i style="height:${Math.max(2, Math.round((num(b.v) / top) * 100))}%" title="${esc(barLabel(b.t, sum.unit))}: ${esc(money(b.v))}"></i>`).join('')}</div>` +
        `<div class="sa-bl"><span>${esc(barLabel(bars[0].t, sum.unit))}</span><span>${esc(UNIT_WORD[sum.unit] || '')}</span><span>${esc(barLabel(bars[bars.length - 1].t, sum.unit))}</span></div>`
      : '';
  }
  function tag(r) {
    if (r.kind === 'return') return '<span class="sa-tag ret">مرتجع</span>';
    if (r.customer_id == null) return '<span class="sa-tag cash">نقدي</span>';
    return `<span class="sa-tag credit"><span>آجل</span>${r.customer ? ` · <span class="notr">${esc(r.customer)}</span>` : ''}</span>`;
  }
  function invHtml(r) {
    const n = Array.isArray(r.lines) ? r.lines.length : 0;
    const isOpen = open1.has(String(r.id));
    let html = `<div class="sa-inv${isOpen ? ' open' : ''}" data-sa-inv="${esc(r.id)}" role="button" tabindex="0">` +
      `<div class="sa-inv-h"><span><span>فاتورة رقم</span> <b dir="ltr">${esc(Number(r.id).toLocaleString('en-US'))}</b> ${tag(r)}</span><b class="sa-m${num(r.total) < 0 ? ' neg' : ''}" dir="ltr">${esc(money(r.total))}</b></div>` +
      `<div class="sa-inv-s"><span>${esc(whenText(r.at))}</span> · <span>${esc(n)} ${n === 1 ? 'صنف' : 'أصناف'}</span></div>`;
    if (isOpen) {
      html += '<table class="sa-lines">' + (r.lines || []).map((l) =>
        `<tr><td><span class="notr" dir="ltr">${esc(l.n || '#' + l.i)}</span>${l.a ? `<small class="notr">${esc(l.a)}</small>` : ''}</td><td>${esc(qtyText(l.p, l.u))}</td><td class="n" dir="ltr">${esc(money(lineValue(l)))}</td></tr>`).join('') + '</table>';
    }
    return html + '</div>';
  }
  function draw() {
    if (!$('salesPanel')) return;
    drawTop();
    drawSum();
    if (failText) say(failText, 'bad');
    else if (busy && !rows.length) say('بيجيب حركة البيع…');
    else if (!rows.length && sum) say(st.item ? 'الصنف ده ما اتباعش في الفترة دي.' : st.customer ? 'مفيش فواتير للعميل ده في الفترة دي.' : 'مفيش بيع في الفترة دي.');
    else say('');
    $('saList').innerHTML = rows.map(invHtml).join('');
    $('saMore')?.classList.toggle('hidden', done || !rows.length || !!st.customer);
    if ($('saMore')) $('saMore').disabled = busy;
  }

  // ---------- the item search and the customers ----------
  function drawFind(list, q) {
    const el = $('saFind');
    if (!el) return;
    if (!q) { el.innerHTML = ''; return; }
    if (list === null) { el.innerHTML = '<p class="status">بيدوّر…</p>'; return; }
    if (!list.length) { el.innerHTML = '<p class="status">مفيش صنف بالاسم ده.</p>'; return; }
    el.innerHTML = '<div class="sa-hits">' + list.map((x) =>
      `<button type="button" class="sa-hit" data-sa-item="${esc(x.id)}"><span class="notr" dir="ltr">${esc(x.name)}</span>${x.arabic_name ? `<small class="notr">${esc(x.arabic_name)}</small>` : ''}<em>${esc(num(x.invoices))} <span>فاتورة في السنة</span></em></button>`).join('') + '</div>';
    el._hits = list;
  }
  function find(q) {
    clearTimeout(findTimer);
    q = String(q || '').trim();
    if (q.length < 2) { drawFind(null, ''); return; }
    drawFind(null, q);
    findTimer = setTimeout(async () => {
      const me = ++findSeq;
      try {
        const list = await rpc('ar_sales_find_items', { p_q: q, p_limit: 10 });
        if (me === findSeq) drawFind(Array.isArray(list) ? list : [], q);
      } catch (e) {
        if (me === findSeq) $('saFind').innerHTML = `<p class="status bad">${esc(missing(e) ? 'حركة البيع لسه مش متاحة: محتاج تفعيل على السيرفر الأول.' : 'مقدرتش أدوّر: ' + (e && e.message))}</p>`;
      }
    }, 350);
  }
  async function loadCustomers() {
    if (customers) return customers;
    const out = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await db().from('ar_customers').select('id,name').order('id').range(from, from + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    customers = out;
    return out;
  }
  function drawCustomers() {
    const el = $('saCustList');
    if (!el) return;
    const q = String($('saCustQ')?.value || '').trim();
    if (!customers) { el.innerHTML = '<p class="status">بيجيب العملاء…</p>'; return; }
    const F = root.AskerFuzzy;
    const fold = (s) => (F ? F.fold(s) : String(s || '').toLowerCase());
    const words = fold(q).split(/\s+/).filter(Boolean);
    const hits = customers.filter((c) => !words.length || words.every((w) => fold(c.name).includes(w) || String(c.id) === w)).slice(0, 30);
    el.innerHTML = hits.length
      ? hits.map((c) => `<button type="button" class="sa-cust" data-sa-cust="${esc(c.id)}"><span class="notr">${esc(c.name)}</span><small>كود ${esc(c.id)}</small></button>`).join('')
      : '<p class="status">مفيش عميل بالاسم ده.</p>';
  }
  async function openCustomers() {
    $('saCustPick')?.classList.remove('hidden');
    $('saCustQ')?.focus();
    drawCustomers();
    try { await loadCustomers(); } catch (e) { $('saCustList').innerHTML = `<p class="status bad">${esc('مقدرتش أجيب العملاء: ' + (e && e.message))}</p>`; return; }
    drawCustomers();
  }

  // ---------- what the buttons do ----------
  function setAndLoad(change) {
    Object.assign(st, change);
    open1.clear();
    load();
  }
  function bind() {
    const panel = $('salesPanel');
    if (!panel || panel._bound) return;
    panel._bound = true;
    panel.addEventListener('click', (e) => {
      const p = e.target.closest('[data-sa-period]');
      if (p) {
        if (p.dataset.saPeriod === 'custom') {
          if (!$('saFrom').value) { const r = range('week', new Date()); $('saFrom').value = r.from.slice(0, 10); $('saTo').value = stamp(new Date()).slice(0, 10); }
          setAndLoad({ period: 'custom', custom: { from: $('saFrom').value, to: $('saTo').value } });
        } else setAndLoad({ period: p.dataset.saPeriod });
        return;
      }
      const k = e.target.closest('[data-sa-kind]');
      if (k) { setAndLoad({ kind: k.dataset.saKind === 'all' ? null : k.dataset.saKind }); return; }
      const it = e.target.closest('[data-sa-item]');
      if (it) {
        const hit = ($('saFind')._hits || []).find((x) => String(x.id) === it.dataset.saItem);
        if (hit) { $('saQ').value = ''; drawFind(null, ''); setAndLoad({ item: { id: Number(hit.id), name: hit.name, arabic_name: hit.arabic_name }, customer: null, kind: null }); }
        return;
      }
      if (e.target.closest('[data-sa-clear]')) { setAndLoad({ item: null, customer: null, kind: null }); return; }
      if (e.target.closest('#saCustBtn')) { openCustomers(); return; }
      const c = e.target.closest('[data-sa-cust]');
      if (c) {
        const cu = (customers || []).find((x) => String(x.id) === c.dataset.saCust);
        $('saCustPick')?.classList.add('hidden');
        if ($('saCustQ')) $('saCustQ').value = '';
        // a customer's purchases: the whole year unless a period was chosen on purpose
        if (cu) setAndLoad({ customer: { id: Number(cu.id), name: cu.name }, item: null, kind: null, period: st.period === 'today' ? 'year' : st.period });
        return;
      }
      if (e.target.closest('#saCustClose')) { $('saCustPick')?.classList.add('hidden'); return; }
      if (e.target.closest('#saMore')) { more(); return; }
      const inv = e.target.closest('[data-sa-inv]');
      if (inv) { const id = inv.dataset.saInv; if (open1.has(id)) open1.delete(id); else open1.add(id); draw(); }
    });
    panel.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-sa-inv]')) { e.preventDefault(); e.target.click(); } });
    $('saQ')?.addEventListener('input', (e) => find(e.target.value));
    $('saCustQ')?.addEventListener('input', drawCustomers);
    const custom = () => { if (st.period === 'custom' && $('saFrom').value && $('saTo').value) setAndLoad({ custom: { from: $('saFrom').value, to: $('saTo').value } }); };
    $('saFrom')?.addEventListener('change', custom);
    $('saTo')?.addEventListener('change', custom);
  }
  function open(force) {
    bind();
    if (!force && loadedAt && Date.now() - loadedAt < FRESH_MS) { draw(); return; }
    load();
  }
  root.AskerSales = { open, state: () => Object.assign({}, st), rows: () => rows };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
