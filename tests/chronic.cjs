// «💊 مزمن» (ar/chronic.js, owner 2026-11-16, idea 5): the pure part. The laptop's file, days since, «✓ خلصنا», the groups, the name and the message.
// Made-up customers and items only (the repo is public).
const assert = require('node:assert/strict');
global.window = global;
const C = require('../ar/chronic.js');

const FILE = {
  generated_at: '2026-11-16T01:00:00Z', data_at: '2026-11-16T00:00:58',
  rows: [
    { c: 9001, i: 1001, n: 'ALPHA-TEST 10MG 30TAB', gap: 30, times: 6, q: 1, have: 2, last: '2026-10-07' },
    { c: 9001, i: 1002, n: 'BETA-TEST DROPS', gap: 31, times: 5, q: 0.5, have: 0, last: '2026-10-09' },
    { c: 9002, i: 1003, n: 'GAMMA-TEST 5MG', gap: 28, times: 4, q: 2, have: 5, last: '2026-10-11' },
    { n: 'no customer' }, null, { c: 9003, i: 5, n: '' },
  ],
};
const d = C.parse(FILE);
assert.equal(d.rows.length, 3, 'a row with no customer, no item or no name is dropped');
assert.deepEqual(d.rows[0], { c: 9001, i: 1001, n: 'ALPHA-TEST 10MG 30TAB', gap: 30, times: 6, q: 1, have: 2, last: '2026-10-07', since: 0 }, 'a row from an older file has no «since»: 0');
assert.equal(C.parse(null), null);
assert.equal(C.parse({}), null);
assert.equal(C.parse({ rows: 'x' }), null, 'anything that is not the laptop\'s file is no data');
assert.deepEqual(C.parse({ rows: [] }).rows, []);

// a file the laptop stopped updating (more than 72 hours) is not trusted
const NOW = new Date(2026, 10, 16, 12, 0, 0);
assert.equal(C.isOld(new Date(NOW.getTime() - 71 * 3600e3).toISOString(), NOW), false);
assert.equal(C.isOld(new Date(NOW.getTime() - 73 * 3600e3).toISOString(), NOW), true);
assert.equal(C.isOld('', NOW), true);

// days since the last refill, counted from its date, whatever time of day it is now
assert.equal(C.sinceDays({ last: '2026-10-07' }, NOW), 40);
assert.equal(C.sinceDays({ last: '2026-10-07' }, new Date(2026, 10, 16, 0, 5)), 40);
assert.equal(C.sinceDays({ last: '2026-10-07' }, new Date(2026, 10, 16, 23, 55)), 40);
assert.equal(C.sinceDays({ last: '2026-11-16' }, NOW), 0);
assert.equal(C.sinceDays({ last: '' }, NOW), null);

// «✓ خلصنا»: hidden while it is the same last refill and less than 14 days passed
const r0 = d.rows[0];
const DAY = 864e5;
assert.equal(C.keyOf(r0), '9001|1001');
assert.equal(C.isSnoozed({ '9001|1001': { last: '2026-10-07', at: NOW.getTime() - 5 * DAY } }, r0, NOW), true);
assert.equal(C.isSnoozed({ '9001|1001': { last: '2026-10-07', at: NOW.getTime() - 14 * DAY - 1 } }, r0, NOW), false, 'after two weeks he is reminded again');
assert.equal(C.isSnoozed({ '9001|1001': { last: '2026-09-07', at: NOW.getTime() - DAY } }, r0, NOW), false, 'he bought again (another last refill): the old «done» does not hide it');
assert.equal(C.isSnoozed({}, r0, NOW), false);
assert.equal(C.isSnoozed(null, r0, NOW), false);

// the groups: by customer, in the order of the file, without the hidden lines (a customer with all lines hidden is not there)
let g = C.groups(d.rows, {}, NOW);
assert.deepEqual(g.map((x) => [x.c, x.rows.map((r) => r.i)]), [[9001, [1001, 1002]], [9002, [1003]]]);
const done = { '9001|1001': { last: '2026-10-07', at: NOW.getTime() }, '9001|1002': { last: '2026-10-09', at: NOW.getTime() } };
g = C.groups(d.rows, done, NOW);
assert.deepEqual(g.map((x) => x.c), [9002], 'both of 9001\'s lines are hidden');
assert.deepEqual(C.groups(d.rows, { '9001|1001': { last: '2026-10-07', at: NOW.getTime() } }, NOW).map((x) => [x.c, x.rows.length]), [[9001, 1], [9002, 1]]);

