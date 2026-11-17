/* «مستخدمين الموقع» (inside the «طلبات الموقع» tab of asker-nawaqes-arabic.html; owner 2026-11-17: «عايز عدد الناس اللي نزّلت الموقع، كام نزّله وكام شاله
   وكام فتحه» + «الناس اللي هتنزّل الموقع هنعمله بباسورد حتى نعرف عدد المستخدمين»). The owner sees how many made an account in the installed app, how many
   opened it today / in 7 days, how many installed it, and «غالبًا شالوه» (installed and not opened for 30 days: a browser never says when an app is removed);
   the customers who use their link have no password and are counted apart; under it the latest users, each with «باسورد جديد» for someone who forgot (a
   temporary 6-digit one he sends on WhatsApp). Owner only: the functions ar_site_users_stats / ar_site_user_reset (migration 202611170300) refuse anyone else,
   and the card hides itself. Never shows or keeps a password hash. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/site-users.cjs) ----------
  const DAY = 864e5, GONE_DAYS = 30;
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  // «دلوقتي» / «النهارده» / «امبارح» / «من N يوم»
  function ago(iso, now) {
    const t = iso ? new Date(iso) : null;
    if (!t || isNaN(t)) return 'ما فتحش';
    if (now - t < 10 * 60 * 1000) return 'دلوقتي';
    if (sameDay(t, now)) return 'النهارده';
    if (sameDay(t, new Date(now.getTime() - DAY))) return 'امبارح';
    return `من ${Math.max(2, Math.floor((now - t) / DAY))} يوم`;
  }
  // installed and not opened for 30 days (a guess: nothing tells us when an app is removed)
  const probablyGone = (u, now) => !!u.installed_at && (!u.last_seen_at || now - new Date(u.last_seen_at) > GONE_DAYS * DAY);
  const PLATFORM = { android: 'أندرويد', ios: 'آيفون', desktop: 'كمبيوتر', other: 'غير معروف' };
  function view(stats, now) {
    const u = (stats && stats.users) || {}, c = (stats && stats.customers) || {}, h = (stats && stats.members) || null;
    return {
      // the people of the customers' houses (store/family.js, 2026-11-18): they count as customers; null = the server has no household yet (the lines stay away)
      members: h ? num(h.members) : null, membersOpened: h ? num(h.opened) : 0,
      total: num(u.total), today: num(u.today), last7: num(u.last7), openedToday: num(u.opened_today), opened7: num(u.opened7),
      installed: num(u.installed), removed: num(u.removed), android: num(u.android), ios: num(u.ios),
      customersOpened: num(c.opened), customersInstalled: num(c.installed),
      rows: ((stats && stats.recent) || []).map((r) => ({
        id: r.id, name: r.name, phone: r.phone, platform: PLATFORM[r.platform] || '',
        created: r.created_at ? new Date(r.created_at) : null, seen: ago(r.last_seen_at, now), gone: probablyGone(r, now), installed: !!r.installed_at,
      })),
    };
  }
  // the message to send with the new temporary password (no link, no secret beyond the 6 digits, he sends it by hand)
  const resetText = (name, password) => `أهلًا ${name || ''} 🌿\nباسورد موقع صيدلية عسكر الجديد: ${password}\nادخل بيه برقمك، ولو عايز تغيّره ابعتلنا.`;
  const waHref = (phone, text) => (/^01\d{9}$/.test(String(phone || '')) ? `https://wa.me/2${phone}?text=${encodeURIComponent(text)}` : '');
  const api = { ago, probablyGone, view, resetText, waHref, PLATFORM };
  root.AskerSiteUsersLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the section ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const shown = new Map(); // user id → the temporary password just made (kept on screen only)
  let last = null;

  function draw() {
    const box = $('suBody');
    if (!box || !last) return;
    const v = view(last, new Date());
    const row = (r) => {
      const pw = shown.get(r.id);
      const wa = pw ? waHref(r.phone, resetText(r.name, pw)) : '';
      // (a name and a number are never translated; every other piece is its own text so the English switch can translate it)
      return `<div class="su-row" data-su="${esc(r.id)}"><div class="su-who"><strong translate="no">${esc(r.name)}</strong><span dir="ltr" translate="no">${esc(r.phone)}</span>` +
        `<span class="su-meta">${r.platform ? `<span>${esc(r.platform)}</span>` : ''}${r.created ? `<span>سجّل ${esc(r.created.getDate() + '/' + (r.created.getMonth() + 1))}</span>` : ''}${r.installed ? '<span>نزّل التطبيق</span>' : ''}</span></div>` +
        `<span class="su-chip${r.gone ? ' gone' : ''}">${esc(r.gone ? r.seen + ' · غالبًا شاله' : r.seen)}</span>` +
        (pw ? `<div class="su-pw"><span>الباسورد الجديد: <b dir="ltr" translate="no">${esc(pw)}</b></span>${wa ? `<a class="small" href="${esc(wa)}" target="_blank" rel="noopener">ابعته على واتساب</a>` : ''}</div>`
          : `<button type="button" class="secondary small su-reset" data-su-reset="${esc(r.id)}">باسورد جديد</button>`) + '</div>';
    };
    box.innerHTML =
      `<div class="su-dark"><span class="su-lbl">عملوا حساب في الموقع</span><b class="su-big">${v.total}</b><span class="su-sub">النهارده ${v.today} · آخر 7 أيام ${v.last7}</span>` +
      `<div class="su-grid"><div>فتحوا آخر 7 أيام<b>${v.opened7}</b></div><div>فتحوا النهارده<b>${v.openedToday}</b></div><div>نزّلوا التطبيق<b>${v.installed}</b></div><div>غالبًا شالوه<b>${v.removed}</b></div></div></div>` +
      `<div class="su-card"><h3>عملاء بالرابط <small>من غير باسورد</small></h3><div class="su-line"><span>فتحوا رابط حسابهم</span><b>${v.customersOpened}</b></div>` +
      `<div class="su-line"><span>منهم نزّلوا التطبيق</span><b>${v.customersInstalled}</b></div>` +
      (v.members == null ? '' : `<div class="su-line"><span>أهل بيت العملاء</span><b>${v.members}</b></div><div class="su-line"><span>منهم فتحوا رابطهم</span><b>${v.membersOpened}</b></div>`) + '</div>' +
      `<div class="su-card"><h3>آخر المستخدمين <small>آخر فتح</small></h3>${v.rows.length ? v.rows.map(row).join('') : '<p class="hint">لسه محدش عمل حساب.</p>'}</div>` +
      `<p class="su-note">المتصفح ما بيقولش لما حد يمسح التطبيق، فـ«غالبًا شالوه» = نزّلوه وما فتحوهوش من 30 يوم. الأرقام بتبدأ من يوم التشغيل، وأرقام الموبايل مش متأكد منها بكود (مفيش SMS).</p>`;
    const sum = $('suSummary');
    if (sum) sum.textContent = `👥 مستخدمين الموقع · ${v.total}`;
  }
  async function open() {
    const d = $('siteUsers');
    if (!d || !db()) return;
    const { data, error } = await db().rpc('ar_site_users_stats');
    // not the owner (staff), or the functions are not on the server yet: the card stays away
    if (error || !data || !data.ok) { d.hidden = true; return; }
    // the people of the customers' houses (owner only; not on the server yet = no lines)
    let members = null;
    try { const r = await db().rpc('ar_members_count'); if (r && !r.error && r.data && r.data.ok) members = r.data; } catch (e) { /* later */ }
    d.hidden = false; last = Object.assign({}, data, { members }); draw();
  }
  async function reset(id, btn) {
    if (!root.confirm('هتعمل باسورد جديد للمستخدم ده؟ الباسورد القديم بيبطل وموبايله بيخرج من الحساب.')) return;
    btn.disabled = true;
    try {
      const { data, error } = await db().rpc('ar_site_user_reset', { p_user: Number(id) });
      if (error || !data || !data.ok) throw error || new Error('no_user');
      shown.set(Number(id), data.password);
      draw();
    } catch (e) {
      btn.disabled = false;
      const s = $('suStatus'); if (s) { s.textContent = 'ماتعملش: ' + (e && e.message ? e.message : 'جرب تاني'); s.className = 'status bad'; }
    }
  }
  $('suBody')?.addEventListener('click', (e) => { const b = e.target.closest('[data-su-reset]'); if (b) reset(b.dataset.suReset, b); });
  root.AskerSiteUsers = { open };
})(typeof window === 'undefined' ? globalThis : window);
