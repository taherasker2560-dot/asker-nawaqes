/* «👥 المستخدمين» (inside the «طلبات الموقع» tab of asker-nawaqes-arabic.html). Owner 2026-11-17: «عايز عدد الناس اللي نزّلت الموقع، كام نزّله وكام شاله وكام فتحه»;
   2026-11-18: «ليه مش مخليني أشوف الناس اللي بتسجل في الموقع، والناس اللي بتنزل الأبليكيشن، والناس اللي بتنزل الموقع … وأبقى شايف لما يطلعوا أو يشيلوا … المفروض
   الحاجات دي كلها أبقى شايفها ومتحكم فيها» (he approved the mockup mockups/users_screen_2026-11-18.png with «ا»).
   EVERY person in one list (the server's ar_people_list, migration 202611190030, owner only): the credit customers by their link, the people of their houses, the site
   accounts. For each: his kind, the last open and how many, whether he installed the site, whether his phone has «منبه الدوا», and a state:
     🟢 opened in the last 7 days · 🟡 8 to 29 days · 🔴 30 days or more («غالبًا شاله» when he had installed it) · ⚫ the push service said his address is dead (asker-chat
     writes it: the only hard sign of a removal) · ⚪ the link was sent and never opened.
   A browser never says when an app is removed: the note says so. Above: four numbers, a search (name or mobile) and filters. A site account: «باسورد جديد» (a temporary
   6-digit one he sends on WhatsApp) and «امسح الحساب»; anyone with a mobile: «💬 واتساب». Never shows a secret, a session or a password hash. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/site-users.cjs) ----------
  const DAY = 864e5, QUIET_DAYS = 7, AWAY_DAYS = 30;
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const dt = (iso) => { const t = iso ? new Date(iso) : null; return t && !isNaN(t) ? t : null; };
  // «دلوقتي» / «النهارده» / «امبارح» / «من N يوم» (kept: the old card's words)
  function ago(iso, now) {
    const t = dt(iso);
    if (!t) return 'ما فتحش';
    if (now - t < 10 * 60 * 1000) return 'دلوقتي';
    if (sameDay(t, now)) return 'النهارده';
    if (sameDay(t, new Date(now.getTime() - DAY))) return 'امبارح';
    return `من ${Math.max(2, Math.floor((now - t) / DAY))} يوم`;
  }
  // the hour as people say it: «10:26 م»
  const clock = (t) => { const h = t.getHours(), m = String(t.getMinutes()).padStart(2, '0'); return `${h % 12 || 12}:${m} ${h < 12 ? 'ص' : 'م'}`; };
  // «النهارده 10:26 م» / «امبارح 9:10 ص» / «من 5 يوم» / «ما فتحش»
  function whenText(iso, now) {
    const t = dt(iso);
    if (!t) return 'ما فتحش';
    if (sameDay(t, now)) return `النهارده ${clock(t)}`;
    if (sameDay(t, new Date(now.getTime() - DAY))) return `امبارح ${clock(t)}`;
    return `من ${Math.max(2, Math.floor((now - t) / DAY))} يوم`;
  }
  const dayMonth = (iso) => { const t = dt(iso); return t ? `${t.getDate()}/${t.getMonth() + 1}` : ''; };
  // «فتح مرة» / «فتح مرتين» / «فتح 5 مرات» / «فتح 12 مرة»
  function timesText(n) {
    n = num(n);
    if (n <= 0) return '';
    if (n === 1) return 'فتح مرة';
    if (n === 2) return 'فتح مرتين';
    return n <= 10 ? `فتح ${n} مرات` : `فتح ${n} مرة`;
  }
  // installed and not opened for 30 days (kept: the old card's guess)
  const probablyGone = (u, now) => !!u.installed_at && (!u.last_seen_at || now - new Date(u.last_seen_at) > AWAY_DAYS * DAY);
  // the name as people read it: PharmaFly card names carry a mobile or a note («…_0106…», «0102…محمد/700جنيه/موقوف»); «د/…» keeps its title
  function cleanName(name) {
    const raw = String(name ?? '').trim();
    let s = raw.replace(/[_\s]*\+?\d{10,13}[_\s]*/g, ' ');
    const i = s.indexOf('/');
    if (i > 0 && s.slice(0, i).trim().length >= 5) s = s.slice(0, i);
    s = s.replace(/\s+/g, ' ').trim();
    return s || raw;
  }
  // his mobile: the one kept for him (with or without 20), else the one written in his card name
  function phoneOf(p) {
    const d = String((p && p.phone) || '').replace(/\D/g, '');
    const k = /^(?:0020|20)?0?(1\d{9})$/.exec(d);   // 01xxxxxxxxx, 201xxxxxxxxx (how the contacts share keeps it), 00201…
    if (k) return '0' + k[1];
    const m = /(?:^|\D)(01\d{9})(?:\D|$)/.exec(String((p && p.name) || ''));
    return m ? m[1] : '';
  }
  // ⚫ the push service said his address is dead (after his last open) · ⚪ never opened · 🟢 7 days · 🟡 under 30 · 🔴 30 or more
  function statusOf(p, now) {
    const last = dt(p.last_seen_at), gone = dt(p.push_gone_at);
    if (gone && (!last || gone > last)) return 'gone';
    if (!last) return 'never';
    const days = (now - last) / DAY;
    return days <= QUIET_DAYS ? 'ok' : days < AWAY_DAYS ? 'quiet' : 'away';
  }
  const STATUS = { ok: '🟢 شغّال', quiet: '🟡 هادي', away: '🔴 غالبًا شاله', stopped: '🔴 بطّل يفتح', gone: '⚫ شاله أو قفل الإشعارات', never: '⚪ لسه ما فتحش' };
  const statusText = (p, s) => (s === 'away' && !p.installed_at ? STATUS.stopped : STATUS[s]);
  const KIND = { customer: 'عميل أجل', member: 'أهل بيت', site: 'حساب موقع' };
  const PLATFORM = { android: 'أندرويد', ios: 'آيفون', desktop: 'كمبيوتر', other: 'غير معروف' };
  // the four numbers on top
  function summary(people, apps, now) {
    const L = people || [], st = L.map((p) => statusOf(p, now));
    const inst = L.filter((p) => p.installed_at);
    return {
      total: L.length,
      installed: inst.length, installedCustomers: inst.filter((p) => p.kind === 'customer').length, installedSite: inst.filter((p) => p.kind === 'site').length,
      open7: L.filter((p) => { const t = dt(p.last_seen_at); return t && now - t <= QUIET_DAYS * DAY; }).length,
      app: L.filter((p) => p.app_at).length, appPhones: num(apps && apps.total),
      away: L.filter((p, i) => st[i] === 'gone' || (st[i] === 'away' && p.installed_at)).length,
      customers: L.filter((p) => p.kind === 'customer').length, members: L.filter((p) => p.kind === 'member').length, sites: L.filter((p) => p.kind === 'site').length,
    };
  }
  // the filters and the search (a name, or any part of the mobile)
  const FILTERS = ['all', 'customer', 'site', 'member', 'app', 'away'];
  function filterPeople(people, chip, q, now) {
    const t = String(q || '').trim(), digits = t.replace(/\D/g, '');
    return (people || []).filter((p) => {
      if (chip === 'customer' || chip === 'site' || chip === 'member') { if (p.kind !== chip) return false; }
      else if (chip === 'app') { if (!p.app_at) return false; }
      else if (chip === 'away') { const s = statusOf(p, now); if (!(s === 'gone' || (s === 'away' && p.installed_at))) return false; }
      if (!t) return true;
      if (digits.length >= 3 && phoneOf(p).includes(digits)) return true;
      return cleanName(p.name).includes(t) || String(p.name || '').includes(t);
    });
  }
  // the message to send with the new temporary password (no link, no secret beyond the 6 digits, he sends it by hand)
  const resetText = (name, password) => `أهلًا ${name || ''} 🌿\nباسورد موقع صيدلية عسكر الجديد: ${password}\nادخل بيه برقمك، ولو عايز تغيّره ابعتلنا.`;
  const waHref = (phone, text) => (/^01\d{9}$/.test(String(phone || '')) ? `https://wa.me/2${phone}` + (text ? `?text=${encodeURIComponent(text)}` : '') : '');
  const api = { ago, whenText, timesText, dayMonth, probablyGone, cleanName, phoneOf, statusOf, statusText, summary, filterPeople, resetText, waHref, STATUS, KIND, PLATFORM, FILTERS };
  root.AskerSiteUsersLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the section ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const shown = new Map(); // site user id → the temporary password just made (kept on screen only)
  let last = null, chip = 'all', q = '';
  const CHIP_TEXT = { all: 'الكل', customer: 'عملاء الأجل', site: 'حسابات الموقع', member: 'أهل البيت', app: 'منبه الدوا', away: 'غالبًا شالوا' };

  function rowHtml(p, now) {
    const s = statusOf(p, now), phone = phoneOf(p), key = `${p.kind}:${p.id}`, pw = p.kind === 'site' ? shown.get(Number(p.id)) : null;
    const meta = [`آخر فتح: ${whenText(p.last_seen_at, now)}`, timesText(p.opens), p.platform ? PLATFORM[p.platform] || '' : '', p.of_name ? `من أهل ${cleanName(p.of_name)}` : '']
      .filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
    const inst = (p.installed_at ? `<span class="su-inst yes">${esc('📱 نزّل الموقع ' + dayMonth(p.installed_at))}</span>` : `<span class="su-inst">${esc(p.kind === 'member' ? '📱 الموقع: مش معروف' : '📱 الموقع: لسه ما نزّلوش')}</span>`) +
      (p.app_at ? `<span class="su-inst yes">${esc('⏰ نزّل المنبه ' + dayMonth(p.app_at))}</span>` : `<span class="su-inst">${esc('⏰ المنبه: لأ')}</span>`);
    const wa = phone ? waHref(phone, '') : '';
    const acts = (wa ? `<a class="secondary small su-act" href="${esc(wa)}" target="_blank" rel="noopener">💬 واتساب</a>` : '') +
      (p.kind === 'site' && !pw ? `<button type="button" class="secondary small su-act" data-su-reset="${esc(p.id)}">باسورد جديد</button><button type="button" class="secondary small su-act su-del" data-su-del="${esc(p.id)}">امسح الحساب</button>` : '');
    const pwHtml = pw ? `<div class="su-pw"><span>الباسورد الجديد: <b dir="ltr" translate="no">${esc(pw)}</b></span>${phone ? `<a class="small" href="${esc(waHref(phone, resetText(cleanName(p.name), pw)))}" target="_blank" rel="noopener">ابعته على واتساب</a>` : ''}</div>` : '';
    // (a name and a number are never translated; every other piece is its own text so the English switch can translate it)
    return `<div class="su-person" data-su="${esc(key)}" data-st="${s}">` +
      `<div class="su-l1"><strong translate="no" title="${esc(p.name)}">${esc(cleanName(p.name))}</strong><span class="su-kind">${esc(KIND[p.kind] || '')}</span><span class="su-st st-${s}">${esc(statusText(p, s))}</span></div>` +
      (phone ? `<div class="su-l2"><span dir="ltr" translate="no">${esc(phone)}</span></div>` : '') +
      `<div class="su-l2 su-meta">${meta}</div><div class="su-l2">${inst}</div>` +
      (acts ? `<div class="su-acts">${acts}</div>` : '') + pwHtml + '</div>';
  }
  function drawList() {
    const box = $('suList');
    if (!box || !last) return;
    const now = new Date(), L = filterPeople(last.people, chip, q, now).slice(0, 400);
    box.innerHTML = L.length ? L.map((p) => rowHtml(p, now)).join('') : `<p class="hint">${esc(q ? 'مفيش حد بالبحث ده.' : 'مفيش حد هنا لسه.')}</p>`;
  }
  function draw() {
    const body = $('suBody');
    if (!body || !last) return;
    const now = new Date(), v = summary(last.people, last.apps, now);
    const counts = { all: v.total, customer: v.customers, site: v.sites, member: v.members, app: v.app, away: v.away };
    body.innerHTML =
      `<div class="su-tiles">` +
      `<div class="su-tile main"><span>نزّلوا الموقع على الموبايل</span><b>${v.installed}</b><small>${esc(`${v.installedCustomers} عملاء أجل + ${v.installedSite} حسابات موقع`)}</small></div>` +
      `<div class="su-tile"><span>فتحوا آخر 7 أيام</span><b>${v.open7}</b><small>${esc(`من ${v.total} شخص`)}</small></div>` +
      `<div class="su-tile"><span>⏰ نزّلوا «منبه الدوا»</span><b>${v.app}</b><small>${esc(v.appPhones ? `${v.appPhones} موبايل بيقول «أنا شغّال»` : 'بيتعدّ من يوم التشغيل')}</small></div>` +
      `<div class="su-tile"><span>غالبًا شالوا</span><b>${v.away}</b><small>ما فتحوش من 30 يوم أو الإشعار رجع</small></div></div>` +
      `<input id="suQ" class="su-search" type="search" placeholder="🔍 دوّر باسم أو رقم موبايل" value="${esc(q)}" autocomplete="off">` +
      `<div class="su-chips">${FILTERS.map((f) => `<button type="button" class="chip${f === chip ? ' on' : ''}" data-su-chip="${f}">${esc(`${CHIP_TEXT[f]} ${counts[f]}`)}</button>`).join('')}</div>` +
      `<div id="suList"></div>` +
      `<div class="su-note"><b>الحالة بتتحسب إزاي:</b><span>${esc('🟢 شغّال: فتح آخر 7 أيام')}</span><span>${esc('🟡 هادي: آخر فتح من 8 لـ29 يوم')}</span>` +
      `<span>${esc('🔴 غالبًا شاله: ما فتحش من 30 يوم أو أكتر')}</span><span>${esc('⚫ شاله أو قفل الإشعارات: جوجل رجّعلنا إن عنوان موبايله مات')}</span><span>${esc('⚪ لسه ما فتحش: الرابط اتبعت وما اتفتحش')}</span>` +
      `<span>الموبايل والمتصفح ما بيبلّغوش أي موقع لما حد يشيل التطبيق، فده أقرب حاجة لـ«شاله». الأرقام بتبدأ من يوم التشغيل، وأرقام الموبايل مش متأكد منها بكود (مفيش SMS).</span></div>`;
    drawList();
    const sum = $('suSummary');
    if (sum) sum.textContent = `👥 المستخدمين · ${v.total}`;
  }
  async function open() {
    const d = $('siteUsers');
    if (!d || !db()) return;
    const { data, error } = await db().rpc('ar_people_list');
    // not the owner (staff), or the function is not on the server yet: the card stays away
    if (error || !data || !data.ok) { d.hidden = true; return; }
    d.hidden = false; last = { people: Array.isArray(data.people) ? data.people : [], apps: data.apps || {} }; draw();
  }
  const say = (t) => { const s = $('suStatus'); if (s) { s.textContent = t; s.className = 'status bad'; } };
  async function reset(id, btn) {
    if (!root.confirm('هتعمل باسورد جديد للمستخدم ده؟ الباسورد القديم بيبطل وموبايله بيخرج من الحساب.')) return;
    btn.disabled = true;
    try {
      const { data, error } = await db().rpc('ar_site_user_reset', { p_user: Number(id) });
      if (error || !data || !data.ok) throw error || new Error('no_user');
      shown.set(Number(id), data.password);
      drawList();
    } catch (e) {
      btn.disabled = false;
      say('ماتعملش: ' + (e && e.message ? e.message : 'جرب تاني'));
    }
  }
  async function remove(id, btn) {
    const p = last && last.people.find((x) => x.kind === 'site' && String(x.id) === String(id));
    if (!root.confirm(`هتمسح حساب ${p ? cleanName(p.name) : ''}؟ مش هيقدر يدخل بيه تاني، ولو عايز يرجع يعمل حساب جديد.`)) return;
    btn.disabled = true;
    try {
      const { data, error } = await db().rpc('ar_site_user_delete', { p_user: Number(id) });
      if (error || !data || !data.ok) throw error || new Error('no_user');
      last.people = last.people.filter((x) => !(x.kind === 'site' && String(x.id) === String(id)));
      shown.delete(Number(id));
      draw();
    } catch (e) {
      btn.disabled = false;
      say('ماتعملش: ' + (e && e.message ? e.message : 'جرب تاني'));
    }
  }
  const body = $('suBody');
  if (body) {
    body.addEventListener('click', (e) => {
      const r = e.target.closest('[data-su-reset]'); if (r) { reset(r.dataset.suReset, r); return; }
      const d = e.target.closest('[data-su-del]'); if (d) { remove(d.dataset.suDel, d); return; }
      const c = e.target.closest('[data-su-chip]');
      if (c) { chip = c.dataset.suChip; body.querySelectorAll('[data-su-chip]').forEach((b) => b.classList.toggle('on', b === c)); drawList(); }
    });
    body.addEventListener('input', (e) => { if (e.target && e.target.id === 'suQ') { q = e.target.value; drawList(); } });
  }
  root.AskerSiteUsers = { open };
})(typeof window === 'undefined' ? globalThis : window);
