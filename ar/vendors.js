/* «الحسابات ← الموردين» (owner 2026-11-14: «حسابات الموردين وحركة الحساب والقدرة على ان انا اعرف في صنف معين جاي من مين امتى
   وامتى وامتى … بتاريخ ايه وصلاحية ايه … المرتجعات لكل مورد من تاريخ معين»; mockup mockups\suppliers_2026-11-14.png).
   Three places:
   - the suppliers: what we owe all of them, and each one's balance, last invoice and last payment;
   - a supplier's statement from a date to a date: all / invoices / returns / payments, the balance after each move, a tap
     opens an invoice's items, the returns show their items with the expiry;
   - «الصنف ده جه من مين؟»: every purchase of one item since 2018 (supplier, quantity + bonus, discount, expiry), its last
     year and its best buy.
   Data: ar_vendors / ar_vendor_moves (migration 202611142000), sent by the laptop (Store\SYNC_VENDORS.ps1, read only on
   PharmaFly). Balance = Σ AmountAdjustment + Σ payments (checked against PharmaFly's screen: AMG 96,422.75). Nothing is
   written from here. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/vendors.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  function money(n) {
    const v = Math.abs(num(n)) < 0.005 ? 0 : num(n);
    const frac = Math.abs(v % 1) > 0.005;
    return v.toLocaleString('en-US', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  }
  const pad = (n) => String(n).padStart(2, '0');
  function parseAt(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d))?/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
  }
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dateOnly = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function dayText(s, now) {
    const t = parseAt(s);
    if (!t) return '';
    const diff = Math.round((dayStart(now || new Date()) - dayStart(t)) / 864e5);
    if (diff === 0) return 'النهارده';
    if (diff === 1) return 'امبارح';
    return `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}`;
  }
  const expText = (x) => { const m = /^(\d{4})-(\d\d)/.exec(String(x || '')); return m ? `${m[2]}/${m[1]}` : '—'; };
  // the balance: what we owe him, or what he owes us
  function balanceText(b) {
    const v = num(b);
    if (v > 0.5) return { cls: 'owe', text: money(v) };
    if (v < -0.5) return { cls: 'ok', text: 'لينا ' + money(-v) };
    return { cls: 'zero', text: 'خالص' };
  }
  // the default statement range: from the first of last month to today
  function defaultRange(now) {
    const t = dayStart(now || new Date());
    return { from: dateOnly(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to: dateOnly(t) };
  }
  // dates of the inputs → [from, to) as the server's times
  function rangeArgs(r) {
    const a = parseAt(r && r.from), b = parseAt(r && r.to);
    if (!a || !b) return null;
    const lo = a <= b ? a : b, hi = a <= b ? b : a;
    const next = new Date(hi.getFullYear(), hi.getMonth(), hi.getDate() + 1);
    return { from: dateOnly(lo) + 'T00:00:00', to: dateOnly(next) + 'T00:00:00' };
  }
  // a purchase line in words: «10 + 1 بونص», «2 وحدة»
  function qtyText(l) {
    const p = Math.round(num(l.p) * 100) / 100, u = Math.round(num(l.u) * 100) / 100, b = Math.round(num(l.b) * 100) / 100;
    const bits = [];
    if (p) bits.push(String(p));
    if (u) bits.push(`${u} وحدة`);
    let s = bits.join(' + ') || '0';
    if (b) s += ` + ${b} بونص`;
    return s;
  }
  // a line's value at cost: (packs + units / units in a pack) × cost of a pack
  const lineValue = (l) => (num(l.p) + num(l.u) / (num(l.k) > 0 ? num(l.k) : 1)) * num(l.c);
  // the suppliers' list: this year's (a move in the last 365 days, or a balance) or all; biggest balance first
  function pickVendors(list, view, now) {
    const cut = new Date((now || new Date()).getTime() - 365 * 864e5);
    const recent = (v) => Math.abs(num(v.balance)) > 0.5 || [v.last_invoice_at, v.last_payment_at].some((x) => { const t = parseAt(x); return t && t >= cut; });
    const rows = (list || []).filter((v) => view === 'all' || recent(v));
    return rows.sort((a, b) => num(b.balance) - num(a.balance) || String(a.name).localeCompare(String(b.name)));
  }
  function totals(list, now) {
    const cut = new Date((now || new Date()).getTime() - 365 * 864e5);
    let owed = 0, n = 0;
    for (const v of list || []) {
      if (num(v.balance) > 0.5) owed += num(v.balance);
      const t = parseAt(v.last_invoice_at);
      if (t && t >= cut) n++;
    }
    return { owed: Math.round(owed * 100) / 100, year: n };
  }
  const KIND = { purchase: 'فاتورة شرا', return: 'مرتجع', payment: 'دفعة' };
  const api = { money, parseAt, dayText, expText, balanceText, defaultRange, rangeArgs, qtyText, lineValue, pickVendors, totals, KIND };
  root.AskerVendorsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the place ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const PAGE = 100, FRESH_MS = 5 * 60 * 1000;
  let list = null, loadedAt = 0, loading = null, view = 'year', failText = '';
  let st = null;       // the open statement: { v, range, kind, rows, done, busy, sum, open:Set, seq }
  // the dates he chose stay (owner 2026-11-14: «اما باجي اغير التاريخ … ما بيثبت … بيرجع تاني على اللي انت حاطه»): for the
  // next supplier too and after the page opens again (kept on this phone only)
  const RANGE_KEY = 've-range';
  let lastRange = null;
  try { const r = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null'); if (r && rangeArgs(r)) lastRange = { from: r.from, to: r.to }; } catch (e) {}
  let it = null;       // the item history: { item, kind, rows, done, busy, sum }
  const names = new Map(), findState = { seq: 0, timer: null, hits: [] };
  const missing = (e) => /schema cache|does not exist|Could not find/i.test(String(e && (e.message || e)));
  const vendorOf = (id) => (list || []).find((v) => String(v.id) === String(id));
  const vendorName = (id) => { const v = vendorOf(id); return v ? (v.short || v.name) : '#' + id; };

  function show(which) {
    $('veListView')?.classList.toggle('hidden', which !== 'list');
    $('veSt')?.classList.toggle('hidden', which !== 'st');
    $('veItem')?.classList.toggle('hidden', which !== 'item');
  }
  // ---------- the suppliers ----------
  async function loadList() {
    const { data, error } = await db().from('ar_vendors').select('id,name,short,active,balance,invoices,last_invoice_at,last_payment_at,last_payment').order('id').range(0, 4999);
    if (error) throw error;
    return data || [];
  }
  async function open(force) {
    bind();
    if (!db()) return;
    if (!force && list && Date.now() - loadedAt < FRESH_MS) { drawList(); return; }
    if (loading) return loading;
    loading = (async () => {
      if (!list) drawList();
      try { list = await loadList(); loadedAt = Date.now(); failText = ''; }
      catch (e) { list = null; failText = missing(e) ? 'الموردين لسه مش متاحين: محتاج تفعيل على السيرفر الأول.' : 'مقدرتش أجيب الموردين: ' + (e && e.message); }
      finally { loading = null; drawList(); }
    })();
    return loading;
  }
  function drawList() {
    const el = $('veRows');
    if (!el) return;
    if (!st && !it) show('list');
    const stEl = $('veStatus');
    if (failText) { stEl.textContent = failText; stEl.className = 'status bad'; el.innerHTML = ''; $('veTotal').innerHTML = ''; return; }
    if (!list) { stEl.textContent = 'بيجيب الموردين…'; stEl.className = 'status'; el.innerHTML = ''; return; }
    stEl.textContent = ''; stEl.className = 'status';
    const t = totals(list);
    $('veTotal').innerHTML = `<div class="ve-total"><span>علينا للموردين كلهم:</span> <b dir="ltr">${esc(money(t.owed))}</b> <span>ج</span><small><span>${esc(t.year)}</span> <span>مورد اتعاملنا معاهم السنة دي</span></small></div>`;
    document.querySelectorAll('[data-ve-view]').forEach((b) => b.classList.toggle('on', b.dataset.veView === view));
    const rows = pickVendors(list, view);
    el.innerHTML = rows.length ? rows.map((v) => {
      const b = balanceText(v.balance);
      const pay = v.last_payment_at ? `<span>آخر دفعة</span> <span>${esc(dayText(v.last_payment_at))}</span>${num(v.last_payment) ? ` (<span dir="ltr">${esc(money(v.last_payment))}</span>)` : ''}` : '<span>مفيش دفعات</span>';
      return `<button type="button" class="ve-row" data-ve-open="${esc(v.id)}"><span class="ve-r1"><span class="notr">${esc(v.name)}</span>${v.short ? ` <small dir="ltr">(${esc(v.short)})</small>` : ''}<b class="ve-bal ${b.cls}" dir="auto">${esc(b.text)}</b></span>` +
        `<span class="ve-r2">${v.last_invoice_at ? `<span>آخر فاتورة</span> <span>${esc(dayText(v.last_invoice_at))}</span>` : '<span>مفيش فواتير</span>'} · ${pay}</span></button>`;
    }).join('') : '<p class="status">مفيش موردين اتعاملنا معاهم السنة دي.</p>';
  }

  // ---------- a supplier's statement ----------
  async function itemNames(ids) {
    const need = [...new Set(ids)].filter((i) => !names.has(String(i)));
    for (let i = 0; i < need.length; i += 200) {
      const part = need.slice(i, i + 200);
      const { data } = await db().from('ar_store_items').select('id,name,arabic_name').in('id', part);
      for (const r of data || []) names.set(String(r.id), r);
      for (const x of part) if (!names.has(String(x))) names.set(String(x), { id: x, name: '#' + x });
    }
  }
  async function loadMoves(more) {
    const me = st;
    if (!me || (more && (me.busy || me.done))) return;
    const r = rangeArgs(me.range);
    if (!r) return;
    // a new range or kind replaces a load still on its way (its answer is dropped)
    const token = (me.seq = (me.seq || 0) + 1);
    me.busy = true; me.error = ''; drawSt();
    try {
      let q = db().from('ar_vendor_moves').select('id,at,kind,code,inv_date,amount,total,balance,lines')
        .eq('vendor_id', me.v.id).gte('at', r.from).lt('at', r.to);
      if (me.kind) q = q.eq('kind', me.kind);
      const from = more ? me.rows.length : 0;
      const tasks = [q.order('at', { ascending: false }).order('id', { ascending: false }).range(from, from + PAGE - 1)];
      if (!more) tasks.push(db().rpc('ar_vendor_period', { p_vendor: me.v.id, p_from: r.from, p_to: r.to }));
      const [res, sum] = await Promise.all(tasks);
      if (res.error) throw res.error;
      if (st !== me || me.seq !== token) return;
      const got = res.data || [];
      me.rows = more ? me.rows.concat(got) : got;
      me.done = got.length < PAGE;
      if (!more) me.sum = sum && !sum.error ? sum.data : null;
      // the returns show their items at once; the names of every line shown
      await itemNames(me.rows.flatMap((m) => (m.lines || []).map((l) => l.i)));
    } catch (e) {
      if (st === me && me.seq === token) me.error = missing(e) ? 'الموردين لسه مش متاحين: محتاج تفعيل على السيرفر الأول.' : 'مقدرتش أجيب الحركة: ' + (e && e.message);
    } finally {
      if (st === me && me.seq === token) { me.busy = false; drawSt(); }
    }
  }
  function openStatement(id) {
    const v = vendorOf(id);
    if (!v) return;
    st = { v, range: lastRange ? { from: lastRange.from, to: lastRange.to } : defaultRange(), kind: null, rows: [], done: false, busy: false, sum: null, open: new Set(), seq: 0 };
    it = null;
    show('st');
    $('veFrom').value = st.range.from; $('veTo').value = st.range.to;
    drawSt();
    loadMoves(false);
    try { history.pushState({ ve: 1 }, ''); } catch (e) {}
  }
  function linesHtml(m) {
    const ls = Array.isArray(m.lines) ? m.lines : [];
    if (!ls.length) return '<p class="hint">الأصناف مش متسجلة.</p>';
    return '<table class="ve-lines"><tr><th>الصنف</th><th>الكمية</th><th>الصلاحية</th><th>القيمة</th></tr>' + ls.map((l) => {
      const n = names.get(String(l.i)) || { name: '#' + l.i };
      return `<tr><td><span class="notr" dir="ltr">${esc(n.name)}</span>${n.arabic_name ? `<small class="notr">${esc(n.arabic_name)}</small>` : ''}</td><td>${esc(qtyText(l))}</td><td class="exp">${esc(expText(l.x))}</td><td class="n" dir="ltr">${esc(money(lineValue(l)))}</td></tr>`;
    }).join('') + '</table>';
  }
  function drawSt() {
    if (!st || !$('veSt')) return;
    const b = balanceText(st.v.balance);
    $('veStHead').innerHTML = `<h2 class="notr">${esc(st.v.name)}</h2><p><span>الرصيد</span> <b class="ve-bal ${b.cls}" dir="auto">${esc(b.text)}</b></p>`;
    document.querySelectorAll('[data-ve-kind]').forEach((x) => x.classList.toggle('on', (x.dataset.veKind || '') === (st.kind || '')));
    let sumHtml = '';
    const s = st.sum;
    if (s) {
      if (st.kind === 'return') sumHtml = `<div class="ve-sum"><span>المرتجعات اللي راحت له في الفترة دي:</span> <b>${esc(num(s.returns_n))}</b> <span>مرتجع</span> · <b dir="ltr">${esc(money(-num(s.returns)))}</b> <span>ج</span></div>`;
      else {
        sumHtml = `<div class="ve-sum"><span><span>فواتير</span> <b dir="ltr">${esc(money(s.purchases))}</b> (${esc(num(s.purchases_n))})</span> · <span><span>مرتجع</span> <b dir="ltr">${esc(money(-num(s.returns)))}</b> (${esc(num(s.returns_n))})</span> · <span><span>دفعات</span> <b dir="ltr">${esc(money(-num(s.payments)))}</b> (${esc(num(s.payments_n))})</span>`;
        if (s.opening != null && s.closing != null) sumHtml += `<small><span>رصيد أول الفترة</span> <span dir="ltr">${esc(money(s.opening))}</span> · <span>آخر الفترة</span> <span dir="ltr">${esc(money(s.closing))}</span></small>`;
        sumHtml += '</div>';
      }
    }
    $('veStSum').innerHTML = sumHtml;
    const status = $('veStStatus');
    if (st.error) { status.textContent = st.error; status.className = 'status bad'; }
    else if (st.busy && !st.rows.length) { status.textContent = 'بيجيب الحركة…'; status.className = 'status'; }
    else if (!st.rows.length) { status.textContent = 'مفيش حركة في الفترة دي.'; status.className = 'status'; }
    else { status.textContent = ''; status.className = 'status'; }
    $('veMoves').innerHTML = st.rows.map((m) => {
      const isOpen = m.kind === 'return' || st.open.has(String(m.id));
      const tagCls = m.kind === 'payment' ? 'pay' : m.kind === 'return' ? 'ret' : 'inv';
      const amt = m.kind === 'purchase' ? num(m.amount) : -num(m.amount);
      return `<div class="ve-move${isOpen ? ' open' : ''}"${m.kind === 'purchase' ? ` data-ve-move="${esc(m.id)}" role="button" tabindex="0"` : ''}>` +
        `<div class="ve-m1"><span><span class="ve-tag ${tagCls}">${esc(KIND[m.kind])}</span>${m.code ? ` <span class="ve-code" dir="ltr">${esc(m.code)}</span>` : ''}</span><b dir="ltr">${m.kind === 'purchase' ? '+' : '−'}${esc(money(amt))}</b></div>` +
        `<div class="ve-m2"><span>${esc(dayText(m.at))}</span> · <span>الرصيد بعدها</span> <span dir="ltr">${esc(money(m.balance))}</span></div>` +
        (isOpen && m.kind !== 'payment' ? linesHtml(m) : '') + '</div>';
    }).join('');
    $('veMore')?.classList.toggle('hidden', st.done || !st.rows.length);
  }
  function closeStatement() { st = null; it = null; show('list'); drawList(); }

  // ---------- an item's purchases ----------
  function openItem() {
    st = null;
    it = { item: null, kind: 'purchase', rows: [], done: false, busy: false, sum: null };
    show('item');
    $('veQ').value = '';
    drawItem();
    $('veQ').focus();
    try { history.pushState({ ve: 1 }, ''); } catch (e) {}
  }
  function find(q) {
    clearTimeout(findState.timer);
    q = String(q || '').trim();
    const el = $('veFind');
    if (q.length < 2) { el.innerHTML = ''; return; }
    el.innerHTML = '<p class="status">بيدوّر…</p>';
    findState.timer = setTimeout(async () => {
      const me = ++findState.seq;
      const { data, error } = await db().rpc('ar_vendor_find_items', { p_q: q, p_limit: 10 });
      if (me !== findState.seq) return;
      if (error) { el.innerHTML = `<p class="status bad">${esc(missing(error) ? 'الموردين لسه مش متاحين: محتاج تفعيل على السيرفر الأول.' : 'مقدرتش أدوّر: ' + error.message)}</p>`; return; }
      findState.hits = Array.isArray(data) ? data : [];
      el.innerHTML = findState.hits.length ? '<div class="sa-hits">' + findState.hits.map((x) =>
        `<button type="button" class="sa-hit" data-ve-item="${esc(x.id)}"><span class="notr" dir="ltr">${esc(x.name)}</span>${x.arabic_name ? `<small class="notr">${esc(x.arabic_name)}</small>` : ''}<em>${esc(num(x.buys))} <span>مرة اتشرى</span></em></button>`).join('') + '</div>'
        : '<p class="status">مفيش صنف بالاسم ده.</p>';
    }, 350);
  }
  async function loadItem(more) {
    const me = it;
    if (!me || !me.item || me.busy || (more && me.done)) return;
    me.busy = true; me.error = ''; drawItem();
    try {
      const tasks = [db().rpc('ar_vendor_item_moves', { p_item: me.item.id, p_kind: me.kind, p_before: more && me.rows.length ? me.rows[me.rows.length - 1].id : null, p_limit: PAGE })];
      if (!more) tasks.push(db().rpc('ar_vendor_item_summary', { p_item: me.item.id }));
      const [res, sum] = await Promise.all(tasks);
      if (res.error) throw res.error;
      if (it !== me) return;
      const got = Array.isArray(res.data) ? res.data : [];
      me.rows = more ? me.rows.concat(got) : got;
      me.done = got.length < PAGE;
      if (sum && !sum.error) me.sum = sum.data;
    } catch (e) {
      if (it === me) me.error = missing(e) ? 'الموردين لسه مش متاحين: محتاج تفعيل على السيرفر الأول.' : 'مقدرتش أجيب مشتريات الصنف: ' + (e && e.message);
    } finally {
      if (it === me) { me.busy = false; drawItem(); }
    }
  }
  function drawItem() {
    if (!it || !$('veItem')) return;
    $('veFindBox')?.classList.toggle('hidden', !!it.item);
    let head = '';
    if (it.item) {
      head = `<div class="sa-item"><div class="sa-item-n"><span class="notr" dir="ltr">${esc(it.item.name)}</span>${it.item.arabic_name ? `<small class="notr">${esc(it.item.arabic_name)}</small>` : ''}</div>`;
      const s = it.sum;
      if (s && num(s.buys)) {
        head += `<p><span>آخر سنة:</span> <b>${esc(money(s.packs))}</b> <span>علبة</span>${num(s.bonus) ? ` + <b>${esc(money(s.bonus))}</b> <span>بونص</span>` : ''} <span>من</span> <b>${esc(num(s.vendors))}</b> <span>موردين</span></p>`;
        if (s.best) head += `<p class="hint"><span>أحسن شرا:</span> <span>${esc(vendorName(s.best.vendor_id))}</span>${s.best.t != null ? ` <span>بخصم</span> <span dir="ltr">${esc(money(s.best.t))}%</span>` : ''} (<span>${esc(dayText(s.best.at))}</span>)</p>`;
      } else if (s) head += '<p class="hint">ما اتشراش في آخر سنة.</p>';
      head += '<button type="button" class="linklike" data-ve-item-clear>غيّر الصنف</button></div>';
    }
    $('veItemHead').innerHTML = head;
    $('veItemKinds')?.classList.toggle('hidden', !it.item);
    document.querySelectorAll('[data-ve-ikind]').forEach((x) => x.classList.toggle('on', x.dataset.veIkind === it.kind));
    const status = $('veItemStatus');
    if (it.error) { status.textContent = it.error; status.className = 'status bad'; }
    else if (it.item && it.busy && !it.rows.length) { status.textContent = 'بيجيب مشتريات الصنف…'; status.className = 'status'; }
    else if (it.item && !it.rows.length) { status.textContent = it.kind === 'return' ? 'ما اترجعش لأي مورد.' : 'ما اتشراش قبل كده.'; status.className = 'status'; }
    else { status.textContent = ''; status.className = 'status'; }
    $('veItemRows').innerHTML = it.item && it.rows.length
      ? '<table class="ve-lines ve-ih"><tr><th>التاريخ</th><th>المورد</th><th>الكمية</th><th>الخصم</th><th>الصلاحية</th></tr>' + it.rows.map((r) => {
        const l = r.line || {};
        return `<tr><td>${esc(dayText(r.at))}<small class="ve-code" dir="ltr">${esc(r.code || '')}</small></td><td>${esc(vendorName(r.vendor_id))}</td><td>${esc(qtyText(l))}</td><td class="n" dir="ltr">${l.t != null ? esc(money(l.t)) + '%' : '—'}</td><td class="exp">${esc(expText(l.x))}</td></tr>`;
      }).join('') + '</table>'
      : '';
    $('veItemMore')?.classList.toggle('hidden', !it.item || it.done || !it.rows.length);
  }

  // ---------- what the buttons do ----------
  let bound = false;
  function bind() {
    const panel = $('vendorsPanel');
    if (!panel || bound) return;
    bound = true;
    panel.addEventListener('click', (e) => {
      const vv = e.target.closest('[data-ve-view]');
      if (vv) { view = vv.dataset.veView; drawList(); return; }
      const o = e.target.closest('[data-ve-open]');
      if (o) { openStatement(o.dataset.veOpen); return; }
      if (e.target.closest('[data-ve-back]')) { if (history.state && history.state.ve) history.back(); else closeStatement(); return; }
      if (e.target.closest('#veItemBtn')) { openItem(); return; }
      const k = e.target.closest('[data-ve-kind]');
      if (k && st) { st.kind = k.dataset.veKind || null; st.rows = []; st.done = false; st.open.clear(); loadMoves(false); return; }
      if (e.target.closest('#veMore')) { loadMoves(true); return; }
      const mv = e.target.closest('[data-ve-move]');
      if (mv && st) { const id = mv.dataset.veMove; if (st.open.has(id)) st.open.delete(id); else st.open.add(id); drawSt(); return; }
      const hit = e.target.closest('[data-ve-item]');
      if (hit && it) {
        const x = findState.hits.find((h) => String(h.id) === hit.dataset.veItem);
        if (x) { it.item = { id: Number(x.id), name: x.name, arabic_name: x.arabic_name }; it.rows = []; it.sum = null; it.done = false; $('veFind').innerHTML = ''; loadItem(false); }
        return;
      }
      if (e.target.closest('[data-ve-item-clear]') && it) { it.item = null; it.rows = []; it.sum = null; drawItem(); $('veQ').value = ''; $('veQ').focus(); return; }
      const ik = e.target.closest('[data-ve-ikind]');
      if (ik && it && it.item) { it.kind = ik.dataset.veIkind; it.rows = []; it.done = false; loadItem(false); return; }
      if (e.target.closest('#veItemMore')) { loadItem(true); return; }
    });
    panel.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-ve-move]')) { e.preventDefault(); e.target.click(); } });
    const range = () => {
      if (!st) return;
      const r = { from: $('veFrom').value, to: $('veTo').value };
      if (!rangeArgs(r)) return;   // a field emptied while choosing: keep what is shown
      st.range = r; lastRange = r;
      try { localStorage.setItem(RANGE_KEY, JSON.stringify(r)); } catch (e) {}
      st.rows = []; st.done = false; st.open.clear(); loadMoves(false);
    };
    // the phone's date picker may only send «input»: both are listened to
    for (const ev of ['change', 'input']) { $('veFrom')?.addEventListener(ev, range); $('veTo')?.addEventListener(ev, range); }
    $('veQ')?.addEventListener('input', (e) => find(e.target.value));
    window.addEventListener('popstate', () => { if (st || it) closeStatement(); });
  }
  root.AskerVendors = { open, list: () => list, statement: (id) => openStatement(id) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
