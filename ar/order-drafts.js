/* «الطلبيات» tab (asker-nawaqes-arabic.html): the order advisor (owner's decisions of 2026-11-09, shape «ب: رسالة بالمورد»).
   The laptop (Hub\orders\BUILD_ORDER_DRAFTS.ps1, read only) builds ONE WhatsApp message per supplier from the bag and keeps it
   in the private bucket asker-private/orders/drafts.json. This tab only READS that file. Nothing is ever sent by itself:
   the owner edits the message, taps «انسخ الرسالة وافتح واتساب», sends it himself, then taps «علّمها اتطلب»: that writes
   the items that are still in the message to ar_orders (the same table the shortages tab uses, owner only). */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/order-drafts.cjs) ----------
  const PATH = 'orders/drafts.json';
  const OLD_HOURS = 36; // the laptop rebuilds after every shortages update (every 2 hours in the day); older than this = say so
  const MAX_URL_TEXT = 3000; // longer messages cannot ride in a wa.me link: WhatsApp opens empty and the owner pastes (it is already copied)
  const key = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const nk = (s) => key(s).slice(0, 250); // same key as ar/app.js, the function and the database
  const pad = (n) => String(n).padStart(2, '0');
  // «2026-11-08» -> «08/11»
  function dm(d) {
    const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(d || ''));
    return m ? `${m[3]}/${m[2]}` : '';
  }
  function pct(x) {
    const n = Math.round(Number(x) * 10) / 10;
    return Number.isFinite(n) ? String(n).replace(/\.0$/, '') : '';
  }
  function money(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  // the file must look like what the laptop writes; anything else is treated as «no drafts yet»
  function parseDrafts(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.suppliers)) return null;
    const suppliers = o.suppliers.filter((s) => s && s.id && Array.isArray(s.items) && s.items.length);
    return { generatedAt: o.generated_at || '', suppliers, noOffer: Array.isArray(o.no_offer) ? o.no_offer : [], summary: o.summary || {} };
  }
  // how old the numbers are, in words
  function age(iso, now = new Date()) {
    const t = new Date(iso);
    if (isNaN(t)) return { text: '', old: true };
    const h = (now - t) / 36e5;
    const day = (x) => x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const hh = t.getHours(), clock = (hh % 12 || 12) + ':' + pad(t.getMinutes()) + (hh < 12 ? ' ص' : ' م');
    const text = day(t) === day(now) ? 'النهارده ' + clock : day(t) === day(y) ? 'امبارح ' + clock : pad(t.getDate()) + '/' + pad(t.getMonth() + 1) + ' ' + clock;
    return { text, old: h > OLD_HOURS };
  }
  // one line under each item: where its discount came from, and anything the owner should look at
  function sourceNote(i) {
    const parts = [`خصم ${pct(i.discount)}%`];
    parts.push(i.source === 'list' ? `قايمة ${dm(i.source_date)}` : `آخر شرا ${dm(i.source_date)}`);
    if (i.bonus > 0) parts.push('فيه بونص');
    if (i.stale) parts.push('قديم، راجعه');
    if (i.mismatch && i.list && i.buy) parts.push(`القايمة ${pct(i.list.discount)}% وآخر شرا ${pct(i.buy.discount)}% (${dm(i.buy.date)})`);
    return parts.join(' · ');
  }
  function fallbackNote(i) {
    const f = i.fallback;
    if (!f) return '';
    return `لو مش متاح: ${f.label} ${pct(f.discount)}% (${f.source === 'list' ? 'قايمة' : 'آخر شرا'} ${dm(f.date)})`;
  }
  // the items still in the message after the owner's edits (an item he deleted is not marked «اتطلب»)
  function itemsInMessage(sup, text) {
    const lines = String(text || '').split('\n').map((l) => l.replace(/^[•\-*\s]+/, '').trim());
    return (sup.items || []).filter((i) => {
      const n = String(i.name_pf || '');
      return n && lines.some((l) => l.includes('(' + n + ')') || l.startsWith(n + ' ×') || l.startsWith(n + ' x') || l === n);
    });
  }
  const estTotal = (items) => items.reduce((s, i) => s + (Number(i.est_cost) || 0), 0);
  // WhatsApp link: with the text when it fits, otherwise a bare link (the text is on the clipboard)
  const urlText = (t) => (encodeURIComponent(t).length <= MAX_URL_TEXT ? t : '');
  const waLink = (t) => (t ? 'https://wa.me/?text=' + encodeURIComponent(t) : 'https://wa.me/');
  const api = { PATH, OLD_HOURS, MAX_URL_TEXT, key, nk, dm, pct, money, parseDrafts, age, sourceNote, fallbackNote, itemsInMessage, estTotal, urlText, waLink };
  root.AskerOrderDraftsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the tab ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const dayStart = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };
  let drafts = null, current = '', edits = {}, ordered = [], busy = false;

  function say(text, kind) {
    const el = $('odStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  const supplier = (id) => (drafts ? drafts.suppliers.find((s) => s.id === id) : null);
  // marked «اتطلب» today (from any supplier) for this PharmaFly name
  const orderedFrom = (i) => ordered.filter((o) => o.name_key === nk(i.name_pf)).map((o) => o.supplier || '');
  function row(i, supId) {
    const from = orderedFrom(i);
    const fb = fallbackNote(i);
    return `<div class="od-row${from.length ? ' od-done' : ''}">` + [
      `<strong dir="ltr">${esc(i.name_pf)}</strong>`,
      `<span>× ${esc(i.qty)}</span>`,
      from.length ? `<span class="od-badge">اتطلب النهارده${from.filter(Boolean).length ? ' من ' + esc([...new Set(from.filter(Boolean))].join(' و')) : ''}</span>` : '',
      `<span class="hint">${esc(sourceNote(i))}</span>`,
      fb ? `<span class="hint">${esc(fb)}</span>` : '',
    ].filter(Boolean).join(' ') + `</div>`;
  }
  function drawChips() {
    $('odChips').innerHTML = drafts.suppliers
      .map((s) => `<button type="button" class="chip${s.id === current ? ' on' : ''}" data-sup="${esc(s.id)}">${esc(s.label)} · ${esc(s.count || s.items.length)}</button>`)
      .join('');
  }
  function drawTotal() {
    const s = supplier(current);
    if (!s) return;
    const items = itemsInMessage(s, $('odMsg').value);
    $('odTotal').textContent = items.length ? `${items.length} صنف في الرسالة، حوالي ${money(estTotal(items))} ج بعد الخصم` : 'مفيش أصناف في الرسالة';
    $('odMark').disabled = busy || !items.length;
    $('odCopy').disabled = !$('odMsg').value.trim();
  }
  function drawSupplier() {
    const s = supplier(current);
    if (!s) return;
    $('odMsg').value = edits[current] != null ? edits[current] : s.message || '';
    $('odItemsTitle').textContent = `تفاصيل الأصناف (${s.items.length})`;
    $('odItems').innerHTML = s.items.map((i) => row(i, s.id)).join('');
    drawChips();
    drawTotal();
  }
  function draw() {
    const none = !drafts || !drafts.suppliers.length;
    $('odBody').classList.toggle('hidden', none);
    if (none) return;
    if (!supplier(current)) current = drafts.suppliers[0].id;
    const a = age(drafts.generatedAt);
    $('odInfo').textContent = `اتجهزت ${a.text}${a.old ? ' — قديمة، اللاب لسه ما حدّثهاش' : ''}`;
    $('odInfo').className = 'status' + (a.old ? ' bad' : '');
    drawSupplier();
    const no = drafts.noOffer || [];
    $('odNoBox').classList.toggle('hidden', !no.length);
    $('odNoTitle').textContent = `مفيش عليهم عرض (${no.length})`;
    $('odNo').innerHTML = no.map((i) => `<div class="od-row"><strong dir="ltr">${esc(i.name_pf)}</strong> <span>× ${esc(i.qty)}</span></div>`).join('');
  }
  async function loadOrdered() {
    try {
      const { data, error } = await db().from('ar_orders').select('id,name_key,product_name,supplier,ordered_at').gte('ordered_at', dayStart()).order('ordered_at', { ascending: true }).limit(2000);
      if (error) throw error;
      ordered = data || [];
    } catch (e) {
      ordered = [];
    }
  }
  async function open() {
    if (!db()) return;
    try {
      const { data: blob, error } = await db().storage.from('asker-private').download(PATH);
      if (error || !blob) {
        drafts = null;
        draw();
        return say('لسه مفيش طلبيات مقترحة: اللاب بيجهزها بعد كل تحديث للنواقص.');
      }
      drafts = parseDrafts(JSON.parse(await blob.text()));
      if (!drafts) {
        draw();
        return say('ملف الطلبيات شكله مش مظبوط، استنى التحديث الجاي.', 'bad');
      }
      await loadOrdered();
      say('');
      draw();
    } catch (e) {
      say('مقدرتش أجيب الطلبيات: ' + (e.message || e), 'bad');
    }
  }
  function pick(id) {
    if (current) edits[current] = $('odMsg').value; // keep what he typed when he moves to another supplier
    current = id;
    say('');
    drawSupplier();
  }
  async function copyAndOpen() {
    const t = $('odMsg').value.trim();
    if (!t) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(t);
      copied = true;
    } catch (e) {
      $('odMsg').select();
    }
    const link = urlText(t);
    if (root.AskerApp && root.AskerApp.openWhatsApp) root.AskerApp.openWhatsApp(link);
    else root.open(waLink(link), '_blank');
    say(
      (copied ? 'الرسالة اتنسخت واتفتح الواتس. ' : 'الواتس اتفتح، وانسخ الرسالة بإيدك. ') +
        (link ? 'اختار محادثة المورد وابعت.' : 'الرسالة طويلة: اختار محادثة المورد والزق الرسالة وابعت.') +
        ' بعد ما تبعت ارجع هنا ودوس «علّمها اتطلب».',
      'good',
    );
  }
  async function mark() {
    if (busy) return;
    const s = supplier(current);
    if (!s) return;
    const items = itemsInMessage(s, $('odMsg').value);
    if (!items.length) return say('مفيش أصناف في الرسالة تتعلّم.', 'bad');
    const rows = items
      .filter((i) => !ordered.some((o) => o.name_key === nk(i.name_pf) && (o.supplier || null) === s.label))
      .map((i) => ({ name_key: nk(i.name_pf), product_name: i.name_pf, supplier: s.label, ordered_at: new Date().toISOString() }));
    if (!rows.length) return say('الأصناف دي متعلّمة «اتطلب» من ' + s.label + ' قبل كده.', 'good');
    busy = true;
    drawTotal();
    try {
      const { error } = await db().from('ar_orders').insert(rows);
      if (error) throw error;
      await loadOrdered();
      drawSupplier();
      say(`اتعلّم ${rows.length} صنف «اتطلب» من ${s.label}. مش هيتقترحوا تاني النهارده في رسالة مورد تاني.`, 'good');
    } catch (e) {
      say('ماتسجلش «اتطلب»، دوس تاني: ' + (e.message || e), 'bad');
    } finally {
      busy = false;
      drawTotal();
    }
  }
  $('odChips')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sup]');
    if (b) pick(b.dataset.sup);
  });
  $('odMsg')?.addEventListener('input', () => {
    edits[current] = $('odMsg').value;
    drawTotal();
  });
  $('odCopy')?.addEventListener('click', copyAndOpen);
  $('odMark')?.addEventListener('click', mark);
  $('odRefresh')?.addEventListener('click', () => {
    edits = {}; // a fresh file means fresh messages
    open();
  });
  root.AskerOrderDrafts = { open };
})(typeof window === 'undefined' ? globalThis : window);
