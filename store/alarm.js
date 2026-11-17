/* «⏰ منبه الدوا» on the customer's own page (owner 2026-11-17: «زر منبه مواعيد الأدوية»; «عاوز المنبه عنده ينطق بالصوت برضه، إن شاء الله صوت جوجل عشان ما يكلفناش»; he said
   «مش شايف منبه الجرعات في الصورة» then «فين يا عم المنبه؟ … ما تقعدش تسقط مني»).
   - The customer picks a medicine (one of the items he usually takes, or any name he types), how many times a day and the times. At the time the phone rings: a full-screen card with the
     medicine's name, a vibration, and the phone SAYS «ميعاد دواء <the name>» with its own voice (the browser's speech engine: on Android it is Google's, free, no server, no cost to the pharmacy).
     «خدته ✓» closes it; «ذكّرني بعد 10 دقايق» comes back. If the page is hidden when the time comes, a phone notification shows too (when he allowed notifications).
   - The times are kept ON HIS PHONE ONLY (localStorage): the pharmacy's server never sees which medicines he takes or when. Nothing is sent from here.
   - Honest limit (stage 1): it rings while the pharmacy's page is open on his phone (a tab or the installed app, even in the background while the browser is alive); a closed browser cannot ring
     by itself. Ringing with the phone locked needs a push from a server: stage 2, separate (a server timer and the owner's OK). A missed time still shows for 10 minutes when he opens the page.
   - On the pharmacy's own phone (the owner's look at a customer's page, the bot signed in there) the card is a look only: kept for this tab, never rings.
   Loaded before store/account.js, which draws the tile and nothing else here. */
