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
  const api = { normName, parseCsv, metaFromFileName, rowsFromDraft };
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
  // Keep the first date a name was seen; update the item and the last date.
  async function saveAliases(rows) {
    const withItem = rows.filter((r) => r.item_id && r.pharmafly_name);
    for (let i = 0; i < withItem.length; i += 500) {
      const part = withItem.slice(i, i + 500);
      const supplier = part[0].supplier;
      const { data: old, error: e1 } = await db().from('ar_supplier_aliases').select('name_norm,first_seen').eq('supplier', supplier).in('name_norm', part.map((r) => r.name_norm));
      if (e1) throw e1;
      const first = new Map((old || []).map((a) => [a.name_norm, a.first_seen]));
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
          .limit(500);
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
    }
  }

  function bind() {
    if (!$('suppliersPanel')) return;
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
        item.remove();
        say(b.dataset.spAct === 'accepted' ? 'اتقبل واتحفظ الاسم.' : 'اتسجّل.', 'good');
      } catch (e) {
        b.disabled = false;
        say('مااتسجّلش: ' + e.message, 'bad');
      }
    };
  }
  root.AskerSuppliers = { open };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
