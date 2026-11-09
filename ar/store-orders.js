/* «طلبات» tab (asker-nawaqes-arabic.html): orders from the store site (store.html, trial 2026-11-09, owner's choice «أ»).
   Table ar_store_orders (migration ar_store, owner only). The phone also says «طلب جديد من الموقع» (ar_sync_news).
   «واتساب» opens a chat with the customer and a ready confirmation message: the owner reads it, adds the delivery fee
   and sends it himself. Nothing is sent from here. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/store-orders.cjs) ----------
  const STATUS = { new: 'جديد', confirmed: 'اتأكد', done: 'اتسلّم', cancelled: 'اتلغى' };
  const money = (n) => {
    const x = Number(n);
    return isFinite(x) ? (Math.round(x * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
  };
  // 01xxxxxxxxx → https://wa.me/201xxxxxxxxx?text=…
  function waLink(phone, text) {
    const d = String(phone || '').replace(/\D/g, '');
    const intl = /^01\d{9}$/.test(d) ? '2' + d : d;
    return `https://wa.me/${intl}?text=${encodeURIComponent(text || '')}`;
  }
  function confirmMessage(o) {
    const lines = (o.items || []).map((x) => `- ${x.name} × ${x.qty} = ${money(x.line_total)} ج`);
    return [
      `أهلًا ${o.customer_name}، معاك صيدلية عسكر.`,
      `طلبك رقم ${o.id} وصلنا:`,
      ...lines,
      `الإجمالي ${money(o.total)} جنيه، والدفع كاش عند الاستلام.`,
      'مصاريف التوصيل: ',
      'نأكد الطلب؟',
    ].join('\n');
  }
  const api = { STATUS, money, waLink, confirmMessage };
  root.AskerStoreOrdersLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the tab ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const when = (iso) => (root.AskerDocsLib ? root.AskerDocsLib.when(iso) : new Date(iso).toLocaleString('ar-EG'));
  let orders = [];

  function say(text, kind) {
    const el = $('soStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  function card(o) {
    const items = (o.items || []).map((x) => `<li><span dir="ltr">${esc(x.name)}</span> × ${esc(x.qty)} <b>${esc(money(x.line_total))}</b></li>`).join('');
    const open = o.status === 'new' || o.status === 'confirmed';
    return `<div class="so-item so-${esc(o.status)}" data-order="${esc(o.id)}">
      <div class="so-head"><strong>#${esc(o.id)} · ${esc(o.customer_name)}</strong><span class="so-st">${esc(STATUS[o.status] || o.status)}</span></div>
      <span class="hint">${esc(when(o.created_at))} · <span dir="ltr">${esc(o.phone)}</span></span>
      <span class="hint">${esc(o.address)}</span>
      ${o.notes ? `<span class="hint">ملاحظة: ${esc(o.notes)}</span>` : ''}
      <ul class="so-lines">${items}</ul>
      <div class="so-total">الإجمالي ${esc(money(o.total))} ج (من غير التوصيل)</div>
      <div class="so-actions">
        <a class="so-wa" href="${esc(waLink(o.phone, confirmMessage(o)))}" target="_blank" rel="noopener">واتساب</a>
        ${o.status === 'new' ? `<button type="button" class="small" data-set="confirmed">اتأكد</button>` : ''}
        ${o.status === 'confirmed' ? `<button type="button" class="small" data-set="done">اتسلّم</button>` : ''}
        ${open ? `<button type="button" class="secondary small" data-set="cancelled">لغي</button>` : ''}
      </div>
    </div>`;
  }
  function draw() {
    const open = orders.filter((o) => o.status === 'new' || o.status === 'confirmed');
    const closed = orders.filter((o) => o.status === 'done' || o.status === 'cancelled').slice(0, 20);
    $('soOpenTitle').textContent = `مفتوحة (${open.length})`;
    $('soOpen').innerHTML = open.length ? open.map(card).join('') : '<p class="hint">مفيش طلبات مفتوحة.</p>';
    $('soClosedBox').classList.toggle('hidden', !closed.length);
    $('soClosed').innerHTML = closed.map(card).join('');
  }
  async function open() {
    if (!db()) return;
    try {
      const { data, error } = await db().from('ar_store_orders')
        .select('id,created_at,customer_name,phone,address,notes,items,total,status')
        .order('created_at', { ascending: false }).limit(80);
      if (error) throw error;
      orders = data || [];
      say('');
      draw();
    } catch (e) {
      say('مقدرتش أجيب الطلبات: ' + e.message, 'bad');
    }
  }
  async function setStatus(id, status, btn) {
    btn.disabled = true;
    try {
      const { error } = await db().from('ar_store_orders').update({ status }).eq('id', id);
      if (error) throw error;
      const o = orders.find((x) => String(x.id) === String(id));
      if (o) o.status = status;
      draw();
      say(`طلب #${id}: ${STATUS[status]}`, 'good');
    } catch (e) {
      btn.disabled = false;
      say('ماتغيّرش: ' + e.message, 'bad');
    }
  }
  $('storeOrdersPanel')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const item = b.closest('[data-order]');
    if (item) setStatus(item.dataset.order, b.dataset.set, b);
  });
  $('soRefresh')?.addEventListener('click', open);
  root.AskerStoreOrders = { open };
})(typeof window === 'undefined' ? globalThis : window);