// the name he is called by
assert.equal(C.firstName('د/سامي حسن'), 'سامي');
assert.equal(C.firstName('أحمد علي (500) 01000000000'), 'أحمد');
assert.equal(C.firstName('01000000000 منى سالم'), 'منى');
assert.equal(C.firstName('(1500) ليلى زيدان'), 'ليلى');
assert.equal(C.firstName('الحاج كمال'), 'كمال');
assert.equal(C.firstName('م/سمير_القاهرة'), 'سمير');
assert.equal(C.firstName('رامي/موقوف'), 'رامي', 'a note after the slash is not the name');
assert.equal(C.firstName(''), '');
assert.equal(C.firstName('0100 (x)'), '');
assert.equal(C.firstName(null), '');

// the message: polite, the medicines by name, an offer to get them ready; nothing about money
const msg = C.message('د/سامي حسن', ['ALPHA-TEST 10MG 30TAB', 'BETA-TEST DROPS']);
assert.equal(msg.split('\n')[0], 'أهلًا يا سامي 🌷');
assert.match(msg, /\(ALPHA-TEST 10MG 30TAB، BETA-TEST DROPS\)/);
assert.match(msg, /تحب نجهّزها لك؟$/);
assert.doesNotMatch(msg, /ج\b|جنيه|رصيد|فلوس/);
assert.equal(C.message('', ['X']).split('\n')[0], 'أهلًا بحضرتك 🌷', 'no usable name: no «يا»');
assert.equal(C.fmt(2), '2');
assert.equal(C.fmt(0.5), '0.5');
// «كل المعتادين» (2026-11-16): the file carries every regular item too; where each stands today; the customers in the order of their nearest next refill
const REG = { generated_at: '2026-11-16T01:00:00Z', rows: [], regular: [
  { c: 9001, i: 1001, n: 'ALPHA-TEST 10MG 30TAB', gap: 30, times: 6, q: 1, have: 2, last: '2026-10-07', since: 40 },   // 40 days since, gap 30 -> 10 days late
  { c: 9001, i: 1002, n: 'BETA-TEST DROPS', gap: 31, times: 5, q: 1, have: 0, last: '2026-10-20', since: 27 },        // 27 since -> due in 4 (soon)
  { c: 9002, i: 1003, n: 'GAMMA-TEST 5MG', gap: 28, times: 4, q: 2, have: 5, last: '2026-11-10', since: 6 },         // due in 22 (ok)
  { c: 9003, i: 1004, n: 'DELTA-TEST 20TAB', gap: 30, times: 4, q: 1, have: 1, last: '2026-10-27', since: 20 },     // due in 10 (ok)
  { n: 'no customer' }, null,
] };
const dr = C.parse(REG);
assert.equal(dr.regular.length, 4, 'a regular row with no customer is dropped');
assert.equal(dr.regular[0].since, 40);
assert.deepEqual(C.parse({ rows: [] }).regular, [], 'an old file with no regular list');
assert.deepEqual(C.parse({ rows: [], regular: 'x' }).regular, []);
// where one stands today (from the last refill's date, so it is right whenever the file was written)
assert.deepEqual(C.standing(dr.regular[0], NOW), { since: 40, due: -10, state: 'late' });
assert.deepEqual(C.standing(dr.regular[1], NOW), { since: 27, due: 4, state: 'soon' });
assert.deepEqual(C.standing(dr.regular[2], NOW), { since: 6, due: 22, state: 'ok' });
// the laptop's own rule for late: 1.15 gaps and at least 3 days past the gap: a 30-day item is late from day 34 (not 31), a 100-day one from day 115
assert.equal(C.standing({ gap: 30, last: '2026-10-12' }, NOW).state, 'late', '35 days: past 34.5');
assert.equal(C.standing({ gap: 30, last: '2026-10-13' }, NOW).state, 'soon', '34 days: past the gap but not late yet');
assert.equal(C.standing({ gap: 100, last: '2026-07-24' }, NOW).state, 'late', '115 days = 1.15 gaps');
assert.equal(C.standing({ gap: 100, last: '2026-07-25' }, NOW).state, 'soon', '114 days');
// customers: the one with the nearest next refill first (a late one is the nearest), its items the same way
const rg = C.regularGroups(dr.regular, NOW);
assert.deepEqual(rg.map((x) => [x.c, x.rows.map((r) => r.i)]), [[9001, [1001, 1002]], [9003, [1004]], [9002, [1003]]]);
assert.equal(rg[0].rows[0].state, 'late');
assert.deepEqual(C.regularGroups(null, NOW), []);
console.log('PASS: chronic: the file, days since, «خلصنا», the groups, the name and the message');
