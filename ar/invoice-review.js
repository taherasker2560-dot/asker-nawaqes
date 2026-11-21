/* «🧾 مراجعة الفواتير» (owner 2026-11-21, mockup mockups/invoice_review_2026-11-21/index.html, his «ابنيها»): the invoices the laptop's Claude has READ and PREPARED, shown before anything is
   entered in PharmaFly. Each card: the box number he wrote on the paper (the entry order), the paper's photo, the lines as they will be entered, the check «lines = the paper's net», and the
   notes: what Claude found, what it WILL do, and the choices. He answers each note («ماشي كده ✓» or his own choice), then «✅ وافق ودخّلها» (or Enter); the laptop sees the approval and enters
   exactly that, then marks the card «اتدخلت ✓» with its check against the database. The owner only (migration 202611212000, table ar_invoice_reviews). */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/invoice-review.cjs) ----------
  const STATUS = { ready: 'جاهزة', approved: 'اتوافق عليها', held: 'موقوفة', entering: 'بتتدخل…', entered: 'اتدخلت ✓', failed: 'وقفت', cancelled: 'اتلغت' };
  const WAITING = ['ready', 'held'], LAPTOP = ['approved', 'entering'];
  const pad = (n) => String(n).padStart(2, '0');
  const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const notesOf = (r) => (Array.isArray(r && r.notes) ? r.notes : []);
  const linesOf = (r) => (Array.isArray(r && r.lines) ? r.lines : []);
  const answersOf = (r) => (r && r.answers && typeof r.answers === 'object' ? r.answers : {});
  // the notes he has not answered yet
  const openNotes = (r) => notesOf(r).filter((n) => !answersOf(r)[n.id]);
  // «082029» -> «08/2029» (the month then the whole year, as typed in PharmaFly)
  const expiryText = (x) => { const s = String(x == null ? '' : x); return /^\d{6}$/.test(s) ? s.slice(0, 2) + '/' + s.slice(2) : s; };
  const sumLines = (r) => Math.round(linesOf(r).reduce((s, l) => s + (Number(l.total) || 0), 0) * 100) / 100;
  // the lines add up to the paper's net: green; otherwise the difference is shown
  function check(r) {
    const sum = sumLines(r), total = Number(r && r.total) || 0;
    return { ok: Math.abs(sum - total) <= 0.011, sum, total, diff: Math.round((sum - total) * 100) / 100 };
  }
  const canApprove = (r) => !!r && WAITING.includes(r.status) && openNotes(r).length === 0;
  // a line is flagged when one of the notes is about it
  const flagged = (r, l) => notesOf(r).some((n) => n.line != null && Number(n.line) === Number(l.n));
  // what he answered, in words
  function answerText(note, a) {
    if (!a) return '';
    if (a.v === 'ok') return 'ماشي كده ✓';
    if (a.v === 'alt') return 'هتتعمل: ' + (a.t || (((note && note.alts) || []).find((x) => x.k === a.k) || {}).t || '');
    if (a.v === 'text') return 'هتتعمل: ' + (a.t || '');
    return '';
  }
  // the chip on a card: its words and its kind (good / warn / run / bad / quiet)
  function chip(r) {
    const open = openNotes(r).length;
    switch (r.status) {
      case 'ready': return open ? { t: 'N_NOTES', n: open, kind: 'warn' } : { t: 'جاهزة ✓', kind: 'good' };
      case 'held': return { t: 'موقوفة', kind: 'quiet' };
      case 'approved': return { t: 'اتوافق عليها، بتستنى اللاب', kind: 'run' };
      case 'entering': return { t: 'بتتدخل…', kind: 'run' };
      case 'entered': return { t: 'اتدخلت ✓', kind: 'good' };
      case 'failed': return { t: 'وقفت', kind: 'bad' };
      default: return { t: STATUS[r.status] || r.status, kind: 'quiet' };
    }
  }
  // the cards in the order they are entered: waiting ones first (box number, then arrival), then the laptop's, then the finished (newest first)
  function sections(rows) {
    const byOrd = (a, b) => (a.ord == null ? 999 : a.ord) - (b.ord == null ? 999 : b.ord) || Number(a.id) - Number(b.id);
    const list = (rows || []).slice();
    return {
      waiting: list.filter((r) => WAITING.includes(r.status)).sort(byOrd),
      laptop: list.filter((r) => LAPTOP.includes(r.status)).sort(byOrd),
      stopped: list.filter((r) => r.status === 'failed').sort(byOrd),
      done: list.filter((r) => r.status === 'entered').sort((a, b) => String(b.done_at || b.created_at || '').localeCompare(String(a.done_at || a.created_at || '')) || Number(b.id) - Number(a.id)).slice(0, 12),
    };
  }
  // the ready ones with nothing to ask and a clean check: «وافق على الجاهز»
  const cleanReady = (rows) => (rows || []).filter((r) => r.status === 'ready' && notesOf(r).length === 0 && check(r).ok);
  const summary = (rows) => ({
    waiting: (rows || []).filter((r) => WAITING.includes(r.status)).length,
    withNotes: (rows || []).filter((r) => r.status === 'ready' && openNotes(r).length > 0).length,
    clean: cleanReady(rows).length,
    laptop: (rows || []).filter((r) => LAPTOP.includes(r.status)).length,
  });
  // the number on the badge: the invoices waiting for his yes
  const need = (rows) => (rows || []).filter((r) => r.status === 'ready').length;
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : pad(d.getHours() % 12 || 12) + ':' + pad(d.getMinutes()) + (d.getHours() < 12 ? ' ص' : ' م'); };
  const api = { STATUS, money, openNotes, expiryText, sumLines, check, canApprove, flagged, answerText, chip, sections, cleanReady, summary, need, when };
  root.AskerInvReviewLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the tab ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const COLS = 'id,batch,ord,supplier,doc_no,paper_date,total,photos,lines,notes,answers,owner_note,status,result,created_at,done_at';
  let rows = [], urls = {}, openState = {}, showAllLines = {}, rot = {}, timer = null, loading = false, sig = '', busy = false;

  function say(text, kind) {
    const el = $('rvStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  const panelOn = () => { const p = $('reviewPanel'); return !!p && !p.classList.contains('hidden'); };
  const isOpen = (r) => (r.id in openState ? openState[r.id] : WAITING.includes(r.status) && openNotes(r).length > 0);

  function chipHtml(r) {
    const c = chip(r);
    const text = c.t === 'N_NOTES' ? `<span class="rv-n">${esc(c.n)}</span> ${c.n === 1 ? 'ملاحظة' : 'ملاحظات'}` : esc(c.t);
    return `<span class="rv-chip rv-${c.kind}">${text}</span>`;
  }
  function lineRow(r, l) {
    const flag = flagged(r, l);
    const price = (Number(l.disc) ? `${esc(String(l.disc))}% · ` : '') + (l.exp ? esc(expiryText(l.exp)) : 'من غير صلاحية');
    return `<tr${flag ? ' class="rv-flag"' : ''}><td class="rv-ln">${esc(l.n)}</td><td>${esc(l.paper)}<small class="notr" dir="ltr">${esc(l.name || '')}${l.id ? ' · ' + esc(l.id) : ''}</small></td>` +
      `<td class="rv-num" dir="ltr">${esc(l.qty)} × ${price}<br><b>${esc(money(l.total))}</b></td></tr>`;
  }
  function linesHtml(r) {
    const ls = linesOf(r), cap = 6, all = showAllLines[r.id] || ls.length <= cap + 1;
    const show = all ? ls : ls.filter((l, i) => i < 3 || flagged(r, l));
    const hidden = ls.length - show.length;
    return `<table class="rv-lines">${show.map((l) => lineRow(r, l)).join('')}` +
      (hidden > 0 ? `<tr class="rv-more"><td colspan="3"><button type="button" class="rv-link" data-rv-all="${esc(r.id)}">… و${hidden} سطر تانيين مطابقين (دوس تشوفهم)</button></td></tr>` : '') + '</table>';
  }
  function checkHtml(r) {
    const c = check(r);
    return c.ok ? `<div class="rv-tot good"><span>مجموع السطور = صافي الورقة</span><b dir="ltr">${esc(money(c.total))} ✓</b></div>`
      : `<div class="rv-tot bad"><span>مجموع السطور ${esc(money(c.sum))} غير صافي الورقة ${esc(money(c.total))}</span><b dir="ltr">${esc(money(c.diff))}</b></div>`;
  }
  function noteHtml(r, n) {
    const a = answersOf(r)[n.id], locked = !WAITING.includes(r.status);
    const alts = (Array.isArray(n.alts) ? n.alts : []).map((x) => `<label><input type="radio" name="rv-${esc(r.id)}-${esc(n.id)}" data-rv-alt="${esc(r.id)}|${esc(n.id)}|${esc(x.k)}"${a && a.v === 'alt' && a.k === x.k ? ' checked' : ''}> <span class="notr">${esc(x.t)}</span></label>`).join('');
    return `<div class="rv-note${a ? ' done' : ''}" data-note="${esc(n.id)}"><p><b>${n.line != null ? 'سطر ' + esc(n.line) + ': ' : ''}</b><span class="notr">${esc(n.text)}</span></p>` +
      (n.mine ? `<p class="rv-mine">هعمل: <span class="notr">${esc(n.mine)}</span></p>` : '') +
      (locked ? '' : `<div class="rv-row"><button type="button" class="rv-yes${a && a.v === 'ok' ? ' on' : ''}" data-rv-ok="${esc(r.id)}|${esc(n.id)}">ماشي كده ✓</button><button type="button" data-rv-chg="${esc(r.id)}|${esc(n.id)}">غيّرها ✎</button></div>` +
        `<div class="rv-alt${a && a.v !== 'ok' ? ' on' : ''}" data-rv-box="${esc(r.id)}|${esc(n.id)}">${alts}<input type="text" maxlength="200" placeholder="أو اكتب اللي عايزه…" value="${a && a.v === 'text' ? esc(a.t) : ''}" data-rv-text="${esc(r.id)}|${esc(n.id)}"></div>`) +
      (a ? `<div class="rv-chosen notr">${esc(answerText(n, a))}</div>` : '') + '</div>';
  }
  function photosHtml(r) {
    const ph = Array.isArray(r.photos) ? r.photos : [];
    const shots = ph.map((p, i) => {
      const u = urls[p.p];
      return u ? `<button type="button" class="rv-ph" data-rv-shot="${esc(r.id)}|${i}" aria-label="صورة الورقة"><img src="${esc(u)}" alt="" loading="lazy" style="transform:rotate(${esc(Number(p.rot) || 0)}deg)"></button>` : '';
    }).join('');
    return `<div class="rv-photos">${shots || '<div class="rv-ph rv-none">صورة الورقة اتأرشفت على اللاب</div>'}</div>`;
  }
  function footHtml(r) {
    if (WAITING.includes(r.status)) {
      const open = openNotes(r).length, ok = canApprove(r);
      return `<label class="rv-lbl" for="rvNote${esc(r.id)}">ملاحظتك على الفاتورة دي (اختياري)</label>` +
        `<textarea id="rvNote${esc(r.id)}" maxlength="1000" placeholder="اكتب أي حاجة عايزني أعملها فيها…" data-rv-own="${esc(r.id)}">${esc(r.owner_note || '')}</textarea>` +
        `<button type="button" class="rv-go" data-rv-approve="${esc(r.id)}"${ok ? '' : ' disabled'}>✅ وافق ودخّلها</button>` +
        `<div class="hint rv-h">${ok ? 'اضغط الزرار أو Enter' : `رد على ${open} ${open === 1 ? 'ملاحظة' : 'ملاحظات'} الأول وبعدين الزرار يشتغل`}</div>` +
        (r.status === 'held' ? '<div class="hint rv-h">موقوفة: هتتدخل لما توافق.</div>' : `<button type="button" class="rv-link" data-rv-hold="${esc(r.id)}">استنى عليها</button>`);
    }
    if (r.status === 'approved') return `<div class="hint rv-h">وافقت، واللاب بيبدأ دلوقتي.</div><button type="button" class="rv-link" data-rv-back="${esc(r.id)}">رجّعها جاهزة (قبل ما اللاب يبدأ)</button>`;
    const res = r.result || {};
    if (r.status === 'entered') return `<div class="rv-done notr">${esc(res.msg || 'اتدخلت')}${res.checked ? ' · ' + esc(res.checked) : ''}${r.done_at ? ' · ' + esc(when(r.done_at)) : ''}</div>`;
    if (r.status === 'failed') return `<div class="rv-done bad notr">${esc(res.msg || 'وقفت عند حاجة، هقولك في الشات')}</div>`;
    return '';
  }
  function card(r) {
    const open = isOpen(r);
    const sub = [r.paper_date, 'صافي ' + money(r.total), linesOf(r).length + ' سطر'].filter(Boolean).join(' · ');
    return `<div class="rv-card${open ? ' open' : ''}" data-rv="${esc(r.id)}"><div class="rv-hd" role="button" tabindex="0" data-rv-toggle="${esc(r.id)}">` +
      `<span class="rv-ord">${r.ord == null ? '·' : esc(r.ord)}</span><span class="rv-t"><strong class="notr">${esc(r.supplier)} · ${esc(r.doc_no)}</strong><span dir="ltr">${esc(sub)}</span></span>${chipHtml(r)}</div>` +
      `<div class="rv-body">${photosHtml(r)}${linesHtml(r)}${checkHtml(r)}` +
      (notesOf(r).length ? `<h4>ملاحظاتي${WAITING.includes(r.status) ? ' (محتاجة رأيك)' : ''}</h4>${notesOf(r).map((n) => noteHtml(r, n)).join('')}` : '') +
      footHtml(r) + '</div></div>';
  }
  function draw() {
    const box = $('rvMain');
    if (!box) return;
    const s = sections(rows), sm = summary(rows);
    const head = (t, n) => `<h3 class="py-h">${t}${n ? ` <span class="rv-n">${esc(n)}</span>` : ''}</h3>`;
    let html = '';
    if (!rows.length) html = '<p class="hint">مفيش فواتير متجهزة دلوقتي. أول ما تيجي فواتير جديدة هجهّزها وهتظهر هنا.</p>';
    else {
      html += `<div class="rv-sum"><span class="rv-pill"><b>${esc(sm.waiting)}</b> فواتير مستنياك</span><span class="rv-pill"><b>${esc(sm.withNotes)}</b> فيها ملاحظات</span>` +
        (sm.laptop ? `<span class="rv-pill"><b>${esc(sm.laptop)}</b> عند اللاب</span>` : '') + '</div>';
      if (sm.clean) html += `<button type="button" class="rv-all" data-rv-allok>✓ وافق على الجاهز وملهوش ملاحظات (${esc(sm.clean)}) ودخّله</button>`;
      if (s.waiting.length) html += head('مستنية موافقتك', s.waiting.length) + s.waiting.map(card).join('');
      if (s.laptop.length) html += head('وافقت عليها (بتتدخل)', s.laptop.length) + s.laptop.map(card).join('');
      if (s.stopped.length) html += head('وقفت', s.stopped.length) + s.stopped.map(card).join('');
      if (s.done.length) html += head('اتدخلت', s.done.length) + s.done.map(card).join('');
    }
    box.innerHTML = html;
  }
  const signature = () => JSON.stringify(rows.map((r) => [r.id, r.status, r.owner_note, r.answers, r.notes, r.lines, r.result, r.ord, r.total]));
  async function load(force) {
    if (!db() || loading) return;
    loading = true;
    try {
      const since = new Date(Date.now() - 3 * 864e5).toISOString();
      const { data, error } = await db().from('ar_invoice_reviews').select(COLS).order('created_at', { ascending: false }).limit(60);
      if (error) throw error;
      const next = (data || []).filter((r) => WAITING.includes(r.status) || LAPTOP.includes(r.status) || String(r.done_at || r.created_at || '') >= since);
      const paths = [...new Set(next.flatMap((r) => (Array.isArray(r.photos) ? r.photos : []).map((p) => p.p)).filter((p) => p && !urls[p]))];
      if (paths.length && db().storage) {
        try {
          const { data: signed } = await db().storage.from('ar-inbox').createSignedUrls(paths, 3600);
          for (const x of signed || []) if (x && x.path && x.signedUrl) urls[x.path] = x.signedUrl;
        } catch (e) { /* a photo that cannot be shown is not a reason to hide the invoice */ }
      }
      const before = sig; rows = next; sig = signature();
      // never redraw under his fingers (typing a note, choosing an answer)
      const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#rvMain') && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      if (force || (sig !== before && !typing)) draw();
      say('');
    } catch (e) {
      say('مقدرتش أجيب الفواتير المتجهزة: ' + (e.message || e), 'bad');
    } finally { loading = false; }
  }
  const find = (id) => rows.find((r) => String(r.id) === String(id));
  async function patch(id, fields) {
    const r = find(id); // the row's own id (a number), not the text the page carries in its attributes
    const { error } = await db().from('ar_invoice_reviews').update(fields).eq('id', r ? r.id : id);
    if (error) throw error;
    if (r) Object.assign(r, fields);
  }
  async function answer(rid, nid, a) {
    const r = find(rid);
    if (!r || busy) return;
    busy = true;
    try {
      const next = { ...answersOf(r), [nid]: a };
      await patch(rid, { answers: next });
      openState[rid] = true; // the card he is answering stays open
      sig = signature(); draw();
    } catch (e) { say('الرد ماتحفظش: ' + (e.message || e), 'bad'); } finally { busy = false; }
  }
  async function approve(ids) {
    if (busy) return;
    busy = true;
    try {
      for (const id of ids) {
        const r = find(id);
        if (!r || !(WAITING.includes(r.status))) continue;
        await patch(id, { status: 'approved' });
      }
      say(ids.length > 1 ? `وافقت على ${ids.length} فواتير: اللاب هيبدأ يدخّلهم بالترتيب` : 'وافقت: اللاب هيبدأ يدخّلها دلوقتي', 'good');
      sig = signature(); draw();
    } catch (e) { say('الموافقة ماتمّتش: ' + (e.message || e), 'bad'); await load(true); } finally { busy = false; }
  }
  async function setStatus(id, status, okText) {
    if (busy) return;
    busy = true;
    try { await patch(id, { status }); say(okText, 'good'); sig = signature(); draw(); }
    catch (e) { say('ماتغيّرتش: ' + (e.message || e), 'bad'); await load(true); } finally { busy = false; }
  }
  let shot = null;
  function viewer(rid, i) {
    const r = find(rid), p = r && (r.photos || [])[i];
    if (!p || !urls[p.p]) return;
    const k = rid + '|' + i;
    if (!(k in rot)) rot[k] = Number(p.rot) || 0;
    shot && shot.remove();
    shot = document.createElement('div');
    shot.className = 'rv-shot';
    shot.innerHTML = `<div class="rv-shot-bar"><button type="button" data-rv-rot>تدوير ↻</button><button type="button" data-rv-close>قفل</button></div><div class="rv-shot-img"><img alt="" src="${esc(urls[p.p])}" style="transform:rotate(${rot[k]}deg)"></div>`;
    shot.addEventListener('click', (e) => {
      if (e.target.closest('[data-rv-rot]')) { rot[k] = (rot[k] + 90) % 360; shot.querySelector('img').style.transform = `rotate(${rot[k]}deg)`; }
      else if (e.target.closest('[data-rv-close]') || e.target === shot) { shot.remove(); shot = null; }
    });
    document.body.appendChild(shot);
  }
  const split = (s) => String(s).split('|');
  function onClick(e) {
    const t = e.target;
    const g = (a) => t.closest('[' + a + ']');
    let el;
    if ((el = g('data-rv-ok'))) { const [r, n] = split(el.dataset.rvOk); return answer(r, n, { v: 'ok' }); }
    if ((el = g('data-rv-chg'))) { const b = document.querySelector(`[data-rv-box="${CSS.escape(el.dataset.rvChg)}"]`); if (b) { b.classList.add('on'); const i = b.querySelector('input[type=text]'); i && i.focus(); } return; }
    if ((el = g('data-rv-approve'))) return approve([el.dataset.rvApprove]);
    if ((el = g('data-rv-allok'))) return approve(cleanReady(rows).map((r) => r.id));
    if ((el = g('data-rv-hold'))) return setStatus(el.dataset.rvHold, 'held', 'استنيت عليها: مش هتتدخل لحد ما توافق');
    if ((el = g('data-rv-back'))) return setStatus(el.dataset.rvBack, 'ready', 'رجعتها جاهزة');
    if ((el = g('data-rv-all'))) { showAllLines[el.dataset.rvAll] = true; return draw(); }
    if ((el = g('data-rv-shot'))) { const [r, i] = split(el.dataset.rvShot); return viewer(r, Number(i)); }
    if ((el = g('data-rv-toggle'))) { const r = find(el.dataset.rvToggle); if (r) { openState[r.id] = !isOpen(r); el.closest('.rv-card').classList.toggle('open', openState[r.id]); } }
  }
  function onChange(e) {
    const t = e.target;
    if (t.matches('[data-rv-alt]')) { const [r, n, k] = split(t.dataset.rvAlt); const row = find(r), note = row && notesOf(row).find((x) => x.id === n); const alt = note && (note.alts || []).find((x) => x.k === k); return answer(r, n, { v: 'alt', k, t: alt ? alt.t : '' }); }
    if (t.matches('[data-rv-text]')) { const [r, n] = split(t.dataset.rvText); const v = t.value.trim().slice(0, 200); return v ? answer(r, n, { v: 'text', t: v }) : undefined; }
    if (t.matches('[data-rv-own]')) { const v = t.value.trim().slice(0, 1000); const r = find(t.dataset.rvOwn); if (r && (r.owner_note || '') !== v) patch(r.id, { owner_note: v || null }).then(() => say('ملاحظتك اتبعتت', 'good')).catch((er) => say('الملاحظة ماتحفظتش: ' + (er.message || er), 'bad')); }
  }
  function onKey(e) {
    if (!panelOn()) return;
    if (e.key === 'Enter' && !e.target.closest('input,textarea,button,select,a,[role="button"]')) {
      const b = document.querySelector('#rvMain .rv-card.open [data-rv-approve]:not([disabled])');
      if (b) { e.preventDefault(); b.click(); }
    } else if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-rv-toggle]')) e.target.click();
  }
  function open() {
    if (!db()) return;
    load(true);
    clearInterval(timer);
    timer = setInterval(() => { if (panelOn() && !document.hidden) load(false); }, 20000);
  }
  function close() { clearInterval(timer); timer = null; shot && shot.remove(); shot = null; }
  const main = $('rvMain');
  if (main) { main.addEventListener('click', onClick); main.addEventListener('change', onChange); main.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-rv-toggle]')) e.target.click(); }); }
  document.addEventListener('keydown', onKey);
  $('rvRefresh')?.addEventListener('click', () => load(true));
  // the badge / home row: how many invoices wait for his yes (asked by ar/notify.js with the other counts)
  async function count() {
    try {
      const { data, error } = await db().from('ar_invoice_reviews').select('id').eq('status', 'ready').limit(200);
      return error ? null : (data || []).length;
    } catch (e) { return null; }
  }
  root.AskerInvReview = { open, close, count };
})(typeof window === 'undefined' ? globalThis : window);
