// A supplier company's three numbers (owner 2026-11-20: telesales = orders and «طلب مش موجود», distributor = the returns statement, accountant = the account statement and the warehouse list):
// the words of a company's name, the contacts of his number book that fit it, the job a contact's name points to, WhatsApp's number, and the English of what the screen says. Made-up people only.
const assert = require('node:assert/strict');
const W = require('../ar/waitlist.js');   // the number book's helpers (the page loads them too)
const V = require('../ar/vendors.js');
assert.deepEqual(V.VN_ROLES.map((r) => r[0]), ['telesales', 'distributor', 'accountant']);

// the words that point to a company: no short words, no numbers, no «شركة / صيدلية / مخزن …»
assert.deepEqual(V.vendorTokens({ name: 'رضا عطية' }), ['رضا', 'عطيه'], 'ة/ه are the same');
assert.deepEqual(V.vendorTokens({ name: 'IBN SINA 1' }), ['ibn', 'sina']);
assert.deepEqual(V.vendorTokens({ name: 'شركه عامر للمستحضرات بدسوق' }), ['عامر', 'بدسوق']);
assert.deepEqual(V.vendorTokens({ name: 'مخزن الدكتور مستحضرات' }), [], 'only filler words: nothing points to it');
assert.deepEqual(V.vendorTokens(null), []);

const book = W.makeBook([
  { phone: '01000000001', name: 'المحاسب رضا عطيه', kind: 'other' },
  { phone: '01000000002', name: 'هاني عطيه محاسب Sky', kind: 'other' },
  { phone: '01000000003', name: 'موزع رضا عطيه الجديد', kind: 'other' },
  { phone: '01000000004', name: 'مخزن رضا عطيه (احمد)', kind: 'other' },
  { phone: '01000000005', name: 'رضا الحداد', kind: 'other' },
  { phone: '01000000006', name: 'Ibn Sina Mhmd', kind: 'other' },
  { phone: '01000000007', name: 'Ibn Sina Mhasb Reda', kind: 'other' },
  { phone: '01000000008', name: 'Kemi Jack', kind: 'other' },
  { phone: '01000000009', name: 'تليسيلز رضا عطيه', kind: 'other' },
  { phone: '0471234567', name: 'مكتب رضا عطيه الأرضي', kind: 'other' },
]);
const names = (list) => list.map((c) => c.name);
// every word of a two-word name: «رضا الحداد» (only «رضا») and «هاني عطيه محاسب» (only «عطيه») are not offered; the shorter name first
assert.deepEqual(names(V.suggestFor(book, { name: 'رضا عطية' })), ['المحاسب رضا عطيه', 'تليسيلز رضا عطيه', 'موزع رضا عطيه الجديد', 'مخزن رضا عطيه (احمد)', 'مكتب رضا عطيه الأرضي'], 'the shorter name first, then the order of the book');
assert.equal(V.suggestFor(book, { name: 'رضا عطية' }).length, 5, 'five contacts hold both words (a landline is offered too: he may want it)');
assert.equal(V.suggestFor(book, { name: 'رضا عطية' }, 2).length, 2, 'a limit');
assert.ok(!names(V.suggestFor(book, { name: 'رضا عطية' })).includes('رضا الحداد'));
assert.deepEqual(names(V.suggestFor(book, { name: 'IBN SINA 1' })), ['Ibn Sina Mhmd', 'Ibn Sina Mhasb Reda'], 'a Latin name works the same');
assert.deepEqual(names(V.suggestFor(book, { name: 'x co', short: 'KEMI' })), ['Kemi Jack'], 'its short code as a whole word');
assert.deepEqual(V.suggestFor(book, { name: 'مخزن الدكتور مستحضرات' }), [], 'nothing to go by: nothing offered');
assert.deepEqual(V.suggestFor(null, { name: 'رضا عطية' }), []);

