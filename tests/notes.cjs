// «ملاحظاتي» (ar/notes.js, owner 2026-11-15): the pure part. Open notes oldest first, what he did in the last 36 hours, where the
// laptop says he is (a word older than 25 minutes = unknown), the notes due in the pharmacy, one bell per arrival.
const assert = require('node:assert/strict');
global.window = global;
const N = require('../ar/notes.js');

const now = Date.parse('2026-11-15T15:00:00Z');
const iso = (minAgo) => new Date(now - minAgo * 6e4).toISOString();
assert.equal(N.clean('  اسأل   على الفاتورة. '), 'اسأل على الفاتورة');
assert.equal(N.clean(null), '');
assert.equal(N.clean('x'.repeat(600)).length, 500);

const notes = [
  { id: 3, text: 'c', place: 'pharmacy', status: 'open', created_at: iso(60) },
  { id: 1, text: 'a', place: 'pharmacy', status: 'open', created_at: iso(3000) },
  { id: 2, text: 'b', place: 'any', status: 'open', created_at: iso(200) },
  { id: 4, text: 'd', place: 'pharmacy', status: 'done', created_at: iso(900), done_at: iso(30) },
  { id: 5, text: 'e', place: 'pharmacy', status: 'done', created_at: iso(9000), done_at: iso(60 * 40) },   // done 40 hours ago: not shown
  { id: 6, text: 'f', place: 'pharmacy', status: 'cancelled', created_at: iso(10) },
];
const s = N.split(notes, now);
assert.deepEqual(s.open.map((n) => n.id), [1, 2, 3], 'the oldest waits first');
assert.deepEqual(s.done.map((n) => n.id), [4], 'only what was done in the last 36 hours');
assert.deepEqual(N.split(null, now), { open: [], done: [] });

// where he is: the laptop's last word, fresh or not
const P = (at, minAgo) => ({ at_pharmacy: at, since: iso(500), checked_at: iso(minAgo) });
assert.equal(N.where(P(true, 3), now), 'in');
assert.equal(N.where(P(false, 3), now), 'out');
assert.equal(N.where(P(true, 26), now), 'unknown', 'an old word is not a position');
assert.equal(N.where(P(true, 25), now), 'in');
assert.equal(N.where(null, now), 'unknown');
assert.equal(N.where({ at_pharmacy: null, checked_at: iso(1) }, now), 'unknown');
assert.equal(N.where({ at_pharmacy: true, checked_at: 'garbage' }, now), 'unknown');

// due: only the pharmacy notes, only while he is there
assert.deepEqual(N.due(notes, P(true, 3), now).map((n) => n.id), [1, 3]);
assert.deepEqual(N.due(notes, P(false, 3), now), []);
assert.deepEqual(N.due(notes, P(true, 99), now), [], 'no fresh word, no reminder');

// one bell per arrival (the row\'s «since» names the arrival)
const p = { at_pharmacy: true, since: '2026-11-15T14:50:00Z', checked_at: iso(2) };
assert.equal(N.shouldRing(notes, p, '', now), true);
assert.equal(N.shouldRing(notes, p, '2026-11-15T14:50:00Z', now), false, 'already rung for this arrival');
assert.equal(N.shouldRing(notes, { ...p, since: '2026-11-15T14:58:00Z' }, '2026-11-15T14:50:00Z', now), true, 'a new arrival rings again');
assert.equal(N.shouldRing([notes[2]], p, '', now), false, 'nothing waits for the pharmacy');
assert.equal(N.shouldRing(notes, { ...p, at_pharmacy: false }, '', now), false);

// a note\'s age
assert.equal(N.age(iso(60), now), '');
assert.equal(N.age(iso(60 * 24 * 1), now), 'من امبارح');
assert.equal(N.age(iso(60 * 24 * 2), now), 'من يومين');
assert.equal(N.age(iso(60 * 24 * 5), now), 'من 5 أيام');
console.log('notes: ok');
