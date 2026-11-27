/* «📷 صور مطلوبة» (owner 2026-11-27: «قايمه فوق المراجعه فيها اسامى الاصناف اللى مفيهاش صور جاهزة للارسال واتس لارقام معينه … يزيد عليها اول باول اللى هرشحه للصور من المراجعه … و اوبشن
   … للمستخدمين معايا بحيث يصور من جوه السيستم او يضيف من الصور»; mockup mockups/photo_list_2026-11-27.png, his «كمل»).
   The owner: above «مراجعة الفواتير». Items with no photo are added by themselves when a prepared invoice brings them; the ones with a wrong internet photo he nominates from the invoice card.
   An item leaves once a person's photo is saved (or «تمام»), or with his ✕. His WhatsApp numbers: the whole list or only what is new since the last time; he presses send in WhatsApp.
   A staff member with «صور مطلوبة»: the names, the camera and the phone's photos; nothing else (tables ar_photo_wanted / ar_photo_numbers, migration 202611271200). */
(function (root) {
  'use strict';

  // ---------- pure helpers (tests/photo-want.cjs) ----------
  const FIRST = 3, FIRST_STAFF = 60;
  // what is still waiting: not removed by him, and no person's photo yet. stateOf = AskerItemMedia.photoState ('none' | 'net' | 'ok', null = the photos are not read yet: nothing is shown)
  function waiting(rows, stateOf) {
    return (rows || []).filter((r) => {
      if (!r || r.removed_at) return false;
      const st = stateOf(Number(r.item_id));
      return st != null && st !== 'ok';
    }).sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || '')) || Number(a.item_id) - Number(b.item_id));
  }
  const sameDay = (a, b) => { const x = new Date(a), y = new Date(b); return !isNaN(x) && x.toDateString() === y.toDateString(); };
  // the small line under a name
  const why = (r, now) => (r.why === 'picked' ? 'رشّحتها من المراجعة (صورتها مش تمام)' : sameDay(r.added_at, now || new Date()) ? 'من غير صورة · اتضافت النهارده' : 'من غير صورة');
  // what is new for a number: added after the last time the list was opened for it (never sent = all of it)
  const newSince = (list, at) => (at ? list.filter((r) => Date.parse(r.added_at) > Date.parse(at)) : list.slice());
  const waText = (list) => 'محتاجين صور للأصناف دي 📷 (صورة العلبة من قدّام)\n\n' + list.map((r, i) => `${i + 1}) ${r.name}`).join('\n');
  // an Egyptian number written the local way (01…) gets the country code; '' if it is not a number
  function intlPhone(s) {
    let d = String(s || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (/^0[1-9]\d{7,9}$/.test(d)) d = '20' + d.slice(1);
    else if (/^1\d{9}$/.test(d)) d = '20' + d;
    return /^\d{10,15}$/.test(d) ? d : '';
  }
  const localPhone = (d) => (/^201\d{9}$/.test(String(d)) ? '0' + String(d).slice(2) : String(d));
  // the items of the prepared invoices that have no photo and are not in the table yet (a rejected line goes back to the supplier; a new item without a card has its own box photo)
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
  const api = { waiting, why, newSince, waText, intlPhone, localPhone, autoRows };
  root.AskerPhotoWantLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const media = () => (root.AskerItemMedia && root.AskerItemMedia.photoState ? root.AskerItemMedia : null);
  const stateOf = (id) => { const M = media(); return M ? M.photoState(id) : null; };
  let rows = [], numbers = [], ready = false, owner = false, showing = false, all = false, adding = false, busy = {}, timer = null, sig = '';
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
    if (owner) {
      const n = await c.from('ar_photo_numbers').select('id,name,phone,last_sent_at,created_at').order('created_at', { ascending: true }).limit(50);
      numbers = n.error ? [] : n.data || [];
    } else numbers = [];
    return true;
  }
  const list = () => waiting(rows, stateOf);

  const pick = (id, text, camera, label) => `<label class="pw-cam${camera ? '' : ' pw-gal'}" aria-label="${label}">${text}<input type="file" accept="image/*"${camera ? ' capture="environment"' : ''} hidden data-pw-photo="${esc(id)}"></label>`;
  function itemHtml(r) {
    const id = Number(r.item_id);
    return `<div class="pw-it" data-pw-item="${esc(id)}"><div class="pw-nm"><b class="notr" dir="ltr">${esc(r.name)}</b><small>${esc(owner ? why(r, new Date()) : 'صوّرها أو هاتها من الصور')}</small></div>` +
      (busy[id] ? '<span class="pw-wait">بحفظ الصورة…</span>' : pick(id, '📷', true, 'صوّر العلبة') + pick(id, '🖼', false, 'هات من الصور')) +
      (owner ? `<button type="button" class="pw-x" data-pw-x="${esc(id)}" aria-label="شيلها من القايمة">✕</button>` : '') + '</div>';
  }
  const when = (iso) => {
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
  function draw() {
    const box = $('pwMain'), panel = $('photoWantPanel');
    if (!box || !panel) return;
    const items = ready ? list() : [];
    // the box is there even when nothing waits: that is where he saves his numbers, and where he looks for it. Only before the list is on the server the owner sees nothing
    panel.classList.toggle('pw-empty', owner && !ready);
    const cnt = $('pwCount');
    if (cnt) { cnt.textContent = items.length ? String(items.length) : ''; cnt.hidden = !items.length; }
    if (!ready) { box.innerHTML = owner ? '' : '<p class="hint">القايمة لسه مش متاحة. جرّب كمان شوية.</p>'; return; }
    let h = items.length ? '' : '<p class="hint">مفيش صور مطلوبة دلوقتي ✓</p>' + (owner ? '<p class="hint">اللي من غير صورة بيتضاف لوحده لما فاتورة جديدة تيجي للمراجعة.</p>' : '');
    if (owner) {
      h += numbers.map((n) => numberHtml(n, items)).join('');
      h += adding
        ? '<div class="pw-add"><input type="text" id="pwName" maxlength="60" placeholder="الاسم (اختياري)" aria-label="اسم صاحب الرقم"><input type="tel" id="pwPhone" dir="ltr" maxlength="20" inputmode="tel" placeholder="01xxxxxxxxx" aria-label="رقم الواتس">' +
          '<div class="pw-two"><button type="button" class="pw-btn main" data-pw-save>احفظ الرقم</button><button type="button" class="pw-btn" data-pw-cancel>إلغاء</button></div></div>'
        : `<div class="pw-two"><button type="button" class="pw-btn" data-pw-add>＋ رقم جديد</button><button type="button" class="pw-btn" data-pw-group${items.length ? '' : ' disabled'}>👥 ابعت لجروب</button></div>`;
    }
    const cap = owner ? FIRST : FIRST_STAFF, shown = all ? items : items.slice(0, cap);
    h += shown.map(itemHtml).join('');
    if (items.length > cap) h += `<button type="button" class="pw-more" data-pw-more>${all ? 'اقفل القايمة ▴' : `<span>… وكمان</span> <bdi dir="ltr">${items.length - cap}</bdi> ▾`}</button>`;
    box.innerHTML = h;
  }
  const signature = () => JSON.stringify([ready, owner, adding, all, Object.keys(busy), numbers.map((n) => [n.id, n.name, n.phone, n.last_sent_at]), ready ? list().map((r) => [r.item_id, r.name, r.why]) : []]);
  const typing = () => { const a = document.activeElement; return !!(a && a.closest && a.closest('#pwMain') && a.tagName === 'INPUT' && a.type !== 'file'); };
  function redraw(force) {
    const next = signature();
    if (!force && (next === sig || typing())) return;
    sig = next;
    draw();
  }

  // ---------- what the invoice cards use (ar/invoice-review.js) ----------
  const row = (id) => rows.find((r) => Number(r.item_id) === Number(id));
  const wanted = (id) => { const r = row(id); return !!(r && !r.removed_at); };
  // the items with no photo that the prepared invoices bring are added by themselves (the owner's page only: staff do not see the invoices); one he removed stays removed
  async function noteReviews(reviews) {
    const M = media();
    if (!M || !db()) return;
    owner = true;
    try {
      await M.load();
      if (!ready && !(await read())) return;
      const add = autoRows(reviews, rows, stateOf);
      if (!add.length) return;
      const at = new Date().toISOString();
      const { error } = await db().from('ar_photo_wanted').upsert(add.map((x) => ({ ...x, added_at: at, removed_at: null })), { onConflict: 'item_id', ignoreDuplicates: true });
      if (error) return;
      await read(); redraw(); told();
    } catch (e) { /* the list is a help: the invoices are shown without it */ }
  }
  // «مش تمام» on an internet photo in an invoice card = nominate it; the same tap again takes it back
  async function toggle(id, name) {
    const c = db(), r = row(id);
    if (!c || !ready) throw new Error('القايمة لسه مش متاحة');
    const on = !(r && !r.removed_at), at = new Date().toISOString();
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
  async function photo(input) {
    const id = Number(input.dataset.pwPhoto), file = input.files && input.files[0], M = media();
    input.value = '';
    if (!id || !file || !M) return;
    busy[id] = true; redraw(true);
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImg(url), { w, h } = fit(img.naturalWidth, img.naturalHeight, 800);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      await M.upload(id, cv.toDataURL('image/jpeg', 0.85));
      say('الصورة بقت صورة الصنف ✓', 'good');
    } catch (e) { say('الصورة ما اتحفظتش: ' + (e.message || e), 'bad'); }
    finally { URL.revokeObjectURL(url); delete busy[id]; redraw(true); told(); }
  }
  async function remove(id) {
    const r = row(id);
    if (!r || !root.confirm(`تشيل «${r.name}» من قايمة الصور؟`)) return;
    const at = new Date().toISOString();
    const { error } = await db().from('ar_photo_wanted').update({ removed_at: at }).eq('item_id', Number(id));
    if (error) return say('ما اتشالتش: ' + error.message, 'bad');
    r.removed_at = at; redraw(true); told(); say('اتشالت من القايمة ✓', 'good');
  }
  function openWa(phone, text) {
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
  function onClick(e) {
    const g = (a) => e.target.closest('[' + a + ']');
    let el;
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
  function close() { showing = false; clearInterval(timer); timer = null; adding = false; }

  const main = $('pwMain');
  if (main) {
    main.addEventListener('click', onClick);
    main.addEventListener('change', (e) => { if (e.target.matches('[data-pw-photo]')) photo(e.target); });
    main.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.target.id === 'pwPhone' || e.target.id === 'pwName')) { e.preventDefault(); saveNumber(); } });
  }
  root.AskerItemMedia?.onChange?.(() => { if (showing) redraw(false); });
  root.AskerPhotoWant = { open, close, noteReviews, toggle, wanted, can: () => ready, onChange(f) { listeners.push(f); } };
})(typeof window === 'undefined' ? globalThis : window);
