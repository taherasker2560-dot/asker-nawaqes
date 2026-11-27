/* صورة الصنف وبيانه جوه السيستم (صاحب الصيدلية 2026-11-14: «حمل الصور والبيانات اللي موجوده في الموقع … عشان وانا بتعامل مع
   الصنف ابقى شايف صورته» + «هتعمل لي برضو اوبشن التعديل من هنا»).
   نفس صور الموقع ونفس البيان، من غير نسخ: store/img/index.json + store/desc/<id % 20>.json + تعديلاته (ar_store_edits).
   صورة صغيرة جنب الصنف في البحث اللي فوق وفي «المخزون»؛ لما يدوس عليها: الصورة كبيرة والبيان، و«✏️ عدّل» (نفس اللي في الموقع:
   بديل من اللي لقيناه / صورة من الموبايل عن طريق الدالة asker-store-img / شيل الصورة / عدّل أو خبّي البيان). */
(function (root) {
  'use strict';
  const OWNER = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c';
  const DESC_SHARDS = 20, DESC_VER = '20261114a';
  const IMG_URL = 'https://qwrzdjdgvanmhaicncuk.supabase.co/storage/v1/object/public/ar-store-img/';
  const FN_URL = 'https://qwrzdjdgvanmhaicncuk.supabase.co/functions/v1/asker-store-img';
  const KEY = 'sb_publishable_af0XfsvB0Fwwo3HORqMN2g_iJNd9o0q';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- pure helpers (tests/item-media.cjs) ----------
  // which photo: the owner's fix first (none / his photo), then the site's photo
  function photoOf(id, pics, edits) {
    const e = edits && edits[id];
    if (e && e.img_off) return null;
    if (e && e.img) return IMG_URL + e.img;
    return pics && pics[id] ? 'store/img/' + pics[id] : null;
  }
  // is the item's photo good (owner 2026-11-27, «تطلبها في مراجعة المشتريات»)? 'none' = no photo; 'net' = a photo nobody of ours chose (the site's own list or the night search);
  // 'ok' = a person took or picked it (the photo function writes updated_by), said «تمام» (photo_ok_at), or removed it on purpose. Only 'none' and 'net' are asked for.
  function photoState(id, pics, edits) {
    const e = edits && edits[id];
    if (e && (e.img_off || (e.img && e.updated_by) || e.photo_ok_at)) return 'ok';
    return photoOf(id, pics, edits) ? 'net' : 'none';
  }
  // the description: his own text, nothing if he hid it, else the shard's text
  function descFrom(id, shard, edits) {
    const e = edits && edits[id];
    if (e && e.desc_off) return null;
    if (e && e.descr) return e.descr;
    return shard && shard.i && shard.i[id] != null ? shard.t[shard.i[id]] || null : null;
  }
  // the active ingredient (owner 2026-11-21): written in Arabic and/or English; the page's language first, the other one when only that is written
  function activeOf(id, edits, lang) {
    const e = edits && edits[id];
    if (!e) return '';
    const ar = String(e.active_ar || '').trim(), en = String(e.active_en || '').trim();
    return lang === 'en' ? en || ar : ar || en;
  }
  const SECTIONS = [['u', 'بيستخدم في', ''], ['f', 'مميزاته', ''], ['w', 'تنبيهات وأضرار', ' warn']];
  function descHtml(d) {
    if (!d || typeof d !== 'object') return '<p class="hint">مفيش بيان للصنف ده لسه. تقدر تكتبه من «✏️ تعديل الصنف».</p>';
    const list = (a) => (Array.isArray(a) ? a.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5) : []);
    const parts = SECTIONS.map(([k, t, c]) => { const l = list(d[k]); return l.length ? `<div class="im-sec${c}"><h4>${t}</h4><ul>${l.map((x) => `<li translate="no">${esc(x)}</li>`).join('')}</ul></div>` : ''; }).join('');
    const h = String(d.h || '').trim();
    return (h ? `<p class="im-hook" translate="no">${esc(h)}</p>` : '') + parts;
  }
  // the first letters of the English name for the coloured square (no photo)
  const short = (en) => String(en || '').toUpperCase().split(/\s+/).filter((w) => w && !/\d/.test(w)).slice(0, 2).join(' ').slice(0, 14);
  function thumbHtml(id, en, pics, edits) {
    if (id == null) return '';
    const src = photoOf(id, pics, edits);
    return `<button type="button" class="im-th${src ? '' : ' im-none'}" data-im="${esc(id)}" aria-label="صورة الصنف وبيانه">`
      + (src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<span dir="ltr" translate="no">${esc(short(en))}</span>`) + '</button>';
  }
  const api = { photoOf, photoState, descFrom, descHtml, thumbHtml, short, activeOf, SECTIONS, IMG_URL };
  root.AskerItemMediaLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const app = () => root.AskerApp && root.AskerApp.client;
  const editLib = () => root.AskerStoreEditLib || { fitSize: (w, h) => ({ w, h }), descFromForm: (v) => v };
  let pics = {}, edits = {}, alts = null, canEdit = null, ready = null, canConfirm = false, loaded = false;
  const shards = {};
  const listeners = [];
  // the small photos already on screen follow (the photo list came, or he fixed one)
  function changed() {
    document.querySelectorAll('button[data-im]').forEach((b) => {
      const src = photoOf(b.dataset.im, pics, edits), img = b.querySelector('img');
      if (src && img && img.getAttribute('src') === src) return;
      b.classList.toggle('im-none', !src);
      b.innerHTML = src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<span dir="ltr" translate="no">${esc(short(b.dataset.imEn))}</span>`;
    });
    for (const f of listeners) try { f(); } catch (e) { /* a card list that is not on screen */ }
  }
  function load() {
    if (ready) return ready;
    ready = Promise.all([
      fetch('store/img/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((j) => { pics = j || {}; }).catch(() => {}),
      loadEdits(),
    ]).then(changed);
    return ready;
  }
  // every row: the server hands out 1,000 at most per read, and each «تمام» adds one, so they are read page by page
  const PAGE = 1000, MAX_PAGES = 40;
  async function readEdits(cols) {
    const c = app(), rows = [];
    for (let i = 0; i < MAX_PAGES; i++) {
      const { data, error } = await c.from('ar_store_edits').select(cols).order('item_id').range(i * PAGE, i * PAGE + PAGE - 1);
      if (error) return { data: null, error };
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return { data: rows, error: null };
  }
  async function loadEdits() {
    if (!app()) return;
    // active_ar / active_en came with migration 202611210200, photo_ok_at with 202611271200: before one, the older columns only
    let { data, error } = await readEdits('item_id,img,img_off,descr,desc_off,active_ar,active_en,updated_by,photo_ok_at');
    canConfirm = !error;
    if (error) ({ data, error } = await readEdits('item_id,img,img_off,descr,desc_off,active_ar,active_en,updated_by'));
    if (error) ({ data, error } = await readEdits('item_id,img,img_off,descr,desc_off'));
    if (!error && Array.isArray(data)) { edits = {}; for (const r of data) edits[r.item_id] = r; loaded = true; }
  }
  const lang = () => { try { return localStorage.getItem('asker-lang') === 'en' ? 'en' : 'ar'; } catch (e) { return 'ar'; } };
  function shard(id) {
    const n = Number(id) % DESC_SHARDS;
    if (!shards[n]) shards[n] = fetch(`store/desc/${n}.json?v=${DESC_VER}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return shards[n];
  }
  async function allowed() {
    if (canEdit !== null) return canEdit;
    const c = app(); if (!c) return (canEdit = false);
    const { data } = await c.auth.getSession();
    const u = data && data.session && data.session.user;
    if (!u) return (canEdit = false);
    if (u.id === OWNER) return (canEdit = true);
    // any ACTIVE staff member the owner made may edit an item from its sheet (owner 2026-11-21: «افتح لهم عادي»; migration 202611211500)
    const r = await c.rpc('ar_is_staff');
    return (canEdit = !r.error && r.data === true);
  }

  // ---------- the sheet ----------
  let cur = null, last = ['', false], busy = false;
  function sheetEl() {
    let el = document.getElementById('imSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'imSheet'; el.className = 'im-sheet'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="im-bg" data-im-close></div><div class="im-card"><button type="button" class="im-x" data-im-close aria-label="اقفل">×</button><div id="imBody"></div></div>';
    el.addEventListener('click', (e) => { if (e.target.closest('[data-im-close]')) close(); });
    document.body.appendChild(el);
    return el;
  }
  function close() { const el = document.getElementById('imSheet'); if (el) el.hidden = true; cur = null; }
  async function open(id, title, en) {
    cur = { id: String(id), title: title || en || '', en: en || '' };
    last = ['', false];
    readState = null; pollGen++; // a photo reading belongs to the item it was asked for; the latest one is looked up when the edit panel opens
    sheetEl().hidden = false;
    await draw(false);
  }
  function note(t, bad) { last = [t, !!bad]; const n = document.getElementById('imNote'); if (n) { n.textContent = t; n.className = 'im-note' + (bad ? ' bad' : ''); } }
  async function draw(editing) {
    if (!cur) return;
    await load();
    const id = cur.id, src = photoOf(id, pics, edits), d = descFrom(id, await shard(id), edits), act = activeOf(id, edits, lang());
    const ok = await allowed();
    const body = document.getElementById('imBody');
    body.innerHTML = `<div class="im-big">${src ? `<img src="${esc(src)}" alt="">` : `<span dir="ltr" translate="no">${esc(short(cur.en))}</span>`}</div>
      <h3 class="im-title">${esc(cur.title)}</h3>${cur.en && cur.en !== cur.title ? `<div class="hint" dir="ltr" translate="no">${esc(cur.en)}</div>` : ''}
      ${act ? `<div class="im-act"><b>💊 المادة الفعالة:</b> <span translate="no">${esc(act)}</span></div>` : ''}
      <div class="im-desc">${descHtml(d)}</div>
      ${ok ? `<button type="button" class="im-edit-btn" id="imEditBtn">${editing ? '✖ اقفل التعديل' : '✏️ تعديل الصنف'}</button><div id="imEdit"${editing ? '' : ' hidden'}></div>` : ''}`;
    if (!ok) return;
    document.getElementById('imEditBtn').addEventListener('click', () => draw(!editing));
    if (editing) await drawPanel(d, src);
  }
  async function drawPanel(d, src) {
    const id = cur.id, e = edits[id] || {};
    if (!alts) alts = fetch('store/img/alt.json?v=20261114a').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const list = (await alts)[id] || [];
    const box = document.getElementById('imEdit');
    box.innerHTML = `<h4>صورة الصنف</h4>
      <div class="im-cands">${list.map((u, i) => `<button type="button" class="im-c" data-alt="${i}"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.hidden=true"><b>بديل ${i + 1}</b></button>`).join('')}</div>
      ${list.length ? '' : '<p class="hint">مالقيناش بدايل للصنف ده.</p>'}
      <label class="im-btn">📷 صوّر أو ارفع صورة من الموبايل<input type="file" id="imFile" accept="image/*" hidden></label>
      ${src ? '<button type="button" class="im-btn red" id="imNoImg">🗑️ شيل الصورة</button>' : ''}
      ${e.img || e.img_off ? '<button type="button" class="im-btn" id="imImgBack">↩️ رجّع الصورة الأصلية</button>' : ''}
      <h4>الاسم</h4>
      <label class="im-l">الاسم العربي<input id="imName" class="im-in" type="text" maxlength="250" dir="rtl" value="${esc(arName0())}" placeholder="اكتب الاسم الصح بالعربي"></label>
      <label class="im-l">الاسم في فارما فلاي (للقراية بس)<input class="im-in ro" type="text" dir="ltr" translate="no" value="${esc(cur.en)}" readonly></label>
      <h4>💊 المادة الفعالة</h4>
      <div class="im-two">
        <label class="im-l">المادة الفعالة بالعربي<input id="imActAr" class="im-in" type="text" maxlength="200" dir="rtl" value="${esc(e.active_ar || '')}"></label>
        <label class="im-l">المادة الفعالة بالإنجليزي<input id="imActEn" class="im-in" type="text" maxlength="200" dir="ltr" value="${esc(e.active_en || '')}"></label>
      </div>
      <p class="hint">اللي تكتبه بلغة واحدة بس بيتعرض زي ما هو في اللغتين.</p>
      <label class="im-btn">📷 صوّر المادة الفعالة من العلبة<input type="file" id="imActFile" accept="image/*" capture="environment" hidden></label>
      <div id="imRead"></div>
      <h4>البيان</h4>
      <label class="im-l">الجملة التسويقية<textarea id="imH" rows="2">${esc(d ? d.h : '')}</textarea></label>
      <label class="im-l">بيستخدم في (كل نقطة في سطر)<textarea id="imU" rows="2">${esc(d ? (d.u || []).join('\n') : '')}</textarea></label>
      <label class="im-l">مميزاته<textarea id="imF" rows="2">${esc(d ? (d.f || []).join('\n') : '')}</textarea></label>
      <label class="im-l">تنبيهات وأضرار<textarea id="imW" rows="2">${esc(d ? (d.w || []).join('\n') : '')}</textarea></label>
      <button type="button" class="im-btn ${e.desc_off ? '' : 'red'}" id="imDescOff">${e.desc_off ? '👁️ ورّي البيان تاني' : '🙈 خبّي البيان من الصنف ده'}</button>
      <button type="button" class="im-btn main" id="imSaveAll">✍️ احفظ</button>
      <p id="imNote" class="im-note" role="status"></p>`;
    // what the fields held when they were drawn: only what changed is written (an untouched description is never copied into his own text)
    descInit = JSON.stringify(descForm());
    note(last[0], last[1]);
    box.querySelectorAll('[data-alt]').forEach((b) => b.addEventListener('click', () => sendPhoto({ url: list[Number(b.dataset.alt)] })));
    document.getElementById('imFile').addEventListener('change', (ev) => phoneFile(ev.target.files && ev.target.files[0]));
    document.getElementById('imActFile').addEventListener('change', (ev) => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (f) askRead(f); });
    if (readState && readState.item === id) renderRead(); else loadLatestRead();
    const on = (bid, f) => { const b = document.getElementById(bid); if (b) b.addEventListener('click', f); };
    on('imNoImg', async () => { if (await save({ img_off: true })) note('الصورة اتشالت ✔'); });
    on('imImgBack', async () => { if (await save({ img: null, img_off: false })) note('رجعت الصورة الأصلية ✔'); });
    on('imSaveAll', saveAll);
    on('imDescOff', async () => { const off = !(edits[id] || {}).desc_off; if (await save({ desc_off: off })) note(off ? 'البيان اتخبّى ✔' : 'البيان رجع ✔'); });
  }
  const val = (id) => (document.getElementById(id) || {}).value || '';
  let descInit = '';
  const descForm = () => ({ h: val('imH'), u: val('imU'), f: val('imF'), w: val('imW') });
  // the Arabic name the sheet was opened with (the title is the English name when no Arabic name is written yet)
  const arName0 = () => (cur && cur.title && cur.title !== cur.en ? cur.title : '');
  // the Arabic name: the same two writes the search card's pen makes (ar_store_owner_set_arabic: the owner's name wins in the store and the stock, and the nightly sync
  // never takes it back; ar_names «approved»: the shortages and the reading of the warehouses' messages); an empty name = back to the automatic one
  async function saveName(id, en, value) {
    const c = app();
    const { data, error } = await c.rpc('ar_store_owner_set_arabic', { p_id: Number(id), p_arabic: value });
    if (error) throw error;
    if (!data || !data.ok) throw new Error(data && data.error === 'too_short' ? 'الاسم قصير قوي' : 'الصنف مش موجود في السيستم');
    const L = root.AskerApp && root.AskerApp.lookup ? root.AskerApp.lookup() : null;
    if (value && en && L) {
      const row = { name_key: L.nk(en), english_name: en, arabic_name: value, status: 'approved', updated_at: new Date().toISOString() };
      const r = await c.from('ar_names').upsert(row, { onConflict: 'name_key' });
      if (r.error) throw r.error;
      if (root.AskerApp.setName) root.AskerApp.setName(row);
    }
    const shown = data.arabic_name || '';
    cur.title = shown || cur.en;
    root.dispatchEvent(new CustomEvent('asker-item-name', { detail: { id: Number(id), ar: shown } })); // the card on screen follows
    return shown;
  }
  // one «احفظ» for the name, the active ingredient and the description; only what changed is written (the photo buttons save at once)
  async function saveAll() {
    if (busy || !cur) return;
    const id = cur.id, e = edits[id] || {};
    const name = val('imName').replace(/\s+/g, ' ').trim(), aAr = val('imActAr').trim(), aEn = val('imActEn').trim(), form = descForm();
    const nameChanged = name !== arName0(), activeChanged = aAr !== (e.active_ar || '') || aEn !== (e.active_en || ''), descChanged = JSON.stringify(form) !== descInit;
    if (name && name.length < 2) return note('الاسم قصير قوي', true);
    if (!nameChanged && !activeChanged && !descChanged) return note('مفيش تغيير');
    busy = true; note('بيحفظ…');
    // a photo reading he is checking counts as used once he saves the active ingredient (set before the save: the panel is drawn again inside it and must not fill the fields from the reading again)
    const usesRead = activeChanged && readState && readState.item === id && readState.status === 'done' && !readState.applied;
    if (usesRead) readState.applied = true;
    try {
      if (nameChanged) await saveName(id, cur.en, name);
      const patch = {};
      if (activeChanged) { patch.active_ar = aAr || null; patch.active_en = aEn || null; }
      if (descChanged) { patch.descr = editLib().descFromForm(form); patch.desc_off = false; }
      busy = false;
      if (Object.keys(patch).length) { if (!(await save(patch))) { if (usesRead) readState.applied = false; return; } } else await draw(true);
      if (usesRead) markRead(readState.row, 'applied');
      note('اتحفظ ✔');
    } catch (err) { if (usesRead) readState.applied = false; note('ماتحفظش: ' + ((err && err.message) || err), true); } finally { busy = false; }
  }
  // ---------- the active ingredient by photo (owner 2026-11-21, ar_item_reads + Hub\reader\ITEM_ACTIVE_READER.ps1) ----------
  // the box photo goes to the server as a request; the laptop's Claude reads what is PRINTED (English and Arabic, translated both ways) and answers; the two fields are filled and he checks and saves
  let readState = null, pollGen = 0;
  const pollMs = () => Number(root.__imPollMs) || 3000, lateMs = () => Number(root.__imLateMs) || 90000;
  const PRINTED = { en: 'مكتوب بالإنجليزي على العلبة', ar: 'مكتوب بالعربي على العلبة', both: 'مكتوب بالعربي والإنجليزي على العلبة' };
  function renderRead() {
    const box = document.getElementById('imRead'), rs = readState;
    if (!box) return;
    if (!rs || rs.item !== (cur && cur.id) || rs.applied) { box.innerHTML = ''; return; }
    const r = rs.result || {}, sm = (t) => `<small>${t}</small>`;
    if (rs.status === 'sending') box.innerHTML = '<div class="im-read"><span class="im-spin"></span><div><b>بيبعت الصورة…</b></div></div>';
    else if (rs.status === 'pending' || rs.status === 'reading') box.innerHTML = `<div class="im-read"><span class="im-spin"></span><div><b>بيتقرا…</b>${sm('اللاب بيقرا الصورة ويترجمها (حوالي نص دقيقة). تقدر تقفل الشاشة، والنتيجة هتلاقيها هنا لما تفتح الصنف تاني.')}${rs.late ? sm('اللاب يمكن مش شغال دلوقتي: الطلب مستني وهيتقري أول ما يرجع.') : ''}</div></div>`;
    else if (rs.status === 'done' && r.found && (r.ar || r.en)) {
      box.innerHTML = `<div class="im-read ok"><div><b>اتقرا من الصورة</b> <span class="im-tag">${PRINTED[r.printed] || ''}</span>${sm('راجعه وصحّحه لو فيه غلط، وبعدين اضغط «احفظ». لحد ما تحفظ مفيش حاجة اتغيّرت.')}${r.confidence && r.confidence !== 'high' ? sm('مش متأكد 100%: راجع الحروف والأرقام كويس.') : ''}${r.note ? `<small translate="no">${esc(r.note)}</small>` : ''}</div></div>`;
      for (const [fid, v] of [['imActAr', r.ar], ['imActEn', r.en]]) { const f = document.getElementById(fid); if (f && v) { f.value = String(v).slice(0, 200); f.classList.add('im-fresh'); } }
    } else if (rs.status === 'done') box.innerHTML = `<div class="im-read bad"><div><b>مقدرتش أقرا المادة الفعالة من الصورة</b>${sm('مش مكتوبة في الجنب ده أو الصورة مش واضحة. صوّر الجنب التاني أو قرّب. السيستم بيقرا المكتوب بس، مش بيخمّن من اسم الدوا.')}${r.note ? `<small translate="no">${esc(r.note)}</small>` : ''}</div></div>`;
    else box.innerHTML = `<div class="im-read bad"><div><b>القراية فشلت</b>${sm('جرّب تصوّر تاني.')}${rs.error ? `<small translate="no">${esc(rs.error)}</small>` : ''}</div></div>`;
  }
  async function askRead(file) {
    if (!cur || !file) return;
    const id = cur.id, en = cur.en;
    readState = { row: null, item: id, status: 'sending' }; pollGen++; renderRead();
    const fail = (msg) => { if (cur && cur.id === id) { readState = { row: null, item: id, status: 'failed', error: msg }; renderRead(); } };
    const img = new Image(), url = URL.createObjectURL(file);
    img.onerror = () => { URL.revokeObjectURL(url); fail('الملف ده مش صورة.'); };
    img.onload = async () => {
      URL.revokeObjectURL(url);
      try {
        const { w, h } = editLib().fitSize(img.naturalWidth, img.naturalHeight, 1300);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        const b64 = cv.toDataURL('image/jpeg', 0.82).split(',')[1];
        const { data, error } = await app().from('ar_item_reads').insert({ item_id: Number(id), item_name: en || null, img_b64: b64 }).select('id');
        if (error) throw error;
        if (!cur || cur.id !== id) return;
        readState = { row: data && data[0] && data[0].id, item: id, status: 'pending' }; renderRead(); pollRead();
      } catch (e) { fail('ما اتبعتتش: ' + ((e && e.message) || e)); }
    };
    img.src = url;
  }
  // asks the server every few seconds until the laptop has answered (it reads once a minute: about half a minute); after 90 s it says the laptop may be off, after 10 minutes it stops
  function pollRead() {
    const gen = ++pollGen, rs = readState, t0 = Date.now();
    if (!rs || rs.row == null) return;
    const tick = async () => {
      if (gen !== pollGen || readState !== rs || !cur || cur.id !== rs.item) return;
      let r = null;
      try { const q = await app().from('ar_item_reads').select('id,status,result,error').eq('id', rs.row).limit(1); r = q.data && q.data[0]; } catch (e) { r = null; }
      if (gen !== pollGen || readState !== rs) return;
      if (r && r.status !== rs.status) { rs.status = r.status; rs.result = r.result; rs.error = r.error; renderRead(); }
      if (r && r.status !== 'pending' && r.status !== 'reading') return;
      if (Date.now() - t0 > lateMs() && !rs.late) { rs.late = true; renderRead(); }
      if (Date.now() - t0 > 10 * 60 * 1000) return;
      setTimeout(tick, pollMs());
    };
    setTimeout(tick, pollMs());
  }
  // the latest reading asked for this item in the last 24 hours (he may have closed the sheet and come back): still waiting = keep waiting, answered and not saved yet = show it
  async function loadLatestRead() {
    const id = cur && cur.id;
    if (!id) return;
    try {
      const { data, error } = await app().from('ar_item_reads').select('id,status,result,error,created_at').eq('item_id', Number(id)).order('created_at', { ascending: false }).limit(1);
      const r = !error && data && data[0];
      if (!r || !cur || cur.id !== id || readState) return;
      if (r.status === 'applied' || r.status === 'cancelled' || Date.now() - Date.parse(r.created_at) > 24 * 3600 * 1000) return;
      readState = { row: r.id, item: id, status: r.status, result: r.result, error: r.error };
      renderRead();
      if (r.status === 'pending' || r.status === 'reading') pollRead();
    } catch (e) { /* the table is not there yet (before its migration), or no right to read it: no reading to show */ }
  }
  function markRead(row, status) { if (row == null) return; try { Promise.resolve(app().from('ar_item_reads').update({ status }).eq('id', row)).catch(() => {}); } catch (e) { /* best effort */ } }
  async function save(patch) {
    const id = cur.id;
    const row = Object.assign({ item_id: Number(id), img: null, img_off: false, descr: null, desc_off: false }, edits[id] || {}, patch, { updated_at: new Date().toISOString() });
    const { error } = await app().from('ar_store_edits').upsert(row, { onConflict: 'item_id' });
    if (error) { note('ما اتحفظش: ' + error.message, true); return false; }
    edits[id] = row; changed(); await draw(true); return true;
  }
  async function sendPhoto(body) {
    if (busy) return; busy = true; note('بحفظ الصورة…');
    try {
      const c = app(), { data } = await c.auth.getSession();
      const tok = data && data.session && data.session.access_token;
      const r = await fetch(FN_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, apikey: KEY },
        body: JSON.stringify(Object.assign({ id: Number(cur.id) }, body)),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.img) { note(b.message || 'الصورة ما اتحفظتش، جرّب تاني.', true); return; }
      edits[cur.id] = Object.assign({ item_id: Number(cur.id), descr: null, desc_off: false }, edits[cur.id] || {}, { img: b.img, img_off: false, updated_by: data && data.session && data.session.user && data.session.user.id });
      last = ['اتغيّرت الصورة ✔', false]; changed(); busy = false; await draw(true);
    } catch (e) { note('النت مش مستقر، جرّب تاني.', true); } finally { busy = false; }
  }
  function phoneFile(file) {
    if (!file) return;
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const { w, h } = editLib().fitSize(img.naturalWidth, img.naturalHeight, 800);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url); sendPhoto({ data: cv.toDataURL('image/jpeg', 0.85) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); note('الملف ده مش صورة.', true); };
    img.src = url;
  }

  // a tap on any small photo opens it (cards are drawn again and again: one listener on the page)
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-im]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    open(b.dataset.im, b.dataset.imTitle || '', b.dataset.imEn || '');
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  root.AskerItemMedia = {
    load, open,
    // the fixes read again (a photo a staff member took on his own phone since this page opened: «صور مطلوبة»)
    reload: () => loadEdits().then(changed),
    // set an item's photo from a picture the page already has (a data: URL), through the same function as the sheet's phone photo (owner / staff session).
    // Used by «مراجعة الفواتير»: a new item's box photo becomes its photo once its PharmaFly card exists (owner 2026-11-22). Throws with the function's message on a refusal.
    async upload(id, data) {
      const c = app(), { data: s } = await c.auth.getSession();
      const tok = s && s.session && s.session.access_token;
      const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, apikey: KEY }, body: JSON.stringify({ id: Number(id), data }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.img) throw new Error(b.message || 'الصورة ما اتحفظتش');
      edits[id] = Object.assign({ item_id: Number(id), descr: null, desc_off: false }, edits[id] || {}, { img: b.img, img_off: false, updated_by: s && s.session && s.session.user && s.session.user.id });
      changed();
      return b.img;
    },
    // «صور الأصناف» in «مراجعة الفواتير»: the state of an item's photo (null until the photo list and the fixes are read), the photo to show, and whether «تمام» can be kept (migration 202611271000)
    photoState(id) { load(); return loaded ? photoState(id, pics, edits) : null; },
    photoSrc(id) { return photoOf(id, pics, edits); },
    canConfirm: () => canConfirm,
    // «✓ تمام»: these photos are right, never ask about them again (only photo_ok_at is written: the photo, the words and who chose them stay as they are)
    async confirm(ids) {
      const at = new Date().toISOString(), rows = ids.map((id) => ({ item_id: Number(id), photo_ok_at: at }));
      if (!rows.length) return;
      const { error } = await app().from('ar_store_edits').upsert(rows, { onConflict: 'item_id' });
      if (error) throw new Error(error.message || String(error));
      for (const id of ids) edits[id] = Object.assign({ item_id: Number(id), img: null, img_off: false, descr: null, desc_off: false }, edits[id] || {}, { photo_ok_at: at });
      changed();
    },
    // a card's small photo; title / en are what the sheet shows on top
    thumb(id, en, title) {
      load();
      return thumbHtml(id, en, pics, edits).replace('<button ', `<button data-im-title="${esc(title || en || '')}" data-im-en="${esc(en || '')}" `);
    },
    // the active ingredient to show under an item's name in a list (his text, in the page's language); '' until the edits are read (onChange then redraws the list)
    active(id) { load(); return id == null ? '' : activeOf(id, edits, lang()); },
    onChange(f) { listeners.push(f); },
    // ---- the other lists (owner 2026-11-21: «اي قايمة فيها اسم الصنف بتتعرض جوة السيستم يكون معروض فيها الصورة، ادوس عليها تفتح تعديل الاسم والصورة والمادة الفعالة») ----
    // a list row with the item's small photo on its side; `inner` is the row's own html. No id (an item not in PharmaFly yet, or a name that matches no item) = the row as it was
    row(id, en, title, inner) {
      if (id == null || id === '') return inner;
      return `<div class="im-lrow">${root.AskerItemMedia.thumb(id, en, title)}<div class="im-lmain">${inner}</div></div>`;
    },
    // the id of the item that has exactly this PharmaFly name (the system's items home.js read); null until they are read, or when no item has that name
    idOf(name) { const H = root.AskerHome; return H && H.idOf && name ? H.idOf(name) : null; },
    // rows that carry only the PharmaFly NAME (the shortages): the id is looked up by that name
    rowByName(name, title, inner) { const id = root.AskerItemMedia.idOf(name); return root.AskerItemMedia.row(id, name, title || name, inner); },
    // the system's items arrived (home.js): the lists that looked ids up by name draw again
    refresh() { changed(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