// the job a name points to
for (const [name, role] of [['المحاسب رضا عطيه', 'accountant'], ['هاني عطيه محاسب Sky', 'accountant'], ['Ibn Sina Mhasb Reda', 'accountant'], ['حسابات الحكمة', 'accountant'],
  ['تليسيلز رضا عطيه', 'telesales'], ['Hikma Telesales', 'telesales'], ['موزع رضا عطيه الجديد', 'distributor'], ['مخزن رضا عطيه (احمد)', 'distributor'], ['Ibn Sina Mwz3 Mh. kholi', 'distributor'],
  ['مندوب الحكمة', 'distributor'], ['رضا الحداد', null], ['Kemi Jack', null]]) assert.equal(V.guessRole(name), role, name);

// the search of the picker: words in the name, or digits in the number; by name
assert.deepEqual(names(V.findInBook(book, 'عطيه', 3)).length, 3);
assert.deepEqual(names(V.findInBook(book, 'sina')).sort(), ['Ibn Sina Mhasb Reda', 'Ibn Sina Mhmd']);
assert.deepEqual(V.findInBook(book, '0100000000').length, 9, 'digits: part of a number');
assert.deepEqual(V.findInBook(book, 'zzzz'), []);
assert.deepEqual(V.findInBook(null, 'sina'), []);

// the number WhatsApp opens: a mobile gets 20, an international number stays
assert.equal(V.waDigits('01012345678'), '201012345678');
assert.equal(V.waDigits('447710173736'), '447710173736');
assert.equal(V.waDigits('0471234567'), '0471234567', 'a landline as it is (8 to 15 digits)');
assert.equal(V.waDigits('123'), ''); assert.equal(V.waDigits(null), '');

// ---- English: every text the screen draws comes out with no Arabic left ----
global.window = global; require('../ar/i18n-en.js'); require('../ar/i18n.js');
const I = global.AskerI18n; I._use(global.AskerEN);
const AR = /[؀-ۿ]/, bad = [];
const check = (s) => { const out = I.translate(s); if (AR.test(out)) bad.push(s + '  →  ' + out); };
for (const s of ['📇 أرقام الشركة', 'التليسيلز', 'الموزع', 'المحاسب', 'الطلبات و«طلب مش موجود»', 'بيان المرتجعات', 'كشف الحساب وقايمة المخزن', 'لسه ما اتحددش', 'اختار من دفترك', 'شيله', 'قفل',
  'دوس على وظيفة الرقم. المقترح من الاسم بلون مميز، والقرار ليك.', 'دوّر في دفترك بالاسم أو الرقم', 'بحمّل دفترك…', 'دفتر الأرقام مش متاح دلوقتي.', 'مفيش حد بالاسم ده في دفترك.',
  'مالقيتش حد بالاسم ده في دفترك: دوّر بالاسم أو الرقم.', 'هيروح للمحاسب:', 'ماتحفظش: boom', 'ماتشالش: boom', 'سجّل وابعت للتليسيلز على واتساب', 'التليسيلز:',
  'اتسجّل. اتفتح الواتس على التليسيلز ومعاه الرسالة: دوس إرسال هناك.', 'الطلب ده كان مسجّل قبل كده. اتفتح الواتس على التليسيلز ومعاه الرسالة: دوس إرسال هناك.',
  '📲 ابعت للموزع على واتساب', 'الموزع:', 'الكشف طويل: اتنسخ، الزقه في المحادثة اللي اتفتحت.', 'اتفتحت محادثة الموزع ومعاها الكشف: دوس إرسال هناك.']) check(s);
for (const [, label, use] of V.VN_ROLES) { check(label); check(use); }
assert.deepEqual(bad, [], 'texts left in Arabic:\n' + bad.join('\n'));
assert.equal(I.translate('هيروح للمحاسب:'), 'It goes to the accountant:');
assert.equal(I.translate('📲 ابعت للموزع على واتساب'), '📲 Send to the distributor on WhatsApp');
console.log('vendor-numbers ok');
