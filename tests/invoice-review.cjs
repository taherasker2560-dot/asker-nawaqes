// «🧾 مراجعة الفواتير» (owner 2026-11-21): the pure helpers of ar/invoice-review.js (the notes he has not answered, the check «lines = the paper's net», what an approval needs,
// the chip on a card, the order of the cards, the ready ones with nothing to ask, the number for the badge). Made-up suppliers and invoices only: the repository is public.
const assert = require('node:assert/strict');
const L = require('../ar/invoice-review.js');
const line = (n, total, extra) => ({ n, paper: 'دوا ' + n, qty: 1, disc: 25, exp: '082029', id: 100 + n, name: 'ITEM ' + n, total, ...extra });
const row = (o) => ({ id: 1, ord: 1, supplier: 'مورد مثال', doc_no: '9001', total: 100, status: 'ready', lines: [line(1, 60), line(2, 40)], notes: [], answers: {}, ...o });

// the check: the lines add up to the paper's net (a cent of rounding is fine), otherwise the difference is shown
assert.deepEqual(L.check(row()), { ok: true, sum: 100, total: 100, diff: 0 });
assert.equal(L.check(row({ lines: [line(1, 60.004), line(2, 39.996)] })).ok, true);
const bad = L.check(row({ lines: [line(1, 60), line(2, 41.5)] }));
assert.deepEqual([bad.ok, bad.sum, bad.diff], [false, 101.5, 1.5]);
assert.equal(L.check(row({ lines: null, total: 0 })).ok, true, 'nothing to add');

// notes: open ones, and an approval needs every one answered (and only a waiting invoice)
const N = [{ id: 'n1', line: 1, text: 'a', mine: 'b', alts: [{ k: 'x', t: 'خيار' }] }, { id: 'n2', line: null, text: 'c' }];
assert.deepEqual(L.openNotes(row({ notes: N })).map((n) => n.id), ['n1', 'n2']);
assert.deepEqual(L.openNotes(row({ notes: N, answers: { n1: { v: 'ok' } } })).map((n) => n.id), ['n2']);
assert.equal(L.canApprove(row({ notes: N })), false, 'two open notes');
assert.equal(L.canApprove(row({ notes: N, answers: { n1: { v: 'ok' }, n2: { v: 'text', t: 'اكتب كذا' } } })), true);
assert.equal(L.canApprove(row()), true, 'nothing to ask');
assert.equal(L.canApprove(row({ status: 'held' })), true, 'a held one can be approved');
for (const s of ['approved', 'entering', 'entered', 'failed', 'cancelled']) assert.equal(L.canApprove(row({ status: s })), false, s + ' is not his to approve');
assert.equal(L.canApprove(null), false);

// a line is flagged when a note is about it; what he answered, in words
assert.equal(L.flagged(row({ notes: N }), line(1, 1)), true);
assert.equal(L.flagged(row({ notes: N }), line(2, 1)), false, 'a general note flags no line');
assert.equal(L.answerText(N[0], { v: 'ok' }), 'ماشي كده ✓');
assert.equal(L.answerText(N[0], { v: 'alt', k: 'x', t: 'خيار' }), 'هتتعمل: خيار');
assert.equal(L.answerText(N[0], { v: 'alt', k: 'x' }), 'هتتعمل: خيار', 'the choice\'s words come from the note when the answer has none');
assert.equal(L.answerText(N[1], { v: 'text', t: 'اكتب كذا' }), 'هتتعمل: اكتب كذا');
assert.equal(L.answerText(N[0], null), '');

// the chip
assert.deepEqual(L.chip(row({ notes: N })), { t: 'N_NOTES', n: 2, kind: 'warn' });
assert.deepEqual(L.chip(row({ notes: N, answers: { n1: { v: 'ok' }, n2: { v: 'ok' } } })), { t: 'جاهزة ✓', kind: 'good' });
assert.equal(L.chip(row({ status: 'approved' })).kind, 'run');
assert.equal(L.chip(row({ status: 'entering' })).t, 'بتتدخل…');
assert.deepEqual(L.chip(row({ status: 'entered' })), { t: 'اتدخلت ✓', kind: 'good' });
assert.equal(L.chip(row({ status: 'failed' })).kind, 'bad');
assert.equal(L.chip(row({ status: 'held' })).t, 'موقوفة');

// the order of the cards: waiting ones by their box number, then the laptop's, the stopped, the finished (newest first, twelve at most)
const R = [row({ id: 5, ord: 3 }), row({ id: 1, ord: 1 }), row({ id: 4, ord: null }), row({ id: 3, ord: 2, status: 'held' }), row({ id: 6, ord: 4, status: 'approved' }),
  row({ id: 7, ord: 5, status: 'entering' }), row({ id: 8, status: 'failed' }), row({ id: 9, status: 'cancelled' })];
for (let i = 0; i < 14; i++) R.push(row({ id: 100 + i, ord: i + 1, status: 'entered', done_at: `2026-11-21T10:${String(i).padStart(2, '0')}:00Z` }));
const S = L.sections(R);
assert.deepEqual(S.waiting.map((r) => r.id), [1, 3, 5, 4], 'box 1, 2, 3, then the one with no box');
assert.deepEqual(S.laptop.map((r) => r.id), [6, 7]);
assert.deepEqual(S.stopped.map((r) => r.id), [8]);
assert.equal(S.done.length, 12);assert.equal(S.done[0].id, 113, 'newest first');
assert.ok(![].concat(S.waiting, S.laptop, S.stopped, S.done).some((r) => r.id === 9), 'a cancelled one is not shown');
assert.deepEqual(L.sections(null), { waiting: [], laptop: [], stopped: [], done: [] });

// the ready ones with nothing to ask and a clean check; the summary and the badge
const mix = [row({ id: 1 }), row({ id: 2, notes: N }), row({ id: 3, lines: [line(1, 1)] }), row({ id: 4, status: 'held' }), row({ id: 5, status: 'approved' })];
assert.deepEqual(L.cleanReady(mix).map((r) => r.id), [1], 'only: ready, no notes, lines = net');
assert.deepEqual(L.summary(mix), { waiting: 4, withNotes: 1, clean: 1, laptop: 1 });
assert.equal(L.need(mix), 3, 'the badge counts the ready ones (held ones wait on purpose)');
assert.equal(L.need(null), 0);

// small ones
assert.equal(L.expiryText('082029'), '08/2029');assert.equal(L.expiryText('08/2029'), '08/2029');assert.equal(L.expiryText(null), '');
assert.equal(L.money(1422), '1,422.00');assert.equal(L.money('3997.19'), '3,997.19');assert.equal(L.money(null), '0.00');
assert.equal(L.sumLines(row({ lines: [line(1, 0.1), line(2, 0.2)] })), 0.3, 'no float tail');
console.log('PASS: invoice review helpers');
