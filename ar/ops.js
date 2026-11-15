/* «الحسابات ← العمليات» (owner 2026-11-15: «عايز آدم ينفذ كل العمليات … بالصوت … وبعد كده تتنفذ أوتوماتيك على اللاب»).
   What Adam recorded by voice after the owner's spoken yes, and where each one stands:
   - a customer's payment / a supplier's payment (ar_ops), a sale / a return (ar_temp_sales, the «البيع المؤقت» list), newest first;
   - status: waiting (مستنية: the laptop enters it in PharmaFly later, on PharmaFly's own screens), done, failed, cancelled;
   - a waiting one can be cancelled here (the owner's own sign-in; the database refuses everything else).
   Migration 202611150400. Nothing here writes to PharmaFly. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/ops.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  function money(n) {
    const v = Math.abs(num(n)) < 0.005 ? 0 : num(n);
    const frac = Math.abs(v % 1) > 0.005;
    return v.toLocaleString('en-US', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  }
  const STATUS = { pending: 'مستنية', running: 'بتتنفذ', done: 'اتنفذت', failed: 'فشلت', cancelled: 'اتلغت', entered: 'اتنفذت' };
  const statusText = (s) => STATUS[s] || String(s || '');
  // one list from the two tables: [{key, table, id, at, status, text}] newest first
  function merge(ops, sales) {
    const out = [];
    for (const o of ops || []) {
      const cust = o.kind === 'customer_payment';
      out.push({
        key: 'op' + o.id, table: 'ar_ops', id: o.id, at: o.created_at, status: o.status,
        text: `${cust ? 'دفعة من عميل' : 'دفعة لمورد'}: ${o.party_name || '#' + o.party_id} · ${money(o.amount)} ج`,
      });
    }
    for (const s of sales || []) {
      const n = Array.isArray(s.items) ? s.items.length : 0;
      out.push({
        key: 'sale' + s.no, table: 'ar_temp_sales', id: s.no, at: s.created_at, status: s.status,
        text: `${s.kind === 'return' ? 'مرتجع' : 'بيعة'} رقم ${s.no}: ${s.customer_name || 'نقدي'} · ${n} صنف · ${money(s.total)} ج`,
      });
    }
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  const api = { money, statusText, merge, STATUS };
  root.AskerOpsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the screen ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let rows = [], loading = false;

  function clock(s) {
    const d = new Date(s);
    if (isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function draw(msg) {
    const el = $('opRows'), st = $('opStatus');
    if (!el) return;
    st.textContent = msg || '';
    st.className = msg ? 'status bad' : 'status';
    if (!rows.length) { el.innerHTML = msg ? '' : '<p class="hint">مفيش عمليات لسه. قول لآدم «سجّل دفعة …» أو «سجّل بيعة …».</p>'; return; }
    el.innerHTML = rows.map((r) => `<div class="op-row" data-op-row="${esc(r.key)}"><div class="op-t"><b>${esc(r.text)}</b><small>${esc(clock(r.at))}</small></div>` +
      `<span class="op-s op-${esc(r.status)}">${esc(statusText(r.status))}</span>` +
      (r.status === 'pending' ? `<button type="button" class="secondary small" data-op-cancel="${esc(r.key)}">إلغاء</button>` : '') + '</div>').join('');
  }
  async function load() {
    if (loading || !db()) return;
    loading = true;
    try {
      const [o, s] = await Promise.all([
        db().from('ar_ops').select('id,kind,party_id,party_name,amount,status,created_at').order('created_at', { ascending: false }).limit(40),
        db().from('ar_temp_sales').select('no,kind,customer_name,items,total,status,created_at').not('adam_request', 'is', null).order('created_at', { ascending: false }).limit(40),
      ]);
      if (o.error) throw o.error;
      if (s.error) throw s.error;
      rows = merge(o.data, s.data).slice(0, 60);
      draw('');
    } catch (e) {
      rows = [];
      draw(/schema cache|does not exist|Could not find/i.test(String(e && (e.message || e))) ? 'العمليات لسه مش متاحة: محتاجة تفعيل على السيرفر الأول.' : 'مقدرتش أجيب العمليات: ' + (e && e.message));
    } finally { loading = false; }
  }
  async function cancel(key) {
    const r = rows.find((x) => x.key === key);
    if (!r || r.status !== 'pending') return;
    const patch = { status: 'cancelled', updated_at: new Date().toISOString() };
    const q = r.table === 'ar_ops' ? db().from('ar_ops').update(patch).eq('id', r.id).eq('status', 'pending') : db().from('ar_temp_sales').update(patch).eq('no', r.id).eq('status', 'pending');
    const { error } = await q;
    if (error) { draw('مقدرتش ألغي: ' + error.message); return; }
    await load();
  }
  function bind() {
    $('opRows')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-op-cancel]');
      if (b) cancel(b.dataset.opCancel);
    });
    $('opRefresh')?.addEventListener('click', load);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  root.AskerOps = { open: load, list: () => rows };
})(typeof window === 'undefined' ? globalThis : window);
