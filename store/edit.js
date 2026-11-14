/* «✏️ عدّل» على صفحة الصنف (صاحب الصيدلية 2026-11-14: «تنزل لي كل الصور … وتعمل لي اوبشن تعديل لما الاقي مشكله فيها»).
   بيظهر لصاحب الصيدلية بس (أو موظف معاه «طلبات الموقع»)، وهو داخل البوت على نفس الموبايل (نفس تسجيل الدخول).
   الصورة: يختار صورة من البدايل اللي لقيناها (store/img/alt.json) أو يصوّر / يرفع من الموبايل؛ الدالة asker-store-img بتحفظها
   عندنا. أو يشيل الصورة (يرجع الكارت الملوّن). البيان: يعدّله أو يخبّيه. كله في ar_store_edits، والسيرفر هو اللي بيمنع غيره. */
(function (root) {
  'use strict';
  const OWNER = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c';
  // a photo from the phone: max 800 px, JPEG, so the upload is small (pure, tested in tests/store-edit.cjs)
  function fitSize(w, h, max) {
    const k = Math.min(1, max / Math.max(w, h || 1));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }
  // the owner's text in the edit box -> {h, u, f, w}; one point per line, empty lines dropped
  function descFromForm(v) {
    const lines = (s) => String(s || '').split(/\r?\n/).map((x) => x.replace(/^[\s•\-–*]+/, '').trim()).filter(Boolean).slice(0, 5).map((x) => x.slice(0, 160));
    const d = { h: String(v.h || '').trim().slice(0, 300), u: lines(v.u), f: lines(v.f), w: lines(v.w) };
    return d.h || d.u.length || d.f.length || d.w.length ? d : null;
  }
  const api = { fitSize, descFromForm };
  root.AskerStoreEditLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  const S = root.AskerStore;
  if (!S || !root.supabase) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // the bot's sign-in is kept in this browser (same site): only then is a second client made, which reads it
  let hasSession = false;
  try { hasSession = Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)); } catch (e) { /* private window */ }
  if (!hasSession) { root.AskerStoreEdit = { onSheet() {} }; return; }
  const ed = root.supabase.createClient(S.SUPABASE_URL, S.SUPABASE_KEY);
  let allowed = false, item = null, alts = null, busy = false, last = ['', false];

  async function check() {
    const { data } = await ed.auth.getSession();
    const u = data && data.session && data.session.user;
    if (!u) return false;
    if (u.id === OWNER) return true;
    const r = await ed.rpc('ar_staff_can', { ps: ['storeorders'] });
    return !r.error && r.data === true;
  }
  async function loadAlts() {
    if (!alts) alts = fetch('store/img/alt.json?v=20261114a').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    return alts;
  }
  function note(t, bad) { last = [t, !!bad]; const n = $('edNote'); if (n) { n.textContent = t; n.className = 'ed-note' + (bad ? ' bad' : ''); } }

  async function save(patch) {
    const row = Object.assign({ item_id: item.id, img: null, img_off: false, descr: null, desc_off: false }, S.edits()[item.id] || {}, patch, { updated_at: new Date().toISOString() });
    const { error } = await ed.from('ar_store_edits').upsert(row, { onConflict: 'item_id' });
    if (error) { note('ما اتحفظش: ' + error.message, true); return false; }
    S.setEdit(item.id, row); return true;
  }
  async function sendPhoto(body) {
    if (busy) return; busy = true; note('بحفظ الصورة…');
    try {
      const { data } = await ed.auth.getSession();
      const tok = data && data.session && data.session.access_token;
      const r = await fetch(S.SUPABASE_URL + '/functions/v1/asker-store-img', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, apikey: S.SUPABASE_KEY },
        body: JSON.stringify(Object.assign({ id: item.id }, body)),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.img) { note(b.message || 'الصورة ما اتحفظتش، جرّب تاني.', true); return; }
      S.setEdit(item.id, Object.assign({ item_id: item.id, descr: null, desc_off: false }, S.edits()[item.id] || {}, { img: b.img, img_off: false }));
      note('اتغيّرت الصورة ✔');
    } catch (e) { note('النت مش مستقر، جرّب تاني.', true); } finally { busy = false; }
  }
  function phoneFile(file) {
    if (!file) return;
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, 800);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      sendPhoto({ data: c.toDataURL('image/jpeg', 0.85) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); note('الملف ده مش صورة.', true); };
    img.src = url;
  }

  async function drawPanel() {
    const box = $('shEdit');
    const e = S.edits()[item.id] || {};
    const list = ((await loadAlts())[item.id] || []);
    const d = await S.descOf(item.id).catch(() => null);
    const cur = S.picSrc(item);
    box.innerHTML = `<h3>صورة الصنف</h3>
      <div class="ed-cands">${cur ? `<span class="ed-c on"><img src="${esc(cur)}" alt=""><b>الحالية</b></span>` : '<span class="ed-c on"><b>من غير صورة</b></span>'}
        ${list.map((u, i) => `<button type="button" class="ed-c" data-alt="${i}"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.hidden=true"><b>بديل ${i + 1}</b></button>`).join('')}</div>
      ${list.length ? '' : '<p class="hint-sm">مالقيناش بدايل للصنف ده.</p>'}
      <label class="ed-btn">📷 صوّر أو ارفع صورة من الموبايل<input type="file" id="edFile" accept="image/*" hidden></label>
      ${cur ? '<button type="button" class="ed-btn red" id="edNoImg">🗑️ شيل الصورة (يرجع الكارت الملوّن)</button>' : ''}
      ${e.img || e.img_off ? '<button type="button" class="ed-btn" id="edImgBack">↩️ رجّع الصورة الأصلية</button>' : ''}
      <h3>البيان</h3>
      <div class="ed-form">
        <label>الجملة التسويقية<textarea id="edH" rows="2">${esc(d ? d.h : '')}</textarea></label>
        <label>بيستخدم في (كل نقطة في سطر)<textarea id="edU" rows="2">${esc(d ? (d.u || []).join('\n') : '')}</textarea></label>
        <label>مميزاته<textarea id="edF" rows="2">${esc(d ? (d.f || []).join('\n') : '')}</textarea></label>
        <label>تنبيهات وأضرار<textarea id="edW" rows="2">${esc(d ? (d.w || []).join('\n') : '')}</textarea></label>
      </div>
      <button type="button" class="ed-btn" id="edSaveDesc">✍️ احفظ البيان</button>
      <button type="button" class="ed-btn ${e.desc_off ? '' : 'red'}" id="edDescOff">${e.desc_off ? '👁️ ورّي البيان تاني' : '🙈 خبّي البيان من الصنف ده'}</button>
      <p id="edNote" class="ed-note" role="status"></p>`;
    box.querySelectorAll('[data-alt]').forEach((b) => b.addEventListener('click', () => sendPhoto({ url: list[Number(b.dataset.alt)] })));
    $('edFile').addEventListener('change', (ev) => phoneFile(ev.target.files && ev.target.files[0]));
    if ($('edNoImg')) $('edNoImg').addEventListener('click', async () => { if (await save({ img_off: true })) note('الصورة اتشالت ✔'); });
    if ($('edImgBack')) $('edImgBack').addEventListener('click', async () => { if (await save({ img: null, img_off: false })) note('رجعت الصورة الأصلية ✔'); });
    $('edSaveDesc').addEventListener('click', async () => {
      const descr = descFromForm({ h: $('edH').value, u: $('edU').value, f: $('edF').value, w: $('edW').value });
      if (await save({ descr, desc_off: false })) note('البيان اتحفظ ✔');
    });
    note(last[0], last[1]);
    $('edDescOff').addEventListener('click', async () => { const off = !(S.edits()[item.id] || {}).desc_off; if (await save({ desc_off: off })) note(off ? 'البيان اتخبّى ✔' : 'البيان رجع ✔'); });
  }

  root.AskerStoreEdit = {
    onSheet(it) {
      const btn = $('shEditBtn'), box = $('shEdit');
      if (!btn || !box) return;
      const same = item && item.id === it.id;
      item = it; btn.hidden = !allowed;
      if (!same) { last = ['', false]; box.hidden = true; box.innerHTML = ''; btn.textContent = '✏️ عدّل'; }
      else if (!box.hidden && !busy) drawPanel();
    },
  };
  check().then((ok) => {
    allowed = ok;
    const btn = $('shEditBtn');
    if (!btn) return;
    btn.hidden = !ok || !item;
    btn.addEventListener('click', () => {
      const box = $('shEdit');
      box.hidden = !box.hidden;
      btn.textContent = box.hidden ? '✏️ عدّل' : '✖ اقفل التعديل';
      if (!box.hidden) drawPanel();
    });
  }).catch(() => {});
})(typeof window !== 'undefined' ? window : globalThis);
