// «⏰ منبه الدوا» on the customer's page (owner 2026-11-17; store/alarm.js): the rules that decide when it rings and what the phone says.
const assert = require('node:assert/strict');
const A = require('../store/alarm.js');
const at = (h, m, day = 17) => new Date(2026, 10, day, h, m, 30);
const item = (o) => ({ id: 'a1', name: 'زانبرازان ٢٠ قرص', say: '', times: ['08:00', '20:00'], on: true, ...o });
const data = (items, snoozes = []) => ({ v: 1, speak: true, items, snoozes });

// times: valid, sorted, no duplicates; read the way people read the clock
assert.equal(A.minutesOf('08:00'), 480);assert.equal(A.minutesOf('8:05'), 485);assert.equal(A.minutesOf('23:59'), 1439);
for (const bad of ['24:00', '12:60', '', null, 'abc', '8']) assert.equal(A.minutesOf(bad), null, String(bad));
assert.deepEqual(A.normTimes(['20:00', '08:00', '8:00', 'x', '08:00']), ['08:00', '20:00']);
assert.deepEqual(A.normTimes(null), []);
assert.deepEqual(['00:00', '00:30', '08:00', '12:00', '12:30', '13:15', '20:00', '23:59'].map(A.timeText), ['12:00 ص', '12:30 ص', '8:00 ص', '12:00 م', '12:30 م', '1:15 م', '8:00 م', '11:59 م']);
assert.equal(A.hhmmOf(485), '08:05');

// what is kept must look like what we wrote
let c = A.clean(null);assert.deepEqual(c, { v: 1, speak: true, items: [], snoozes: [] });
c = A.clean({ speak: false, items: [{ id: 'x', name: ' دوا ', times: ['20:00', '08:00', 'bad'], on: false }, { id: 'y', name: '', times: ['08:00'] }, { id: 'z', name: 'بدون ميعاد', times: [] }, { name: 'من غير id', times: ['08:00'] }, null], snoozes: [{ id: 'x', at: 5 }, { id: 'q', at: 'no' }] });
assert.equal(c.speak, false);assert.deepEqual(c.items, [{ id: 'x', name: 'دوا', say: '', times: ['08:00', '20:00'], on: false }]);assert.deepEqual(c.snoozes, [{ id: 'x', at: 5, time: '' }]);
assert.equal(A.clean({ items: Array.from({ length: 100 }, (_, i) => ({ id: 'i' + i, name: 'n' + i, times: ['08:00'] })) }).items.length, 40, 'at most 40 alarms');

// when it rings: from the time up to 10 minutes after, once; never before; never for an alarm that is off
const d1 = data([item()]);
assert.deepEqual(A.dueNow(d1, at(7, 59), {}), [], 'before the time: nothing');
let due = A.dueNow(d1, at(8, 0), {});
assert.equal(due.length, 1);assert.equal(due[0].time, '08:00');assert.equal(due[0].key, '2026-11-17|a1|08:00');assert.equal(due[0].name, 'زانبرازان ٢٠ قرص');
assert.equal(A.dueNow(d1, at(8, 10), {}).length, 1, 'still rings 10 minutes late (the page was closed)');
assert.equal(A.dueNow(d1, at(8, 11), {}).length, 0, 'after that it is missed');
assert.equal(A.dueNow(d1, at(20, 3), {}).length, 1, 'the second time of the day');
assert.deepEqual(A.dueNow(d1, at(8, 2), { '2026-11-17|a1|08:00': 1 }), [], 'rung already: never twice');
assert.equal(A.dueNow(d1, at(8, 2, 18), { '2026-11-17|a1|08:00': 1 }).length, 1, 'the next day is a new day: it rings again');
assert.equal(A.dueNow(data([item({ on: false })]), at(8, 0), {}).length, 0, 'off: never');
// midnight edge: a time at 23:58 does not ring at 00:05 of the next day (the 10 minutes do not cross the day)
assert.equal(A.dueNow(data([item({ times: ['23:58'] })]), at(0, 5, 18), {}).length, 0);
// two alarms at the same time ring together
due = A.dueNow(data([item(), item({ id: 'a2', name: 'ايزابريل كو ٧٢ قرص', times: ['08:00'] })]), at(8, 1), {});
assert.deepEqual(due.map((x) => x.id), ['a1', 'a2']);

