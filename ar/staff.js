/* The pharmacy's staff (owner 2026-11-13: «يوزر جوه التطبيق … افتح له كذا وكذا … انا حر»; «رابط شخصي»; «العمليات اللي
   بيعملها اي مستخدم تبان لي باسمه»).
   - The owner (⚙️ ← الموظفين): adds a person by name, opens any section for him (one switch each), sends him his personal
     link on WhatsApp, stops him, and reads what he did (ar_activity, written by the database).
   - A staff member: opens his link once in the phone's browser (function asker-staff signs him in and the phone keeps the
     session; «ثبّت» puts the bot on his phone with the same icon). He sees only the sections opened for him, in the bot's
     own look; the database refuses everything else (migration 202611130200), this page only hides it. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/staff.cjs) ----------
  // [key, label, group]: every section of the bot that can be given, and the extras
  const SECTIONS = [
    ['tempsale', 'البيع المؤقت', 'المبيعات'], ['return', 'المرتجع (في البيع المؤقت)', 'المبيعات'], ['credit', 'البيع للعملاء الآجل', 'المبيعات'], ['storeorders', 'الموقع', 'المبيعات'],
    ['stock', 'المخزون', 'المخزون'], ['count', 'جرد المخزون', 'المخزون'], ['expiry', 'الصلاحيات', 'المخزون'],
    ['short', 'النواقص', 'المشتريات'], ['read', 'الوارد', 'المشتريات'], ['translate', 'الترجمة', 'المشتريات'], ['drafts', 'الطلبيات', 'المشتريات'], ['docs', 'الفواتير', 'المشتريات'], ['suppliers', 'قوايم المخازن', 'المشتريات'],
    ['customers', 'العملاء', 'الحسابات'], ['search', 'البحث اللي فوق الأقسام', 'عام'],
  ];
  // the bot's tabs a staff member can be given, and their place in the bottom bar
  const GROUP = { short: 'purchases', read: 'purchases', translate: 'purchases', drafts: 'purchases', docs: 'purchases', suppliers: 'purchases', stock: 'purchases', count: 'purchases', expiry: 'purchases', customers: 'accounts', storeorders: 'sales', tempsale: 'sales' };
  const PGROUP = { short: 'short', read: 'short', translate: 'short', drafts: 'orders', docs: 'orders', suppliers: 'orders', stock: 'stock', count: 'stock', expiry: 'stock' };
  const TABS = Object.keys(GROUP);
  const allowedTabs = (perms) => TABS.filter((t) => (perms || []).includes(t));
  // a tab that is not open for him becomes another open tab of the same section, or his home
  function fixTab(tab, perms) {
    if (tab === 'home' || (perms || []).includes(tab)) return tab;
    return allowedTabs(perms).find((t) => GROUP[t] === GROUP[tab]) || 'home';
  }
  // what he did, in a few words (ar_activity rows)
  const TBL = {
    ar_shortages: 'النواقص', ar_shortage_names: 'أسامي النواقص', ar_names: 'الأسامي العربي', ar_orders: 'علامات «اتطلب»', ar_decisions: 'قرارات الوارد',
    ar_answers: 'ردود «ده ولا مش ده»', ar_fixes: 'تصليحات القراية', ar_ignored: 'الأسطر المتجاهلة', ar_inbox: 'الوارد', ar_inbox_media: 'إشعارات الوارد',
    ar_suppliers: 'المخازن', ar_documents: 'الفواتير', ar_supplier_lists: 'قوايم المخازن', ar_supplier_items: 'أصناف قوايم المخازن',
    ar_supplier_aliases: 'أسامي المخازن', ar_store_items: 'أصناف الموقع', ar_store_orders: 'طلبات الموقع', ar_store_settings: 'إعدادات الموقع',
    ar_store_arabic: 'أسامي الموقع', ar_store_generic: 'المواد الفعالة', ar_customer_phones: 'أرقام العملاء', ar_temp_sales: 'البيع المؤقت',
  };
  const OP = { insert: 'ضاف في', update: 'عدّل في', delete: 'شال من' };
  function activityText(a) {
    const i = a.info || {}, name = i.name ? ` «${String(i.name).slice(0, 60)}»` : '';
    if (a.tbl === 'ar_temp_sales') {
      const what = i.kind === 'return' ? 'مرتجع' : 'بيعة مؤقتة';
      const detail = [i.no ? '#' + i.no : '', i.n ? `${i.n} صنف` : '', i.total != null ? `${i.total} ج` : ''].filter(Boolean).join(' · ');
      return (a.op === 'insert' ? `سجّل ${what}` : a.op === 'update' ? `بعت ${what} تاني` : `مسح ${what}`) + (detail ? ` (${detail})` : '');
    }
    if (a.tbl === 'ar_count_entries') return (a.op === 'insert' ? 'جرد' : 'عدّل جرد') + (name || ' صنف') + (i.result === 'ok' ? ' (مظبوط)' : i.result === 'diff' ? ' (فيه فرق)' : '');
    if (a.tbl === 'ar_orders') return (a.op === 'delete' ? 'شال علامة «اتطلب» من' : 'علّم «اتطلب» على') + (name || ' صنف');
    if (a.tbl === 'ar_shortages') return (a.op === 'insert' ? 'ضاف للنواقص' : a.op === 'delete' ? 'شال من النواقص' : 'عدّل في النواقص') + name;
    return `${OP[a.op] || a.op} ${TBL[a.tbl] || a.tbl}${name}${i.status ? ` (${i.status})` : ''}`;
  }
  function waMessage(name, link) {
    return `أهلاً ${name} 👋\nده رابط دخولك على بوت صيدلية عسكر:\n${link}\n\nافتحه من جوجل كروم، وبعدين دوس «ثبّت» عشان البوت يبقى عندك على الموبايل.\nالرابط ده ليك انت بس، ما تبعتهوش لحد.`;
  }
  const api = { SECTIONS, GROUP, PGROUP, TABS, allowedTabs, fixTab, activityText, waMessage };
  root.AskerStaffLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const FN = 'asker-staff';
  let me = null, checkedFor = null, staffList = [], openCard = '';
  const isStaff = () => !!me;
  const can = (p) => !me || (me.active && (me.perms || []).includes(p));
  const say = (id, text, kind) => { const el = $(id); if (el) { el.textContent = text || ''; el.className = 'status' + (kind ? ' ' + kind : ''); } };
  // the function's own message when it refuses
  async function call(body) {
    const { data, error } = await db().functions.invoke(FN, { body });
    if (!error) return data;
    let msg = error.message || String(error);
    try { const j = await error.context.json(); if (j && j.message) msg = j.message; } catch (e) {}
    throw new Error(msg);
  }

  // ---------- 1) the personal link: #staff=<secret> ----------
  async function linkLogin() {
    const m = location.hash.match(/^#staff=([0-9a-f]{64})$/);
    if (!m || !db()) return;
    history.replaceState(null, '', location.pathname + location.search);
    const { data: s } = await db().auth.getSession();
    if (s && s.session && !root.confirm('انت داخل بحساب تاني على الموبايل ده. تدخل بحساب الموظف بدله؟ هتخرج من الحساب اللي انت فيه.')) return;
    say('loginStatus', 'بيدخّلك…');
    try {
      const d = await call({ action: 'login', token: m[1] });
      const { error } = await db().auth.setSession({ access_token: d.access_token, refresh_token: d.refresh_token });
      if (error) throw error;
      say('loginStatus', '');
    } catch (e) {
      say('loginStatus', (e && e.message) || 'الدخول ما تمش', 'bad');
    }
  }

  // ---------- 2) who is signed in: the owner, or a staff member and what is open for him ----------
  // kept on the phone per sign-in, so the bot opens at once (the owner's fast opening); the server's answer comes right after
  // and wins (the database refuses anything not open for him anyway)
  const RKEY = 'asker-role';
  async function check(uid) {
    if (!db() || checkedFor === uid) return me;
    checkedFor = uid;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(RKEY) || 'null'); } catch (e) {}
    if (saved && saved.uid === uid) {
      me = saved.me || null;
      apply();
      if (!me) loadAdmin();
      fetchRole(uid, true);
      return me;
    }
    await fetchRole(uid, false);
    return me;
  }
  async function fetchRole(uid, later) {
    let row = null;
    try {
      const { data, error } = await db().from('ar_staff').select('user_id,name,perms,active').eq('user_id', uid).limit(1);
      if (error) throw error;
      row = (data && data[0]) || null;
    } catch (e) { if (later) return; }
    const was = JSON.stringify(me);
    me = row;
    try { localStorage.setItem(RKEY, JSON.stringify({ uid, me })); } catch (e) {}
    if (!later || JSON.stringify(me) !== was) {
      apply();
      if (!me) loadAdmin();
      if (later && me && root.AskerApp && root.AskerApp.showTab) root.AskerApp.showTab('home');
    }
  }
  function apply() {
    const html = document.documentElement, on = isStaff();
    html.classList.toggle('staff', on);
    html.classList.toggle('staff-off', on && !me.active);
    html.classList.toggle('can-search', !on || can('search'));
    // the search's lists kept on this phone (ar/cache.js) stay only for someone who may search (2026-11-13): a staff
    // member without «البحث», or a stopped one, loses them (not in the owner's preview on his own phone)
    if (on && !me.preview && !can('search')) root.AskerCache?.clear();
    $('staffAdmin')?.classList.toggle('hidden', on);
    // the way out of a staff account (not in the owner's preview: «رجوع لحسابي» is there)
    $('staffOut')?.classList.toggle('hidden', !on || !!(me && me.preview));
    $('logoutBtn')?.classList.toggle('staff-hide', on);
    if (!on) { document.querySelectorAll('.staff-hidden').forEach((x) => x.classList.remove('staff-hidden')); return; }
    const tabs = me.active ? allowedTabs(me.perms) : [];
    const hide = (el, h) => el.classList.toggle('staff-hidden', h);
    document.querySelectorAll('.subbar [data-tab]').forEach((b) => hide(b, !tabs.includes(b.dataset.tab)));
    document.querySelectorAll('[data-pgroup]').forEach((b) => hide(b, !tabs.some((t) => PGROUP[t] === b.dataset.pgroup)));
    document.querySelectorAll('[data-group]').forEach((b) => hide(b, b.dataset.group !== 'home' && !tabs.some((t) => GROUP[t] === b.dataset.group)));
    drawHome(tabs);
  }
  // his home: big buttons for the sections open for him
  const ICON = { tempsale: '🧾', storeorders: '🛒', stock: '📦', count: '📋', expiry: '⏳', short: '📉', read: '📥', translate: '🔤', drafts: '📝', docs: '🧾', suppliers: '🏬', customers: '👥' };
  function drawHome(tabs) {
    const box = $('staffHomePanel');
    if (!box) return;
    if (!me.active) {
      box.innerHTML = '<h2>حسابك متوقف</h2><p class="hint">كلّم صاحب الصيدلية لو محتاج تدخل تاني.</p>';
      return;
    }
    const label = (t) => { const b = document.querySelector(`.subbar [data-tab="${t}"]`); return b ? b.textContent.trim() : t; };
    box.innerHTML = `<h2>أهلاً <span class="notr">${esc(me.name)}</span></h2>` +
      (tabs.length ? tabs.map((t) => `<button type="button" class="stf-big" data-stf-go="${t}"><i aria-hidden="true">${ICON[t] || '•'}</i><span>${esc(label(t))}</span></button>`).join('')
        : '<p class="hint">لسه مفيش أقسام مفتوحة لك. كلّم صاحب الصيدلية.</p>');
  }

  // ---------- 3) the owner: ⚙️ ← الموظفين ----------
  async function loadAdmin() {
    if (!$('stfRows') || !db()) return;
    try {
      const { data, error } = await db().from('ar_staff').select('user_id,name,perms,active,last_seen_at,created_at').order('created_at', { ascending: true });
      if (error) throw error;
      staffList = data || [];
      drawAdmin();
    } catch (e) {
      const missing = /ar_staff|relation|schema cache|does not exist/i.test(String(e && e.message));
      say('stfStatus', missing ? 'الموظفين لسه مش متاحين: محتاج تفعيل على السيرفر الأول.' : 'مقدرتش أجيب الموظفين: ' + ((e && e.message) || e), 'bad');
    }
  }
  function when(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    const h = d.getHours() % 12 || 12, t = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'ص' : 'م'}`;
    return d.toDateString() === new Date().toDateString() ? `النهارده ${t}` : `${d.getDate()}/${d.getMonth() + 1} ${t}`;
  }
  function staffCard(s) {
    const tag = !s.active ? '<span class="stf-tag off">موقوف</span>' : s.last_seen_at ? '<span class="stf-tag on">شغال</span>' : '<span class="stf-tag wait">لسه ما دخلش</span>';
    const groups = [...new Set(SECTIONS.map((x) => x[2]))];
    const perms = groups.map((g) => `<h4>${esc(g)}</h4>` + SECTIONS.filter((x) => x[2] === g).map(([k, label]) =>
      `<label class="stf-sw"><input type="checkbox" data-perm="${k}"${(s.perms || []).includes(k) ? ' checked' : ''}${s.active ? '' : ' disabled'} /> <span>${esc(label)}</span></label>`).join('')).join('');
    const n = (s.perms || []).filter((p) => SECTIONS.some((x) => x[0] === p)).length;
    const open = openCard === s.user_id;
    return `<details class="stf-card" data-stf="${esc(s.user_id)}"${open ? ' open' : ''}>
      <summary class="stf-head"><strong class="notr">${esc(s.name)}</strong><small class="hint">${n ? `${n} قسم مفتوح` : 'مفيش أقسام مفتوحة'}</small>${tag}</summary>
      ${s.last_seen_at ? `<small class="hint">آخر دخول: ${esc(when(s.last_seen_at))}</small>` : ''}
      <div class="stf-perms">${perms}</div>
      <div class="stf-acts">
        ${s.active ? '<button type="button" data-stf-link>ابعتله رابط الدخول على الواتس</button><button type="button" class="secondary" data-stf-stop>وقّف الحساب</button>'
          : '<button type="button" data-stf-link>شغّله تاني وابعتله رابط جديد</button>'}
        <button type="button" class="secondary" data-stf-preview>👁 شوف البوت زي ما هيشوفه</button>
        <button type="button" class="secondary stf-del" data-stf-remove>🗑 امسح الحساب</button>
      </div>
      <details data-stf-log><summary>اللي عمله</summary><div class="stf-log"></div></details>
    </details>`;
  }
  function drawAdmin() {
    $('stfRows').innerHTML = staffList.map(staffCard).join('') || '<p class="hint">لسه مفيش موظفين.</p>';
  }
  function sendOnWhatsApp(name, link) {
    const url = 'https://wa.me/?text=' + encodeURIComponent(waMessage(name, link));
    if (!root.open(url, '_blank')) location.href = url;
  }
  async function addStaff() {
    const name = $('stfName').value.replace(/\s+/g, ' ').trim();
    if (!name) return say('stfStatus', 'اكتب اسم الموظف الأول', 'bad');
    $('stfAdd').disabled = true;
    say('stfStatus', 'بيعمل الحساب…');
    try {
      const d = await call({ action: 'create', name, perms: [] });
      $('stfName').value = '';
      openCard = d.user_id; // open on his sections right away
      await loadAdmin();
      say('stfStatus', `اتعمل حساب ${name}. افتحله الأقسام اللي عايزها، والرابط اتفتح في الواتس تبعته له.`, 'ok');
      sendOnWhatsApp(name, d.link);
    } catch (e) {
      say('stfStatus', 'الحساب ما اتعملش: ' + ((e && e.message) || e), 'bad');
    } finally { $('stfAdd').disabled = false; }
  }
  async function setPerm(id, key, on) {
    const s = staffList.find((x) => x.user_id === id);
    if (!s) return;
    const perms = new Set(s.perms || []);
    if (on) perms.add(key); else perms.delete(key);
    const next = [...perms];
    const { error } = await db().from('ar_staff').update({ perms: next }).eq('user_id', id);
    if (error) { say('stfStatus', 'ماتحفظش: ' + error.message, 'bad'); return drawAdmin(); }
    s.perms = next;
    say('stfStatus', `اتحفظ ✓ ${s.name}`, 'ok');
  }
  async function loadLog(id, box) {
    box.innerHTML = '<p class="hint">بيحمّل…</p>';
    const { data, error } = await db().from('ar_activity').select('at,tbl,op,info').eq('user_id', id).order('at', { ascending: false }).limit(40);
    if (error) { box.innerHTML = `<p class="status bad">${esc(error.message)}</p>`; return; }
    box.innerHTML = (data || []).map((a) => `<div class="stf-act"><small>${esc(when(a.at))}</small> <span>${esc(activityText(a))}</span></div>`).join('') || '<p class="hint">لسه ما عملش حاجة.</p>';
  }
  function bindAdmin() {
    const box = $('staffAdmin');
    if (!box || box.dataset.bound) return;
    box.dataset.bound = '1';
    $('stfAdd').onclick = addStaff;
    box.addEventListener('change', (e) => {
      const t = e.target, card = t.closest('[data-stf]');
      if (card && t.dataset.perm) setPerm(card.dataset.stf, t.dataset.perm, t.checked);
    });
    box.addEventListener('toggle', (e) => {
      const d = e.target;
      if (!d.matches) return;
      if (d.matches('[data-stf-log]') && d.open) loadLog(d.closest('[data-stf]').dataset.stf, d.querySelector('.stf-log'));
      // the open person stays open when the list is drawn again (after a switch or a button)
      if (d.matches('.stf-card')) { if (d.open) openCard = d.dataset.stf; else if (openCard === d.dataset.stf) openCard = ''; }
    }, true);
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('button'), card = b && b.closest('[data-stf]');
      if (!card) return;
      const s = staffList.find((x) => x.user_id === card.dataset.stf);
      if (!s) return;
      if (b.hasAttribute('data-stf-preview')) return preview(s);
      try {
        if (b.hasAttribute('data-stf-link')) {
          const d = await call({ action: 'link', user_id: s.user_id });
          await loadAdmin();
          say('stfStatus', `رابط جديد لـ ${s.name} اتفتح في الواتس. الرابط القديم مبقاش شغال.`, 'ok');
          sendOnWhatsApp(s.name, d.link);
        } else if (b.hasAttribute('data-stf-remove')) {
          if (!root.confirm(`تمسح حساب ${s.name} نهائي؟ هيخرج من البوت ومش هيرجع. لو عايزه يرجع بعدين، استخدم «وقّف الحساب» بدل المسح.`)) return;
          await call({ action: 'remove', user_id: s.user_id });
          openCard = '';
          await loadAdmin();
          say('stfStatus', `حساب ${s.name} اتمسح.`, 'ok');
        } else if (b.hasAttribute('data-stf-stop')) {
          if (!root.confirm(`توقّف حساب ${s.name}؟ هيخرج من البوت على طول، والرابط بتاعه مش هيشتغل.`)) return;
          await call({ action: 'stop', user_id: s.user_id });
          await loadAdmin();
          say('stfStatus', `حساب ${s.name} اتوقف.`, 'ok');
        }
      } catch (err) { say('stfStatus', (err && err.message) || String(err), 'bad'); }
    });
  }

  // ---------- 3b) the owner sees the bot as one of his staff sees it (owner 2026-11-13: «اشوف انا بعمل ايه فيه»): the same
  // sections, home and buttons, on this phone only, without signing out; «رجوع لحسابي» ends it. The data stays the owner's
  // (the database shows a staff member only his part), so it is the layout that is shown, not his data.
  function preview(s) {
    me = { user_id: s.user_id, name: s.name, perms: s.perms || [], active: !!s.active, preview: true };
    $('settingsPanel')?.classList.add('hidden');
    apply();
    $('previewText').textContent = `بتشوف البوت زي ما ${s.name} هيشوفه`;
    $('previewBar').classList.remove('hidden');
    if (root.AskerApp && root.AskerApp.showTab) root.AskerApp.showTab('home');
  }
  function endPreview() {
    me = null;
    $('previewBar').classList.add('hidden');
    apply();
    loadAdmin();
    if (root.AskerApp && root.AskerApp.showTab) root.AskerApp.showTab('home');
  }

  // ---------- 4) «ثبّت البوت على موبايلك»: the same icon as the owner's ----------
  let installEvt = null;
  const standalone = () => (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  function showInstall() {
    let no = 0;
    try { no = Number(localStorage.getItem('asker-install-no')) || 0; } catch (e) {}
    const bar = $('installBar');
    if (bar) bar.classList.toggle('hidden', !installEvt || standalone() || Date.now() - no < 3 * 864e5);
  }
  root.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; showInstall(); });
  root.addEventListener('appinstalled', () => { installEvt = null; showInstall(); });

  function bind() {
    bindAdmin();
    $('staffHomePanel')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-stf-go]');
      if (b && root.AskerApp && root.AskerApp.showTab) root.AskerApp.showTab(b.dataset.stfGo);
    });
    $('installBtn')?.addEventListener('click', async () => {
      if (!installEvt) return;
      installEvt.prompt();
      try { await installEvt.userChoice; } catch (e) {}
      installEvt = null;
      showInstall();
    });
    $('installNo')?.addEventListener('click', () => { try { localStorage.setItem('asker-install-no', String(Date.now())); } catch (e) {} showInstall(); });
    $('previewBack')?.addEventListener('click', endPreview);
    // out of a staff account (in ⚙️ only, so it is not pressed by mistake): back to the sign-in page
    $('staffLogout')?.addEventListener('click', async () => {
      if (!root.confirm('تخرج من الحساب ده؟')) return;
      try { localStorage.removeItem(RKEY); } catch (e) {}
      me = null; checkedFor = null;
      document.documentElement.classList.remove('staff', 'staff-off', 'can-search');
      $('settingsPanel')?.classList.add('hidden');
      // the bot's own sign-out (it also forgets the saved lists and shows the sign-in page)
      const lb = $('logoutBtn');
      if (lb) lb.click(); else await db().auth.signOut();
    });
  }
  bind();
  linkLogin();
  root.AskerStaff = { check, isStaff, can, myId: () => (me && !me.preview ? me.user_id : null), fixTab: (t) => (isStaff() ? fixTab(t, me.active ? me.perms : []) : t), nameOf: (id) => (staffList.find((s) => s.user_id === id) || {}).name || '', reload: loadAdmin };
})(typeof window === 'undefined' ? globalThis : window);
