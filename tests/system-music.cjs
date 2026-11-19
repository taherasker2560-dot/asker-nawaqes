// «🎵 موسيقى السيستم» (owner 2026-11-19): the player's decisions in ar/music.js (who hears it, when, the order of the pieces) and that it uses the SAME pieces, level and wording as the store's
// music (store/music.js, owner 2026-11-17) while keeping its own switch (stopping one does not stop the other).
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const M = require('../ar/music.js'), S = require('../store/music.js');
// who gets what: it plays by itself unless he stopped it on this phone; no Web Audio = no sound and no button
assert.equal(M.modeOf({ off: false, supported: true }), 'auto');
assert.equal(M.modeOf({ off: true, supported: true }), 'stopped', 'he stopped it once: only his button starts it');
assert.equal(M.modeOf({ off: false, supported: false }), 'none');
assert.equal(M.modeOf({ off: true, supported: false }), 'none');
assert.equal(M.modeOf(null), 'none');
// unlike the store there is no «pharmacy phone» rule: the system IS the pharmacy's, for him and every person signed in
assert.equal(M.modeOf({ pharmacy: true, off: false, supported: true }), 'auto');
// sound wanted right now: only for somebody signed in, on a page that is shown, with nothing else making a sound
assert.equal(M.wanted({ mode: 'auto', signedIn: true, hidden: false, holds: 0 }), true);
assert.equal(M.wanted({ mode: 'auto', signedIn: false, hidden: false, holds: 0 }), false, 'the sign-in screen is silent');
assert.equal(M.wanted({ mode: 'auto', signedIn: true, hidden: true, holds: 0 }), false, 'phone locked / tab hidden');
assert.equal(M.wanted({ mode: 'auto', signedIn: true, hidden: false, holds: 1 }), false, 'a voice note plays, the phone speaks or a voice note is recorded');
assert.equal(M.wanted({ mode: 'stopped', signedIn: true, hidden: false, holds: 0 }), false);
assert.equal(M.wanted({ mode: 'none', signedIn: true, hidden: false, holds: 0 }), false);
// the rounds: every piece once, shuffled; the next round never starts with the piece that just ended
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const r1 = M.nextRound(rnd, -1, 8);
assert.deepEqual(r1.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7], 'every piece exactly once');
for (let i = 0; i < 200; i++) { const r = M.nextRound(rnd, 3, 8); assert.notEqual(r[0], 3, 'never the piece that just ended'); assert.equal(new Set(r).size, 8); }
assert.deepEqual(M.nextRound(rnd, 0, 1), [0], 'one piece: it repeats');
// the SAME pieces as the store's, in the same order, with their own intros
assert.deepEqual(M.TRACKS, S.TRACKS, 'the two lists are kept in step');
assert.equal(M.BASE, S.BASE);
for (const t of M.TRACKS) assert.ok(fs.existsSync(path.join(__dirname, '..', M.BASE, t.file)), 'the file is there: ' + t.file);
// the store's level and words; its own switch
assert.equal(M.VOLUME, S.VOLUME, 'the same quiet level the customers hear');
assert.deepEqual(M.TEXTS, S.TEXTS);
assert.equal(M.KEY, 'asker_system_music_off');
assert.notEqual(M.KEY, S.KEY, 'stopping the system\'s music does not stop the store\'s, and the other way round');
assert.equal(M.FADE_IN, S.FADE_IN);
// the version of the files in the url is the store's too (one set of files)
const src = fs.readFileSync(path.join(__dirname, '..', 'ar', 'music.js'), 'utf8'), st = fs.readFileSync(path.join(__dirname, '..', 'store', 'music.js'), 'utf8');
assert.equal(/V = '([^']+)'/.exec(src)[1], /V = '([^']+)'/.exec(st)[1], 'one version of the music files');
// English: the button's two words
global.window = global; require('../ar/i18n-en.js'); require('../ar/i18n.js');
const I = global.AskerI18n; I._use(global.AskerEN);
assert.equal(I.translate(M.TEXTS.stop), 'Stop the quiet music');
assert.equal(I.translate(M.TEXTS.start), 'Play the quiet music');
console.log('system-music ok');
