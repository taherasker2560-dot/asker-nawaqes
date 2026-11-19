/* «🎵 موسيقى السيستم» (owner 2026-11-19, going to sleep: «عاوز خلفية موسيقى للسيستم ليا وللمستخدمين اللي على السيستم معايا طول ما أنا فاتحه، نفس نظام الأبليكيشن بتاع العملا»).
   The same quiet shop-and-mall music the customers hear on the store site (store/music.js, owner 2026-11-17), inside the system itself, for him and for every person signed in to it (staff too).
   - The SAME eight MP3 pieces (store/music/, about 4 minutes each), shuffled: a visit of half an hour never hears the same piece twice, the next round is shuffled again.
     Only the files are shared: the player here is its own (the store's keeps its own rules: nothing on the pharmacy phone, the advert voice).
   - It starts by itself once somebody is signed in (the sign-in screen stays silent); where the browser wants a first touch, the first tap or key press anywhere starts it. Fades in over 3 s, low volume
     (a Web Audio gain on the playing file, so it works on an iPhone too).
   - ONE small quiet round button (28 px, about 40 % see-through) stops / starts it. Whoever stops it is remembered ON THAT PHONE (localStorage asker_system_music_off): it never starts by itself again
     there until he presses the button. This key is the system's own: stopping the store's music (asker_store_music_off) does not touch it.
   - It steps aside while the page is hidden (phone locked, another tab), while any sound or video plays in the page (a voice note, a customer's voice), while the phone is speaking (the system reads out
     messages) and while a voice note is being recorded (the rest of the page asks with AskerMusic.hold('rec') / release('rec')).
   - A SECOND small quiet button (owner 2026-11-19: «اعملي أوبشن أوطّي الصوت») opens a tiny slider for the volume of the system's music. It starts at the store's own level (60 on the slider = gain 0.18),
     goes down to a whisper and up to about three times that; moving it changes the sound at once, and the level is remembered ON THAT PHONE (asker_system_music_vol, its own key). The store's music is untouched.
   - The ADVERT voice (owner 2026-11-19: «عايز صوت الإعلان على السيستم، برضو على المستخدمين بتوع السيستم»): the same spoken advert the customers hear on the store (voice Orus, the function asker-dose action
     'promo': nothing new on the server), 8 s after the music is sounding, over the music, and then EVERY HALF HOUR while the system stays open (his order the same day, «لا انا عايزها تشتغل كل نص ساعة»;
     the store's own advert stays once per open: the half hour is the system's), at about 5 dB above the music at ITS level (the volume option's slider takes the advert down with the music). The same
     button stops both; it never plays while the music is quiet (stopped, page hidden, a voice note, the phone speaking, a recording): when the half hour falls due meanwhile it plays 8 s after the music
     sounds again. A failed ask (no network) is tried again after 10 minutes. The phone keeps its copy in the store's own cache (same name, same file), so whichever page asks first pays for both.
     A test link: asker-nawaqes-arabic.html?promo=1 plays the first one 3 s after the music sounds.
   Honest limits: on an iPhone the first tap is needed and the silent switch mutes Web Audio; any phone stops the music when it locks; a piece is about 2.4 MB, loaded as it plays (nothing at all when it
   was stopped, or when nobody is signed in). On mobile data that is about 35 MB an hour: the button is how to stop it. */
