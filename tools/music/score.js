/* The music's SCORE and SOUNDS (the composer and the Web Audio voices), moved out of the page on 2026-11-17.
   Why: the page used to make the music live (a phone had to synthesise it while the customer browsed). One minute of it takes 47-89 seconds to render on the owner's laptop,
   so a weak phone cannot keep up and the music cut out (owner 2026-11-17: «صوت المزيكا مش مظبوط خالص وبيقطع والناس اشتكت»). Now this file is only a TOOL: tools/music/render.cjs renders every
   piece once, offline, to an MP3 in store/music/, and store/music.js just plays those files (no synthesis on the phone). A new piece or a changed sound = edit here, then render again.
   Same score and sounds as before (the tests in tests/store-music.cjs still check them). Node: require('../tools/music/score.js'); the browser tool loads it as a plain script (window.AskerMusicScore). */
(function (root) {
  'use strict';
  const VOLUME = 1; // the files are rendered at full level and normalised by the render tool; the page sets the listening level
  // ---------- the score ----------
  // chord shapes (semitones above the chord's root)
  const Q = { maj: [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], add9: [0, 4, 7, 14] };
  // Every piece: tempo, tonic (midi number), swing, which instrument plays the chords («keys»: ep = chord stabs; pluck / marimba = a broken chord) and the melody («lead»),
  // two loops of four chords (A, B: [semitones above the tonic, shape], one chord per bar), and one 16-step pattern per layer (x = a hit). Everything is diatonic and simple on purpose.
  const STYLES = [
    { name: 'bossa', bpm: 96, tonic: 60, swing: 0.1, keys: 'ep', lead: 'vibes',
      A: [[0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, '7']], B: [[5, 'maj7'], [4, 'm7'], [2, 'm7'], [7, '7']],
      kick: 'x.....x.x.....x.', hat: 'x.x.x.x.x.x.x.x.', snap: '....x.......x...', shk: 'xxxxxxxxxxxxxxxx', comp: 'x.....x..x....x.', bass: 'x.....x.x.....x.' },
    { name: 'soft house', bpm: 108, tonic: 65, swing: 0, keys: 'pluck', lead: 'marimba',
      A: [[0, 'maj7'], [9, 'm7'], [5, 'maj7'], [7, '7']], B: [[2, 'm7'], [7, '7'], [0, 'maj7'], [5, 'maj7']],
      kick: 'x...x...x...x...', hat: '..x...x...x...x.', snap: '....x.......x...', shk: '.x.x.x.x.x.x.x.x', comp: 'x.x.x.x.x.x.x.x.', bass: 'x.x...x.x.x...x.' },
    { name: 'chill pop', bpm: 92, tonic: 62, swing: 0.05, keys: 'ep', lead: 'pluck',
      A: [[0, 'add9'], [7, 'add9'], [9, 'm7'], [5, 'maj7']], B: [[9, 'm7'], [5, 'maj7'], [0, 'add9'], [7, 'add9']],
      kick: 'x.......x.x.....', hat: 'x.x.x.x.x.x.x.x.', snap: '....x.......x...', shk: '.x...x...x...x..', comp: 'x..x..x...x.....', bass: 'x.......x.x.....' },
    { name: 'marimba', bpm: 100, tonic: 67, swing: 0.06, keys: 'marimba', lead: 'vibes',
      A: [[0, 'maj7'], [9, 'm7'], [5, 'maj7'], [7, '7']], B: [[2, 'm7'], [7, '7'], [0, 'maj7'], [5, 'maj7']],
      kick: 'x.....x...x.....', hat: '..x...x...x...x.', snap: '....x.......x...', shk: 'x.x.x.x.x.x.x.x.', comp: 'x.x.x.x.x.x.x.x.', bass: 'x.....x...x.....' },
    { name: 'smooth', bpm: 88, tonic: 63, swing: 0.18, keys: 'ep', lead: 'vibes',
      A: [[2, 'm7'], [7, '7'], [0, 'maj7'], [9, 'm7']], B: [[5, 'maj7'], [4, 'm7'], [2, 'm7'], [7, '7']],
      kick: 'x.......x.......', hat: 'x.x.x.x.x.x.x.x.', snap: '....x.......x...', shk: '................', comp: 'x.....x....x....', bass: 'x.....x.x.......' },
    { name: 'bright', bpm: 112, tonic: 69, swing: 0, keys: 'pluck', lead: 'marimba',
      A: [[0, 'add9'], [9, 'm7'], [5, 'maj7'], [7, 'add9']], B: [[5, 'maj7'], [7, 'add9'], [9, 'm7'], [0, 'add9']],
      kick: 'x...x...x...x...', hat: 'xxxxxxxxxxxxxxxx', snap: '....x.......x...', shk: '.x.x.x.x.x.x.x.x', comp: 'x..x..x.x..x..x.', bass: 'x..x..x.x..x..x.' },
    { name: 'dreamy', bpm: 84, tonic: 70, swing: 0.08, keys: 'ep', lead: 'vibes',
      A: [[0, 'maj7'], [9, 'm7'], [5, 'maj7'], [7, 'add9']], B: [[2, 'm7'], [5, 'maj7'], [0, 'maj7'], [7, '7']],
      kick: 'x.......x.......', hat: '..x...x...x...x.', snap: '................', shk: 'x.x.x.x.x.x.x.x.', comp: 'x.......x.......', bass: 'x.......x.......' },
    { name: 'sunny', bpm: 104, tonic: 64, swing: 0.05, keys: 'pluck', lead: 'vibes',
      A: [[0, 'add9'], [9, 'm7'], [5, 'maj7'], [7, '7']], B: [[5, 'maj7'], [7, '7'], [0, 'add9'], [9, 'm7']],
      kick: 'x.....x...x.x...', hat: 'x.x.x.x.x.x.x.x.', snap: '....x.......x...', shk: 'xxxxxxxxxxxxxxxx', comp: 'x..x..x...x..x..', bass: 'x.....x...x.x...' },
  ];
  // a piece is about 4 minutes, in blocks of 8 bars: eight pieces last more than 30 minutes
  const barsOf = (bpm) => Math.max(8, Math.round(240 / (4 * 60 / bpm) / 8) * 8);
  // what each block of 8 bars plays: a level for each layer (0 = off), the chance of a melody in a bar
  const SECS = {
    intro: { keys: 1, bass: 0, kick: 0, hat: 0.4, shk: 0.6, snap: 0, lead: 0 },
    A: { keys: 1, bass: 1, kick: 1, hat: 1, shk: 1, snap: 1, lead: 0 },
    B: { keys: 1, bass: 1, kick: 1, hat: 1, shk: 1, snap: 1, lead: 0.75 },
    A2: { keys: 1, bass: 1, kick: 1, hat: 1, shk: 1, snap: 1, lead: 0.3 },
    brk: { keys: 1, bass: 0.6, kick: 0, hat: 0.3, shk: 0.5, snap: 0, lead: 0.25 },
    outro: { keys: 0.8, bass: 0, kick: 0, hat: 0.3, shk: 0.4, snap: 0, lead: 0 },
  };
  const PLAN = ['intro', 'A', 'B', 'A2', 'B', 'brk', 'A', 'B', 'A2', 'B', 'brk', 'A', 'B', 'A2']; // then the outro
  const planOf = (blocks) => { const p = []; for (let i = 0; i < blocks - 1; i++) p.push(PLAN[i % PLAN.length]); p.push('outro'); return p; };
  const MOTIFS = [[0, 6, 10], [0, 3, 6, 10], [2, 6, 12], [0, 8], [4, 8, 14], [0, 4, 8, 12]]; // the steps of a bar where the melody plays
  const PENTA = [0, 2, 4, 7, 9]; // major pentatonic: sits well on every chord of the loops
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const fold = (n, lo, hi) => { while (n >= hi) n -= 12; while (n < lo) n += 12; return n; };
  const prng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  // The composer: gives the events of the music in time order. `until(limit)` gives only the events not given yet (seconds from the start), so a player asks a few seconds ahead.
  // An event: {type, ch, t, dur, note, vel, p} (p = the piece's number in STYLES). opts (listening samples, tests): first = the piece to start with, fromBar = the bar to start at.
  function composer(seed, opts) {
    opts = opts || {};
    const rnd = prng(seed), rng = (a, b) => a + rnd() * (b - a);
    let queue = [], last = -1, firstDone = false, cursor = 0, cur = null;
    const done = [];
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    function nextPiece() {
      if (cur) done.push({ style: cur.s, name: cur.st.name, t0: cur.t0, t1: cursor });
      if (!queue.length) { queue = shuffle(STYLES.map((_, i) => i)); if (queue[0] === last) { const j = 1 + Math.floor(rnd() * (queue.length - 1)); [queue[0], queue[j]] = [queue[j], queue[0]]; } }
      let s;
      if (!firstDone && opts.first != null) { s = opts.first; queue = queue.filter((x) => x !== s); } else s = queue.shift();
      const st = STYLES[s], bars = barsOf(st.bpm), from = !firstDone ? Math.min(bars - 1, opts.fromBar || 0) : 0;
      firstDone = true; last = s;
      cur = { s, st, bars, bi: from, t0: cursor - from * 4 * 60 / st.bpm, plan: planOf(bars / 8), arp: 0, lead: 0, leadK: 5 };
      // the melody pool: the pentatonic scale of the key, from about C5 up to about E6
      const base = fold(st.tonic, 60, 72);
      cur.pool = []; for (let k = 1; k <= 2; k++) for (const d of PENTA) if (base + 12 * k + d <= 88) cur.pool.push(base + 12 * k + d);
      cur.leadK = 4;
    }
    function bar(ev) {
      const c = cur, st = c.st, sd = 60 / st.bpm / 4, tb = cursor, sec = SECS[c.plan[Math.floor(c.bi / 8)]], secName = c.plan[Math.floor(c.bi / 8)];
      const prog = secName === 'B' ? st.B : st.A, [root, shape] = prog[c.bi % 4];
      const last1 = c.bi === c.bars - 1, lvl = c.bi === 0 ? 0.55 : c.bi === 1 ? 0.8 : last1 ? 0.5 : c.bi === c.bars - 2 ? 0.8 : 1;
      const tones = Q[shape].map((o) => fold(st.tonic + root + o, 57, 73)).sort((a, b) => a - b);
      // `off`: a little later in steps (the notes of a chord are rolled a hair apart); the swing leans the off-beat 16ths
      const add = (type, ch, step, dur, note, vel, jit, off) => {
        const t = tb + (step + (off || 0)) * sd + (step % 2 ? st.swing * sd : 0) + (jit ? rng(-0.006, 0.006) : 0);
        ev.push({ type, ch, t: Math.max(tb, t), dur, note, vel: Math.max(0.05, Math.min(1, vel * lvl)), p: c.s });
      };
      for (let step = 0; step < 16; step++) {
        const on = (pat) => pat[step] === 'x';
        // the chords: stabs of electric piano, or a broken chord of plucks / marimba
        if (on(st.comp) && sec.keys) {
          if (st.keys === 'ep') {
            const v = rng(0.7, 0.95) * sec.keys; tones.forEach((n, i) => add('ep', 'keys', step, 1.5, n, v * (i === tones.length - 1 ? 0.8 : 1), true, i * 0.04));
          } else {
            const arp = tones.concat(tones.map((n) => n + 12)); add(st.keys, 'keys', step, 0.8, arp[c.arp++ % arp.length], rng(0.6, 0.9) * sec.keys, true);
          }
        }
        if (on(st.bass) && sec.bass) { const bn = fold(st.tonic + root, 43, 55), fifth = fold(bn + 7, 43, 55); add('bass', 'bass', step, 0.5, step % 8 === 6 && rnd() < 0.35 ? fifth : bn, rng(0.75, 1) * sec.bass, false); }
        if (!last1) {
          if (on(st.kick) && sec.kick) add('kick', 'kick', step, 0.3, null, rng(0.8, 1) * sec.kick, false);
          if (on(st.hat) && sec.hat) add('hat', 'hat', step, 0.06, null, (step % 4 === 2 ? 1 : 0.6) * rng(0.7, 1) * sec.hat, true);
          if (on(st.shk) && sec.shk) add('shk', 'hat', step, 0.09, null, (step % 4 === 0 ? 1 : 0.55) * rng(0.7, 1) * sec.shk, true);
          if (on(st.snap) && sec.snap) add('snap', 'snap', step, 0.12, null, rng(0.8, 1) * sec.snap, false);
        }
      }
      // the melody: a short motif of 2-4 notes walking along the scale, in some bars only (the rest breathes)
      if (sec.lead && rnd() < sec.lead) {
        const m = MOTIFS[Math.floor(rnd() * MOTIFS.length)];
        for (const step of m) {
          c.leadK = Math.max(0, Math.min(c.pool.length - 1, c.leadK + Math.floor(rnd() * 5) - 2));
          add(st.lead, 'lead', step, st.lead === 'vibes' ? 1.8 : 0.9, c.pool[c.leadK], rng(0.55, 0.85), true);
        }
      }
    }
    return {
      until(limit) {
        const ev = [];
        while (cursor < limit) {
          if (!cur || cur.bi >= cur.bars) nextPiece();
          bar(ev); cur.bi++; cursor += 4 * 60 / cur.st.bpm;
        }
        return ev;
      },
      // the pieces started so far (the one playing has t1 null)
      pieces() { return done.concat(cur ? [{ style: cur.s, name: cur.st.name, t0: cur.t0, t1: null }] : []); },
    };
  }

  // ---------- the sound (Web Audio) ----------
  // The signal path: every voice -> its bus (a level, and a little send to the room) -> mix -> a gentle compressor -> master (the fade) -> speakers.
  function buildGraph(ctx) {
    const rate = ctx.sampleRate, master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    const mix = ctx.createGain(); mix.gain.value = 1.3;
    mix.connect(comp); comp.connect(master); master.connect(ctx.destination);
    // the room: a short, dark echo made of decaying noise
    const ir = ctx.createBuffer(1, Math.floor(rate * 1.4), rate), d = ir.getChannelData(0);
    let y = 0; for (let i = 0; i < d.length; i++) { y += 0.35 * ((Math.random() * 2 - 1) - y); d[i] = y * Math.pow(1 - i / d.length, 2.6); }
    const rev = ctx.createConvolver(); rev.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.9; rev.connect(wet); wet.connect(mix);
    const bus = (level, send) => { const b = ctx.createGain(); b.gain.value = level; b.connect(mix); if (send) { const s = ctx.createGain(); s.gain.value = send; b.connect(s); s.connect(rev); } return b; };
    const noise = ctx.createBuffer(1, rate, rate), nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return { master, noise, keys: bus(0.8, 0.3), lead: bus(0.65, 0.4), bass: bus(1, 0), kick: bus(1, 0), hat: bus(0.45, 0.06), snap: bus(0.7, 0.18) };
  }
  // a struck sound: up in a moment, then down smoothly (never held)
  function amp(ctx, at, attack, peak, decay) {
    const a = ctx.createGain();
    a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(peak, at + attack); a.gain.exponentialRampToValueAtTime(0.0008, at + attack + decay);
    return a;
  }
  function osc(ctx, type, f, at, end, to) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(to); o.start(at); o.stop(end); return o; }
  function hiss(ctx, g, at, dur, filter, freq, q, peak, attack, to) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), a = amp(ctx, at, attack, peak, dur);
    s.buffer = g.noise; f.type = filter; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); f.connect(a); a.connect(to); s.start(at, Math.random() * 0.4); s.stop(at + attack + dur + 0.03);
  }
  // one event -> a few short-lived nodes at the context time `at`
  function voice(ctx, g, e, at) {
    const f = e.note != null ? hz(e.note) : 0, v = e.vel, out = g[e.ch], end = at + e.dur + 0.15;
    switch (e.type) {
      case 'ep': { // an electric piano: a soft bell-like tone that rings out
        const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), a = amp(ctx, at, 0.006, 0.42 * v, e.dur), lp = ctx.createBiquadFilter();
        car.frequency.value = f; mod.frequency.value = f;
        mg.gain.setValueAtTime(f * 1.3, at); mg.gain.exponentialRampToValueAtTime(f * 0.05, at + 0.7);
        mod.connect(mg); mg.connect(car.frequency);
        lp.type = 'lowpass'; lp.frequency.value = 2800; car.connect(a); a.connect(lp); lp.connect(out);
        car.start(at); mod.start(at); car.stop(end); mod.stop(end); break;
      }
      case 'pluck': { // a soft pluck: the tone starts bright and closes quickly
        const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), a = amp(ctx, at, 0.004, 0.5 * v, e.dur);
        o.type = 'triangle'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(3400, at); lp.frequency.exponentialRampToValueAtTime(600, at + 0.3);
        o.connect(lp); lp.connect(a); a.connect(out); o.start(at); o.stop(end); break;
      }
      case 'marimba': { // a wooden mallet: the note and a short, high knock
        const a1 = amp(ctx, at, 0.003, 0.55 * v, e.dur), a2 = amp(ctx, at, 0.002, 0.18 * v, 0.14);
        a1.connect(out); a2.connect(out); osc(ctx, 'sine', f, at, end, a1); osc(ctx, 'sine', f * 4, at, at + 0.4, a2); break;
      }
      case 'vibes': { // vibraphone: a clear note that rings, with a faint high partial
        const a1 = amp(ctx, at, 0.004, 0.45 * v, e.dur), a2 = amp(ctx, at, 0.003, 0.07 * v, 0.4);
        a1.connect(out); a2.connect(out); osc(ctx, 'sine', f, at, end, a1); osc(ctx, 'sine', f * 4, at, at + 0.7, a2); break;
      }
      case 'bass': { // a round bass: the note plus its 2nd and 3rd harmonics, so a phone's small speaker can play it
        const lp = ctx.createBiquadFilter(), a = amp(ctx, at, 0.01, 0.55 * v, e.dur), o2 = ctx.createGain(), o3 = ctx.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 700; lp.connect(a); a.connect(out);
        o2.gain.value = 0.4; o3.gain.value = 0.15; o2.connect(lp); o3.connect(lp);
        osc(ctx, 'sine', f, at, end, lp); osc(ctx, 'sine', f * 2, at, end, o2); osc(ctx, 'sine', f * 3, at, end, o3); break;
      }
      case 'kick': { // a soft kick: a quick drop in pitch, and a small click that a phone speaker can hear
        const o = ctx.createOscillator(), a = amp(ctx, at, 0.002, 0.8 * v, 0.26);
        o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(48, at + 0.12); o.connect(a); a.connect(out); o.start(at); o.stop(at + 0.32);
        hiss(ctx, g, at, 0.012, 'highpass', 1800, 0.7, 0.1 * v, 0.001, out); break;
      }
      case 'hat': hiss(ctx, g, at, 0.05, 'highpass', 7000, 0.7, 0.2 * v, 0.001, out); break;
      case 'shk': hiss(ctx, g, at, 0.075, 'bandpass', 5500, 0.8, 0.26 * v, 0.012, out); break;
      case 'snap': { // a rim click
        hiss(ctx, g, at, 0.09, 'bandpass', 1900, 1.5, 0.4 * v, 0.001, out);
        const a = amp(ctx, at, 0.001, 0.16 * v, 0.05); a.connect(out); osc(ctx, 'sine', 330, at, at + 0.12, a); break;
      }
      default: break;
    }
  }

  // a rendering of ONE piece (or `seconds` of the music) into an AudioBuffer, offline: opts.first = the piece to start with, opts.fromBar = the bar to start at, opts.tail = extra seconds
  // after the last note so the last sounds can die away. The composer stops asking at `seconds`; the buffer is `seconds + tail` long.
  function renderBuffer(seconds, seed, rate, opts) {
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const r = rate || 44100, tail = (opts && opts.tail) || 0;
    const ctx = new OAC(1, Math.ceil((seconds + tail) * r), r);
    const g = buildGraph(ctx), start = 0.05;
    g.master.gain.setValueAtTime(VOLUME, 0);
    for (const e of composer(seed || 1, opts).until(seconds)) voice(ctx, g, e, start + e.t);
    return ctx.startRendering();
  }
  // how long one piece is, and how far into it a visit starts (after the 8-bar intro: a customer who just opened the page hears the groove at once)
  const lengthOf = (p) => barsOf(STYLES[p].bpm) * 4 * 60 / STYLES[p].bpm;
  const introOf = (p) => 8 * 4 * 60 / STYLES[p].bpm;

  const api = { composer, renderBuffer, STYLES, barsOf, lengthOf, introOf };
  root.AskerMusicScore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
