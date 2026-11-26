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
assert.equal(L.answerText(N[0], { v: 'ok' }), 'تمام ✓');
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
// the public price of a cosmetics line (owner 2026-11-21, compact page): only the lines whose cost moved (or new items) are asked; each waits for his answer: his price, or the card's kept with Enter (saved as the card's price); the card follows only when it differs
assert.equal(L.parseNum('39.5'), 39.5);assert.equal(L.parseNum('٣٩٫٥'), 39.5);assert.equal(L.parseNum('1,5'), 1.5);assert.equal(L.parseNum(' 70 ج'), 70);assert.ok(Number.isNaN(L.parseNum('abc')));assert.ok(Number.isNaN(L.parseNum(null)));
assert.equal(L.validPrice(20, 27.25), false, 'below the cost: the discount would be negative');assert.equal(L.validPrice(27.25, 27.25), true, 'equal to the cost: no discount');assert.equal(L.validPrice(39.5, 27.25), true);assert.equal(L.validPrice(300, 27.25), false, 'ten times the cost is a typo');assert.equal(L.validPrice(0, 5), false);
assert.equal(L.discFor(39.5, 27.25), 31.0127);assert.equal(L.discFor(95, 77.5), 18.4211);assert.equal(L.discFor(15, 13.333333), 11.1111);assert.equal(L.discFor(45.5, 45.5), 0);
const AL = (n, net, total, x) => ({ n, paper: 'سطر ' + n, qty: 1, net, ask: 'price', card: 40, prev: 35, cosm: true, exp: '', id: 7, name: 'X', total, ...x });
const withCard = row({ lines: [line(1, 60), AL(2, 40, 40)], total: 100 });
assert.deepEqual(L.askLines(withCard).map((l) => l.n), [2]);assert.equal(L.compact(withCard), true, 'a cosmetics invoice is drawn compact');assert.equal(L.compact(row({ lines: [line(1, 60)] })), false, 'a drug invoice keeps its rows');
assert.equal(L.priceOf(withCard, withCard.lines[1]), null, 'he typed nothing yet');assert.equal(L.effPrice(withCard, withCard.lines[1]), 40, 'the card\'s price is what would stay');assert.equal(L.changedPrice(withCard, withCard.lines[1]), null);
assert.deepEqual(L.openPrices(withCard).map((l) => l.n), [2], 'an asked line waits for his answer, even with a card price');assert.equal(L.needs(withCard), 1);assert.equal(L.canApprove(withCard), false);assert.deepEqual(L.chip(withCard), { t: 'N_NOTES', n: 1, kind: 'warn' });
assert.equal(L.discOf(withCard, withCard.lines[0]), 25, 'a normal line keeps its own discount');assert.equal(L.discOf(withCard, withCard.lines[1]), 0, 'an asked line: from the price it would have (cost 40 on a card of 40)');
const kept = { ...withCard, answers: { L2: { v: 'price', t: '40' } } };
assert.deepEqual(L.openPrices(kept), [], 'Enter on the empty box saved the card\'s price');assert.equal(L.changedPrice(kept, kept.lines[1]), null, 'the card\'s own price changes nothing');assert.equal(L.canApprove(kept), true);assert.equal(L.chip(kept).t, 'جاهزة ✓');
const typed = { ...withCard, answers: { L2: { v: 'price', t: '55' } } };
assert.equal(L.priceOf(typed, typed.lines[1]), 55);assert.equal(L.effPrice(typed, typed.lines[1]), 55);assert.equal(L.changedPrice(typed, typed.lines[1]), 55, 'he changed it: the card has to follow');assert.equal(L.discOf(typed, typed.lines[1]), 27.2727);
assert.equal(L.priceOf({ ...withCard, answers: { L2: { v: 'price', t: 'x' } } }, withCard.lines[1]), null, 'a broken answer counts as none');
assert.equal(L.priceOf({ ...withCard, answers: { L2: { v: 'ok' } } }, withCard.lines[1]), null);
const fresh = row({ lines: [line(1, 60), AL(2, 40, 40, { card: null, id: 0, prev: null })], total: 100 });
assert.deepEqual(L.openPrices(fresh).map((l) => l.n), [2], 'a new item waits for his price');assert.equal(L.discOf(fresh, fresh.lines[1]), null, 'no discount until the price is known');assert.equal(L.effPrice(fresh, fresh.lines[1]), null);
const fresh2 = { ...fresh, answers: { L2: { v: 'price', t: '90' } } };
assert.equal(L.effPrice(fresh2, fresh2.lines[1]), 90);assert.equal(L.changedPrice(fresh2, fresh2.lines[1]), 90, 'a new item\'s price is set from his answer');assert.equal(L.needs(fresh2), 0);assert.equal(L.canApprove(fresh2), true);
assert.equal(L.needs(row({ notes: N, lines: [AL(2, 40, 100, { card: null })], total: 100 })), 3, 'two notes and a price');
const low = row({ lines: [AL(1, 40, 40, { card: 30 })], total: 40 });assert.equal(L.effPrice(low, low.lines[0]), null, 'a card price below the cost is no price to keep');
// rejecting a line for its expiry: it goes back, so its price is not needed any more
const rej = { ...withCard, answers: { R2: { v: 'reject' } } };
assert.equal(L.rejected(rej, rej.lines[1]), true);assert.equal(L.rejected(withCard, withCard.lines[1]), false);assert.deepEqual(L.openPrices(rej), [], 'a rejected line asks nothing');assert.equal(L.canApprove(rej), true);
// the expiry's months (the short-dated rule: under 18 short, under 6 very short)
const NOW = new Date(2026, 10, 21);
assert.equal(L.expMonths('112026', NOW), 0);assert.equal(L.expMonths('052027', NOW), 6);assert.equal(L.expMonths('052028', NOW), 18);assert.equal(L.expMonths('', NOW), null);assert.equal(L.expMonths('08/2029', NOW), null, 'only the MMYYYY the sheet carries');
assert.equal(L.expKind('042027', NOW), 'bad');assert.equal(L.expKind('052027', NOW), 'near');assert.equal(L.expKind('042028', NOW), 'near');assert.equal(L.expKind('052028', NOW), '');assert.equal(L.expKind('', NOW), '');
assert.deepEqual(L.cleanReady([withCard, fresh]).map((r) => r.id), [], 'a price not answered yet: not «clean»');
assert.deepEqual(L.cleanReady([kept, fresh2]).map((r) => r.id), [kept.id, fresh2.id], 'with every price answered (no notes, the lines add up) it is clean');
// the purchase robot's stops (owner 2026-11-25): only «card:<id>:<stop|check|needs_helper>» open reports count; the ones that stopped come first, then waiting for the check, then the helper's
const stop = (id, ref, o) => ({ id, ref_id: ref, job: 'purchases', title: 'مورد مثال 9001', details: 'وقف عند سطر 3', status: 'open', created_at: '2026-11-25T10:0' + id + ':00Z', ...o });
assert.deepEqual(L.buyRef({ ref_id: 'card:35:stop' }), { card: '35', kind: 'stop' });
assert.deepEqual(L.buyRef({ ref_id: 'card:7:needs_helper' }), { card: '7', kind: 'needs_helper' });
assert.equal(L.buyRef({ ref_id: 'x1' }), null, 'a sales robot question is not a stop');
assert.equal(L.buyRef({ ref_id: 'card:35:other' }), null);
assert.equal(L.buyRef(null), null);
const list = [stop(1, 'card:1:needs_helper', { job: 'purchases_wait' }), stop(2, 'card:2:check'), stop(3, 'card:3:stop'), stop(4, 'x9'), stop(5, 'card:5:stop', { status: 'done' }), stop(6, 'card:6:stop')];
assert.deepEqual(L.buyStops(list).map((s) => s.id), [3, 6, 2, 1], 'stopped, then waiting for the check, then the helper\'s; done and foreign ones left out; oldest first inside each');
assert.deepEqual(L.buyStops(null), []);
assert.equal(L.buyOf(list, { id: 2 }).id, 2);
assert.equal(L.buyOf(list, { id: 5 }), null, 'a done stop is not shown');
assert.equal(L.buyOf(list, { id: 99 }), null);
assert.ok(L.BUY_HEAD.stop && L.BUY_HEAD.check && L.BUY_HEAD.needs_helper && L.BUY_CHIP.stop && L.BUY_CHIP.check && L.BUY_CHIP.needs_helper);
// 2026-11-26: the stop cards can be answered. An ANSWERED stop still shows (the laptop is carrying it out); «off» is its own card, last
assert.deepEqual(L.buyRef({ ref_id: 'robot:off' }), { card: '', kind: 'off' });
assert.deepEqual(L.buyStops([stop(8, 'robot:off', { job: 'purchases_wait' }), stop(9, 'card:9:stop', { status: 'answered' }), stop(10, 'card:10:needs_helper')]).map((s) => s.id), [9, 10, 8]);
assert.ok(L.BUY_HEAD.off);
// the laptop's lines: why, who has it, nothing saved, the picture of PharmaFly's screen
assert.deepEqual(L.stopParts({ details: 'وقف عند التاريخ\nالمساعد: مش شغال من 10:41 ص\nSAFE:1\nSHOT:robot/stop_40_20261126132900.json' }), { why: 'وقف عند التاريخ', who: 'المساعد: مش شغال من 10:41 ص', safe: true, shot: 'robot/stop_40_20261126132900.json' });
assert.deepEqual(L.stopParts({ details: 'السطر 7\nمحادثة الفواتير ماسكاها ✓' }), { why: 'السطر 7', who: 'محادثة الفواتير ماسكاها ✓', safe: false, shot: '' }, 'an old card (no machine lines) reads as before');
assert.equal(L.stopParts({ details: 'x\nSHOT:../secret/file.jpg' }).shot, '', 'only a picture in robot/ is ever asked for');
assert.equal(L.stopParts({ details: 'x\nSHOT:robot/a/b.jpg' }).shot, '');
assert.deepEqual(L.stopParts(null), { why: '', who: '', safe: false, shot: '' });
// the buttons: only well formed ones, at most six; every key the laptop sends has its words under it and its words once tapped
assert.deepEqual(L.stopOptions({ options: [{ key: 'retry', label: 'a' }, { key: '', label: 'b' }, { label: 'c' }, null] }), [{ key: 'retry', label: 'a' }]);
assert.equal(L.stopOptions({ options: 'x' }).length, 0);
for (const k of ['retry', 'manual', 'helper', 'off', 'on']) { assert.ok(L.OPT_HELP[k], 'help ' + k); assert.ok(L.ANSWER_HEAD[k] && L.ANSWER_NEXT[k], 'answered ' + k); }
assert.equal(L.answerKind({ status: 'open', answer_key: 'retry' }), '');
assert.equal(L.answerKind({ status: 'answered', answer_key: 'manual' }), 'manual');
assert.equal(L.answerKind({ status: 'answered', answer_key: null, answer_text: 'سيبها' }), 'text', 'his own words with no button');
// the English of every new fixed line
{ global.window = global; require('../ar/i18n-en.js'); require('../ar/i18n.js'); const I = global.AskerI18n; I._use(global.AskerEN);
  for (const s of [...Object.values(L.OPT_HELP), ...Object.values(L.ANSWER_HEAD), ...Object.values(L.ANSWER_NEXT), L.BUY_HEAD.off, 'رديت على الروبوت', 'رديت:', '✓ ما اتحفظش حاجة في فارمافلاي', 'شاشة فارمافلاي وقت الوقفة (دوسة تكبّرها)', 'أو اكتب له تعمل إيه…', 'اتبعت للروبوت ✓']) assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, 'Arabic left in English: ' + s + ' → ' + I.translate(s)); }
// «صور الأصناف» (2026-11-27): each item once; no new item (it has its own box photo), no rejected line; the internet ones only once «تمام» can be kept
const pr = { lines: [{ n: 1, id: 101, name: 'A' }, { n: 2, id: 102, name: 'B' }, { n: 3, id: 103, name: 'C' }, { n: 4, name: 'NEW' }, { n: 5, id: 101, name: 'A' }, { n: 6, id: 105, name: 'E' }], answers: { R6: { v: 'reject' } } };
const stOf = (id) => ({ 101: 'none', 102: 'net', 103: 'ok', 105: 'none' })[id] || null;
assert.deepEqual(require('../ar/invoice-review.js').picNeeds(pr, stOf, true), { none: [{ id: 101, name: 'A' }], net: [{ id: 102, name: 'B' }], n: 2 });
assert.deepEqual(require('../ar/invoice-review.js').picNeeds(pr, stOf, false).net, [], 'before the server change only the items with no photo are asked');
assert.equal(require('../ar/invoice-review.js').picNeeds(pr, () => null, true).n, 0, 'nothing is asked before the photos are read');
console.log('PASS: invoice review helpers');
