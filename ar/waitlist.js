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
   The server (migration 202611190500) finds the arrival by itself (the stock list shows more than at the request). OWNER only. Nothing here writes
   to PharmaFly or sends a message. */
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
  const api = { normPhone, cleanName, parseQty, qtyWord, vendorMsg, customerMsg, waLink, telLink, kindText, KIND_DAYS, ago, leftText, daysLeft, needs, groupCall, errText };
  root.AskerWaitLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the screen ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = { waiting: [], call: [], leftover: [], vendors: [] }, loaded = false, loading = false, busy = false, sure = null, note = '', lastMsg = '';
  // the form: null = closed; {item: {id, name} | null, q, results, phone, name, qty, vendor, kind, msg}
  let form = null, searchTimer = null, searchSeq = 0;

  const vendorOf = (id) => data.vendors.find((v) => String(v.id) === String(id));
  const who = (r) => (r.who ? cleanName(r.who) : '');
  const person = (r) => `<bdi class="notr">${esc(who(r) || r.phone)}</bdi>` + (who(r) ? ` · <bdi dir="ltr" class="notr">${esc(r.phone)}</bdi>` : '');
  const vchip = (r) => (r.vendor ? `<span class="py-pill"><bdi class="notr">${esc(r.vendor)}</bdi>${r.vkind ? ` · <span>${esc(kindText(r.vkind))}</span>` : ''}</span>` : '');
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

  function callCard(g) {
    let html = `<div class="py-card py-wait"><div class="py-l1"><span class="py-name" dir="ltr"><bdi class="notr">${esc(g.item)}</bdi></span></div>` +
      '<div class="py-l2">📦 حطه في مكان الانتظار، مش مع الرف العادي</div>';
    for (const r of g.rows) {
      const wa = waLink(r.phone, customerMsg(r.item));
      html += `<div class="py-l2">${person(r)} · ${qtySpan(r)}</div><div class="py-acts">` +
        `<a class="py-a on" href="${esc(telLink(r.phone))}" data-wl-called="${esc(r.id)}">اتصل</a>` +
        `<a class="py-a" href="${esc(wa)}" target="_blank" rel="noopener" data-wl-called="${esc(r.id)}">واتساب</a>` +
        act(r.id, 'delivered', 'اتسلّم', 'py-p') + act(r.id, 'reopen', 'مش وصل لسه') + '</div>';
    }
    return html + '</div>';
  }
  function waitCard(r) {
    return `<div class="py-card"><div class="py-l1"><span class="py-name" dir="ltr"><bdi class="notr">${esc(r.item)}</bdi></span>${vchip(r)}</div>` +
      `<div class="py-l2">${person(r)} · ${qtySpan(r)} · <span>${esc(ago('اتطلب', r.days))}</span>` + (r.item_id == null ? ` · <span>${esc('صنف مش معروف للسيستم: دوس «وصل» بإيدك')}</span>` : '') + '</div>' +
      (r.vendor_id == null ? `<div class="py-l2">${vendorSelect(`data-wl-vendor="${esc(r.id)}"`, '')}</div>` : '') +
      `<div class="py-acts">${act(r.id, 'arrived', 'وصل', 'py-p')}${act(r.id, 'cancelled', 'إلغاء')}</div></div>`;
  }
  function leftCard(r) {
    const left = r.left_days, hot = left != null && left <= 2;
    const nums = [`اتباع آخر سنة: ${num(r.sold_year)} علبة`, r.price != null ? `السعر ${num(r.price)} ج` : '', r.exp_near ? `أقرب صلاحية في المخزن ${String(r.exp_near).slice(0, 7)}` : ''].filter(Boolean);
    return `<div class="py-card${hot ? ' py-look' : ''}"><div class="py-l1"><span class="py-name" dir="ltr"><bdi class="notr">${esc(r.item)}</bdi></span>${vchip(r)}</div>` +
      `<div class="py-l2">${person(r)} · ${qtySpan(r)}${r.called ? ` · <span>${esc('اتكلم')}</span>` : ''}</div>` +
      `<div class="py-l2"><span>${esc(ago('وصل', r.days_here))}</span> · <b>${esc(leftText(left))}</b></div>` +
      `<div class="py-l2">${nums.map((n) => `<span>${esc(n)}</span>`).join(' · ')}${r.exp_short ? ' ' + tag('صلاحيته أقل من سنة ونص') : ''}</div>` +
      (r.vendor_id == null ? `<div class="py-l2">${vendorSelect(`data-wl-vendor="${esc(r.id)}"`, '')}</div>` : '') +
      `<div class="py-acts">${act(r.id, 'returned', 'رجّعته للمورد', 'py-p')}${act(r.id, 'kept', 'هسيبه')}${act(r.id, 'delivered', 'اتسلّم')}${act(r.id, 'reopen', 'مش وصل لسه')}</div></div>`;
  }
  const head = (title, n) => `<h3 class="py-h">${esc(title)} <span class="py-num">${esc(n)}</span></h3>`;

  function formHtml() {
    if (!form) return '<button type="button" class="py-new" data-wl-new>📝 طلب مش موجود</button>';
    const f = form, v = vendorOf(f.vendor);
    const picked = f.item ? `<div class="py-field"><span dir="ltr"><bdi class="notr">${esc(f.item.name)}</bdi></span><button type="button" class="secondary small" data-wl-unpick>✕</button></div>`
      : `<input id="wlItem" type="search" dir="ltr" placeholder="اسم الدوا (إنجليزي أو عربي)" aria-label="اسم الدوا" value="${esc(f.q)}" autocomplete="off" />` +
        (f.q.trim().length >= 2 ? `<div class="py-picks">${f.results.map((r) => `<button type="button" class="py-pick" data-wl-pick="${esc(r.id)}"><b dir="ltr"><bdi class="notr">${esc(r.name)}</bdi></b>${r.arabic_name ? `<small>${esc(r.arabic_name)}</small>` : ''}</button>`).join('')}` +
          `<button type="button" class="py-pick" data-wl-typed><b>اكتبه زي ما هو</b><small dir="ltr"><bdi class="notr">${esc(f.q.trim())}</bdi></small></button></div>` : '');
    return `<div class="py-card py-confirm"><span class="py-lab">الدوا</span>${picked}` +
      `<span class="py-lab">العميل</span><div class="py-seg" style="grid-template-columns:2fr 1fr"><input id="wlPhone" type="tel" dir="ltr" placeholder="01xxxxxxxxx" aria-label="رقم العميل" value="${esc(f.phone)}" />` +
      `<input id="wlQty" type="text" inputmode="numeric" placeholder="الكمية 1" aria-label="الكمية" value="${esc(f.qty)}" /></div>` +
      `<input id="wlName" type="text" placeholder="اسم العميل (اختياري)" aria-label="اسم العميل" maxlength="80" value="${esc(f.name)}" />` +
      `<span class="py-lab">المورد اللي هتبعتله</span>${vendorSelect('id="wlVendor"', f.vendor)}` +
      (v && !v.kind ? `<span class="py-lab">المورد ده مخزن ولا مركز توزيع؟ (مرة واحدة بس)</span><div class="py-seg" style="grid-template-columns:1fr 1fr"><button type="button" class="${f.kind === 'warehouse' ? 'on' : ''}" data-wl-kind="warehouse">مخزن · رجوع 30 يوم</button><button type="button" class="${f.kind === 'center' ? 'on' : ''}" data-wl-kind="center">مركز توزيع · رجوع 7 أيام</button></div>` : '') +
      (f.msg ? `<p class="status bad" id="wlMsg">${esc(f.msg)}</p>` : '') +
      `<div class="py-acts"><button type="button" class="py-p" data-wl-save="copy"${busy ? ' disabled' : ''}>سجّل وانسخ رسالة المورد</button><button type="button" class="secondary" data-wl-save="only"${busy ? ' disabled' : ''}>سجّل بس</button><button type="button" class="secondary" data-wl-close>إلغاء</button></div></div>`;
  }

  function draw() {
    const main = $('wlMain'), fm = $('wlForm');
    if (!main || !fm) return;
    fm.innerHTML = formHtml();
    let html = lastMsg ? `<div class="py-card"><textarea readonly rows="4" dir="rtl" aria-label="رسالة المورد">${esc(lastMsg)}</textarea></div>` : '';
    const groups = groupCall(data.call);
    if (groups.length) html += head('📞 كلّم دول', data.call.length) + groups.map(callCard).join('');
    if (data.waiting.length) html += head('مستنيين الدوا', data.waiting.length) + data.waiting.map(waitCard).join('');
    if (data.leftover.length) html += head('↩️ قرار الرجوع', data.leftover.length) + '<p class="hint">اللي وصل وما اتسلّمش. الأقرب ميعادًا فوق. القرار ليك: السيستم بيعرض الأرقام بس.</p>' + data.leftover.map(leftCard).join('');
    if (!html) html = loaded ? '<p class="empty">مفيش طلبات انتظار دلوقتي. لما عميل يسأل على دوا مش موجود، دوس «طلب مش موجود».</p>' : '';
    main.innerHTML = html;
    const st = $('wlStatus');
    if (st) { st.textContent = note || (loading ? 'بحمّل…' : ''); st.className = 'status'; }
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
  async function save(copyMsg) {
    if (!form || busy) return;
    readForm();
    const f = form;
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
      const d = await rpc('ar_waitlist_add', { p_item_id: f.item && f.item.id != null ? Number(f.item.id) : null, p_item_name: item, p_phone: phone, p_name: f.name.trim() || null, p_qty: qty, p_vendor_id: v ? Number(v.id) : null });
      if (!d || !d.ok) throw new Error(errText(d && d.error));
      let copied = false;
      const text = vendorMsg(item, qty);
      if (copyMsg) copied = await copy(text);
      const base = d.dup ? 'الطلب ده كان مسجّل قبل كده.' : 'اتسجّل.';
      note = !copyMsg ? base : copied ? base + ' رسالة المورد اتنسخت، ابعتها من واتساب.' : base + ' ماقدرتش أنسخ الرسالة، انسخها بإيدك من تحت.';
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
    $('wlRefresh')?.addEventListener('click', () => { note = ''; load(); });
    panel.addEventListener('input', (e) => {
      if (e.target.id === 'wlItem' && form) { form.q = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(search, 250); }
    });
    panel.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'wlVendor' && form) { readForm(); form.kind = ''; form.msg = ''; draw(); }
      else if (t.dataset && t.dataset.wlVendor) setVendor(t.dataset.wlVendor, t.value);
    });
    panel.addEventListener('click', (e) => {
      const t = e.target.closest('[data-wl-new],[data-wl-close],[data-wl-pick],[data-wl-typed],[data-wl-unpick],[data-wl-kind],[data-wl-save],[data-wl-act],[data-wl-called]');
      if (!t) return;
      const d = t.dataset;
      if ('wlNew' in d) { note = ''; lastMsg = ''; form = { item: null, q: '', results: [], phone: '', name: '', qty: '', vendor: '', kind: '', msg: '' }; draw(); $('wlItem')?.focus(); return; }
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
      if ('wlKind' in d) { form.kind = d.wlKind; form.msg = ''; draw(); return; }
      if ('wlSave' in d) save(d.wlSave === 'copy');
    });
  }

  function open() { bind(); load(); }
  // the numbers for the home (ar/notify.js): this also marks what the stock list shows as arrived
  async function counts() {
    if (!db()) return null;
    if (root.AskerStaff && root.AskerStaff.isStaff && root.AskerStaff.isStaff()) return null; // the database answers the owner only
    try {
      const { data: d, error } = await db().rpc('ar_waitlist_overview');
      if (error || !d || d.ok === false) return null;
      return { call: (d.call || []).length, near: (d.leftover || []).filter((r) => r.left_days != null && r.left_days <= 2).length };
    } catch (e) { return null; }
  }
  root.AskerWait = { open, counts };
})(typeof window === 'undefined' ? globalThis : window);
