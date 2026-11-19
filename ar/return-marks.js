/* «↩️ إرجاع» (owner 2026-11-19, on the «الصلاحيات ← فواتير» list: «اوبشن للارجاع في القايمة عشان الاوتوماتيك بعد كده، وبيان اشاركه واتس للمستخدمين عشان يجهزوه، أو اوبشن
   تنفيذ مرتجعات اشغله ليهم من التخصيص»).
   The owner marks a line of the short-dated list «return it to the supplier» (ar/short-dated.js calls mark / unmark). The marks are the view «مرتجعات» of «الصلاحيات»: a statement per
   supplier (the item, the quantity, the expiry, the supplier's invoice number and the day it was entered) that he copies or sends on WhatsApp, and a tick «اتجهّز» for the owner and for
   a staff member who has the switch «returns» (⚙️ ← الموظفين). When the return invoice «~<number>» reaches the vendors' table the database closes the mark (ar_return_sync).
   Everything goes through the functions of migration 202611191200; nothing here writes to PharmaFly or sends a message. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/return-marks.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const OPEN = ['marked', 'prepared'];
  const SD = () => root.AskerShortDatedLib || {};
  const keyOf = (move, item, x) => `${move}:${item}:${x || ''}`;
  // «8 علبة» / «2.5 علبة» / «3 وحدة»
  function boxesText(units, k) {
    const kk = num(k) > 0 ? num(k) : 1, packs = num(units) / kk;
    if (kk > 1 && packs < 1 && Math.abs(packs - Math.round(packs)) > 0.001) return `${Math.round(num(units) * 100) / 100} وحدة`;
    return `${Math.round(packs * 100) / 100} علبة`;
  }
  const expShort = (x) => (x ? (SD().expText ? SD().expText(x) : String(x).slice(0, 7)) : 'من غير صلاحية');
  const dayFull = (at) => (SD().fullDayText ? SD().fullDayText(at) : String(at || '').slice(0, 10));
  const invNo = (code) => (SD().invoiceNo ? SD().invoiceNo(code) : String(code || ''));
  // the open marks of ar_return_marks rows, grouped by supplier (by name), each supplier's lines shortest expiry first
  function groupByVendor(rows) {
    const by = new Map();
    for (const r of rows || []) {
      if (!OPEN.includes(r.status)) continue;
      const id = String(r.vendor_id);
      if (!by.has(id)) by.set(id, { vendor_id: r.vendor_id, vendor_name: r.vendor_name || '#' + r.vendor_id, rows: [] });
      by.get(id).rows.push(r);
    }
    const out = [...by.values()];
    for (const g of out) g.rows.sort((a, b) => String(a.expiry || '9999').localeCompare(String(b.expiry || '9999')) || String(a.item_name).localeCompare(String(b.item_name)));
    return out.sort((a, b) => String(a.vendor_name).localeCompare(String(b.vendor_name), 'ar'));
  }
  // the statement for one supplier: what the staff prepare, one line per lot, plain text for WhatsApp
  function statementText(g) {
    const lines = g.rows.map((r, i) => `${i + 1}) ${r.item_name}${r.item_ar ? ` (${r.item_ar})` : ''} | ${boxesText(r.units, r.k)} | صلاحية ${expShort(r.expiry)} | فاتورة ${invNo(r.code)} (اتدخلت ${dayFull(r.invoiced_at)})`);
    return [`مرتجعات للمورد ${g.vendor_name}:`, ...lines, `الإجمالي: ${g.rows.length} صنف`].join('\n');
  }
  const statementAll = (groups) => (groups || []).map(statementText).join('\n\n');
  const api = { OPEN, keyOf, boxesText, groupByVendor, statementText, statementAll };
  root.AskerReturnMarksLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the view «مرتجعات» (inside «الصلاحيات») and the calls the short-dated list makes ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const staffNow = () => !!(root.AskerStaff && root.AskerStaff.isStaff && root.AskerStaff.isStaff());
  const canMark = () => !staffNow();
  const canPrepare = () => !staffNow() || !!(root.AskerStaff.can && root.AskerStaff.can('returns'));
  let rows = [], loadedAt = 0, loading = false, failed = '', box = null, seq = 0, statementOf = '', note = '', waiting = null;
  const missing = (e) => /schema cache|does not exist|Could not find/i.test(String(e && (e.message || e)));
  const openRows = () => rows.filter((r) => OPEN.includes(r.status));
  function badge() {
    const el = document.getElementById('alReturnsN');
    if (!el) return;
    const n = openRows().length;
    el.textContent = n; el.classList.toggle('hidden', !n);
  }
  async function load() {
    if (!db()) return;
    const my = ++seq;
    loading = true; failed = ''; if (box) draw();
    try {
      // the owner's open page first closes the marks that a return invoice already covers (best effort: a failure here is not the list's failure)
      if (canMark()) { try { await db().rpc('ar_return_sync'); } catch (e) { /* the list below still reads */ } }
      const since = new Date(Date.now() - 14 * 864e5).toISOString();
      const { data, error } = await db().from('ar_return_marks').select('*').in('status', ['marked', 'prepared', 'returned']).order('marked_at', { ascending: false }).limit(500);
      if (error) throw error;
      if (my !== seq) return;
      rows = (data || []).filter((r) => r.status !== 'returned' || String(r.returned_at || '') >= since);
      loadedAt = Date.now();
    } catch (e) {
      if (my !== seq) return;
      rows = []; failed = missing(e) ? 'المرتجعات لسه مش متاحة على السيرفر.' : 'مقدرتش أجيب المرتجعات: ' + (e && e.message);
    } finally { if (my === seq) { loading = false; badge(); if (box) draw(); } }
  }
  // the short-dated list asks for the marks before it draws its lines
  function ensure() {
    if (!db() || !canMark()) return Promise.resolve();
    if (loading && waiting) return waiting;
    if (loadedAt && Date.now() - loadedAt < 60000) return Promise.resolve();
    waiting = load().finally(() => { waiting = null; });
    return waiting;
  }
  const markOf = (q) => openRows().find((r) => String(r.move_id) === String(q.move) && String(r.item_id) === String(q.item) && String(r.expiry || '') === String(q.x || '')) || null;
  async function call(fn, args) {
    const { data, error } = await db().rpc(fn, args);
    if (error) return { ok: false, error: error.message || String(error) };
    return data || { ok: false, error: 'empty' };
  }
  async function mark(q, units) {
    const res = await call('ar_return_mark', { p_move: q.move, p_item: q.item, p_x: q.x || null, p_units: units });
    if (res.ok) await load();
    return res;
  }
  async function unmark(id) {
    const res = await call('ar_return_unmark', { p_id: Number(id) });
    if (res.ok) await load();
    return res;
  }
  async function prepare(id, done) {
    const res = await call('ar_return_prepare', { p_id: Number(id), p_done: !!done });
    if (res.ok) await load();
    return res;
  }
  const errText = (e) => ({ move: 'الفاتورة مش موجودة عند السيستم.', line: 'الصنف ده مش على الفاتورة دي.', units: 'الكمية أكبر من اللي اشتريته أو صفر.', state: 'الصنف ده اتقفل قبل كده.', missing: 'الصنف ده مش موجود.' }[e] || 'ماحصلش: ' + e);

  // ---------- the view ----------
  function rowHtml(r) {
    const prepared = r.status === 'prepared';
    return `<div class="sd-row rm-row${prepared ? ' prepared' : ''}"><div class="sd-main"><span class="sd-name notr" dir="auto">${esc(r.item_ar || r.item_name)}</span>` +
      (r.item_ar ? `<small class="notr" dir="ltr">${esc(r.item_name)}</small>` : '') +
      `<small class="sd-doc"><span>فاتورة رقم</span> <bdi class="notr" dir="ltr">${esc(invNo(r.code))}</bdi> · <span>اتدخلت</span> <bdi class="notr" dir="ltr">${esc(dayFull(r.invoiced_at))}</bdi></small>` +
      `<div class="rm-ctl"><span class="rm-chip ${prepared ? 'prepared' : 'marked'}">${prepared ? `<span>✓ اتجهّز</span>${r.prepared_by ? ` · <bdi class="notr">${esc(r.prepared_by)}</bdi>` : ''}` : '<span>مطلوب إرجاعه</span>'}</span>` +
      (canPrepare() ? `<button type="button" class="secondary" data-rm-prep="${esc(r.id)}" data-done="${prepared ? '0' : '1'}">${prepared ? 'فكّ التجهيز' : '✓ اتجهّز'}</button>` : '') +
      (canMark() ? `<button type="button" class="secondary" data-rm-unmark="${esc(r.id)}">شيل العلامة</button>` : '') + '</div></div>' +
      `<div class="sd-exp"><b dir="ltr">${esc(expShort(r.expiry))}</b><small>${esc(boxesText(r.units, r.k))}</small>${num(r.returned_units) > 0 ? `<small>رجع منه ${esc(boxesText(r.returned_units, r.k))}</small>` : ''}</div></div>`;
  }
  function statementBox(text) {
    return `<div class="rm-statement"><textarea readonly dir="rtl" rows="${Math.min(14, text.split('\n').length + 1)}" data-rm-text>${esc(text)}</textarea>` +
      `<div class="rm-actions"><button type="button" data-rm-copy>📋 انسخ البيان</button>` +
      `<a class="btn secondary" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">💬 ابعته واتساب</a></div></div>`;
  }
  function draw() {
    if (!box) return;
    let body;
    const groups = groupByVendor(rows);
    if (failed) body = `<p class="status bad">${esc(failed)}</p>`;
    else if (loading && !loadedAt) body = '<p class="hint">بيجيب المرتجعات…</p>';
    else if (!groups.length) body = '<p class="hint">مفيش أصناف معلّم عليها إرجاع دلوقتي ✅</p>';
    else {
      const total = groups.reduce((s, g) => s + g.rows.length, 0);
      body = `<h3 class="al-h">مطلوب إرجاعه <b class="al-n">${total}</b></h3>` +
        (groups.length > 1 ? `<div class="rm-actions"><button type="button" class="secondary" data-rm-statement="all">📋 بيان كل الموردين</button></div>${statementOf === 'all' ? statementBox(statementAll(groups)) : ''}` : '') +
        groups.map((g) => `<section class="rm-group"><h3 class="al-h">${esc(g.vendor_name)} <b class="al-n">${g.rows.length}</b></h3>${g.rows.map(rowHtml).join('')}` +
          `<div class="rm-actions"><button type="button" class="secondary" data-rm-statement="${esc(g.vendor_id)}">📋 البيان</button></div>${String(statementOf) === String(g.vendor_id) ? statementBox(statementText(g)) : ''}</section>`).join('');
    }
    const done = rows.filter((r) => r.status === 'returned');
    const back = done.length ? `<details class="al-week"><summary>اترجعت (آخر 14 يوم): ${done.length} صنف</summary>${done.map((r) => `<div class="sd-row rm-row"><div class="sd-main"><span class="sd-name notr" dir="auto">${esc(r.item_ar || r.item_name)}</span><small><bdi class="notr">${esc(r.vendor_name || '')}</bdi> · <span>فاتورة رقم</span> <bdi class="notr" dir="ltr">${esc(invNo(r.code))}</bdi></small></div><div class="sd-exp"><b dir="ltr">${esc(expShort(r.expiry))}</b><small>${esc(boxesText(r.units, r.k))}</small></div></div>`).join('')}</details>` : '';
    box.innerHTML = '<p class="hint">الأصناف اللي علّمت عليها «إرجاع» من قايمة «فواتير». البيان بيتبعت للموظفين يجهزوا الأصناف، ولما المرتجع يتدخل في فارمافلاي الصنف بيتقفل لوحده.</p>' +
      (note ? `<p class="status bad">${esc(note)}</p>` : '') + body + back;
  }
  function show(el) {
    box = el;
    if (!box.dataset.rmBound) {
      box.dataset.rmBound = '1';
      box.addEventListener('click', async (e) => {
        const t = e.target, st = t.closest('[data-rm-statement]'), pr = t.closest('[data-rm-prep]'), un = t.closest('[data-rm-unmark]');
        if (st) { statementOf = String(statementOf) === st.dataset.rmStatement ? '' : st.dataset.rmStatement; draw(); return; }
        if (t.closest('[data-rm-copy]')) {
          const text = box.querySelector('[data-rm-text]')?.value || '';
          try { await navigator.clipboard.writeText(text); note = ''; } catch (err) { box.querySelector('[data-rm-text]')?.select(); note = 'انسخ النص من المربع.'; }
          if (note) draw(); else { t.closest('[data-rm-copy]').textContent = '✓ اتنسخ'; }
          return;
        }
        if (pr) { const r = await prepare(pr.dataset.rmPrep, pr.dataset.done === '1'); note = r.ok ? '' : errText(r.error); draw(); return; }
        if (un) { const r = await unmark(un.dataset.rmUnmark); note = r.ok ? '' : errText(r.error); draw(); }
      });
    }
    if (!loading && (!loadedAt || Date.now() - loadedAt > 60000)) load(); else draw();
  }
  root.AskerReturnMarks = { show, reload: load, ensure, canMark, markOf, mark, unmark, errText, openCount: () => openRows().length };
})(typeof window === 'undefined' ? globalThis : window);
