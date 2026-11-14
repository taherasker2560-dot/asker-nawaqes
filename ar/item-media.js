/* صورة الصنف وبيانه جوه البوت (صاحب الصيدلية 2026-11-14: «حمل الصور والبيانات اللي موجوده في الموقع … عشان وانا بتعامل مع
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
  // the description: his own text, nothing if he hid it, else the shard's text
  function descFrom(id, shard, edits) {
    const e = edits && edits[id];
    if (e && e.desc_off) return null;
    if (e && e.descr) return e.descr;
    return shard && shard.i && shard.i[id] != null ? shard.t[shard.i[id]] || null : null;
  }
  const SECTIONS = [['u', 'بيستخدم في', ''], ['f', 'مميزاته', ''], ['w', 'تنبيهات وأضرار', ' warn']];
  function descHtml(d) {
    if (!d || typeof d !== 'object') return '<p class="hint">مفيش بيان للصنف ده لسه. تقدر تكتبه من «✏️ عدّل».</p>';
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
  const api = { photoOf, descFrom, descHtml, thumbHtml, short, SECTIONS, IMG_URL };
  root.AskerItemMediaLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const app = () => root.AskerApp && root.AskerApp.client;
  const editLib = () => root.AskerStoreEditLib || { fitSize: (w, h) => ({ w, h }), descFromForm: (v) => v };
  let pics = {}, edits = {}, alts = null, canEdit = null, ready = null;
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
  async function loadEdits() {
    const c = app(); if (!c) return;
    const { data, error } = await c.from('ar_store_edits').select('item_id,img,img_off,descr,desc_off');
    if (!error && Array.isArray(data)) { edits = {}; for (const r of data) edits[r.item_id] = r; }
  }
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
    const r = await c.rpc('ar_staff_can', { ps: ['storeorders'] });
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
    sheetEl().hidden = false;
    await draw(false);
  }
  function note(t, bad) { last = [t, !!bad]; const n = document.getElementById('imNote'); if (n) { n.textContent = t; n.className = 'im-note' + (bad ? ' bad' : ''); } }
  async function draw(editing) {
    if (!cur) return;
    await load();
    const id = cur.id, src = photoOf(id, pics, edits), d = descFrom(id, await shard(id), edits);
    const ok = await allowed();
    const body = document.getElementById('imBody');
    body.innerHTML = `<div class="im-big">${src ? `<img src="${esc(src)}" alt="">` : `<span dir="ltr" translate="no">${esc(short(cur.en))}</span>`}</div>
      <h3 class="im-title">${esc(cur.title)}</h3>${cur.en && cur.en !== cur.title ? `<div class="hint" dir="ltr" translate="no">${esc(cur.en)}</div>` : ''}
      <div class="im-desc">${descHtml(d)}</div>
      ${ok ? `<button type="button" class="im-edit-btn" id="imEditBtn">${editing ? '✖ اقفل التعديل' : '✏️ عدّل الصورة أو البيان'}</button><div id="imEdit"${editing ? '' : ' hidden'}></div>` : ''}`;
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
      <h4>البيان</h4>
      <label class="im-l">الجملة التسويقية<textarea id="imH" rows="2">${esc(d ? d.h : '')}</textarea></label>
      <label class="im-l">بيستخدم في (كل نقطة في سطر)<textarea id="imU" rows="2">${esc(d ? (d.u || []).join('\n') : '')}</textarea></label>
      <label class="im-l">مميزاته<textarea id="imF" rows="2">${esc(d ? (d.f || []).join('\n') : '')}</textarea></label>
      <label class="im-l">تنبيهات وأضرار<textarea id="imW" rows="2">${esc(d ? (d.w || []).join('\n') : '')}</textarea></label>
      <button type="button" class="im-btn" id="imSaveDesc">✍️ احفظ البيان</button>
      <button type="button" class="im-btn ${e.desc_off ? '' : 'red'}" id="imDescOff">${e.desc_off ? '👁️ ورّي البيان تاني' : '🙈 خبّي البيان من الصنف ده'}</button>
      <p id="imNote" class="im-note" role="status"></p>`;
    note(last[0], last[1]);
    box.querySelectorAll('[data-alt]').forEach((b) => b.addEventListener('click', () => sendPhoto({ url: list[Number(b.dataset.alt)] })));
    document.getElementById('imFile').addEventListener('change', (ev) => phoneFile(ev.target.files && ev.target.files[0]));
    const on = (bid, f) => { const b = document.getElementById(bid); if (b) b.addEventListener('click', f); };
    on('imNoImg', async () => { if (await save({ img_off: true })) note('الصورة اتشالت ✔'); });
    on('imImgBack', async () => { if (await save({ img: null, img_off: false })) note('رجعت الصورة الأصلية ✔'); });
    on('imSaveDesc', async () => {
      const descr = editLib().descFromForm({ h: val('imH'), u: val('imU'), f: val('imF'), w: val('imW') });
      if (await save({ descr, desc_off: false })) note('البيان اتحفظ ✔');
    });
    on('imDescOff', async () => { const off = !(edits[id] || {}).desc_off; if (await save({ desc_off: off })) note(off ? 'البيان اتخبّى ✔' : 'البيان رجع ✔'); });
  }
  const val = (id) => (document.getElementById(id) || {}).value || '';
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
      edits[cur.id] = Object.assign({ item_id: Number(cur.id), descr: null, desc_off: false }, edits[cur.id] || {}, { img: b.img, img_off: false });
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
    // a card's small photo; title / en are what the sheet shows on top
    thumb(id, en, title) {
      load();
      return thumbHtml(id, en, pics, edits).replace('<button ', `<button data-im-title="${esc(title || en || '')}" data-im-en="${esc(en || '')}" `);
    },
    onChange(f) { listeners.push(f); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
