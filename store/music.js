/* Light shop-and-mall music on the store site (owner 2026-11-17: «الزبون وهو بيتصفح الموقع أو رابطه الشخصي يسمع موسيقى هادية تشجع على الشراء»;
   his decision: «هو يفتح تلقائي بالصوت، والإغلاق يبقى له زرار، ماشي»; «ويكون زرار مخفي، أنا عاوزه يسمع»; and after the first sample: «صوت الزنة في خلفية المزيكا مزعج،
   عاوز حاجة زي أماكن التسوق والمولات، وعاوز كذا حاجة بتتغير لمدة نص ساعة طول ما العميل بيتصفح، يعني طول النص ساعة منكررش، نغير موسيقى جديدة»).
   - EIGHT pieces, each about 4 minutes (a tempo, a key, chords, a groove and instruments of its own), played in a shuffled order: a visit of half an hour (or the 32 minutes of all
     eight) never hears the same piece twice, and the next round is shuffled again (never the same piece twice in a row). Only struck sounds that die away (electric piano, plucks,
     marimba, vibes, a soft bass, a light kick, hats, a shaker, a rim click): NO held tone, because a held tone is what hums («الزنة»).
   - 2026-11-17 evening (owner: «صوت المزيكا في الصفحة مش مظبوط خالص وبيقطع والناس اشتكت»): the pieces are MP3 FILES now (store/music/, made once by tools/music/render.cjs from the score in
     tools/music/score.js). Before, the page synthesised the music live and a weak phone could not keep up (a minute of it took 47-89 s to render on the owner's laptop), so it cut out.
     Playing a file costs the phone next to nothing. The same player takes any file later (the owner thinks of a song of the pharmacy's own: add it to TRACKS).
   - It starts by itself (installed apps and some browsers allow it at once); where the browser needs a first touch, the first tap / key press anywhere starts it
     (the customer presses nothing music-related). Fades in over 3 s, low volume (a Web Audio gain on the playing file: it works on an iPhone too, where an audio element's own volume does not).
   - ONE small quiet round button (28 px, about 40 % see-through) stops / starts it. A customer who stops it is remembered (localStorage asker_store_music_off): it never starts
     by itself again on that phone until he presses the button.
   - It pauses while the page is hidden (phone locked, another tab), and while a voice note plays or is being recorded (store/chat.js asks with hold('rec')).
   - NEVER on the pharmacy's own phone (the owner's bot is signed in there: sb-…-auth-token in localStorage): no sound and no button. Nothing in the bot (ar/) changes.
   - A visit starts in the groove: the first piece begins after its 8-bar intro, so a customer who just opened the page hears the music at once, not 20 quiet seconds.
   Honest limits: on an iPhone the first tap is needed and the silent switch mutes Web Audio; any phone stops the music when it locks. A piece is about 2.4 MB, loaded as it plays
   (nothing at all when the customer stopped the music or never touches the page). Loaded before store/chat.js. */
