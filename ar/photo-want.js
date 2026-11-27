/* «📷 صور مطلوبة» (owner 2026-11-27: «قايمه فوق المراجعه فيها اسامى الاصناف اللى مفيهاش صور جاهزة للارسال واتس لارقام معينه … يزيد عليها اول باول اللى هرشحه للصور من المراجعه … و اوبشن
   … للمستخدمين معايا بحيث يصور من جوه السيستم او يضيف من الصور»; mockup mockups/photo_list_2026-11-27.png, his «كمل»).
   The owner: above «مراجعة الفواتير». (His correction the same day: «صور الصنف الجديد تبقى اول الاصناف فى صور مطلوبه … تدخل تلقائى اما باقى الاصناف انا اللى هدخلها من اصناف الفواتير».)
   NEW items (no PharmaFly card yet) come FIRST and by themselves: the server lists them when the invoice is prepared (ar_photo_new, migration 202611271700). Their box photo goes the same way as the
   invoice card's «📷 صوّر العلبة» (ar_item_reads, kind new_item): the laptop reads it and it becomes the new card's photo. UNDER them (his second word: «سيب الاصناف اللى ملهاش صورة اوتوماتيك عادى
   بس تحت الاصناف الجديده»): the items of the prepared invoices with NO photo, by themselves; and the ones he adds from an invoice card because their photo is wrong, whoever chose it.
   A line leaves once its photo is sent (a new item), once an item with none gets a person's photo / «تمام», once one he added gets a NEW photo / «تمام» after he added it, or with his ✕.
   His WhatsApp numbers: the whole list or only what is new since the last time;
   he presses send in WhatsApp. A staff member with «صور مطلوبة»: the names, the camera and the phone's photos; nothing else (tables ar_photo_wanted / ar_photo_numbers, migration 202611271200).
   HIS APPROVAL (the same night: «لما الصور تنضاف، لأن مش أنا اللي بضيفها، تفضل معروضة مستنية موافقتي، ما تدخلش في المعروض على طول»): a photo anyone but him adds, from anywhere, is not shown; it waits
   in «مستنية موافقتك» on top of this box (ar_photo_pending, migration 202611272300; the server keeps it back, not the page). ✓ shows it; ✕ keeps it off and sends the item back as «صوّرها تاني».
   While it waits the item is not asked for again, and the one who took it sees that it arrived. */