(function (root) {
  'use strict';
  const KEY = 'asker_dose_alarms', FIRED = 'asker_dose_fired';
  const CHECK_MS = 15000;     // how often the page looks at the clock
  const LATE_MIN = 10;        // a time that passed while the page was closed still rings for 10 minutes
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
    tryPhrase: 'ميعاد دواء، تجربة الصوت',
    notifOn: '🔔 فعّل الإشعارات',
    notifDone: 'الإشعارات شغالة',
    notifNo: 'الإشعارات مقفولة من إعدادات المتصفح',
    open: 'المنبه بيرن طول ما صفحة الصيدلية مفتوحة على موبايلك، فسيبها مفتوحة.',
    noVoice: 'موبايلك مفيهوش صوت عربي: هيرن من غير نطق. نزّل صوت عربي من إعدادات الموبايل ← اللغة ← تحويل النص إلى كلام.',
    lookOnly: 'ده شكل المنبه عند العميل. على موبايل الصيدلية مبيرنش.',
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
    sayName: 'ميعاد دواء {n}',
    save: 'حفظ المنبه',
    del: '🗑 احذف المنبه',
    needName: 'اكتب اسم الدوا الأول',
    needTime: 'ضيف ميعاد واحد على الأقل',
    ringTitle: '⏰ ميعاد الدوا',
    took: '✓ خدته',
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
  function dueNow(data, now, fired) {
    const nowMin = now.getHours() * 60 + now.getMinutes(), day = dayKey(now), out = [];
    for (const it of data.items) {
      if (!it.on) continue;
      for (const t of it.times) {
        const key = `${day}|${it.id}|${t}`, m = minutesOf(t), late = nowMin - m;
        if (late >= 0 && late <= LATE_MIN && !(fired && fired[key])) out.push({ id: it.id, name: it.name, say: it.say || it.name, time: t, key });
      }
    }
    for (const s of data.snoozes) {
      const it = data.items.find((x) => x.id === s.id), key = `snooze|${s.id}|${s.at}`;
      if (it && it.on && now.getTime() >= s.at && !(fired && fired[key])) out.push({ id: it.id, name: it.name, say: it.say || it.name, time: s.time, key, snooze: s.at });
    }
    return out;
  }
  const sayText = (name) => fill(TEXTS.sayName, { n: name });
  // the sentence the phone says for what is due now: one medicine, or several («ميعاد دواء أ، وب»)
  const sayDue = (due) => fill(TEXTS.sayName, { n: due.map((d) => d.say).join('، و') });
  const onCount = (data) => data.items.filter((x) => x.on).length;
  const countText = (n) => (n === 1 ? TEXTS.oneOn : n === 2 ? TEXTS.twoOn : fill(n >= 3 && n <= 10 ? TEXTS.someOn : TEXTS.manyOn, { n }));
  const newId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const api = { TEXTS, KEY, PRESETS, LATE_MIN, SNOOZE_MIN, minutesOf, hhmmOf, timeText, normTimes, clean, dueNow, sayText, sayDue, countText, onCount, dayKey, newId };
  root.AskerStoreAlarmLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // the pharmacy's own phone = the bot is signed in here: a look only (kept for this tab, never rings)
  const pharmacy = (() => { try { return Object.keys(localStorage).some((k) => /^sb-[a-z0-9]+-auth-token$/.test(k)); } catch (e) { return false; } })();
  const box = () => (pharmacy ? root.sessionStorage : root.localStorage);
  const read = (k) => { try { return JSON.parse(box().getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { box().setItem(k, JSON.stringify(v)); } catch (e) { /* private window: it stays until the page is closed */ } };
  let data = clean(read(KEY));
  const save = () => { write(KEY, data); };
  let view = '', draft = null, error = '', ring = null, sayCount = 0, sayTimer = null, voiceOk = null, timer = null;

  // ---------- the voice: the phone's own speech engine (Google's on Android) ----------
  const synth = () => (root.speechSynthesis && root.SpeechSynthesisUtterance ? root.speechSynthesis : null);
  function arabicVoice() {
    const s = synth(); if (!s) return null;
    let v = []; try { v = s.getVoices() || []; } catch (e) { v = []; }
    return v.find((x) => /^ar[-_]EG/i.test(x.lang)) || v.find((x) => /^ar/i.test(x.lang)) || null;
  }
  function say(text) {
    const s = synth(); if (!s || !data.speak) return false;
    try {
      s.cancel();
      const u = new root.SpeechSynthesisUtterance(text), v = arabicVoice();
      u.lang = v ? v.lang : 'ar-EG'; if (v) u.voice = v; u.rate = 0.9; u.volume = 1;
      s.speak(u); return true;
    } catch (e) { return false; }
  }
  if (synth()) { try { root.speechSynthesis.addEventListener('voiceschanged', () => { voiceOk = !!arabicVoice(); if (view) draw(); }); voiceOk = !!arabicVoice(); } catch (e) { /* no voices event */ } }

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
    ring = { due, snoozeTimes: due.map((d) => ({ id: d.id, time: d.time })), at0: (n || new Date()).getTime(), wall0: Date.now() };
    markFired(due.map((d) => d.key));
    if (root.AskerStoreMusic && root.AskerStoreMusic.hold) root.AskerStoreMusic.hold('alarm');   // the music steps aside while it rings
    try { root.navigator.vibrate && root.navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) { /* no vibration */ }
    notify(due);
    drawRing();
    sayCount = 0;
    const once = () => { if (!ring || sayCount >= MAX_SAYS) return; sayCount++; say(sayDue(ring.due)); };
    once(); clearInterval(sayTimer); sayTimer = setInterval(once, SAY_EVERY_MS);
  }
  function stopRing() {
    clearInterval(sayTimer); sayTimer = null;
    try { synth() && root.speechSynthesis.cancel(); } catch (e) { /* nothing speaking */ }
    ring = null; drawRing();
    if (root.AskerStoreMusic && root.AskerStoreMusic.release) root.AskerStoreMusic.release('alarm');
  }
  function snooze() {
    if (!ring) return;
    const at = ring.at0 + (Date.now() - ring.wall0) + SNOOZE_MIN * 60000;   // 10 minutes from the tap (the clock the ring started on, so a test clock works too)
    for (const s of ring.snoozeTimes) data.snoozes.push({ id: s.id, at, time: s.time });
    data.snoozes = data.snoozes.slice(-40); save(); stopRing();
  }
  function tick(now) {
    if (pharmacy) return [];
    const n = now || new Date();
    data = clean(read(KEY) || data);   // another tab may have changed it
    const due = dueNow(data, n, firedMap());
    if (!due.length) return [];
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
    if (pharmacy || !onCount(data)) return;
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
      `<button type="button" class="al-btn" data-al-took>${esc(TEXTS.took)}</button><button type="button" class="al-btn ghost" data-al-snooze>${esc(TEXTS.snooze)}</button></div>`;
  }

  // ---------- the tile (store/account.js) and the sheet ----------
  function tileHtml() {
    const n = onCount(data);
    return `<button type="button" class="ac-reg-btn ac-al-tile" data-al-open><b>${esc(TEXTS.tile)}</b><small>${esc(n ? countText(n) : TEXTS.tileHint)}</small></button>`;
  }
  const chip = (t) => `<span class="al-chip">${esc(timeText(t))}</span>`;
  function listHtml() {
    const cards = data.items.map((it) => `<div class="al-card${it.on ? '' : ' off'}"><button type="button" class="al-card-main" data-al-edit="${esc(it.id)}"><b class="notr" dir="auto">${esc(it.name)}</b><span class="al-times">${it.times.map(chip).join('')}</span></button>` +
      `<button type="button" class="al-tg${it.on ? ' on' : ''}" role="switch" aria-checked="${it.on}" aria-label="${esc(it.on ? TEXTS.on : TEXTS.off)}" data-al-toggle="${esc(it.id)}"></button></div>`).join('');
    const notif = root.Notification
      ? (root.Notification.permission === 'granted' ? `<p class="rg-hint">${esc(TEXTS.notifDone)}</p>`
        : root.Notification.permission === 'denied' ? `<p class="rg-hint">${esc(TEXTS.notifNo)}</p>`
          : `<button type="button" class="al-line" data-al-notif><span>${esc(TEXTS.notifOn)}</span></button>`) : '';
    const voice = synth() ? `<div class="al-line"><span>${esc(TEXTS.speak)}</span><button type="button" class="al-tg${data.speak ? ' on' : ''}" role="switch" aria-checked="${data.speak}" aria-label="${esc(TEXTS.speak)}" data-al-speak></button></div>` +
      `<div class="al-line"><span>${esc(TEXTS.tryVoice.replace(/^▶\s*/, ''))}</span><button type="button" class="al-try" data-al-try>${esc(TEXTS.tryVoice)}</button></div>` +
      (voiceOk === false ? `<p class="al-warn">${esc(TEXTS.noVoice)}</p>` : '') : '';
    return `<p class="rg-hint">${esc(pharmacy ? TEXTS.lookOnly : TEXTS.hint)}</p>${cards || `<p class="rg-hint">${esc(TEXTS.empty)}</p>`}<button type="button" class="al-add" data-al-new>${esc(TEXTS.add)}</button>${voice}${notif}` +
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
    const it = { id: d.id || newId(), name, say: d.say || '', times, on: true };
    const i = data.items.findIndex((x) => x.id === it.id);
    if (i >= 0) { it.on = data.items[i].on; data.items[i] = it; } else data.items.push(it);
    data.snoozes = data.snoozes.filter((s) => s.id !== it.id);
    save(); view = 'list'; draft = null; error = ''; draw(); schedule();
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-al-open]')) { open(); return; }
    if (t.closest('[data-al-took]')) { stopRing(); return; }
    if (t.closest('[data-al-snooze]')) { snooze(); return; }
    if (!view) return;
    if (t.closest('[data-al-close]')) { if (view === 'edit') { view = 'list'; draft = null; error = ''; draw(); } else close(); return; }
    if (t.closest('[data-al-new]')) { draft = newDraft(null); view = 'edit'; error = ''; draw(); return; }
    const ed = t.closest('[data-al-edit]'); if (ed) { const it = data.items.find((x) => x.id === ed.dataset.alEdit); if (it) { draft = newDraft(it); view = 'edit'; error = ''; draw(); } return; }
    const tg = t.closest('[data-al-toggle]'); if (tg) { const it = data.items.find((x) => x.id === tg.dataset.alToggle); if (it) { it.on = !it.on; save(); draw(); schedule(); } return; }
    if (t.closest('[data-al-speak]')) { data.speak = !data.speak; save(); draw(); return; }
    if (t.closest('[data-al-try]')) { const ok = say(TEXTS.tryPhrase); if (!ok && synth() == null) { /* no speech engine: the warning in the list says so */ } return; }
    if (t.closest('[data-al-notif]')) { try { root.Notification.requestPermission().then(() => draw()); } catch (err) { draw(); } return; }
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

  root.AskerStoreAlarm = { tileHtml, open, close, tick, say, count: () => onCount(data), data: () => data, pharmacy: () => pharmacy };
  schedule();
})(typeof window === 'undefined' ? globalThis : window);
