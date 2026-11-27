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
  // «سعر الجمهور» (owner 2026-11-21: the public prices of cosmetics are estimates and HIS call, never the paper's, never mine). A cosmetics invoice (lines with «cosm») is drawn COMPACT (his mockup
  // mockups/invoice_review_compact_2026-11-21, «ابنيها»): the lines whose unit cost moved more than about a pound from the last purchase, and new items, carry ask:'price' with the unit net (the cost he
  // judges by, never the discount), the card's CURRENT price («card») and the last cost («prev»); each has a box: he types a price and Enter (saved as answers['L<line>'] = {v:'price', t:'<number>'}; the
  // card follows only when it differs), or Enter on the empty box = keep the card's price. The other lines sit folded under «زي آخر مرة» (the card's price stays). Every line with an expiry can be
  // REJECTED for its expiry (answers['R<line>'] = {v:'reject'}: the laptop returns that line instead of keeping it).
  const parseNum = (s) => { const t = String(s == null ? '' : s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫,،]/g, '.').replace(/[^\d.]/g, ''); const n = parseFloat(t); return isFinite(n) ? n : NaN; };
  const askLines = (r) => linesOf(r).filter((l) => l && l.ask === 'price');
  // the price he typed for the line (none if he left it)
  const priceOf = (r, l) => { const a = answersOf(r)['L' + l.n]; const n = a && a.v === 'price' ? Number(a.t) : NaN; return n > 0 ? n : null; };
  // the price the line will be entered with: his, else the card's
  // (a card price below the net or ten times above it is no price to enter with: it waits for his, like a new item)
  const effPrice = (r, l) => { const p = priceOf(r, l); if (p) return p; const c = Number(l.card); return c > 0 && validPrice(c, l.net) ? c : null; };
  // a price he changed from the card's: the card has to follow (nothing else in PharmaFly is touched)
  const changedPrice = (r, l) => { const p = priceOf(r, l); return p && p !== Number(l.card) ? p : null; };
  // a line he rejected for its expiry (it goes back to the supplier: no price needed)
  const rejected = (r, l) => { const a = answersOf(r)['R' + l.n]; return !!(a && a.v === 'reject'); };
  // an asked line waits until he answers it (his price, or the card's kept with Enter)
  const openPrices = (r) => askLines(r).filter((l) => !rejected(r, l) && priceOf(r, l) == null);
  // a cosmetics invoice: drawn as the compact price list
  const compact = (r) => linesOf(r).some((l) => l && (l.cosm || l.ask === 'price'));
  // months from this month to the expiry's month (the short-dated rule: under 18 = short, under 6 = very short)
  function expMonths(x, now) { const s = String(x == null ? '' : x); if (!/^\d{6}$/.test(s)) return null; const d = now || new Date(); return (Number(s.slice(2)) - d.getFullYear()) * 12 + (Number(s.slice(0, 2)) - (d.getMonth() + 1)); }
  const expKind = (x, now) => { const m = expMonths(x, now); return m == null ? '' : m < 6 ? 'bad' : m < 18 ? 'near' : ''; };
  // everything still waiting for his answer on a card: notes and prices nobody knows yet
  const needs = (r) => openNotes(r).length + openPrices(r).length;
  const validPrice = (price, net) => price > 0 && price >= Number(net) && price <= Number(net) * 10;
  const discFor = (price, net) => Math.round((1 - Number(net) / Number(price)) * 1e6) / 1e4;
  // the line's discount as it will be entered (for an asked line: from the price it will have)
  function discOf(r, l) { if (l.ask === 'price') { const p = effPrice(r, l); return p ? discFor(p, l.net) : null; } return l.disc == null ? null : Number(l.disc); }
  // «082029» -> «08/2029» (the month then the whole year, as typed in PharmaFly)
  const expiryText = (x) => { const s = String(x == null ? '' : x); return /^\d{6}$/.test(s) ? s.slice(0, 2) + '/' + s.slice(2) : s; };
  const sumLines = (r) => Math.round(linesOf(r).reduce((s, l) => s + (Number(l.total) || 0), 0) * 100) / 100;
  // the lines add up to the paper's net: green; otherwise the difference is shown
  function check(r) {
    const sum = sumLines(r), total = Number(r && r.total) || 0;
    return { ok: Math.abs(sum - total) <= 0.011, sum, total, diff: Math.round((sum - total) * 100) / 100 };
  }
  const canApprove = (r) => !!r && WAITING.includes(r.status) && needs(r) === 0;
  // a line is flagged when one of the notes is about it
  const flagged = (r, l) => notesOf(r).some((n) => n.line != null && Number(n.line) === Number(l.n));
  // what he answered, in words
  function answerText(note, a) {
    if (!a) return '';
    if (a.v === 'ok') return 'تمام ✓';
    if (a.v === 'alt') return 'هتتعمل: ' + (a.t || (((note && note.alts) || []).find((x) => x.k === a.k) || {}).t || '');
    if (a.v === 'text') return 'هتتعمل: ' + (a.t || '');
    return '';
  }
  // the chip on a card: its words and its kind (good / warn / run / bad / quiet)
  function chip(r) {
    const open = needs(r);
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
  const cleanReady = (rows) => (rows || []).filter((r) => r.status === 'ready' && notesOf(r).length === 0 && openPrices(r).length === 0 && check(r).ok);
  const summary = (rows) => ({
    waiting: (rows || []).filter((r) => WAITING.includes(r.status)).length,
    withNotes: (rows || []).filter((r) => r.status === 'ready' && needs(r) > 0).length,
    clean: cleanReady(rows).length,
    laptop: (rows || []).filter((r) => LAPTOP.includes(r.status)).length,
  });
  // the number on the badge: the invoices waiting for his yes
  const need = (rows) => (rows || []).filter((r) => r.status === 'ready').length;
  // the purchase robot's stops (owner 2026-11-25: «نظام في السيستم يقول لي الحاجات اللي هو واقف عندها مع الفواتير، وإشعار صوتي»). The laptop writes each one in ar_robot_reports
  // (job «purchases» = it stopped, or typed every line and waits for the check; job «purchases_wait» = a card it will not type, the helper enters it), ref_id «card:<card id>:<stop|check|needs_helper>»,
  // title = the invoice, details = what it stopped at (+ a second line with who has it). The card goes when the invoice is entered. Same look as «🤖 الروبوت محتاج رأيك» (ar/robot.js).
  const BUY_HEAD = { stop: '🤖 الروبوت وقف عند فاتورة', check: '🤖 الروبوت كتب الفاتورة ومستني المراجعة', needs_helper: '🤖 الروبوت محتاج المساعد', off: '⏸️ الروبوت واقف بأمرك' };
  const BUY_CHIP = { stop: 'وقف عندها الروبوت', check: 'مستنية المراجعة', needs_helper: 'مستنية المساعد' };
  const buyRef = (s) => {
    const ref = String((s && s.ref_id) || '');
    if (ref === 'robot:off') return { card: '', kind: 'off' };
    const m = /^card:(\d+):(stop|check|needs_helper)$/.exec(ref);
    return m ? { card: m[1], kind: m[2] } : null;
  };
  // the stops to show: waiting for him (open) or being carried out by the laptop (answered), of the purchase robot: the ones that stopped first, then waiting for the check, then the helper's, then «off»
  const buyStops = (list) => {
    const rank = { stop: 0, check: 1, needs_helper: 2, off: 3 };
    return (list || []).filter((s) => s && (s.status === 'open' || s.status === 'answered') && buyRef(s)).sort((a, b) => rank[buyRef(a).kind] - rank[buyRef(b).kind] || String(a.created_at || '').localeCompare(String(b.created_at || '')) || Number(a.id) - Number(b.id));
  };
  // ---- 2026-11-26 «متشوف الروبوت وقف ليه و اعملى اوبشن حوه السيستم  اعرف اتصرف» (mockup robot_stop_answers_2026-11-26): the card says what happened, that nothing was saved, whether the
  // helper is on, shows PharmaFly's screen at the stop, and offers the answers the laptop carries out (Hub\purchase_entry\ROBOT_ANSWERS.ps1). The laptop's lines: why, who has it, SAFE:1, SHOT:<path>
  function stopParts(s) {
    const out = { why: '', who: '', safe: false, shot: '' }, text = [];
    for (const raw of String((s && s.details) || '').split('\n')) {
      const line = raw.trim();
      if (line === 'SAFE:1') out.safe = true;
      else if (line.startsWith('SHOT:')) out.shot = /^SHOT:robot\/[\w.-]+$/.test(line) ? line.slice(5) : '';
      else if (line) text.push(line);
    }
    out.why = text[0] || '';
    out.who = text.slice(1).join('\n');
    return out;
  }
  // what each button will do (the words under it), and what the card says once he tapped it
  const OPT_HELP = {
    retry: 'الروبوت يكتبها من الأول أول ما شاشة المشتريات تتقفل (من «خروج» من غير حفظ)، ونسخة الصيدلية تأكد إنها ما اتحفظتش.',
    manual: 'الروبوت يسيبها. أول ما تتحفظ يتأكد من الأصناف والصافي ويعلّمها «اتدخلت»، ويكمّل اللي بعدها.',
    helper: 'محادثة الفواتير تكمّلها. لو مش شغالة، السطر اللي فوق بيقول.',
    off: 'ما يكتبش أي فاتورة لحد ما تدوس «شغّل الروبوت».',
    on: 'يرجع يكتب الفواتير المعتمدة.',
  };
  const ANSWER_HEAD = { retry: '🔁 هيجرّب تاني', manual: '🙋 إنت هتدخلها', helper: '🧑‍💻 اتبعتت للمساعد', off: '⏸️ وقّفت الروبوت', on: '▶️ بيشتغل تاني', text: '✍️ كلامك اتبعت' };
  const ANSWER_NEXT = {
    retry: 'هيعيدها أول ما الشاشة تتقفل ونسخة الصيدلية الجديدة تأكد إنها ما اتحفظتش.',
    manual: 'سابها ومستني الحفظ في فارمافلاي (بيشوفه بعد نسخة الصيدلية الجاية).',
    helper: 'اتبعتت لمحادثة الفواتير.',
    off: 'هيتوقف خلال دقيقتين.',
    on: 'هيشتغل خلال دقيقتين.',
    text: 'محادثة الفواتير هتقرا كلامك.',
  };
  const answerKind = (s) => (s && s.status === 'answered' ? (ANSWER_HEAD[s.answer_key] ? s.answer_key : 'text') : '');
  const stopOptions = (s) => (Array.isArray(s && s.options) ? s.options : []).filter((o) => o && typeof o.key === 'string' && o.key && typeof o.label === 'string' && o.label).slice(0, 6);
  const buyOf = (list, r) => buyStops(list).find((s) => buyRef(s).card === String(r && r.id)) || null;
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : pad(d.getHours() % 12 || 12) + ':' + pad(d.getMinutes()) + (d.getHours() < 12 ? ' ص' : ' م'); };
  // ---- «صور الأصناف» (owner 2026-11-27: «أي صنف ملوش صورة… أو صورته مش تمام أول ما يدخل مشتريات تطلب صورته» → «تطلبها في مراجعة المشتريات») ----
  // the invoice's items (each once; a new item without a card yet has its own box photo; a rejected line goes back) whose photo is missing ('none') or is one nobody of ours chose ('net').
  // stateOf(id) = AskerItemMedia.photoState; the internet ones are asked only once «تمام» can be kept (canConfirm: after migration 202611271000)
  function picNeeds(r, stateOf, canConfirm) {
    const none = [], net = [], seen = new Set();
    for (const l of linesOf(r)) {
      const id = l && Number(l.id);
      if (!(id > 0) || seen.has(id) || rejected(r, l)) continue;
      seen.add(id);
      const st = stateOf(id), x = { id, name: String(l.name || l.paper || '') };
      if (st === 'none') none.push(x); else if (st === 'net' && canConfirm) net.push(x);
    }
    return { none, net, n: none.length + net.length };
  }
  const api = { picNeeds, STATUS, money, openNotes, parseNum, askLines, priceOf, effPrice, changedPrice, rejected, openPrices, compact, expMonths, expKind, needs, validPrice, discFor, discOf, expiryText, sumLines, check, canApprove, flagged, answerText, chip, sections, cleanReady, summary, need, when, buyRef, buyStops, buyOf, BUY_HEAD, BUY_CHIP, stopParts, answerKind, stopOptions, OPT_HELP, ANSWER_HEAD, ANSWER_NEXT };
  root.AskerInvReviewLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the tab ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  // «🎤» beside the boxes where he writes his own words (owner 2026-11-22, ar/voice.js): said instead of typed, saved the same way when the box changes
  const voice = (selector, label) => (root.AskerVoice ? root.AskerVoice.button(selector, label) : '');
  const COLS ='id,batch,ord,supplier,doc_no,paper_date,total,photos,lines,notes,answers,owner_note,status,result,created_at,done_at';
  let rows = [], stops = [], urls = {}, openState = {}, showAllLines = {}, rot = {}, timer = null, loading = false, sig = '', busy = false, snaps = {};

  function say(text, kind) {
    const el = $('rvStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  const panelOn = () => { const p = $('reviewPanel'); return !!p && !p.classList.contains('hidden'); };
  const isOpen = (r) => (r.id in openState ? openState[r.id] : WAITING.includes(r.status) && (needs(r) > 0 || askLines(r).length > 0));

  function chipHtml(r) {
    const bs = LAPTOP.includes(r.status) ? buyOf(stops, r) : null;   // the purchase robot stopped on this one (or waits for the helper): its card says so
    const c = bs ? (bs.status === 'answered' ? { t: 'رديت على الروبوت', kind: 'quiet' } : { t: BUY_CHIP[buyRef(bs).kind], kind: buyRef(bs).kind === 'needs_helper' ? 'quiet' : 'bad' }) : chip(r);
    const onlyPrices = c.t === 'N_NOTES' && !openNotes(r).length;
    const text = c.t === 'N_NOTES' ? `<span class="rv-n">${esc(c.n)}</span> ${onlyPrices ? (c.n === 1 ? 'محتاج سعرك' : 'محتاجين سعرك') : c.n === 1 ? 'ملاحظة' : 'ملاحظات'}` : esc(c.t);
    return `<span class="rv-chip rv-${c.kind}">${text}</span>`;
  }
  // the expiry of a line and its «رفض» (he rejects the line for its expiry: it goes back to the supplier)
  function expHtml(r, l) {
    if (!l.exp) return '<span class="rv-exp">من غير صلاحية</span>';
    const rej = rejected(r, l), locked = !WAITING.includes(r.status), k = expKind(l.exp);
    return `<span class="rv-exp${k ? ' ' + k : ''}" dir="ltr">${esc(expiryText(l.exp))}</span>` +
      (locked ? (rej ? ' <span class="rv-rej on">مرفوض: هيترجع</span>' : '') : ` <button type="button" class="rv-rej${rej ? ' on' : ''}" data-rv-rej="${esc(r.id)}|${esc(l.n)}">${rej ? 'مرفوض: هيترجع ✕' : 'رفض'}</button>`);
  }
  // a drug invoice: one row per line as before (the discount is how he reads drugs), with the expiry's «رفض»
  function lineRow(r, l) {
    const flag = flagged(r, l), d = discOf(r, l), rej = rejected(r, l);
    const price = (d ? `${esc(String(d))}% · ` : '') + (l.exp ? esc(expiryText(l.exp)) : 'من غير صلاحية');
    const ni = niHtml(r, l);
    return `<tr class="${flag ? 'rv-flag' : ''}${rej ? ' rv-rejd' : ''}"><td class="rv-ln">${esc(l.n)}</td><td>${esc(l.paper)}<small class="notr" dir="ltr">${esc(l.name || '')}${l.id ? ' · ' + esc(l.id) : ' · جديد'}</small>` +
      (l.info ? `<small class="rv-info notr">${esc(l.info)}</small>` : '') + (l.exp ? `<small class="rv-ex">${expHtml(r, l)}</small>` : '') + '</td>' +
      `<td class="rv-num" dir="ltr">${esc(l.qty)} × ${price}<br><b>${esc(money(l.total))}</b></td></tr>` +
      (ni ? `<tr class="rv-nirow"><td></td><td colspan="2">${ni}</td></tr>` : '');
  }
  // ---------- a NEW item's box photo (owner 2026-11-22: «اوبشن صوره ادخله بيها، يقوم جاي عامل الصنف منها» → «مراجعه الفواتير بس»; mockup mockups/new_item_photo_2026-11-22.jpg) ----------
  // A line that is not in PharmaFly yet gets «📷 صوّر العلبة». The photo goes to ar_item_reads (kind 'new_item', migration 202611221800); the laptop's Claude reads the box (name the pharmacy's way,
  // form, count, company, printed price, active ingredient) and the reading shows under the line. He keeps it («تمام») or types his own name (answers['N<line>'] = {v:'item', read, t}); approving
  // the invoice keeps the reading's name when he said nothing. The invoices conversation makes the PharmaFly card from it and marks the review with result.new_items [{n, code}]; the page then
  // sets the box photo as the new item's photo (AskerItemMedia.upload, his own session) and marks the reading «applied».
  let ni = {}, niPics = {}, niEdit = null, niTimer = null;
  const niKey = (r, l) => r.id + '|' + l.n;
  const niName = (r, l, s) => { const a = answersOf(r)['N' + l.n]; return (a && a.v === 'item' && a.t) || (s && s.result && s.result.name_en) || ''; };
  const niCodeOf = (r, l) => { const x = ((r.result && r.result.new_items) || []).find((y) => String(y.n) === String(l.n)); return x && Number(x.code) > 0 ? Number(x.code) : null; };
  function niHtml(r, l) {
    if (!l || l.id) return '';
    const s = ni[niKey(r, l)], wait = WAITING.includes(r.status), k = niKey(r, l);
    // the camera, and the phone's own photos next to it (owner 2026-11-23: «عايز كمان ادوس على الكاميرا ديت يفتح لي تحميل، ممكن احملها من الستور من عندي»):
    // the same input with no «capture», so the phone offers its gallery / files
    const pick = (label, camera) => `<label class="rv-ni-cam${camera ? '' : ' rv-ni-pick'}">${label}<input type="file" accept="image/*"${camera ? ' capture="environment"' : ' data-rv-pick'} hidden data-rv-cam="${esc(k)}"></label>`;
    // the camera stays after he approves, until the new card exists (2026-11-26, card 41: «مش لاقى مكان ادخل فيه صور الاصناف الجديده»).
    // «تمام» / «غيّر الاسم» (and taking a kept name back) write on the invoice row, which is his until the laptop starts it (RLS: ready / held / approved)
    const editable = wait || r.status === 'approved';
    const shoot = wait || (LAPTOP.includes(r.status) && !niCodeOf(r, l) && (editable || !answersOf(r)['N' + l.n]));
    const cam = (label) => shoot ? `<span class="rv-ni-two">${pick(label, true)}${pick('🖼 من الصور', false)}</span>` : '';
    if (!s) return shoot ? `<div class="rv-ni">${cam('📷 صوّر العلبة')}</div>` : '';
    if (s.status === 'sending' || s.status === 'pending' || s.status === 'reading') {
      return `<div class="rv-ni"><div class="rv-ni-wait">📷 ${s.status === 'sending' ? 'ببعت الصورة…' : 'الصورة وصلت… بيقرا العلبة'}${s.late ? ' (لو طوّل: اللاب ممكن يكون مقفول)' : ''}</div></div>`;
    }
    const res = s.result || {};
    if (s.status === 'failed' || !res.found) {
      return `<div class="rv-ni"><div class="rv-ni-wait bad">ما عرفتش أقرا العلبة${res.note ? ': <span class="notr">' + esc(res.note) + '</span>' : ''}</div>${cam('📷 صوّرها تاني')}</div>`;
    }
    const name = niName(r, l, s), mine = !!answersOf(r)['N' + l.n], pic = niPics[s.id];
    const meta = [res.form, Number(res.count) > 0 ? `العلبة فيها ${res.count}` : '', res.company, Number(res.price) > 0 ? `السعر على العلبة ${money(res.price)}` : 'السعر مش على العلبة']
      .filter(Boolean).map((x) => `<span class="notr">${esc(x)}</span>`).join(' · ');
    const code = niCodeOf(r, l) || s.card || null;
    const edit = niEdit === k && editable
      ? `<div class="rv-ni-edit"><input type="text" dir="ltr" maxlength="120" autocapitalize="characters" value="${esc(name)}" data-rv-niname="${esc(k)}" aria-label="اسم الصنف"><button type="button" class="rv-yes on" data-rv-nisave="${esc(k)}">احفظ</button></div>`
      : '';
    const btns = niEdit !== k && (editable || shoot)
      ? `<div class="rv-nb rv-ni-b">${editable ? `<button type="button" class="rv-yes${mine ? ' on' : ''}" data-rv-niok="${esc(k)}">تمام</button><button type="button" data-rv-niedit="${esc(k)}">غيّر الاسم</button>` : ''}${cam('📷 تاني')}</div>`
      : '';
    return `<div class="rv-ni"><div class="rv-ni-read">${pic ? `<img class="rv-ni-ph" alt="" src="${esc(pic)}">` : '<span class="rv-ni-ph">📷</span>'}<div class="rv-ni-m">` +
      `<b class="notr" dir="ltr">${esc(name)}</b><small>${meta}</small>` +
      (res.active ? `<small class="notr">💊 ${esc(res.active)}</small>` : '') + (res.note ? `<small class="rv-ni-note notr">${esc(res.note)}</small>` : '') +
      (code ? `<small class="rv-ni-done">اتعمل كارت <b dir="ltr">${esc(code)}</b> من الصورة${s.status === 'applied' ? ' · والصورة بقت صورة الصنف ✓' : ''}</small>` : '') +
      edit + btns + '</div></div></div>';
  }
  // the readings of the invoices shown (the newest per line; a photo taken again cancels the older one)
  async function loadNi(list) {
    const ids = list.filter((r) => linesOf(r).some((l) => l && !l.id)).map((r) => r.id);
    if (!ids.length) { ni = {}; return; }
    try {
      const { data, error } = await db().from('ar_item_reads').select('id,review_id,line_n,status,result,error,created_at').in('review_id', ids).eq('kind', 'new_item').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(200);
      if (error) return; // before the migration: no readings, the button still shows
      const next = {};
      const newest = (data || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      for (const x of newest) { const k = x.review_id + '|' + x.line_n; if (!next[k]) next[k] = x; }
      for (const k in ni) if (ni[k] && ni[k].status === 'sending' && !next[k]) next[k] = ni[k];
      for (const k in next) { const o = ni[k]; if (o && o.id === next[k].id && o.late) next[k].late = true; }
      ni = next;
      // the photos of the readings shown (once each)
      const need = Object.values(ni).filter((x) => x.id && !niPics[x.id] && (x.status === 'done' || x.status === 'applied')).map((x) => x.id).slice(0, 12);
      if (need.length) {
        const q = await db().from('ar_item_reads').select('id,img_b64').in('id', need);
        for (const x of (q && q.data) || []) if (x.img_b64) niPics[x.id] = 'data:image/jpeg;base64,' + x.img_b64;
      }
      await niApply(list);
    } catch (e) { /* the readings are a help: the invoice is shown without them */ }
  }
  // the one item whose PharmaFly name is exactly the name kept for a new line (two of that name, or none = nothing is guessed)
  async function niCardByName(name) {
    const t = String(name || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (t.length < 4) return null;
    const { data, error } = await db().from('ar_store_items').select('id,name').eq('name', t).limit(2);
    return !error && data && data.length === 1 && Number(data[0].id) > 0 ? Number(data[0].id) : null;
  }
  // after the invoice is entered: the box photo becomes the new card's photo (once). The card is the code the laptop wrote when it marked the invoice «entered»; when that was left out
  // (2026-11-23, card 28: the card was made and the box photo never reached it), the system finds it by its exact name, once the card has come from PharmaFly. A photo a person gave the
  // card meanwhile stays: the box photo never replaces it.
  async function niApply(list) {
    const M = root.AskerItemMedia;
    if (!M || !M.upload) return;
    for (const r of list) {
      if (r.status !== 'entered') continue;
      for (const l of linesOf(r)) {
        const s = l && !l.id && ni[niKey(r, l)];
        if (!s || s.status !== 'done' || !niPics[s.id] || s.uploading) continue;
        s.uploading = true;
        try {
          const code = niCodeOf(r, l) || (await niCardByName(niName(r, l, s)));
          if (!code) { s.uploading = false; continue; }
          if (!(M.photoState && M.photoState(code) === 'ok')) await M.upload(code, await niSmall(niPics[s.id], 800));
          await db().from('ar_item_reads').update({ status: 'applied' }).eq('id', s.id);
          s.status = 'applied';
          s.card = code;
        } catch (e) { s.uploading = false; }
      }
    }
  }
  const niFit = (w, h, max) => { const k = Math.min(1, max / Math.max(w, h)); return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }; };
  function niDraw(img, max, q) {
    const { w, h } = niFit(img.naturalWidth, img.naturalHeight, max);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    return cv.toDataURL('image/jpeg', q);
  }
  const niLoad = (src) => new Promise((ok, bad) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => bad(new Error('الملف ده مش صورة.')); img.src = src; });
  const niSmall = async (src, max) => niDraw(await niLoad(src), max, 0.85);
  // a reading still on its way: the screen asks again every few seconds (the laptop reads once a minute)
  function niWatch() {
    clearTimeout(niTimer);
    const busyOnes = Object.values(ni).filter((x) => x.status === 'sending' || x.status === 'pending' || x.status === 'reading');
    if (!busyOnes.length || !panelOn()) return;
    for (const x of busyOnes) if (x.created_at && Date.now() - Date.parse(x.created_at) > 120000) x.late = true;
    niTimer = setTimeout(() => load(false).then(niWatch), 4000);
  }
  async function niPhoto(input) {
    const [rid, n] = split(input.dataset.rvCam), file = input.files && input.files[0];
    input.value = '';
    const r = find(rid), l = r && linesOf(r).find((x) => String(x.n) === String(n));
    if (!file || !l) return;
    const k = niKey(r, l), prev = ni[k];
    ni[k] = { id: null, status: 'sending' }; openState[r.id] = true; niEdit = null; sig = signature(); draw();
    const url = URL.createObjectURL(file);
    try {
      const b64 = niDraw(await niLoad(url), 1300, 0.82).split(',')[1];
      const { data, error } = await db().from('ar_item_reads').insert({ kind: 'new_item', review_id: r.id, line_n: String(l.n), item_name: String(l.paper || l.name || '').slice(0, 250) || null, img_b64: b64 }).select('id');
      if (error) throw error;
      const id = data && data[0] && data[0].id;
      niPics[id] = 'data:image/jpeg;base64,' + b64;
      ni[k] = { id, status: 'pending', created_at: new Date().toISOString() };
      if (prev && prev.id) { try { await db().from('ar_item_reads').update({ status: 'cancelled' }).eq('id', prev.id); } catch (e) { /* the newest reading wins anyway */ } }
      if (answersOf(r)['N' + l.n]) await answer(r.id, 'N' + l.n, null); // a new photo: the name kept for the old one goes
      sig = signature(); draw(); niWatch();
    } catch (e) {
      ni[k] = prev; say('الصورة ما اتبعتتش: ' + (e.message || e), 'bad'); sig = signature(); draw();
    } finally { URL.revokeObjectURL(url); }
  }
  // his name for the new item (typed), or the reading's kept with «تمام»
  function niKeep(k, typed) {
    const [rid, n] = split(k), r = find(rid), l = r && linesOf(r).find((x) => String(x.n) === String(n)), s = r && l && ni[niKey(r, l)];
    if (!s || !s.id) return;
    const t = String(typed == null ? niName(r, l, s) : typed).replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 120);
    if (!t) { say('اكتب اسم الصنف', 'bad'); return; }
    niEdit = null;
    return answer(r.id, 'N' + l.n, { v: 'item', read: s.id, t });
  }
  // approving keeps the reading's name for every new line he did not answer (so the laptop sees it written)
  function niFill(r) {
    let next = null;
    for (const l of linesOf(r)) {
      const s = l && !l.id && ni[niKey(r, l)];
      if (!s || s.status !== 'done' || !s.result || !s.result.found || answersOf(r)['N' + l.n]) continue;
      next = next || { ...answersOf(r) };
      next['N' + l.n] = { v: 'item', read: s.id, t: String(s.result.name_en || '').toUpperCase().slice(0, 120) };
    }
    return next;
  }
  // ---------- «صور الأصناف»: the camera for an item with no photo; the internet photos side by side, a tap marks a wrong one, «تمام» keeps the rest for good ----------
  let picBad = {}, picOpen = {}, picBusy = {};
  const media = () => (root.AskerItemMedia && root.AskerItemMedia.photoState ? root.AskerItemMedia : null);
  const picsOf = (r) => { const M = media(); return M ? picNeeds(r, (id) => M.photoState(id), M.canConfirm()) : { none: [], net: [], n: 0 }; };
  // «📷 صور مطلوبة» (ar/photo-want.js, owner 2026-11-27): once its list is on the server, a tap on a wrong internet photo puts the item on that list (its camera is up there); before it, the camera stays in the card
  const wantList = () => (root.AskerPhotoWant && root.AskerPhotoWant.can() ? root.AskerPhotoWant : null);
  const wrongOf = (r, net) => { const W = wantList(); return W ? new Set(net.filter((x) => W.wanted(x.id)).map((x) => x.id)) : picBad[r.id] || new Set(); };
  function picRow(r, x, label) {
    const k = r.id + '|' + x.id;
    const pick = (text, camera) => `<label class="rv-pcam${camera ? '' : ' rv-ppick'}">${text}<input type="file" accept="image/*"${camera ? ' capture="environment"' : ''} hidden data-rv-pcam="${esc(k)}"></label>`;
    return `<div class="rv-pic-row"><b class="notr" dir="ltr">${esc(x.name)}</b>${picBusy[x.id] ? '<span class="rv-pic-wait">بحفظ الصورة…</span>' : `<span class="rv-ptwo">${pick(label, true)}${pick('🖼 من الصور', false)}</span>`}</div>`;
  }
  function picsHtml(r) {
    const p = picsOf(r);
    if (!p.n) return '';
    const M = media(), W = wantList(), bad = wrongOf(r, p.net), wrong = p.net.filter((x) => bad.has(x.id)), good = p.net.length - wrong.length;
    const head = [p.none.length ? `<bdi dir="ltr">${p.none.length}</bdi> <span>من غير صورة</span>` : '', p.net.length ? `<bdi dir="ltr">${p.net.length}</bdi> <span>صورتها من النت</span>` : ''].filter(Boolean).join(' · ');
    const open = r.id in picOpen ? picOpen[r.id] : true;
    let h = `<details class="rv-pics" data-rv-pics="${esc(r.id)}"${open ? ' open' : ''}><summary><span>📷 صور الأصناف</span><small>${head}</small></summary>`;
    h += p.none.map((x) => picRow(r, x, '📷 صوّر')).join('');
    if (p.net.length) {
      h += `<p class="rv-hint">${W ? 'صور النت: دوسة على الغلط تضيفها لقايمة «صور مطلوبة» اللي فوق. اللي تقول عليها تمام مش هيتسأل عليها تاني.' : 'صور النت: دوسة على الغلط تعلّمها «مش تمام» وتصوّرها. اللي تقول عليها تمام مش هيتسأل عليها تاني.'}</p><div class="rv-pic-grid">` +
        p.net.map((x) => `<button type="button" class="rv-pic-tile${bad.has(x.id) ? ' bad' : ''}" data-rv-pbad="${esc(r.id + '|' + x.id)}" aria-pressed="${bad.has(x.id)}"><img src="${esc(M.photoSrc(x.id) || '')}" alt="" loading="lazy"><small class="notr" dir="ltr">${esc(x.name)}</small>${bad.has(x.id) ? `<em>${W ? 'للصور ✓' : 'مش تمام'}</em>` : ''}</button>`).join('') + '</div>';
      h += W ? wrong.map((x) => `<p class="rv-pic-added">✓ <bdi class="notr" dir="ltr">${esc(x.name)}</bdi> <span>اتضافت لقايمة الصور فوق</span></p>`).join('') : wrong.map((x) => picRow(r, x, '📷 صوّرها')).join('');
      if (good > 0) h += `<button type="button" class="rv-pic-ok" data-rv-pok="${esc(r.id)}"><span>${wrong.length ? '✓ الباقي صوره تمام' : '✓ كلهم تمام'}</span> (<bdi dir="ltr">${good}</bdi>)</button>`;
    }
    return h + '</details>';
  }
  async function picPhoto(input) {
    const [rid, id] = split(input.dataset.rvPcam), file = input.files && input.files[0], M = media();
    input.value = '';
    if (!file || !M) return;
    picBusy[id] = true; sig = signature(); draw();
    const url = URL.createObjectURL(file);
    try {
      await M.upload(Number(id), niDraw(await niLoad(url), 800, 0.85));
      say('الصورة بقت صورة الصنف ✓', 'good');
    } catch (e) { say('الصورة ما اتحفظتش: ' + (e.message || e), 'bad'); }
    finally { URL.revokeObjectURL(url); delete picBusy[id]; sig = signature(); draw(); }
  }
  // a tap on an internet photo: wrong (or taken back)
  async function picWrong(rid, id) {
    const W = wantList(), r = find(rid);
    if (!r) return;
    if (!W) { const s = picBad[r.id] || (picBad[r.id] = new Set()); if (s.has(id)) s.delete(id); else s.add(id); sig = signature(); draw(); return; }
    if (busy) return;
    busy = true;
    const x = picsOf(r).net.find((y) => y.id === id);
    try { await W.toggle(id, x ? x.name : ''); }
    catch (e) { say('ما اتحفظش: ' + (e.message || e), 'bad'); }
    finally { busy = false; openState[r.id] = true; sig = signature(); draw(); }
  }
  async function picConfirm(rid) {
    const r = find(rid), M = media();
    if (!r || !M || busy) return;
    const net = picsOf(r).net, bad = wrongOf(r, net), ids = net.map((x) => x.id).filter((id) => !bad.has(id));
    busy = true;
    try { await M.confirm(ids); say('تمام ✓ مش هيتسأل عليهم تاني', 'good'); }
    catch (e) { say('ما اتحفظش: ' + (e.message || e), 'bad'); }
    finally { busy = false; sig = signature(); draw(); }
  }
  // the small line under an item: its last cost and how much it moved (or «new»), the quantity
  function moveHtml(l) {
    const parts = [];
    if (!l.id) parts.push('صنف جديد');
    else if (Number(l.prev) > 0) { const dv = Math.round((Number(l.net) - Number(l.prev)) * 100) / 100; parts.push(`آخر مرة ${esc(money(l.prev))} ← <i dir="ltr" class="${dv < 0 ? 'dn' : ''}">${dv > 0 ? '+' : dv < 0 ? '−' : ''}${esc(money(Math.abs(dv)))}</i>`); }
    else parts.push('أول مرة نشتريه');
    parts.push(`<span dir="ltr">×${esc(l.qty)}</span>`);
    return parts.join(' · ');
  }
  // a cosmetics invoice (his mockup): the lines that need his price as a list of boxes (name, the cost, the public price), Enter goes to the next; the rest folded «زي آخر مرة»
  function compactHtml(r) {
    const locked = !WAITING.includes(r.status), asks = askLines(r), other = linesOf(r).filter((l) => l.ask !== 'price');
    // a new item is never folded under «زي آخر مرة»: its own list, each with its box photo (card 41, 2026-11-26)
    const news = other.filter((l) => !l.id), rest = other.filter((l) => l.id);
    const sameRow = (l, extra) => `<div class="rv-sr${rejected(r, l) ? ' rv-rejd' : ''}${flagged(r, l) ? ' rv-flag' : ''}" data-line="${esc(l.n)}"><div class="rv-nm"><b class="notr">${esc(l.name || l.paper)}</b><small>${moveHtml(l)} · ${expHtml(r, l)}</small>${l.info ? `<small class="rv-info notr">${esc(l.info)}</small>` : ''}</div>` +
      `<div class="rv-cost" dir="ltr">${esc(money(l.net != null ? l.net : Number(l.total) / (Number(l.qty) || 1)))}</div><div class="rv-cost rv-pc" dir="ltr">${esc(l.card || l.price || l.pub || '')}</div>${extra || ''}</div>`;
    let h = '';
    if (asks.length) {
      const left = openPrices(r).length;
      h += `<h4 class="rv-ph4">محتاج سعرك <em>${left ? 'فاضل ' + esc(left) : 'خلصت ✓'}</em></h4>` +
        (locked ? '' : '<p class="rv-hint">التكلفة اتغيرت أكتر من جنيه عن آخر مرة، أو صنف جديد. الرقم الرمادي هو السعر المقترح بطريقتك: Enter يوافق عليه، أو اكتب سعر تاني ودوس Enter، والمؤشر ينزل على اللي بعده.</p>') +
        '<div class="rv-pg"><span>الصنف</span><span>التكلفة</span><span>الجمهور</span></div>' +
        asks.map((l) => {
          const p = priceOf(r, l), ch = changedPrice(r, l), rej = rejected(r, l), card = Number(l.card) > 0 ? Number(l.card) : null, sug = Number(l.sug) > 0 ? Number(l.sug) : null, hint = sug || card;
          return `<div class="rv-pr${flagged(r, l) ? ' rv-flag' : ''}${rej ? ' rv-rejd' : ''}" data-line="${esc(l.n)}"><div class="rv-nm"><b class="notr">${esc(l.name || l.paper)}</b>${l.id ? '' : '<span class="rv-new">جديد</span>'}` +
            `<small>${moveHtml(l)} · ${expHtml(r, l)}</small>${sug && sug !== card && !p ? `<small class="rv-sug">المقترح <b dir="ltr">${esc(sug)}</b>${card ? ` (الكارت <span dir="ltr">${esc(card)}</span>)` : ''}</small>` : ''}${l.info ? `<small class="rv-info notr">${esc(l.info)}</small>` : ''}</div>` +
            `<div class="rv-cost" dir="ltr">${esc(money(l.net))}</div>` +
            `<input class="rv-box${p ? ' done' : ''}" type="text" inputmode="decimal" dir="ltr" maxlength="12" enterkeyhint="next" data-rv-price="${esc(r.id)}|${esc(l.n)}" value="${p ? esc(String(p)) : ''}" placeholder="${hint ? esc(String(hint)) : 'سعره'}" aria-label="سعر الجمهور"${locked || rej ? ' disabled' : ''}>` +
            (ch && !rej ? `<div class="rv-chg">${card ? `الكارت هيتغير: <span dir="ltr">${esc(card)} ← ${esc(ch)}</span>` : `سعره: <span dir="ltr">${esc(ch)}</span>`}</div>` : '') + niHtml(r, l) + '</div>';
        }).join('');
    }
    if (news.length) h += `<h4 class="rv-ph4">أصناف جديدة (${esc(news.length)})</h4>` + news.map((l) => sameRow(l, niHtml(r, l))).join('');
    if (rest.length) {
      const near = rest.filter((l) => expKind(l.exp) || rejected(r, l) || flagged(r, l)).length;
      h += `<details class="rv-same"${near || !(asks.length || news.length) ? ' open' : ''}><summary>زي آخر مرة (${esc(rest.length)}) <span>${near ? `فيه ${esc(near)} صلاحية قريبة` : 'سعر الكارت فاضل زي ما هو'}</span></summary>` +
        rest.map((l) => sameRow(l)).join('') + '</details>';
    }
    return h;
  }
  function linesHtml(r) {
    const ls = linesOf(r), cap = 20, all = showAllLines[r.id] || ls.length <= cap + 1;
    const show = all ? ls : ls.filter((l, i) => i < 3 || flagged(r, l) || l.ask === 'price' || !l.id); // a new item is never folded away (its box photo)
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
    // one short row (his mockup): what I found, what I will do under it, «تمام» / «غيّر» at the side; «غيّر» opens the choices and a line for his own words
    return `<div class="rv-note${a ? ' done' : ''}" data-note="${esc(n.id)}"><div class="rv-nl"><p><b>${n.line != null ? 'سطر ' + esc(n.line) + ': ' : ''}</b><span class="notr">${esc(n.text)}</span>` +
      (n.mine ? `<small class="rv-mine">هعمل: <span class="notr">${esc(n.mine)}</span></small>` : '') + '</p>' +
      (locked ? '' : `<div class="rv-nb"><button type="button" class="rv-yes${a && a.v === 'ok' ? ' on' : ''}" data-rv-ok="${esc(r.id)}|${esc(n.id)}">تمام</button><button type="button" data-rv-chg="${esc(r.id)}|${esc(n.id)}">غيّر</button></div>`) + '</div>' +
      (locked ? '' : `<div class="rv-alt${a && a.v !== 'ok' ? ' on' : ''}" data-rv-box="${esc(r.id)}|${esc(n.id)}">${alts}<div class="vo-row"><input type="text" maxlength="200" placeholder="أو اكتب اللي عايزه…" value="${a && a.v === 'text' ? esc(a.t) : ''}" data-rv-text="${esc(r.id)}|${esc(n.id)}">${voice(`[data-rv-text="${r.id}|${n.id}"]`, 'قول اللي عايزه')}</div></div>`) +
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
      const open = needs(r), ok = canApprove(r);
      return `<label class="rv-lbl" for="rvNote${esc(r.id)}">ملاحظتك على الفاتورة دي (اختياري)</label>` +
        `<div class="vo-row"><textarea id="rvNote${esc(r.id)}" maxlength="1000" placeholder="اكتب أي حاجة عايزني أعملها فيها…" data-rv-own="${esc(r.id)}">${esc(r.owner_note || '')}</textarea>${voice(`#rvNote${r.id}`, 'قول ملاحظتك')}</div>` +
        `<button type="button" class="rv-go" data-rv-approve="${esc(r.id)}"${ok ? '' : ' disabled'}>✅ وافق ودخّلها</button>` +
        `<div class="hint rv-h">${ok ? 'اضغط الزرار أو Enter' : `كمّل ${open} حاجة الأول وبعدين الزرار يشتغل`}</div>` +
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
    const pn = picsOf(r).n;
    return `<div class="rv-card${open ? ' open' : ''}" data-rv="${esc(r.id)}"><div class="rv-hd" role="button" tabindex="0" data-rv-toggle="${esc(r.id)}">` +
      `<span class="rv-ord">${r.ord == null ? '·' : esc(r.ord)}</span><span class="rv-t"><strong class="notr">${esc(r.supplier)} · ${esc(r.doc_no)}</strong><span dir="ltr">${esc(sub)}</span></span>${pn ? `<span class="rv-pic-n">📷 ${pn}</span>` : ''}${chipHtml(r)}</div>` +
      `<div class="rv-body">${photosHtml(r)}${compact(r) ? compactHtml(r) : linesHtml(r)}${checkHtml(r)}${picsHtml(r)}` +
      (notesOf(r).length ? `<h4>ملاحظات${WAITING.includes(r.status) ? ' (محتاجة رأيك)' : ''}</h4>${notesOf(r).map((n) => noteHtml(r, n)).join('')}` : '') +
      footHtml(r) + '</div></div>';
  }
  // the purchase robot's stops, at the top (the same box look as «🤖 الروبوت محتاج رأيك»); a tap on the words opens that invoice's card
  function stopCard(s) {
    const ref = buyRef(s), k = ref.kind, p = stopParts(s), a = answerKind(s), opts = stopOptions(s);
    const head = a ? ANSWER_HEAD[a] : BUY_HEAD[k];
    const who = p.who ? `<span class="${p.who.includes('مش شغال') ? 'rv-who-off' : 'rv-who'}">${esc(p.who)}</span>` : '';
    const tap = ref.card ? ` data-rv-stop="${esc(ref.card)}" role="button" tabindex="0"` : '';
    let h = `<div class="rb-card" data-rv-card="${esc(s.id)}"><div class="rb-title">${esc(head)}</div>` +
      `<div class="rv-sw"${tap}><div class="rb-details notr"><b>${esc(s.title)}</b>${p.why ? '\n' + esc(p.why) : ''}${who ? '\n' + who : ''}</div></div>`;
    if (p.safe && !a && k !== 'off') h += '<span class="rv-safe">✓ ما اتحفظش حاجة في فارمافلاي</span>';
    if (p.shot) h += `<button type="button" class="rv-snap" data-rv-snap="${esc(p.shot)}">${snaps[p.shot] ? `<img alt="" src="${esc(snaps[p.shot])}">` : ''}<span>شاشة فارمافلاي وقت الوقفة (دوسة تكبّرها)</span></button>`;
    if (a) {
      const said = s.answer_text ? s.answer_text : ((opts.find((o) => o.key === s.answer_key) || {}).label || '');
      h += `<div class="rv-answered">${said ? `<span>رديت:</span> <b class="notr">«${esc(said)}»</b> ✓<br>` : ''}${esc(ANSWER_NEXT[a])}</div>`;
    } else if (opts.length) {
      h += `<div class="rv-opts">${opts.map((o, i) => `<button type="button" class="rv-opt${i === 0 ? ' rv-opt-main' : ''}" data-rv-answer="${esc(s.id)}|${esc(o.key)}"><b class="notr">${esc(o.label)}</b>${OPT_HELP[o.key] ? `<small>${esc(OPT_HELP[o.key])}</small>` : ''}</button>`).join('')}</div>`;
      if (k !== 'off') h += `<div class="rb-own"><input type="text" maxlength="1000" autocomplete="off" placeholder="أو اكتب له تعمل إيه…" aria-label="اكتب للروبوت" data-rv-say="${esc(s.id)}" />${voice(`[data-rv-say="${esc(s.id)}"]`, 'قول للروبوت يعمل إيه')}<button type="button" class="secondary" data-rv-send="${esc(s.id)}">ابعت</button></div>`;
    }
    return h + `<div class="rb-when">${esc(when(s.created_at))}</div></div>`;
  }
  function stopsHtml() {
    const list = buyStops(stops);
    if (!list.length) return '';
    return '<div class="rb-box rv-stops" id="rvStops">' + list.map(stopCard).join('') + '</div>';
  }
  async function answerStop(id, key, text) {
    if (busy || !db()) return;
    busy = true;
    try {
      const { data, error } = await db().rpc('ar_robot_answer', { p_id: Number(id), p_key: key || null, p_text: text || null });
      if (error) throw error;
      if (!data || !data.ok) { say((root.AskerRobotLib || { errText: () => 'ماتبعتش. جرّب تاني.' }).errText(data && data.error), 'bad'); await load(true); }
      else {
        stops = stops.map((x) => (String(x.id) === String(id) ? { ...x, status: 'answered', answer_key: key || null, answer_text: text || null } : x));
        sig = signature(); draw(); say('اتبعت للروبوت ✓', 'good');
      }
    } catch (e) { say('ماتبعتش. جرّب تاني.', 'bad'); }
    busy = false;
    if (root.AskerNotify && root.AskerNotify.tick) root.AskerNotify.tick();
  }
  // the screen of PharmaFly at the stop, full size (the same dark viewer as an invoice photo)
  function snapViewer(path) {
    if (!snaps[path]) return;
    shot && shot.remove();
    shot = document.createElement('div');
    shot.className = 'rv-shot';
    shot.innerHTML = `<div class="rv-shot-bar"><button type="button" data-rv-close>قفل</button></div><div class="rv-shot-img rv-snap-big"><img alt="" src="${esc(snaps[path])}"></div>`;
    shot.addEventListener('click', (e) => { if (e.target.closest('[data-rv-close]') || e.target === shot) { shot.remove(); shot = null; } });
    document.body.appendChild(shot);
  }
  async function loadSnaps(list) {
    for (const s of list) {
      const p = stopParts(s).shot;
      if (!p || snaps[p] || !db().storage) continue;
      // the bucket takes no image files: the laptop puts the jpg inside a JSON {type, b64} (Hub\purchase_entry\ROBOT_REPORT.ps1 Send-StopShot)
      try { const { data: blob, error } = await db().storage.from('asker-private').download(p); if (!error && blob) { const j = JSON.parse(await blob.text()); if (j && j.type === 'image/jpeg' && /^[A-Za-z0-9+/]+=*$/.test(j.b64 || '')) snaps[p] = 'data:image/jpeg;base64,' + j.b64; } } catch (e) { /* the card still says what happened */ }
    }
  }
  function draw() {
    const box = $('rvMain');
    if (!box) return;
    const s = sections(rows), sm = summary(rows);
    const head = (t, n) => `<h3 class="py-h">${t}${n ? ` <span class="rv-n">${esc(n)}</span>` : ''}</h3>`;
    const said = {};   // words he typed or said in a stop card stay when the box is drawn again
    box.querySelectorAll('[data-rv-say]').forEach((i) => { if (i.value) said[i.dataset.rvSay] = i.value; });
    let html = stopsHtml();
    if (!rows.length) html += '<p class="hint">مفيش فواتير متجهزة دلوقتي. أول ما تيجي فواتير جديدة هجهّزها وهتظهر هنا.</p>';
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
    box.querySelectorAll('[data-rv-say]').forEach((i) => { if (said[i.dataset.rvSay]) i.value = said[i.dataset.rvSay]; });
  }
  const signature = () => JSON.stringify([rows.map((r) => [r.id, r.status, r.owner_note, r.answers, r.notes, r.lines, r.result, r.ord, r.total]), stops.map((x) => [x.id, x.ref_id, x.title, x.details, x.status, x.answer_key, x.answer_text, (x.options || []).length]), Object.keys(snaps),
    Object.entries(ni).map(([k, x]) => [k, x.id, x.status, !!niPics[x.id], !!x.late]),
    rows.map((r) => { const p = picsOf(r), bad = wrongOf(r, p.net); return [p.none.map((x) => x.id), p.net.map((x) => x.id + ':' + (media() ? media().photoSrc(x.id) : '') + ':' + bad.has(x.id))]; }), !!wantList(), Object.keys(picBusy)]);
  // never redraw under his fingers (typing a note, choosing an answer), nor while he is speaking into a box
  const typingNow = () => !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#rvMain') && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) ||
    !!(root.AskerVoice && root.AskerVoice.listening());
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
      // an entered card that left the page but has a new line is looked at too: the server keeps it while its box photo waits for the item's card
      const late = (data || []).filter((r) => r.status === 'entered' && !next.includes(r) && linesOf(r).some((l) => l && !l.id));
      await loadNi(next.concat(late));
      // the purchase robot's open stops (the table is shared with the sales robot's questions: only «card:<id>:<kind>» ones are used; none = nothing shows)
      try {
        const { data: sd, error: se } = await db().from('ar_robot_reports').select('id,created_at,job,ref_id,title,details,status,options,answer_key,answer_text').in('status', ['open', 'answered']).order('created_at', { ascending: true }).limit(40);
        stops = se ? [] : buyStops(sd || []);
        await loadSnaps(stops);
      } catch (e) { stops = []; }
      const before = sig; rows = next; sig = signature();
      if (force || (sig !== before && !typingNow())) draw();
      say('');
      // the items with no photo go to «📷 صور مطلوبة» by themselves (not waited for: the invoices never wait for it)
      root.AskerPhotoWant?.noteReviews?.(next);
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
      const next = { ...answersOf(r) };
      if (a == null) delete next[nid]; else next[nid] = a; // null takes an answer back (a «رفض» pressed again)
      await patch(rid, { answers: next });
      openState[rid] = true; // the card he is answering stays open
      sig = signature(); draw();
    } catch (e) { say('الرد ماتحفظش: ' + (e.message || e), 'bad'); } finally { busy = false; }
  }
  const boxOf = (rid, n) => document.querySelector(`[data-rv-price="${CSS.escape(rid + '|' + n)}"]`);
  // after a price: the next empty box of the same invoice (then the first empty one above), else its approve button (Enter there approves)
  function focusAfter(rid, n) {
    const boxes = [...document.querySelectorAll(`[data-rv="${CSS.escape(String(rid))}"] [data-rv-price]:not([disabled])`)];
    const i = boxes.findIndex((b) => b.dataset.rvPrice === rid + '|' + n);
    const nx = boxes.slice(i + 1).find((b) => !b.value) || boxes.slice(0, Math.max(i, 0)).find((b) => !b.value);
    if (nx) { nx.focus(); return; }
    const ap = document.querySelector(`[data-rv-approve="${CSS.escape(String(rid))}"]`);
    if (ap && !ap.disabled) ap.focus();
  }
  // the public price he typed (or the card's, kept with Enter on the empty box) for an asked line: never below the paper's cost (the discount would be negative)
  async function setPrice(rid, n, v, move) {
    const r = find(rid), l = r && linesOf(r).find((x) => String(x.n) === String(n));
    if (!l) return;
    if (!validPrice(v, l.net)) { // the box goes back to what is saved and keeps the cursor
      say(`سعر الجمهور لازم يكون ${money(l.net)} أو أكتر (التكلفة)`, 'bad'); draw();
      const b = boxOf(rid, n); if (b) { b.focus(); b.select && b.select(); }
      return;
    }
    await answer(rid, 'L' + n, { v: 'price', t: String(v) });
    if (move) focusAfter(rid, n);
  }
  // Enter in a price box: his number, or (empty) the card's price kept; a new item has no card price: it needs his
  function priceEnter(t) {
    const [rid, n] = split(t.dataset.rvPrice), r = find(rid), l = r && linesOf(r).find((x) => String(x.n) === String(n));
    if (!l) return;
    const raw = t.value.trim();
    if (!raw) { const c = Number(l.sug) > 0 ? Number(l.sug) : Number(l.card); if (c > 0) return setPrice(rid, n, c, true); say('الصنف ده جديد: اكتب سعره', 'bad'); return; } // empty = the suggested price (his way, from the study), else the card's
    const v = parseNum(raw);
    if (!(v > 0)) { say('اكتب رقم', 'bad'); return; }
    return setPrice(rid, n, v, true);
  }
  async function approve(ids) {
    if (busy) return;
    busy = true;
    try {
      for (const id of ids) {
        const r = find(id);
        if (!r || !(WAITING.includes(r.status))) continue;
        const fill = niFill(r);
        await patch(id, fill ? { answers: fill, status: 'approved' } : { status: 'approved' });
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
    if ((el = g('data-rv-rej'))) { const [r, n] = split(el.dataset.rvRej), row = find(r), l = row && linesOf(row).find((x) => String(x.n) === n); return l ? answer(r, 'R' + n, rejected(row, l) ? null : { v: 'reject' }) : undefined; }
    if ((el = g('data-rv-all'))) { showAllLines[el.dataset.rvAll] = true; return draw(); }
    if ((el = g('data-rv-shot'))) { const [r, i] = split(el.dataset.rvShot); return viewer(r, Number(i)); }
    if ((el = g('data-rv-niok'))) return niKeep(el.dataset.rvNiok);
    if ((el = g('data-rv-pok'))) return picConfirm(el.dataset.rvPok);
    if ((el = g('data-rv-pbad'))) { const [r, id] = split(el.dataset.rvPbad); return picWrong(r, Number(id)); }
    if ((el = g('data-rv-niedit'))) { niEdit = el.dataset.rvNiedit; sig = signature(); draw(); const i = document.querySelector(`[data-rv-niname="${CSS.escape(niEdit)}"]`); if (i) { i.focus(); i.select(); } return; }
    if ((el = g('data-rv-nisave'))) { const i = document.querySelector(`[data-rv-niname="${CSS.escape(el.dataset.rvNisave)}"]`); return niKeep(el.dataset.rvNisave, i ? i.value : ''); }
    if ((el = g('data-rv-toggle'))) { const r = find(el.dataset.rvToggle); if (r) { openState[r.id] = !isOpen(r); el.closest('.rv-card').classList.toggle('open', openState[r.id]); } }
    if ((el = g('data-rv-answer'))) { const [id, k] = split(el.dataset.rvAnswer); return answerStop(id, k, ''); }
    if ((el = g('data-rv-send'))) { const i = document.querySelector(`[data-rv-say="${CSS.escape(el.dataset.rvSend)}"]`), v = i ? i.value.trim() : ''; if (!v) { say('اختار رد أو اكتب له تعمل إيه.', 'bad'); return; } return answerStop(el.dataset.rvSend, '', v.slice(0, 1000)); }
    if ((el = g('data-rv-snap'))) return snapViewer(el.dataset.rvSnap);
    // a stop of the purchase robot: its invoice's card opens and comes into view
    if ((el = g('data-rv-stop'))) { const r = find(el.dataset.rvStop); if (r) { openState[r.id] = true; sig = signature(); draw(); const c = document.querySelector(`[data-rv="${CSS.escape(String(r.id))}"]`); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start' }); } }
  }
  function onChange(e) {
    const t = e.target;
    if (t.matches('[data-rv-cam]')) return niPhoto(t);
    if (t.matches('[data-rv-pcam]')) return picPhoto(t);
    if (t.matches('[data-rv-alt]')) { const [r, n, k] = split(t.dataset.rvAlt); const row = find(r), note = row && notesOf(row).find((x) => x.id === n); const alt = note && (note.alts || []).find((x) => x.k === k); return answer(r, n, { v: 'alt', k, t: alt ? alt.t : '' }); }
    if (t.matches('[data-rv-price]')) { const [r, n] = split(t.dataset.rvPrice); const v = parseNum(t.value); return v > 0 ? setPrice(r, n, v) : undefined; }
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
  // when the screen opens: the cursor waits in the first empty price box (his «مكان للرقم متحفز»)
  function focusFirst() {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
    const b = document.querySelector('#rvMain .rv-card.open .rv-box:not([disabled]):not(.done)');
    if (b) b.focus();
  }
  function open() {
    if (!db()) return;
    load(true).then(() => { focusFirst(); niWatch(); });
    clearInterval(timer);
    timer = setInterval(() => { if (panelOn() && !document.hidden) load(false); }, 20000);
  }
  function close() { clearInterval(timer); timer = null; clearTimeout(niTimer); niTimer = null; shot && shot.remove(); shot = null; }
  const main = $('rvMain');
  // the photos' list or a fix arrived after the cards were drawn: they are drawn again (not under his fingers)
  const followPics = () => { if (panelOn() && rows.length) { const next = signature(); if (next !== sig && !typingNow()) { sig = next; draw(); } } };
  root.AskerItemMedia?.onChange?.(followPics);
  root.AskerPhotoWant?.onChange?.(followPics);
  // «صور الأصناف» folded or opened by him stays so while the card is drawn again («toggle» does not bubble: caught on the way down)
  $('rvMain')?.addEventListener('toggle', (e) => { const d = e.target; if (d.dataset && d.dataset.rvPics) picOpen[d.dataset.rvPics] = d.open; }, true);
  if (main) { main.addEventListener('click', onClick); main.addEventListener('change', onChange); main.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; if (e.target.matches('[data-rv-price]')) { e.preventDefault(); priceEnter(e.target); } else if (e.target.matches('[data-rv-niname]')) { e.preventDefault(); niKeep(e.target.dataset.rvNiname, e.target.value); } else if (e.target.matches('[data-rv-say]')) { e.preventDefault(); main.querySelector(`[data-rv-send="${CSS.escape(e.target.dataset.rvSay)}"]`)?.click(); } else if (e.target.matches('[data-rv-toggle]')) e.target.click(); }); }
  document.addEventListener('keydown', onKey);
  $('rvRefresh')?.addEventListener('click', () => load(true));
  // the badge / home row: how many invoices wait for his yes (asked by ar/notify.js with the other counts)
  async function count() {
    try {
      const { data, error } = await db().from('ar_invoice_reviews').select('id').eq('status', 'ready').limit(200);
      return error ? null : (data || []).length;
    } catch (e) { return null; }
  }
  root.AskerInvReview = { open, close, count, load: () => load(true), stops: () => stops };
})(typeof window === 'undefined' ? globalThis : window);
