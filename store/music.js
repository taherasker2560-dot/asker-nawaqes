/* Calm background music on the store site (owner 2026-11-17: «الزبون وهو بيتصفح الموقع أو رابطه الشخصي يسمع موسيقى هادية تشجع على الشراء»;
   his decision: «هو يفتح تلقائي بالصوت، والإغلاق يبقى له زرار، ماشي»; and later «ويكون زرار مخفي، أنا عاوزه يسمع»).
   - The music is MADE in the page with the Web Audio API (soft pads + slow bell notes in C major pentatonic, an echo, a very slow breathing of the volume): no file, no
     licence, no data. A seed picks the order of the notes, so every visit is a little different and never the same loop.
   - It starts by itself (installed apps and some browsers allow it at once); where the browser needs a first touch, the first tap / key press anywhere starts it
     (the customer presses nothing music-related). Fades in over 3 s, low volume, loops for good.
   - ONE small quiet round button (28 px, about 40 % see-through) stops / starts it. A customer who stops it is remembered (localStorage asker_store_music_off): it never starts
     by itself again on that phone until he presses the button.
   - It pauses while the page is hidden (phone locked, another tab), and while a voice note plays or is being recorded (store/chat.js asks with hold('rec')).
   - NEVER on the pharmacy's own phone (the owner's bot is signed in there: sb-…-auth-token in localStorage): no sound and no button. Nothing in the bot (ar/) changes.
   Honest limits: on an iPhone the first tap is needed and the silent switch mutes Web Audio; any phone stops the music when it locks. Loaded before store/chat.js. */
