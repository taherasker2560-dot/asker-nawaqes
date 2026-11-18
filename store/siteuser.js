/* «حساب الموقع» (owner 2026-11-17: «حسابات العملاء من غير باسورد، لكن الناس اللي هتنزّل الموقع هنعمله بباسورد حتى نعرف عدد المستخدمين»; his answer to
   «إجباري ولا اختياري؟»: «إجباري جوه التطبيق»). Anyone who opens the INSTALLED app without a customer's link makes an account once (name, mobile, password)
   before the app lets him in. The browser site needs no account. A customer with his link has no password (the link is his key) and is counted apart by the
   bot; the pharmacy's own phone (the bot signed in) is never asked. The server side is migration 202611170300 (ar_site_signup / ar_site_login / ar_site_me /
   ar_site_logout / ar_site_customer_open): the password is kept as a hash, the phone keeps a session token, the bot shows the owner the numbers.
   Honest limits: the mobile number is not checked by a code (no SMS); a browser never says when an app is removed. Loaded after store/account.js. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/site-user.cjs) ----------
  const wallet = (v) => {
    const P = typeof module !== 'undefined' && typeof require === 'function' ? require('./pay.js') : root.AskerStorePayLib;
    return P && P.cleanWallet ? P.cleanWallet(v) : '';
  };
  // the same rules as the server (a mobile number 01[0125]xxxxxxxx, a name of 2..60 letters, a password of 6..72 bytes)
  function check(f) {
    const name = String((f && f.name) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const phone = wallet(f && f.phone);
    const pw = String((f && f.password) || '');
    if (f && f.mode !== 'login' && name.length < 2) return { error: 'bad_name' };
    if (!phone) return { error: 'bad_phone' };
    if (pw.length < 6) return { error: 'bad_password' };
    if (typeof TextEncoder !== 'undefined' && new TextEncoder().encode(pw).length > 72) return { error: 'bad_password' };
    return { ok: true, name, phone, password: pw };
  }
  const platformOf = (ua, platform, touch) => {
    const u = String(ua || '');
    if (/iPad|iPhone|iPod/.test(u) || (platform === 'MacIntel' && Number(touch) > 1)) return 'ios';
    if (/Android/i.test(u)) return 'android';
    return 'desktop';
  };
  const TEXTS = {
    signupTitle: 'اعمل حسابك',
    loginTitle: 'ادخل على حسابك',
    signupSub: 'مرة واحدة بس، عشان طلباتك وبياناتك تلاقيها في أي موبايل.',
    loginSub: 'اكتب رقمك والباسورد اللي عملته.',
    name: 'اسمك',
    phone: 'رقم الموبايل (واتساب)',
    password: 'الباسورد (6 حروف أو أرقام على الأقل)',
    show: 'إظهار',
    hide: 'إخفاء',
    signup: 'سجّل وكمّل',
    login: 'ادخل',
    haveAccount: 'عندي حساب؟ ادخل',
    noAccount: 'معنديش حساب؟ سجّل',
    forgot: 'نسيت الباسورد؟ ابعتلنا على واتساب ونديك واحد جديد.',
    customerHint: 'لو صيدلية عسكر باعتالك رابط حسابك، افتحه من الرابط.',
    busyBtn: 'استنى ثانية…',
    signedAs: '👤 {n}',
    signOut: 'خروج',
    signOutAsk: 'تخرج من الحساب ده؟',
  };
  const ERRORS = {
    bad_name: 'اكتب اسمك (حرفين على الأقل).',
    bad_phone: 'رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015.',
    bad_password: 'الباسورد لازم يكون 6 حروف أو أرقام على الأقل.',
    exists: 'الرقم ده عنده حساب. دوس «عندي حساب؟ ادخل».',
    bad: 'الرقم أو الباسورد مش مظبوطين.',
    locked: 'جربت كتير. استنى ربع ساعة وجرب تاني، أو ابعتلنا على واتساب.',
    busy: 'الموقع زحمة دلوقتي. جرب بعد شوية.',
    down: 'مفيش نت أو حصلت مشكلة. جرب تاني.',
  };
  const api = { check, platformOf, TEXTS, ERRORS, KEY: 'asker_store_user' };
  if (typeof module !== 'undefined') module.exports = api;
  root.AskerSiteUserLib = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const KEY = api.KEY;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && /^[0-9a-f]{64}$/.test(v.t || '') ? v : null; } catch (e) { return null; } };
  const keep = (v) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* private window */ } };
  const platform = () => platformOf(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  let client = null, mode = 'signup', busy = false, error = '', typed = { name: '', phone: '' }, shown = false;
  const A = () => root.AskerStoreAccount || {};
  const standalone = () => !!(A().standalone && A().standalone());

  // the account is asked only inside the installed app, never on the pharmacy's own phone, never from a customer with his link
  const needed = () => standalone() && !(A().pharmacyPhone && A().pharmacyPhone()) && !(A().linked && A().linked()) && !read();

  function waHref() {
    const P = root.AskerStorePay, w = P && P.info ? P.info().whatsapp : '';
    if (!w) return '';
    const ph = wallet(typed.phone);
    return `https://wa.me/2${w}?text=${encodeURIComponent('نسيت الباسورد بتاع موقع صيدلية عسكر.' + (ph ? ' رقمي: ' + ph : ''))}`;
  }
  const fineHtml = () => { const wa = waHref(); return `${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener">${esc(TEXTS.forgot)}</a>` : esc(TEXTS.forgot)}<br>${esc(TEXTS.customerHint)}`; };
  function drawGate() {
    let g = $('siteGate');
    if (!shown) { if (g) g.remove(); document.documentElement.classList.remove('site-gate-open'); return; }
    const signup = mode === 'signup';
    if (!g) {
      g = document.createElement('div');
      g.id = 'siteGate'; g.className = 'site-gate'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-modal', 'true');
      document.body.appendChild(g);
      document.documentElement.classList.add('site-gate-open');
    }
    g.innerHTML = `<div class="site-gate-card"><div class="pay-grip"></div><h2>${esc(signup ? TEXTS.signupTitle : TEXTS.loginTitle)}</h2>` +
      `<p class="sg-sub">${esc(signup ? TEXTS.signupSub : TEXTS.loginSub)}</p>` +
      `<form id="sgForm" novalidate autocomplete="on">` +
      (signup ? `<label for="sgName">${esc(TEXTS.name)}</label><input id="sgName" type="text" autocomplete="name" maxlength="60" value="${esc(typed.name)}" />` : '') +
      `<label for="sgPhone">${esc(TEXTS.phone)}</label><input id="sgPhone" type="tel" dir="ltr" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="01xxxxxxxxx" value="${esc(typed.phone)}" />` +
      `<label for="sgPw">${esc(TEXTS.password)}</label><div class="sg-pw"><input id="sgPw" type="password" dir="ltr" autocomplete="${signup ? 'new-password' : 'current-password'}" maxlength="72" />` +
      `<button type="button" class="linklike" data-sg-show>${esc(TEXTS.show)}</button></div>` +
      `<p class="sg-err" id="sgErr" role="alert"${error ? '' : ' hidden'}>${esc(error)}</p>` +
      `<button type="submit" class="sg-main"${busy ? ' disabled' : ''}>${esc(busy ? TEXTS.busyBtn : signup ? TEXTS.signup : TEXTS.login)}</button></form>` +
      `<button type="button" class="linklike sg-switch" data-sg-mode>${esc(signup ? TEXTS.haveAccount : TEXTS.noAccount)}</button>` +
      `<p class="sg-fine">${fineHtml()}</p></div>`;
  }
  function openGate(m) { shown = true; mode = m || mode; error = ''; drawGate(); }
  function closeGate() { shown = false; drawGate(); }

  function drawLine() {
    const el = $('siteUserLine');
    if (!el) return;
    const s = read();
    el.hidden = !s;
    if (s) { $('siteUserName').textContent = TEXTS.signedAs.replace('{n}', s.n || ''); }
  }
  function signedIn(data) {
    keep({ t: data.token, n: data.user.name, p: data.user.phone });
    // the checkout knows him from now on
    try { localStorage.setItem('asker_store_me', JSON.stringify({ name: data.user.name, phone: data.user.phone })); } catch (e) { /* private window */ }
    const n = $('cName'), p = $('cPhone');
    if (n && !n.value) n.value = data.user.name;
    if (p && !p.value) p.value = data.user.phone;
    closeGate();
    drawLine();
  }
  async function submit() {
    if (busy || !client) return;
    const f = { mode, name: ($('sgName') || {}).value, phone: ($('sgPhone') || {}).value, password: ($('sgPw') || {}).value };
    typed = { name: String(f.name || ''), phone: String(f.phone || '') };
    const c = check(f);
    if (c.error) { error = ERRORS[c.error]; drawGate(); return; }
    busy = true; error = ''; drawGate();
    try {
      const args = mode === 'login'
        ? { p_phone: c.phone, p_password: c.password, p_platform: platform(), p_standalone: standalone() }
        : { p_name: c.name, p_phone: c.phone, p_password: c.password, p_platform: platform(), p_standalone: standalone() };
      const { data, error: err } = await client.rpc(mode === 'login' ? 'ar_site_login' : 'ar_site_signup', args);
      if (err || !data) throw err || new Error('empty');
      if (!data.ok) { error = ERRORS[data.error] || ERRORS.down; busy = false; drawGate(); return; }
      busy = false;
      signedIn(data);
    } catch (e) {
      busy = false; error = ERRORS.down; drawGate();
    }
  }

  // every open: is the saved session still good (and the «opened» / «installed» marks); a customer's link inside the app marks it installed
  async function check_() {
    if (!client) return;
    const a = A();
    if (a.pharmacyPhone && a.pharmacyPhone()) { closeGate(); drawLine(); return; }
    if (a.linked && a.linked()) {
      closeGate(); drawLine();
      if (standalone() && a.token) { try { await client.rpc('ar_site_customer_open', { p_token: a.token(), p_standalone: true }); } catch (e) { /* the mark can wait */ } }
      return;
    }
    const s = read();
    if (s) {
      try {
        const { data, error: err } = await client.rpc('ar_site_me', { p_token: s.t, p_event: 'open', p_platform: platform(), p_standalone: standalone() });
        if (!err && data && data.ok) { drawLine(); closeGate(); return; }
        if (!err && data && data.error === 'session') keep(null); // the server does not know this phone any more
        else { drawLine(); return; }                              // no net: he is not locked out because of that
      } catch (e) { drawLine(); return; }
    }
    drawLine();
    if (needed()) openGate(mode); else closeGate();
  }

  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-sg-show]')) {
      const i = $('sgPw'), b = e.target.closest('[data-sg-show]');
      if (i) { const on = i.type === 'password'; i.type = on ? 'text' : 'password'; b.textContent = on ? TEXTS.hide : TEXTS.show; }
      return;
    }
    if (e.target.closest('[data-sg-mode]')) {
      typed = { name: ($('sgName') || {}).value || typed.name, phone: ($('sgPhone') || {}).value || typed.phone };
      mode = mode === 'signup' ? 'login' : 'signup'; error = ''; drawGate();
      return;
    }
    if (e.target.closest('#siteUserOut')) {
      if (!root.confirm(TEXTS.signOutAsk)) return;
      const s = read();
      keep(null); drawLine();
      if (s && client) { try { await client.rpc('ar_site_logout', { p_token: s.t }); } catch (err) { /* it ends on the phone anyway */ } }
      check_();
    }
  });
  document.addEventListener('submit', (e) => { if (e.target && e.target.id === 'sgForm') { e.preventDefault(); submit(); } });
  // the install event (a browser tab): the signed-in person is marked installed
  window.addEventListener('appinstalled', async () => {
    const s = read();
    if (s && client) { try { await client.rpc('ar_site_me', { p_token: s.t, p_event: 'installed', p_platform: platform(), p_standalone: false }); } catch (e) { /* later */ } }
  });
  // a customer forgot his link on this phone, or it stopped working: inside the installed app he is asked for an account like anyone
  window.addEventListener('asker-customer-changed', () => { check_(); });
  // the pharmacy's WhatsApp number arrives a moment after the page: only the «forgot» line is touched (what he already typed stays)
  if (root.AskerStorePay && root.AskerStorePay.onChange) root.AskerStorePay.onChange(() => { const f = document.querySelector('#siteGate .sg-fine'); if (f) f.innerHTML = fineHtml(); });

  // «منبه الدوا» on this phone (owner 2026-11-18: «عايز أشوف الناس اللي بتنزل الأبليكيشن»): once the app opened from the site's button, store/alarm.js keeps
  // asker_dose_app = 1; the server is told who has it (his own secret only: a customer's / member's link or this account's session; migration 202611190030
  // ar_app_seen), at most once every 12 hours, never from the pharmacy's own phone. The owner's «👥 المستخدمين» shows «⏰ نزّل المنبه» next to him.
  const APP_FLAG = 'asker_dose_app', APP_SAID = 'asker_app_seen_at', APP_EVERY = 12 * 3600e3;
  async function appSeen() {
    if (!client) return;
    const a = A();
    if (a.pharmacyPhone && a.pharmacyPhone()) return;
    let flag = null, said = 0;
    try { flag = JSON.parse(localStorage.getItem(APP_FLAG) || 'null'); said = Number(localStorage.getItem(APP_SAID) || 0); } catch (e) { return; }
    if (flag !== 1 || Date.now() - said < APP_EVERY) return;
    const tok = a.linked && a.linked() && a.token ? a.token() : null, s = read();
    if (!tok && !s) return;
    try {
      const { data } = await client.rpc('ar_app_seen', { p_token: tok || null, p_site_token: tok ? null : s.t });
      if (data && data.ok) localStorage.setItem(APP_SAID, String(Date.now()));
    } catch (e) { /* next time */ }
  }
  // back from «منبه الدوا» (the button opened it: the flag was just set) or any later open
  document.addEventListener('visibilitychange', () => { if (!document.hidden) appSeen(); });

  root.AskerSiteUser = {
    attach(c) { client = c; check_().then(appSeen, appSeen); },
    signedIn: () => !!read(),
    gateOpen: () => shown,
  };
})(typeof window === 'undefined' ? globalThis : window);
