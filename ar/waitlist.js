/* «المشتريات ← طلبيات ← الانتظار» (owner 2026-11-19, from his own routine; mockup mockups/waitlist_2026-11-19.png, «ايوة»).
   When a customer asks for a medicine the pharmacy does not have, he messages a supplier at once, takes the customer's number and writes the
   drug's name next to it; when it arrives (while he enters the purchase invoices) it goes on the «waiting» shelf and he calls the customers; what a
   customer does not take he returns to the supplier (one month to a warehouse, one week to a distribution center) or keeps, by his own view.
   1) «+ طلب مش موجود»: the drug (searched in the system's items, or typed as it is), the customer's number (+ name, quantity), the supplier (his
      kind, warehouse or distribution center, is asked once) → saved, and the supplier's message is copied (he sends it; nothing is sent by itself).
   2) «📞 كلّم دول»: what arrived and was not called yet: call / WhatsApp (a ready message) / «اتسلّم».
   3) «مستنيين الدوا»: asked from the supplier, not here yet («وصل» by hand when the stock list does not show it).
   4) «↩️ قرار الرجوع»: what is here and not delivered: how long it has been, the days left to return, sold in the last year, the price, the nearest
      expiry in stock (flagged under 18 months, his own rule of the short-dated report). No «slow» or «expensive» label: the numbers are his to read.
   The server (migration 202611190500) finds the arrival by itself (the stock list shows more than at the request). Nothing here writes
   to PharmaFly or sends a message.
   Who: the owner, and (owner 2026-11-20, migration 202611201500) a staff member with the «الانتظار» switch (key `wait`): he adds a request, calls, marks «اتسلّم» / «إلغاء»; the
   returns decisions, the suppliers and the private numbers never reach him (the server sends none of it; this page only hides the buttons).
   «📒 دفتر الأرقام» (owner only): his numbers, each markable «🔒 خاص» = the staff never see it, one by one or all that are shown. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/waitlist.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const digits = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  // a mobile number as he types it (spaces, +20, a missing 0, Arabic digits) → 01xxxxxxxxx; '' when it is not one
  function normPhone(s) {
    let d = digits(s).replace(/\D/g, '');
    if (/^00201\d{9}$/.test(d)) d = d.slice(3);
    if (/^201\d{9}$/.test(d)) d = d.slice(1);
    if (/^1\d{9}$/.test(d)) d = '0' + d;
    return /^01\d{9}$/.test(d) ? d : '';
  }
  // the card's name carries the mobile number after an underscore («أحمد محمود_01001112223»)
  const cleanName = (s) => String(s || '').replace(/[_\s]*\d{8,}\s*$/, '').replace(/\s+/g, ' ').trim();
  // the quantity he typed: a number from 1 to 999 (Arabic digits read); '' = one
  function parseQty(s) {
    const t = digits(s).replace(/[٫]/g, '.').trim();
    if (t === '') return 1;
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return NaN;
    const n = Number(t);
    return n > 0 && n <= 999 ? n : NaN;
  }
  const qtyWord = (q) => (q === 1 ? 'علبة' : q === 2 ? 'علبتين' : `${q} علب`);
  // the message he sends to the supplier (copied, never sent by itself): no customer's name or number in it
  const vendorMsg = (item, qty) => `السلام عليكم\nمحتاج ${qtyWord(num(qty) || 1)} ${item} لو متوفر.\nابعتلي السعر والخصم.\nشكرًا.`;
  // the waiting requests of ONE supplier as one list (owner 2026-11-20: a WhatsApp for the waiting items to the supplier's telesales): the same item once with the quantities added; the customer's name and number are never in it
  function waitingList(rows) {
    const at = new Map(), out = [];
    for (const r of rows || []) {
      const key = r.item_id != null ? 'i' + r.item_id : 't' + String(r.item || '').toLowerCase();
      let e = at.get(key);
      if (!e) { e = { item: r.item, qty: 0 }; at.set(key, e); out.push(e); }
      e.qty += num(r.qty) || 1;
    }
    return out;
  }
  const vendorListMsg = (items) => `السلام عليكم\nمحتاج:\n${items.map((x, i) => `${i + 1}) ${qtyWord(num(x.qty) || 1)} ${x.item}`).join('\n')}\nابعتلي السعر والخصم.\nشكرًا.`;
  // the message to the customer when it is here (a WhatsApp link: he presses send)
  const customerMsg = (item) => `أهلًا بحضرتك، الدوا اللي سألت عليه (${item}) وصل في الصيدلية. تقدر تعدّي تاخده. شكرًا.`;
  const waLink = (phone, text) => `https://wa.me/2${phone}?text=${encodeURIComponent(text)}`;
  const telLink = (phone) => `tel:${phone}`;
  const kindText = (k) => (k === 'warehouse' ? 'مخزن' : k === 'center' ? 'مركز توزيع' : '');
  const KIND_DAYS = { warehouse: 30, center: 7 };
  // «وصل من يومين» / «اتطلب النهارده»: how long ago (whole days), one whole sentence so the English page can translate it
  function ago(prefix, n) {
    n = Math.max(0, Math.floor(num(n)));
    return n === 0 ? `${prefix} النهارده` : n === 1 ? `${prefix} من يوم` : n === 2 ? `${prefix} من يومين` : n <= 10 ? `${prefix} من ${n} أيام` : `${prefix} من ${n} يوم`;
  }
  // the time left to return it, in words (left_days from the server: return days minus days here; null = the supplier's kind is not set)
  function leftText(left) {
    if (left == null) return 'حدد نوع المورد عشان يظهر ميعاد الرجوع';
    const n = Math.floor(num(left));
    if (n < 0) return `عدّى ميعاد الرجوع من ${-n} يوم`;
    return n === 0 ? 'آخر يوم للرجوع النهارده' : n === 1 ? 'فاضل يوم على الرجوع' : n === 2 ? 'فاضل يومين على الرجوع' : n <= 10 ? `فاضل ${n} أيام على الرجوع` : `فاضل ${n} يوم على الرجوع`;
  }
  const DAY_MS = 864e5;
  const daysLeft = (r, now) => (r.return_days == null || !r.arrived_at ? null : Math.floor(num(r.return_days)) - Math.floor(((now || Date.now()) - new Date(r.arrived_at).getTime()) / DAY_MS));
  // from the rows that are here (status arrived): how many are to be called, and how many are within 2 days of their return deadline (or past it)
  function needs(rows, now) {
    let call = 0, near = 0;
    for (const r of rows || []) {
      if (r.status !== 'arrived') continue;
      if (!r.called_at) call++;
      const l = daysLeft(r, now);
      if (l != null && l <= 2) near++;
    }
    return { call, near };
  }
  // the ones to call, one card per medicine: [{key, item, rows}] in the order they came
  function groupCall(list) {
    const out = [], at = {};
    for (const r of list || []) {
      const key = r.item_id != null ? 'i' + r.item_id : 't' + String(r.item || '').toLowerCase();
      if (at[key] == null) { at[key] = out.length; out.push({ key, item: r.item, rows: [] }); }
      out[at[key]].rows.push(r);
    }
    return out;
  }
  const ERR = {
    item: 'الصنف ده مش موجود في السيستم.', name: 'اكتب اسم الدوا.', phone: 'رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01.', qty: 'الكمية من 1 لـ 999.',
    vendor: 'المورد ده مش موجود.', kind: 'اختار مخزن ولا مركز توزيع.', state: 'الطلب ده اتغيّر قبل كده. حدّث الصفحة.', missing: 'الطلب ده مش موجود.', action: 'مقدرتش أكمّل. جرّب تاني.',
  };
  const errText = (code) => ERR[code] || 'مقدرتش أكمّل. جرّب تاني.';
  // ---- the book of numbers (owner 2026-11-20, migration 202611201300): his phone's contacts, owner only ----
  // a name as a key to search: Arabic letters unified, Arabic digits read, no marks («عميل ١٢١» is found by «عميل 121»)
  const nameKey = (s) => digits(s).normalize('NFKC').replace(/[یى]/g, 'ي').replace(/ک/g, 'ك').replace(/[ھة]/g, 'ه').replace(/[أإآٱ]/g, 'ا')
    .replace(/[ً-ٰٟـ]/g, '').toLowerCase().replace(/[^a-z0-9ء-ي]+/g, ' ').replace(/\s+/g, ' ').trim();
  function makeBook(rows) {
    const list = (rows || []).map((r) => ({ phone: String(r.phone), name: String(r.name || ''), kind: r.kind || 'other', last_item: r.last_item || null, private: !!r.private,
      key: nameKey(`${r.name || ''} ${r.last_item || ''}`), mobile: /^01\d{9}$/.test(String(r.phone)) }));
    return { list, byPhone: new Map(list.map((c) => [c.phone, c])) };
  }
  // ---- «📒 دفتر الأرقام» (owner 2026-11-20): who may see a number; private = the owner alone ----
  const BOOK_FILTERS = [['all', 'الكل'], ['cash', 'نقدي'], ['account', 'له حساب'], ['other', 'غيرهم'], ['private', '🔒 خاص']];
  // how many numbers under each filter
  function bookCounts(book) {
    const c = { all: 0, cash: 0, account: 0, other: 0, private: 0 };
    for (const x of (book && book.list) || []) { c.all++; c[x.kind] = (c[x.kind] || 0) + 1; if (x.private) c.private++; }
    return c;
  }
  // the numbers the screen lists: one filter (a kind, or private) and what is typed (digits only = part of a number; else every word in the name), by name
  function bookView(book, filter, q) {
    let list = (book && book.list) || [];
    if (filter === 'private') list = list.filter((c) => c.private); else if (filter && filter !== 'all') list = list.filter((c) => c.kind === filter);
    const t = digits(q), d = t.replace(/\D/g, ''), words = nameKey(q).split(' ').filter(Boolean);
    if (d.length >= 2 && /^[\d\s+()-]*$/.test(t)) list = list.filter((c) => c.phone.includes(d));
    else if (words.length) list = list.filter((c) => words.every((w) => c.key.includes(w)));
    return list.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }
  // the book's entry for a number as he types it (01012345678, +20 101 …, Arabic digits)
  const bookFind = (book, phone) => { const p = normPhone(phone); return p && book ? book.byPhone.get(p) || null : null; };
  // up to `limit` mobile entries whose name (or drug) holds every word typed; the ones that start with it first
  function bookSearch(book, q, limit) {
    const k = nameKey(q), words = k.split(' ').filter(Boolean);
    if (!book || k.length < 2) return [];
    const hit = book.list.filter((c) => c.mobile && words.every((w) => c.key.includes(w)));
    hit.sort((a, b) => (b.key.startsWith(k) ? 1 : 0) - (a.key.startsWith(k) ? 1 : 0) || a.name.length - b.name.length);
    return hit.slice(0, limit || 6);
  }
  const bookKind = (k) => (k === 'cash' ? 'نقدي' : k === 'account' ? 'له حساب' : '');
  const STATUS_TEXT = { waiting: 'مستني', arrived: 'وصل', delivered: 'اتسلّم', returned: 'رجع للمورد', kept: 'اتحفظ', cancelled: 'اتلغى' };
  // his history with one number: the requests the system kept (newest first) and, when the book has one, the drug written beside his name in the phone («قديم»)
  function historyRows(hist, known) {
    const out = (hist || []).map((r) => ({ item: r.item_name, day: String(r.created_at || '').slice(5, 10), status: STATUS_TEXT[r.status] || '' }));
    if (known && known.last_item) out.push({ item: known.last_item, day: '', status: 'قديم' });
    return out;
  }
  const api = { normPhone, cleanName, parseQty, qtyWord, vendorMsg, waitingList, vendorListMsg, customerMsg, waLink, telLink, kindText, KIND_DAYS, ago, leftText, daysLeft, needs, groupCall, errText,
    nameKey, makeBook, bookFind, bookSearch, bookKind, STATUS_TEXT, historyRows, BOOK_FILTERS, bookCounts, bookView };
  root.AskerWaitLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the screen ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = { waiting: [], call: [], leftover: [], vendors: [] }, loaded = false, loading = false, busy = false, sure = null, note = '', lastMsg = '';
  // the form: null = closed; {item: {id, name} | null, q, results, phone, name, qty, vendor, kind, msg}
  // + known (the book's entry for the typed number), hist (his requests with that number), picks (names that fit what is typed), nameAuto (the name box was filled by the book)
  let form = null, searchTimer = null, searchSeq = 0, histSeq = 0;
  let book = makeBook([]), bookState = 'none';   // none | loading | ready
  // «📒 دفتر الأرقام» (owner only): null = closed; {filter, q, shown, sure}
  let mgr = null;
  // the telesales number of each supplier company (owner 2026-11-20, ar/vendors.js keeps them): «سجّل وابعت للتليسيلز» opens WhatsApp on it; vendor_id → {phone, name}
  let vnums = new Map(), vnumsState = 'none';
  // a staff member (or the owner looking as one): no suppliers, no returns, no book screen; the server holds the line, this hides the buttons
  const isStaff = () => !!(root.AskerStaff && root.AskerStaff.isStaff && root.AskerStaff.isStaff());

  const vendorOf = (id) => data.vendors.find((v) => String(v.id) === String(id));
  const who = (r) => (r.who ? cleanName(r.who) : '');
  const person = (r) => `<bdi class="notr">${esc(who(r) || r.phone)}</bdi>` + (who(r) ? ` · <bdi dir="ltr" class="notr">${esc(r.phone)}</bdi>` : '');
  const vchip = (r) => (r.vendor && !isStaff() ?`<span class="py-pill"><bdi class="notr">${esc(r.vendor)}</bdi>${r.vkind ? ` · <span>${esc(kindText(r.vkind))}</span>` : ''}</span>` : '');
  const qtySpan = (r) => `<span>${esc(qtyWord(num(r.qty) || 1))}</span>`;
  const tag = (s) => `<span class="py-pill">${esc(s)}</span>`;

  function vendorSelect(attrs, current) {
    return `<select ${attrs}><option value="">من غير مورد</option>` +
      data.vendors.map((v) => `<option value="${esc(v.id)}"${String(v.id) === String(current) ? ' selected' : ''}>${esc(v.name)}${v.kind ? ' · ' + esc(kindText(v.kind)) : ''}</option>`).join('') + '</select>';
  }
  function act(id, action, label, cls) {
    const ask = sure === id + ':' + action;
    return `<button type="button" class="${cls || 'secondary'} small" data-wl-act="${esc(action)}" data-id="${esc(id)}">${esc(ask ? 'متأكد؟ دوس تاني' : label)}</button>`;
  }

  // the item's small photo on the side of a card's first line (ar/item-media.js, owner 2026-11-21); no item id (a typed unknown item) = the line as it was
  const withPhoto = (id, name, line) => (root.AskerItemMedia ? root.AskerItemMedia.row(id, name, name, line) : line);
  function callCard(g) {
    let html = `<div class="py-card py-wait">${withPhoto(g.rows[0] && g.rows[0].item_id, g.item, `<div class="py-l1"><span class="py-name" dir="ltr"><bdi class="notr">${esc(g.item)}</bdi></span></div>`)}` +
      '<div class="py-l2">📦 حطه في مكان الانتظار، مش مع الرف العادي</div>';
    for (const r of g.rows) {
      const wa = waLink(r.phone, customerMsg(r.item));
      html += `<div class="py-l2">${person(r)} · ${qtySpan(r)}</div><div class="py-acts">` +
        `<a class="py-a on" href="${esc(telLink(r.phone))}" data-wl-called="${esc(r.id)}">اتصل</a>` +
        `<a class="py-a" href="${esc(wa)}" target="_blank" rel="noopener" data-wl-called="${esc(r.id)}">واتساب</a>` +
        act(r.id, 'delivered', 'اتسلّم', 'py-p') + (isStaff() ? '' : act(r.id, 'reopen', 'مش وصل لسه')) + '</div>';
    }
    return html + '</div>';
  }
  function waitCard(r) {
    return `<div class="py-card">${withPhoto(r.item_id, r.item, `<div class="py-l1"><span class="py-name" dir="ltr"><bdi class="notr">${esc(r.item)}</bdi></span>${vchip(r)}</div>`)}` +
      `<div class="py-l2">${person(r)} · ${qtySpan(r)} · <span>${esc(ago('اتطلب', r.days))}</span>` + (r.item_id == null ? ` · <span>${esc('صنف مش معروف للسيستم: دوس «وصل» بإيدك')}</span>` : '') + '</div>' +
      (r.vendor_id == null && !isStaff() ? `<div class="py-l2">${vendorSelect(`data-wl-vendor="${esc(r.id)}"`, '')}</div>` : '') +
      `<div class="py-acts">${isStaff() ? '' : act(r.id, 'arrived', 'وصل', 'py-p')}${teleBtn(r)}${act(r.id, 'cancelled', 'إلغاء')}</div></div>`;
  }
  // «📲 ابعت للتليسيلز»: the supplier of this request has a telesales number saved (ar/vendors.js): WhatsApp opens on it with the request ready (owner only)
  const teleOf1 = (r) => (isStaff() || r.vendor_id == null ? null : vnums.get(String(r.vendor_id)) || null);
  const teleBtn = (r) => (teleOf1(r) ? `<button type="button" class="secondary small" data-wl-tele="${esc(r.id)}">📲 ابعت للتليسيلز</button>` : '');
  // one button per supplier that has two or more different waiting items: ONE message with the whole list
  function teleGroupsHtml() {
    const by = new Map();
    for (const r of data.waiting) if (teleOf1(r)) { if (!by.has(String(r.vendor_id))) by.set(String(r.vendor_id), []); by.get(String(r.vendor_id)).push(r); }
    const btns = [...by.entries()].filter(([, rows]) => waitingList(rows).length >= 2).map(([vid, rows]) => `<button type="button" class="secondary small" data-wl-telegroup="${esc(vid)}"><span>📲 ابعت كل المستنيين لـ</span> <bdi class="notr">${esc(rows[0].vendor || vid)}</bdi> <span class="py-num">${waitingList(rows).length}</span></button>`);
    return btns.length ? `<div class="py-acts">${btns.join('')}</div>` : '';
  }
  function leftCard(r) {
    const left = r.left_days, hot = left != null && left <= 2;
    const nums = [`اتباع آخر سنة: ${num(r.sold_year)} علبة`, r.price != null ? `السعر ${num(r.price)} ج` : '', r.exp_near ? `أقرب صلاحية في المخزن ${String(r.exp_near).slice(0, 7)}` : ''].filter(Boolean);
    return `<div class="py-card${hot ? ' py-look' : ''}">${withPhoto(r.item_id, r.item, `<div class="py-l1"><span class="py-name" dir="ltr"><bdi class="notr">${esc(r.item)}</bdi></span>${vchip(r)}</div>`)}` +
      `<div class="py-l2">${person(r)} · ${qtySpan(r)}${r.called ? ` · <span>${esc('اتكلم')}</span>` : ''}</div>` +
      `<div class="py-l2"><span>${esc(ago('وصل', r.days_here))}</span> · <b>${esc(leftText(left))}</b></div>` +
      `<div class="py-l2">${nums.map((n) => `<span>${esc(n)}</span>`).join(' · ')}${r.exp_short ? ' ' + tag('صلاحيته أقل من سنة ونص') : ''}</div>` +
      (r.vendor_id == null ? `<div class="py-l2">${vendorSelect(`data-wl-vendor="${esc(r.id)}"`, '')}</div>` : '') +
      `<div class="py-acts">${act(r.id, 'returned', 'رجّعته للمورد', 'py-p')}${act(r.id, 'kept', 'هسيبه')}${act(r.id, 'delivered', 'اتسلّم')}${act(r.id, 'reopen', 'مش وصل لسه')}</div></div>`;
  }
  const head = (title, n) => `<h3 class="py-h">${esc(title)} <span class="py-num">${esc(n)}</span></h3>`;

  // the number typed is in the book: his name, his kind, and (under it) his requests so far
  function knownHtml() {
    const f = form;
    if (!f) return '';
    const k = f.known, rows = historyRows(f.hist, k);
    if (!k && !rows.length) return '';
    return (k ? `<div class="py-known"><span class="py-ok">✓</span><b><bdi class="notr">${esc(k.name)}</bdi></b>${bookKind(k.kind) ? `<span class="py-pill">${esc(bookKind(k.kind))}</span>` : ''}${k.private ? '<span class="py-pill on">🔒 خاص</span>' : ''}` +
        (isStaff() ? '' : `<span class="py-pill">من دفتر أرقامك</span><button type="button" class="secondary small py-lock" data-wl-lock="${esc(k.phone)}" data-flag="${k.private ? 0 : 1}">${k.private ? 'افتحه للموظفين' : '🔒 خاص'}</button>`) + '</div>' : '') +
      (rows.length ? `<div class="py-hist"><span class="py-lab">سجل طلباته</span>${rows.map((r) => `<div class="py-hrow"><span dir="ltr"><bdi class="notr">${esc(r.item)}</bdi></span>${r.day ? `<small>${esc(r.day)}</small>` : ''}${r.status ? `<span class="py-pill">${esc(r.status)}</span>` : ''}</div>`).join('')}</div>` : '');
  }
  // the names in the book that fit what he typed in the name box: a tap fills the number too
  const picksHtml = () => (form && form.picks && form.picks.length
    ? `<div class="py-picks">${form.picks.map((c) => `<button type="button" class="py-pick" data-wl-contact="${esc(c.phone)}"><b><bdi class="notr">${esc(c.name)}</bdi></b><small dir="ltr"><bdi class="notr">${esc(c.phone)}${c.last_item ? ' · ' + esc(c.last_item) : ''}${c.private ? ' · 🔒' : ''}</bdi></small></button>`).join('')}</div>` : '');
  const paintKnown = () => { const el = $('wlKnown'); if (el) el.innerHTML = knownHtml(); };
  const paintPicks = () => { const el = $('wlPicks'); if (el) el.innerHTML = picksHtml(); };

  // ---- «📒 دفتر الأرقام» (owner only): choose who stays private; one tap per number, or all that are shown ----
  const MGR_STEP = 30;
  const bkRow = (c) => `<div class="py-hrow py-bk"><span><b><bdi class="notr">${esc(c.name)}</bdi></b><small dir="ltr"><bdi class="notr">${esc(c.phone)}${c.last_item ? ' · ' + esc(c.last_item) : ''}</bdi></small></span>` +
    (bookKind(c.kind) ? `<span class="py-pill">${esc(bookKind(c.kind))}</span>` : '') + (c.private ? '<span class="py-pill on">🔒 خاص</span>' : '') +
    `<button type="button" class="${c.private ? 'py-p' : 'secondary'} small" data-wl-lock="${esc(c.phone)}" data-flag="${c.private ? 0 : 1}">${c.private ? 'افتحه' : '🔒 خاص'}</button></div>`;
  function bkChips() {
    const c = bookCounts(book);
    return BOOK_FILTERS.map(([k, label]) => `<button type="button" class="${mgr.filter === k ? 'on' : ''}" data-wl-bkf="${k}">${esc(label)} <span class="notr">${c[k] || 0}</span></button>`).join('');
  }
  function bkList() {
    const m = mgr;
    if (bookState !== 'ready') return `<p class="hint">${esc(bookState === 'loading' ? 'بحمّل…' : 'الدفتر مش متاح دلوقتي.')}</p>`;
    const rows = bookView(book, m.filter, m.q), shown = rows.slice(0, m.shown);
    const flip = rows.filter((c) => c.private !== (m.filter !== 'private')).length;   // what one tap on the bottom button would change (private filter: open them; any other: close the open ones)
    const label = m.sure ? 'متأكد؟ دوس تاني' : m.filter === 'private' ? 'افتح كل اللي ظاهر' : '🔒 اقفل كل اللي ظاهر';
    return `<p class="hint"><span>الأرقام الظاهرة</span> <span class="py-num">${rows.length}</span></p>` +
      (shown.length ? shown.map(bkRow).join('') : `<p class="empty">${esc('مفيش أرقام بالشكل ده.')}</p>`) +
      (rows.length > shown.length ? '<button type="button" class="secondary small" data-wl-bkmore>عرض أكتر</button>' : '') +
      (flip ? `<div class="py-acts"><button type="button" class="${m.sure ? 'py-p' : 'secondary'}" data-wl-bkbulk>${esc(label)} <span class="notr">(${flip})</span></button></div>` : '');
  }
  // ---- «📱 تطبيق الموبايل» (owner 2026-11-20, option «أ»; migration 202611201900, contacts-android/): the phone app that writes the numbers saved here into his phone's contacts (and so Google's)
  // and sends the phone's contacts here every 10 days (the laptop merges them: new ones come CLOSED to the staff) ----
  const APP_URL = 'https://github.com/taherasker2560-dot/asker-nawaqes/releases/download/contacts-build/asker-contacts.apk';
  // null = not asked yet; {data} = the status; {error} = it could not be read now (a slow net, the phone app just took the screen): the block says so, keeps its two buttons and the status is asked again.
  // Once a phone IS linked the big block goes away (owner 2026-11-21: «مش مفروض بعد ما اربطه يختفي؟» was a QUESTION; his second message: «نزلته وربطته بس مختفاش ليه من الصفحة»):
  // one thin line says «مربوط ✓ · آخر اتصال»; «تفاصيل» opens the whole block again (download, link another phone, the numbers waiting)
  let phoneApp = null, phoneTries = 0, phoneOpen = false;
  const go = (u) => { root.open(u, '_self'); };   // a custom-scheme link (the phone app's own): the same tab; e2e replaces window.open
  const dayTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function phoneAppHtml() {
    const p = phoneApp && phoneApp.data, lines = [];
    const linked = !!(p && (p.phones || []).length), last = linked ? (p.phones || []).map((x) => x.last_used_at).filter(Boolean).sort().pop() : null;
    const lastB = `<b dir="ltr">${last ? esc(dayTime(last)) : '<span>لسه</span>'}</b>`;
    if (linked && !phoneOpen) return `<div class="py-l2"><b>📱 تطبيق الموبايل</b> ✓ <span>موبايل مربوط، آخر اتصال:</span> ${lastB} <button type="button" class="secondary small" data-wl-appmore>تفاصيل</button></div>`;
    if (phoneApp && phoneApp.error) lines.push('<span>مقدرتش أجيب حالة التطبيق دلوقتي، وبحاول تاني. الزرارين شغالين.</span>');
    else if (!p) lines.push('<span>بحمّل…</span>');
    else {
      lines.push(linked ? `<span>موبايل مربوط، آخر اتصال:</span> ${lastB}` : '<span>لسه مفيش موبايل مربوط.</span>');
      if (p.last_sync) lines.push(`<span>آخر إرسال لجهات الاتصال:</span> <b>${esc(p.last_sync.n)}</b> <span>جهة اتصال</span>${p.last_sync.merged_at ? ' ✓' : ' <span>(لسه ما اتدمجتش على اللاب)</span>'}`);
      if (Number(p.pending) > 0) lines.push(`<span>أرقام مستنية تنزل على الموبايل:</span> <b>${esc(p.pending)}</b>`);
    }
    return '<div class="py-l1"><b>📱 تطبيق الموبايل</b></div>' +
      '<p class="hint">بيحفظ الأرقام الجديدة في جهات اتصال موبايلك وجوجل لوحده، وكل 10 أيام بيبعت جهات اتصالك هنا (وبتيجي مقفولة على الموظفين).</p>' +
      lines.map((l) => `<div class="py-l2">${l}</div>`).join('') +
      `<div class="py-acts"><a class="py-a" href="${esc(APP_URL)}" target="_blank" rel="noopener">نزّل التطبيق</a><button type="button" class="py-p small" data-wl-applink>اربط التطبيق</button>${linked ? '<button type="button" class="secondary small" data-wl-appmore>إخفاء</button>' : ''}</div>`;
  }
  const paintPhoneApp = () => { const el = $('wlPhoneApp'); if (el && mgr) el.innerHTML = phoneAppHtml(); };
  async function loadPhoneApp() {
    if (!db() || isStaff()) return;
    const had = phoneApp && phoneApp.data;
    let ok = false;
    try { const { data: d, error } = await db().rpc('ar_phone_status'); if (!error && d) { phoneApp = { data: d }; ok = true; } } catch (e) { /* the status could not be read now */ }
    if (!ok && !had) phoneApp = { error: true };   // a status already on screen stays as it was
    paintPhoneApp();
    // not read: again in a few seconds (the page coming back from the phone app has no net for a moment), three times at most
    if (!ok && mgr && phoneTries < 3) { phoneTries++; setTimeout(loadPhoneApp, 5000); } else if (ok) phoneTries = 0;
  }
  // «اربط التطبيق»: a new key for this phone (the server keeps only its hash), then the phone app opens with it (it asks him once). On Android an intent: link (the app's page if it is not installed).
  async function linkApp() {
    if (busy || isStaff()) return;
    busy = true;
    try {
      const { data: k, error } = await db().rpc('ar_phone_link');
      if (error || !/^[0-9a-f]{64}$/.test(String(k || ''))) throw new Error(error ? error.message : 'key');
      go(/Android/i.test(root.navigator.userAgent) ? `intent://link?k=${k}#Intent;scheme=askercontacts;package=com.askerpharmacy.contacts;S.browser_fallback_url=${encodeURIComponent(APP_URL)};end` : `askercontacts://link?k=${k}`);
      note = '';
      phoneTries = 0;
      phoneOpen = false;   // linked: the big block goes back to its thin line once the status shows the phone
      setTimeout(loadPhoneApp, 4000);
    } catch (e) { note = 'ماتغيّرش: ' + (e && e.message ? e.message : ''); }
    busy = false;
    const st = $('wlStatus'); if (st) st.textContent = note;
  }
  const bkHtml = () => '<div class="py-card py-confirm"><div class="py-l1"><b>📒 دفتر الأرقام</b><button type="button" class="secondary small" data-wl-bkclose>إغلاق</button></div>' +
    `<div class="py-phone" id="wlPhoneApp">${phoneAppHtml()}</div>` +
    '<p class="hint">🔒 خاص: يظهر ليك انت بس، والموظفين ما يشوفوش اسمه ولا رقمه. اللي ما فتحتوش من «غيرهم» لسه خاص.</p>' +
    `<div class="py-bkf" id="wlBkChips">${bkChips()}</div>` +
    `<input id="wlBkQ" type="search" placeholder="دوّر بالاسم أو الرقم" aria-label="دوّر بالاسم أو الرقم" value="${esc(mgr.q)}" autocomplete="off" />` +
    `<div id="wlBkList">${bkList()}</div></div>`;
  const paintBook = () => { const a = $('wlBkChips'), b = $('wlBkList'); if (a && mgr) a.innerHTML = bkChips(); if (b && mgr) b.innerHTML = bkList(); };

  function formHtml() {
    if (!form) return '<button type="button" class="py-new" data-wl-new>📝 طلب مش موجود</button>' + (isStaff() ? '' : '<button type="button" class="secondary py-bk-open" data-wl-bk>📒 دفتر الأرقام</button>');
    const f = form, v = isStaff() ? null : vendorOf(f.vendor), staff = isStaff();
    const picked = f.item ? `<div class="py-field"><span dir="ltr"><bdi class="notr">${esc(f.item.name)}</bdi></span><button type="button" class="secondary small" data-wl-unpick>✕</button></div>`
      : `<input id="wlItem" type="search" dir="ltr" placeholder="اسم الدوا (إنجليزي أو عربي)" aria-label="اسم الدوا" value="${esc(f.q)}" autocomplete="off" />` +
        (f.q.trim().length >= 2 ? `<div class="py-picks">${f.results.map((r) => {
          const pick = `<button type="button" class="py-pick" data-wl-pick="${esc(r.id)}"><b dir="ltr"><bdi class="notr">${esc(r.name)}</bdi></b>${r.arabic_name ? `<small>${esc(r.arabic_name)}</small>` : ''}</button>`;
          // the photo BESIDE the button (a button inside a button does not work): a tap on the photo opens «تعديل الصنف», a tap on the name picks the item
          return root.AskerItemMedia ? root.AskerItemMedia.row(r.id, r.name, r.arabic_name || r.name, pick) : pick;
        }).join('')}` +
          `<button type="button" class="py-pick" data-wl-typed><b>اكتبه زي ما هو</b><small dir="ltr"><bdi class="notr">${esc(f.q.trim())}</bdi></small></button></div>` : '');
    return `<div class="py-card py-confirm"><span class="py-lab">الدوا</span>${picked}` +
      `<span class="py-lab">العميل</span><div class="py-seg" style="grid-template-columns:2fr 1fr"><input id="wlPhone" type="tel" dir="ltr" placeholder="01xxxxxxxxx" aria-label="رقم العميل" value="${esc(f.phone)}" />` +
      `<input id="wlQty" type="text" inputmode="numeric" placeholder="الكمية 1" aria-label="الكمية" value="${esc(f.qty)}" /></div>` +
      `<div id="wlKnown">${knownHtml()}</div>` +
      `<input id="wlName" type="text" placeholder="اسم العميل (اختياري)" aria-label="اسم العميل" maxlength="80" autocomplete="off" value="${esc(f.name)}" />` +
      `<div id="wlPicks">${picksHtml()}</div>` +
      (staff ? '' : `<span class="py-lab">المورد اللي هتبعتله</span>${vendorSelect('id="wlVendor"', f.vendor)}`) +
      (v && !v.kind ? `<span class="py-lab">المورد ده مخزن ولا مركز توزيع؟ (مرة واحدة بس)</span><div class="py-seg" style="grid-template-columns:1fr 1fr"><button type="button" class="${f.kind === 'warehouse' ? 'on' : ''}" data-wl-kind="warehouse">مخزن · رجوع 30 يوم</button><button type="button" class="${f.kind === 'center' ? 'on' : ''}" data-wl-kind="center">مركز توزيع · رجوع 7 أيام</button></div>` : '') +
      (f.msg ? `<p class="status bad" id="wlMsg">${esc(f.msg)}</p>` : '') +
      `<div class="py-acts" id="wlActs">${actsHtml()}</div></div>`;
  }
  // the save buttons: with a telesales number for the chosen supplier the first one opens WhatsApp on him (he presses send); staff just save
  function teleOf(f) { return f && !isStaff() && f.vendor ? vnums.get(String(f.vendor)) || null : null; }
  function actsHtml() {
    const f = form, staff = isStaff(), tele = teleOf(f), off = busy ? ' disabled' : '';
    return (tele ? `<button type="button" class="py-p" data-wl-save="wa"${off}>سجّل وابعت للتليسيلز على واتساب</button>` : '') +
      (staff ? '' : `<button type="button" class="${tele ? 'secondary' : 'py-p'}" data-wl-save="copy"${off}>سجّل وانسخ رسالة المورد</button>`) +
      `<button type="button" class="${staff ? 'py-p' : 'secondary'}" data-wl-save="only"${off}>سجّل بس</button><button type="button" class="secondary" data-wl-close>إلغاء</button>` +
      (tele ? `<p class="hint">التليسيلز: <b class="notr">${esc(tele.name || tele.phone)}</b></p>` : '');
  }
  const paintActs = () => { const el = $('wlActs'); if (el && form) el.innerHTML = actsHtml(); };
  async function loadVNums() {
    if (vnumsState !== 'none' || !db() || isStaff()) return;
    vnumsState = 'loading';
    try {
      const { data: rows, error } = await db().from('ar_vendor_contacts').select('vendor_id,phone,name').eq('role', 'telesales');
      if (error) throw error;
      vnums = new Map((rows || []).map((r) => [String(r.vendor_id), { phone: String(r.phone), name: r.name || '' }]));
    } catch (e) { vnums = new Map(); /* the table is not there yet: the form works as before */ }
    vnumsState = 'ready'; paintActs(); drawLists();   // the buttons of the waiting cards need the numbers too
  }
  // «📲 ابعت للتليسيلز»: one request, or one supplier's whole waiting list as ONE message; WhatsApp opens on his telesales number with it ready, he presses send (a list too long for a link is copied and the chat opens bare)
  function sendTele(vendorId, rows) {
    const tele = vnums.get(String(vendorId));
    if (!tele || !rows.length) return;
    const items = waitingList(rows), msg = items.length === 1 ? vendorMsg(items[0].item, items[0].qty) : vendorListMsg(items), long = msg.length > 3000;
    if (long) copy(msg);
    if (root.AskerApp && root.AskerApp.openWhatsApp) root.AskerApp.openWhatsApp(long ? '' : msg, tele.phone);
    else root.open('https://wa.me/' + (/^01\d{9}$/.test(tele.phone) ? '2' : '') + tele.phone + (long ? '' : '?text=' + encodeURIComponent(msg)), '_blank');
    note = long ? 'الرسالة طويلة: اتنسخت، الزقها في المحادثة اللي اتفتحت.' : 'اتفتح الواتس على التليسيلز ومعاه الرسالة: دوس إرسال هناك.';
    const st = $('wlStatus'); if (st) st.textContent = note;
  }

  function draw() {
    const fm = $('wlForm');
    if (!$('wlMain') || !fm) return;
    fm.innerHTML = mgr ? bkHtml() : formHtml();
    drawLists();
    const st = $('wlStatus');
    if (st) { st.textContent = note || (loading ? 'بحمّل…' : ''); st.className = 'status'; }
  }
  // the lists under the form (called alone when only they change, so what is typed in the form stays)
  function drawLists() {
    const main = $('wlMain');
    if (!main) return;
    main.hidden = !!mgr;
    let html = lastMsg ? `<div class="py-card"><textarea readonly rows="4" dir="rtl" aria-label="رسالة المورد">${esc(lastMsg)}</textarea></div>` : '';
    const groups = groupCall(data.call);
    if (groups.length) html += head('📞 كلّم دول', data.call.length) + groups.map(callCard).join('');
    if (data.waiting.length) html += head('مستنيين الدوا', data.waiting.length) + teleGroupsHtml() + data.waiting.map(waitCard).join('');
    if (data.leftover.length) html += head('↩️ قرار الرجوع', data.leftover.length) + '<p class="hint">اللي وصل وما اتسلّمش. الأقرب ميعادًا فوق. القرار ليك: السيستم بيعرض الأرقام بس.</p>' + data.leftover.map(leftCard).join('');
    if (!html) html = loaded ? '<p class="empty">مفيش طلبات انتظار دلوقتي. لما عميل يسأل على دوا مش موجود، دوس «طلب مش موجود».</p>' : '';
    main.innerHTML = html;
  }

  // keep = the sentence from the action that just ran stays on the screen (a refresh by hand clears it)
  async function load(keep) {
    if (!db() || loading) return;
    loading = true; draw();
    try {
      const { data: d, error } = await db().rpc('ar_waitlist_overview');
      if (error) throw error;
      if (!d || d.ok === false) throw new Error('no');
      data = { waiting: d.waiting || [], call: d.call || [], leftover: d.leftover || [], vendors: d.vendors || [] };
      loaded = true; if (!keep) note = '';
    } catch (e) {
      note = 'مقدرتش أحمّل الانتظار: ' + (e && e.message ? e.message : '-');
    }
    loading = false; draw();
  }

  async function rpc(name, args) {
    const { data: d, error } = await db().rpc(name, args);
    if (error) throw error;
    return d;
  }
  async function doAct(id, action) {
    if (busy) return;
    busy = true;
    try {
      const d = await rpc('ar_waitlist_set', { p_id: Number(id), p_action: action });
      note = d && d.ok ? '' : errText(d && d.error);
    } catch (e) { note = 'ماتغيّرش: ' + (e && e.message ? e.message : ''); }
    busy = false; sure = null;
    await load(true);
  }
  async function setVendor(id, vendor) {
    if (!vendor || busy) return;
    busy = true;
    try {
      const d = await rpc('ar_waitlist_set', { p_id: Number(id), p_action: 'vendor', p_vendor_id: Number(vendor) });
      note = d && d.ok ? '' : errText(d && d.error);
    } catch (e) { note = 'ماتغيّرش: ' + (e && e.message ? e.message : ''); }
    busy = false;
    await load(true);
  }
  function copy(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text)); } catch (e) { /* fall through */ }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try {
      const t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(t);
      return !!ok;
    } catch (e) { return false; }
  }
  // read what is typed into the form (the inputs are redrawn, so the state keeps it)
  function readForm() {
    if (!form) return;
    if ($('wlItem')) form.q = $('wlItem').value;
    if ($('wlPhone')) form.phone = $('wlPhone').value;
    if ($('wlQty')) form.qty = $('wlQty').value;
    if ($('wlName')) form.name = $('wlName').value;
    if ($('wlVendor')) form.vendor = $('wlVendor').value;
  }
  // ---- the book: loaded once when the form opens (a few thousand rows, owner only); a number typed → his name, a name typed → the numbers that fit ----
  async function loadBook() {
    if (bookState !== 'none' || !db()) return;
    bookState = 'loading';
    try {
      let all = [], cols = 'phone,name,kind,last_item,private';
      for (let from = 0; from < 20000; from += 1000) {
        let { data: rows, error } = await db().from('ar_contacts').select(cols).order('phone').range(from, from + 999);
        // the «private» column comes with migration 202611201500: until it is applied the book loads without it
        if (error && cols.includes('private') && /private/i.test(String(error.message))) { cols = 'phone,name,kind,last_item'; ({ data: rows, error } = await db().from('ar_contacts').select(cols).order('phone').range(from, from + 999)); }
        if (error) throw error;
        all = all.concat(rows || []);
        if (!rows || rows.length < 1000) break;
      }
      book = makeBook(all); bookState = 'ready';
    } catch (e) { bookState = 'none'; if (mgr) draw(); return; }   // the table is not there yet (or no right to it): the form works as before
    if (form) { readForm(); onPhone(); onName(); }
    if (mgr) paintBook();
  }
  // mark numbers private (true) or open (false): one or many at once, the server (owner only) does it; the local book follows
  async function setPrivate(phones, flag) {
    if (!phones.length || busy || isStaff()) return;
    busy = true;
    try {
      await rpc('ar_contacts_private', { p_phones: phones, p_private: flag });
      for (const p of phones) { const c = book.byPhone.get(p); if (c) c.private = flag; }
      note = '';
    } catch (e) { note = 'ماتغيّرش: ' + (e && e.message ? e.message : ''); }
    busy = false;
    if (mgr) { mgr.sure = false; paintBook(); } else { paintKnown(); paintPicks(); }
    const st = $('wlStatus'); if (st) st.textContent = note;
  }
  // his requests so far with this number (the system keeps them in ar_waitlist); shown under the name
  async function loadHist(phone) {
    if (!form || !db()) return;
    const mine = ++histSeq;
    try {
      const { data: rows, error } = await db().from('ar_waitlist').select('item_name,status,created_at').eq('phone', phone).order('created_at', { ascending: false }).limit(6);
      if (error || mine !== histSeq || !form || normPhone(form.phone) !== phone) return;
      form.hist = rows || []; paintKnown();
    } catch (e) { /* the history is a help, not a need */ }
  }
  // a number was typed: the name appears when the book knows it (a name he typed himself stays)
  function onPhone() {
    const f = form;
    if (!f) return;
    const p = normPhone(f.phone), k = p ? bookFind(book, p) : null, nm = $('wlName');
    f.known = k; f.hist = []; f.picks = [];
    if (k && (!f.name.trim() || f.nameAuto)) { f.name = k.name; f.nameAuto = true; if (nm) nm.value = k.name; }
    else if (!k && f.nameAuto) { f.name = ''; f.nameAuto = false; if (nm) nm.value = ''; }
    paintKnown(); paintPicks();
    if (p) loadHist(p);
  }
  // a name was typed: the numbers in the book that fit it are offered (a tap fills the number)
  function onName() {
    const f = form;
    if (!f) return;
    f.picks = f.nameAuto || normPhone(f.phone) ? [] : bookSearch(book, f.name, 6);
    paintPicks();
  }
  // a request was saved with a number the book does not know: keep it with the name he wrote (never over a number it already has)
  async function remember(phone, name) {
    const nm = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!nm || bookFind(book, phone) || !db()) return;
    try {
      const { error } = await db().from('ar_contacts').upsert({ phone, name: nm, kind: /^عميل/.test(nm) ? 'cash' : 'other', source: 'typed', updated_at: new Date().toISOString() }, { onConflict: 'phone', ignoreDuplicates: true });
      if (!error) book = makeBook(book.list.concat([{ phone, name: nm, kind: /^عميل/.test(nm) ? 'cash' : 'other', last_item: null }]));
    } catch (e) { /* the request itself is saved */ }
  }
  async function search() {
    if (!form || form.item) return;
    const mine = ++searchSeq;
    const q = form.q.trim().replace(/[^0-9A-Za-zء-ي ]+/g, ' ').trim();
    if (q.length < 2 || !db()) { form.results = []; return draw(); }
    let req = db().from('ar_store_items').select('id,name,arabic_name,status,price');
    for (const w of q.split(/\s+/).filter((x) => x.length >= 2).slice(0, 5)) req = req.or(`name.ilike.*${w}*,arabic_name.ilike.*${w}*`);
    const { data: rows, error } = await req.order('name').limit(8);
    if (mine !== searchSeq || !form) return;
    form.results = error ? [] : rows || [];
    const keep = $('wlItem'), pos = keep ? keep.selectionStart : 0;
    draw();
    const again = $('wlItem');
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* not supported */ } }
  }
  async function save(mode) {
    if (!form || busy) return;
    readForm();
    const f = form, tele = mode === 'wa' ? teleOf(f) : null;
    const copyMsg = mode === 'copy' || (mode === 'wa' && !tele);   // no number saved for him: it falls back to «انسخ»
    const item = f.item ? f.item.name : f.q.trim().replace(/\s+/g, ' ');
    const phone = normPhone(f.phone), qty = parseQty(f.qty), v = vendorOf(f.vendor);
    if (item.length < 2) { f.msg = errText('name'); return draw(); }
    if (!phone) { f.msg = errText('phone'); return draw(); }
    if (Number.isNaN(qty)) { f.msg = errText('qty'); return draw(); }
    if (v && !v.kind && !f.kind) { f.msg = errText('kind'); return draw(); }
    busy = true; f.msg = ''; draw();
    try {
      if (v && !v.kind) {
        const k = await rpc('ar_waitlist_vendor_kind', { p_vendor_id: Number(v.id), p_kind: f.kind });
        if (!k || !k.ok) throw new Error(errText(k && k.error));
      }
      const d = await rpc('ar_waitlist_add', { p_item_id: f.item && f.item.id != null ? Number(f.item.id) : null, p_item_name: item, p_phone: phone, p_name: f.name.trim().slice(0, 80) || null, p_qty: qty, p_vendor_id: v ? Number(v.id) : null });
      if (!d || !d.ok) throw new Error(errText(d && d.error));
      await remember(phone, f.name);
      let copied = false;
      const text = vendorMsg(item, qty);
      if (copyMsg) copied = await copy(text);
      const base = d.dup ? 'الطلب ده كان مسجّل قبل كده.' : 'اتسجّل.';
      if (tele) {
        // WhatsApp opens on the telesales number with the message ready (the number of the customer is not in it); he presses send there
        if (root.AskerApp && root.AskerApp.openWhatsApp) root.AskerApp.openWhatsApp(text, tele.phone);
        else root.open('https://wa.me/' + (/^01\d{9}$/.test(tele.phone) ? '2' : '') + tele.phone + '?text=' + encodeURIComponent(text), '_blank');
      }
      note = tele ? base + ' اتفتح الواتس على التليسيلز ومعاه الرسالة: دوس إرسال هناك.' : !copyMsg ? base : copied ? base + ' رسالة المورد اتنسخت، ابعتها من واتساب.' : base + ' ماقدرتش أنسخ الرسالة، انسخها بإيدك من تحت.';
      // when the phone refuses the copy, the message is shown in a box to copy by hand
      lastMsg = copyMsg && !copied ? text : '';
      form = null; busy = false;
      await load(true);
    } catch (e) {
      busy = false; f.msg = e && e.message ? e.message : errText('action'); draw();
    }
  }

  function bind() {
    const panel = $('waitPanel');
    if (!panel || panel.dataset.wlBound) return;
    panel.dataset.wlBound = '1';
    // back from the phone app (or from any other app): the number book is still open, so its phone-app status is read again
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && mgr && !isStaff()) { phoneTries = 0; loadPhoneApp(); } });
    $('wlRefresh')?.addEventListener('click', () => { note = ''; load(); });
    panel.addEventListener('input', (e) => {
      if (e.target.id === 'wlItem' && form) { form.q = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(search, 250); }
      else if (e.target.id === 'wlPhone' && form) { form.phone = e.target.value; onPhone(); }
      else if (e.target.id === 'wlName' && form) { form.name = e.target.value; form.nameAuto = false; onName(); }
      else if (e.target.id === 'wlBkQ' && mgr) { mgr.q = e.target.value; mgr.shown = MGR_STEP; mgr.sure = false; paintBook(); }
    });
    panel.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'wlVendor' && form) { readForm(); form.kind = ''; form.msg = ''; draw(); }
      else if (t.dataset && t.dataset.wlVendor) setVendor(t.dataset.wlVendor, t.value);
    });
    panel.addEventListener('click', (e) => {
      const t = e.target.closest('[data-wl-new],[data-wl-close],[data-wl-pick],[data-wl-typed],[data-wl-unpick],[data-wl-kind],[data-wl-save],[data-wl-act],[data-wl-called],[data-wl-contact],[data-wl-tele],[data-wl-telegroup],[data-wl-bk],[data-wl-applink],[data-wl-appmore],[data-wl-bkclose],[data-wl-bkf],[data-wl-bkmore],[data-wl-bkbulk],[data-wl-lock]');
      if (!t) return;
      const d = t.dataset;
      // the number book screen and the «🔒 خاص» marks (owner only)
      if ('wlBk' in d) { if (!isStaff()) { form = null; note = ''; mgr = { filter: 'other', q: '', shown: MGR_STEP, sure: false }; loadBook(); draw(); loadPhoneApp(); } return; }
      if ('wlApplink' in d) { linkApp(); return; }
      if ('wlAppmore' in d) { phoneOpen = !phoneOpen; paintPhoneApp(); return; }
      if ('wlTele' in d) { const r = data.waiting.find((x) => String(x.id) === d.wlTele); if (r) sendTele(r.vendor_id, [r]); return; }
      if ('wlTelegroup' in d) { sendTele(d.wlTelegroup, data.waiting.filter((x) => String(x.vendor_id) === d.wlTelegroup)); return; }
      if ('wlBkclose' in d) { mgr = null; draw(); return; }
      if ('wlBkf' in d) { if (mgr) { mgr.filter = d.wlBkf; mgr.shown = MGR_STEP; mgr.sure = false; paintBook(); } return; }
      if ('wlBkmore' in d) { if (mgr) { mgr.shown += MGR_STEP; paintBook(); } return; }
      if ('wlLock' in d) { setPrivate([d.wlLock], d.flag === '1'); return; }
      if ('wlBkbulk' in d) {
        if (!mgr) return;
        const flag = mgr.filter !== 'private', todo = bookView(book, mgr.filter, mgr.q).filter((c) => c.private !== flag).map((c) => c.phone);
        if (!mgr.sure) { mgr.sure = true; paintBook(); return; }   // marking many is a second tap
        setPrivate(todo, flag); return;
      }
      if ('wlNew' in d) { note = ''; lastMsg = ''; form = { item: null, q: '', results: [], phone: '', name: '', qty: '', vendor: '', kind: '', msg: '', known: null, hist: [], picks: [], nameAuto: false }; draw(); $('wlItem')?.focus(); loadBook(); vnumsState = 'none'; loadVNums(); return; }
      if ('wlClose' in d) { form = null; draw(); return; }
      if ('wlCalled' in d) { rpc('ar_waitlist_set', { p_id: Number(d.wlCalled), p_action: 'called' }).then(() => setTimeout(load, 800), () => {}); return; }
      if ('wlAct' in d) {
        const key = d.id + ':' + d.wlAct;
        // closing one is a second tap; «وصل» and the others go through
        if (['cancelled', 'returned', 'kept'].includes(d.wlAct) && sure !== key) { sure = key; draw(); return; }
        doAct(d.id, d.wlAct); return;
      }
      readForm();
      if (!form) return;
      if ('wlPick' in d) { const r = form.results.find((x) => String(x.id) === d.wlPick); if (r) { form.item = { id: r.id, name: r.name }; form.results = []; form.msg = ''; draw(); $('wlPhone')?.focus(); } return; }
      if ('wlTyped' in d) { form.item = { id: null, name: form.q.trim().replace(/\s+/g, ' ') }; form.results = []; draw(); $('wlPhone')?.focus(); return; }
      if ('wlUnpick' in d) { form.item = null; form.q = ''; form.results = []; draw(); $('wlItem')?.focus(); return; }
      if ('wlContact' in d) { const c = book.byPhone.get(d.wlContact); if (c) { form.phone = c.phone; form.name = c.name; form.nameAuto = true; form.known = c; form.hist = []; form.picks = []; form.msg = ''; draw(); loadHist(c.phone); $('wlQty')?.focus(); } return; }
      if ('wlKind' in d) { form.kind = d.wlKind; form.msg = ''; draw(); return; }
      if ('wlSave' in d) save(d.wlSave);
    });
  }

  function open() { bind(); load(); vnumsState = 'none'; loadVNums(); }
  // the numbers for the home (ar/notify.js): this also marks what the stock list shows as arrived
  async function counts() {
    if (!db()) return null;
    if (root.AskerStaff && root.AskerStaff.isStaff && root.AskerStaff.isStaff()) return null; // the database answers the owner only
    try {
      // nobody is waiting (or it is not the owner: the table shows him nothing): nothing to ask or to mark; only then the overview, which also marks what the stock list shows as arrived
      const { data: any, error: e0 } = await db().from('ar_waitlist').select('id').in('status', ['waiting', 'arrived']).limit(1);
      if (e0 || !any || !any.length) return { call: 0, near: 0 };
      const { data: d, error } = await db().rpc('ar_waitlist_overview');
      if (error || !d || d.ok === false) return null;
      return { call: (d.call || []).length, near: (d.leftover || []).filter((r) => r.left_days != null && r.left_days <= 2).length };
    } catch (e) { return null; }
  }
  // the number book for the supplier's page (ar/vendors.js picks a company's numbers from it): loaded once, null when it is not there
  async function ensureBook() {
    await loadBook();
    for (let i = 0; i < 150 && bookState === 'loading'; i++) await new Promise((r) => setTimeout(r, 100));
    return bookState === 'ready' ? book : null;
  }
  root.AskerWait = { open, counts, book: ensureBook };
})(typeof window === 'undefined' ? globalThis : window);