// «ذكّرني بعد 10 دقايق»: a snooze rings when its time comes, once
const at8 = at(8, 0).getTime();
const ds = data([item({ times: ['06:00'] })], [{ id: 'a1', at: at8 + 600000, time: '06:00' }]);
assert.equal(A.dueNow(ds, new Date(at8 + 599000), {}).length, 0);
due = A.dueNow(ds, new Date(at8 + 600000), {});assert.equal(due.length, 1);assert.ok(due[0].snooze);
assert.equal(A.dueNow(ds, new Date(at8 + 700000), { [due[0].key]: 1 }).length, 0, 'a snooze rings once');
assert.equal(A.dueNow(data([item({ on: false, times: ['06:00'] })], ds.snoozes), new Date(at8 + 600000), {}).length, 0, 'a snooze of an alarm that is off does not ring');

// what the phone says: the medicine's own name (Arabic when there is one), one sentence for several
assert.equal(A.sayText('زانبرازان ٢٠ قرص'), 'ميعاد دواء زانبرازان ٢٠ قرص');
assert.equal(A.sayDue([{ say: 'أ' }]), 'ميعاد دواء أ');
assert.equal(A.sayDue([{ say: 'أ' }, { say: 'ب' }, { say: 'ج' }]), 'ميعاد دواء أ، وب، وج');
assert.equal(A.dueNow(data([item({ say: 'اسم للنطق' })]), at(8, 0), {})[0].say, 'اسم للنطق');
assert.equal(A.dueNow(data([item()]), at(8, 0), {})[0].say, 'زانبرازان ٢٠ قرص', 'no special name: the name itself');

// the server reads Cairo's clock: a phone in another zone is converted (winter UTC+2, summer UTC+3), a phone in Cairo is left as it is
const winter = new Date('2026-11-17T12:00:00Z'), summer = new Date('2026-07-17T12:00:00Z');
assert.equal(A.cairoTime('08:00', winter, 'Africa/Cairo'), '08:00');
assert.equal(A.cairoTime('08:00', winter, 'UTC'), '10:00', 'a phone on UTC in winter: Cairo is 2 hours ahead');
assert.equal(A.cairoTime('08:00', summer, 'UTC'), '11:00', 'in summer Cairo is 3 hours ahead of UTC');
assert.equal(A.cairoTime('23:30', winter, 'UTC'), '01:30', 'past midnight');
assert.equal(A.cairoTime('08:00', winter, 'Asia/Riyadh'), '07:00', 'Riyadh is 1 hour ahead of Cairo in winter');
assert.equal(A.cairoTime('20:00', winter, 'America/New_York'), '03:00', 'New York evening = Cairo small hours (UTC-5 in November)');
assert.equal(A.cairoTime('bad', winter, 'UTC'), null);// the tile's words
assert.deepEqual([1, 2, 3, 10, 11].map(A.countText), ['منبه واحد شغال', 'منبهين شغالين', '3 منبهات شغالة', '10 منبهات شغالة', '11 منبه شغال']);
assert.equal(A.onCount(data([item(), item({ id: 'b', on: false })])), 1);
// the presets are the ones in the picture
assert.deepEqual(A.PRESETS, { once: ['08:00'], twice: ['08:00', '20:00'], thrice: ['08:00', '14:00', '20:00'], eight: ['06:00', '14:00', '22:00'] });
assert.ok(A.newId() !== A.newId());
// what leaves the phone: no fetch / XHR / beacon at all; the ONLY server call is ar_dose_save(push address, clock times) when he turned the notifications on, and its arguments carry no name
const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'store', 'alarm.js'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//, '').replace(/\/\/.*$/gm, '');
assert.doesNotMatch(code, /\bfetch\(|XMLHttpRequest|sendBeacon/, 'no network call but the one rpc');
assert.deepEqual([...code.matchAll(/\.rpc\('([a-z_]+)'/g)].map((m) => m[1]), ['ar_dose_save'], 'the only server call');
assert.match(code, /client\.rpc\('ar_dose_save', \{ p_endpoint: sub\.endpoint, p_times: times \}\)/, 'its arguments: the address and the clock times, nothing else');
assert.match(code, /const serverTimes = \(\) => normTimes\(\[\]\.concat\(\.\.\.data\.items\.filter\(\(x\) => x\.on\)\.map\(\(x\) => x\.times\)\)/, 'the times come from the alarms\' times only, never their names');
console.log('PASS: dose alarm: rings from the time to 10 minutes after, once; snooze; off never rings; the phone says the medicine\'s name; only clock times can leave the phone');