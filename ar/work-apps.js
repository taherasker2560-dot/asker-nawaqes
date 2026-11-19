/* «📱 تطبيقات الشغل» (owner 2026-11-19: «عندي على الموبايل كام أبليكيشن خاصين بالشغل، عايز أدخلهم بطريقة ما جوه السيستم: الكاميرات، ابن سينا،
   فارما، دراج آي، جرعات الأدوية، إنستا باي، واتساب للأعمال»; he said «ا» to mockups/work_apps_2026-11-19.png).
   - Each app is a button the owner can put on the home («✏️ عدّل الزراير» ← «تطبيقات الشغل») and drag like the others (ar/shortcuts.js).
   - Inside the work the app opens with the thing ready ON THE CLIPBOARD: an order «انسخ وافتح ابن سينا / فارما», an item «دراج آي» / «الجرعات»
     (its name), a payment «إنستا باي» (the amount). Any element with data-app="<id>" (and data-copy="<text>") does it.
   - How it opens, on Android (the owner's phone): a page cannot start another app's own screen (Chrome only starts links an app agreed to take), so
     EVERY app is handed to «مفتاح التطبيقات» (apps-android/, the owner's small app): intent://open?app=<id>&name=<label>. That app starts the app HE chose:
     the first time a button is tapped it shows the list of the apps he really has and asks «اختار تطبيق …» once; after that it opens at once.
     The packages are NOT guessed from the web any more (11-19: a guessed package opened another «ابن سينا» app, and WhatsApp Business's link without «/?»
     opened nothing); only WhatsApp Business's package is certain (com.whatsapp.w4b: tried first, also sent as &pkg= so the first version of the helper opens it).
     A phone without the helper follows the link's fallback: the helper's download (WhatsApp Business: its store page). The sheet «✏️ عدّل الزراير» has the download link.
   - On a computer the apps are not there: WhatsApp Business opens WhatsApp Web; the others say so in one line.
   Nothing here reads inside those apps, pays, orders or sends anything: it opens them and hands them text. */
