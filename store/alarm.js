/* «⏰ منبه الدوا» on the customer's own page (owner 2026-11-17: «زر منبه مواعيد الأدوية»; «عاوز المنبه عنده ينطق بالصوت برضه، إن شاء الله صوت جوجل عشان ما يكلفناش»; he said
   «مش شايف منبه الجرعات في الصورة» then «فين يا عم المنبه؟ … ما تقعدش تسقط مني»).
   - The customer picks a medicine (one of the items he usually takes, or any name he types), how many times a day and the times. At the time the phone rings: a full-screen card with the
     medicine's name, a vibration, and the phone SAYS «ميعاد دواء <the name>» with its own voice (the browser's speech engine: on Android it is Google's, free, no server, no cost to the pharmacy).
     «خدته ✓» closes it; «ذكّرني بعد 10 دقايق» comes back. If the page is hidden when the time comes, a phone notification shows too (when he allowed notifications).
   - The alarms (names and times) are kept ON HIS PHONE (localStorage). Without the notifications nothing is sent anywhere.
   - Stage 1: it rings while the pharmacy's page is open on his phone (a tab or the installed app, even in the background while the browser is alive). A missed time still shows for 10 minutes
     when he opens the page.
   - Stage 2 (the same night, owner: «انجز»): when he turns the notifications on, a push at each dose time reaches the phone even with the browser closed (store/dose/sw.js shows «ميعاد دواك», a tap
     opens the page, which rings and says the name). For that the server keeps ONLY the clock times of his alarms next to his push address (table ar_dose_push, function asker-dose, migration
     202611172300): never a medicine name, never who he is. The names stay on his phone.
   - Alarms the PHARMACY sets for a customer (owner 2026-11-18: «لو هو مش عارف يظبط المنبه هظبطه له أنا من عندي»): on the pharmacy's own phone (the owner's «👁 شوف صفحته» look, the system signed in there) the sheet edits THAT customer's
     alarms on the server (table ar_customer_alarms, migration 202611180100); on his phone they come with a «من الصيدلية» mark, ring like his own, and he can switch them off but not change them. His own alarms stay on his phone only.
   - The owner's look never rings.
   Loaded before store/account.js, which draws the tile and nothing else here. */
