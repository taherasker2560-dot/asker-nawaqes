/* «فواتير» tab (asker-nawaqes-arabic.html): documents for the owner (owner's request 2026-11-08, shape «أ»).
   Photos from the pharmacy's own WhatsApp group come by themselves (the phone forwards them; function arabic-shortages,
   documents path). The owner can also take or pick photos here (several pages of one invoice, the back with a new
   item's details, a note such as «فيها إشعار»). Claude reads them on the laptop: purchase invoices and credit notes are
   entered into PharmaFly with the owner, receipts and bills are kept for the expenses later.
   Table ar_documents, files in the private bucket ar-inbox under docs/ (migration 202611080028, owner only). */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/docs.cjs) ----------
  const TYPE = { purchase: 'فاتورة شرا', credit: 'إشعار', collection: 'إيصال تحصيل', utility: 'ميه أو كهرباء', other: 'حاجة تانية' };
  const STATUS = { new: 'مستنية Claude', entered: 'اتدخلت في فارمافلاي', kept: 'اتحفظت للمصروفات', skipped: 'مش مستند' };
  const MAX_BYTES = 8 * 1024 * 1024;
  const pad = (n) => String(n).padStart(2, '0');
  // «النهارده ٤:٣٠ م» / «امبارح ١١:٠٥ ص» / «07/11 ٢:١٠ م» (Cairo time on the phone)
  function when(iso, now = new Date()) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const day = (x) => x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const h = d.getHours(), t = (h % 12 || 12) + ':' + pad(d.getMinutes()) + (h < 12 ? ' ص' : ' م');
    if (day(d) === day(now)) return 'النهارده ' + t;
    if (day(d) === day(y)) return 'امبارح ' + t;
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + t;
  }
  function fileKind(type, name) {
    return /pdf/i.test(type || '') || /\.pdf$/i.test(name || '') ? 'pdf' : 'image';
  }
  // same place the function uses: docs/<day>/<content hash>.<ext>, so the same photo is kept once
  function docPath(hash, type, name, day) {
    const ext = fileKind(type, name) === 'pdf' ? 'pdf' : /png/i.test(type || '') ? 'png' : 'jpg';
    return `docs/${day}/${hash}.${ext}`;
  }
  // one line under the photo: what it is and where it stands
  function describe(d) {
    const parts = [];
    if (d.doc_type && TYPE[d.doc_type]) parts.push(TYPE[d.doc_type]);
    if (d.supplier) parts.push(d.supplier);
    if (d.doc_no) parts.push(d.doc_no);
    if (d.total != null && d.total !== '') parts.push(Number(d.total).toFixed(2));
    return parts.join(' · ');
  }
  const api = { TYPE, STATUS, MAX_BYTES, when, fileKind, docPath, describe };
  root.AskerDocsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the tab ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let busy = false, picked = [];

  function say(text, kind) {
    const el = $('dcStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  async function hashOf(buf) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  function card(d, url) {
    const from = d.source === 'upload' ? 'صورتها من هنا' : 'من الجروب';
    const st = STATUS[d.status] || d.status;
    const info = describe(d);
    const thumb = d.kind === 'pdf'
      ? `<a class="dc-thumb dc-pdf" href="${esc(url || '#')}" target="_blank" rel="noopener">PDF</a>`
      : `<a class="dc-thumb" href="${esc(url || '#')}" target="_blank" rel="noopener"><img src="${esc(url || '')}" alt="صورة المستند" loading="lazy"></a>`;
    return `<div class="dc-item" data-doc="${esc(d.id)}">${thumb}<div class="dc-text">` +
      `<strong>${esc(when(d.received_at || d.created_at))} · ${esc(from)}</strong>` +
      `<span class="dc-st dc-${esc(d.status)}">${esc(st)}</span>` +
      (info ? `<span class="hint">${esc(info)}</span>` : '') +
      (d.note ? `<span class="hint">ملاحظة: ${esc(d.note)}</span>` : '') +
      (d.handled_note ? `<span class="hint">${esc(d.handled_note)}</span>` : '') +
      `</div></div>`;
  }
  async function open() {
    if (!db()) return;
    try {
      const { data, error } = await db().from('ar_documents')
        .select('id,received_at,source,chat,file_path,kind,note,doc_type,status,supplier,doc_no,total,handled_note')
        .order('received_at', { ascending: false }).limit(80);
      if (error) throw error;
      const docs = (data || []).slice().sort((a, b) => String(b.received_at || b.created_at || '').localeCompare(String(a.received_at || a.created_at || '')));
      let urls = {};
      if (docs.length) {
        const { data: signed } = await db().storage.from('ar-inbox').createSignedUrls(docs.map((d) => d.file_path), 3600);
        for (const s of signed || []) if (s && s.path) urls[s.path] = s.signedUrl;
      }
      const waiting = docs.filter((d) => d.status === 'new'), done = docs.filter((d) => d.status !== 'new').slice(0, 20);
      $('dcWaitTitle').textContent = `مستنية (${waiting.length})`;
      $('dcWait').innerHTML = waiting.length ? waiting.map((d) => card(d, urls[d.file_path])).join('') : '<p class="hint">مفيش حاجة مستنية.</p>';
      $('dcDoneBox').classList.toggle('hidden', !done.length);
      $('dcDone').innerHTML = done.map((d) => card(d, urls[d.file_path])).join('');
    } catch (e) {
      say('مقدرتش أجيب الفواتير: ' + e.message, 'bad');
    }
  }
  // every photo taken is one more page of the same invoice (the front, then the back with a new item's details)
  function showPicked() {
    $('dcPicked').textContent = picked.length ? `صفحات الفاتورة دي: ${picked.length}` : '';
    $('dcPickLabel').textContent = picked.length ? '+ زوّد صفحة (ضهر الفاتورة مثلًا)' : 'صوّر فاتورة جديدة';
    $('dcSend').disabled = !picked.length;
  }
  function addPicked() {
    picked.push(...($('dcFile').files || []));
    $('dcFile').value = '';
    showPicked();
  }
  async function send() {
    if (busy) return;
    const files = picked.slice();
    if (!files.length) return say('اختار صورة الفاتورة الأول', 'bad');
    const big = files.find((f) => f.size > MAX_BYTES);
    if (big) return say('صورة أكبر من ٨ ميجا: صوّرها تاني بجودة أقل', 'bad');
    busy = true; $('dcSend').disabled = true;
    const note = $('dcNote').value.trim().slice(0, 500) || null;
    const batch = crypto.randomUUID ? crypto.randomUUID() : null;
    const day = new Date().toISOString().slice(0, 10);
    let sent = 0, again = 0;
    try {
      for (const f of files) {
        say(`بابعت ${sent + again + 1} من ${files.length}…`);
        const buf = await f.arrayBuffer();
        const path = docPath(await hashOf(buf), f.type, f.name, day);
        const up = await db().storage.from('ar-inbox').upload(path, f, { contentType: f.type || 'image/jpeg', upsert: false });
        if (up.error && !/exist|duplicate/i.test(up.error.message || '')) throw up.error;
        const { error } = await db().from('ar_documents').insert({ source: 'upload', file_path: path, kind: fileKind(f.type, f.name), batch, note, status: 'new' });
        if (error) { if (/duplicate|unique/i.test(error.message || '')) { again++; continue; } throw error; }
        sent++;
      }
      say(again ? `اتبعتت ${sent} صفحة، و${again} كانت متبعتة قبل كده` : `اتبعتت ${sent} صفحة، وهتستنى Claude يقراها`, 'good');
      picked = []; $('dcNote').value = ''; showPicked();
      await open();
    } catch (e) {
      say('الصورة ماتبعتتش: ' + (e.message || e), 'bad');
    } finally {
      busy = false; $('dcSend').disabled = !picked.length;
    }
  }
  $('dcFile')?.addEventListener('change', addPicked);
  $('dcSend')?.addEventListener('click', send);
  root.AskerDocs = { open };
})(typeof window === 'undefined' ? globalThis : window);