(function (root) {
  'use strict';

  // [id, label, a package that is CERTAIN (only WhatsApp Business), the computer's way (a web page)]: the rest is chosen on his phone
  const APPS = [
    { id: 'wab', label: 'واتساب بيزنس', pkg: 'com.whatsapp.w4b', web: 'https://web.whatsapp.com/' },
    { id: 'cams', label: 'الكاميرات', pkg: '', web: '' },
    { id: 'ibnsina', label: 'ابن سينا', pkg: '', web: '' },
    { id: 'pharma', label: 'فارما', pkg: '', web: '' },
    { id: 'drugeye', label: 'دراج آي', pkg: '', web: '' },
    { id: 'doses', label: 'الجرعات', pkg: '', web: '' },
    { id: 'instapay', label: 'إنستا باي', pkg: '', web: '' },
  ];  const BY_ID = Object.fromEntries(APPS.map((a) => [a.id, a]));
  const TEXTS = {
    phoneOnly: 'التطبيق ده على الموبايل بس.',
    unknown: 'لسه ما عرفتش التطبيق ده على موبايلك.',
    copied: '✅ اتنسخ {what}.',
    paste: 'الصق جوه التطبيق.',
    opened: '{app} اتفتح.',
    // through «مفتاح التطبيقات»: the app opens, or its list asks «اختار تطبيق …» the first time (the page cannot tell which)
    store: '{app} بيفتح.',
    keyHint: '🔑 التطبيقات بتفتح من «مفتاح التطبيقات»: نزّله مرة واحدة على موبايلك (أندرويد بس). أول مرة تدوس على زرار تطبيق بيسألك تختاره من اللي على موبايلك، وبعد كده بيفتح بدوسة.',
    keyLink: 'نزّل «مفتاح التطبيقات»',
    noCopy: 'مقدرتش أنسخ، انسخ بإيدك.',
  };
  const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => String(o[k] == null ? '' : o[k]));

  // ---------- pure (tests/work-apps.cjs) ----------
  const PKG = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i;
  const storeWeb = (pkg) => 'https://play.google.com/store/apps/details?id=' + pkg;
  // «مفتاح التطبيقات» (apps-android/, owner 2026-11-19 «أ، اعمله»): the owner's small Android app that starts the app HE chose for a button (asked once, on his phone)
  const KEY_PKG = 'com.askerpharmacy.apps';
  const KEY_APK = 'https://github.com/taherasker2560-dot/asker-nawaqes/releases/download/apps-build/asker-apps.apk';
  // the link a button follows on Android: the helper with the app's id and its name (for «اختار تطبيق …»); WhatsApp Business's certain package rides along (&pkg=);
  // a phone without the helper goes to its fallback: the helper's download (WhatsApp Business: its store page)
  function intentFor(app) {
    if (!app || !/^[a-z][a-z0-9_]{0,30}$/.test(app.id || '')) return '';
    const pkg = PKG.test(app.pkg || '') ? app.pkg : '';
    const fallback = pkg ? storeWeb(pkg) : KEY_APK;
    return `intent://open?app=${app.id}&name=${encodeURIComponent(app.label || '')}${pkg ? '&pkg=' + pkg : ''}#Intent;scheme=askerapps;package=${KEY_PKG};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
  }
  // what a tap does on this device: { url } to go to, or { say } when there is nothing to open here
  function plan(id, android) {
    const app = BY_ID[id];
    if (!app) return { say: TEXTS.unknown };
    if (android) return { url: intentFor(app) };
    return app.web ? { url: app.web, web: true } : { say: TEXTS.phoneOnly };
  }
  // the sentences under the tap: what was copied (true / false = failed / null = nothing to copy), how the app opens, «الصق»
  // (separate sentences, each its own line on the page, so the English engine finds each one)
  function note(p, copied, what, name) {
    const c = copied === true ? fill(TEXTS.copied, { what: what || 'النص' }) : copied === false ? TEXTS.noCopy : '';
    if (p.say) return [c, p.say].filter(Boolean);
    return [c, p.web ? fill(TEXTS.opened, { app: name }) : fill(TEXTS.store, { app: name }), copied === true ? TEXTS.paste : ''].filter(Boolean);
  }  // the trade name of a PharmaFly item for an app's search box: the words before the first one with a digit («CONCOR 5MG 30 TAB» → «CONCOR»,
  // «MELLITOFIX TRIO 25/5/1000 TAB» → «MELLITOFIX TRIO»); a name that starts with a digit stays whole
  function brandOf(name) {
    const w = String(name || '').replace(/\s+/g, ' ').trim().split(' ');
    const out = [];
    for (const x of w) { if (/\d/.test(x)) break; out.push(x); }
    return (out.length ? out.join(' ') : w.join(' ')).slice(0, 80);
  }
  // the apps a supplier's order can be pasted into (ar/order-drafts.js supplier ids)
  const ORDER_APP = { IBNSINA: 'ibnsina', PHARMA: 'pharma' };
  const api = { APPS, BY_ID, TEXTS, ORDER_APP, KEY_PKG, KEY_APK, intentFor, plan, note, brandOf, fill };
  root.AskerWorkAppsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const isAndroid = () => /Android/i.test(navigator.userAgent || '');
  document.documentElement.classList.toggle('is-android', isAndroid());
  let toastTimer = 0;
  function toast(lines) {
    let t = document.getElementById('appToast');
    if (!t) { t = document.createElement('div'); t.id = 'appToast'; t.className = 'qa-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.replaceChildren(...lines.flatMap((s, i) => { const x = document.createElement('span'); x.textContent = s; return i ? [document.createTextNode(' '), x] : [x]; }));
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
  }
  // copy first (inside the tap, before the phone switches to the other app), then open
  async function copy(text) {
    if (!text) return null;
    try {
      await Promise.race([navigator.clipboard.writeText(text), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 900))]);
      return true;
    } catch (e) { return false; }
  }
  async function open(id, text, what) {
    const app = BY_ID[id], p = plan(id, isAndroid());
    const copied = await copy(text); // null = nothing to copy
    toast(note(p, copied, what, app ? app.label : ''));
    if (p.say) return p;
    if (p.web) root.open(p.url, '_blank', 'noopener');
    else root.AskerWorkApps.go(p.url);
    return p;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest ? e.target.closest('[data-app]') : null;
    if (!b || b.disabled) return;
    e.preventDefault();
    open(b.dataset.app, b.dataset.copy || '', b.dataset.copyWhat || '');
  });
  // go = how an Android link is followed (inside the tap; the browser tests put a recorder here)
  root.AskerWorkApps = { open, android: isAndroid, brandOf, ORDER_APP, TEXTS, KEY_APK, go:(url) => { root.location.href = url; }, plan: (id) => plan(id, isAndroid()), label: (id) => (BY_ID[id] ? BY_ID[id].label : '') };
})(typeof window === 'undefined' ? globalThis : window);
