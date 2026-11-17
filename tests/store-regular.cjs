// «اللي باخده دايمًا» + «أدويتي المزمنة» on the customer's page (owner 2026-11-17; store/regular.js): the rules that decide what a customer reads.
// Late / soon / on time is the owner's own rule (ar/chronic.js: late = 1.15 gaps and at least 3 days more than the gap; soon = due within 5 days).
const assert = require('node:assert/strict');
const R = require('../store/regular.js');
const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const NOW = new Date(2026, 10, 17, 15, 30);                       // 17 Nov 2026, afternoon
const ago = (n) => day(new Date(2026, 10, 17 - n));
const row = (o) => ({ i: 1, n: 'ITEM A 10 TAB', ar: '', gap: 30, times: 4, q: 1, last: ago(10), avail: true, ...o });

// the rows must look like what the server sends
assert.deepEqual(R.parseRows(null), []);
assert.deepEqual(R.parseRows([{ i: 5, n: ' X ', gap: 30, times: 4, q: '1', last: '2026-11-01T00:00:00', avail: true, ar: ' س ' }, { i: 6, n: '', gap: 30, last: '2026-11-01' }, { i: 7, n: 'Y', gap: 0, last: '2026-11-01' }, { i: 8, n: 'Z', gap: 30, last: 'bad' }, null]),
  [{ i: 5, n: 'X', ar: 'س', gap: 30, times: 4, q: 1, last: '2026-11-01', avail: true }]);

// the real examples (the owner's data): gap 33 and 46 days since = late, 13 days over
let s = R.standing(row({ gap: 33, last: ago(46) }), NOW);
assert.deepEqual([s.since, s.due, s.state], [46, -13, 'late']);
s = R.standing(row({ gap: 38, last: ago(36) }), NOW);
assert.deepEqual([s.since, s.due, s.state], [36, 2, 'soon']);                 // 2 days left: soon
s = R.standing(row({ gap: 43, last: ago(34) }), NOW);
assert.deepEqual([s.since, s.due, s.state], [34, 9, 'ok']);
// the edges of the owner's rule: gap 20 → late from 23 days (gap + 3), 22 is still «soon» and past its date
assert.equal(R.standing(row({ gap: 20, last: ago(23) }), NOW).state, 'late');
assert.equal(R.standing(row({ gap: 20, last: ago(22) }), NOW).state, 'soon');
assert.equal(R.standing(row({ gap: 20, last: ago(22) }), NOW).due, -2);
// a long gap: 1.15 × 60 = 69 → 68 is not late yet, 69 is
assert.equal(R.standing(row({ gap: 60, last: ago(68) }), NOW).state, 'soon');
assert.equal(R.standing(row({ gap: 60, last: ago(69) }), NOW).state, 'late');
// soon = due in 5 days or less; 6 days is on time
assert.equal(R.standing(row({ gap: 40, last: ago(35) }), NOW).state, 'soon');
assert.equal(R.standing(row({ gap: 40, last: ago(34) }), NOW).state, 'ok');
// a refill today is 0 days; the clock does not matter
assert.equal(R.standing(row({ gap: 30, last: ago(0) }), NOW).since, 0);
assert.equal(R.standing(row({ gap: 30, last: ago(0) }), new Date(2026, 10, 17, 23, 59)).since, 0);

// a refill his own statement shows AFTER the file's date counts at once (no «your medicine is late» the day after he bought it)
const late = row({ n: 'OMEZ 40 20 CAP', gap: 30, last: ago(45) });
assert.equal(R.standing(late, NOW).state, 'late');
const moves = [{ id: 1, kind: 'sale', at: ago(0) + 'T11:00:00', items: [{ n: 'OMEZ 40 20 CAP', p: 1 }] }, { id: 2, kind: 'payment', at: ago(0) + 'T12:00:00', items: null }];
assert.equal(R.lastOf(late, moves), ago(0));
assert.deepEqual([R.standing(late, NOW, moves).since, R.standing(late, NOW, moves).state], [0, 'ok']);
// another item, a return, an older sale, or a payment do not move it
assert.equal(R.lastOf(late, [{ kind: 'sale', at: ago(0) + 'T11:00:00', items: [{ n: 'OTHER' }] }]), ago(45));
assert.equal(R.lastOf(late, [{ kind: 'return', at: ago(0) + 'T11:00:00', items: [{ n: 'OMEZ 40 20 CAP' }] }]), ago(45));
assert.equal(R.lastOf(late, [{ kind: 'sale', at: ago(60) + 'T11:00:00', items: [{ n: 'OMEZ 40 20 CAP' }] }]), ago(45));
assert.equal(R.lastOf(late, null), ago(45));