(function (root) {
  'use strict';
  const KEY = 'asker_dose_alarms', FIRED = 'asker_dose_fired';
  const CHECK_MS = 15000;     // how often the page looks at the clock
  const LATE_MIN = 10;        // a time that passed while the page was closed still rings for 10 minutes
  const OPEN_LATE_MIN = 90;   // he came from the dose notification: the time that notification was for rings even if he is an hour late
  const SNOOZE_MIN = 10;
  const SAY_EVERY_MS = 22000, MAX_SAYS = 3;
  const PRESETS = { once: ['08:00'], twice: ['08:00', '20:00'], thrice: ['08:00', '14:00', '20:00'], eight: ['06:00', '14:00', '22:00'] };
  const TEXTS = {
    tile: '⏰ منبه الدوا',
    tileHint: 'يقولك بصوته: «ميعاد دواك»',
    oneOn: 'منبه واحد شغال',
    twoOn: 'منبهين شغالين',
    someOn: '{n} منبهات شغالة',
    manyOn: '{n} منبه شغال',
    title: 'منبه الدوا',
    newTitle: 'منبه جديد',
    editTitle: 'تعديل المنبه',
    hint: 'اختار الدوا وحدد المواعيد، وعند الميعاد الموبايل بيقولك اسم الدوا بصوته. المواعيد محفوظة على موبايلك انت بس.',
    empty: 'لسه مفيش منبهات. دوس «＋ منبه جديد».',
    add: '＋ منبه جديد',
    speak: '🔊 ينطق اسم الدوا بصوت الموبايل',
    tryVoice: '▶ جرّب الصوت',
    tryPhrase: 'ميعاد دواء تجريبي الآن، خدمة مقدمة من صيدلية عسكر',
    notifOn: '🔔 فعّل الإشعارات',
    notifWhy: 'مواعيد الجرعات بس (من غير اسم الدوا) بتتبعت لسيرفر الصيدلية عشان الإشعار يوصلك والمتصفح مقفول. اسم الدوا بيفضل على موبايلك.',
    notifDone: 'الإشعارات شغالة: هيجيلك إشعار وقت الجرعة حتى والمتصفح مقفول، ودوسة عليه تفتح الصفحة وتنطق اسم الدوا.',
    notifNo: 'الإشعارات مقفولة من إعدادات المتصفح',
    open: 'المنبه بيرن لما صفحة الصيدلية تكون مفتوحة على موبايلك. فعّل الإشعارات عشان يوصلك وقت الجرعة حتى والمتصفح مقفول.',
    noVoice: 'موبايلك مفيهوش صوت عربي جاهز، فالمنبه هيستخدم الصوت الطبيعي من الإنترنت (لازم نت وقت ضبط المنبه). وعشان صوت الموبايل: إعدادات الموبايل ← اللغة ← تحويل النص إلى كلام.',
    forCustomer: 'بتظبط منبهات {n} من عندك. هتظهر في صفحته بعلامة «من الصيدلية» ويرنّ عند الميعاد على موبايله، وهو يقدر يقفلها بس مايعدّلهاش.',
    fromPharmacy: 'من الصيدلية',
    notifTest: '🔔 جرّب الإشعار',
    notifTestTitle: '🔔 تجربة منبه الدوا',
    notifTestBody: 'لو سمعت صوت وظهر الإشعار ده، المنبه هيوصلك كده وقت الجرعة. دوس عليه.',
    notifSound: 'لو الإشعار جه من غير صوت: اتأكد إن الموبايل مش على الصامت، وافتح إعدادات الموبايل ← التطبيقات ← المتصفح ← الإشعارات ← صيدلية عسكر وشغّل الصوت.',
    which: 'أي دوا؟',
    fromUsual: '(من اللي بتاخده دايمًا)',
    other: '＋ دوا تاني (اكتب اسمه)',
    namePh: 'اكتب اسم الدوا',
    freq: 'كام مرة في اليوم؟',
    once: 'مرة',
    twice: 'مرتين',
    thrice: '3 مرات',
    eight: 'كل 8 ساعات',
    times: 'مواعيد الجرعات',
    addTime: '＋ ميعاد',
    removeTime: 'شيل الميعاد',
    says: 'هيقول:',
    // what the phone says (owner 2026-11-18: «ميعاد فيموجيسال الآن، خدمة مقدمة من صيدلية عسكر بالظبط كده»)
    sayName: 'ميعاد {n} الآن، خدمة مقدمة من صيدلية عسكر',
    speakFail: 'الموبايل ما نطقش الاسم. اتأكد إن صوت الوسائط مش واطي أو على الصامت، وإن عندك صوت عربي: إعدادات الموبايل ← تحويل النص إلى كلام.',
    save: 'حفظ المنبه',
    del: '🗑 احذف المنبه',
    needName: 'اكتب اسم الدوا الأول',
    needTime: 'ضيف ميعاد واحد على الأقل',
    ringTitle: '⏰ ميعاد الدوا',
    took: '✓ خدته',
    hear: '🔊 اسمع الاسم',
    tapHint: 'دوس في أي مكان عشان تسمع اسم الدوا',
    testName: 'تجربة المنبه',
    // the voice test and the check (owner 2026-11-18: «زرار جرّب الصوت من عند العميل ما بيشتغلش»): the answer is written on the page, never silent
    trying: 'بيجرّب الصوت…',
    triedServer: '✓ اتنطق بالصوت الطبيعي',
    triedPhone: '✓ اتنطق بصوت الموبايل',
    triedFail: 'ما نطقش. دوس «🔍 فحص الصوت» وصوّر النتيجة.',
    diag: '🔍 فحص الصوت',
    diagBusy: 'بيفحص…',
    diagCopy: '📋 انسخ النتيجة',
    diagCopied: 'اتنسخت ✓',
    // the pharmacy's own phone saving a customer's alarms (his sign-in as the owner is needed: without it the server refuses, and the page used to say nothing)
    adminFail: 'ما اتحفظش على السيرفر: مفيش دخول للسيستم على الموبايل ده. افتح السيستم وسجّل دخول وارجع.',
    adminSaved: '✓ اتحفظ. هيظهر عند العميل أول ما يفتح صفحته.',
    snooze: '⏱ ذكّرني بعد 10 دقايق',
    notifTitle: '⏰ ميعاد دواك',
    back: 'رجوع',
    on: 'شغال',
    off: 'واقف',
    am: 'ص',
    pm: 'م',
  };
  const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => String(o[k]));

  // ---------- pure helpers (also used by tests/store-alarm.cjs) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const minutesOf = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); if (!m || +m[1] > 23 || +m[2] > 59) return null; return +m[1] * 60 + +m[2]; };
  const hhmmOf = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  // «8:00 ص» / «8:00 م» / «12:30 م» (12-hour, as people read it)
  function timeText(hhmm) {
    const min = minutesOf(hhmm); if (min == null) return '';
    const h = Math.floor(min / 60), m = min % 60;
    return `${h % 12 || 12}:${pad(m)} ${h < 12 ? TEXTS.am : TEXTS.pm}`;
  }
  // the times of one alarm: valid ones only, no duplicates, in the order of the day
  const normTimes = (list) => [...new Set((Array.isArray(list) ? list : []).map((t) => minutesOf(t)).filter((m) => m != null))].sort((a, b) => a - b).map(hhmmOf);
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // what is kept must look like what we wrote; anything else is «no alarms»
  function clean(o) {
    const out = { v: 1, speak: !(o && o.speak === false), items: [], snoozes: [] };
    for (const x of (o && Array.isArray(o.items) ? o.items : []).slice(0, 40)) {
      const times = normTimes(x && x.times), name = String((x && x.name) || '').trim().slice(0, 80);
      if (!x || !x.id || !name || !times.length) continue;
      out.items.push({ id: String(x.id).slice(0, 40), name, say: String(x.say || '').trim().slice(0, 80), times, on: x.on !== false });
    }
    for (const s of (o && Array.isArray(o.snoozes) ? o.snoozes : []).slice(0, 40)) if (s && s.id && Number.isFinite(+s.at)) out.snoozes.push({ id: String(s.id), at: +s.at, time: String(s.time || '') });
    return out;
  }
  // the alarms that ring now: a time of an alarm that is on, passed in the last LATE_MIN minutes today and not rung yet, or a snooze that is over; a hidden `key` stops a second ring
  function dueNow(data, now, fired, lateMin) {
    const nowMin = now.getHours() * 60 + now.getMinutes(), day = dayKey(now), out = [], lim = lateMin == null ? LATE_MIN : lateMin;
    for (const it of data.items) {
      if (!it.on) continue;
      for (const t of it.times) {
        const key = `${day}|${it.id}|${t}`, m = minutesOf(t), late = nowMin - m;
        if (late >= 0 && late <= lim && !(fired && fired[key])) out.push({ id: it.id, name: it.name, say: it.say || it.name, time: t, key });
      }
    }
    for (const s of data.snoozes) {
      const it = data.items.find((x) => x.id === s.id), key = `snooze|${s.id}|${s.at}`;
      if (it && it.on && now.getTime() >= s.at && !(fired && fired[key])) out.push({ id: it.id, name: it.name, say: it.say || it.name, time: s.time, key, snooze: s.at });
    }
    return out;
  }
  // the name as it is SAID: the brand only, without the form and the strength after it («فيموجيسال ق» → «فيموجيسال»; «زانبرازان ٢٠ قرص» → «زانبرازان»); the card and the list keep the full name
  const FORM_TAIL = /^(ق|ك|ش|قرص|اقراص|أقراص|كبسولة|كبسولات|شراب|حقنة|أمبول|امبول|فوار|نقط|نقطة|كريم|مرهم|لبوس|بخاخ|مجم|ملجم|جم|مل|ملي|mg|ml|g)$/i, NUM_TAIL = /^[0-9٠-٩]+(?:[.,٫][0-9٠-٩]+)?$/;
  function spokenName(name) {
    const orig = String(name == null ? '' : name).replace(/\s+/g, ' ').trim(), parts = orig.split(' ');
    while (parts.length > 1 && (FORM_TAIL.test(parts[parts.length - 1]) || NUM_TAIL.test(parts[parts.length - 1]))) parts.pop();
    return parts.join(' ') || orig;
  }
  const sayText = (name) => fill(TEXTS.sayName, { n: spokenName(name) });
  // the sentence the phone says for what is due now: one medicine, or several («ميعاد أ، وب الآن، خدمة مقدمة من صيدلية عسكر»)
  const sayDue = (due) => fill(TEXTS.sayName, { n: due.map((d) => spokenName(d.say)).join('، و') });
  const onCount = (data) => data.items.filter((x) => x.on).length;
  const countText = (n) => (n === 1 ? TEXTS.oneOn : n === 2 ? TEXTS.twoOn : fill(n >= 3 && n <= 10 ? TEXTS.someOn : TEXTS.manyOn, { n }));
  const newId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // a time on a phone's clock as Cairo reads it (the pharmacy's clock the server uses: summer time included); the same when the phone is in Cairo. `phoneTz` is for tests.
  function cairoTime(hhmm, now, phoneTz) {
    const m = minutesOf(hhmm); if (m == null) return null;
    try {
      const phone = phoneTz || new Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!phone || phone === 'Africa/Cairo') return hhmm;
      const f = (tz, d) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
      // the instant when the phone's clock shows hh:mm today: start from the same wall time read as UTC and correct it by what the phone's zone says
      const base = new Date(now || Date.now()), day = f(phone, base);
      let t = Date.UTC(+day.year, +day.month - 1, +day.day, Math.floor(m / 60), m % 60);
      for (let k = 0; k < 2; k++) { const w = f(phone, new Date(t)); t += Date.UTC(+day.year, +day.month - 1, +day.day, Math.floor(m / 60), m % 60) - Date.UTC(+w.year, +w.month - 1, +w.day, +w.hour, +w.minute); }
      const c = f('Africa/Cairo', new Date(t));
      return `${c.hour}:${c.minute}`;
    } catch (e) { return hhmm; }
  }  const api = { cairoTime, TEXTS, KEY, PRESETS, LATE_MIN, OPEN_LATE_MIN, SNOOZE_MIN, spokenName, minutesOf, hhmmOf, timeText, normTimes, clean, dueNow, sayText, sayDue, countText, onCount, dayKey, newId };
  root.AskerStoreAlarmLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // the pharmacy's own phone = the bot is signed in here: a look only (kept for this tab, never rings)
  const pharmacy = (() => { try { return Object.keys(localStorage).some((k) => /^sb-[a-z0-9]+-auth-token$/.test(k)); } catch (e) { return false; } })();
  const box = () => root.localStorage;
  const read = (k) => { try { return JSON.parse(box().getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { box().setItem(k, JSON.stringify(v)); } catch (e) { /* private window: it stays until the page is closed */ } };
  // his own alarms (on his phone); on the pharmacy's phone `data` holds the alarms of the customer being looked at, saved to the server
  let data = pharmacy ? clean(null) : clean(read(KEY));
  // the alarms the PHARMACY set for this customer: they live on the server, are cached here so they ring offline, and he can only switch them on / off
  const PH_KEY = 'asker_dose_pharmacy';
  let ph = pharmacy ? { items: [], off: {} } : (() => { const o = read(PH_KEY) || {}; return { items: clean({ items: o.items }).items.map((x) => ({ ...x, ph: true })), off: o.off && typeof o.off === 'object' ? o.off : {} }; })();
  const all = () => ({ ...data, items: data.items.concat(ph.items.map((x) => ({ ...x, ph: true, on: x.on !== false && !ph.off[x.id] }))) });
  let token = null, adminTimer = null;
  const save = () => { if (pharmacy) { adminSave(); return; } write(KEY, data); write(PH_KEY, { items: ph.items, off: ph.off }); syncServer(); prefetchVoices(); mirrorAlarms(); };
  let view = '', draft = null, error = '', ring = null, sayCount = 0, sayTimer = null, voiceOk = null, timer = null, client = null, voiceNote = '', diag = null, adminNote = '', adminC = null, diagBusy = false, diagCopied = false;

  // ---------- the voice: the phone's own speech engine (Google's on Android) ----------
  const synth = () => (root.speechSynthesis && root.SpeechSynthesisUtterance ? root.speechSynthesis : null);
  function arabicVoice() {
    const s = synth(); if (!s) return null;
    let v = []; try { v = s.getVoices() || []; } catch (e) { v = []; }
    return v.find((x) => /^ar[-_]EG/i.test(x.lang)) || v.find((x) => /^ar/i.test(x.lang)) || null;
  }
  // Says the sentence with the phone's own voice, trying three ways before giving up (owner 2026-11-18, a photo of the card on his phone: «اسمع الاسم مبينطقش ولا بيعمل حاجة»):
  // 0 = the Arabic (Egypt) voice the engine lists; 1 = «ar» with the engine's own choice (a listed voice that is not really installed stays silent); 2 = the engine's default.
  // A try that ends without ever starting, with an error, or with no word at all in 3.5 seconds (an engine that is not there swallows the sentence) goes to the next one; when all fail the answer says so
  // with the engine's reason, so a phone that cannot speak is not a silent mystery. `done({ok, how, code})` is told the result (default: the ring card).
  function say(text, done) {
    const s = synth();
    const report = (r) => {
      if (done) { done(r); return; }
      if (!ring) return;
      if (r.ok) { ring.spoke = true; ring.speakErr = ''; } else { ring.speakErr = r.code || 'unknown'; drawRing(); }
    };
    if (!s || !data.speak) { if (done && data.speak) report({ ok: false, code: 'no-speechSynthesis' }); return false; }
    const attempt = (n) => {
      try {
        const u = new root.SpeechSynthesisUtterance(text), v = n === 0 ? arabicVoice() : null;
        u.lang = n === 0 ? (v ? v.lang : 'ar-EG') : n === 1 ? 'ar' : ''; if (v) u.voice = v; u.rate = 0.9; u.volume = 1;
        let started = false, handled = false, timer = null;
        const t0 = Date.now();
        const next = (code) => { if (handled) return; handled = true; clearTimeout(timer); if (n < 2) attempt(n + 1); else report({ ok: false, code }); };
        u.onstart = () => { started = true; clearTimeout(timer); report({ ok: true, how: 'phone' }); };   // a browser that is not allowed to speak yet never starts: the card then asks for a tap
        u.onend = () => { if (!started && Date.now() - t0 < 600) next('silent'); };   // «ended» at once without ever starting = nothing was said (a real sentence takes seconds)
        u.onerror = (e) => {
          const c = e && e.error;
          if (c === 'canceled' || c === 'interrupted') return;   // our own cancel of the one before
          if (c === 'not-allowed') { clearTimeout(timer); if (ring && !ring.spoke) askTap(); else if (done) report({ ok: false, code: 'not-allowed' }); return; }   // Chrome says so out loud: no tap yet on this page
          next(c);
        };
        timer = setTimeout(() => { if (!started && !handled) { try { s.cancel(); } catch (e) { /* nothing to cancel */ } next('timeout'); } }, 3500);
        s.speak(u);
      } catch (e) { if (n < 2) attempt(n + 1); else report({ ok: false, code: 'exception' }); }
    };
    try {
      if (ring) ring.speakErr = '';
      if (typeof s.resume === 'function') s.resume();   // Chrome on Android can leave the queue paused after the page was in the background
      // a speech still running or waiting is cancelled first, and the new one starts a moment later (cancel + speak in one breath is dropped on some phones)
      if (s.speaking || s.pending) { s.cancel(); setTimeout(() => attempt(0), 90); } else attempt(0);
      return true;
    } catch (e) { return false; }
  }
  // ---------- the natural voice: the sentence made once by the server (Gemini's speech model, the one «آدم» speaks with), kept on THIS phone ----------
  // (owner 2026-11-18: the phone's own speech engine stayed silent on his customer's phone, so the alarm no longer depends on it: a sound file plays on every phone that can play a sound.
  // The phone's own voice stays as the second way.) Asked when an alarm is saved or the page opens, so at the dose time the sentence is already here, even with no internet.
  const VOICE_CACHE = 'asker-dose-voice-v1', TRY_NAME = 'دواء تجريبي';
  const memVoice = new Map();   // where the Cache API is missing
  const voiceKey = (n) => 'https://asker-dose-voice.invalid/' + encodeURIComponent(spokenName(n));
  async function cacheGet(n) {
    try {
      if (root.caches) { const r = await (await root.caches.open(VOICE_CACHE)).match(voiceKey(n)); if (r) { const b = await r.blob(); if (b && b.size > 1000) return b; } }
    } catch (e) { /* no cache */ }
    return memVoice.get(voiceKey(n)) || null;
  }
  async function cachePut(n, blob) {
    memVoice.set(voiceKey(n), blob);
    try { if (root.caches) await (await root.caches.open(VOICE_CACHE)).put(voiceKey(n), new Response(blob, { headers: { 'Content-Type': 'audio/wav' } })); } catch (e) { /* kept in memory only */ }
  }
  // from the function; {blob} or {error: why} (the why is written on the check page)
  async function fetchVoice(n, ms) {
    if (!client || !client.functions) return { error: 'no-client' };
    const gaveUp = new Promise((ok) => setTimeout(() => ok({ error: 'timeout' }), ms || 12000));
    try {
      const r = await Promise.race([client.functions.invoke('asker-dose', { body: { action: 'voice', name: spokenName(n) } }), gaveUp]);
      if (r && r.error && typeof r.error === 'string') return r;
      if (r && r.error) {
        let why = String(r.error.message || r.error);
        try { if (r.error.context && r.error.context.status) { const j = await r.error.context.clone().json().catch(() => null); why = r.error.context.status + (j && j.error ? ' ' + j.error : ''); } } catch (e) { /* the status is enough */ }
        return { error: why.slice(0, 60) };
      }
      const b = r && r.data;
      return b && typeof b.size === 'number' && b.size > 1000 ? { blob: b } : { error: 'empty-answer' };
    } catch (e) { return { error: String((e && e.message) || e).slice(0, 60) }; }
  }
  async function voiceBlob(n, ms) {
    const c = await cacheGet(n);
    if (c) return { blob: c, from: 'cache' };
    const r = await fetchVoice(n, ms);
    if (r.blob) { await cachePut(n, r.blob); return { blob: r.blob, from: 'server' }; }
    return r;
  }
  let prefetching = false, prefetchTimer = null;
  function prefetchVoices() {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(async () => {
      if (pharmacy || !client || !data.speak || prefetching) return;
      prefetching = true;
      try {
        const names = [...new Set(all().items.filter((x) => x.on).map((x) => spokenName(x.say || x.name)))].slice(0, 12);
        for (const n of names) { if (!(await cacheGet(n))) { const r = await fetchVoice(n, 25000); if (r.blob) await cachePut(n, r.blob); else if (/^(429|503)/.test(String(r.error))) break; } }
      } catch (e) { /* the next page open asks again */ }
      prefetching = false;
    }, 1200);
  }
  // The dose notification carries the medicine's name (owner 2026-11-18: «من غير ما يكون الابليكيشن مفتوح» → «أمشي عليه»: the way with no second program). The server's push stays empty, so the worker
  // (store/dose/sw.js) writes the name from THIS copy: only the enabled alarms, the name as it is said and the times. It stays on this phone (IndexedDB); a change of the alarms updates it.
  async function mirrorAlarms() {
    if (pharmacy || !root.indexedDB) return;
    try {
      const items = all().items.filter((x) => x.on).map((x) => ({ id: x.id, spoken: spokenName(x.say || x.name), times: x.times }));
      await new Promise((ok) => {
        const r = root.indexedDB.open('asker-dose', 1);
        r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch (e) { /* made already */ } };
        r.onerror = () => ok();
        r.onsuccess = () => {
          try {
            const tx = r.result.transaction('kv', 'readwrite');
            tx.objectStore('kv').put({ items, at: Date.now() }, 'alarms');
            tx.oncomplete = tx.onerror = tx.onabort = () => { try { r.result.close(); } catch (e) { /* closed */ } ok(); };
          } catch (e) { ok(); }
        };
      });
    } catch (e) { /* the plain «ميعاد دواك» notification stays */ }
  }  let audioEl = null, speakSeq = 0;
  function stopAudio() { speakSeq++; if (audioEl) { try { audioEl.pause(); } catch (e) { /* not playing */ } audioEl = null; } }
  // plays the sentences one after the other; `done({ok, how, code})` is told once, when the first one starts or the first fails
  function playBlobs(blobs, seq, done) {
    let i = 0, told = false;
    const tell = (r) => { if (!told) { told = true; done(r); } };
    const next = () => {
      if (seq !== speakSeq || i >= blobs.length) return;
      const url = URL.createObjectURL(blobs[i++]), a = new Audio(url);
      audioEl = a; a.volume = 1;
      a.onplaying = () => tell({ ok: true, how: 'server' });
      a.onended = () => { try { URL.revokeObjectURL(url); } catch (e) { /* gone */ } next(); };
      a.onerror = () => { try { URL.revokeObjectURL(url); } catch (e) { /* gone */ } tell({ ok: false, code: 'audio-error' }); };
      const p = a.play();
      if (p && p.catch) p.catch((e) => tell(e && e.name === 'NotAllowedError' ? { ok: false, code: 'not-allowed' } : { ok: false, code: 'audio:' + String((e && e.name) || e).slice(0, 30) }));
    };
    next();
  }
  // the alarm's sentence: the server's voice from the phone's cache (or asked now, a few seconds at most), else the phone's own speech engine
  async function speakDue(due) {
    if (!data.speak) return false;
    stopAudio(); const seq = speakSeq;
    try { synth() && root.speechSynthesis.cancel(); } catch (e) { /* nothing speaking */ }
    if (ring) { ring.loading = true; ring.speakErr = ''; }
    let got = [];
    try { got = await Promise.all(due.map((d) => voiceBlob(d.say, 7000))); } catch (e) { got = []; }
    if (ring) ring.loading = false;
    if (seq !== speakSeq) return true;   // another sentence started meanwhile
    const phone = () => say(sayDue(due));
    if (got.length && got.every((x) => x && x.blob)) {
      playBlobs(got.map((x) => x.blob), seq, (r) => {
        if (r.ok) { if (ring) { ring.spoke = true; ring.speakErr = ''; } return; }
        if (r.code === 'not-allowed') { if (ring && !ring.spoke) askTap(); return; }
        if (seq === speakSeq) phone();   // the sound could not play: the phone's own voice
      });
      return true;
    }
    return phone();
  }
  // the «▶ جرّب الصوت» button: the same two ways, and the answer is written under it
  async function tryVoice() {
    voiceNote = TEXTS.trying; if (view) draw();
    stopAudio(); const seq = speakSeq;
    try { synth() && root.speechSynthesis.cancel(); } catch (e) { /* nothing speaking */ }
    const set = (s) => { voiceNote = s; if (view) draw(); };
    const phone = () => { if (!say(TEXTS.tryPhrase, (r) => set(r.ok ? TEXTS.triedPhone : TEXTS.triedFail + (r.code ? ' (' + r.code + ')' : '')))) set(TEXTS.triedFail + ' (no-speechSynthesis)'); };
    const got = await voiceBlob(TRY_NAME, 15000);
    if (seq !== speakSeq) return;
    if (got.blob) { playBlobs([got.blob], seq, (r) => { if (r.ok) set(TEXTS.triedServer); else if (r.code === 'not-allowed') set(TEXTS.triedFail + ' (not-allowed)'); else phone(); }); return; }
    phone();
  }
  // «🔍 فحص الصوت»: writes down what this phone has and what each way did, so the reason is a fact on the screen (a photo of it is enough)
  async function runDiag() {
    const L = [];
    const add = (s) => { L.push(s); diag = L.slice(); if (view) draw(); };
    diag = []; add('...');
    L.length = 0;
    add('version: ' + 'tap-20261118c'); add('ua: ' + String((root.navigator && root.navigator.userAgent) || '').replace(/^Mozilla\/5\.0 /, '').slice(0, 110));
    const ua = root.navigator && root.navigator.userActivation;
    add('active: ' + (ua ? 'now=' + ua.isActive + ' ever=' + ua.hasBeenActive : 'n/a') + ' · online=' + (root.navigator && root.navigator.onLine) + ' · hidden=' + document.hidden);
    // 1) a plain beep through an audio element: does this phone play a sound from the page at all (volume, silent mode, blocked)?
    try {
      const rate = 8000, n = 3200, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf), w = (o, x) => { for (let i = 0; i < x.length; i++) dv.setUint8(o + i, x.charCodeAt(i)); };
      w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.round(Math.sin(i / rate * 2 * Math.PI * 660) * 9000), true);
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })), a = new Audio(url);
      const r = await new Promise((ok) => { a.onplaying = () => ok('playing'); a.onerror = () => ok('error'); const p = a.play(); if (p && p.catch) p.catch((e) => ok('rejected ' + (e && e.name))); setTimeout(() => ok('no-event'), 3000); });
      add('beep (audio element): ' + r); try { a.pause(); URL.revokeObjectURL(url); } catch (e) { /* done */ }
    } catch (e) { add('beep: exception ' + String((e && e.message) || e).slice(0, 50)); }
    // 2) the server's sentence
    try {
      const t0 = Date.now(), got = await voiceBlob(TRY_NAME, 20000);
      if (got.blob) {
        add('server voice: ' + got.from + ' · ' + got.blob.size + ' bytes · ' + (Date.now() - t0) + ' ms');
        const url = URL.createObjectURL(got.blob), a = new Audio(url);
        const r = await new Promise((ok) => { a.onplaying = () => ok('playing'); a.onerror = () => ok('error'); const p = a.play(); if (p && p.catch) p.catch((e) => ok('rejected ' + (e && e.name))); setTimeout(() => ok('no-event'), 4000); });
        add('server voice play: ' + r); try { a.pause(); URL.revokeObjectURL(url); } catch (e) { /* done */ }
      } else add('server voice: FAILED ' + got.error);
    } catch (e) { add('server voice: exception ' + String((e && e.message) || e).slice(0, 50)); }
    // 3) the phone's own speech engine
    const s = synth();
    if (!s) add('speechSynthesis: none');
    else {
      let vs = []; try { vs = s.getVoices() || []; } catch (e) { vs = []; }
      add('speechSynthesis: ' + vs.length + ' voices · arabic: ' + (vs.filter((x) => /^ar/i.test(x.lang)).map((x) => x.name + ' [' + x.lang + (x.localService ? ',local' : ',net') + ']').join('; ') || 'none'));
      for (const [n, label] of [[0, 'ar-EG voice'], [1, 'ar'], [2, 'default']]) {
        const r = await new Promise((ok) => {
          try {
            try { s.cancel(); } catch (e) { /* nothing */ }
            const u = new root.SpeechSynthesisUtterance(TEXTS.tryPhrase), v = n === 0 ? arabicVoice() : null;
            u.lang = n === 0 ? (v ? v.lang : 'ar-EG') : n === 1 ? 'ar' : ''; if (v) u.voice = v; u.volume = 1;
            const t0 = Date.now(); let done = false; const fin = (x) => { if (!done) { done = true; ok(x + ' ' + (Date.now() - t0) + 'ms'); } };
            u.onstart = () => fin('start'); u.onend = () => fin('end-without-start'); u.onerror = (e) => fin('error:' + (e && e.error));
            s.speak(u); setTimeout(() => fin('timeout'), 4000);
          } catch (e) { ok('exception ' + String((e && e.message) || e).slice(0, 40)); }
        });
        add('tts ' + label + ': ' + r);
        try { s.cancel(); } catch (e) { /* nothing */ }
      }
    }
    add('done');
  }  if (synth()) { try { root.speechSynthesis.addEventListener('voiceschanged', () => { voiceOk = !!arabicVoice(); if (view) draw(); }); voiceOk = !!arabicVoice(); } catch (e) { /* no voices event */ } }

  // ---------- ringing ----------
  const firedMap = () => { const f = read(FIRED); return f && typeof f === 'object' ? f : {}; };
  function markFired(keys) {
    const f = firedMap(), today = dayKey(new Date());
    for (const k of keys) f[k] = Date.now();
    for (const k of Object.keys(f)) if (Date.now() - f[k] > 2 * 864e5) delete f[k];   // two days are enough to stop a double ring
    write(FIRED, f); void today;
  }
  function notify(due) {
    if (!root.Notification || root.Notification.permission !== 'granted' || !document.hidden) return;
    const body = due.map((d) => d.name).join('، '), opts = { body, tag: 'asker-dose', lang: 'ar', dir: 'rtl', requireInteraction: true, vibrate: [300, 150, 300], icon: 'icons/arabic-192.png?v=logo2' };
    try {
      const sw = root.navigator.serviceWorker;
      if (sw && sw.getRegistration) sw.getRegistration().then((r) => { if (r && r.showNotification) r.showNotification(TEXTS.notifTitle, opts); else new root.Notification(TEXTS.notifTitle, opts); }).catch(() => { try { new root.Notification(TEXTS.notifTitle, opts); } catch (e) { /* no notification */ } });
      else new root.Notification(TEXTS.notifTitle, opts);
    } catch (e) { /* no notification */ }
  }
  function startRing(due, n) {
    ring = { due, snoozeTimes: due.map((d) => ({ id: d.id, time: d.time })), at0: (n || new Date()).getTime(), wall0: Date.now(), spoke: false, needTap: false };
    markFired(due.map((d) => d.key));
    if (root.AskerStoreMusic && root.AskerStoreMusic.hold) root.AskerStoreMusic.hold('alarm');   // the music steps aside while it rings
    try { root.navigator.vibrate && root.navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) { /* no vibration */ }
    notify(due);
    drawRing();
    sayCount = 0;
    const once = () => { if (!ring || sayCount >= MAX_SAYS) return; sayCount++; speakDue(ring.due); };
    once(); clearInterval(sayTimer); sayTimer = setInterval(once, SAY_EVERY_MS);
    // opened from a notification the page has had no tap, and the browser does not let a page speak before one: the card says so at once (a page nobody touched) or when the engine stays silent,
    // and the first tap speaks. A tap on a phone is a CLICK (touchend / pointerup): «pointerdown» is not a tap for the browser's speech rule, which is why 11-18's first try stayed silent on his phone.
    if (data.speak) {
      const ua = root.navigator && root.navigator.userActivation;
      if (ua && ua.hasBeenActive === false) askTap();
      // (while the sentence is still coming from the server the card does not ask for a tap: that is for a sound the browser refused)
      setTimeout(() => { if (ring && !ring.spoke && !ring.loading) askTap(); }, 1500);
      setTimeout(() => { if (ring && !ring.spoke && !ring.loading && !ring.speakErr) askTap(); }, 5000);
    }
  }
  let tapOnce = null;   // the one waiting «first tap» (a ring the customer ignored must not leave a second one behind)
  function askTap() {
    if (!ring || ring.needTap) return;
    ring.needTap = true; drawRing();
    if (tapOnce) document.removeEventListener('click', tapOnce, true);
    tapOnce = () => { tapOnce = null; if (ring && !ring.spoke) speakDue(ring.due); };
    document.addEventListener('click', tapOnce, { capture: true, once: true });
  }
  function stopRing() {
    clearInterval(sayTimer); sayTimer = null;
    stopAudio();
    try { synth() && root.speechSynthesis.cancel(); } catch (e) { /* nothing speaking */ }
    ring = null; drawRing();
    if (root.AskerStoreMusic && root.AskerStoreMusic.release) root.AskerStoreMusic.release('alarm');
  }
  function snooze() {
    if (!ring) return;
    const at = ring.at0 + (Date.now() - ring.wall0) + SNOOZE_MIN * 60000;   // 10 minutes from the tap (the clock the ring started on, so a test clock works too)
    for (const s of ring.snoozeTimes) if (s.id !== 'test') data.snoozes.push({ id: s.id, at, time: s.time });
    data.snoozes = data.snoozes.slice(-40); save(); stopRing();
  }
  // the page is hidden (another app on top, the screen off): nobody sees the card, so the alarm is NOT used up. Only a notification (once), and the ring waits for the page to be seen
  // (before 11-18 the hidden page «rang» into the void and marked it done: the customer who then tapped the notification found no card and heard nothing)
  const notified = new Set();
  // forced = he came from the dose notification (a worker message or ?dose=1): the alarms that notification was for ring now, even if they already «rang» in a hidden page, up to OPEN_LATE_MIN late
  function tick(now, forced) {
    if (pharmacy) return [];
    const n = now || new Date();
    data = clean(read(KEY) || data);   // another tab may have changed it
    const due = dueNow(all(), n, forced === true ? {} : firedMap(), forced === true ? OPEN_LATE_MIN : LATE_MIN);
    if (!due.length) return [];
    if (document.hidden && forced !== true) {
      const fresh = due.filter((d) => !notified.has(d.key));
      fresh.forEach((d) => notified.add(d.key));
      if (fresh.length) notify(fresh);
      return due;
    }
    if (ring) {   // already ringing: the new ones join it
      const keys = new Set(ring.due.map((d) => d.key)); const add = due.filter((d) => !keys.has(d.key));
      if (add.length) { ring.due.push(...add); ring.snoozeTimes.push(...add.map((d) => ({ id: d.id, time: d.time }))); markFired(add.map((d) => d.key)); drawRing(); }
      return due;
    }
    startRing(due, n);
    return due;
  }
  function schedule() {
    clearInterval(timer); timer = null;
    if (pharmacy || !onCount(all())) return;
    timer = setInterval(() => tick(), CHECK_MS);
    tick();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { data = clean(read(KEY)); schedule(); } });

  function drawRing() {
    let el = document.getElementById('alarmRing');
    if (!ring) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'alarmRing'; el.className = 'al-ring'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
    el.innerHTML = `<div class="al-ring-card"><div class="al-ring-ico" aria-hidden="true">⏰</div><h2>${esc(TEXTS.ringTitle)}</h2>` +
      ring.due.map((d) => `<div class="al-ring-med notr" dir="auto">${esc(d.name)}<small>${esc(timeText(d.time))}</small></div>`).join('') +
      (ring.needTap ? `<p class="al-ring-hint">${esc(TEXTS.tapHint)}</p>` : '') +
      (ring.speakErr ? `<p class="al-warn">${esc(TEXTS.speakFail)} <small dir="ltr" translate="no">(${esc(ring.speakErr)})</small></p>` : '') +
      // the page has not been touched yet: the «اسمع الاسم» button comes first and big (a tap on it is the tap the browser wants)
      `${ring.needTap && data.speak ? `<button type="button" class="al-btn" data-al-hear>${esc(TEXTS.hear)}</button>` : ''}<button type="button" class="al-btn${ring.needTap && data.speak ? ' ghost' : ''}" data-al-took>${esc(TEXTS.took)}</button>${data.speak && !ring.needTap ? `<button type="button" class="al-btn ghost" data-al-hear>${esc(TEXTS.hear)}</button>` : ''}<button type="button" class="al-btn ghost" data-al-snooze>${esc(TEXTS.snooze)}</button></div>`;
  }

  // ---------- stage 2: a push at each dose time, with the browser closed ----------
  // The server gets ONLY: this phone's push address and the clock times of the alarms that are on (Cairo time). No name, no customer (migration 202611172300, function asker-dose).
  const VAPID = 'BEz67xiIZZubLNtifD1Ryqxc6p2j509IsWF6o-YUe5M1BvyWIlUm4NwaRKUP-potwMmyN9_qxqNC2qfn1s5ozwg';   // the public half of the web-push key (the same one store/chat.js uses)
  const keyBytes = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4), raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
  const canPush = () => !pharmacy && !!root.navigator && 'serviceWorker' in root.navigator && 'PushManager' in root && !!root.Notification;
  const serverTimes = () => normTimes([].concat(...all().items.filter((x) => x.on).map((x) => x.times)).map((t) => cairoTime(t)));
  async function activeRegistration() {
    const reg = await root.navigator.serviceWorker.register('store/dose/sw.js', { scope: 'store/dose/' });
    if (reg.active) return reg;
    const w = reg.installing || reg.waiting;
    await new Promise((ok) => { if (!w) return ok(); w.addEventListener('statechange', () => { if (w.state === 'activated') ok(); }); setTimeout(ok, 10000); });
    return reg;
  }
  let syncing = false, syncAgain = false;
  async function syncServer() {
    if (!client || !canPush() || root.Notification.permission !== 'granted') return;
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    try {
      do {
        syncAgain = false;
        const times = serverTimes(), reg = await activeRegistration();
        let sub = await reg.pushManager.getSubscription();
        if (!sub && times.length) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) });
        if (sub) await client.rpc('ar_dose_save', { p_endpoint: sub.endpoint, p_times: times });
      } while (syncAgain);
    } catch (e) { /* no push on this phone: the alarm still rings while the page is open */ }
    syncing = false;
  }
  const customerName = () => { const A = root.AskerStoreAccount; return A && A.name ? A.name() : ''; };
  // the pharmacy's phone: the customer being looked at gets the list as it is now (the server cleans it: at most 20 alarms, valid times)
  // The store's own client has no sign-in (persistSession off: a visitor's), so the server refused the owner's save with 401 «42501» and the page said nothing (11-18: «اتحفظ عندي وما ظهرش تاني ولا عند العميل»).
  // The owner's alarms calls go through a client with the system's sign-in, which the system keeps on this same site (store/edit.js does the same for «✏️ عدّل»).
  function adminClient() {
    if (adminC) return adminC;
    const S = root.AskerStore;
    try { if (S && S.SUPABASE_URL && root.supabase && root.supabase.createClient) adminC = root.supabase.createClient(S.SUPABASE_URL, S.SUPABASE_KEY); } catch (e) { adminC = null; }
    return adminC || client;
  }
  function adminSave() {
    clearTimeout(adminTimer);
    adminTimer = setTimeout(async () => {
      const A = root.AskerStoreAccount; token = A && A.token ? A.token() : token;
      const c = adminClient();
      if (!c || !token) return;
      let ok = false;
      try { const { data: d, error } = await c.rpc('ar_customer_alarms_admin_set', { p_token: token, p_items: data.items.map((x) => ({ id: x.id, name: x.name, say: x.say, times: x.times, on: x.on })) }); ok = !error && !!d && d.ok === true; } catch (e) { ok = false; }
      adminNote = ok ? 'saved' : 'fail'; if (view) draw();
    }, 250);
  }
  // the page opens: the pharmacy's phone reads the customer's alarms to edit them; the customer's phone reads the ones the pharmacy set for him (cached for offline)
  async function loadPharmacy() {
    const A = root.AskerStoreAccount; token = A && A.token ? A.token() : null;
    if (!client || !token) return;
    try {
      if (pharmacy) {
        const { data: d, error } = await adminClient().rpc('ar_customer_alarms_admin_get', { p_token: token });
        if (d && d.ok) { data = { ...data, items: clean({ items: d.items }).items }; if (view) draw(); redrawTile(); } else if (error || !d || !d.ok) { adminNote = 'fail'; if (view) draw(); }
      } else {
        const { data: d } = await client.rpc('ar_customer_alarms_view', { p_token: token });
        if (d && d.ok) {
          ph.items = clean({ items: d.items }).items.map((x) => ({ ...x, ph: true }));
          for (const k of Object.keys(ph.off)) if (!ph.items.some((x) => x.id === k)) delete ph.off[k];
          write(PH_KEY, { items: ph.items, off: ph.off });
          schedule(); redrawTile(); if (view) draw(); syncServer(); prefetchVoices(); mirrorAlarms();
        }
      }
    } catch (e) { /* offline: the ones kept on the phone stay */ }
  }
  // «جرّب الإشعار»: a real notification now, so he hears his phone's own notification sound (the page cannot make it louder: that sound is the phone's setting)
  async function testNotification() {
    try {
      const reg = await activeRegistration();
      await reg.showNotification(TEXTS.notifTestTitle, { body: TEXTS.notifTestBody, tag: 'asker-dose-test', lang: 'ar', dir: 'rtl', vibrate: [300, 150, 300], icon: 'icons/arabic-192.png?v=logo2', data: { url: root.location.href, kind: 'test' } });
    } catch (e) { /* no notifications on this phone */ }
  }
  // a demo ring (the tap on «جرّب الإشعار»'s notification): the same card, the same voice, a made-up medicine called «تجربة المنبه», so he hears exactly what a dose time does
  function testRing() {
    if (pharmacy) return;
    const n = new Date();
    if (ring) stopRing();
    startRing([{ id: 'test', name: TEXTS.testName, say: TEXTS.testName, time: hhmmOf(n.getHours() * 60 + n.getMinutes()), key: 'test|' + n.getTime() }], n);
  }
  // he tapped a dose notification: the page rings for what it was about (forced: even if a hidden page already used the alarm up), or runs the demo for the test notification
  function doseOpened(kind) { if (kind === 'test') testRing(); else tick(null, true); }
  // a dose push reached the phone's worker while the app is alive in the background: ring and speak at once (no tap needed); a tap on the notification of an open page: the worker says so (dose-open)
  try {
    const sw = root.navigator && root.navigator.serviceWorker;
    if (sw && sw.addEventListener) { sw.addEventListener('message', (e) => { const t = e.data && e.data.type; if (t === 'dose-due') tick(); else if (t === 'dose-open') doseOpened(e.data.kind); }); if (sw.startMessages) sw.startMessages(); }
  } catch (e) { /* no worker messages */ }
  // the page was opened (a new window) by a tap on a dose notification: store/dose/sw.js adds ?dose=1 (?dose=test for the test one); it goes out of the address at once
  let openedBy = null;
  try {
    const m = /[?&]dose=(test|1)(?:&|$)/.exec(root.location.search);
    if (m) {
      openedBy = m[1] === 'test' ? 'test' : 'dose';
      const rest = root.location.search.replace(/^\?/, '').split('&').filter((p) => p && !/^dose=/.test(p));
      try { root.history.replaceState(null, '', root.location.pathname + (rest.length ? '?' + rest.join('&') : '') + root.location.hash); } catch (e) { /* the address keeps ?dose=: harmless */ }
    }
  } catch (e) { /* no address to read */ }
  // ---------- the tile (store/account.js) and the sheet ----------
  function tileHtml() {
    const n = onCount(all());
    return `<button type="button" class="ac-reg-btn ac-al-tile" data-al-open><b>${esc(TEXTS.tile)}</b><small>${esc(n ? countText(n) : TEXTS.tileHint)}</small></button>`;
  }
  const chip = (t) => `<span class="al-chip">${esc(timeText(t))}</span>`;
  function listHtml() {
    const cards = all().items.map((it) => `<div class="al-card${it.on ? '' : ' off'}">${it.ph ? `<div class="al-card-main"><b class="notr" dir="auto">${esc(it.name)}</b> <span class="al-badge">${esc(TEXTS.fromPharmacy)}</span><span class="al-times">${it.times.map(chip).join('')}</span></div>` : `<button type="button" class="al-card-main" data-al-edit="${esc(it.id)}"><b class="notr" dir="auto">${esc(it.name)}</b><span class="al-times">${it.times.map(chip).join('')}</span></button>`}` +
      `<button type="button" class="al-tg${it.on ? ' on' : ''}" role="switch" aria-checked="${it.on}" aria-label="${esc(it.on ? TEXTS.on : TEXTS.off)}" data-al-toggle="${esc(it.id)}"></button></div>`).join('');
    const notif = pharmacy ? '' : root.Notification
      ? (root.Notification.permission === 'granted' ? `<p class="rg-hint">${esc(TEXTS.notifDone)}</p><button type="button" class="al-line" data-al-notiftest><span>${esc(TEXTS.notifTest)}</span></button><p class="rg-hint">${esc(TEXTS.notifSound)}</p>`
        : root.Notification.permission === 'denied' ? `<p class="rg-hint">${esc(TEXTS.notifNo)}</p>`
          : `<button type="button" class="al-line" data-al-notif><span>${esc(TEXTS.notifOn)}</span></button><p class="rg-hint">${esc(TEXTS.notifWhy)}</p>`) : '';
    const voice = !pharmacy ? `<div class="al-line"><span>${esc(TEXTS.speak)}</span><button type="button" class="al-tg${data.speak ? ' on' : ''}" role="switch" aria-checked="${data.speak}" aria-label="${esc(TEXTS.speak)}" data-al-speak></button></div>` +
      `<div class="al-line"><span>${esc(TEXTS.tryVoice.replace(/^▶\s*/, ''))}</span><button type="button" class="al-try" data-al-try>${esc(TEXTS.tryVoice)}</button></div>` +
      (voiceNote ? `<p class="rg-hint al-note" role="status">${esc(voiceNote)}</p>` : '') +
      (voiceOk === false ? `<p class="al-warn">${esc(TEXTS.noVoice)}</p>` : '') +
      `<div class="al-line"><span>${esc(diagBusy ? TEXTS.diagBusy : TEXTS.diag)}</span><button type="button" class="al-try" data-al-diag${diagBusy ? ' disabled' : ''}>${esc(diagBusy ? '…' : '▶')}</button></div>` +
      (diag && diag.length ? `<pre class="al-diag notr" dir="ltr" translate="no">${esc(diag.join('\n'))}</pre><button type="button" class="al-line" data-al-diagcopy><span>${esc(diagCopied ? TEXTS.diagCopied : TEXTS.diagCopy)}</span></button>` : '') : '';
    const note = pharmacy && adminNote ? `<p class="${adminNote === 'saved' ? 'rg-hint al-note' : 'al-warn'}" role="status">${esc(adminNote === 'saved' ? TEXTS.adminSaved : TEXTS.adminFail)}</p>` : '';
    return `<p class="rg-hint">${esc(pharmacy ? fill(TEXTS.forCustomer, { n: customerName() }) : TEXTS.hint)}</p>${note}${cards || `<p class="rg-hint">${esc(TEXTS.empty)}</p>`}<button type="button" class="al-add" data-al-new>${esc(TEXTS.add)}</button>${voice}${notif}` +
      (pharmacy ? '' : `<div class="rg-warn">${esc(TEXTS.open)}</div>`);
  }
  // the names he usually takes (store/regular.js), for the quick pick
  const usual = () => (root.AskerStoreRegular && root.AskerStoreRegular.names ? root.AskerStoreRegular.names() : []);
  // the name written on the card: the Arabic one, or the English one when the site is in English (the phone still SAYS the Arabic name)
  const shown = (u) => (document.documentElement.lang === 'en' ? u.n : u.ar || u.n);
  function editHtml() {
    const d = draft, picks = usual().map((u, i) => `<button type="button" class="al-pk${d.pick === i ? ' on' : ''} notr" data-al-pick="${i}">${esc(shown(u))}</button>`).join('');
    const custom = d.pick === 'other' || !usual().length;
    const freq = [['once', TEXTS.once], ['twice', TEXTS.twice], ['thrice', TEXTS.thrice], ['eight', TEXTS.eight]].map(([k, l]) => `<button type="button" class="al-pk${d.preset === k ? ' on' : ''}" data-al-preset="${k}">${esc(l)}</button>`).join('');
    const times = d.times.map((t, i) => `<span class="al-tm"><input type="time" value="${esc(t)}" data-al-time="${i}" aria-label="${esc(TEXTS.times)}"><button type="button" class="al-x" data-al-rm="${i}" aria-label="${esc(TEXTS.removeTime)}">×</button></span>`).join('');
    const name = (d.name || '').trim();
    return `<div class="al-lbl">${esc(TEXTS.which)} ${picks ? `<small>${esc(TEXTS.fromUsual)}</small>` : ''}</div><div class="al-picks">${picks}<button type="button" class="al-pk${custom ? ' on' : ''}" data-al-pick="other">${esc(TEXTS.other)}</button></div>` +
      (custom ? `<input type="text" class="al-name notr" data-al-name maxlength="80" dir="auto" placeholder="${esc(TEXTS.namePh)}" value="${esc(d.name || '')}">` : '') +
      `<div class="al-lbl">${esc(TEXTS.freq)}</div><div class="al-picks">${freq}</div><div class="al-lbl">${esc(TEXTS.times)}</div><div class="al-times-edit">${times}<button type="button" class="al-pk plus" data-al-addtime>${esc(TEXTS.addTime)}</button></div>` +
      (name ? `<div class="al-say"><span>${esc(TEXTS.says)}</span> <span class="notr" dir="auto" data-al-say>«${esc(sayText(d.say || name))}»</span></div>` : '') +
      (error ? `<p class="al-warn">${esc(error)}</p>` : '') +
      `<button type="button" class="al-save" data-al-save>${esc(TEXTS.save)}</button>` + (d.id ? `<button type="button" class="al-del" data-al-del>${esc(TEXTS.del)}</button>` : '');
  }
  function sheetHtml() {
    const edit = view === 'edit';
    return `<div class="rg-top"><button type="button" class="rg-back" data-al-close aria-label="${esc(TEXTS.back)}">›</button><b>${esc(edit ? (draft && draft.id ? TEXTS.editTitle : TEXTS.newTitle) : TEXTS.title)}</b></div><div class="rg-body">${edit ? editHtml() : listHtml()}</div>`;
  }
  function draw() {
    let el = document.getElementById('alarmSheet');
    if (!view) { if (el) el.remove(); redrawTile(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'alarmSheet'; el.className = 'rg-sheet al-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
    const keep = el.querySelector('.rg-body'), top = keep ? keep.scrollTop : 0, focus = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-al-name') != null;
    el.innerHTML = sheetHtml();
    const b = el.querySelector('.rg-body'); if (b && top) b.scrollTop = top;
    if (focus) { const i = el.querySelector('[data-al-name]'); if (i) { i.focus(); const l = i.value.length; try { i.setSelectionRange(l, l); } catch (e) { /* not supported */ } } }
  }
  function redrawTile() { const t = document.querySelector('.ac-al-tile'); if (t) t.outerHTML = tileHtml(); }
  function open() {
    view = 'list'; error = '';
    try { history.pushState({ asAlarm: 1 }, '', location.href); } catch (e) { /* the close button still works */ }
    draw();
  }
  function close(quiet) {
    if (!view) return;
    view = ''; draft = null; error = '';
    draw(); schedule();
    if (!quiet) { try { if (history.state && history.state.asAlarm) history.back(); } catch (e) { /* nothing to go back to */ } }
  }
  function newDraft(it) {
    if (it) return { id: it.id, name: it.name, say: it.say || '', times: it.times.slice(), preset: Object.keys(PRESETS).find((k) => PRESETS[k].join() === it.times.join()) || '', pick: usual().findIndex((u) => shown(u) === it.name) >= 0 ? usual().findIndex((u) => shown(u) === it.name) : 'other' };
    return { id: '', name: '', say: '', times: PRESETS.twice.slice(), preset: 'twice', pick: usual().length ? null : 'other' };
  }
  function saveDraft() {
    const d = draft, name = String(d.name || '').trim(), times = normTimes(d.times);
    if (!name) { error = TEXTS.needName; draw(); return; }
    if (!times.length) { error = TEXTS.needTime; draw(); return; }
    const it = { id: d.id || (pharmacy ? 'p' : '') + newId(), name, say: d.say || '', times, on: true };
    const i = data.items.findIndex((x) => x.id === it.id);
    if (i >= 0) { it.on = data.items[i].on; data.items[i] = it; } else data.items.push(it);
    data.snoozes = data.snoozes.filter((s) => s.id !== it.id);
    save(); view = 'list'; draft = null; error = ''; draw(); schedule();
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-al-open]')) { open(); return; }
    if (t.closest('[data-al-took]')) { stopRing(); return; }
    if (t.closest('[data-al-hear]')) { if (ring) speakDue(ring.due); return; }
    if (t.closest('[data-al-snooze]')) { snooze(); return; }
    if (!view) return;
    if (t.closest('[data-al-close]')) { if (view === 'edit') { view = 'list'; draft = null; error = ''; draw(); } else close(); return; }
    if (t.closest('[data-al-new]')) { draft = newDraft(null); view = 'edit'; error = ''; draw(); return; }
    const ed = t.closest('[data-al-edit]'); if (ed) { const it = data.items.find((x) => x.id === ed.dataset.alEdit); if (it) { draft = newDraft(it); view = 'edit'; error = ''; draw(); } return; }
    const tg = t.closest('[data-al-toggle]'); if (tg) { const tid = tg.dataset.alToggle, it = data.items.find((x) => x.id === tid); if (!it && ph.items.some((x) => x.id === tid)) { ph.off[tid] = !ph.off[tid]; save(); draw(); schedule(); return; } if (it) { it.on = !it.on; save(); draw(); schedule(); } return; }
    if (t.closest('[data-al-speak]')) { data.speak = !data.speak; save(); draw(); return; }
    if (t.closest('[data-al-notiftest]')) { testNotification(); return; }
    if (t.closest('[data-al-try]')) { tryVoice(); return; }
    if (t.closest('[data-al-diag]')) { if (!diagBusy) { diagBusy = true; runDiag().finally(() => { diagBusy = false; if (view) draw(); }); } return; }
    if (t.closest('[data-al-diagcopy]')) { const txt = (diag || []).join('\n'); try { root.navigator.clipboard.writeText(txt).then(() => { diagCopied = true; draw(); setTimeout(() => { diagCopied = false; if (view) draw(); }, 2500); }); } catch (err) { /* no clipboard: the photo is enough */ } return; }
    if (t.closest('[data-al-notif]')) { try { root.Notification.requestPermission().then(() => { draw(); syncServer(); }); } catch (err) { draw(); } return; }
    if (!draft) return;
    const pk = t.closest('[data-al-pick]');
    if (pk) { const v = pk.dataset.alPick; if (v === 'other') { draft.pick = 'other'; draft.name = ''; draft.say = ''; } else { const u = usual()[+v]; if (u) { draft.pick = +v; draft.name = shown(u); draft.say = u.ar || u.n; } } error = ''; draw(); return; }
    const ps = t.closest('[data-al-preset]'); if (ps) { draft.preset = ps.dataset.alPreset; draft.times = PRESETS[draft.preset].slice(); error = ''; draw(); return; }
    if (t.closest('[data-al-addtime]')) { const last = draft.times.length ? minutesOf(draft.times[draft.times.length - 1]) : 8 * 60; draft.times.push(hhmmOf(Math.min(1439, (last == null ? 480 : last) + 60))); draft.preset = ''; draw(); return; }
    const rm = t.closest('[data-al-rm]'); if (rm) { draft.times.splice(+rm.dataset.alRm, 1); draft.preset = ''; draw(); return; }
    if (t.closest('[data-al-save]')) { saveDraft(); return; }
    if (t.closest('[data-al-del]')) { data.items = data.items.filter((x) => x.id !== draft.id); data.snoozes = data.snoozes.filter((s) => s.id !== draft.id); save(); view = 'list'; draft = null; draw(); schedule(); }
  });
  document.addEventListener('input', (e) => {
    if (!draft) return;
    if (e.target.matches && e.target.matches('[data-al-name]')) { draft.name = e.target.value; draft.say = ''; error = ''; const s = document.querySelector('#alarmSheet [data-al-say]'); if (!s && draft.name.trim()) draw(); else if (s) s.textContent = '«' + sayText(draft.name.trim()) + '»'; }
  });
  document.addEventListener('change', (e) => {
    if (draft && e.target.matches && e.target.matches('[data-al-time]')) { const m = minutesOf(e.target.value); if (m != null) { draft.times[+e.target.dataset.alTime] = hhmmOf(m); draft.preset = ''; } }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && view) close(); });
  window.addEventListener('popstate', () => { if (view) { view = ''; draft = null; draw(); schedule(); } });

  root.AskerStoreAlarm = { tileHtml, open, close, tick, say, doseOpened, count: () => onCount(all()), data: () => data, pharmacy: () => pharmacy, serverTimes, all, attach(c) { client = c; syncServer(); loadPharmacy(); prefetchVoices(); mirrorAlarms(); }, speakDue, voiceBlob, runDiag, tryVoice };
  schedule();
  if (openedBy) doseOpened(openedBy);
})(typeof window === 'undefined' ? globalThis : window);
