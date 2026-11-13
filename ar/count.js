/* «جرد المخزون» (owner 2026-11-13, «ا» on the design): by PharmaFly's own sections, or a random item by its sticker barcode;
   for every item the counter says «✓ مظبوط» or records the DIFFERENCE per expiry batch (and a wrong section). The bot never
   changes a balance: the owner applies the differences in PharmaFly later, on the balance of that time (owner: «انت مش
   هتظبط ارصدة … انت هتحدد الحالة بس»).
   - Data: asker-private/count/stock.json from the laptop (Hub\count\BUILD_COUNT.ps1, every update): main store batches and
     sections. Kept on the phone too, so a count goes on with no internet.
   - Entries: ar_count_entries (migration 202611130400), kept on the phone first and sent when the internet is there (the
     phone makes the id). Staff with «جرد المخزون» count too; their entries carry their names. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/count.cjs) ----------
  // PharmaFly's sections (Categories) in the owner's words; an unknown one keeps PharmaFly's own name
  const SEC_AR = {
    2: 'فيالات', 3: 'أقراص وكبسول', 8: 'شراب ومعلق', 13: 'أكياس وفوار', 15: 'لبوس', 19: 'غسول فم', 33: 'كريمات', 74: 'عناية بالشعر',
    84: 'نقط', 96: 'صابون طبي', 97: 'دش مهبلي', 98: 'عناية بالبشرة', 100: 'أغذية أطفال', 101: 'مشروبات أعشاب', 107: 'ورقيات',
    109: 'اكسسوارات', 122: 'التلاجة', 123: 'درج المستورد', 125: 'مطهرات', 126: 'المعمل', 128: 'محاليل', 129: 'امبولات',
    130: 'سكر دايت', 131: 'بروتين', 133: 'الفرط',
  };
  const secName = (id, raw) => SEC_AR[id] || String(raw || '').trim() || 'من غير قسم';
  const toUnits = (k, u, p) => Math.round((Number(k) || 0) * (Number(p) > 1 ? Number(p) : 1) + (Number(u) || 0));
  const word = (n, one, few) => (n >= 3 && n <= 10 ? few : one);
  // units -> «علبة» / «3 علب و1 وحدة» (no sign)
  function amountText(units, p) {
    const k = Number(p) > 1 ? Number(p) : 1, a = Math.abs(Math.round(units)), boxes = Math.floor(a / k), rest = a % k;
    const bits = [];
    if (boxes) bits.push(boxes === 1 ? 'علبة' : `${boxes} ${word(boxes, 'علبة', 'علب')}`);
    if (rest) bits.push(rest === 1 ? 'وحدة' : `${rest} ${word(rest, 'وحدة', 'وحدات')}`);
    return bits.join(' و') || '0';
  }
  const expText = (x) => { const m = String(x || '').match(/^(\d{4})-(\d{2})/); return m ? `${m[2]}/${m[1]}` : ''; };
  // one difference in words: «ناقص علبة من صلاحية 10/2027», «زايد علبة في صلاحية 12/2027»
  function diffLine(df, p) {
    const amt = amountText(df.d, p), e = expText(df.x);
    if (df.d < 0) return `ناقص ${amt}` + (e ? ` من صلاحية ${e}` : '');
    return `زايد ${amt}` + (e ? ` في صلاحية ${e}` : '');
  }
  // more found in one batch and less in another, same total: the dates are mixed up, the number is right
  function mixedDates(diffs) {
    const nz = (diffs || []).filter((d) => d.d);
    return nz.length >= 2 && nz.reduce((s, d) => s + d.d, 0) === 0;
  }
  // the row kept on the phone and sent to ar_count_entries. edits: {expiry or '-': units difference}; extra: [{x, d}]
  function entry({ id, at, item, edits, extra, sectionTo, note }) {
    const diffs = [];
    for (const b of item.b || []) { const d = Math.round((edits || {})[b.x || '-'] || 0); if (d) diffs.push({ x: b.x || null, d }); }
    for (const e of extra || []) { const d = Math.round(e.d || 0); if (d && !diffs.some((x) => x.x === (e.x || null))) diffs.push({ x: e.x || null, d }); }
    const moved = sectionTo != null && Number(sectionTo) !== Number(item.s) ? Number(sectionTo) : null;
    return {
      id, item_id: item.i, item_name: String(item.n || '').slice(0, 120), counted_at: at,
      result: diffs.length || moved != null ? 'diff' : 'ok', diffs: diffs.slice(0, 12), system: item.b || [], parts: item.p > 1 ? item.p : 1,
      section_from: item.s ?? null, section_to: moved, note: String(note || '').trim().slice(0, 300) || null, status: 'pending',
    };
  }
  // per section: how many items, how many counted (an item counts once, whatever entries it has)
  function progress(items, counted) {
    const m = new Map();
    for (const it of items) {
      const p = m.get(it.s) || { n: 0, done: 0 };
      p.n++; if (counted.has(it.i)) p.done++;
      m.set(it.s, p);
    }
    return m;
  }
  // the latest entry of every item (phone's first, then the server's), cancelled ones left out
  function latest(server, queued) {
    const m = new Map();
    for (const e of [...(server || []), ...(queued || [])]) {
      if (e.status === 'cancelled') continue;
      const o = m.get(e.item_id);
      if (!o || String(e.counted_at) >= String(o.counted_at)) m.set(e.item_id, e);
    }
    return m;
  }
  const api = { SEC_AR, secName, toUnits, amountText, expText, diffLine, mixedDates, entry, progress, latest };
  root.AskerCountLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the place ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const QKEY = 'asker-ct-queue', DKEY = 'asker-ct-data', DAYS = 30, PAGE = 80;
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (e) { return d; } };
  const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const staffNow = () => !!(root.AskerStaff && root.AskerStaff.isStaff());
  const isQueued = (e) => queue.some((q) => q.id === e.id);

  let data = null, items = [], byId = new Map(), sections = [], arName = new Map(), server = [], queue = load(QKEY, []);
  let view = 'sections', curSec = null, filter = 'todo', shown = PAGE, secQ = '', editId = null, edits = {}, extra = [], secTo = null, flushing = false, ready = false;

  function say(text, kind) { const el = $('ctStatus'); if (el) { el.textContent = text || ''; el.className = 'status' + (kind ? ' ' + kind : ''); } }
  const nameOf = (it) => arName.get(it.i) || it.n;

  // ---------- data ----------
  async function loadData() {
    try {
      const { data: blob, error } = await db().storage.from('asker-private').download('count/stock.json');
      if (error || !blob) throw error || new Error('no file');
      data = JSON.parse(await blob.text());
      keep(DKEY, data);
    } catch (e) {
      data = load(DKEY, null);
      if (!data) say('بيانات الجرد لسه ما وصلتش من اللاب. استنى التحديث الجاي.', 'bad');
    }
    items = data ? data.items || [] : [];
    byId = new Map(items.map((it) => [it.i, it]));
    sections = data ? data.sections || [] : [];
    try {
      const rows = root.AskerStock ? await root.AskerStock.ensure() : [];
      arName = new Map((rows || []).filter((r) => String(r.arabic_name || '').trim()).map((r) => [Number(r.item_id), String(r.arabic_name).trim()]));
    } catch (e) {}
    if (data && $('ctAge')) $('ctAge').textContent = `رصيد الجهاز حسب داتا ${String(data.data_at || '').replace('T', ' ').slice(0, 16)} · المخزن الرئيسي`;
  }
  async function loadEntries() {
    if (!db()) return;
    try {
      const since = new Date(Date.now() - DAYS * 864e5).toISOString(), out = [];
      for (let from = 0; from < 20000; from += 1000) {
        const { data: rows, error } = await db().from('ar_count_entries').select('id,item_id,item_name,counted_at,created_by,result,diffs,parts,section_from,section_to,note,status')
          .gte('counted_at', since).order('counted_at', { ascending: false }).range(from, from + 999);
        if (error) throw error;
        out.push(...(rows || []));
        if (!rows || rows.length < 1000) break;
      }
      server = out;
    } catch (e) {}
  }
  const lastOf = () => latest(server, queue);

  // ---------- saving: on the phone first, then the server ----------
  const newId = () => (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
  function save(item, rec) {
    queue = queue.filter((q) => q.id !== rec.id);
    queue.push(rec);
    keep(QKEY, queue);
    editId = null; edits = {}; extra = []; secTo = null;
    draw();
    flush();
  }
  async function flush() {
    if (flushing || !db() || !queue.length) return;
    flushing = true;
    try {
      for (const rec of [...queue]) {
        const { error } = await db().from('ar_count_entries').upsert(rec, { onConflict: 'id' });
        if (error) break;
        queue = queue.filter((q) => q.id !== rec.id);
        server = [rec, ...server.filter((s) => s.id !== rec.id)];
        keep(QKEY, queue);
      }
    } catch (e) {}
    flushing = false;
    say(queue.length ? `اتحفظ على الموبايل (${queue.length})، وهيتبعت أول ما النت يرجع` : '', queue.length ? 'ok' : '');
    draw();
  }
  // a correction keeps the same entry while it is still his and not applied; otherwise a new one
  function idFor(item) {
    const e = lastOf().get(item.i);
    if (!e || e.status !== 'pending') return newId();
    if (queue.some((q) => q.id === e.id) || !staffNow()) return e.id; // this phone's, or the owner (he may correct any)
    const my = root.AskerStaff && root.AskerStaff.myId ? root.AskerStaff.myId() : null;
    return my && e.created_by === my ? e.id : newId();
  }

  // ---------- an item ----------
  function sysLines(it) {
    const q = (b) => (root.AskerStockLib ? root.AskerStockLib.qtyText(b.k, b.u, it.p) : `${b.k}`);
    return (it.b || []).map((b) => ({ key: b.x || '-', x: b.x, text: `${b.x ? 'صلاحية ' + expText(b.x) : 'من غير صلاحية'} · الجهاز: ${q(b)}`, sys: toUnits(b.k, b.u, it.p) }));
  }
  function stepper(key, d, p, kind) {
    const k = p > 1 ? p : 1;
    const boxes = Math.trunc(d / k), rest = d - boxes * k;
    const v = kind === 'u' ? rest : boxes;
    return `<span class="ct-step" data-ct-key="${esc(key)}" data-ct-kind="${kind}"><button type="button" data-ct-dec aria-label="ناقص">−</button><b class="${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}">${v > 0 ? '+' + v : v}</b><button type="button" data-ct-inc aria-label="زايد">+</button>${p > 1 ? `<small>${kind === 'u' ? 'وحدة' : 'علبة'}</small>` : ''}</span>`;
  }
  function secOptions(cur) {
    return sections.map((s) => `<option value="${esc(s.i)}"${Number(s.i) === Number(cur) ? ' selected' : ''}>${esc(secName(s.i, s.n))}</option>`).join('');
  }
  const secLabel = (id) => secName(id, (sections.find((s) => Number(s.i) === Number(id)) || {}).n);
  const movedLine = (from, to) => `<div class="sec">القسم اتغير من ${esc(secLabel(from))} لـ ${esc(secLabel(to))}</div>`;
  // withSec (random count, then the section list too, owner 2026-11-13): the section PharmaFly has it in, as a list of
  // all the sections: picking another one opens the editor with «اتغير من كذا لكذا»
  function itemCard(it, withSec) {
    const e = lastOf().get(it.i), editing = editId === it.i, lines = sysLines(it);
    const who = e ? (e.created_by && root.AskerStaff && root.AskerStaff.nameOf(e.created_by)) || '' : '';
    const tag = !e ? '' : e.result === 'ok' ? '<span class="ct-tag ok">مظبوط</span>' : '<span class="ct-tag diff">فيه فرق</span>';
    let html = `<div class="ct-item${e ? (e.result === 'ok' ? ' ok' : ' diff') : ''}" data-ct="${esc(it.i)}">
      <div class="ct-h"><strong class="notr">${esc(nameOf(it))}</strong>${tag}</div>
      ${arName.get(it.i) ? `<div class="ct-en notr" dir="ltr">${esc(it.n)}</div>` : ''}
      <small class="hint">كود ${esc(it.i)}${e ? ` · اتجرد${who ? ' · ' + esc(who) : ''}${isQueued(e) ? ' · لسه ما اتبعتش' : ''}` : ''}</small>`;
    if (withSec && !editing) html += `<label class="ct-where">القسم: <select data-ct-move aria-label="القسم">${secOptions(e && e.section_to != null ? e.section_to : it.s)}</select></label>`;
    if (!editing) {
      html += lines.map((l) => `<div class="ct-b"><span>${esc(l.text)}</span></div>`).join('');
      if (e && e.result === 'diff') html += `<div class="ct-res">${(e.diffs || []).map((d) => `<div class="${d.d < 0 ? 'neg' : 'pos'}">${esc(diffLine(d, e.parts || it.p))}</div>`).join('')}${e.section_to != null ? movedLine(e.section_from != null ? e.section_from : it.s, e.section_to) : ''}</div>`;
      html += `<div class="ct-acts">${e ? '<button type="button" class="secondary" data-ct-edit>عدّل</button>' : '<button type="button" class="ct-okb" data-ct-ok>✓ مظبوط</button><button type="button" class="secondary" data-ct-edit>فيه فرق</button>'}</div>`;
    } else {
      html += lines.map((l) => `<div class="ct-b"><span>${esc(l.text)}</span><span class="ct-steps">${stepper(l.key, edits[l.key] || 0, it.p, 'k')}${it.p > 1 ? stepper(l.key, edits[l.key] || 0, it.p, 'u') : ''}</span></div>`).join('');
      html += extra.map((x, i) => `<div class="ct-b ct-new" data-ct-extra="${i}"><span><select data-ct-xm aria-label="الشهر">${Array.from({ length: 12 }, (_, m) => `<option${Number((x.x || '').slice(5)) === m + 1 ? ' selected' : ''}>${String(m + 1).padStart(2, '0')}</option>`).join('')}</select> / <select data-ct-xy aria-label="السنة">${Array.from({ length: 10 }, (_, k) => new Date().getFullYear() - 1 + k).map((y) => `<option${Number((x.x || '').slice(0, 4)) === y ? ' selected' : ''}>${y}</option>`).join('')}</select></span><span class="ct-steps">${stepper('+' + i, x.d || 0, it.p, 'k')}${it.p > 1 ? stepper('+' + i, x.d || 0, it.p, 'u') : ''}</span></div>`).join('');
      html += `<button type="button" class="linklike" data-ct-addx>+ صلاحية مش متسجّلة</button>
        <label class="ct-sec">القسم: <select data-ct-sec>${secOptions(secTo != null ? secTo : it.s)}</select></label>
        ${secTo != null && Number(secTo) !== Number(it.s) ? movedLine(it.s, secTo) : ''}
        <div class="ct-acts"><button type="button" data-ct-save>احفظ</button><button type="button" class="secondary" data-ct-cancel>إلغاء</button></div>`;
    }
    return html + '</div>';
  }

  // ---------- the screens ----------
  function drawSections() {
    const done = new Set([...lastOf().keys()]);
    const prog = progress(items, done);
    const secs = [...prog.keys()].sort((a, b) => prog.get(b).n - prog.get(a).n);
    $('ctSecList').innerHTML = items.length ? secs.map((s) => {
      const p = prog.get(s), pct = Math.round((100 * p.done) / Math.max(1, p.n));
      const raw = (sections.find((x) => Number(x.i) === Number(s)) || {}).n;
      return `<button type="button" class="ct-sec-row" data-ct-open="${esc(s)}"><span><b>${esc(secName(s, raw))}</b><small>${p.n} صنف · ${p.done ? (p.done === p.n ? 'اتجرد كله ✓' : `اتجرد ${p.done}`) : 'لسه'}</small></span><span class="ct-bar"><i style="width:${pct}%"></i></span></button>`;
    }).join('') : '';
  }
  function sectionItems() {
    const last = lastOf(), F = root.AskerFuzzy;
    let list = items.filter((it) => Number(it.s) === Number(curSec));
    if (filter === 'todo') list = list.filter((it) => !last.has(it.i));
    else if (filter === 'done') list = list.filter((it) => last.has(it.i));
    else if (filter === 'diff') list = list.filter((it) => last.has(it.i) && last.get(it.i).result === 'diff');
    if (secQ.length >= 2 && F) {
      const rows = list.map((it) => ({ ...it, arabic_name: arName.get(it.i) || '', name: it.n, item_id: it.i }));
      return F.rank(secQ, rows, (r) => [F.fold(r.arabic_name), F.fold(r.name), String(r.i)], 200).map((r) => byId.get(r.i));
    }
    return list.sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b)), 'ar'));
  }
  function drawSection() {
    const raw = (sections.find((x) => Number(x.i) === Number(curSec)) || {}).n;
    $('ctSecName').textContent = secName(curSec, raw);
    const all = items.filter((it) => Number(it.s) === Number(curSec)), last = lastOf();
    const n = { todo: all.filter((it) => !last.has(it.i)).length, done: all.filter((it) => last.has(it.i)).length, diff: all.filter((it) => last.has(it.i) && last.get(it.i).result === 'diff').length };
    $('ctFilters').innerHTML = [['todo', 'لسه'], ['done', 'اتجرد'], ['diff', 'فيه فرق']].map(([k, l]) => `<button type="button" class="chip${filter === k ? ' on' : ''}" data-ct-filter="${k}">${l} ${n[k]}</button>`).join('');
    const list = sectionItems();
    $('ctItems').innerHTML = list.slice(0, shown).map((it) => itemCard(it, true)).join('') +
      (list.length > shown ? `<button type="button" class="secondary ct-more" data-ct-more>اعرض ${Math.min(PAGE, list.length - shown)} كمان</button>` : '') +
      (!list.length ? `<p class="hint">${filter === 'todo' ? 'القسم ده اتجرد كله ✓' : 'مفيش أصناف هنا'}</p>` : '');
  }
  function drawRandom() {
    const q = $('ctQ').value.trim(), F = root.AskerFuzzy, box = $('ctHits');
    if (!q) { box.innerHTML = randomId && byId.get(randomId) ? itemCard(byId.get(randomId), true) : ''; return; }
    const code = root.AskerTempSaleLib ? root.AskerTempSaleLib.stickerCode(q) : Number(q) || null;
    let hits = [];
    if (code && byId.get(code)) hits = [byId.get(code)];
    else if (q.length >= 2 && F) {
      const rows = items.map((it) => ({ i: it.i, a: arName.get(it.i) || '', n: it.n }));
      hits = F.rank(q, rows, (r) => [F.fold(r.a), F.fold(r.n)], 8).map((r) => byId.get(r.i));
    }
    box.innerHTML = hits.map((it) => itemCard(it, true)).join('') || '<p class="hint">مفيش صنف عليه رصيد بالاسم أو الكود ده</p>';
  }
  function drawResults() {
    const last = lastOf(), me = staffNow();
    let rows = [...server.filter((e) => !queue.some((q) => q.id === e.id)), ...queue.map((q) => ({ ...q, queued: true }))]
      .filter((e) => e.result === 'diff' && e.status !== 'cancelled' && last.get(e.item_id) && last.get(e.item_id).id === e.id);
    if (me && root.AskerStaff && root.AskerStaff.myId) rows = rows.filter((e) => e.created_by === root.AskerStaff.myId());
    rows.sort((a, b) => (a.status === b.status ? String(b.counted_at).localeCompare(String(a.counted_at)) : a.status === 'pending' ? -1 : 1));
    const pend = rows.filter((e) => e.status === 'pending').length;
    $('ctResSum').textContent = rows.length ? `${pend} صنف فيهم فرق مستنيين يتطبقوا` : '';
    $('ctResRows').innerHTML = rows.map((e) => {
      const it = byId.get(e.item_id), name = it ? nameOf(it) : e.item_name, who = e.created_by && root.AskerStaff ? root.AskerStaff.nameOf(e.created_by) : '';
      return `<div class="ct-r${e.status === 'applied' ? ' done' : ''}" data-ct-entry="${esc(e.id)}">
        <div class="ct-h"><strong class="notr">${esc(name)}</strong><small class="hint">${who ? 'جرده ' + esc(who) : 'جردته انت'}${e.status === 'applied' ? ' · اتطبق' : ''}${e.queued ? ' · لسه ما اتبعتش' : ''}</small></div>
        ${(e.diffs || []).map((d) => `<div class="${d.d < 0 ? 'neg' : 'pos'}">${esc(diffLine(d, e.parts || 1))}</div>`).join('')}
        ${mixedDates(e.diffs) ? '<small class="hint">= التاريخ متلخبط، العدد نفسه مظبوط</small>' : ''}
        ${e.section_to != null ? movedLine(e.section_from, e.section_to) : ''}
        ${e.note ? `<small class="hint notr">${esc(e.note)}</small>` : ''}
        ${!me && e.status === 'pending' && !e.queued ? '<div class="ct-acts"><button type="button" data-ct-applied>اتطبق في فارمافلاي</button><button type="button" class="secondary" data-ct-drop>الغيه</button></div>' : ''}
      </div>`;
    }).join('') || '<p class="hint">مفيش فروق لسه.</p>';
    const b = $('ctResN');
    if (b) { b.textContent = pend ? String(pend) : ''; b.classList.toggle('hidden', !pend); }
  }
  function draw() {
    if (!$('countPanel')) return;
    $('ctSections').classList.toggle('hidden', view !== 'sections');
    $('ctSection').classList.toggle('hidden', view !== 'section');
    $('ctResults').classList.toggle('hidden', view !== 'results');
    document.querySelectorAll('[data-ct-view]').forEach((b) => b.classList.toggle('secondary', b.dataset.ctView !== (view === 'section' ? 'sections' : view)));
    if (view === 'sections') { drawSections(); drawRandom(); }
    if (view === 'section') drawSection();
    drawResults();
  }

  // ---------- the camera (random count): the sticker's barcode, read like the temp sale (3 reads for ITF) ----------
  let randomId = null, stream = null, timer = null, detector = null, busy = false, seen = '', streak = 0, seenAt = 0, canvas = null;
  async function startCam() {
    const L = root.AskerTempSaleLib;
    if (!('BarcodeDetector' in root) || !navigator.mediaDevices || !L) return say('الموبايل ده مش بيقرا الباركود من البوت. اكتب الاسم أو الكود.', 'bad');
    try {
      const all = await root.BarcodeDetector.getSupportedFormats();
      detector = new root.BarcodeDetector({ formats: all.filter((f) => /^(code_128|code_39|code_93|codabar|ean_13|ean_8|itf|upc_a|upc_e)$/.test(f)) });
      const cam = load('asker-ts-cam', '');
      const video = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      if (cam) video.deviceId = { exact: cam }; else video.facingMode = { ideal: 'environment' };
      try { stream = await navigator.mediaDevices.getUserMedia({ video, audio: false }); } catch (e) { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
      $('ctVideo').srcObject = stream;
      await $('ctVideo').play();
      $('ctCam').classList.remove('hidden');
      clearInterval(timer);
      timer = setInterval(tick, 250);
      say('وجّه الكاميرا على باركود الملصق');
    } catch (e) { stopCam(); say('الكاميرا ما اتفتحتش: ' + ((e && e.message) || e), 'bad'); }
  }
  async function tick() {
    if (busy || !detector || !stream) return;
    busy = true;
    try {
      const v = $('ctVideo'), L = root.AskerTempSaleLib, b = L.stripBox(v.videoWidth, v.videoHeight, 3.5);
      let src = v;
      if (b) { canvas = canvas || document.createElement('canvas'); canvas.width = b.sw; canvas.height = b.sh; canvas.getContext('2d').drawImage(v, b.sx, b.sy, b.sw, b.sh, 0, 0, b.sw, b.sh); src = canvas; }
      const found = await detector.detect(src);
      if (found && found.length) scanned(String(found[0].rawValue || ''), false, found[0].format);
    } catch (e) {}
    busy = false;
  }
  function scanned(raw, sure, format) {
    raw = String(raw || '').trim();
    const now = Date.now(), L = root.AskerTempSaleLib;
    if (!raw || !L) return;
    if (!sure) {
      if (raw === seen && now - seenAt < 1200) streak++; else { seen = raw; streak = 1; }
      seenAt = now;
      if (streak < (format === 'itf' ? 3 : 2)) return;
    }
    streak = 0;
    const r = L.stickerRead(raw), it = r && byId.get(r.code);
    if (!it) return;
    randomId = it.i;
    $('ctQ').value = '';
    if (navigator.vibrate) navigator.vibrate(60);
    stopCam();
    say('');
    drawRandom();
  }
  function stopCam() {
    clearInterval(timer); timer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    $('ctCam')?.classList.add('hidden');
  }

  // ---------- events ----------
  // the editor opens with the item's last difference (if any) already in it
  function startEdit(it) {
    const e2 = lastOf().get(it.i);
    editId = it.i; edits = {}; extra = []; secTo = null;
    if (e2 && e2.result === 'diff') {
      for (const d of e2.diffs || []) { if ((it.b || []).some((b) => (b.x || '-') === (d.x || '-'))) edits[d.x || '-'] = d.d; else extra.push({ x: d.x, d: d.d }); }
      if (e2.section_to != null) secTo = e2.section_to;
    }
  }
  function bind() {
    const panel = $('countPanel');
    if (!panel || panel.dataset.bound) return;
    panel.dataset.bound = '1';
    $('ctQ').addEventListener('input', () => { randomId = null; drawRandom(); });
    $('ctSecQ').addEventListener('input', () => { secQ = $('ctSecQ').value.trim(); shown = PAGE; drawSection(); });
    panel.addEventListener('change', (e) => {
      const t = e.target, card = t.closest('[data-ct]');
      if (!card) return;
      const it = byId.get(Number(card.dataset.ct));
      if (it && t.matches('[data-ct-move]')) { startEdit(it); secTo = Number(t.value); return draw(); }
      if (t.matches('[data-ct-sec]')) { secTo = Number(t.value); return draw(); }
      const row = t.closest('[data-ct-extra]');
      if (row) {
        const x = extra[Number(row.dataset.ctExtra)], m = row.querySelector('[data-ct-xm]').value, y = row.querySelector('[data-ct-xy]').value;
        if (x) x.x = `${y}-${m}`;
      }
    });
    panel.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t || !panel.contains(t)) return;
      if (t.dataset.ctView) { view = t.dataset.ctView; if (view !== 'sections') stopCam(); return draw(); }
      if (t.id === 'ctScanBtn') return stream ? stopCam() : startCam();
      if (t.dataset.ctOpen != null) { curSec = Number(t.dataset.ctOpen); view = 'section'; filter = 'todo'; shown = PAGE; secQ = ''; $('ctSecQ').value = ''; stopCam(); return draw(); }
      if (t.hasAttribute('data-ct-back')) { view = 'sections'; return draw(); }
      if (t.dataset.ctFilter) { filter = t.dataset.ctFilter; shown = PAGE; return drawSection(); }
      if (t.hasAttribute('data-ct-more')) { shown += PAGE; return drawSection(); }
      const card = t.closest('[data-ct]'), it = card ? byId.get(Number(card.dataset.ct)) : null;
      if (it && t.hasAttribute('data-ct-ok')) return save(it, entry({ id: idFor(it), at: new Date().toISOString(), item: it, edits: {}, extra: [], sectionTo: null }));
      if (it && t.hasAttribute('data-ct-edit')) { startEdit(it); return draw(); }
      if (it && t.hasAttribute('data-ct-cancel')) { editId = null; return draw(); }
      if (it && t.hasAttribute('data-ct-addx')) { const y = new Date().getFullYear() + 1; extra.push({ x: `${y}-01`, d: it.p > 1 ? it.p : 1 }); return draw(); }
      if (it && (t.hasAttribute('data-ct-inc') || t.hasAttribute('data-ct-dec'))) {
        const st = t.closest('[data-ct-key]'), key = st.dataset.ctKey, step = (st.dataset.ctKind === 'u' ? 1 : it.p > 1 ? it.p : 1) * (t.hasAttribute('data-ct-inc') ? 1 : -1);
        if (key.startsWith('+')) { const x = extra[Number(key.slice(1))]; if (x) x.d = Math.max(0, (x.d || 0) + step); } else edits[key] = (edits[key] || 0) + step;
        return draw();
      }
      if (it && t.hasAttribute('data-ct-save')) {
        const note = '';
        return save(it, entry({ id: idFor(it), at: new Date().toISOString(), item: it, edits, extra, sectionTo: secTo, note }));
      }
      const row = t.closest('[data-ct-entry]');
      if (row && (t.hasAttribute('data-ct-applied') || t.hasAttribute('data-ct-drop'))) return mark(row.dataset.ctEntry, t.hasAttribute('data-ct-applied') ? 'applied' : 'cancelled');
    });
    root.addEventListener('online', flush);
  }
  async function mark(id, status) {
    if (status === 'cancelled' && !root.confirm('تلغي الفرق ده؟ مش هيتطبق في فارمافلاي.')) return;
    const patch = status === 'applied' ? { status, applied_at: new Date().toISOString(), updated_at: new Date().toISOString() } : { status, updated_at: new Date().toISOString() };
    const { error } = await db().from('ar_count_entries').update(patch).eq('id', id);
    if (error) return say('ماتحفظش: ' + error.message, 'bad');
    const s = server.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
    draw();
  }
  async function open() {
    bind();
    if (!ready) {
      ready = true;
      say('بيحمّل الجرد…');
      await Promise.all([loadData(), loadEntries()]);
      if (items.length) say('');
    }
    draw();
    flush();
  }
  function close() { stopCam(); }
  root.AskerCount = { open, close, flush, scanned };
})(typeof window === 'undefined' ? globalThis : window);
