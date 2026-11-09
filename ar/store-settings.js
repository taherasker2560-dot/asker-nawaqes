/* «إعدادات الموقع» (inside the «طلبات» tab, asker-nawaqes-arabic.html): the owner edits the store site himself
   (owner's request 2026-11-09, Store\IMPROVEMENTS.md item 0): open/closed with a message, the home page title and line,
   the WhatsApp number customers see, hide one item, and type an item's Arabic name (wins over the dictionary and the
   suggestions; empty = back to automatic). Tables ar_store_settings / ar_store_items, RPC ar_store_owner_set_arabic
   (migration ar_store_improvements_1, owner only). */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/store-settings.cjs) ----------
  function cleanPhone(p) {
    let d = String(p || '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
    if (/^201\d{9}$/.test(d)) d = d.slice(1);
    return d === '' ? '' : /^01\d{9}$/.test(d) ? d : null;
  }
  // the row to save from the form values; null field = not set (the site keeps its built-in words)
  function settingsRow(v) {
    const t = (s, n) => { const x = String(s || '').trim().slice(0, n); return x || null; };
    const wa = cleanPhone(v.whatsapp);
    if (wa === null) return { error: 'رقم الواتساب لازم يكون 11 رقم ويبدأ بـ 01' };
    return { row: { is_open: !!v.is_open, closed_message: t(v.closed_message, 300), hero_title: t(v.hero_title, 120), hero_text: t(v.hero_text, 400), whatsapp: wa || null } };
  }
  const api = { cleanPhone, settingsRow };
  root.AskerStoreSettingsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the section ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let found = [];

  function say(id, text, kind) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  async function open() {
    if (!db() || !$('ssOpen')) return;
    const { data, error } = await db().from('ar_store_settings').select('is_open,closed_message,hero_title,hero_text,whatsapp').eq('id', 1).maybeSingle();
    if (error) return say('ssStatus', 'الإعدادات مش متاحة لسه: ' + error.message, 'bad');
    const s = data || { is_open: true };
    $('ssOpen').checked = s.is_open !== false;
    $('ssClosedMsg').value = s.closed_message || '';
    $('ssHeroTitle').value = s.hero_title || '';
    $('ssHeroText').value = s.hero_text || '';
    $('ssWhatsapp').value = s.whatsapp || '';
    say('ssStatus', '');
  }
  async function save() {
    const r = settingsRow({ is_open: $('ssOpen').checked, closed_message: $('ssClosedMsg').value, hero_title: $('ssHeroTitle').value, hero_text: $('ssHeroText').value, whatsapp: $('ssWhatsapp').value });
    if (r.error) return say('ssStatus', r.error, 'bad');
    $('ssSave').disabled = true;
    try {
      const { error } = await db().from('ar_store_settings').upsert({ id: 1, ...r.row, updated_at: new Date().toISOString() });
      if (error) throw error;
      say('ssStatus', r.row.is_open ? 'اتحفظت، والموقع مفتوح' : 'اتحفظت، والموقع مقفول دلوقتي', 'good');
    } catch (e) {
      say('ssStatus', 'ماتحفظتش: ' + e.message, 'bad');
    } finally {
      $('ssSave').disabled = false;
    }
  }
  function itemCard(it) {
    return `<div class="ss-item" data-item="${esc(it.id)}">
      <strong dir="ltr">${esc(it.name)}</strong>
      <span class="hint">${it.status === 'available' ? 'متوفر · ' + esc(it.price) + ' ج' : it.status === 'on_order' ? 'بالطلب' : 'غير متوفر'}${it.hidden ? ' · <b>مخفي من الموقع</b>' : ''}</span>
      <label class="ss-label" for="ar-${esc(it.id)}">الاسم العربي في الموقع</label>
      <div class="ss-row"><input id="ar-${esc(it.id)}" type="text" maxlength="250" value="${esc(it.arabic_name || '')}" placeholder="فاضي = تلقائي" />
        <button type="button" class="small" data-ar>احفظ الاسم</button></div>
      <button type="button" class="secondary small" data-hide="${it.hidden ? '0' : '1'}">${it.hidden ? 'أظهره في الموقع' : 'اخفيه من الموقع'}</button>
    </div>`;
  }
  async function search() {
    const q = $('ssQ').value.trim().replace(/[^0-9A-Za-zء-ي ]+/g, ' ').trim();
    if (q.length < 2) return say('ssItemStatus', 'اكتب حرفين على الأقل', 'bad');
    let req = db().from('ar_store_items').select('id,name,arabic_name,status,price,hidden');
    for (const w of q.split(/\s+/).filter((x) => x.length >= 2).slice(0, 5)) req = req.or(`name.ilike.*${w}*,arabic_name.ilike.*${w}*`);
    const { data, error } = await req.eq('is_listed', true).order('status').order('name').limit(15);
    if (error) return say('ssItemStatus', 'مقدرتش أدوّر: ' + error.message, 'bad');
    found = data || [];
    say('ssItemStatus', found.length ? '' : 'مفيش صنف بالاسم ده');
    $('ssItems').innerHTML = found.map(itemCard).join('');
  }
  async function setArabic(id, btn) {
    btn.disabled = true;
    try {
      const { data, error } = await db().rpc('ar_store_owner_set_arabic', { p_id: Number(id), p_arabic: $('ar-' + id).value });
      if (error) throw error;
      if (!data || !data.ok) throw new Error(data && data.error === 'too_short' ? 'الاسم قصير قوي' : 'الصنف مش موجود');
      $('ar-' + id).value = data.arabic_name || '';
      say('ssItemStatus', 'الاسم اتحفظ، وهيظهر في الموقع على طول', 'good');
    } catch (e) {
      say('ssItemStatus', 'ماتحفظش: ' + e.message, 'bad');
    } finally { btn.disabled = false; }
  }
  async function setHidden(id, hidden, btn) {
    btn.disabled = true;
    try {
      const { error } = await db().from('ar_store_items').update({ hidden }).eq('id', Number(id));
      if (error) throw error;
      const it = found.find((x) => String(x.id) === String(id));
      if (it) it.hidden = hidden;
      $('ssItems').innerHTML = found.map(itemCard).join('');
      say('ssItemStatus', hidden ? 'الصنف اتخفى من الموقع' : 'الصنف رجع يظهر في الموقع', 'good');
    } catch (e) {
      btn.disabled = false;
      say('ssItemStatus', 'ماتغيّرش: ' + e.message, 'bad');
    }
  }
  $('ssSave')?.addEventListener('click', save);
  $('ssSearch')?.addEventListener('click', search);
  $('ssQ')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
  $('ssItems')?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-item]');
    if (!card) return;
    const ar = e.target.closest('[data-ar]');
    if (ar) return setArabic(card.dataset.item, ar);
    const h = e.target.closest('[data-hide]');
    if (h) return setHidden(card.dataset.item, h.dataset.hide === '1', h);
  });
  root.AskerStoreSettings = { open };
})(typeof window === 'undefined' ? globalThis : window);
