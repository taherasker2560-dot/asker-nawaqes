// «مفتوح دلوقتي» on the store (owner 2026-11-15): every day 9 am to midnight in winter and to 2 am in summer (Egypt's
// summer time), Friday 3 pm to 11 pm. Times are Cairo's, whatever the phone's own clock zone.
const assert = require('node:assert/strict');
global.window = global;
const S = require('../store/store.js');
require('../store/i18n-en-store.js');
require('../ar/i18n.js');
global.AskerI18n._use(global.AskerEN);
const at = (iso) => S.shopHours(new Date(iso));
// winter (Cairo = UTC+2): Thursday 3 Dec 2026
assert.deepEqual(at('2026-12-03T06:30Z'), { open: false, text: 'مقفول دلوقتي · بنفتح 9 الصبح' }, '8:30 am');
assert.deepEqual(at('2026-12-03T07:00Z'), { open: true, text: 'مفتوح دلوقتي · بنقفل 12 بالليل' }, '9 am sharp');
assert.deepEqual(at('2026-12-03T21:59Z'), { open: true, text: 'مفتوح دلوقتي · بنقفل 12 بالليل' }, '11:59 pm');
assert.deepEqual(at('2026-12-03T22:30Z'), { open: false, text: 'مقفول دلوقتي · بنفتح 3 العصر' }, 'after midnight, Friday comes');
// Friday 4 Dec: 3 pm to 11 pm; after it, Saturday at 9
assert.equal(at('2026-12-04T12:00Z').open, false);
assert.deepEqual(at('2026-12-04T13:00Z'), { open: true, text: 'مفتوح دلوقتي · بنقفل 11 بالليل' });
assert.deepEqual(at('2026-12-04T21:00Z'), { open: false, text: 'مقفول دلوقتي · بنفتح بكرة 9 الصبح' }, '11 pm Friday');
// summer (Cairo = UTC+3): Wednesday 1 Jul 2026 closes at 2 am, still open at 1:30 am Thursday
assert.deepEqual(at('2026-07-01T20:00Z'), { open: true, text: 'مفتوح دلوقتي · بنقفل 2 بالليل' });
assert.deepEqual(at('2026-07-01T22:30Z'), { open: true, text: 'مفتوح دلوقتي · بنقفل 2 بالليل' }, '1:30 am, the night before');
assert.deepEqual(at('2026-07-01T23:10Z'), { open: false, text: 'مقفول دلوقتي · بنفتح 9 الصبح' }, '2:10 am');
// Thursday night in summer runs into Friday until 2 am, then Friday opens at 3 pm
assert.equal(at('2026-07-02T22:30Z').open, true);
assert.deepEqual(at('2026-07-02T23:30Z'), { open: false, text: 'مقفول دلوقتي · بنفتح 3 العصر' });
// the owner closed the site from the bot: closed whatever the time
assert.deepEqual(S.shopHours(new Date('2026-12-03T10:00Z'), true), { open: false, text: 'مقفول دلوقتي' });
// every text it can show has its English
const texts = ['مقفول دلوقتي', ...['11 بالليل', '12 بالليل', '2 بالليل'].map((t) => 'مفتوح دلوقتي · بنقفل ' + t),
  ...['9 الصبح', '3 العصر'].flatMap((t) => ['مقفول دلوقتي · بنفتح ' + t, 'مقفول دلوقتي · بنفتح بكرة ' + t])];
for (const t of texts) assert.doesNotMatch(global.AskerI18n.translate(t), /[؀-ۿ]/, t);
console.log('store-hours ok');
