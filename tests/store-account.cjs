// «حسابي» on the store site (owner 2026-11-13, IDEAS row 1): the customer's own account from his personal link.
// Pure parts of store/account.js. Made-up customers only: the repository is public.
const assert = require('node:assert/strict');
const A = require('../store/account.js');

// the link: store.html#me=<64 hex>; anything else is not a link
const tok = 'ab'.repeat(32);
assert.equal(A.tokenFromHash('#me=' + tok), tok);
assert.equal(A.tokenFromHash('me=' + tok), tok);
assert.equal(A.tokenFromHash('#me=' + tok.slice(1)), null, 'too short');
assert.equal(A.tokenFromHash('#me=' + tok.toUpperCase()), null, 'lower-case hex only');
assert.equal(A.tokenFromHash('#item=12'), null);
assert.equal(A.tokenFromHash(''), null);

// the balance as the customer reads it (under half a pound = settled, as in the bot)
assert.deepEqual(A.balanceWords(7174), { cls: 'owe', text: 'عليك 7,174 ج' });
assert.deepEqual(A.balanceWords(7174.5), { cls: 'owe', text: 'عليك 7,174.50 ج' });
assert.deepEqual(A.balanceWords(-200), { cls: 'paid', text: 'ليك عندنا 200 ج' });
assert.deepEqual(A.balanceWords(0.4), { cls: 'zero', text: 'حسابك خالص' });
assert.deepEqual(A.balanceWords(-0.4), { cls: 'zero', text: 'حسابك خالص' });

// movements, in his words
assert.equal(A.moveTitle({ kind: 'sale', total: 166.7, paid: 0 }).text, 'فاتورة 166.70 ج');
assert.equal(A.moveTitle({ kind: 'return', total: -54, paid: 0 }).text, 'مرتجع 54 ج');
assert.equal(A.moveTitle({ kind: 'payment', total: 0, paid: 8000 }).text, 'دفعة 8,000 ج');
assert.equal(A.moveTitle({ kind: 'refund', total: 0, paid: -200 }).text, 'رجّعنالك 200 ج');
assert.equal(A.afterText(7174), 'بعدها: عليك 7,174');
assert.equal(A.afterText(-227), 'بعدها: ليك 227');
assert.equal(A.afterText(0.3), 'بعدها: خالص');
assert.equal(A.itemsWord(1), 'صنف واحد');
assert.equal(A.itemsWord(2), 'صنفين');
assert.equal(A.itemsWord(3), '3 أصناف');
assert.equal(A.itemsWord(14), '14 صنف');
assert.equal(A.qtyText({ p: 1, u: 0 }), '1 علبة');
assert.equal(A.qtyText({ p: 0, u: 2 }), '2 وحدة');
assert.equal(A.qtyText({ p: 1, u: 3 }), '1 علبة و3 وحدة');
// a line's value and the discount: like the bot's statement
assert.equal(A.lineValue({ p: 1, u: 0, k: 1, s: 66.7, d: 0 }), 66.7);
assert.equal(A.lineValue({ p: 0, u: 2, k: 2, s: 100, d: 0 }), 100);
assert.equal(A.discountOf({ kind: 'sale', total: 336.97, items: [{ p: 1, u: 0, k: 1, s: 374, d: 0 }] }), 37.03);
assert.equal(A.discountOf({ kind: 'payment', total: 0, paid: 50, items: [{ p: 1, s: 0 }] }), 0, 'a payment has no items');

// the filter chips
const moves = [
  { id: 1, at: '2026-11-05T13:07:00', kind: 'payment', total: 0, paid: 8000 },
  { id: 2, at: '2026-11-13T16:32:00', kind: 'sale', total: 426.5, paid: 0 },
  { id: 3, at: '2026-11-13T16:32:30', kind: 'return', total: -54, paid: 0 },
  { id: 4, at: '2026-11-13T22:33:00', kind: 'sale', total: 166.7, paid: 50 },
];
assert.deepEqual(A.movesFor(moves, 'sales').map((m) => m.id), [2, 3, 4]);
assert.deepEqual(A.movesFor(moves, 'payments').map((m) => m.id), [1, 4], 'paid part of a sale counts');
assert.equal(A.movesFor(moves, 'all').length, 4);

// how he pays: stopped = cash, whatever was picked
assert.equal(A.payOf(false, 'account'), 'account');
assert.equal(A.payOf(false, 'cash'), 'cash');
assert.equal(A.payOf(false, undefined), 'account', 'on account is the first choice');
assert.equal(A.payOf(true, 'account'), 'cash');

