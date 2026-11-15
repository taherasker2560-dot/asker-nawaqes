/* «الصلاحيات ← قصيرة» (owner 2026-11-15: «تقرير بعد ما تدخل الفواتير يظهر لي في البوت بالصلاحيات الاصناف اللي انا وافقت عليها وما
   رجعتهاش وصلاحيتها اقل من سنة وست شهور»).
   After the purchase invoices are entered in PharmaFly: the items on them that he accepted (they are on the invoice) and did NOT
   return to the supplier, whose expiry is less than 18 months away, shortest expiry first, with the supplier, the invoice and what
   is left of the quantity. A return (an invoice of kind «return» from the same supplier, for the same item, entered after the
   purchase) takes its quantity off the purchase, the same expiry first, so a partly returned line shows what is left.
   Read only from ar_vendor_moves / ar_vendors / ar_store_items (the laptop sends them, Store\SYNC_VENDORS.ps1); nothing is written. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/short-dated.cjs) ----------
  const LIMIT_MONTHS = 18;
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const pad = (n) => String(n).padStart(2, '0');
  const PERIODS = [['today', 'النهارده', 0], ['3', 'آخر 3 أيام', 2], ['7', 'آخر أسبوع', 6], ['30', 'آخر شهر', 29]];
  function parseDay(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(s || ''));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  // whole months from this month to the expiry's month (an expiry is the end of its month): 2027-11-30 from 2026-11-15 = 12
  function monthsLeft(x, now) {
    const e = parseDay(x);
    if (!e) return null;
    const n = now || new Date();
    return (e.y - n.getFullYear()) * 12 + (e.m - (n.getMonth() + 1));
  }
  // the day a period starts, as the server's time
  function sinceOf(key, now) {
    const p = PERIODS.find((x) => x[0] === key) || PERIODS[1];
    const t = new Date((now || new Date()).getFullYear(), (now || new Date()).getMonth(), (now || new Date()).getDate() - p[2]);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T00:00:00`;
  }
  // units of a line: (packs + bonus packs) × units in a pack + loose units (absolute: a return may be written with minus signs)
  const unitsOf = (l, withBonus) => {
    const k = num(l.k) > 0 ? num(l.k) : 1;
    return (Math.abs(num(l.p)) + (withBonus ? Math.abs(num(l.b)) : 0)) * k + Math.abs(num(l.u));
  };
  /* purchases, returns: ar_vendor_moves rows ({id, vendor_id, at, code, lines:[{i,p,u,k,b,c,t,x}]}); returns the lines that are
     still with us and short-dated: [{vendor_id, move, code, at, item, x, months, units, k, left}] shortest expiry first */
  function shortLines(purchases, returns, now, limit) {
    const lim = limit == null ? LIMIT_MONTHS : limit;
    const recs = [];
    for (const m of purchases || []) {
      for (const l of Array.isArray(m.lines) ? m.lines : []) {
        const item = num(l.i);
        if (!item) continue;
        const units = unitsOf(l, true);
        if (units <= 0) continue;
        recs.push({ vendor_id: m.vendor_id, move: m.id, code: m.code || null, at: m.at, item, x: l.x || null, k: num(l.k) > 0 ? num(l.k) : 1, c: l.c == null ? null : num(l.c), t: l.t == null ? null : num(l.t), left: units, bought: units });
      }
    }
    // the returns, oldest first: each takes its units off the same supplier's purchases of the same item, the same expiry first,
    // then the oldest ones; only a purchase entered before the return (or the same moment) can be returned by it
    const rets = [...(returns || [])].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    for (const r of rets) {
      for (const l of Array.isArray(r.lines) ? r.lines : []) {
        const item = num(l.i);
        let need = unitsOf(l, false) || unitsOf(l, true);
        if (!item || need <= 0) continue;
        const pool = recs.filter((q) => q.item === item && String(q.vendor_id) === String(r.vendor_id) && String(q.at) <= String(r.at) && q.left > 0)
          .sort((a, b) => (Number(b.x === (l.x || null)) - Number(a.x === (l.x || null))) || String(a.at).localeCompare(String(b.at)));
        for (const q of pool) {
          if (need <= 0) break;
          const take = Math.min(q.left, need);
          q.left -= take; need -= take;
        }
      }
    }
    return recs
      .map((q) => ({ ...q, months: monthsLeft(q.x, now) }))
      .filter((q) => q.left > 0.0001 && q.months != null && q.months < lim)
      .sort((a, b) => String(a.x).localeCompare(String(b.x)) || String(b.at).localeCompare(String(a.at)))
      .map((q) => ({ vendor_id: q.vendor_id, move: q.move, code: q.code, at: q.at, item: q.item, x: q.x, months: q.months, units: q.left, k: q.k, left: q.left, bought: q.bought, c: q.c, t: q.t }));
  }
  // «8 علبة» / «2.5 علبة» / «3 وحدة» for what is left of a line
  function leftText(q) {
    const packs = q.left / q.k;
    if (q.k > 1 && Math.abs(packs - Math.round(packs)) > 0.001 && packs < 1) return `${Math.round(q.left * 100) / 100} وحدة`;
    return `${Math.round(packs * 100) / 100} علبة`;
  }
  const expText = (x) => { const e = parseDay(x); return e ? `${pad(e.m)}/${e.y}` : '—'; };
  const monthsText = (m) => (m < 0 ? 'منتهية' : m === 0 ? 'الشهر ده' : m === 1 ? 'باقي شهر' : m === 2 ? 'باقي شهرين' : m <= 10 ? `باقي ${m} شهور` : `باقي ${m} شهر`);
  const dayText = (at) => { const e = parseDay(at); return e ? `${pad(e.d)}/${pad(e.m)}` : ''; };
  const api = { LIMIT_MONTHS, PERIODS, monthsLeft, sinceOf, shortLines, leftText, expText, monthsText, dayText };
  root.AskerShortDatedLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the view (inside «الصلاحيات») ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let period = '3', loadedAt = 0, rows = null, vendors = new Map(), items = new Map(), loading = false, failed = '', box = null, seq = 0;
  const missing = (e) => /schema cache|does not exist|Could not find/i.test(String(e && (e.message || e)));
  async function chunked(table, cols, ids) {
    const out = [];
    const list = [...new Set(ids)];
    for (let i = 0; i < list.length; i += 100) {
      const { data, error } = await db().from(table).select(cols).in('id', list.slice(i, i + 100));
      if (error) throw error;
      out.push(...(data || []));
    }
    return out;
  }
  async function load() {
    if (!db()) return;
    const my = ++seq, since = sinceOf(period);
    loading = true; failed = ''; draw();
    try {
      const q = (kind) => db().from('ar_vendor_moves').select('id,vendor_id,at,kind,code,lines').eq('kind', kind).gte('at', since).order('at', { ascending: false }).limit(1500);
      const [p, r] = await Promise.all([q('purchase'), q('return')]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      const found = shortLines(p.data, r.data, new Date());
      const [vs, its] = await Promise.all([
        chunked('ar_vendors', 'id,name,short', found.map((x) => x.vendor_id)),
        chunked('ar_store_items', 'id,name,arabic_name', found.map((x) => x.item)),
      ]);
      if (my !== seq) return;
      vendors = new Map(vs.map((v) => [String(v.id), v])); items = new Map(its.map((x) => [String(x.id), x]));
      rows = { list: found, invoices: (p.data || []).length }; loadedAt = Date.now();
    } catch (e) {
      if (my !== seq) return;
      rows = null; failed = missing(e) ? 'الموردين لسه مش متاحين على السيرفر.' : 'مقدرتش أجيب الفواتير: ' + (e && e.message);
    } finally { if (my === seq) { loading = false; draw(); } }
  }
  function row(q) {
    const it = items.get(String(q.item)) || {}, v = vendors.get(String(q.vendor_id));
    const cls = q.months < 6 ? ' red' : q.months < 12 ? ' amber' : '';
    return `<div class="sd-row${cls}"><div class="sd-main"><span class="sd-name notr" dir="auto">${esc(it.arabic_name || it.name || '#' + q.item)}</span>` +
      (it.arabic_name && it.name ? `<small class="notr" dir="ltr">${esc(it.name)}</small>` : '') +
      `<small>${v ? `<bdi class="notr">${esc(v.short || v.name)}</bdi> · ` : ''}${q.code ? `<bdi class="notr" dir="ltr">${esc(q.code)}</bdi> · ` : ''}<span>دخلت</span> ${esc(dayText(q.at))}</small></div>` +
      `<div class="sd-exp"><b dir="ltr">${esc(expText(q.x))}</b><small>${esc(monthsText(q.months))}</small><small>${esc(leftText(q))}</small></div></div>`;
  }
  function draw() {
    if (!box) return;
    const chips = `<div class="chips sd-periods" role="group" aria-label="الفترة">${PERIODS.map(([k, t]) => `<button type="button" class="chip${period === k ? ' on' : ''}" data-sd-period="${k}">${esc(t)}</button>`).join('')}</div>`;
    let body;
    if (failed) body = `<p class="status bad">${esc(failed)}</p>`;
    else if (!rows) body = '<p class="hint">بيجيب الفواتير…</p>';
    else if (!rows.list.length) body = `<p class="hint">${rows.invoices ? 'مفيش في الفواتير دي صنف صلاحيته أقل من سنة ونص ولسه معانا ✅' : 'مفيش فواتير شرا اتدخلت في الفترة دي.'}</p>`;
    else {
      const packs = rows.list.reduce((s, q) => s + q.left / q.k, 0);
      body = `<h3 class="al-h">صلاحيته أقل من سنة ونص <b class="al-n">${rows.list.length}</b></h3>` + rows.list.map(row).join('') +
        `<p class="hint">حوالي ${Math.round(packs)} علبة في ${rows.list.length} سطر.</p>`;
    }
    box.innerHTML = '<p class="hint">الأصناف اللي دخلت فواتير الشرا (يعني وافقت عليها) ومارجعتهاش للمورد، وصلاحيتها أقل من سنة وست شهور، الأقصر صلاحية الأول. اللي اترجع للمورد بيتشال من هنا، والمرتجع الجزئي بيظهر اللي فاضل.</p>' + chips + body;
  }
  // called by ar/alerts.js when the view «قصيرة» is the open one
  function show(el) {
    box = el;
    if (!box.dataset.sdBound) {
      box.dataset.sdBound = '1';
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-sd-period]');
        if (!b) return;
        period = b.dataset.sdPeriod; load();
      });
    }
    if (!loading && (!rows || Date.now() - loadedAt > 120000)) load(); else draw();
  }
  root.AskerShortDated = { show, reload: load };
})(typeof window === 'undefined' ? globalThis : window);
