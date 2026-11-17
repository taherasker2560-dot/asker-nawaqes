/* Light shop-and-mall music on the store site (owner 2026-11-17: «الزبون وهو بيتصفح الموقع أو رابطه الشخصي يسمع موسيقى هادية تشجع على الشراء»;
   his decision: «هو يفتح تلقائي بالصوت، والإغلاق يبقى له زرار، ماشي»; «ويكون زرار مخفي، أنا عاوزه يسمع»; and after the first sample: «صوت الزنة في خلفية المزيكا مزعج،
   عاوز حاجة زي أماكن التسوق والمولات، وعاوز كذا حاجة بتتغير لمدة نص ساعة طول ما العميل بيتصفح، يعني طول النص ساعة منكررش، نغير موسيقى جديدة»).
   - The music is MADE in the page with the Web Audio API: no file, no licence, no data. Only notes that are struck and fade (electric piano, plucks, marimba, vibes, a soft bass, a
     light kick, hats, a shaker, a rim click): NO held tone anywhere, because a held tone is what hums («الزنة»). A touch of room echo, a gentle compressor, nothing else.
   - EIGHT pieces, each about 4 minutes (a tempo, a key, two chord loops, a groove and instruments of its own), played in a shuffled order: a visit of half an hour (or the
     32 minutes of all eight) never hears the same piece twice, and the next round is shuffled again (never the same piece twice in a row). Inside a piece the parts change by
     blocks of 8 bars: intro, groove, melody, break, outro.
   - It starts by itself (installed apps and some browsers allow it at once); where the browser needs a first touch, the first tap / key press anywhere starts it
     (the customer presses nothing music-related). Fades in over 3 s, low volume.
   - ONE small quiet round button (28 px, about 40 % see-through) stops / starts it. A customer who stops it is remembered (localStorage asker_store_music_off): it never starts
     by itself again on that phone until he presses the button.
   - It pauses while the page is hidden (phone locked, another tab), and while a voice note plays or is being recorded (store/chat.js asks with hold('rec')).
   - NEVER on the pharmacy's own phone (the owner's bot is signed in there: sb-…-auth-token in localStorage): no sound and no button. Nothing in the bot (ar/) changes.
   Honest limits: on an iPhone the first tap is needed and the silent switch mutes Web Audio; any phone stops the music when it locks. Loaded before store/chat.js. */
(function (root) {
  'use strict';

  const KEY = 'asker_store_music_off';
  const VOLUME = 0.13; // of full scale: «موجودة ومش موجودة» (owner 2026-11-17, after the first mall-style sample: lower, so it never makes a racket around the browser); the first sample was 0.25
  const FADE_IN = 3, FADE_OUT = 0.8; // seconds
  const TEXTS = {
    stop: 'وقّف الموسيقى الهادية',
    start: 'شغّل الموسيقى الهادية',
  };

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
  // a rendering of `seconds` of the music into an AudioBuffer (a listening sample, the tests): the very same score and sounds as the page plays
  function renderBuffer(seconds, seed, rate, opts) {
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const ctx = new OAC(1, Math.ceil(seconds * (rate || 44100)), rate || 44100);
    const g = buildGraph(ctx), start = 0.05;
    g.master.gain.setValueAtTime(0, 0); g.master.gain.linearRampToValueAtTime(VOLUME, FADE_IN);
    for (const e of composer(seed || 1, opts).until(seconds)) voice(ctx, g, e, start + e.t);
    return ctx.startRendering();
  }

  // ---------- the player ----------
  const api = { isPharmacyPhone, modeOf, wanted, composer, renderBuffer, TEXTS, KEY, STYLES, barsOf, VOLUME, FADE_IN };
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
