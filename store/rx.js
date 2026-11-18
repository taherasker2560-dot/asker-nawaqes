/* «📋 ابعت الروشتة» on the customer's account (owner 2026-11-18: «المفروض تضيف للعميل مكان مخصص اللي هو يبعت الروشتة، يبعتها على الصفحة برضه عشان القراءة الأوتوماتيك … وبعدين نبقى نخليها على الواتس
   لما نعمل الواتس اللي هو المدفوع ده. بس حاليا اعملها تتبعت على الصفحة»).
   A page of its own (the same look as the regular-items and alarm pages): photos (camera or gallery, 4 at most, a PDF too), his number, an optional note, one big button. It goes as an ORDER with
   no items and the photos (the same upload and the same server function as the cart's prescription panel, store/store.js sendRx), so it reaches «طلبات الموقع» in the system with the photos, and the
   customer finds it in «طلباتي» as «طلب بالروشتة». Reading it automatically is the pharmacy's side; sending it by WhatsApp comes with the paid WhatsApp.
   Never on the pharmacy's own phone (the owner's look at a customer's page): nothing could be sent from there by mistake. Loaded before store/account.js, which draws the tile. */
(function (root) {
  'use strict';
  const TEXTS = {
    tile: '📋 ابعت الروشتة',
    tileHint: 'صوّرها واحنا نقراها ونكلمك بالأسعار',
    title: 'ابعت الروشتة',
    back: 'رجوع',
    hint: 'صوّر الروشتة أو اختار صورتها، وإحنا نقراها ونكلمك بالأسعار على واتساب. تقدر تبعت لحد 4 صور.',
    pick: '📷 صوّر الروشتة أو اختار صورتها',
    pickMore: '＋ زوّد صورة تانية',
    remove: 'شيل الصورة',
    phone: 'رقم الموبايل (واتساب)',
    note: 'ملاحظات (اختياري)',
    notePh: 'مثلًا: عايز البديل الأرخص',
    send: '📤 ابعت الروشتة',
    sending: 'بيرفع الصور ويبعت…',
    needPhoto: 'ضيف صورة الروشتة الأول.',
    big: 'الملف أكبر من 8 ميجا. صوّره تاني.',
    doneTitle: 'وصلتنا الروشتة ✓',
    doneNo: 'طلب رقم {n}',
    doneMore: 'هنقراها ونكلمك بالأسعار على واتساب. هتلاقيها في «طلباتي» كمان.',
    ok: 'تمام',
    another: 'ابعت روشتة تانية',
  };
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m));
  // the pure part: what to do with a picked list of files (at most 4; a PDF over 8 MB is refused, a big photo is shrunk later by the uploader)
  function addFiles(list, picked, max, maxBytes) {
    const out = list.slice(), refused = [];
    for (const f of picked) {
      if (out.length >= max) break;
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
      if (isPdf && f.size > maxBytes) { refused.push(f); continue; }
      out.push(f);
    }
    return { files: out, refused };
  }
  const api = { TEXTS, fill, addFiles };
  root.AskerStoreRxLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pharmacy = (() => { try { return Object.keys(localStorage).some((k) => /^sb-[a-z0-9]+-auth-token$/.test(k)); } catch (e) { return false; } })();
  const st = { view: false, files: [], urls: [], phone: '', note: '', busy: false, error: '', done: null };
  const store = () => root.AskerStore || null;
  const acct = () => root.AskerStoreAccount || null;
  const lib = () => root.AskerStoreLib || null;
  const MAX = () => (store() && store().MAX_RX) || 4;
  const MAXB = () => (store() && store().MAX_RX_BYTES) || 8 * 1024 * 1024;

  const tileHtml = () => (pharmacy ? '' : `<button type="button" class="ac-reg-btn ac-rx-tile" data-rxs-open><b>${esc(TEXTS.tile)}</b><small>${esc(TEXTS.tileHint)}</small></button>`);
  // his saved number: the account's own (the owner of the account), else the one typed on this phone before
  function savedPhone() {
    let p = '';
    try { p = (acct() && acct().phone && acct().phone()) || ''; } catch (e) { p = ''; }
    if (!p) { try { p = (JSON.parse(localStorage.getItem('asker_store_me') || 'null') || {}).phone || ''; } catch (e) { p = ''; } }
    p = String(p || '');
    return /^20\d{10}$/.test(p) ? '0' + p.slice(2) : p;
  }
  function revoke() { st.urls.forEach((u) => { if (u) { try { URL.revokeObjectURL(u); } catch (e) { /* gone already */ } } }); st.urls = []; }

  function formHtml() {
    const thumbs = st.files.map((f, i) => `<div class="rx-thumb">${st.urls[i] ? `<img src="${esc(st.urls[i])}" alt="">` : '<span>PDF</span>'}<button type="button" data-rxs-remove="${i}" aria-label="${esc(TEXTS.remove)}">×</button></div>`).join('');
    const full = st.files.length >= MAX();
    return `<p class="rg-hint">${esc(TEXTS.hint)}</p>` +
      `<div class="rx-thumbs">${thumbs}</div>` +
      (full ? '' : `<label for="rxsFile" class="rx-pick">${esc(st.files.length ? TEXTS.pickMore : TEXTS.pick)}</label>`) +
      `<input id="rxsFile" type="file" accept="image/*,application/pdf" multiple class="rx-file">` +
      `<label class="al-lbl" for="rxsPhone">${esc(TEXTS.phone)}</label><input id="rxsPhone" type="tel" dir="ltr" autocomplete="tel" inputmode="tel" maxlength="16" placeholder="01xxxxxxxxx" class="al-name" value="${esc(st.phone)}">` +
      `<label class="al-lbl" for="rxsNote">${esc(TEXTS.note)}</label><textarea id="rxsNote" rows="2" maxlength="450" class="al-name" placeholder="${esc(TEXTS.notePh)}">${esc(st.note)}</textarea>` +
      (st.error ? `<p class="al-warn" role="alert">${esc(st.error)}</p>` : '') +
      `<button type="button" class="al-save" data-rxs-send${st.busy ? ' disabled' : ''}>${esc(st.busy ? TEXTS.sending : TEXTS.send)}</button>`;
  }
  function doneHtml() {
    return `<div class="rxs-done"><div class="rxs-ico" aria-hidden="true">📋</div><h2>${esc(TEXTS.doneTitle)}</h2><p><b>${esc(fill(TEXTS.doneNo, { n: st.done }))}</b></p><p class="rg-hint">${esc(TEXTS.doneMore)}</p>` +
      `<button type="button" class="al-save" data-rxs-close>${esc(TEXTS.ok)}</button><button type="button" class="al-del" data-rxs-again>${esc(TEXTS.another)}</button></div>`;
  }
  function draw() {
    let el = document.getElementById('rxSheet');
    if (!st.view) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'rxSheet'; el.className = 'rg-sheet rxs-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
    const keep = el.querySelector('.rg-body'), top = keep ? keep.scrollTop : 0;
    el.innerHTML = `<div class="rg-top"><button type="button" class="rg-back" data-rxs-close aria-label="${esc(TEXTS.back)}">›</button><b>${esc(TEXTS.title)}</b></div><div class="rg-body">${st.done ? doneHtml() : formHtml()}</div>`;
    const b = el.querySelector('.rg-body'); if (b && top) b.scrollTop = top;
    const ph = el.querySelector('#rxsPhone'), nt = el.querySelector('#rxsNote');
    if (root.AskerI18n && root.AskerI18n.lang && root.AskerI18n.lang() === 'en') [ph, nt].forEach((x) => { if (x && x.placeholder && /[؀-ۿ]/.test(x.placeholder)) x.placeholder = root.AskerI18n.translate(x.placeholder); });
  }
  function open() {
    if (pharmacy) return;
    Object.assign(st, { view: true, files: [], urls: [], phone: savedPhone(), note: '', busy: false, error: '', done: null });
    try { history.pushState({ asRx: 1 }, '', location.href); } catch (e) { /* the close button still works */ }
    draw();
  }
  function close(quiet) {
    if (!st.view) return;
    revoke(); Object.assign(st, { view: false, files: [], busy: false, error: '', done: null });
    draw();
    if (!quiet) { try { if (history.state && history.state.asRx) history.back(); } catch (e) { /* nothing to go back to */ } }
  }
  function pick(files) {
    const r = addFiles(st.files, Array.from(files || []), MAX(), MAXB());
    st.urls = r.files.map((f) => { const i = st.files.indexOf(f); return i >= 0 ? st.urls[i] : (/^image\//.test(f.type) ? URL.createObjectURL(f) : null); });
    st.files = r.files; st.error = r.refused.length ? TEXTS.big : '';
    draw();
  }
  async function send() {
    if (st.busy) return;
    const S = store(), L = lib();
    if (!st.files.length) { st.error = TEXTS.needPhoto; draw(); return; }
    if (!S || !S.sendRx) return;
    st.busy = true; st.error = ''; draw();
    let r;
    try { r = await S.sendRx(st.files, st.phone, st.note); } catch (e) { r = { ok: false, error: '' }; }
    st.busy = false;
    if (!r || !r.ok) { st.error = (r && r.error) || ''; draw(); return; }
    revoke(); Object.assign(st, { files: [], note: '', error: '', done: r.id });
    void L;
    draw();
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-rxs-open]')) { open(); return; }
    if (!st.view) return;
    if (t.closest('[data-rxs-close]')) { close(); return; }
    if (t.closest('[data-rxs-again]')) { Object.assign(st, { done: null, error: '' }); draw(); return; }
    if (t.closest('[data-rxs-send]')) { send(); return; }
    const rm = t.closest('[data-rxs-remove]');
    if (rm) { const i = +rm.dataset.rxsRemove; if (st.urls[i]) { try { URL.revokeObjectURL(st.urls[i]); } catch (err) { /* gone */ } } st.files.splice(i, 1); st.urls.splice(i, 1); st.error = ''; draw(); }
  });
  document.addEventListener('change', (e) => { if (st.view && e.target && e.target.id === 'rxsFile') { pick(e.target.files); } });
  document.addEventListener('input', (e) => {
    if (!st.view || !e.target) return;
    if (e.target.id === 'rxsPhone') st.phone = e.target.value; else if (e.target.id === 'rxsNote') st.note = e.target.value;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.view) close(); });
  window.addEventListener('popstate', () => { if (st.view) { revoke(); Object.assign(st, { view: false, files: [], busy: false, done: null }); draw(); } });

  root.AskerStoreRx = { tileHtml, open, close, TEXTS };
})(typeof window === 'undefined' ? globalThis : window);
