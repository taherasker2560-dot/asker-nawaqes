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
    // طلب روشتة بس: الأسعار بيكتبها صاحب الصيدلية بعد ما يقرا الروشتة
    if (!(o.items || []).length) {
      return [
        `أهلًا ${o.customer_name}، معاك صيدلية عسكر.`,
        `الروشتة (طلب رقم ${o.id}) وصلتنا، ودي الأدوية والأسعار:`,
        '- ',
        'الإجمالي:  جنيه، والدفع كاش عند الاستلام.',
        'مصاريف التوصيل: ',
        'نأكد الطلب؟',
      ].join('\n');
    }
    // الصنف «بالطلب» مالوش سعر: صاحب الصيدلية بيكتبه في الرسالة (2026-11-10)
    const lines = (o.items || []).map((x) => (x.on_order ? `- ${x.name} × ${x.qty} = (بالطلب) ج` : `- ${x.name} × ${x.qty} = ${money(x.line_total)} ج`));
    const later = (o.items || []).some((x) => x.on_order);
    return [
      `أهلًا ${o.customer_name}، معاك صيدلية عسكر.`,
      `طلبك رقم ${o.id} وصلنا:`,
      ...lines,
      later ? `الإجمالي ${money(o.total)} جنيه + الأصناف اللي بالطلب، والدفع كاش عند الاستلام.` : `الإجمالي ${money(o.total)} جنيه، والدفع كاش عند الاستلام.`,
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
  let rxUrls = {};
  function card(o) {
    // free_text = a line the customer typed (not on the site), 2026-11-12
    const items = (o.items || []).map((x) => `<li><span dir="ltr">${esc(x.name)}</span> × ${esc(x.qty)} <b>${x.on_order ? 'بالطلب' : esc(money(x.line_total))}</b>${x.free_text ? ' <small>(كتبه الزبون)</small>' : ''}</li>`).join('');
    const later = (o.items || []).filter((x) => x.on_order).length;
    const open = o.status === 'new' || o.status === 'confirmed';
    const rx = (o.rx_paths || []).map((p, i) => /\.pdf$/.test(p)
      ? `<a class="so-rx so-rx-pdf" href="${esc(rxUrls[p] || '#')}" target="_blank" rel="noopener">PDF</a>`
      : `<a class="so-rx" href="${esc(rxUrls[p] || '#')}" target="_blank" rel="noopener"><img src="${esc(rxUrls[p] || '')}" alt="الروشتة ${i + 1}" loading="lazy"></a>`).join('');
    return `<div class="so-item so-${esc(o.status)}" data-order="${esc(o.id)}">
      <div class="so-head"><strong>#${esc(o.id)} · ${esc(o.customer_name)}</strong><span class="so-st">${esc(STATUS[o.status] || o.status)}</span></div>
      <span class="hint">${esc(when(o.created_at))} · <span dir="ltr">${esc(o.phone)}</span></span>
      <span class="hint">${esc(o.address)}</span>
      ${o.notes ? `<span class="hint">ملاحظة: ${esc(o.notes)}</span>` : ''}
      ${rx ? `<div class="so-rxs"><span class="hint">${items ? 'ومعاه روشتة:' : 'طلب بالروشتة: اقراها واكتب الأسعار في رسالة الواتساب'}</span>${rx}</div>` : ''}
      ${items ? `<ul class="so-lines">${items}</ul>
      <div class="so-total">الإجمالي ${esc(money(o.total))} ج (من غير التوصيل${rx ? ' والروشتة' : ''}${later ? `، و${later} صنف بالطلب لسه من غير سعر` : ''})</div>` : ''}
      <div class="so-actions">
        <a class="so-wa" href="${esc(waLink(o.phone, confirmMessage(o)))}" target="_blank" rel="noopener">واتساب</a>
        ${o.status === 'new' ? `<button type="button" class="small" data-set="confirmed">اتأكد</button>` : ''}
        ${o.status === 'confirmed' ? `<button type="button" class="small" data-set="done">اتسلّم</button>` : ''}
        ${open ? `<button type="button" class="secondary small" data-set="cancelled">لغي</button>` : ''}
        ${open ? '' : '<button type="button" class="secondary small so-del" data-del>🗑 امسح</button>'}
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
        .select('*')
        .order('created_at', { ascending: false }).limit(80);
      if (error) throw error;
      orders = data || [];
      // صور الروشتات: روابط مؤقتة (ساعة) من المكان الخاص ar-store-rx
      const paths = [...new Set(orders.flatMap((o) => o.rx_paths || []))];
      rxUrls = {};
      if (paths.length) {
        const { data: signed } = await db().storage.from('ar-store-rx').createSignedUrls(paths, 3600);
        for (const s of signed || []) if (s && s.path && s.signedUrl) rxUrls[s.path] = s.signedUrl;
      }
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
  // «امسح» (owner 2026-11-13): a delivered or cancelled order leaves for good, with its prescription photos; an open
  // order can't be deleted (it is cancelled first)
  async function remove(ids, btn) {
    const gone = orders.filter((o) => ids.includes(String(o.id)) && (o.status === 'done' || o.status === 'cancelled'));
    if (!gone.length) return;
    const ask = gone.length === 1 ? `تمسح طلب #${gone[0].id} نهائي؟ مش هيرجع تاني.` : `تمسح ${gone.length} طلب خلصوا نهائي؟ مش هيرجعوا تاني.`;
    if (!root.confirm(ask)) return;
    btn.disabled = true;
    try {
      const { error } = await db().from('ar_store_orders').delete().in('id', gone.map((o) => o.id)).in('status', ['done', 'cancelled']);
      if (error) throw error;
      const files = gone.flatMap((o) => o.rx_paths || []);
      if (files.length) { try { await db().storage.from('ar-store-rx').remove(files); } catch (err) { /* the photos stay; the order is gone */ } }
      orders = orders.filter((o) => !gone.includes(o));
      draw();
      say(gone.length === 1 ? `طلب #${gone[0].id} اتمسح` : `${gone.length} طلب اتمسحوا`, 'good');
    } catch (e) {
      btn.disabled = false;
      say('ماتمسحش: ' + e.message, 'bad');
    }
  }
  $('storeOrdersPanel')?.addEventListener('click', (e) => {
    if (e.target.closest('#soDelAll')) return remove(orders.filter((o) => o.status === 'done' || o.status === 'cancelled').map((o) => String(o.id)), e.target.closest('#soDelAll'));
    const d = e.target.closest('[data-del]');
    if (d) { const it = d.closest('[data-order]'); if (it) remove([it.dataset.order], d); return; }
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const item = b.closest('[data-order]');
    if (item) setStatus(item.dataset.order, b.dataset.set, b);
  });
  $('soRefresh')?.addEventListener('click', open);
  root.AskerStoreOrders = { open };
})(typeof window === 'undefined' ? globalThis : window);
