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

  const api = { modeOf, wanted, nextRound, TRACKS, TEXTS, KEY, VOLUME, FADE_IN, BASE };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the player ----------
  const AC = root.AudioContext || root.webkitAudioContext;
  const store = (fn) => { try { return fn(root.localStorage); } catch (e) { return null; } }; // a private window or blocked storage: nothing remembered
  let mode = modeOf({ off: store((ls) => ls.getItem(KEY) === '1'), supported: !!AC && typeof root.Audio === 'function' });
  api.mode = () => mode;
  if (mode === 'none') { api.sounding = () => false; api.hold = api.release = api.press = () => {}; root.AskerMusic = api; return; }

  let ctx = null, gain = null, el = null, queue = [], last = -1, firstTrack = true, failed = 0, broken = false, target = 0, suspendTimer = null, btn = null;
  const holds = new Set();
  const signedIn = () => { const a = document.getElementById('app'); return !!a && !a.classList.contains('hidden'); };
  const sounding = () => !!ctx && ctx.state === 'running' && target > 0 && !!el && !el.paused;
  api.sounding = sounding;
  api.track = () => last;

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
    el.addEventListener('playing', () => { failed = 0; draw(); });
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
      if (target !== VOLUME) { target = VOLUME; ramp(VOLUME, FADE_IN); }
    } else if (ctx) {
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
    // shown only to somebody signed in (the sign-in screen has no music and no button)
    btn.hidden = !signedIn();
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
    document.body.appendChild(btn); draw();
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
    if (e.target && e.target.closest && e.target.closest('.mus-btn')) return;
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