// the groups: the late ones first, the most overdue first; then soon, then on time
const rows = [row({ i: 1, n: 'D', gap: 43, last: ago(34) }), row({ i: 2, n: 'A', gap: 33, last: ago(46) }), row({ i: 3, n: 'C', gap: 38, last: ago(36) }), row({ i: 4, n: 'B', gap: 28, last: ago(36) }), row({ i: 5, n: 'E', gap: 20, last: ago(9) })];
const g = R.groups(rows, NOW, []);
assert.deepEqual(g.all.map((r) => r.n), ['A', 'B', 'C', 'D', 'E']);
assert.deepEqual(g.late.map((r) => r.n), ['A', 'B']);
assert.deepEqual(g.soon.map((r) => r.n), ['C']);
assert.deepEqual(g.ok.map((r) => r.n), ['D', 'E']);
assert.deepEqual(R.groups([], NOW, []).all, []);

// the words a customer reads (Egyptian, the right plural: يوم واحد / يومين / 3-10 أيام / 11+ يوم)
assert.deepEqual([1, 2, 3, 8, 10, 11, 13, 30].map(R.daysText), ['يوم واحد', 'يومين', '3 أيام', '8 أيام', '10 أيام', '11 يوم', '13 يوم', '30 يوم']);
const due = (r) => R.dueText({ ...row(r.o), ...R.standing(row(r.o), NOW) }).text;
assert.equal(due({ o: { gap: 33, last: ago(46) } }), 'ميعاده عدّى من 13 يوم');
assert.equal(due({ o: { gap: 28, last: ago(36) } }), 'ميعاده عدّى من 8 أيام');
assert.equal(due({ o: { gap: 33, last: ago(34) } }), 'ميعاده دلوقتي');          // a day past its date but not «late» yet (37.95 days)
assert.equal(due({ o: { gap: 33, last: ago(32) } }), 'باقي يوم واحد');
assert.equal(due({ o: { gap: 38, last: ago(36) } }), 'باقي يومين');
assert.equal(due({ o: { gap: 38, last: ago(35) } }), 'باقي 3 أيام');
assert.equal(due({ o: { gap: 40, last: ago(35) } }), 'باقي 5 أيام');
assert.equal(due({ o: { gap: 20, last: ago(22) } }), 'ميعاده دلوقتي');
assert.equal(due({ o: { gap: 43, last: ago(34) } }), 'الجاي بعد 9 أيام');
assert.equal(due({ o: { gap: 30, last: ago(10) } }), 'الجاي بعد 20 يوم');
assert.equal(R.dueText({ state: 'soon', due: 1 }).text, 'باقي يوم واحد');
assert.equal(R.dueText({ state: 'soon', due: 0 }).text, 'ميعاده دلوقتي');
assert.equal(R.dueText({ state: 'late', due: -1 }).cls, 'late');
assert.deepEqual([0, 1, 2, 5, 36].map(R.sinceText), ['آخر مرة النهارده', 'آخر مرة امبارح', 'آخر مرة من يومين', 'آخر مرة من 5 أيام', 'آخر مرة من 36 يوم']);
assert.deepEqual([0.3, 0.9, 0.95, 1, 2, 2.5].map(R.tookText), ['أخدت أقل من علبة', 'أخدت أقل من علبة', 'أخدت 1 علبة', 'أخدت 1 علبة', 'أخدت 2 علبة', 'أخدت 2.5 علبة']);
assert.deepEqual([1, 2, 3, 10, 11, 25].map(R.usualSub), ['صنف واحد على حسابي', 'صنفين على حسابي', '3 أصناف على حسابي', '10 أصناف على حسابي', '11 صنف على حسابي', '25 صنف على حسابي']);
assert.deepEqual([0, 1, 2, 3, 12].map(R.dueSub), ['كله في معاده', 'ميعاد واحد عدّى', 'ميعادين عدّوا', '3 ميعادهم عدّى', '12 ميعادهم عدّى']);

// a list the laptop stopped sending is not trusted (72 hours)
assert.equal(R.isStale('2026-11-17T12:00:00Z', new Date('2026-11-18T12:00:00Z')), false);
assert.equal(R.isStale('2026-11-14T11:00:00Z', new Date('2026-11-17T12:00:00Z')), true);
assert.equal(R.isStale(null, NOW), true);
assert.equal(R.isStale('not a date', NOW), true);

// nothing of the pharmacy's own: no stock numbers and no «رسالة» / «خلصنا» in what he reads
const text = Object.values(R.TEXTS).join(' ');
assert.doesNotMatch(text, /عندك \d|خلص من عندك|رسالة|خلصنا/);
console.log('PASS: customer regular items: the owner\'s late/soon rule, a refill on his own statement counts, the right Egyptian plurals, a stale list is hidden');