(function (root) {
  'use strict';

  // ---------- pure helpers (tests/photo-want.cjs) ----------
  const FIRST = 3, FIRST_STAFF = 60;
  const newestFirst = (a, b) => String(b.added_at || '').localeCompare(String(a.added_at || '')) || String(a.key).localeCompare(String(b.key), 'en', { numeric: true });
  // the NEW lines still waiting for their box: listed by the server, not rejected / cancelled / taken off, and no box photo on its way. reads = the readings of those invoices; the newest one of a
  // line decides: sent, being read, read or on its card = done here; failed, or read with nothing found = wanted again
  function newWaiting(rows, reads) {
    const last = {};
    for (const x of (reads || []).slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))) if (x.status !== 'cancelled') last[x.review_id + '|' + x.line_n] = x;
    const out = [];
    for (const r of rows || []) {
      if (!r || r.removed_at || r.gone) continue;
      const x = last[r.review_id + '|' + r.line_n];
      const bad = !!x && (x.status === 'failed' || (x.status === 'done' && !(x.result && x.result.found)));
      if (x && !bad) continue;
      out.push({ ...r, kind: 'new', key: 'n:' + r.review_id + '|' + r.line_n, retry: bad });
    }
    return out.sort(newestFirst);
  }
  // the other items that still wait, not taken off. stateOf = AskerItemMedia.photoState ('none' | 'net' | 'ok', null = the photos are not read yet: nothing is shown).
  // One that came by itself (no photo) waits until it has a person's photo. One HE added waits even if a person had chosen its photo: until a new one, or «تمام», AFTER he added it
  // (fixedAt = AskerItemMedia.fixedAt: when a person last gave, removed or kept its photo)
  function waiting(rows, stateOf, fixedAt) {
    return (rows || []).filter((r) => {
      if (!r || r.removed_at) return false;
      const st = stateOf(Number(r.item_id));
      if (st == null) return false;
      if (r.why !== 'picked' && r.why !== 'retake') return st !== 'ok';
      const at = fixedAt ? fixedAt(Number(r.item_id)) : null;
      return !(at && Date.parse(at) > Date.parse(r.added_at));
    }).map((r) => ({ ...r, kind: 'item', key: 'i:' + r.item_id })).sort(newestFirst);
  }
  // the items of the prepared invoices that have no photo and are not in the table yet (a rejected line goes back to the supplier; one he took off stays off)
  function autoRows(reviews, have, stateOf) {
    const out = [], seen = new Set((have || []).map((r) => Number(r.item_id)));
    for (const r of reviews || []) {
      if (!r || r.status === 'cancelled') continue;
      const ans = r.answers && typeof r.answers === 'object' ? r.answers : {};
      for (const l of Array.isArray(r.lines) ? r.lines : []) {
        const id = l && Number(l.id);
        if (!(id > 0) || seen.has(id) || (ans['R' + l.n] && ans['R' + l.n].v === 'reject') || stateOf(id) !== 'none') continue;
        const name = String(l.name || l.paper || '').replace(/\s+/g, ' ').trim().slice(0, 250);
        if (!name) continue;
        seen.add(id);
        out.push({ item_id: id, name, why: 'none' });
      }
    }
    return out;
  }
  const sameDay = (a, b) => { const x = new Date(a), y = new Date(b); return !isNaN(x) && x.toDateString() === y.toDateString(); };
  // an item whose photo waits for his yes is not asked for again: his list (and what he sends) leaves it out; the one who takes photos still sees it, marked «arrived»
  function withHeld(items, pending, owner) {
    const held = new Set((pending || []).map((p) => Number(p.item_id)));
    if (!held.size) return items.slice();
    const out = [];
    for (const e of items) {
      if (e.kind !== 'item' || !held.has(Number(e.item_id))) out.push(e);
      else if (!owner) out.push({ ...e, held: true });
    }
    return out;
  }
  // the small line under a name
  function why(e, owner) {
    if (e.held) return 'صورتها وصلت، مستنية موافقة صاحب الصيدلية';
    if (e.why === 'retake') return owner ? 'رفضت صورتها، مستنية صورة جديدة' : 'الصورة اللي فاتت ما اتقبلتش، صوّرها تاني';
    if (e.kind === 'new') {
      if (e.retry) return 'الصورة ما اتقرتش، صوّرها تاني';
      return owner && e.supplier ? 'من فاتورة ' + e.supplier : 'صوّر العلبة من قدّام';
    }
    if (!owner) return 'صوّرها أو هاتها من الصور';
    return e.why === 'picked' ? 'إنت ضفتها من المراجعة' : 'من غير صورة';
  }
  // what is new for a number: added after the last time the list was opened for it (never sent = all of it)
  const newSince = (list, at) => (at ? list.filter((r) => Date.parse(r.added_at) > Date.parse(at)) : list.slice());
  const waText = (list) => 'محتاجين صور للأصناف دي 📷 (صورة العلبة من قدّام)\n\n' + list.map((r, i) => `${i + 1}) ${r.name}${r.kind === 'new' ? ' (صنف جديد)' : ''}`).join('\n');
  // an Egyptian number written the local way (01…) gets the country code; '' if it is not a number
  function intlPhone(s) {
    let d = String(s || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (/^0[1-9]\d{7,9}$/.test(d)) d = '20' + d.slice(1);
    else if (/^1\d{9}$/.test(d)) d = '20' + d;
    return /^\d{10,15}$/.test(d) ? d : '';
  }
  const localPhone = (d) => (/^201\d{9}$/.test(String(d)) ? '0' + String(d).slice(2) : String(d));
  const api = { newWaiting, waiting, withHeld, autoRows, why, newSince, waText, intlPhone, localPhone };
  root.AskerPhotoWantLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;
  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const media = () => (root.AskerItemMedia && root.AskerItemMedia.photoState ? root.AskerItemMedia : null);
  const stateOf = (id) => { const M = media(); return M ? M.photoState(id) : null; };
  const fixedAt = (id) => { const M = media(); return M && M.fixedAt ? M.fixedAt(id) : null; };
  let rows = [], newRows = [], reads = [], numbers = [], pending = [], ready = false, owner = false, showing = false, all = false, adding = false, busy = {}, timer = null, sig = '';
  const imgUrl = (path) => ((root.AskerItemMediaLib && root.AskerItemMediaLib.IMG_URL) || '') + path;
  const listeners = [];
  const told = () => { for (const f of listeners) try { f(); } catch (e) { /* the invoice cards are not on screen */ } };

  function say(text, kind) {
    const el = $('pwStatus');
    if (el) { el.textContent = text || ''; el.className = 'status' + (kind ? ' ' + kind : ''); }
  }
  async function read() {
    const c = db();
    if (!c) return false;
    const { data, error } = await c.from('ar_photo_wanted').select('item_id,name,why,added_at,removed_at').order('added_at', { ascending: false }).limit(1000);
    if (error) { ready = false; return false; } // before the migration, or not opened for this person
    rows = data || [];
    ready = true;
    await readNew();
    await readPending();
    if (owner) {
      const n = await c.from('ar_photo_numbers').select('id,name,phone,last_sent_at,created_at').order('created_at', { ascending: true }).limit(50);
      numbers = n.error ? [] : n.data || [];
    } else numbers = [];
    return true;
  }
  // the new items and the readings of their boxes (before migration 202611271700 there are none: the rest of the list works as it is)
  async function readNew() {
    const c = db();
    const n = await c.from('ar_photo_new').select('review_id,line_n,name,supplier,gone,added_at,removed_at').order('added_at', { ascending: false }).limit(300);
    if (n.error) { newRows = []; reads = []; return; }
    newRows = n.data || [];
    const ids = [...new Set(newRows.filter((r) => !r.gone && !r.removed_at).map((r) => r.review_id))];
    if (!ids.length) { reads = []; return; }
    const x = await c.from('ar_item_reads').select('id,review_id,line_n,status,result,created_at').in('review_id', ids).eq('kind', 'new_item').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(500);
    if (!x.error) reads = x.data || [];
  }
  // the photos waiting for his yes (before migration 202611272300 there are none)
  async function readPending() {
    const p = await db().from('ar_photo_pending').select('id,item_id,name,img,by_name,live,at').eq('status', 'pending').order('at', { ascending: false }).limit(200);
    pending = p.error ? [] : p.data || [];
  }
  // the new ones first, then the ones he put
  const list = () => withHeld(newWaiting(newRows, reads).concat(waiting(rows, stateOf, fixedAt)), pending, owner);

  const pick = (key, text, camera, label) => `<label class="pw-cam${camera ? '' : ' pw-gal'}" aria-label="${label}">${text}<input type="file" accept="image/*"${camera ? ' capture="environment"' : ''} hidden data-pw-photo="${esc(key)}"></label>`;
  function itemHtml(e) {
    const isNew = e.kind === 'new';
    return `<div class="pw-it${isNew ? ' pw-isnew' : ''}" data-pw-item="${esc(e.key)}"><div class="pw-nm"><b class="notr" dir="auto">${esc(e.name)}</b>` +
      `<small>${isNew ? '<em class="pw-tag">صنف جديد</em> ' : ''}<span${isNew && !e.retry && owner && e.supplier ? ' class="notr"' : ''}>${esc(why(e, owner))}</span></small></div>` +
      (busy[e.key] ? '<span class="pw-wait">بحفظ الصورة…</span>' : e.held ? '<span class="pw-held">⏳ مستنية الموافقة</span>' : pick(e.key, '📷', true, 'صوّر العلبة') + pick(e.key, '🖼', false, 'هات من الصور')) +
      (owner ? `<button type="button" class="pw-x" data-pw-x="${esc(e.key)}" aria-label="شيلها من القايمة">✕</button>` : '') + '</div>';
  }  const when = (iso) => {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    const t = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'ص' : 'م'}`;
    return sameDay(d, new Date()) ? t : `${d.getDate()}/${d.getMonth() + 1} ${t}`;
  };
  function numberHtml(n, items) {
    const fresh = newSince(items, n.last_sent_at).length;
    return `<div class="pw-num"><div class="pw-nh"><b>${n.name ? `<span class="notr">${esc(n.name)}</span> · ` : ''}<span class="notr" dir="ltr">${esc(localPhone(n.phone))}</span></b>` +
      `<button type="button" class="pw-x" data-pw-delnum="${esc(n.id)}" aria-label="امسح الرقم">✕</button></div>` +
      (n.last_sent_at ? `<small class="pw-last"><span>آخر إرسال:</span> <bdi>${esc(when(n.last_sent_at))}</bdi></small>` : '<small class="pw-last">لسه ما اتبعتلوش</small>') +
      `<div class="pw-two"><button type="button" class="pw-btn main" data-pw-send="${esc(n.id)}|all"${items.length ? '' : ' disabled'}><span>📤 واتس: الكل</span> (<bdi dir="ltr">${items.length}</bdi>)</button>` +
      `<button type="button" class="pw-btn" data-pw-send="${esc(n.id)}|new"${fresh ? '' : ' disabled'}><span>الجديد بس</span> (<bdi dir="ltr">${fresh}</bdi>)</button></div></div>`;
  }
  // one photo that waits for him: big enough to judge, a tap fills the screen with it. A «live» one was already shown when the approval began
  function approveHtml(p) {
    return `<div class="pw-ap" data-pw-ap="${esc(p.id)}"><button type="button" class="pw-thumb" data-pw-big="${esc(p.id)}" aria-label="كبّر الصورة"><img src="${esc(imgUrl(p.img))}" alt="" loading="lazy"></button>` +
      `<div class="pw-ab"><b class="notr" dir="auto">${esc(p.name)}</b><small>${p.by_name ? `<span>صوّرها</span> <bdi class="notr">${esc(p.by_name)}</bdi> · ` : ''}<bdi>${esc(when(p.at))}</bdi></small>` +
      (p.live ? '<small class="pw-live">متعرضة دلوقتي: لو رفضتها تتشال</small>' : '') +
      (busy['a:' + p.id] ? '<span class="pw-wait">بحفظ…</span>' : `<button type="button" class="pw-btn main" data-pw-yes="${esc(p.id)}">${p.live ? '✓ تمام، خليها' : '✓ تمام، اعرضها'}</button><button type="button" class="pw-btn" data-pw-no="${esc(p.id)}">✕ لأ، تتصوّر تاني</button>`) +
      '</div></div>';
  }
  const approvals = () => (owner && pending.length ? `<div class="pw-appr"><h3><span>⏳ مستنية موافقتك</span> (<bdi dir="ltr">${pending.length}</bdi>)</h3><p class="hint">دوس على الصورة تكبر. الصورة الجديدة ما بتتعرضش غير لما توافق.</p>` +
    pending.map(approveHtml).join('') + '</div>' : '');
  function draw() {
    const box = $('pwMain'), panel = $('photoWantPanel');
    if (!box || !panel) return;
    const items = ready ? list() : [];
    // the box is there even when nothing waits: that is where he saves his numbers, and where he looks for it. Only before the list is on the server the owner sees nothing
    panel.classList.toggle('pw-empty', owner && !ready);
    const cnt = $('pwCount'), asked = items.filter((e) => !e.held).length;
    if (cnt) { cnt.textContent = asked ? String(asked) : ''; cnt.hidden = !asked; }
    const ask = $('pwApprCount'), mine = owner && ready ? pending.length : 0;
    if (ask) { ask.textContent = mine ? '⏳ ' + mine : ''; ask.hidden = !mine; }
    if (!ready) { box.innerHTML = owner ? '' : '<p class="hint">القايمة لسه مش متاحة. جرّب كمان شوية.</p>'; return; }
    let h = approvals();
    h += items.length ? '' : '<p class="hint">مفيش صور مطلوبة دلوقتي ✓</p>' + (owner ? '<p class="hint">الصنف الجديد واللي من غير صورة بيدخلوا هنا لوحدهم. ولو صنف صورته غلط، ضيفه من أصناف الفاتورة.</p>' : '');
    if (owner) {
      h += numbers.map((n) => numberHtml(n, items)).join('');
      h += adding
        ? '<div class="pw-add"><input type="text" id="pwName" maxlength="60" placeholder="الاسم (اختياري)" aria-label="اسم صاحب الرقم"><input type="tel" id="pwPhone" dir="ltr" maxlength="20" inputmode="tel" placeholder="01xxxxxxxxx" aria-label="رقم الواتس">' +
          '<div class="pw-two"><button type="button" class="pw-btn main" data-pw-save>احفظ الرقم</button><button type="button" class="pw-btn" data-pw-cancel>إلغاء</button></div></div>'
        : `<div class="pw-two"><button type="button" class="pw-btn" data-pw-add>＋ رقم جديد</button><button type="button" class="pw-btn" data-pw-group${items.length ? '' : ' disabled'}>👥 ابعت لجروب</button></div>`;
    }
    // every new item is in sight; of the others the first few, the rest behind «… وكمان»
    const fresh = items.filter((e) => e.kind === 'new'), others = items.filter((e) => e.kind !== 'new');
    const cap = owner ? FIRST : FIRST_STAFF, shown = all ? others : others.slice(0, cap);
    h += fresh.concat(shown).map(itemHtml).join('');
    if (others.length > cap) h += `<button type="button" class="pw-more" data-pw-more>${all ? 'اقفل القايمة ▴' : `<span>… وكمان</span> <bdi dir="ltr">${others.length - cap}</bdi> ▾`}</button>`;
    box.innerHTML = h;
  }
  const signature = () => JSON.stringify([ready, owner, adding, all, Object.keys(busy), numbers.map((n) => [n.id, n.name, n.phone, n.last_sent_at]), pending.map((p) => [p.id, p.img]), ready ? list().map((r) => [r.key, r.name, !!r.retry, r.supplier || '', !!r.held, r.why || '']) : []]);
  const typing = () => { const a = document.activeElement; return !!(a && a.closest && a.closest('#pwMain') && a.tagName === 'INPUT' && a.type !== 'file'); };
  function redraw(force) {
    const next = signature();
    if (!force && (next === sig || typing())) return;
    sig = next;
    draw();
  }

  // ---------- what the invoice cards use (ar/invoice-review.js) ----------
  const row = (id) => rows.find((r) => Number(r.item_id) === Number(id));
  // on the list and still waiting (one that got its new photo may be added again)
  const wanted = (id) => waiting(rows, stateOf, fixedAt).some((e) => Number(e.item_id) === Number(id));
  // the invoice review saw invoices. A new line the list does not know yet = the list is read again (the server has already added it). The items with no photo are added here, by the owner's
  // page (only it can tell which have none); one he took off stays off
  async function noteReviews(reviews) {
    const M = media();
    if (!M || !db()) return;
    owner = true;
    try {
      await M.load();
      const known = new Set(newRows.map((r) => r.review_id + '|' + r.line_n));
      const unseen = (reviews || []).some((r) => r && r.status !== 'cancelled' && (Array.isArray(r.lines) ? r.lines : []).some((l) => l && !(Number(l.id) > 0) && !known.has(r.id + '|' + l.n)));
      if (!ready || unseen) { if (!(await read())) return; redraw(); told(); }
      const add = autoRows(reviews, rows, stateOf);
      if (!add.length) return;
      const at = new Date().toISOString();
      const { error } = await db().from('ar_photo_wanted').upsert(add.map((x) => ({ ...x, added_at: at, removed_at: null })), { onConflict: 'item_id', ignoreDuplicates: true });
      if (error) return;
      await read(); redraw(); told();
    } catch (e) { /* the list is a help: the invoices are shown without it */ }
  }  // he puts an item of an invoice on the list (a wrong internet photo, or none); the same tap again takes it back
  async function toggle(id, name) {
    const c = db(), r = row(id);
    if (!c || !ready) throw new Error('القايمة لسه مش متاحة');
    const on = !wanted(id), at = new Date().toISOString();
    const next = on ? { item_id: Number(id), name: String(name || (r && r.name) || id).slice(0, 250), why: 'picked', added_at: at, removed_at: null } : { ...r, removed_at: at };
    const { error } = await c.from('ar_photo_wanted').upsert(next, { onConflict: 'item_id' });
    if (error) throw new Error(error.message || String(error));
    if (r) Object.assign(r, next); else rows.unshift(next);
    redraw(); told();
    return on;
  }

  // ---------- the box ----------
  const fit = (w, h, max) => { const k = Math.min(1, max / Math.max(w, h)); return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }; };
  const loadImg = (src) => new Promise((ok, bad) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => bad(new Error('الملف ده مش صورة.')); img.src = src; });
  const entry = (key) => list().find((e) => e.key === key);
  async function photo(input) {
    const key = input.dataset.pwPhoto, file = input.files && input.files[0], M = media(), e = entry(key);
    input.value = '';
    if (!e || !file) return;
    busy[key] = true; redraw(true);
    const url = URL.createObjectURL(file);
    try {
      // a new item's box is read by the laptop (bigger, like the invoice card's camera); another item's photo becomes its photo at once
      const img = await loadImg(url), max = e.kind === 'new' ? 1300 : 800, { w, h } = fit(img.naturalWidth, img.naturalHeight, max);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      if (e.kind === 'new') {
        const { error } = await db().from('ar_item_reads').insert({ kind: 'new_item', review_id: e.review_id, line_n: String(e.line_n), item_name: String(e.name).slice(0, 250), img_b64: cv.toDataURL('image/jpeg', 0.82).split(',')[1] });
        if (error) throw new Error(error.message || String(error));
        reads.unshift({ review_id: e.review_id, line_n: String(e.line_n), status: 'pending', created_at: new Date().toISOString() });
        say('الصورة وصلت ✓ اللاب هيقرا العلبة', 'good');
      } else {
        if (!M) throw new Error('القايمة لسه مش متاحة');
        const sent = await M.upload(Number(e.item_id), cv.toDataURL('image/jpeg', 0.85));
        if (sent && sent.pending) { await readPending(); say('الصورة وصلت ✓ مستنية موافقة صاحب الصيدلية', 'good'); }
        else say('الصورة بقت صورة الصنف ✓', 'good');
      }
    } catch (err) { say('الصورة ما اتحفظتش: ' + (err.message || err), 'bad'); }
    finally { URL.revokeObjectURL(url); delete busy[key]; redraw(true); told(); }
  }
  async function remove(key) {
    const e = entry(key);
    if (!e || !root.confirm(`تشيل «${e.name}» من قايمة الصور؟`)) return;
    const at = new Date().toISOString();
    const q = e.kind === 'new' ? db().from('ar_photo_new').update({ removed_at: at }).eq('review_id', e.review_id).eq('line_n', e.line_n)
      : db().from('ar_photo_wanted').update({ removed_at: at }).eq('item_id', Number(e.item_id));
    const { error } = await q;
    if (error) return say('ما اتشالتش: ' + error.message, 'bad');
    const src = e.kind === 'new' ? newRows.find((r) => r.review_id === e.review_id && r.line_n === e.line_n) : row(e.item_id);
    if (src) src.removed_at = at;
    redraw(true); told(); say('اتشالت من القايمة ✓', 'good');
  }  function openWa(phone, text) {
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    // WhatsApp Business on Android while the box on the supplier tab is ticked (ar/app.js AskerApp.openWaUrl)
    if (root.AskerApp && root.AskerApp.openWaUrl && root.AskerApp.openWaUrl(url)) return;
    if (!root.open(url, '_blank')) location.href = url;
  }
  async function send(nid, kind) {
    const n = numbers.find((x) => String(x.id) === String(nid)), items = list();
    if (!n) return;
    const part = kind === 'new' ? newSince(items, n.last_sent_at) : items;
    if (!part.length) return say('مفيش جديد من آخر مرة', 'bad');
    openWa(n.phone, waText(part));
    const at = new Date().toISOString();
    const { error } = await db().from('ar_photo_numbers').update({ last_sent_at: at }).eq('id', n.id);
    if (!error) n.last_sent_at = at;
    redraw(true);
    say('الواتس اتفتح بالرسالة: اضغط إرسال هناك', 'good');
  }
  async function saveNumber() {
    const phone = intlPhone($('pwPhone') && $('pwPhone').value), name = String(($('pwName') && $('pwName').value) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!phone) return say('اكتب رقم واتس صحيح (مثلًا 01xxxxxxxxx)', 'bad');
    if (numbers.some((n) => n.phone === phone)) return say('الرقم ده متسجل قبل كده', 'bad');
    const { error } = await db().from('ar_photo_numbers').insert({ name, phone, last_sent_at: null });
    if (error) return say('الرقم ما اتحفظش: ' + error.message, 'bad');
    adding = false;
    await read(); redraw(true); say('الرقم اتحفظ ✓', 'good');
  }
  async function deleteNumber(nid) {
    const n = numbers.find((x) => String(x.id) === String(nid));
    if (!n || !root.confirm(`تمسح رقم ${n.name || localPhone(n.phone)} من القايمة؟`)) return;
    const { error } = await db().from('ar_photo_numbers').delete().eq('id', n.id);
    if (error) return say('الرقم ما اتمسحش: ' + error.message, 'bad');
    numbers = numbers.filter((x) => x !== n); redraw(true);
  }
  // his answer on a waiting photo (the server does the rest: ar_photo_decide)
  async function decide(id, yes) {
    const p = pending.find((x) => String(x.id) === String(id));
    if (!p || busy['a:' + id]) return;
    if (!yes && !root.confirm(p.live ? `ترفض صورة «${p.name}»؟ هتتشال من على الصنف، ويرجع للقايمة يتصوّر تاني.` : `ترفض صورة «${p.name}»؟ مش هتتعرض، والصنف يرجع للقايمة يتصوّر تاني.`)) return;
    busy['a:' + id] = true; redraw(true);
    let done = null, failed = null;
    try { const r = await db().rpc('ar_photo_decide', { p_id: Number(p.id), p_ok: yes }); done = r.data; failed = r.error; }
    catch (e) { failed = e; }
    delete busy['a:' + id];
    if (failed) { say('ما اتحفظش: ' + (failed.message || failed), 'bad'); return redraw(true); }
    say(done && done.ok === false ? 'الصورة دي اتغيّرت قبل كده، والقايمة اتحدّثت' : yes ? 'اتعرضت على الصنف ✓' : 'اترفضت، والصنف رجع للقايمة', 'good');
    pending = pending.filter((x) => x !== p);
    redraw(true);
    try { await refresh(true); } catch (e) { /* the answer is kept; the list is read again within a minute */ }
  }
  const unbig = () => { const o = document.querySelector('.pw-big'); if (o) o.remove(); };
  function big(id) {
    const p = pending.find((x) => String(x.id) === String(id));
    if (!p) return;
    unbig();
    const o = document.createElement('div');
    o.className = 'pw-big';
    o.setAttribute('role', 'dialog');
    o.innerHTML = `<img src="${esc(imgUrl(p.img))}" alt=""><b class="notr" dir="auto">${esc(p.name)}</b><button type="button" aria-label="اقفل">✕</button>`;
    o.addEventListener('click', unbig);
    document.body.appendChild(o);
  }
  function onClick(e) {
    const g = (a) => e.target.closest('[' + a + ']');
    let el;
    if ((el = g('data-pw-yes'))) return decide(el.dataset.pwYes, true);
    if ((el = g('data-pw-no'))) return decide(el.dataset.pwNo, false);
    if ((el = g('data-pw-big'))) return big(el.dataset.pwBig);
    if ((el = g('data-pw-x'))) return remove(el.dataset.pwX);
    if (g('data-pw-more')) { all = !all; return redraw(true); }
    if (g('data-pw-add')) { adding = true; redraw(true); const i = $('pwPhone'); if (i) i.focus(); return; }
    if (g('data-pw-cancel')) { adding = false; return redraw(true); }
    if (g('data-pw-save')) return saveNumber();
    if (g('data-pw-group')) { const items = list(); if (items.length) openWa('', waText(items)); return; }
    if ((el = g('data-pw-send'))) { const [id, kind] = el.dataset.pwSend.split('|'); return send(id, kind); }
    if ((el = g('data-pw-delnum'))) return deleteNumber(el.dataset.pwDelnum);
  }
  async function refresh(force) {
    const M = media();
    if (M) { await M.load(); if (M.reload) await M.reload(); } // a photo taken on another phone since the page opened
    await read();
    if (showing) redraw(force);
    told();
  }
  function open(isOwner) {
    owner = !!isOwner;
    showing = true;
    say('');
    redraw(true);
    refresh(false).catch((e) => say('مقدرتش أجيب القايمة: ' + (e.message || e), 'bad'));
    clearInterval(timer);
    timer = setInterval(() => { if (showing && !document.hidden && !typing() && !Object.keys(busy).length) refresh(false).catch(() => {}); }, 60000);
  }
  function close() { showing = false; clearInterval(timer); timer = null; adding = false; unbig(); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') unbig(); });

  const main = $('pwMain');
  if (main) {
    main.addEventListener('click', onClick);
    main.addEventListener('change', (e) => { if (e.target.matches('[data-pw-photo]')) photo(e.target); });
    main.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.target.id === 'pwPhone' || e.target.id === 'pwName')) { e.preventDefault(); saveNumber(); } });
  }
  root.AskerItemMedia?.onChange?.(() => { if (showing) redraw(false); });
  const held = (id) => pending.some((p) => Number(p.item_id) === Number(id));
  root.AskerPhotoWant = { open, close, noteReviews, toggle, wanted, held, can: () => ready, onChange(f) { listeners.push(f); } };
})(typeof window === 'undefined' ? globalThis : window);