(function (root) {
  'use strict';

  const KEY = 'asker_system_music_off';
  const VOLUME = 0.18; // the store's own level (owner 2026-11-17: «موجودة ومش موجودة»)
  const FADE_IN = 3, FADE_OUT = 0.8; // seconds
  const BASE = 'store/music/', V = 'files-20261117a';
  // the same pieces as store/music.js (tests/system-music.cjs keeps the two lists in step)
  const TRACKS = [
    { file: '01-bossa.mp3', intro: 20 },
    { file: '02-soft-house.mp3', intro: 17.8 },
    { file: '03-chill-pop.mp3', intro: 20.9 },
    { file: '04-marimba.mp3', intro: 19.2 },
    { file: '05-smooth.mp3', intro: 21.8 },
    { file: '06-bright.mp3', intro: 17.1 },
    { file: '07-dreamy.mp3', intro: 22.9 },
    { file: '08-sunny.mp3', intro: 18.5 },
  ];
  const TEXTS = { stop: 'وقّف الموسيقى الهادية', start: 'شغّل الموسيقى الهادية' };
  // the volume option: a slider 10..100 (60 = the store's quiet level), squared so the low half has fine steps; its own key on the phone
  const LEVEL_KEY = 'asker_system_music_vol', LEVEL_MIN = 10, LEVEL_MAX = 100, LEVEL_DEFAULT = 60, GAIN_MAX = 0.5;
  const VOL_TEXT = 'صوت الموسيقى';
  // the advert: the SAME one as store/music.js (tests/system-music.cjs keeps the two in step); in the system it comes back every `everyMin` minutes (his order 2026-11-19: every half hour),
  // and a failed ask is tried again after `retryMin`
  const PROMO = { on: true, voice: 'Orus', delay: 8, targetDb: -27, gain: 0.3, cache: 'asker-store-promo-v1', file: 'v3-orus', everyMin: 30, retryMin: 10 };
  // how long until the advert is due again: 0 = due now (next = the moment it is due; 0 = never said in this page's life)
  function promoWait(next, now) { return next > now ? next - now : 0; }
  const FORCE = (() => { try { return /[?&]promo=1(&|#|$)/.test(String(root.location && root.location.search)); } catch (e) { return false; } })();
  // the loudness (RMS, 0..1) of the speaking parts of a 16-bit mono WAV (the function's own files: a 44-byte header); 0 when it is not one
  function wavRms(buf) {
    if (!buf || buf.byteLength < 2000) return 0;
    const n = (buf.byteLength - 44) >> 1, v = new DataView(buf);
    let acc = 0, k = 0;
    for (let i = 0; i < n; i += 2) { const s = v.getInt16(44 + 2 * i, true) / 32768; if (Math.abs(s) > 0.01) { acc += s * s; k++; } }
    return k > 50 ? Math.sqrt(acc / k) : 0;
  }
  // the gain that puts speech of loudness `rms` at `targetDb` dBFS (never louder than the file itself, never nearly silent); the fallback when the level is unknown
  function promoGain(rms, targetDb, fallback) {
    if (!(rms > 0)) return fallback;
    return Math.min(1, Math.max(0.05, Math.pow(10, (targetDb - 20 * Math.log10(rms)) / 20)));
  }
  // the advert follows the music's own level: the store's advert sits about 5 dB above the music at VOLUME; a music turned down by the volume option takes the advert down with it
  function advertGain(rms, musicGain) {
    const g = promoGain(rms, PROMO.targetDb, PROMO.gain) * (musicGain > 0 ? musicGain / VOLUME : 1);
    return Math.min(1, Math.max(0.02, g));
  }

  // ---------- pure logic (tests/system-music.cjs) ----------
  // 'none' = no sound and no button (a browser with no Web Audio); 'auto' = plays by itself; 'stopped' = he stopped it: only his button starts it
  function modeOf(o) {
    if (!o || !o.supported) return 'none';
    return o.off ? 'stopped' : 'auto';
  }
  // is sound wanted this very moment? Only for somebody signed in, on a page that is shown, with nothing else making a sound
  function wanted(o) { return o.mode === 'auto' && !!o.signedIn && !o.hidden && !(o.holds > 0); }
  // one round of the pieces: every piece once, shuffled; the next round never starts with the piece that just ended (`last`)
  function nextRound(rnd, last, n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (n > 1 && a[0] === last) { const j = 1 + Math.floor(rnd() * (n - 1)); [a[0], a[j]] = [a[j], a[0]]; }
    return a;
  }

  // what is stored on the phone (or nothing / rubbish) -> a level between the ends; nothing stored = the store's own level
  function cleanLevel(v) {
    if (v == null || v === '') return LEVEL_DEFAULT;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, n)) : LEVEL_DEFAULT;
  }
  // the slider's level -> the Web Audio gain (60 = 0.18, the store's level)
  function levelGain(p) { const x = cleanLevel(p) / 100; return Math.round(GAIN_MAX * x * x * 1e4) / 1e4; }

  const api = { modeOf, wanted, nextRound, cleanLevel, levelGain, wavRms, promoGain, advertGain, promoWait, PROMO, TRACKS, TEXTS, KEY, VOLUME, FADE_IN, BASE, LEVEL_KEY, LEVEL_MIN, LEVEL_MAX, LEVEL_DEFAULT, VOL_TEXT };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the player ----------
  const AC = root.AudioContext || root.webkitAudioContext;
  const store = (fn) => { try { return fn(root.localStorage); } catch (e) { return null; } }; // a private window or blocked storage: nothing remembered
  let mode = modeOf({ off: store((ls) => ls.getItem(KEY) === '1'), supported: !!AC && typeof root.Audio === 'function' });
  api.mode = () => mode;
  if (mode === 'none') { api.sounding = () => false; api.hold = api.release = api.press = api.setLevel = () => {}; api.level = () => LEVEL_DEFAULT; api.promoState = () => ({ armed: false, playing: false, next: 0 }); api.promoTick = () => {}; root.AskerMusic = api; return; }

  let level = cleanLevel(store((ls) => ls.getItem(LEVEL_KEY)));
  const gainNow = () => levelGain(level);
  let ctx = null, gain = null, el = null, queue = [], last = -1, firstTrack = true, failed = 0, broken = false, target = 0, suspendTimer = null, btn = null;
  const holds = new Set();
  const signedIn = () => { const a = document.getElementById('app'); return !!a && !a.classList.contains('hidden'); };
  const sounding = () => !!ctx && ctx.state === 'running' && target > 0 && !!el && !el.paused;
  api.sounding = sounding;
  api.track = () => last;

  // ---------- the advert voice (the store's own advert, owner 2026-11-19) ----------
  let pTimer = null, pEl = null, pUrl = null, pRun = 0, pArmed = false, pNext = 0;   // pNext: the moment the advert is due again (0 = not said yet in this page's life)
  api.promoState = () => ({ armed: pArmed, playing: !!pEl, next: pNext });
  function promoStop() {   // quiet the advert, or cancel a waiting one: the music went quiet (stopped, hidden, a voice note) or the advert ended
    pRun++; pArmed = false; clearTimeout(pTimer); pTimer = null;
    if (pEl) { try { pEl.pause(); } catch (e) { /* gone */ } pEl = null; }
    if (pUrl) { try { URL.revokeObjectURL(pUrl); } catch (e) { /* gone */ } pUrl = null; }
  }
  function promoArm() {   // the music is sounding: wait a few seconds, then say it (when it is due: the first time, then every half hour)
    if (!PROMO.on || pArmed || !!pEl || promoWait(pNext, Date.now()) > 0) return;
    pArmed = true; pTimer = setTimeout(promoGo, (FORCE ? 3 : PROMO.delay) * 1000);
  }
  // the advert's WAV: kept on the phone after the first time (the store's cache, the same key), else asked from the function (nothing is sent but «which voice»)
  async function promoBlob() {
    const key = 'https://asker-store-promo.invalid/' + PROMO.file;
    try { if (root.caches) { const r = await (await root.caches.open(PROMO.cache)).match(key); if (r) { const b = await r.blob(); if (b && b.size > 1000) return b; } } } catch (e) { /* no cache */ }
    const c = root.AskerApp && root.AskerApp.client;
    if (!c || !c.supabaseUrl || !c.supabaseKey || typeof root.fetch !== 'function') return null;
    const ac = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(() => { if (ac) ac.abort(); }, 30000);
    try {
      const r = await root.fetch(String(c.supabaseUrl).replace(/\/$/, '') + '/functions/v1/asker-dose', { method: 'POST', signal: ac ? ac.signal : undefined, headers: { 'Content-Type': 'application/json', apikey: c.supabaseKey, Authorization: 'Bearer ' + c.supabaseKey }, body: JSON.stringify({ action: 'promo', voice: PROMO.voice }) });
      if (!r.ok) return null;
      const b = new Blob([await r.arrayBuffer()], { type: 'audio/wav' });
      if (b.size < 10000) return null;
      try { if (root.caches) await (await root.caches.open(PROMO.cache)).put(key, new Response(b, { headers: { 'Content-Type': 'audio/wav' } })); } catch (e) { /* not kept: asked again next time */ }
      return b;
    } catch (e) { return null; } finally { clearTimeout(t); }
  }
  async function promoGo() {
    pTimer = null;
    const run = ++pRun, ok = () => run === pRun && mode === 'auto' && signedIn() && !document.hidden && holds.size === 0 && sounding();
    if (!ok()) { pArmed = false; return; }   // the music went quiet meanwhile: the next time it plays, it is armed again
    const blob = await promoBlob();
    if (!blob) { pNext = Date.now() + PROMO.retryMin * 60000; pArmed = false; return; }   // no network / no advert: tried again in a few minutes
    let g0 = PROMO.gain;
    try { g0 = advertGain(wavRms(await blob.arrayBuffer()), gainNow()); } catch (e) { /* the fallback */ }
    if (!ok()) { if (run === pRun) pArmed = false; return; }
    try {
      const a = new root.Audio(); a.setAttribute('data-music', 'promo');   // our own sound: the music does not step aside for it, and the media rule does not count it
      pUrl = URL.createObjectURL(blob); a.src = pUrl;
      const g = ctx.createGain(); g.gain.value = g0;
      ctx.createMediaElementSource(a).connect(g); g.connect(ctx.destination);
      const failed = () => { pNext = Date.now() + PROMO.retryMin * 60000; promoStop(); };
      a.addEventListener('playing', () => { pNext = Date.now() + PROMO.everyMin * 60000; });   // said: the next one is due in half an hour
      a.addEventListener('ended', promoStop);
      a.addEventListener('error', failed);
      pEl = a;
      const p = a.play(); if (p && p.catch) p.catch(failed);
    } catch (e) { pNext = Date.now() + PROMO.retryMin * 60000; promoStop(); }
  }
  // a look every 15 seconds while the music sounds: when the advert is due (the half hour came) it is armed; the music's own «playing» event does the same when the music comes back
  api.promoTick = () => { if (mode === 'auto' && sounding()) promoArm(); };
  setInterval(api.promoTick, 15000);

  function ramp(to, secs) {
    const p = gain.gain, now = ctx.currentTime;
    p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(to, now + secs);
  }
  function play() {
    const p = el.play();
    if (p && p.catch) p.catch(() => { /* the browser wants a tap first: the next one starts it */ });
  }
  // the next piece of the round (a new shuffled round when the last one is done); the first piece of a visit starts after its intro
  function next() {
    if (!queue.length) queue = nextRound(Math.random, last, TRACKS.length);
    last = queue.shift();
    const t = TRACKS[last], skip = firstTrack ? t.intro || 0 : 0;
    firstTrack = false;
    el.src = BASE + t.file + '?v=' + V;
    if (skip) {
      const seek = () => { el.removeEventListener('loadedmetadata', seek); try { el.currentTime = skip; } catch (e) { /* plays from the start */ } };
      el.addEventListener('loadedmetadata', seek);
    }
    if (wanted({ mode, signedIn: signedIn(), hidden: document.hidden, holds: holds.size })) play();
  }
  // a file that does not load (no network, a missing file): the next piece; when every piece failed, quiet (the button shows it is off)
  function fail() {
    failed++;
    if (failed >= TRACKS.length) { broken = true; sync(); return; }
    next();
  }
  function ensure() {
    if (ctx) return true;
    try {
      ctx = new AC(); el = new root.Audio();
      el.preload = 'auto'; el.setAttribute('data-music', '1');
      gain = ctx.createGain(); gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain); gain.connect(ctx.destination);
    } catch (e) { mode = 'none'; ctx = null; return false; }
    ctx.onstatechange = () => { sync(); };
    el.addEventListener('ended', next);
    el.addEventListener('error', fail);
    el.addEventListener('playing', () => { failed = 0; draw(); promoArm(); });
    el.addEventListener('pause', draw);
    next();
    return true;
  }
  // make the sound match what is wanted now: start / fade in, or fade out and let it sleep
  function sync() {
    if (mode === 'none') { draw(); return; }
    const want = wanted({ mode, signedIn: signedIn(), hidden: document.hidden, holds: holds.size }) && !broken;
    if (want) {
      clearTimeout(suspendTimer); suspendTimer = null;
      if (!ensure()) { draw(); return; }
      if (el.paused) play();   // inside the tap that asked for it: the browser allows it
      if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => { /* the browser wants a tap first: the next one starts it */ }); draw(); return; }
      if (target !== gainNow()) { target = gainNow(); ramp(target, FADE_IN); }
    } else if (ctx) {
      promoStop();   // the music is going quiet: the advert goes with it
      if (target !== 0) { target = 0; if (ctx.state === 'running') ramp(0, document.hidden ? 0.05 : FADE_OUT); }
      if (!suspendTimer && (!el.paused || ctx.state === 'running')) {
        suspendTimer = setTimeout(() => {
          suspendTimer = null;
          if (target === 0) { try { el.pause(); } catch (e) { /* gone */ } if (ctx.state === 'running') ctx.suspend().catch(() => { /* gone */ }); }
        }, (document.hidden ? 0.1 : FADE_OUT + 0.1) * 1000);
      }
    }
    draw();
  }

  // ---------- the quiet button ----------
  const ICON_ON = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></svg>';
  const ICON_OFF = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>';
  // the volume option: a second quiet button that opens a small slider (shown while the music is not stopped; a stopped one has nothing to lower)
  const ICON_VOL = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 8h4M13 8h8M3 16h9M18 16h3" /><circle cx="10" cy="8" r="2.6" /><circle cx="15" cy="16" r="2.6" /></svg>';
  const ICON_LOW = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z" /></svg>';
  const ICON_HIGH = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>';
  let volBtn = null, pop = null, range = null, popTimer = null;
  function closePop() { clearTimeout(popTimer); popTimer = null; if (pop) pop.hidden = true; if (volBtn) volBtn.setAttribute('aria-expanded', 'false'); }
  function openPop() {
    if (!pop) return;
    range.value = String(level); pop.hidden = false; volBtn.setAttribute('aria-expanded', 'true'); kick();
  }
  const kick = () => { clearTimeout(popTimer); popTimer = setTimeout(closePop, 6000); }; // the slider folds away by itself
  // a new level: remembered on this phone, and heard at once when the music is playing (a short ramp, no click)
  function setLevel(p) {
    level = cleanLevel(p);
    store((ls) => ls.setItem(LEVEL_KEY, String(level)));
    if (ctx && target > 0 && gain) { target = gainNow(); ramp(target, 0.15); }
  }
  api.setLevel = setLevel;
  api.level = () => level;
  function draw() {
    if (!btn) return;
    // shown only to somebody signed in (the sign-in screen has no music and no button)
    btn.hidden = !signedIn();
    if (volBtn) { volBtn.hidden = !signedIn() || mode !== 'auto'; if (volBtn.hidden) closePop(); }
    const on = sounding(), label = on ? TEXTS.stop : TEXTS.start;
    btn.setAttribute('data-on', on ? '1' : '0');
    btn.setAttribute('aria-label', label); btn.setAttribute('title', label);
    const html = on ? ICON_ON : ICON_OFF;
    if (btn.innerHTML !== html) btn.innerHTML = html;
  }
  function press() {
    if (sounding()) { mode = 'stopped'; store((ls) => ls.setItem(KEY, '1')); } // he stops it: remembered on this phone, it never starts by itself again
    else { mode = 'auto'; broken = false; failed = 0; store((ls) => ls.removeItem(KEY)); }
    sync();
  }
  api.press = press;
  function build() {
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mus-btn'; btn.id = 'sysMusic'; btn.addEventListener('click', press);
    volBtn = document.createElement('button');
    volBtn.type = 'button'; volBtn.className = 'mus-btn mus-vol-btn'; volBtn.id = 'sysMusicVol'; volBtn.hidden = true; volBtn.innerHTML = ICON_VOL;
    volBtn.setAttribute('aria-label', VOL_TEXT); volBtn.setAttribute('title', VOL_TEXT); volBtn.setAttribute('aria-expanded', 'false');
    volBtn.addEventListener('click', () => { if (pop.hidden) openPop(); else closePop(); });
    pop = document.createElement('div');
    pop.className = 'mus-pop'; pop.id = 'sysMusicPop'; pop.hidden = true; pop.setAttribute('dir', 'ltr'); // low -> high from left to right, whatever the language
    pop.innerHTML = ICON_LOW + '<input type="range" id="sysMusicRange" min="' + LEVEL_MIN + '" max="' + LEVEL_MAX + '" step="5" aria-label="' + VOL_TEXT + '">' + ICON_HIGH;
    range = pop.querySelector('input'); range.value = String(level);
    range.addEventListener('input', () => { setLevel(Number(range.value)); kick(); });
    // a tap anywhere else folds the slider away
    document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !volBtn.contains(e.target)) closePop(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
    document.body.appendChild(btn); document.body.appendChild(volBtn); document.body.appendChild(pop);
    draw();
  }

  // ---------- when to be quiet, and the first touch ----------
  api.hold = (why) => { holds.add(why); sync(); };
  api.release = (why) => { holds.delete(why); sync(); };
  document.addEventListener('visibilitychange', sync);
  // any sound or video in the page (a voice note, a customer's voice): the music steps aside until it ends (the music's own file is not one of them)
  const media = new Set();
  const isSound = (e) => e.target && /^(AUDIO|VIDEO)$/.test(e.target.tagName) && !e.target.muted && !(e.target.getAttribute && e.target.getAttribute('data-music'));
  document.addEventListener('play', (e) => { if (isSound(e)) { media.add(e.target); holds.add('media'); sync(); } }, true);
  const mediaDone = (e) => { if (media.delete(e.target) && !media.size) { holds.delete('media'); sync(); } };
  document.addEventListener('pause', mediaDone, true); document.addEventListener('ended', mediaDone, true);
  // the phone is speaking (the system reads messages out): step aside while it does (a browser has no event for it, so it is looked at twice a second, only while the music is wanted)
  setInterval(() => {
    const s = root.speechSynthesis;
    const speaking = !!(s && s.speaking);
    if (speaking && !holds.has('speech')) { holds.add('speech'); sync(); } else if (!speaking && holds.has('speech')) { holds.delete('speech'); sync(); }
  }, 500);
  // a browser that refuses sound before a touch: the first tap / key press anywhere (but not on the music button itself) starts it
  const FIRST = ['pointerdown', 'touchend', 'click', 'keydown'];
  function onFirst(e) {
    if (e.target && e.target.closest && e.target.closest('#sysMusic')) return;
    sync();
    if (sounding()) FIRST.forEach((n) => document.removeEventListener(n, onFirst, true));
  }
  FIRST.forEach((n) => document.addEventListener(n, onFirst, true));
  // somebody signs in or out: the page's own switch between the sign-in card and the app
  function start() {
    build();
    const a = document.getElementById('app');
    if (a && typeof MutationObserver === 'function') new MutationObserver(sync).observe(a, { attributes: true, attributeFilter: ['class'] });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  root.AskerMusic = api;
})(typeof window === 'undefined' ? globalThis : window);
