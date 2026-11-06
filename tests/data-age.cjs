// «حسب داتا الساعة …» (ar/data-age.js): Cairo times, the three colours and their edges, the wording.
const assert = require('node:assert/strict'), A = require('../ar/data-age.js');
const H = 3600e3, M = 60e3;

// Cairo wall clock → instant: winter UTC+2, summer UTC+3 (Egypt keeps summer time)
assert.equal(A.cairoEpoch('2026-11-06 12:00:00'), Date.UTC(2026, 10, 6, 10, 0, 0));
assert.equal(A.cairoEpoch('2026-07-01 12:00:00'), Date.UTC(2026, 6, 1, 9, 0, 0));
assert.equal(A.cairoEpoch('2026-11-06T14:31:00.123456+00:00'), Date.UTC(2026, 10, 6, 14, 31, 0, 123));
assert.ok(Number.isNaN(A.cairoEpoch('')) && Number.isNaN(A.cairoEpoch(null)) && Number.isNaN(A.cairoEpoch('امبارح')));

const now = A.cairoEpoch('2026-11-06 16:50:00');
const row = (data_at, at = '2026-11-06T14:31:00+00:00') => ({ at, data_at });

// green: under 6 hours
let d = A.describe(row('2026-11-06 16:30:00'), now);
assert.equal(d.level, 'good');
assert.equal(d.text, 'داتا الصيدلية: النهارده 4:30 م');
assert.equal(d.ago, 'من 20 دقيقة');
assert.deepEqual(d.details, ['آخر مرة اللاب بعت: النهارده 4:31 م', 'النواقص محسوبة على نسخة الصيدلية: النهارده 4:30 م']);

// yellow: 6 to 12 hours
d = A.describe(row('2026-11-06 08:15:00'), now);
assert.equal(d.level, 'warn');
assert.equal(d.text, 'داتا الصيدلية: النهارده 8:15 ص');
assert.equal(d.ago, 'من 8 ساعات');

// red: over 12 hours (today: the share was unreachable from 01:15 to 14:40)
d = A.describe(row('2026-11-05 23:45:18'), now);
assert.equal(d.level, 'bad');
assert.equal(d.text, 'الداتا قديمة: آخر نسخة امبارح 11:45 م');
assert.equal(d.ago, 'من 17 ساعة');

// edges: exactly 6 hours is yellow, exactly 12 is red, just under each keeps the colour before
assert.equal(A.describe(row('2026-11-06 10:50:00'), now).level, 'warn');
assert.equal(A.describe(row('2026-11-06 10:50:01'), now).level, 'good');
assert.equal(A.describe(row('2026-11-06 04:50:00'), now).level, 'bad');
assert.equal(A.describe(row('2026-11-06 04:50:01'), now).level, 'warn');

// nothing sent yet, or an unreadable time
for (const r of [null, row(''), row('bad')]) {
  d = A.describe(r, now);
  assert.equal(d.level, 'none');
  assert.equal(d.text, 'لسه مفيش نواقص اتبعتت من اللاب');
  assert.equal(d.ago, '');
}
// no laptop time: only the data line
assert.deepEqual(A.describe({ data_at: '2026-11-06 16:30:00' }, now).details, ['النواقص محسوبة على نسخة الصيدلية: النهارده 4:30 م']);

// day words and 12-hour clock
assert.equal(A.when(A.cairoEpoch('2026-11-06 00:10:00'), now), 'النهارده 12:10 ص');
assert.equal(A.when(A.cairoEpoch('2026-11-06 12:05:00'), now), 'النهارده 12:05 م');
assert.equal(A.when(A.cairoEpoch('2026-11-03 09:05:00'), now), 'يوم 03-11 9:05 ص');
// «امبارح» follows the Cairo date, not the laptop's or phone's
assert.equal(A.when(A.cairoEpoch('2026-11-05 23:59:00'), A.cairoEpoch('2026-11-06 00:01:00')), 'امبارح 11:59 م');

// how long ago
const ago = [[0, 'دلوقتي'], [M, 'من دقيقة'], [2 * M, 'من دقيقتين'], [5 * M, 'من 5 دقايق'], [11 * M, 'من 11 دقيقة'],
  [H, 'من ساعة'], [2 * H, 'من ساعتين'], [3 * H, 'من 3 ساعات'], [11 * H, 'من 11 ساعة'], [47 * H, 'من 47 ساعة'],
  [48 * H, 'من يومين'], [72 * H, 'من 3 أيام'], [-5 * M, 'دلوقتي']];
for (const [ms, want] of ago) assert.equal(A.ago(ms), want, String(ms));

console.log('data-age ok');
