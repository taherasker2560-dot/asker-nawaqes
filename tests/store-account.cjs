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
console.log('PASS: store account (customer link) helpers');