(function (root) {
  'use strict';

  const KEY = 'asker_store_music_off';
  const VOLUME = 0.25; // of full scale
  const FADE_IN = 3, FADE_OUT = 0.8; // seconds
  const TEXTS = {
    stop: 'وقّف الموسيقى الهادية',
    start: 'شغّل الموسيقى الهادية',
  };

  // ---------- pure logic (tests/store-music.cjs) ----------
  // the pharmacy's own phone: the owner's bot is signed in on it (the same test store/account.js uses)
  const isPharmacyPhone = (keys) => Array.from(keys || []).some((k) => /^sb-[a-z0-9]+-auth-token$/.test(k));
  // 'none' = no sound and no button (the pharmacy's own phone, a browser with no Web Audio); 'auto' = plays by itself; 'stopped' = the customer stopped it: only his button starts it
  function modeOf(o) {
    if (!o || o.pharmacy || !o.supported) return 'none';
    return o.off ? 'stopped' : 'auto';
  }
  // is sound wanted this very moment?
  function wanted(o) { return o.mode === 'auto' && !o.hidden && !(o.holds > 0); }

  // The score: chords of C major (one per 9 s, each pad overlapping the next by 4 s), and every few seconds a small phrase of 1-3 bell notes stepping along the pentatonic
  // scale, then a long quiet gap. Times are in seconds from the start; `until(limit)` gives only the events not given yet, so a player asks a few seconds ahead.
  const CHORDS = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 64]]; // Cmaj7, Am7, Fmaj7, G6 (midi numbers, middle octave: a phone speaker can play them)
  const BELLS = [67, 69, 72, 74, 76, 79, 81, 84]; // G4 A4 C5 D5 E5 G5 A5 C6: C major pentatonic
  const CHORD_LEN = 9, PAD_EXTRA = 4;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function composer(seed) {
    let s = (seed >>> 0) || 1;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let chordAt = 0, bellAt = 3.2, ci = 0, last = 3;
    return {
      until(limit) {
        const ev = [];
        while (chordAt < limit) { ev.push({ type: 'pad', t: chordAt, dur: CHORD_LEN + PAD_EXTRA, notes: CHORDS[ci % CHORDS.length].slice() }); ci++; chordAt += CHORD_LEN; }
        while (bellAt < limit) {
          const n = 1 + Math.floor(rnd() * 3), dir = rnd() < 0.5 ? -1 : 1;
          let k = last, t = bellAt;
          for (let i = 0; i < n; i++) {
            k += i === 0 ? Math.floor(rnd() * 3) - 1 : dir * (1 + Math.floor(rnd() * 2));
            k = Math.max(0, Math.min(BELLS.length - 1, k));
            ev.push({ type: 'bell', t, dur: 4.5, note: BELLS[k], vel: 0.5 + rnd() * 0.5 });
            t += 0.55 + rnd() * 0.5;
          }
          last = k;
          bellAt = t + 2.2 + rnd() * 3.4;
        }
        return ev;
      },
    };
  }

  // ---------- the sound (Web Audio) ----------
  // The signal path: every voice -> dry -> master (the fade) -> breath (a very slow swell) -> speakers; the bells also feed an echo (delay + feedback through a low-pass) back into master.
  function buildGraph(ctx) {
    const master = ctx.createGain(); master.gain.value = 0;
    const breath = ctx.createGain(); breath.gain.value = 0.9;
    const lfo = ctx.createOscillator(), lfoAmt = ctx.createGain();
    lfo.frequency.value = 0.045; lfoAmt.gain.value = 0.1; lfo.connect(lfoAmt); lfoAmt.connect(breath.gain); lfo.start();
    const dry = ctx.createGain();
    const send = ctx.createGain(); send.gain.value = 0.55;
    const delay = ctx.createDelay(2); delay.delayTime.value = 0.46;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2400;
    const wet = ctx.createGain(); wet.gain.value = 0.6;
    dry.connect(master);
    send.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(wet); wet.connect(master);
    master.connect(breath); breath.connect(ctx.destination);
    return { master, dry, send };
  }
  // one event -> a few short-lived nodes at the context time `at`
  function voice(ctx, g, e, at) {
    if (e.type === 'pad') {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.3;
      const env = ctx.createGain(); env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(1, at + 3); env.gain.setValueAtTime(1, at + e.dur - 3.5); env.gain.linearRampToValueAtTime(0, at + e.dur);
      lp.connect(env); env.connect(g.dry);
      for (const m of e.notes) for (const [type, cents, amp] of [['sine', -5, 0.14], ['triangle', 5, 0.08]]) {
        const o = ctx.createOscillator(), a = ctx.createGain();
        o.type = type; o.frequency.value = hz(m); o.detune.value = cents; a.gain.value = amp;
        o.connect(a); a.connect(lp); o.start(at); o.stop(at + e.dur + 0.1);
      }
    } else {
      const f = hz(e.note), env = ctx.createGain(), peak = 0.6 * e.vel;
      env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(peak, at + 0.015); env.gain.exponentialRampToValueAtTime(0.0008, at + e.dur);
      env.connect(g.dry); env.connect(g.send);
      for (const [mul, amp] of [[1, 1], [2.01, 0.25]]) {
        const o = ctx.createOscillator(), a = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f * mul; a.gain.value = amp;
        o.connect(a); a.connect(env); o.start(at); o.stop(at + e.dur + 0.1);
      }
    }
  }
  // a rendering of `seconds` of the music into an AudioBuffer (a listening sample, the tests): the very same score and sounds as the page plays
  function renderBuffer(seconds, seed, rate) {
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const ctx = new OAC(1, Math.ceil(seconds * (rate || 44100)), rate || 44100);
    const g = buildGraph(ctx), start = 0.05;
    g.master.gain.setValueAtTime(0, 0); g.master.gain.linearRampToValueAtTime(VOLUME, FADE_IN);
    for (const e of composer(seed || 1).until(seconds)) voice(ctx, g, e, start + e.t);
    return ctx.startRendering();
  }

  // ---------- the player ----------
  const api = { isPharmacyPhone, modeOf, wanted, composer, renderBuffer, TEXTS, KEY, CHORDS, BELLS, VOLUME, FADE_IN };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  const AC = root.AudioContext || root.webkitAudioContext;
  const store = (fn) => { try { return fn(root.localStorage); } catch (e) { return null; } }; // a private window or blocked storage: nothing remembered
  let mode = modeOf({ pharmacy: store((ls) => isPharmacyPhone(Object.keys(ls))), off: store((ls) => ls.getItem(KEY) === '1'), supported: !!AC });
  api.mode = () => mode;
  if (mode === 'none') { api.sounding = () => false; api.hold = api.release = api.press = () => {}; root.AskerStoreMusic = api; return; }

  let ctx = null, g = null, comp = null, timer = null, t0 = 0, target = 0, suspendTimer = null, btn = null;
  const holds = new Set();
  const sounding = () => !!ctx && ctx.state === 'running' && target > 0;
  api.sounding = sounding;

  function ramp(to, secs) {
    const p = g.master.gain, now = ctx.currentTime;
    p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(to, now + secs);
  }
  function pump() {
    if (!ctx || ctx.state !== 'running') return;
    for (const e of comp.until(ctx.currentTime - t0 + 8)) voice(ctx, g, e, t0 + e.t);
  }
  function ensure() {
    if (ctx) return true;
    try { ctx = new AC(); } catch (e) { mode = 'none'; return false; }
    g = buildGraph(ctx); comp = composer((Math.random() * 4294967296) >>> 0); t0 = ctx.currentTime + 0.1;
    ctx.onstatechange = () => { sync(); };
    return true;
  }
  // make the sound match what is wanted now: start / fade in, or fade out and let the engine sleep
  function sync() {
    if (mode === 'none') { draw(); return; }
    const want = wanted({ mode, hidden: document.hidden, holds: holds.size });
    if (want) {
      clearTimeout(suspendTimer); suspendTimer = null;
      if (!ensure()) { draw(); return; }
      if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => { /* the browser wants a tap first: the next one starts it */ }); draw(); return; }
      if (!timer) { timer = setInterval(pump, 1500); }
      pump();
      if (target !== VOLUME) { target = VOLUME; ramp(VOLUME, FADE_IN); }
    } else if (ctx) {
      if (target !== 0) { target = 0; if (ctx.state === 'running') ramp(0, document.hidden ? 0.05 : FADE_OUT); }
      if (!suspendTimer && ctx.state === 'running') {
        suspendTimer = setTimeout(() => { suspendTimer = null; if (target === 0 && ctx.state === 'running') ctx.suspend().catch(() => { /* gone */ }); }, (document.hidden ? 0.1 : FADE_OUT + 0.1) * 1000);
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
    else { mode = 'auto'; store((ls) => ls.removeItem(KEY)); }
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
  // a voice note from the pharmacy plays (or a video): the music steps aside until it ends
  const media = new Set();
  const isSound = (e) => e.target && /^(AUDIO|VIDEO)$/.test(e.target.tagName) && !e.target.muted;
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
