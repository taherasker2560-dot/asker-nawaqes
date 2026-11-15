/* «النواقص ← أصناف جديدة» (owner 2026-11-15: «عايزك تعمل لي مكان في النواقص للأصناف الجديدة. هجيب الاسم بالانجليزي والسعر بشكل
   تقريبي وهحطهم لك في الخانه دي وتحفظهم عشان تدخلهم معانا في النواقص ترجمه … عشان لما يجي لك في خطوه ثاني يوم يبقى انت معاك الاسم
   الانجليزي»).
   A product that is not in PharmaFly yet: he types its English name, an approximate price and (if he wants) a note (the company);
   it is saved in ar_new_items (migration 202611152100) and translated with the shortages (the arabic-shortages function, the same
   table ar_names: «الترجمة» shows it too). He marks it «اتطلب» and «وصل»; the English name stays for when its invoice comes.
   It is NOT put in ar_shortages: the laptop's shortage sync replaces that list from PharmaFly and would switch it off.
   Owner only (the database refuses everyone else). Nothing here writes to PharmaFly. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/new-items.cjs) ----------
  // the same key as ar_names / ar_shortages: upper-case, single spaces, at most 250
  const key = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 250);
  const DIGITS = '٠١٢٣٤٥٦٧٨٩';
  // «٨٥٫٥» / «85,5» / «85.5 ج» → 85.5; nothing → null; not a number → NaN
  function parsePrice(s) {
    let t = String(s == null ? '' : s).trim();
    if (!t) return null;
    t = t.replace(/[٠-٩]/g, (d) => String(DIGITS.indexOf(d))).replace(/[٫,]/g, '.').replace(/[^\d.]/g, '');
    if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
    const n = Math.round(parseFloat(t) * 100) / 100;
    return n < 1000000 ? n : NaN;
  }
  const STATUS = { new: 'جديد', approved: 'في أمر الشراء', ordered: 'اتطلب', arrived: 'وصل', cancelled: 'اتلغى' };
  const isOpen = (x) => x.status === 'new' || x.status === 'approved' || x.status === 'ordered';
  // what the item IS, from its name (owner 2026-11-15: «تعرف تقسمه بقى إذا كان حبوب إذا كان كريم»): the first form word wins; '' = not known.
  // The order matters: «EYE DROPS» is drops, a shampoo is a shampoo even when it says «50 ML».
  const FORMS = [
    ['شامبو', /\b(SHAMPOO|SHMP)\b|شامبو/], ['لوشن', /\b(LOTION|LOT)\b|لوشن/], ['كريم', /\b(CREAM|CRM|CRE)\b|كريم/], ['جيل', /\b(GEL)\b|جل|جيل/],
    ['مرهم', /\b(OINT|OINTMENT)\b|مرهم/], ['نقط', /\b(DROPS?|EYE|EAR|NASAL)\b|نقط|قطرة|قطره/], ['حقن', /\b(INJ|INJECTION|AMP|AMPOULES?|VIAL|PEN)\b|حقن|امبول|أمبول/],
    ['لبوس', /\b(SUPP|SUPPOSITORY|SUPPOSITORIES)\b|لبوس/], ['سبراي', /\b(SPRAY|SPR)\b|سبراي|اسبراي/], ['شراب', /\b(SYRUP|SYP|SUSP|SUSPENSION|ELIXIR)\b|شراب|معلق/],
    ['فوار/أكياس', /\b(SACHETS?|SACH|EFF|EFFERVESCENT|POWDER|GRANULES?)\b|اكياس|أكياس|فوار|بودرة/], ['كبسول', /\b(CAP|CAPS|CAPSULES?)\b|كبسول|كبسولة/],
    ['حبوب', /\b(TAB|TABS|TABLETS?|CHEW|FILM)\b|حبوب|قرص|اقراص|أقراص/], ['لصقة', /\b(PATCH|PATCHES)\b|لصقة|لزق/], ['محلول', /\b(SOLUTION|SOL|LIQUID|MOUTHWASH)\b|محلول/],
    ['استنشاق', /\b(INHALER|NEB|NEBULES?|INHALATION)\b|استنشاق|بخاخ/],
  ];
  function formOf(name) {
    const s = ` ${String(name || '').toUpperCase().replace(/[^A-Z0-9؀-ۿ%./]+/g, ' ')} `;
    for (const [word, re] of FORMS) if (re.test(s)) return word;
    return '';
  }
  // the open ones, newest first; then the closed ones
  function split(items) {
    const list = Array.isArray(items) ? items : [];
    const byNew = (a, b) => String(b.created_at).localeCompare(String(a.created_at)) || Number(b.id) - Number(a.id);
    return { open: list.filter(isOpen).sort(byNew), closed: list.filter((x) => !isOpen(x)).sort(byNew) };
  }
  const api = { key, parsePrice, split, isOpen, formOf, STATUS };
  root.AskerNewItemsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the box ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let items = [], arabic = new Map(), loading = false, hidden = false, editing = null, translating = false;
  const money = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  function say(msg, bad) { const s = $('niStatus'); if (s) { s.textContent = msg || ''; s.className = 'status' + (bad ? ' bad' : msg ? ' good' : ''); } }

  function row(x) {
    const ar = arabic.get(x.name_key), a = ar && ar.arabic_name;
    const isEdit = editing === x.id;
    const arHtml = isEdit
      ? `<span class="ni-edit"><input type="text" dir="auto" value="${esc(a || '')}" data-ni-ar="${esc(x.id)}" aria-label="الاسم العربي" /><button type="button" class="small" data-ni-save="${esc(x.id)}">تمام</button></span>`
      : a ? `<span class="ni-ar notr" dir="auto">${esc(a)}</span>${ar.status === 'approved' ? '' : ' <small class="pill warn">ترجمة تلقائية</small>'}`
        : '<small class="hint">لسه ماتترجمش</small>';
    const price = x.price != null ? `<span class="ni-price">≈ ${esc(money(x.price))} ج</span>` : '';
    // new -> «موافق» (in the purchase order) -> «اتطلب» -> «وصل»; «رجّعه» goes one step back
    const set = (st, label, cls) => `<button type="button" class="small${cls ? ' ' + cls : ''}" data-ni-set="${st}:${esc(x.id)}">${label}</button>`;
    const acts = isOpen(x)
      ? `${x.status === 'new' ? set('approved', 'موافق', '') : ''}${x.status === 'approved' ? set('ordered', 'اتطلب', '') + set('new', 'رجّعه', 'secondary') : ''}${x.status === 'ordered' ? set('arrived', 'وصل', '') : ''}<button type="button" class="small secondary" data-ni-edit="${esc(x.id)}" aria-label="عدّل الاسم العربي">✏️</button>${set('cancelled', '✕', 'secondary').replace('>✕<', ' aria-label="شيل">✕<')}`
      : `<button type="button" class="small secondary" data-ni-set="new:${esc(x.id)}">رجّعه</button>`;
    const qty = Number(x.qty) > 1 ? `<span class="ni-qty">× ${esc(x.qty)}</span>` : '';
    const form = x.form ? `<span class="pill">${esc(x.form)}</span>` : '';
    const state = x.status === 'approved' ? ' <span class="pill good">في أمر الشراء</span>' : x.status === 'ordered' ? ' <span class="pill good">اتطلب</span>' : '';
    return `<div class="ni-row" data-ni="${esc(x.id)}"><div class="ni-main"><b class="ni-en notr" dir="ltr">${esc(x.name_en)}</b>${arHtml}` +
      `<small class="ni-meta">${form} ${qty} ${price}${state}${x.note ? ` <span class="notr" dir="auto">${esc(x.note)}</span>` : ''}</small></div><div class="ni-acts">${acts}</div></div>`;
  }
  function draw() {
    const box = $('niBox');
    if (!box) return;
    box.classList.toggle('hidden', hidden);
    if (hidden) return;
    const s = split(items);
    $('niCount').textContent = s.open.length ? String(s.open.length) : '';
    $('niList').innerHTML = s.open.length ? s.open.map(row).join('') : '<p class="hint">مفيش أصناف جديدة مستنية. اكتب اسم الصنف بالإنجليزي فوق.</p>';
    const old = $('niOld');
    old.classList.toggle('hidden', !s.closed.length);
    $('niOldCount').textContent = String(s.closed.length);
    $('niOldList').innerHTML = s.closed.map((x) => `${row(x)}<p class="ni-tag hint">${esc(STATUS[x.status] || '')}</p>`).join('');
    if (s.open.length && !box.dataset.touched) box.open = true;
  }
  const missing = (e) => /schema cache|does not exist|Could not find|relation|permission/i.test(String(e && (e.message || e)));
  async function loadArabic() {
    const keys = [...new Set(items.map((x) => x.name_key))];
    arabic = new Map();
    if (!keys.length) return;
    const { data, error } = await db().from('ar_names').select('name_key,arabic_name,status').in('name_key', keys);
    if (!error) (data || []).forEach((n) => arabic.set(n.name_key, n));
  }
  async function load() {
    if (loading || !db()) return;
    loading = true;
    try {
      const { data, error } = await db().from('ar_new_items').select('id,name_key,name_en,price,note,status,created_at,qty,form').order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      items = data || []; hidden = false;
      await loadArabic();
    } catch (e) {
      if (missing(e)) hidden = true; else say('مقدرتش أجيب الأصناف الجديدة: ' + (e && e.message), true);
    } finally { loading = false; draw(); }
  }
  // the translation of the names that have none yet (the function translates the new items with the shortages)
  async function translate() {
    if (translating || !root.AskerApp || !root.AskerApp.invoke) return;
    translating = true;
    try {
      await root.AskerApp.invoke({ action: 'translate', limit: 40 });
      await loadArabic();
    } catch (e) { say('الترجمة التلقائية وقفت: ' + (e && e.message) + '. تقدر تكتب الاسم العربي بإيدك (✏️).', true); }
    finally { translating = false; draw(); }
  }
  async function add() {
    const name = String($('niName').value || '').replace(/\s+/g, ' ').trim();
    const price = parsePrice($('niPrice').value), note = String($('niNote').value || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const qtyRaw = parsePrice($('niQty') ? $('niQty').value : ''), qty = qtyRaw == null ? null : Math.floor(qtyRaw);
    if (name.length < 2) { say('اكتب اسم الصنف بالإنجليزي.', true); return; }
    if (Number.isNaN(price)) { say('السعر لازم يبقى رقم (أو سيبه فاضي).', true); return; }
    if (Number.isNaN(qtyRaw) || (qty !== null && (qty < 1 || qty > 100000))) { say('الكمية لازم تبقى رقم من 1 فوق (أو سيبها فاضية).', true); return; }
    const k = key(name), have = items.find((x) => x.name_key === k);
    const btn = $('niAdd'); btn.disabled = true;
    try {
      let res;
      if (have) {
        const patch = { updated_at: new Date().toISOString() };
        if (price != null) patch.price = price;
        if (note) patch.note = note;
        if (qty !== null) patch.qty = qty;
        if (!have.form && formOf(name)) patch.form = formOf(name);
        if (!isOpen(have)) { patch.status = 'new'; patch.arrived_at = null; }
        res = await db().from('ar_new_items').update(patch).eq('id', have.id);
      } else {
        res = await db().from('ar_new_items').insert({ name_key: k, name_en: name.slice(0, 250), price, note: note || null, qty: qty === null ? 1 : qty, form: formOf(name) || null, status: 'new' });
      }
      if (res.error) throw res.error;
      say(have ? 'الصنف ده كان مسجل: حدّثت بياناته.' : 'اتحفظ. بيترجم…');
      ['niName', 'niPrice', 'niQty', 'niNote'].forEach((id) => { if ($(id)) $(id).value = ''; });
      await load();
      if (!arabic.get(k)) { await translate(); if (arabic.get(k)) say('اتحفظ واتترجم.'); }
      else say(have ? 'الصنف ده كان مسجل: حدّثت بياناته.' : 'اتحفظ.');
    } catch (e) { say('ماتحفظش: ' + (e && e.message), true); }
    btn.disabled = false;
  }
  async function setStatus(id, status) {
    const patch = { status, updated_at: new Date().toISOString() };
    if (status === 'arrived') patch.arrived_at = new Date().toISOString();
    if (status === 'new') { patch.arrived_at = null; patch.approved_at = null; }
    if (status === 'approved') patch.approved_at = new Date().toISOString();
    const { error } = await db().from('ar_new_items').update(patch).eq('id', isNaN(Number(id)) ? id : Number(id));
    if (error) { say('ماتعدّلش: ' + error.message, true); return; }
    await load();
  }
  async function saveArabic(id) {
    const x = items.find((i) => String(i.id) === String(id)), inp = document.querySelector(`[data-ni-ar="${CSS.escape(String(id))}"]`);
    const ar = String((inp && inp.value) || '').replace(/\s+/g, ' ').trim();
    if (!x || ar.length < 2) { editing = null; draw(); return; }
    const { error } = await db().from('ar_names').upsert({ name_key: x.name_key, english_name: x.name_en, arabic_name: ar, status: 'approved', updated_at: new Date().toISOString() }, { onConflict: 'name_key' });
    if (error) { say('ماتحفظش: ' + error.message, true); return; }
    arabic.set(x.name_key, { name_key: x.name_key, arabic_name: ar, status: 'approved' });
    editing = null; say('اتحفظ الاسم العربي.'); draw();
  }
  function bind() {
    const box = $('niBox');
    if (!box) return;
    box.addEventListener('toggle', () => { box.dataset.touched = '1'; });
    box.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('#niAdd')) return add();
      const s = t.closest('[data-ni-set]'); if (s) { const [st, id] = s.dataset.niSet.split(':'); return setStatus(id, st); }
      const ed = t.closest('[data-ni-edit]'); if (ed) { editing = Number(ed.dataset.niEdit) || ed.dataset.niEdit; draw(); const i = document.querySelector('[data-ni-ar]'); i && i.focus(); return; }
      const sv = t.closest('[data-ni-save]'); if (sv) return saveArabic(sv.dataset.niSave);
    });
    ['niName', 'niPrice', 'niQty', 'niNote'].forEach((id) => $(id) && $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }));
    // the count on the box is ready soon after the sign in
    setTimeout(() => { if (db() && !$('app')?.classList.contains('hidden')) load(); }, 3000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  root.AskerNewItems = { open: load, list: () => items };
})(typeof window === 'undefined' ? globalThis : window);
