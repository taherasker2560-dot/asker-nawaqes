/* «الطلبيات» tab (asker-nawaqes-arabic.html): the order advisor (owner's decisions of 2026-11-09).
   The laptop (Hub\orders\BUILD_ORDER_DRAFTS.ps1, read only) builds, for every supplier, the items whose discount is best there
   and keeps them in the private bucket asker-private/orders/drafts.json. This tab only READS that file.
   The order of a supplier = the items the owner leaves ticked, each with the quantity he types (under «تعديل»: photo, tick,
   monthly average, last discount, quantity). An item that is not ticked is not in the order.
   Nothing is ever sent by itself: «انسخ الرسالة وافتح واتساب» copies the message and opens that supplier's chat (the number saved
   under «الوارد» ← «الشركات»), he sends it himself, then «علّمها اتطلب» writes the ticked items to ar_orders (owner only). */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/order-drafts.cjs) ----------
  const PATH = 'orders/drafts.json';
  // the laptop prepares the orders every 2 hours with the stock (task PharmaYaqez_Orders_Evening: 10:40 .. 22:40) and a last
  // time an hour before closing (PharmaYaqez_Orders_Daily); older than a day and a half = say so
  const OLD_HOURS = 36;
  // the pharmacy's day: 9:00 to 2:00 (after midnight is still the same night), so a working day starts at 6:00
  const DAY_STARTS_AT = 6;
  const MAX_URL_TEXT = 3000; // longer messages cannot ride in a wa.me link: the chat opens empty and the owner pastes (it is already copied)
  const MAX_QTY = 9999;
  const DIST = ['PHARMA', 'IBNSINA']; // their lines use the PharmaFly name only
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
  // the start of the pharmacy's working day (6:00); at 1:00 at night it is still yesterday's 6:00
  function businessDayStart(now = new Date()) {
    const d = new Date(now);
    if (d.getHours() < DAY_STARTS_AT) d.setDate(d.getDate() - 1);
    d.setHours(DAY_STARTS_AT, 0, 0, 0);
    return d;
  }
  // the owner's rule (2026-11-10): what he picked and marked «اتطلب» today does not come back in the next suggestions
  // the same day (they are refreshed every 2 hours in the evening), so he does not order it twice. Only today's ORDERS
  // hide it («تمنع ظهوره فى طلبيه اليوم مش ظهورة فى النواقص»): the shortages list is not touched. Tomorrow it shows
  // again if it is still needed (ordered and not arrived). Suppliers left with nothing are dropped.
  function hideOrdered(d, orderedRows) {
    if (!d) return { drafts: d, hidden: 0 };
    const done = new Set((orderedRows || []).map((o) => o && o.name_key).filter(Boolean));
    if (!done.size) return { drafts: d, hidden: 0 };
    const gone = new Set();
    const keep = (i) => {
      const k = nk(i && i.name_pf);
      if (done.has(k)) { gone.add(k); return false; }
      return true;
    };
    const suppliers = d.suppliers.map((s) => ({ ...s, items: s.items.filter(keep) })).filter((s) => s.items.length)
      .map((s) => ({ ...s, count: s.items.length }));
    const noOffer = (d.noOffer || []).filter(keep);
    return { drafts: { ...d, suppliers, noOffer }, hidden: gone.size };
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
  // the last discount of the item at this supplier, where it came from, and anything the owner should look at
  function sourceNote(i) {
    const parts = [`آخر خصم ${pct(i.discount)}%`];
    parts.push(i.source === 'list' ? `قايمة ${dm(i.source_date)}` : `آخر شرا ${dm(i.source_date)}`);
    if (i.bonus > 0) parts.push('فيه بونص');
    if (i.stale) parts.push('قديم، راجعه');
    return parts.join(' · ');
  }
  // the list and the last real purchase disagree by more than 3 points: say both, so the owner can judge
  function mismatchNote(i) {
    return i.mismatch && i.list && i.buy ? `القايمة ${pct(i.list.discount)}% وآخر شرا ${pct(i.buy.discount)}% (${dm(i.buy.date)})` : '';
  }
  function fallbackNote(i) {
    const f = i.fallback;
    if (!f) return '';
    return `لو مش متاح: ${f.label} ${pct(f.discount)}% (${f.source === 'list' ? 'قايمة' : 'آخر شرا'} ${dm(f.date)})`;
  }
  const num = (x) => (x == null || x === '' || !Number.isFinite(Number(x)) ? '' : String(Math.round(Number(x) * 10) / 10).replace(/\.0$/, ''));
  // «المتوسط الشهري 84 · الرصيد 19» (the laptop's avg30 = average sales of the last 30 days; have = stock now)
  function avgNote(i) {
    const a = num(i.avg30), h = num(i.have);
    return [a !== '' ? `المتوسط الشهري ${a}` : '', h !== '' ? `الرصيد ${h}` : ''].filter(Boolean).join(' · ');
  }
  // a quantity typed by the owner: whole packs, 0 (or anything not a positive number) = not ordered
  function qtyOf(v) {
    const n = Number(String(v == null ? '' : v).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace('٫', '.').replace(',', '.').trim());
    return Number.isFinite(n) && n >= 1 ? Math.min(MAX_QTY, Math.floor(n)) : 0;
  }
  const nameFor = (supId, i) => (DIST.indexOf(supId) < 0 && i.name_supplier ? `${i.name_supplier} (${i.name_pf})` : i.name_pf);
  // what is ticked and how many of it, per item: starts with everything ticked at the laptop's suggested quantity
  function defaultSel(sup) {
    const st = {};
    for (const i of sup.items || []) st[String(i.item_id)] = { on: true, qty: String(i.qty) };
    return st;
  }
  // the items that go in the order: ticked, with a quantity of 1 or more
  function picked(sup, st) {
    const out = [];
    for (const i of sup.items || []) {
      const s = (st || {})[String(i.item_id)];
      const q = s && s.on ? qtyOf(s.qty) : 0;
      if (q) out.push({ item: i, qty: q });
    }
    return out;
  }
  function buildMessage(sup, st) {
    const p = picked(sup, st);
    if (!p.length) return '';
    return ['السلام عليكم', 'محتاج الأصناف دي:', ...p.map((x) => `• ${nameFor(sup.id, x.item)} × ${x.qty}`), 'شكرًا'].join('\n');
  }
  const unitCost = (i) => {
    const p = Number(i.public_price) || 0, d = Number(i.discount) || 0;
    return p > 0 ? p * (1 - d / 100) : (Number(i.est_cost) || 0) / (Number(i.qty) || 1);
  };
  const totalOf = (p) => p.reduce((s, x) => s + unitCost(x.item) * x.qty, 0);
  // WhatsApp link: with the number (opens that supplier's chat) and the text when it fits, otherwise without the text (it is on the clipboard)
  const urlText = (t) => (encodeURIComponent(t).length <= MAX_URL_TEXT ? t : '');
  // Egyptian mobile written 01xxxxxxxxx -> 201xxxxxxxxx (WhatsApp needs the country code); same as ar/app.js
  function waPhone(s) {
    let d = String(s || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\D/g, '');
    if (/^01\d{9}$/.test(d)) d = '2' + d;
    else if (/^00\d+/.test(d)) d = d.slice(2);
    return /^\d{8,15}$/.test(d) ? d : '';
  }
  const waLink = (t, phone) => 'https://wa.me/' + waPhone(phone) + (t ? '?text=' + encodeURIComponent(t) : '');
  // which saved companies (the ones under «الوارد» ← «الشركات», several people per supplier) belong to which supplier
  const fold = (s) => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[\s()\-_.]+/g, '');
  const KEYS = { NEWCITY: ['نيوسيتي'], AMG: ['ايهامجروب', 'amgroup', 'amg'], REDA: ['رضاعطيه'], ELFATH: ['الفتح'], PHARMA: ['فارما'], IBNSINA: ['ابنسينا'] };
  // the six suppliers an order can be sent to; the file's own label wins when that supplier has an order today
  const LABELS = { NEWCITY: 'نيو سيتي', AMG: 'AMG', REDA: 'رضا عطية', ELFATH: 'الفتح', PHARMA: 'فارما', IBNSINA: 'ابن سينا' };
  function sendOptions(d) {
    const own = new Map(((d && d.suppliers) || []).map((s) => [s.id, s.label]));
    return Object.keys(LABELS).map((id) => ({ id, label: own.get(id) || LABELS[id] }));
  }
  // the message of an order sent to another supplier: the PharmaFly names only (the other warehouse's own names do not fit)
  function buildMessageTo(sup, st, toId) {
    if (!toId || toId === sup.id) return buildMessage(sup, st);
    const p = picked(sup, st);
    if (!p.length) return '';
    return ['السلام عليكم', 'محتاج الأصناف دي:', ...p.map((x) => `• ${x.item.name_pf} × ${x.qty}`), 'شكرًا'].join('\n');
  }
  function contactsFor(supId, saved) {
    const keys = KEYS[supId] || [];
    return (saved || []).filter((c) => {
      const n = fold(c && c.name);
      if (supId === 'PHARMA' && n.includes('نيوسيتي')) return false; // «مخزن نيو سيتى فارما» is a New City contact
      return keys.some((k) => n.includes(k));
    });
  }
  // the remembered contact if it is still there, else the first one that has a number
  function chooseContact(list, remembered) {
    return (list || []).find((c) => c.name === remembered) || (list || []).find((c) => waPhone(c.phone)) || (list || [])[0] || null;
  }
  // the shape shown when an item has no approved photo (same shapes as the store)
  function shapeOf(name) {
    const n = ' ' + String(name || '').toUpperCase() + ' ';
    if (/\b(SYR|SYRUP|SUSP|SUSPENSION|ELIXIR|SOLUTION|ORAL SOL)\b|\d+\s*(ML|CC)\b.*\b(SYR|SUSP)|شراب/.test(n)) return 'bottle';
    if (/\b(AMP|AMPOULE|VIAL|VL|INJ|INJECTION|I\.?M\.?|I\.?V\.?|PEN|SYRINGE|UNIT\/ML)\b|حقن|امبول/.test(n)) return 'injection';
    if (/\b(DROP|DROPS|E\.?D\.?|EYE|EAR|NASAL|NSE)\b|نقط|قطرة/.test(n)) return 'drops';
    if (/\b(CREAM|CREA|CR|OINT|OINTMENT|GEL|LOTION|LOT|PASTE)\b|كريم|مرهم|جل/.test(n)) return 'tube';
    if (/\b(SPRAY|INH|INHALER|AEROSOL|FOAM)\b|بخاخ|سبراي/.test(n)) return 'spray';
    if (/\b(MILK|FORMULA)\b|\d+\s*(G|GM|GR)\b/.test(n)) return 'can';
    if (/\b(TAB|TABS|TABLET|TABLETS|T|CAP|CAPS|CAPSULE|CAPSULES|EFF|SACH|SACHETS)\b|\d+\s*(T|TAB|CAP)\b|قرص|كبسول|اكياس/.test(n)) return 'pills';
    return 'box';
  }
  const api = { PATH, OLD_HOURS, DAY_STARTS_AT, MAX_URL_TEXT, MAX_QTY, key, nk, dm, pct, money, parseDrafts, businessDayStart, hideOrdered, age, sourceNote, mismatchNote, fallbackNote, avgNote, qtyOf, nameFor, defaultSel, picked, buildMessage, unitCost, totalOf, urlText, waPhone, waLink, fold, contactsFor, chooseContact, shapeOf, LABELS, sendOptions, buildMessageTo };
  root.AskerOrderDraftsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the tab ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const dayStart = () => businessDayStart().toISOString();
  const ICONS = {
    pills: '<rect x="3" y="9" width="18" height="6" rx="3"/><path d="M12 9v6"/>',
    bottle: '<path d="M9 3h6v3l2 3v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9l2-3z"/><path d="M7 12h10"/>',
    injection: '<path d="M18 2l4 4M17 7l-9 9-3 1 1-3 9-9zM14 4l6 6M3 21l3-3"/>',
    drops: '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/>',
    tube: '<path d="M8 3h8l-1 4H9zM9 7h6v12a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/>',
    spray: '<path d="M9 8h6v13H9zM10 8V5h4v3M14 5h3M18 3v1M19 6h1"/>',
    can: '<ellipse cx="12" cy="5" rx="7" ry="2"/><path d="M5 5v14c0 1.1 3.1 2 7 2s7-.9 7-2V5"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
  };
  const CHOICE = 'ar-draft-contact'; // the contact picked for each supplier, remembered on this phone
  let drafts = null, current = '', sel = {}, ordered = [], saved = [], pics = {}, busy = false, editing = false, choice = {};
  // which supplier each order is sent to (the owner may send it to another one); not kept on the phone
  let sendTo = {};
  try {
    const c = JSON.parse(localStorage.getItem(CHOICE) || '{}');
    if (c && typeof c === 'object') choice = c;
  } catch (e) {}

  function say(text, kind) {
    const el = $('odStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  const supplier = (id) => (drafts ? drafts.suppliers.find((s) => s.id === id) : null);
  const state = (id) => sel[id] || (sel[id] = defaultSel(supplier(id)));
  // marked «اتطلب» today (from any supplier) for this PharmaFly name
  const orderedFrom = (i) => ordered.filter((o) => o.name_key === nk(i.name_pf)).map((o) => o.supplier || '');
  const toId = () => sendTo[current] || current;
  const labelOf = (id) => (sendOptions(drafts).find((x) => x.id === id) || { label: id }).label;
  const target = () => chooseContact(contactsFor(toId(), saved), choice[toId()]);

  function thumb(i) {
    const f = pics[String(i.item_id)];
    if (f) return `<span class="od-thumb"><img src="store/img/${esc(f)}" alt="" loading="lazy"></span>`;
    return `<span class="od-thumb icon" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[shapeOf(i.name_pf)]}</svg></span>`;
  }
  function row(i, st) {
    const from = orderedFrom(i).filter(Boolean);
    const lines = [
      `<strong dir="ltr">${esc(i.name_pf)}</strong>`,
      avgNote(i) ? `<span class="od-avg">${esc(avgNote(i))}</span>` : '',
      `<span class="hint">${esc(sourceNote(i))}</span>`,
      mismatchNote(i) ? `<span class="od-warn">${esc(mismatchNote(i))}</span>` : '',
      fallbackNote(i) ? `<span class="hint">${esc(fallbackNote(i))}</span>` : '',
      from.length ? `<span class="od-badge">اتطلب النهارده من ${esc([...new Set(from)].join(' و'))}</span>` : '',
    ].filter(Boolean).join(' ');
    return `<div class="od-item${st.on ? '' : ' off'}" data-k="${esc(String(i.item_id))}">` +
      `<label class="od-check"><input type="checkbox" data-on${st.on ? ' checked' : ''} aria-label="هطلب ${esc(i.name_pf)}"></label>` +
      thumb(i) + `<div class="od-info">${lines}</div>` +
      `<label class="od-qty"><span>الكمية</span><input type="number" inputmode="numeric" min="0" max="${MAX_QTY}" step="1" data-qty value="${esc(st.qty)}"></label></div>`;
  }
  function drawChips() {
    $('odChips').innerHTML = drafts.suppliers
      .map((s) => `<button type="button" class="chip${s.id === current ? ' on' : ''}" data-sup="${esc(s.id)}">${esc(s.label)} · ${esc(s.count || s.items.length)}</button>`)
      .join('');
  }
  // «هتتفتح محادثة: …» and, when the supplier has several saved people, a button for each
  // «ابعت الطلبية دي لـ»: the six suppliers, this order's own supplier first chosen; another one = a note that the
  // discounts and prices shown are the first supplier's
  function drawSendTo() {
    const s = supplier(current), box = $('odSendTo');
    if (!s || !box) return;
    box.innerHTML = sendOptions(drafts).map((o) => `<option value="${esc(o.id)}"${o.id === toId() ? ' selected' : ''}>${esc(o.label)}${o.id === s.id ? ' (المقترح)' : ''}</option>`).join('');
    const other = toId() !== s.id;
    $('odSendNote').classList.toggle('hidden', !other);
    $('odSendNote').textContent = other ? `الطلبية دي اتعملت لـ ${s.label}: الخصم والأسعار اللي فيها بتاعته، مش بتاعة ${labelOf(toId())}. الأصناف هتتكتب بأسامي فارمافلاي.` : '';
  }
  function drawTarget() {
    const list = contactsFor(toId(), saved), c = target();
    if (!list.length) {
      $('odTo').textContent = 'مفيش رقم محفوظ للمورد ده، فالواتس هيتفتح من غير محادثة. ضيف رقمه من «الوارد» ← «الشركات».';
      $('odPick').innerHTML = '';
      return;
    }
    $('odTo').textContent = waPhone(c.phone) ? `هتتفتح محادثة: ${c.name}` : `${c.name} ملوش رقم محفوظ، فالواتس هيتفتح من غير محادثة.`;
    $('odPick').innerHTML = list.length > 1
      ? list.map((x) => `<button type="button" class="small${x.name === c.name ? '' : ' secondary'}" data-contact="${esc(x.name)}">${esc(x.name)}</button>`).join(' ')
      : '';
  }
  // the message and the total follow the ticks and quantities; the rows themselves are not redrawn (typing keeps its place)
  function drawOrder() {
    const s = supplier(current);
    if (!s) return;
    const p = picked(s, state(current));
    $('odMsg').value = buildMessageTo(s, state(current), toId());
    $('odTotal').textContent = p.length ? `${p.length} من ${s.items.length} صنف في الطلب، حوالي ${money(totalOf(p))} ج بعد الخصم` : 'مفيش أصناف معلّم عليها في الطلب';
    $('odCopy').disabled = !p.length;
    $('odMark').disabled = busy || !p.length;
    $('odEditCount').textContent = `هتطلب ${p.length} من ${s.items.length}`;
  }
  function drawRows() {
    const s = supplier(current);
    $('odEditBox').classList.toggle('hidden', !editing);
    $('odEdit').textContent = editing ? 'اقفل التعديل' : 'تعديل الأصناف';
    $('odEdit').setAttribute('aria-expanded', editing ? 'true' : 'false');
    $('odItems').innerHTML = editing && s ? s.items.map((i) => row(i, state(current)[String(i.item_id)])).join('') : '';
  }
  function drawSupplier() {
    if (!supplier(current)) return;
    drawChips();
    drawSendTo();
    drawTarget();
    drawOrder();
    drawRows();
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
  async function soft(p, d) {
    try {
      return await p;
    } catch (e) {
      return d;
    }
  }
  async function loadOrdered() {
    const { data, error } = await db().from('ar_orders').select('id,name_key,product_name,supplier,ordered_at').gte('ordered_at', dayStart()).order('ordered_at', { ascending: true }).limit(2000);
    if (error) throw error;
    return data || [];
  }
  async function loadSaved() {
    const { data, error } = await db().from('ar_suppliers').select('name,phone').order('name');
    if (error) throw error;
    return data || [];
  }
  // photos the owner approved for the store (store/img/index.json = {item id: file}); the rest get a shape
  async function loadPics() {
    const r = await fetch('store/img/index.json', { cache: 'no-cache' });
    return r.ok ? await r.json() : {};
  }
  async function open() {
    if (!db()) return;
    try {
      const { data: blob, error } = await db().storage.from('asker-private').download(PATH);
      if (error || !blob) {
        drafts = null;
        draw();
        return say('لسه مفيش طلبيات مقترحة: اللاب بيجهزها كل ساعتين مع المخزون، وآخر مرة قبل القفل بساعة.');
      }
      drafts = parseDrafts(JSON.parse(await blob.text()));
      if (!drafts) {
        draw();
        return say('ملف الطلبيات شكله مش مظبوط، استنى التحديث الجاي.', 'bad');
      }
      [ordered, saved, pics] = await Promise.all([soft(loadOrdered(), []), soft(loadSaved(), []), soft(loadPics(), {})]);
      const h = hideOrdered(drafts, ordered);
      drafts = h.drafts;
      say(h.hidden ? `${h.hidden} صنف اتطلبوا النهارده، فمش هيظهروا تاني في طلبيات النهارده (النواقص زي ما هي).` : '');
      draw();
    } catch (e) {
      say('مقدرتش أجيب الطلبيات: ' + (e.message || e), 'bad');
    }
  }
  function pick(id) {
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
    const c = target(), phone = c && waPhone(c.phone) ? c.phone : '', link = urlText(t);
    if (root.AskerApp && root.AskerApp.openWhatsApp) root.AskerApp.openWhatsApp(link, phone);
    else root.open(waLink(link, phone), '_blank');
    say(
      (copied ? 'الرسالة اتنسخت. ' : 'انسخ الرسالة بإيدك. ') +
        (phone ? `اتفتحت محادثة ${c.name}. ` : 'الواتس اتفتح من غير محادثة، اختار المورد. ') +
        (link ? 'اضغط إرسال هناك.' : 'الرسالة طويلة: الزقها في المحادثة وابعت.') +
        ' بعد ما تبعت ارجع هنا ودوس «علّمها اتطلب».',
      'good',
    );
  }
  async function mark() {
    if (busy) return;
    const s = supplier(current);
    if (!s) return;
    const items = picked(s, state(current)).map((x) => x.item);
    if (!items.length) return say('مفيش أصناف معلّم عليها تتعلّم.', 'bad');
    // marked under the supplier it was really sent to (the owner may have changed it)
    const to = labelOf(toId());
    const rows = items
      .filter((i) => !ordered.some((o) => o.name_key === nk(i.name_pf) && (o.supplier || null) === to))
      .map((i) => ({ name_key: nk(i.name_pf), product_name: i.name_pf, supplier: to, ordered_at: new Date().toISOString() }));
    if (!rows.length) return say('الأصناف دي متعلّمة «اتطلب» من ' + to + ' قبل كده.', 'good');
    busy = true;
    drawOrder();
    try {
      const { error } = await db().from('ar_orders').insert(rows);
      if (error) throw error;
      ordered = await soft(loadOrdered(), ordered);
      drawRows();
      say(`اتعلّم ${rows.length} صنف «اتطلب» من ${to}. مش هيتقترحوا تاني النهارده في طلب مورد تاني.`, 'good');
    } catch (e) {
      say('ماتسجلش «اتطلب»، دوس تاني: ' + (e.message || e), 'bad');
    } finally {
      busy = false;
      drawOrder();
    }
  }
  $('odChips')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sup]');
    if (b) pick(b.dataset.sup);
  });
  $('odPick')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-contact]');
    if (!b) return;
    choice[toId()] = b.dataset.contact;
    try {
      localStorage.setItem(CHOICE, JSON.stringify(choice));
    } catch (err) {}
    drawTarget();
  });
  $('odSendTo')?.addEventListener('change', (e) => {
    sendTo[current] = e.target.value === current ? '' : e.target.value;
    say('');
    drawSendTo();
    drawTarget();
    drawOrder();
  });
  $('odEdit')?.addEventListener('click', () => {
    editing = !editing;
    drawRows();
  });
  // ticks and quantities (delegated: one listener for all the rows)
  $('odItems')?.addEventListener('change', (e) => {
    const r = e.target.closest('[data-k]');
    if (!r || !e.target.matches('[data-on]')) return;
    state(current)[r.dataset.k].on = e.target.checked;
    r.classList.toggle('off', !e.target.checked);
    drawOrder();
  });
  $('odItems')?.addEventListener('input', (e) => {
    const r = e.target.closest('[data-k]');
    if (!r || !e.target.matches('[data-qty]')) return;
    state(current)[r.dataset.k].qty = e.target.value;
    drawOrder();
  });
  const setAll = (on) => {
    const st = state(current);
    for (const k of Object.keys(st)) st[k].on = on;
    drawRows();
    drawOrder();
  };
  $('odAll')?.addEventListener('click', () => setAll(true));
  $('odNone')?.addEventListener('click', () => setAll(false));
  $('odCopy')?.addEventListener('click', copyAndOpen);
  $('odMark')?.addEventListener('click', mark);
  $('odRefresh')?.addEventListener('click', () => {
    sel = {}; // a fresh file means fresh quantities
    open();
  });
  root.AskerOrderDrafts = { open };
})(typeof window === 'undefined' ? globalThis : window);