// the PDF starts from his last payment, else this month, else the oldest shown
const now = new Date(2026, 10, 13, 20, 0);
assert.equal(A.pdfStart(moves, now), 1);
assert.equal(A.pdfStart(moves.filter((m) => m.kind !== 'payment'), now), 2);
assert.equal(A.pdfStart([{ id: 9, at: '2026-09-01T10:00:00', kind: 'sale' }], now), 9);
assert.equal(A.pdfStart([], now), null);

// «آخر تحديث …»
const today = new Date(2026, 10, 13, 20, 10);
assert.match(A.updatedText(new Date(2026, 10, 13, 20, 8).toISOString(), today), /^آخر تحديث النهارده 8:08 م$/);
assert.match(A.updatedText(new Date(2026, 10, 12, 9, 5).toISOString(), today), /^آخر تحديث امبارح 9:05 ص$/);
assert.equal(A.updatedText(null, today), '');
// installing on his phone: the icon opens on his account (the store's manifest, start page = his link, all absolute)
const mf = A.manifestFor(tok, 'https://taherasker2560-dot.github.io/asker-nawaqes/store.html#account');
assert.equal(mf.start_url, 'https://taherasker2560-dot.github.io/asker-nawaqes/store.html#me=' + tok);
assert.equal(mf.scope, 'https://taherasker2560-dot.github.io/asker-nawaqes/');
assert.equal(mf.id, 'store.html');
assert.equal(mf.display, 'standalone');
assert.equal(mf.name, 'صيدلية عسكر');
assert.ok(mf.icons.length === 4 && mf.icons.every((i) => i.src.startsWith('https://taherasker2560-dot.github.io/asker-nawaqes/icons/')));
// iPhone / iPad (an iPad says «MacIntel» with touch) get the Safari steps
assert.equal(A.isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', 'iPhone', 5), true);
assert.equal(A.isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5), true);
assert.equal(A.isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0), false);
assert.equal(A.isIos('Mozilla/5.0 (Linux; Android 14; SM-A566B)', 'Linux armv81', 5), false);
// the steps follow HIS browser (owner: «لو المتصفح فايرفوكس او اي متصفح تاني»)
const UA = {
  chrome: 'Mozilla/5.0 (Linux; Android 14; SM-A566B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-A566B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  opera: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 OPR/85.0.0.0',
  edge: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  iosFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
};
assert.equal(A.installSteps(UA.chrome, 'Linux armv81', 5), A.TEXTS.installAndroid);
assert.equal(A.installSteps(UA.samsung, 'Linux armv81', 5), A.TEXTS.installSamsung);
assert.equal(A.installSteps(UA.firefox, 'Linux armv81', 5), A.TEXTS.installFirefox);
assert.equal(A.installSteps(UA.opera, 'Linux armv81', 5), A.TEXTS.installOther);
assert.equal(A.installSteps(UA.edge, 'Linux armv81', 5), A.TEXTS.installOther);
assert.equal(A.installSteps(UA.iosChrome, 'iPhone', 5), A.TEXTS.installIos, 'every iPhone browser: Share');
assert.equal(A.installSteps(UA.iosFirefox, 'iPhone', 5), A.TEXTS.installIos);
assert.equal(A.installSteps('', '', 0), A.TEXTS.installOther);
// another Android browser: the choice to open the same account in Google Chrome (one-tap install there)
assert.equal(A.offerChrome(UA.firefox), true);
assert.equal(A.offerChrome(UA.samsung), true);
assert.equal(A.offerChrome(UA.opera), true);
assert.equal(A.offerChrome(UA.chrome), false, 'already Chrome');
assert.equal(A.offerChrome(UA.iosFirefox), false, 'no Chrome hand-off on iPhone');
const intent = A.chromeIntent('https://taherasker2560-dot.github.io/asker-nawaqes/store.html#account', tok);
assert.equal(intent, 'intent://taherasker2560-dot.github.io/asker-nawaqes/store.html?me=' + tok + '&install=1' +
  '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent('https://taherasker2560-dot.github.io/asker-nawaqes/store.html?me=' + tok + '&install=1') + ';end');
// ?me= is read and then taken out of the address (other parts kept)
assert.equal(A.tokenFromSearch('?me=' + tok), tok);
assert.equal(A.tokenFromSearch('?a=1&me=' + tok), tok);
assert.equal(A.tokenFromSearch('?me=' + tok.slice(2)), null);
assert.equal(A.tokenFromSearch(''), null);
assert.equal(A.dropMe('?me=' + tok), '');
assert.equal(A.dropMe('?a=1&me=' + tok + '&b=2'), '?a=1&b=2');
assert.equal(A.dropMe('?me=' + tok + '&install=1'), '', 'the hand-off mark leaves too');
assert.equal(A.dropMe(''), '');
console.log('PASS: store account (customer link) helpers');