(function (root) {
  'use strict';

  const KEY = 'asker_store_music_off';
  const VOLUME = 0.18; // of the file's level: «موجودة ومش موجودة» (owner 2026-11-17: lower than the first sample, but 0.13 was heard as nothing on a phone speaker, so 0.18; the files keep the old level)
  const FADE_IN = 3, FADE_OUT = 0.8; // seconds
  const BASE = 'store/music/', V = 'files-20261117a';
  // the pieces, in the order of tools/music/score.js; intro = the seconds of its quiet 8-bar intro that a visit skips (tests/store-music.cjs checks this against store/music/index.json)
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
  const TEXTS = {
    stop: 'وقّف الموسيقى الهادية',
    start: 'شغّل الموسيقى الهادية',
  };
  // The promo voice (owner 2026-11-18: «صوت ترويجي بأسلوب مذيع يسوّق للصيدلية، والموسيقى تفضل تحته وصوته أعلى منها حاجة بسيطة»; picked the voice Orus; «أوطى شوية، ما يبقاش مزعج»).
  // ONE spoken advert from the function asker-dose (action 'promo': a fixed text kept on the server), played over the music `delay` seconds after the music is sounding, then not again for
  // `everyDays` days on that phone. The voice is meant to sit about 5 dB above the music (the music at VOLUME is about -32 dBFS): the page measures how loud the advert's speech is (a new render
  // comes out louder or quieter: -13.5 dBFS once, -17.6 another time) and plays it at `targetDb` -27 dBFS (soft on purpose; the owner heard the first samples much louder and asked for quieter);
  // `gain` is only the fallback when the level cannot be read. It never plays on the pharmacy's phone, nor when the customer stopped the music; the same button stops both.
  // `file` names the kept copy: change it when the advert's text changes on the server.
  const PROMO = { on: true, voice: 'Orus', delay: 12, everyDays: 3, targetDb: -27, gain: 0.3, key: 'asker_store_promo_day', cache: 'asker-store-promo-v1', file: 'v1-orus' };
  const dayKey = (d) => { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  // is the advert due: never heard on this phone, or the last time was `every` days ago or more (a clock set back counts as due)
  function promoDue(last, today, every) {
    if (!last || !/^\d{4}-\d{2}-\d{2}$/.test(String(last))) return true;
    const t = (s) => { const p = String(s).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000; };
    const gap = t(today) - t(last);
    return !(gap >= 0 && gap < every);
  }
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

  // ---------- pure logic (tests/store-music.cjs) ----------
  // the pharmacy's own phone: the owner's bot is signed in there (the same test store/account.js uses)
  const isPharmacyPhone = (keys) => Array.from(keys || []).some((k) => /^sb-[a-z0-9]+-auth-token$/.test(k));
  // 'none' = no sound and no button (the pharmacy's own phone, a browser with no Web Audio); 'auto' = plays by itself; 'stopped' = the customer stopped it: only his button starts it
  function modeOf(o) {
    if (!o || o.pharmacy || !o.supported) return 'none';
    return o.off ? 'stopped' : 'auto';
  }
  // is sound wanted this very moment?
  function wanted(o) { return o.mode === 'auto' && !o.hidden && !(o.holds > 0); }
  // one round of the pieces: every piece once, shuffled; the next round never starts with the piece that just ended (`last`)
  function nextRound(rnd, last, n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (n > 1 && a[0] === last) { const j = 1 + Math.floor(rnd() * (n - 1)); [a[0], a[j]] = [a[j], a[0]]; }
    return a;
  }

  const api = { isPharmacyPhone, modeOf, wanted, nextRound, promoDue, dayKey, wavRms, promoGain, PROMO, TRACKS, TEXTS, KEY, VOLUME, FADE_IN, BASE };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the player ----------
  const AC = root.AudioContext || root.webkitAudioContext;
  const store = (fn) => { try { return fn(root.localStorage); } catch (e) { return null; } }; // a private window or blocked storage: nothing remembered
  let mode = modeOf({ pharmacy: store((ls) => isPharmacyPhone(Object.keys(ls))), off: store((ls) => ls.getItem(KEY) === '1'), supported: !!AC && typeof root.Audio === 'function' });
  api.mode = () => mode;
  if (mode === 'none') { api.sounding = () => false; api.hold = api.release = api.press = () => {}; root.AskerStoreMusic = api; return; }

  let ctx = null, gain = null, el = null, queue = [], last = -1, firstTrack = true, failed = 0, broken = false, target = 0, suspendTimer = null, btn = null;
  const holds = new Set();
  const sounding = () => !!ctx && ctx.state === 'running' && target > 0 && !!el && !el.paused;
  api.sounding = sounding;
  api.track = () => last;

  // ---------- the promo voice ----------
  let pTimer = null, pEl = null, pUrl = null, pRun = 0, pArmed = false, pDone = false;   // pDone: heard (or failed) in this page's life: never twice
  api.promoState = () => ({ armed: pArmed, playing: !!pEl, done: pDone });
  function promoStop() {   // quiet the advert, or cancel a waiting one: the music went quiet (stopped, hidden, a voice note) or the advert ended
    pRun++; pArmed = false; clearTimeout(pTimer); pTimer = null;
    if (pEl) { try { pEl.pause(); } catch (e) { /* gone */ } pEl = null; }
    if (pUrl) { try { URL.revokeObjectURL(pUrl); } catch (e) { /* gone */ } pUrl = null; }
  }
  function promoArm() {   // the music is sounding: wait a few seconds, then say it, if this phone is due
    if (!PROMO.on || pArmed || pDone || !!pEl) return;
    if (!promoDue(store((ls) => ls.getItem(PROMO.key)), dayKey(), PROMO.everyDays)) return;
    pArmed = true; pTimer = setTimeout(promoGo, PROMO.delay * 1000);
  }
  // the advert's WAV: kept on the phone after the first time, else asked from the function (nothing is sent but «which voice»)
  async function promoBlob() {
    const key = 'https://asker-store-promo.invalid/' + PROMO.file;
    try { if (root.caches) { const r = await (await root.caches.open(PROMO.cache)).match(key); if (r) { const b = await r.blob(); if (b && b.size > 1000) return b; } } } catch (e) { /* no cache */ }
    const S = root.AskerStore;
    if (!S || !S.SUPABASE_URL || !S.SUPABASE_KEY || typeof root.fetch !== 'function') return null;
    const ac = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(() => { if (ac) ac.abort(); }, 30000);
    try {
      const r = await root.fetch(String(S.SUPABASE_URL).replace(/\/$/, '') + '/functions/v1/asker-dose', { method: 'POST', signal: ac ? ac.signal : undefined, headers: { 'Content-Type': 'application/json', apikey: S.SUPABASE_KEY, Authorization: 'Bearer ' + S.SUPABASE_KEY }, body: JSON.stringify({ action: 'promo', voice: PROMO.voice }) });
      if (!r.ok) return null;
      const b = new Blob([await r.arrayBuffer()], { type: 'audio/wav' });
      if (b.size < 10000) return null;
      try { if (root.caches) await (await root.caches.open(PROMO.cache)).put(key, new Response(b, { headers: { 'Content-Type': 'audio/wav' } })); } catch (e) { /* not kept: asked again next time */ }
      return b;
    } catch (e) { return null; } finally { clearTimeout(t); }
  }
  async function promoGo() {
    pTimer = null;
    const run = ++pRun, ok = () => run === pRun && mode === 'auto' && !document.hidden && holds.size === 0 && sounding();
    if (!ok()) { pArmed = false; return; }   // the music went quiet meanwhile: the next time it plays, it is armed again
    const blob = await promoBlob();
    if (!blob) { pDone = true; pArmed = false; return; }   // no network / no advert: no retry in this visit
    let gain = PROMO.gain;
    try { gain = promoGain(wavRms(await blob.arrayBuffer()), PROMO.targetDb, PROMO.gain); } catch (e) { /* the fallback */ }
    if (!ok()) { if (run === pRun) pArmed = false; return; }
    try {
      const a = new root.Audio(); a.setAttribute('data-music', 'promo');   // our own sound: the music does not step aside for it, and the voice-note rule does not count it
      pUrl = URL.createObjectURL(blob); a.src = pUrl;
      const g = ctx.createGain(); g.gain.value = gain;
      ctx.createMediaElementSource(a).connect(g); g.connect(ctx.destination);
      a.addEventListener('playing', () => { pDone = true; store((ls) => ls.setItem(PROMO.key, dayKey())); });   // counted once it really starts
      a.addEventListener('ended', promoStop);
      a.addEventListener('error', () => { pDone = true; promoStop(); });
      pEl = a;
      const p = a.play(); if (p && p.catch) p.catch(() => { pDone = true; promoStop(); });
    } catch (e) { pDone = true; promoStop(); }
  }

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
    if (wanted({ mode, hidden: document.hidden, holds: holds.size })) play();
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
    const want = wanted({ mode, hidden: document.hidden, holds: holds.size }) && !broken;
    if (want) {
      clearTimeout(suspendTimer); suspendTimer = null;
      if (!ensure()) { draw(); return; }
      if (el.paused) play();   // inside the tap that asked for it: the browser allows it
      if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => { /* the browser wants a tap first: the next one starts it */ }); draw(); return; }
      if (target !== VOLUME) { target = VOLUME; ramp(VOLUME, FADE_IN); }
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
  function draw() {
    if (!btn) return;
    const on = sounding(), label = on ? TEXTS.stop : TEXTS.start;
    btn.setAttribute('data-on', on ? '1' : '0');
    btn.setAttribute('aria-label', label); btn.setAttribute('title', label);
    const html = on ? ICON_ON : ICON_OFF;
    if (btn.innerHTML !== html) btn.innerHTML = html;
  }
  function press() {
    if (sounding()) { mode = 'stopped'; store((ls) => ls.setItem(KEY, '1')); } // the customer stops it: remembered, it never starts by itself again
    else { mode = 'auto'; broken = false; failed = 0; store((ls) => ls.removeItem(KEY)); }
    sync();
  }
  function build() {
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mus-btn'; btn.addEventListener('click', press);
    document.body.appendChild(btn); draw();
  }

  // ---------- when to be quiet, and the first touch ----------
  api.hold = (why) => { holds.add(why); sync(); };
  api.release = (why) => { holds.delete(why); sync(); };
  document.addEventListener('visibilitychange', sync);
  // a voice note from the pharmacy plays (or a video): the music steps aside until it ends (the music's own file is not one of them)
  const media = new Set();
  const isSound = (e) => e.target && /^(AUDIO|VIDEO)$/.test(e.target.tagName) && !e.target.muted && !(e.target.getAttribute && e.target.getAttribute('data-music'));
  document.addEventListener('play', (e) => { if (isSound(e)) { media.add(e.target); holds.add('media'); sync(); } }, true);
  const mediaDone = (e) => { if (media.delete(e.target) && !media.size) { holds.delete('media'); sync(); } };
  document.addEventListener('pause', mediaDone, true); document.addEventListener('ended', mediaDone, true);
  // a browser that refuses sound before a touch: the first tap / key press anywhere (but not on the music button itself) starts it
  const FIRST = ['pointerdown', 'touchend', 'click', 'keydown'];
  function onFirst(e) {
    if (e.target && e.target.closest && e.target.closest('.mus-btn')) return;
    sync();
    if (sounding()) FIRST.forEach((n) => document.removeEventListener(n, onFirst, true));
  }
  FIRST.forEach((n) => document.addEventListener(n, onFirst, true));

  api.press = press;
  root.AskerStoreMusic = api;
  build();
  sync();
})(typeof window === 'undefined' ? globalThis : window);
