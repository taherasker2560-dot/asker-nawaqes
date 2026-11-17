/* «👨‍👩‍👧 أهل البيت» on the customer's account (owner 2026-11-18: «عميل الأجل يقدر يبعت الأبلكيشن لأهل بيته، ويقدر يتحكم فيه، يعني يخلي الحساب الإجمالي يظهر لهم أو يحذفه … بحيث ان هم يبقى معاهم نفس
   الإمكانيات بتاعة المستخدم الأساسي … لكن هم مش متحكمين في الحساب. اللي متحكم في الحساب صاحب الرقم، دول توابع ليه»).
   The owner of the account adds the people of his house from his own page: each one gets his own link (the same app: the account's invoices and regular items, ordering, his OWN dose alarm on his own phone,
   the messages page). Two switches per person, both decided by the owner only: «يشوف الحساب الإجمالي» (off: the server sends him no balance, no payments, no month sums) and «يطلب على حسابك» (off: his orders are cash).
   The server (migration 202611180200: ar_members_list / ar_member_add / ar_member_update / ar_member_remove) refuses every one of these calls from a house member's own link.
   Loaded before store/account.js, which draws the tile (only for the owner of the account) and tells this module the client and the link. */
(function (root) {
  'use strict';
  const MAX = 10;
  const TEXTS = {
    tile: '👨‍👩‍👧 أهل البيت',
    tileHint: 'ابعت التطبيق لأهلك وإنت اللي بتتحكم',
    count1: 'واحد من أهلك',
    count2: 'اتنين من أهلك',
    countN: '{n} من أهلك',
    title: 'أهل البيت',
    back: 'رجوع',
    hint: 'كل واحد من أهلك بياخد رابط لنفسه وتطبيق زي بتاعك: يطلب دواه، ويشوف أدويته، ويظبط منبه جرعاته لنفسه. إنت اللي بتتحكم، وتقدر تشيله في أي وقت.',
    empty: 'لسه ما ضفتش حد من أهلك.',
    addTitle: 'ضيف حد من أهلك',
    namePh: 'اسمه، مثلًا: ماما أو أحمد',
    showBal: 'يشوف الحساب الإجمالي',
    showBalOn: 'هيشوف عليك كام والدفعات وحساب الشهر.',
    showBalOff: 'مش هيشوف عليك كام ولا الدفعات، هيشوف الفواتير والأدوية بس.',
    onAcc: 'يطلب على حسابك',
    onAccOn: 'طلباته بتتحط على حسابك.',
    onAccOff: 'طلباته كاش عند الاستلام.',
    add: '➕ ضيفه',
    added: 'اتضاف. دوس «ابعت الرابط» عشان يوصله.',
    send: '📤 ابعت الرابط',
    copy: '📋 انسخ الرابط',
    copied: 'اتنسخ ✓',
    del: '🗑 شيله',
    delAsk: 'تشيل {n} من أهل البيت؟ رابطه هيقف فورًا.',
    notOpened: 'لسه ما فتحش الرابط',
    openedToday: 'فتح التطبيق النهارده',
    openedYesterday: 'فتح التطبيق امبارح',
    openedDays: 'فتح التطبيق من {d} يوم',
    needName: 'اكتب اسمه الأول.',
    max: 'وصلت للحد الأقصى (10). شيل حد عشان تضيف.',
    notOwner: 'التحكم في أهل البيت لصاحب الحساب بس.',
    down: 'ما قدرتش أنفّذ. اتأكد من النت وجرب تاني.',
  };
  // what goes to WhatsApp (never drawn on the page, so it is not translated)
  const SHARE = 'أهلاً يا {n}، ده تطبيق صيدلية عسكر. افتح الرابط ودوس «ثبّت التطبيق الآن» وهيبقى على موبايلك:\n{u}';

  // ---------- pure helpers (also used by tests/store-family.cjs) ----------
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m));
  const cleanName = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 40);
  // the link he sends: this page's own address with his secret (the secret rides in #me=, as the owner's own link does)
  const linkOf = (token, pageUrl) => new URL('store.html', String(pageUrl || '').replace(/[?#].*$/, '')).href + '#me=' + token;
  const shareText = (name, url) => fill(SHARE, { n: cleanName(name), u: url });
  const countText = (n) => (n === 1 ? TEXTS.count1 : n === 2 ? TEXTS.count2 : fill(TEXTS.countN, { n }));
  function seenText(iso, now) {
    const t = iso ? new Date(iso) : null;
    if (!t || isNaN(t)) return TEXTS.notOpened;
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const diff = Math.round((day(now) - day(t)) / 864e5);
    if (diff <= 0) return TEXTS.openedToday;
    if (diff === 1) return TEXTS.openedYesterday;
    return fill(TEXTS.openedDays, { d: diff });
  }
  const errText = (code) => (code === 'max' ? TEXTS.max : code === 'bad_name' ? TEXTS.needName : code === 'not_owner' ? TEXTS.notOwner : TEXTS.down);
  const api = { TEXTS, MAX, fill, cleanName, linkOf, shareText, countText, seenText, errText };
  root.AskerStoreFamilyLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const st = { client: null, token: null, owner: false, loaded: false, busy: false, members: [], max: MAX, view: false, draft: { name: '', show: false, acc: true }, error: '', note: '', copied: null, fresh: null };

  async function list() {
    if (!st.client || !st.token || !st.owner) return;
    try {
      const { data, error } = await st.client.rpc('ar_members_list', { p_token: st.token });
      if (error || !data || !data.ok) { st.loaded = false; return; }
      st.members = Array.isArray(data.members) ? data.members : []; st.max = data.max || MAX; st.loaded = true;
    } catch (e) { st.loaded = false; }
    redrawTile();
    if (st.view) draw();
  }
  // account.js: the client and the link, once the account is open (owner = the owner of the account, never a house member)
  function attach(client, token, owner, redraw) {
    if (st.token !== token) Object.assign(st, { members: [], loaded: false, view: false, error: '', note: '', fresh: null });
    Object.assign(st, { client, token, owner: !!owner, redraw: redraw || null });
    if (st.owner) list(); else { st.loaded = false; closeSheet(true); }
  }
  function forget() { Object.assign(st, { client: st.client, token: null, owner: false, loaded: false, members: [], view: false }); closeSheet(true); }

  // the tile: only for the owner of the account, and only when the server has the feature (the list came)
  function tileHtml() {
    if (!st.owner || !st.loaded) return '';
    const n = st.members.length;
    return `<button type="button" class="ac-reg-btn ac-fam-tile" data-fm-open><b>${esc(TEXTS.tile)}</b><small>${esc(n ? countText(n) : TEXTS.tileHint)}</small></button>`;
  }
  // the count under the tile changed: replace it; the tile appears or goes: the account page is drawn again
  function redrawTile() {
    const t = document.querySelector('.ac-fam-tile'), html = tileHtml();
    if (t && html) t.outerHTML = html;
    else if (!!t !== !!html && st.redraw) st.redraw();
  }

  const sw = (key, attr, id, on, label, sub) => `<div class="fm-sw"><span>${esc(label)}<small>${esc(sub)}</small></span><button type="button" class="al-tg${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(label)}" ${attr}="${key}"${id != null ? ` data-fm-id="${esc(id)}"` : ''}></button></div>`;
  function cardHtml(m) {
    const now = new Date();
    return `<div class="fm-card${st.fresh === m.id ? ' fresh' : ''}" data-fm-card="${esc(m.id)}"><b class="notr" dir="auto">${esc(m.name)}</b><small>${esc(seenText(m.last_seen_at, now))}</small>` +
      sw('show', 'data-fm-sw', m.id, !!m.show_balance, TEXTS.showBal, m.show_balance ? TEXTS.showBalOn : TEXTS.showBalOff) +
      sw('acc', 'data-fm-sw', m.id, !!m.on_account, TEXTS.onAcc, m.on_account ? TEXTS.onAccOn : TEXTS.onAccOff) +
      `<div class="fm-btns"><button type="button" class="fm-btn" data-fm-send="${esc(m.id)}">${esc(TEXTS.send)}</button><button type="button" class="fm-btn" data-fm-copy="${esc(m.id)}">${esc(st.copied === m.id ? TEXTS.copied : TEXTS.copy)}</button></div>` +
      `<button type="button" class="al-del" data-fm-del="${esc(m.id)}">${esc(TEXTS.del)}</button></div>`;
  }
  function bodyHtml() {
    const full = st.members.length >= st.max;
    const d = st.draft;
    const form = full ? `<p class="al-warn">${esc(TEXTS.max)}</p>` :
      `<div class="fm-add"><div class="al-lbl">${esc(TEXTS.addTitle)}</div><input type="text" class="al-name notr" data-fm-name maxlength="40" dir="auto" placeholder="${esc(TEXTS.namePh)}" value="${esc(d.name)}">` +
      sw('show', 'data-fm-dsw', null, d.show, TEXTS.showBal, d.show ? TEXTS.showBalOn : TEXTS.showBalOff) +
      sw('acc', 'data-fm-dsw', null, d.acc, TEXTS.onAcc, d.acc ? TEXTS.onAccOn : TEXTS.onAccOff) +
      `<button type="button" class="al-save" data-fm-add${st.busy ? ' disabled' : ''}>${esc(TEXTS.add)}</button></div>`;
    return `<p class="rg-hint">${esc(TEXTS.hint)}</p>` + (st.note ? `<div class="rg-warn">${esc(st.note)}</div>` : '') + (st.error ? `<p class="al-warn">${esc(st.error)}</p>` : '') +
      (st.members.length ? st.members.map(cardHtml).join('') : `<p class="rg-hint">${esc(TEXTS.empty)}</p>`) + form;
  }
  function draw() {
    let el = document.getElementById('familySheet');
    if (!st.view) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'familySheet'; el.className = 'rg-sheet fm-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
    const keep = el.querySelector('.rg-body'), top = keep ? keep.scrollTop : 0;
    const focus = document.activeElement && document.activeElement.hasAttribute && document.activeElement.hasAttribute('data-fm-name');
    el.innerHTML = `<div class="rg-top"><button type="button" class="rg-back" data-fm-close aria-label="${esc(TEXTS.back)}">›</button><b>${esc(TEXTS.title)}</b></div><div class="rg-body">${bodyHtml()}</div>`;
    const b = el.querySelector('.rg-body'); if (b && top) b.scrollTop = top;
    // a hint inside a box is not text the English engine sees as drawn: translated here (as the messages page does)
    const nm = el.querySelector('[data-fm-name]');
    if (nm && root.AskerI18n && root.AskerI18n.lang && root.AskerI18n.lang() === 'en') nm.placeholder = root.AskerI18n.translate(nm.placeholder);
    if (focus) { const i = el.querySelector('[data-fm-name]'); if (i) { i.focus(); const l = i.value.length; try { i.setSelectionRange(l, l); } catch (e) { /* not supported */ } } }
  }
  function open() {
    if (!st.owner || !st.loaded) return;
    st.view = true; st.error = ''; st.note = '';
    try { history.pushState({ asFam: 1 }, '', location.href); } catch (e) { /* the close button still works */ }
    draw();
  }
  function closeSheet(quiet) {
    if (!st.view) return;
    st.view = false; draw(); redrawTile();
    if (!quiet) { try { if (history.state && history.state.asFam) history.back(); } catch (e) { /* nothing to go back to */ } }
  }

  async function call(fn, args) {
    try {
      const { data, error } = await st.client.rpc(fn, Object.assign({ p_token: st.token }, args));
      if (error || !data) return { ok: false, error: 'down' };
      return data;
    } catch (e) { return { ok: false, error: 'down' }; }
  }
  async function addMember() {
    if (st.busy) return;
    const d = st.draft, name = cleanName(d.name);
    if (!name) { st.error = TEXTS.needName; draw(); return; }
    st.busy = true; st.error = ''; st.note = ''; draw();
    const r = await call('ar_member_add', { p_name: name, p_show_balance: !!d.show, p_on_account: !!d.acc });
    st.busy = false;
    if (!r.ok) { st.error = errText(r.error); draw(); return; }
    st.draft = { name: '', show: false, acc: true };
    st.fresh = r.id; st.note = TEXTS.added;
    await list();
    draw();
    try { const c = document.querySelector(`[data-fm-card="${r.id}"]`); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'center' }); } catch (e) { /* no scrolling */ }
  }
  async function toggle(id, key) {
    const m = st.members.find((x) => String(x.id) === String(id));
    if (!m) return;
    const field = key === 'show' ? 'show_balance' : 'on_account', was = !!m[field];
    m[field] = !was; st.error = ''; st.note = ''; draw();
    const r = await call('ar_member_update', { p_id: m.id, p_show_balance: key === 'show' ? m[field] : null, p_on_account: key === 'acc' ? m[field] : null });
    if (!r.ok) { m[field] = was; st.error = errText(r.error); draw(); }
  }
  async function remove(id) {
    const m = st.members.find((x) => String(x.id) === String(id));
    if (!m || !root.confirm(fill(TEXTS.delAsk, { n: m.name }))) return;
    const r = await call('ar_member_remove', { p_id: m.id });
    if (!r.ok && r.error !== 'no_member') { st.error = errText(r.error); draw(); return; }
    st.error = ''; st.note = ''; st.fresh = null;
    await list();
    draw(); redrawTile();
  }
  async function send(id) {
    const m = st.members.find((x) => String(x.id) === String(id));
    if (!m) return;
    const text = shareText(m.name, linkOf(m.token, root.location.href));
    try { if (root.navigator.share) { await root.navigator.share({ text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { root.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener'); } catch (e) { /* the copy button still works */ }
  }
  async function copy(id) {
    const m = st.members.find((x) => String(x.id) === String(id));
    if (!m) return;
    const url = linkOf(m.token, root.location.href);
    try { await root.navigator.clipboard.writeText(url); } catch (e) { try { root.prompt('', url); } catch (err) { /* no way to copy */ } return; }
    st.copied = m.id; draw();
    setTimeout(() => { if (st.copied === m.id) { st.copied = null; draw(); } }, 2500);
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-fm-open]')) { open(); return; }
    if (!st.view) return;
    if (t.closest('[data-fm-close]')) { closeSheet(); return; }
    if (t.closest('[data-fm-add]')) { addMember(); return; }
    const s = t.closest('[data-fm-sw]'); if (s) { toggle(s.dataset.fmId, s.dataset.fmSw); return; }
    const ds = t.closest('[data-fm-dsw]'); if (ds) { const k = ds.dataset.fmDsw === 'show' ? 'show' : 'acc'; st.draft[k] = !st.draft[k]; draw(); return; }
    const se = t.closest('[data-fm-send]'); if (se) { send(se.dataset.fmSend); return; }
    const co = t.closest('[data-fm-copy]'); if (co) { copy(co.dataset.fmCopy); return; }
    const de = t.closest('[data-fm-del]'); if (de) { remove(de.dataset.fmDel); }
  });
  document.addEventListener('input', (e) => { if (st.view && e.target.matches && e.target.matches('[data-fm-name]')) { st.draft.name = e.target.value; if (st.error) { st.error = ''; } } });
  document.addEventListener('keydown', (e) => {
    if (!st.view) return;
    if (e.key === 'Escape') closeSheet();
    else if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-fm-name]')) { e.preventDefault(); addMember(); }
  });
  window.addEventListener('popstate', () => { if (st.view) { st.view = false; draw(); redrawTile(); } });

  root.AskerStoreFamily = { attach, forget, tileHtml, open, close: closeSheet, list, count: () => st.members.length, owner: () => st.owner };
})(typeof window === 'undefined' ? globalThis : window);
