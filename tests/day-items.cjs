// «الأصناف يوم بيوم» (owner 2026-11-28): the pure part of ar/day-items.js: reading the laptop's files, who counted as waiting when an item came, which empty-shelf arrivals are shown with their reasons,
// the counts of the days, a stock in boxes and loose units, and the English. Made-up items only: the repository is public.
const assert = require('node:assert/strict');
global.window = global;
const P = require('../ar/day-items.js');
require('../ar/i18n-en.js'); require('../ar/i18n.js'); const I = global.AskerI18n; I._use(global.AskerEN);

const index = P.parseIndex({ today: '2026-11-28', data_at: '2026-11-28 10:05:00', days: {
  '2026-11-27': { r: 6, nw: 4, z: 1, zo: [501, 502], ok: { r: true, g: true, q: false } }, '2026-11-28': { r: 0, nw: 0, z: 0, zo: [], ok: { r: true, g: true, q: true } }, nonsense: {} } });
assert.deepEqual(index.dates, ['2026-11-28', '2026-11-27']);
assert.equal(index.days['2026-11-27'].n, 4);
assert.equal(P.parseIndex({}), null); assert.equal(P.parseIndex(null), null); assert.equal(P.parseIndex({ days: {} }), null);

const day = P.parseDay({ date: '2026-11-27', ok: { r: true, g: true, q: false }, r: [{ i: 7, n: 'EXAMPLE TAB', q: 0.5, v: 29, t: '21:43', tk: 5 }], nw: { i: 9, n: 'EXAMPLE NEW', s: 'مورد مثال', q: 2, pr: 62 },
  z: [{ i: 502, n: 'WAITED FOR', q: 1, at: '18:00', why: [] }, { i: 501, n: 'PLAIN', q: 1, at: '17:00', why: [] }, { i: 500, n: 'FROM GENERAL', q: 2, at: '19:00', why: ['g', 'zzz'] }, { i: 503, n: 'MANY SLOW', q: 6, at: '09:00', why: ['b'], m: 0.7 }] });
assert.equal(day.n.length, 1, 'one new item written as an object (PowerShell does that to a list of one) is still a list');
// waiting: asked before it arrived, and not closed before that day; a cancelled request never counts
const w = (item_id, created_at, status, closed_at) => ({ item_id, created_at, status, closed_at: closed_at || null });
assert.equal(P.waitedFor([w(502, '2026-11-25T10:00:00', 'waiting')], 502, '2026-11-27', '18:00'), true);
assert.equal(P.waitedFor([w(502, '2026-11-27T20:00:00', 'waiting')], 502, '2026-11-27', '18:00'), false, 'asked after it came');
assert.equal(P.waitedFor([w(502, '2026-11-20T10:00:00', 'delivered', '2026-11-22T10:00:00')], 502, '2026-11-27', '18:00'), false, 'closed before that day');
assert.equal(P.waitedFor([w(502, '2026-11-20T10:00:00', 'delivered', '2026-11-27T21:00:00')], 502, '2026-11-27', '18:00'), true, 'handed over that evening');
assert.equal(P.waitedFor([w(502, '2026-11-25T10:00:00', 'cancelled')], 502, '2026-11-27', '18:00'), false);
const wait = [w(502, '2026-11-25T10:00:00', 'arrived')];
assert.deepEqual(P.zeroShown(day, wait).map((e) => e.n + ' ' + e.why.join('')), ['MANY SLOW b', 'WAITED FOR w', 'FROM GENERAL g'], 'only those with a reason, by arrival; an unknown reason is dropped');
assert.deepEqual(P.zeroShown(day, []).map((e) => e.i), [503, 500]);
assert.deepEqual(P.linesOf(day, 'r', []).map((e) => e.n), ['EXAMPLE TAB']);
assert.equal(P.countOf(index, '2026-11-27', 'z', wait), 2); assert.equal(P.countOf(index, '2026-11-27', 'z', []), 1); assert.equal(P.countOf(index, '2026-11-27', 'r', []), 6);
assert.equal(P.countOf(index, '2026-01-01', 'n', []), 0);
// a stock in boxes and loose units
assert.equal(P.boxes(20, 1), '20 علبة'); assert.equal(P.boxes(3, 3), '3 علب'); assert.equal(P.boxes(3.6667, 3), '3 علب + 2 وحدة'); assert.equal(P.boxes(0.5, 1), '½ علبة'); assert.equal(P.boxes(0.9999, 2), '1 علبة');
const stock = P.parseStock({ data_at: '2026-11-28 10:05:00', s: { 7: [0, 2] } });
assert.deepEqual(P.stockOf(stock, 7), { q: 0, parts: 2 }); assert.equal(P.stockOf(stock, 8), null); assert.equal(P.stockOf(stock, null), null);
// the English
for (const s of P.WORDS) assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, 'Arabic left in English: ' + s + ' → ' + I.translate(s));
console.log('PASS: items by day: the files, the waiting list, the empty-shelf reasons, the counts, boxes and units, the English');
