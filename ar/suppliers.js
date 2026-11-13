/* «المخازن» tab (asker-nawaqes-arabic.html): review a warehouse price list matched to PharmaFly items.
   The laptop prepares a draft CSV (Hub\supplier_match\match_price_first.cjs: Arabic warehouse name → PharmaFly item by
   public price + name sound). Here the owner uploads it, accepts every «قوي» line at once, then checks the rest in a
   short list (owner's choice «ب», 2026-11-07). Accepted names are kept per warehouse (ar_supplier_aliases), so the next
   list from the same warehouse is matched at once. Every list keeps its date, so the discounts build a history.
   Tables: ar_supplier_lists, ar_supplier_items, ar_supplier_aliases (migration 20261107194345, owner-only RLS). */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/suppliers.cjs) ----------
  // Same idea as the matcher's normalize: one spelling per name, so a name read again next month finds its alias.
  function normName(s) {
    return String(s ?? '')
      .normalize('NFKC')
      .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
      .replace(/٫/g, '.')
      .replace(/[یى]/g, 'ي')
      .replace(/ک/g, 'ك')
      .replace(/[ھة]/g, 'ه')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ً-ٰٟـ‎‏]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    const t = String(text ?? '').replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === '"') {
          if (t[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
    return rows.filter((r) => r.length > 1 || (r[0] ?? '').trim());
  }
  // «AMG_2026-04-05_v2_price_first_draft.csv» → { supplier: 'AMG', list_date: '2026-04-05' }
  function metaFromFileName(name) {
    const m = /^([A-Za-z0-9]+)[_-](\d{4}-\d{2}-\d{2})/.exec(String(name ?? ''));
    return m ? { supplier: m[1].toUpperCase(), list_date: m[2] } : { supplier: '', list_date: '' };
  }
  const STATUSES = ['strong', 'good', 'weak', 'none'];
  // Draft CSV → rows for ar_supplier_items (without list_id). Unknown status counts as 'none'.
  function rowsFromDraft(text, meta) {
    const table = parseCsv(text);
    const head = (table.shift() || []).map((h) => h.trim());
    const col = (n) => head.indexOf(n);
    const need = ['supplier_name', 'supplier_price', 'discount_pct', 'status', 'item_id', 'pharmafly_name'];
    const missing = need.filter((n) => col(n) < 0);
    if (missing.length) throw new Error('الملف ناقص أعمدة: ' + missing.join(', '));
    const num = (v) => {
      const x = Number(String(v ?? '').trim());
      return String(v ?? '').trim() !== '' && Number.isFinite(x) ? x : null;
    };
    return table
      .map((r) => {
        const name = String(r[col('supplier_name')] ?? '').trim();
        const status = STATUSES.includes(r[col('status')]) ? r[col('status')] : 'none';
        const id = num(r[col('item_id')]);
        return {
          supplier: meta.supplier,
          list_date: meta.list_date,
          page: col('page') >= 0 ? num(r[col('page')]) : null,
          supplier_name: name,
          name_norm: normName(name),
          price: num(r[col('supplier_price')]),
          discount_pct: num(r[col('discount_pct')]),
          match_status: status,
          item_id: status === 'none' ? null : id,
          pharmafly_name: status === 'none' || id == null ? null : String(r[col('pharmafly_name')] ?? '').trim() || null,
          review: 'pending',
        };
      })
      .filter((x) => x.supplier_name);
  }
  // Search filter over every warehouse line (owner, 2026-11-07: lines we do not stock are a source too): the Arabic name
  // (normalized like name_norm) or the PharmaFly name. Characters that would break the filter are dropped; '' = no search.
  function searchFilter(q) {
    const clean = (s) => String(s ?? '').replace(/[,()*%"\\:]/g, ' ').replace(/\s+/g, ' ').trim();
    const ar = clean(normName(q)), en = clean(q);
    if (ar.length < 2 && en.length < 2) return '';
    return `name_norm.ilike."*${ar}*",pharmafly_name.ilike."*${en}*"`;
  }
  const api = { normName, parseCsv, metaFromFileName, rowsFromDraft, searchFilter };
  if (typeof module !== 'undefined') module.exports = api;
  root.AskerSuppliersLib = api;
  if (typeof document === 'undefined') return;

  // ---------- the tab ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const PAGE = 40;
  let lists = [], current = null, shown = 0, busy = false;

  function say(text, kind) {
    const el = $('spStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  async function count(listId, filter) {
    let q = db().from('ar_supplier_items').select('id', { count: 'exact', head: true }).eq('list_id', listId);
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { count: n, error } = await q;
    if (error) throw error;
    return n || 0;
  }
  async function loadLists() {
    const { data, error } = await db().from('ar_supplier_lists').select('id,supplier,list_date,rows_count,source_file').order('list_date', { ascending: false });
    if (error) throw error;
    lists = data || [];
    const sel = $('spList');
    // Arabic first, so the line reads right to left even with the English name and the date inside it
    sel.innerHTML = lists.map((l) => `<option value="${l.id}">قايمة ${esc(l.supplier)} بتاريخ ${esc(l.list_date)} (${l.rows_count ?? 0} سطر)</option>`).join('');
    $('spListBox').classList.toggle('hidden', !lists.length);
    $('spEmpty').classList.toggle('hidden', !!lists.length);
  }
  async function open() {
    if (!db()) return;
    try {
      await loadLists();
      if (lists.length) await draw(current && lists.some((l) => String(l.id) === String(current.id)) ? current.id : lists[0].id);
    } catch (e) {
      say('مقدرتش أجيب قوايم المخازن: ' + e.message, 'bad');
    }
  }
  async function draw(listId) {
    current = lists.find((l) => String(l.id) === String(listId)) || null;
    if (!current) return;
    $('spList').value = String(current.id);
    const id = current.id;
    const [strongP, goodP, weakP, noneP, acc, rej, notStocked] = await Promise.all([
      count(id, { match_status: 'strong', review: 'pending' }),
      count(id, { match_status: 'good', review: 'pending' }),
      count(id, { match_status: 'weak', review: 'pending' }),
      count(id, { match_status: 'none', review: 'pending' }),
      count(id, { review: 'accepted' }),
      count(id, { review: 'rejected' }),
      count(id, { review: 'not_stocked' }),
    ]);
    $('spStats').innerHTML =
      `<div class="stat"><strong>${acc}</strong>اتقبل</div>` +
      `<div class="stat"><strong>${goodP + weakP}</strong>محتاج مراجعة</div>` +
      `<div class="stat"><strong>${rej + notStocked}</strong>غلط أو مش عندنا</div>`;
    const bulk = $('spBulk');
    bulk.classList.toggle('hidden', strongP === 0);
    bulk.textContent = `اقبل الـ ${strongP} «قوي» مرة واحدة`;
    $('spNoneNote').textContent = noneP ? `فيه ${noneP} سطر من غير اقتراح (غالبًا مش عندنا أو السعر اتغيّر). مش محتاجين حاجة دلوقتي.` : '';
    $('spRows').innerHTML = '';
    shown = 0;
    await more();
  }
  function rowHtml(r) {
    const tag = r.match_status === 'good' ? '<span class="pill warn">كويس</span>' : '<span class="pill bad">ضعيف</span>';
    const meta = [r.price != null ? r.price + ' ج' : '', r.discount_pct != null ? 'خصم ' + r.discount_pct + '%' : ''].filter(Boolean).join(' · ');
    return (
      `<div class="item" data-sp-row="${r.id}">` +
      `<div>${tag} ${esc(r.supplier_name)}</div>` +
      `<div class="hint">${esc(meta)}</div>` +
      (r.pharmafly_name ? `<div class="en">${esc(r.pharmafly_name)}</div>` : '<div class="hint">مفيش اقتراح</div>') +
      '<div class="sp-actions">' +
      (r.item_id ? `<button type="button" class="small" data-sp-act="accepted">صح ✓</button> ` : '') +
      `<button type="button" class="small secondary" data-sp-act="rejected">غلط</button> ` +
      `<button type="button" class="small secondary" data-sp-act="not_stocked">مش عندنا</button>` +
      '</div></div>'
    );
  }
  async function more() {
    if (!current) return;
    const { data, error } = await db()
      .from('ar_supplier_items')
      .select('id,supplier,list_date,supplier_name,name_norm,price,discount_pct,match_status,item_id,pharmafly_name')
      .eq('list_id', current.id)
      .eq('review', 'pending')
      .in('match_status', ['good', 'weak'])
      .order('match_status', { ascending: true }) // 'good' before 'weak'
      .order('id', { ascending: true })
      .range(shown, shown + PAGE - 1);
    if (error) return say('مقدرتش أجيب السطور: ' + error.message, 'bad');
    const box = $('spRows');
    (data || []).forEach((r) => {
      box.insertAdjacentHTML('beforeend', rowHtml(r));
      box.lastElementChild._row = r;
    });
    shown += (data || []).length;
    $('spMore').classList.toggle('hidden', (data || []).length < PAGE);
    if (!shown) box.innerHTML = '<p class="hint">مفيش سطور محتاجة مراجعة.</p>';
  }
  // first_seen of the names this warehouse already has. A few names: ask for those names only. Many names: read the
  // warehouse's saved names page by page, because hundreds of Arabic names in one request make the address too long
  // and the server answers 400 (that is what stopped «اقبل القوي» on the first real list, 2026-11-07).
  async function firstSeen(supplier, names) {
    const out = new Map();
    if (names.length <= 20) {
      const { data, error } = await db().from('ar_supplier_aliases').select('name_norm,first_seen').eq('supplier', supplier).in('name_norm', names);
      if (error) throw error;
      (data || []).forEach((a) => out.set(a.name_norm, a.first_seen));
      return out;
    }
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db().from('ar_supplier_aliases').select('name_norm,first_seen').eq('supplier', supplier).range(from, from + 999);
      if (error) throw error;
      (data || []).forEach((a) => out.set(a.name_norm, a.first_seen));
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  // Keep the first date a name was seen; update the item and the last date.
  async function saveAliases(rows) {
    const withItem = rows.filter((r) => r.item_id && r.pharmafly_name);
    if (!withItem.length) return;
    const first = await firstSeen(withItem[0].supplier, [...new Set(withItem.map((r) => r.name_norm))]);
    for (let i = 0; i < withItem.length; i += 500) {
      const part = withItem.slice(i, i + 500);
      const seen = new Map();
      part.forEach((r) => seen.set(r.name_norm, { supplier: r.supplier, name_norm: r.name_norm, supplier_name: r.supplier_name, item_id: r.item_id, pharmafly_name: r.pharmafly_name, first_seen: first.get(r.name_norm) || r.list_date, last_seen: r.list_date }));
      const { error } = await db().from('ar_supplier_aliases').upsert([...seen.values()], { onConflict: 'supplier,name_norm' });
      if (error) throw error;
    }
  }
  async function setReview(r, review) {
    const { error } = await db().from('ar_supplier_items').update({ review, reviewed_at: new Date().toISOString() }).eq('id', r.id);
    if (error) throw error;
    if (review === 'accepted') await saveAliases([r]);
  }
  async function acceptStrong() {
    if (!current || busy) return;
    busy = true;
    $('spBulk').disabled = true;
    try {
      let total = 0;
      for (;;) {
        const { data, error } = await db()
          .from('ar_supplier_items')
          .select('id,supplier,list_date,supplier_name,name_norm,item_id,pharmafly_name')
          .eq('list_id', current.id)
          .eq('match_status', 'strong')
          .eq('review', 'pending')
          .or('item_id.not.is.null')
          .limit(200); // the ids go in the address of the update below, so keep the batch short
        if (error) throw error;
        if (!data || !data.length) break;
        await saveAliases(data);
        const { error: e2 } = await db().from('ar_supplier_items').update({ review: 'accepted', reviewed_at: new Date().toISOString() }).in('id', data.map((r) => r.id));
        if (e2) throw e2;
        total += data.length;
        say(`اتقبل ${total}…`);
      }
      say(`اتقبل ${total} سطر «قوي» واتحفظت أساميهم.`, 'good');
      await draw(current.id);
    } catch (e) {
      say('القبول وقف: ' + e.message + '. اللي اتقبل قبل الوقفة اتحفظ، ودوس تاني يكمّل الباقي.', 'bad');
    } finally {
      busy = false;
      $('spBulk').disabled = false;
      forget(); // lines changed (even if it stopped half way): the search reads them again
    }
  }
  async function upload() {
    const f = $('spFile').files && $('spFile').files[0];
    const supplier = $('spSupplier').value.trim().toUpperCase();
    const list_date = $('spDate').value;
    if (!f) return say('اختار ملف القايمة الأول.', 'bad');
    if (!supplier || !/^\d{4}-\d{2}-\d{2}$/.test(list_date)) return say('اكتب اسم المخزن المختصر وتاريخ القايمة.', 'bad');
    if (busy) return;
    busy = true;
    $('spUpload').disabled = true;
    try {
      const rows = rowsFromDraft(await f.text(), { supplier, list_date });
      if (!rows.length) throw new Error('الملف فاضي');
      const { data: dup, error: e0 } = await db().from('ar_supplier_lists').select('id').eq('supplier', supplier).eq('list_date', list_date);
      if (e0) throw e0;
      if (dup && dup.length) throw new Error(`قايمة ${supplier} بتاريخ ${list_date} اترفعت قبل كده`);
      // names this warehouse already has → accepted at once with the saved item
      const known = new Map();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db().from('ar_supplier_aliases').select('name_norm,item_id,pharmafly_name').eq('supplier', supplier).range(from, from + 999);
        if (error) throw error;
        (data || []).forEach((a) => known.set(a.name_norm, a));
        if (!data || data.length < 1000) break;
      }
      const now = new Date().toISOString();
      let auto = 0;
      rows.forEach((r) => {
        const a = known.get(r.name_norm);
        if (a) { r.item_id = a.item_id; r.pharmafly_name = a.pharmafly_name; r.review = 'accepted'; r.reviewed_at = now; auto++; }
      });
      const { error: e1 } = await db().from('ar_supplier_lists').insert({ supplier, list_date, source_file: f.name, rows_count: rows.length });
      if (e1) throw e1;
      const { data: list, error: e1b } = await db().from('ar_supplier_lists').select('id').eq('supplier', supplier).eq('list_date', list_date).single();
      if (e1b || !list) throw e1b || new Error('القايمة مااتسجّلتش');
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db().from('ar_supplier_items').insert(rows.slice(i, i + 500).map((r) => ({ ...r, list_id: list.id })));
        if (error) throw new Error(error.message + ` (اترفع ${i} سطر من ${rows.length}، القايمة ناقصة)`);
        say(`اترفع ${Math.min(i + 500, rows.length)} من ${rows.length}…`);
      }
      if (auto) await saveAliases(rows.filter((r) => r.review === 'accepted'));
      say(`اترفعت قايمة ${supplier} (${rows.length} سطر)` + (auto ? `، و${auto} اسم اتعرف لوحده من قوايم قبل كده.` : '.'), 'good');
      $('spFile').value = '';
      await loadLists();
      await draw(list.id);
    } catch (e) {
      say('الرفع وقف: ' + e.message, 'bad');
    } finally {
      busy = false;
      $('spUpload').disabled = false;
      forget(); // new lines (even a half list): the search reads them again
    }
  }

  // Search every warehouse line of every list, whether we stock the item or not (owner, 2026-11-07), the smart way
  // (owner, 2026-11-08, ar/fuzzy.js): letters in order with skips, sound-alike letters, closest first, then best discount.
  // All lines are read once (about 30,000 → a few seconds) and kept while the page is open; reviews made here update the
  // kept copy. The warehouse's own Arabic name counts most; our PharmaFly name counts a bit less, and only when the line
  // is accepted or suggested «قوي»/«كويس» (a «ضعيف» guess would bring wrong lines). If reading them all fails, the old
  // server search (part of the name, best discount first) still answers.
  const LINE_COLS = 'id,supplier,list_date,supplier_name,name_norm,price,discount_pct,item_id,pharmafly_name,review,match_status';
  let searchTimer = null, searchSeq = 0, allLines = null, allById = null, allLoading = null, allGen = 0;
  const fz = () => root.AskerFuzzy;
  const sure = (r) => !!r.item_id && (r.review === 'accepted' || (r.review === 'pending' && (r.match_status === 'strong' || r.match_status === 'good')));
  const prep = (r) => { r._h = [fz().fold(r.supplier_name), [sure(r) ? fz().fold(r.pharmafly_name) : '', 1]]; return r; };
  // the copy kept on this phone (ar/cache.js, owner 2026-11-13 «قوايم المخازن بتغيب على ما تحمّل»): the search uses it at
  // once; in the background the server's signature (how many lines, the newest line, the newest review) is checked and
  // the lines read again only when it changed
  const CACHE_KEY = 'sp-lines-v1';
  const kept = () => root.AskerCache;
  function forget() { allGen++; allLines = allById = null; kept() && kept().del(CACHE_KEY); } // after a new list or «اقبل القوي»: read again at the next search
  function patchKept(id, fields) { const r = allById && allById.get(id); if (r) prep(Object.assign(r, fields)); }
  // a server read with a time limit and one more try (ar/cache.js): a weak line never holds the search
  const limited = (build) => (kept() && kept().limited ? kept().limited(build, 30000) : build());
  async function readLines() {
    const page = (a, z, opts) => limited(() => db().from('ar_supplier_items').select(LINE_COLS, opts).order('id', { ascending: true }).range(a, z));
    const first = await page(0, 999, { count: 'exact' });
    if (first.error) throw first.error;
    const out = [...(first.data || [])];
    const size = out.length, total = first.count == null ? null : first.count; // the server may give less than 1000 a page
    if (size && (total == null ? size === 1000 : total > size)) {
      for (let from = size; total == null || from < total; from += size * 4) {
        const parts = await Promise.all([0, 1, 2, 3].map((k) => page(from + k * size, from + (k + 1) * size - 1)));
        let short = false;
        for (const p of parts) { if (p.error) throw p.error; out.push(...(p.data || [])); if ((p.data || []).length < size) short = true; }
        if (short) break;
      }
    }
    return out;
  }
  async function signature() {
    const t = () => db().from('ar_supplier_items');
    const [c, last, rev] = await Promise.all([
      limited(() => t().select('id', { count: 'exact', head: true })),
      limited(() => t().select('id').order('id', { ascending: false }).limit(1)),
      limited(() => t().select('reviewed_at').order('reviewed_at', { ascending: false, nullsFirst: false }).limit(1)),
    ]);
    if (c.error || last.error || rev.error) throw c.error || last.error || rev.error;
    return [c.count == null ? (c.data || []).length : c.count, ((last.data || [])[0] || {}).id || 0, ((rev.data || [])[0] || {}).reviewed_at || ''].join('|');
  }
  const plain = (rows) => rows.map((r) => { const o = {}; for (const k of LINE_COLS.split(',')) o[k] = r[k]; return o; });
  function use(out, gen) {
    out.sort((a, b) => (b.discount_pct ?? -1) - (a.discount_pct ?? -1)); // a tie in closeness: best discount first
    out.forEach(prep);
    if (gen !== allGen) return out; // lines changed while reading: use these once, read again next time
    allById = new Map(out.map((r) => [r.id, r]));
    return (allLines = out);
  }
  // the kept copy is old: read the lines again, keep them, and tell the search (event «asker-lines»)
  async function refresh(oldSig, gen) {
    try {
      const sig = await signature();
      if (sig === oldSig) return;
      const out = await readLines();
      kept() && kept().set(CACHE_KEY, { sig, at: Date.now(), rows: plain(out) });
      if (gen !== allGen) return;
      use(out, gen);
      root.dispatchEvent && root.dispatchEvent(new CustomEvent('asker-lines', { detail: allLines }));
    } catch (e) { /* the kept copy stays; checked again next time */ }
  }
  async function loadAll() {
    if (allLines) return allLines;
    if (!allLoading)
      allLoading = (async () => {
        const gen = allGen;
        const copy = kept() ? await kept().get(CACHE_KEY) : null;
        if (copy && Array.isArray(copy.rows) && copy.rows.length) {
          const out = use(copy.rows, gen);
          refresh(copy.sig, gen);
          return out;
        }
        // the signature alongside the reading, not before it
        const [sig, out] = await Promise.all([signature().catch(() => ''), readLines()]);
        if (sig && kept()) kept().set(CACHE_KEY, { sig, at: Date.now(), rows: plain(out) });
        return use(out, gen);
      })().finally(() => { allLoading = null; });
    return allLoading;
  }
  async function search(q) {
    const seq = ++searchSeq;
    const box = $('spFound'), note = $('spSearchNote');
    if (fz().words(q).join('').length < 2) { box.innerHTML = ''; note.classList.add('hidden'); return; }
    note.classList.remove('hidden');
    let rows;
    try {
      if (!allLines) note.textContent = 'بحمّل كل سطور المخازن مرة واحدة…';
      const all = await loadAll();
      if (seq !== searchSeq) return; // a newer search already started
      rows = fz().rank(q, all, (r) => r._h, 60);
      note.textContent = rows.length ? `${rows.length === 60 ? 'أقرب 60' : rows.length} سطر من ${all.length} في قوايم المخازن، الأقرب للي كتبته الأول` : 'مفيش حاجة قريبة من الاسم ده في قوايم المخازن.';
    } catch (e) {
      // reading every line failed: the old search on the server (part of the name, best discount first)
      const f = searchFilter(q);
      if (!f) { box.innerHTML = ''; note.classList.add('hidden'); return; }
      const { data, error } = await db().from('ar_supplier_items').select(LINE_COLS).or(f).order('discount_pct', { ascending: false }).limit(60);
      if (seq !== searchSeq) return;
      if (error) { note.textContent = 'البحث وقف: ' + error.message; return; }
      rows = data || [];
      note.textContent = rows.length ? `${rows.length === 60 ? 'أول 60' : rows.length} سطر من قوايم المخازن، الأعلى خصم الأول (البحث العادي، لأن تحميل كل السطور وقف: ${e.message})` : 'مفيش حاجة بالاسم ده في قوايم المخازن.';
    }
    box.innerHTML = '';
    rows.forEach((r) => {
      box.insertAdjacentHTML('beforeend', foundHtml(r));
      box.lastElementChild._row = r;
    });
  }
  // The same search from the box on top of every screen (owner 2026-11-10: «تخرجلى بحث المخازن تحت بحث الصيدليه فى واجهه
  // البوت»): results only, without the review buttons (those stay in «قوايم المخازن»).
  let topSeq = 0, topTimer = null;
  async function searchTop(q) {
    const seq = ++topSeq;
    const box = $('gwItems'), note = $('gwStatus');
    if (!box || fz().words(q).join('').length < 2) { if (box) box.innerHTML = ''; if (note) note.textContent = ''; return; }
    try {
      if (!allLines) note.textContent = 'بحمّل كل سطور المخازن مرة واحدة…';
      const all = await loadAll();
      if (seq !== topSeq) return;
      const rows = fz().rank(q, all, (r) => r._h, 30);
      note.textContent = rows.length ? `${rows.length === 30 ? 'أقرب 30' : rows.length} سطر من قوايم المخازن، الأقرب للي كتبته الأول` : 'مفيش حاجة قريبة من الاسم ده في قوايم المخازن.';
      box.innerHTML = rows.map((r) => foundHtml(r, true)).join('');
    } catch (e) {
      if (seq === topSeq) note.textContent = 'البحث وقف: ' + e.message;
    }
  }
  function drawTopBox() {
    const inp = $('gwQ');
    if (!inp) return;
    const on = inp.value.trim().length >= 2;
    $('gwClear')?.classList.toggle('hidden', !inp.value);
    $('gwOut')?.classList.toggle('hidden', !on);
    $('app')?.classList.toggle('searching', on || ($('gsQ') ? $('gsQ').value.trim().length >= 2 : false));
    clearTimeout(topTimer);
    if (!on) { $('gwItems').innerHTML = ''; $('gwStatus').textContent = ''; topSeq++; return; }
    topTimer = setTimeout(() => searchTop(inp.value), 350);
  }
  // One search result. Accepted lines get «غلط، رجّعه» (owner, 2026-11-07: «اقبل القوي» can let a wrong cosmetic through);
  // pending suggestions get «صح» / «غلط» like the review list. plain = no buttons (the search on top of the screen).
  function foundHtml(r, plain) {
    const pf =
      r.review === 'accepted' && r.pharmafly_name
        ? `<div class="en">${esc(r.pharmafly_name)}</div>`
        : r.pharmafly_name && r.review === 'pending' && r.match_status !== 'none'
          ? `<div class="hint">غالبًا: <span class="en">${esc(r.pharmafly_name)}</span></div>`
          : '<div class="hint">مش متطابق مع صنف عندنا</div>';
    const meta = [r.supplier, r.list_date, r.price != null ? r.price + ' ج' : '', r.discount_pct != null ? 'خصم ' + r.discount_pct + '%' : ''].filter(Boolean).join(' · ');
    let acts = '';
    if (plain) acts = '';
    else if (r.review === 'accepted' && r.item_id) acts = '<button type="button" class="small secondary" data-sp-found="undo">غلط، رجّعه</button>';
    else if (r.review === 'pending' && r.item_id && r.match_status !== 'none')
      acts = '<button type="button" class="small" data-sp-found="accepted">صح ✓</button> <button type="button" class="small secondary" data-sp-found="rejected">غلط</button>';
    return `<div class="item" data-sp-found-row="${r.id}"><div>${esc(r.supplier_name)}</div><div class="hint">${esc(meta)}</div>${pf}${acts ? '<div class="sp-actions">' + acts + '</div>' : ''}</div>`;
  }
  // Undo an accepted line: it becomes «غلط», and the warehouse forgets that name (only if it still points at this item),
  // so the next list from the same warehouse does not accept it again by itself.
  async function undoAccepted(r) {
    const { error } = await db().from('ar_supplier_items').update({ review: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', r.id).eq('review', 'accepted');
    if (error) throw error;
    const { error: e2 } = await db().from('ar_supplier_aliases').delete().eq('supplier', r.supplier).eq('name_norm', r.name_norm).eq('item_id', r.item_id);
    if (e2) throw e2;
  }

  function bind() {
    if (!$('suppliersPanel')) return;
    $('spSearch').oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => search($('spSearch').value).catch((e) => say('البحث وقف: ' + e.message, 'bad')), 350);
    };
    $('spFound').onclick = async (ev) => {
      const b = ev.target.closest('[data-sp-found]');
      if (!b) return;
      const item = b.closest('[data-sp-found-row]');
      const r = item && item._row;
      if (!r) return;
      b.disabled = true;
      try {
        const act = b.dataset.spFound;
        if (act === 'undo') { await undoAccepted(r); r.review = 'rejected'; }
        else { await setReview(r, act); r.review = act; }
        prep(r); // r is the kept copy itself: the next search sees the new review
        item.outerHTML = foundHtml(r);
        const fresh = $('spFound').querySelector(`[data-sp-found-row="${r.id}"]`);
        if (fresh) fresh._row = r;
        $('spSearchNote').textContent = act === 'undo' ? 'اترجع: السطر بقى «غلط»، والمخزن نسي الاسم ده.' : act === 'accepted' ? 'اتقبل واتحفظ الاسم.' : 'اتسجّل «غلط».';
        if (current) draw(current.id).catch(() => {});
      } catch (e) {
        b.disabled = false;
        $('spSearchNote').textContent = 'مااتسجّلش: ' + e.message;
      }
    };
    $('spList').onchange = () => draw($('spList').value).catch((e) => say(e.message, 'bad'));
    $('spBulk').onclick = acceptStrong;
    $('spMore').onclick = () => more();
    $('spUpload').onclick = upload;
    $('spFile').onchange = () => {
      const f = $('spFile').files && $('spFile').files[0];
      const m = metaFromFileName(f && f.name);
      if (m.supplier && !$('spSupplier').value) $('spSupplier').value = m.supplier;
      if (m.list_date && !$('spDate').value) $('spDate').value = m.list_date;
    };
    $('spRows').onclick = async (ev) => {
      const b = ev.target.closest('[data-sp-act]');
      if (!b) return;
      const item = b.closest('[data-sp-row]');
      const r = item && item._row;
      if (!r) return;
      b.disabled = true;
      try {
        await setReview(r, b.dataset.spAct);
        patchKept(r.id, { review: b.dataset.spAct });
        item.remove();
        say(b.dataset.spAct === 'accepted' ? 'اتقبل واتحفظ الاسم.' : 'اتسجّل.', 'good');
      } catch (e) {
        b.disabled = false;
        say('مااتسجّلش: ' + e.message, 'bad');
      }
    };
  }
  // the warehouses' search on top of every screen
  function bindTop() {
    if (!$('gwQ')) return;
    $('gwQ').addEventListener('input', drawTopBox);
    $('gwClear')?.addEventListener('click', () => { $('gwQ').value = ''; drawTopBox(); $('gwQ').focus(); });
  }
  // «الرئيسية» (ar/home.js): every line of the warehouses' lists (read once, kept), and whether a line surely is that item
  root.AskerSuppliers = { open, lines: () => loadAll(), sure, gen: () => allGen };
  const start = () => { bind(); bindTop(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window === 'undefined' ? globalThis : window);
