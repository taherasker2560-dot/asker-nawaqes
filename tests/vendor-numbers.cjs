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
  { phone: '01000000004', name: 'مخزن رضا عطيه (ادهم)', kind: 'other' },
  { phone: '01000000005', name: 'رضا الحداد', kind: 'other' },
  { phone: '01000000006', name: 'Ibn Sina Mhmd', kind: 'other' },
  { phone: '01000000007', name: 'Ibn Sina Mhasb Reda', kind: 'other' },
  { phone: '01000000008', name: 'Kemi Jack', kind: 'other' },
  { phone: '01000000009', name: 'تليسيلز رضا عطيه', kind: 'other' },
  { phone: '0471234567', name: 'مكتب رضا عطيه الأرضي', kind: 'other' },
]);
const names = (list) => list.map((c) => c.name);
// every word of a two-word name: «رضا الحداد» (only «رضا») and «هاني عطيه محاسب» (only «عطيه») are not offered; the shorter name first
assert.deepEqual(names(V.suggestFor(book, { name: 'رضا عطية' })), ['المحاسب رضا عطيه', 'تليسيلز رضا عطيه', 'موزع رضا عطيه الجديد', 'مخزن رضا عطيه (ادهم)', 'مكتب رضا عطيه الأرضي'], 'the shorter name first, then the order of the book');
assert.equal(V.suggestFor(book, { name: 'رضا عطية' }).length, 5, 'five contacts hold both words (a landline is offered too: he may want it)');
assert.equal(V.suggestFor(book, { name: 'رضا عطية' }, 2).length, 2, 'a limit');
assert.ok(!names(V.suggestFor(book, { name: 'رضا عطية' })).includes('رضا الحداد'));
assert.deepEqual(names(V.suggestFor(book, { name: 'IBN SINA 1' })), ['Ibn Sina Mhmd', 'Ibn Sina Mhasb Reda'], 'a Latin name works the same');
assert.deepEqual(names(V.suggestFor(book, { name: 'x co', short: 'KEMI' })), ['Kemi Jack'], 'its short code as a whole word');
assert.deepEqual(V.suggestFor(book, { name: 'مخزن الدكتور مستحضرات' }), [], 'nothing to go by: nothing offered');
assert.deepEqual(V.suggestFor(null, { name: 'رضا عطية' }), []);

// the job a name points to
for (const [name, role] of [['المحاسب رضا عطيه', 'accountant'], ['هاني عطيه محاسب Sky', 'accountant'], ['Ibn Sina Mhasb Reda', 'accountant'], ['حسابات الحكمة', 'accountant'],
  ['تليسيلز رضا عطيه', 'telesales'], ['Hikma Telesales', 'telesales'], ['موزع رضا عطيه الجديد', 'distributor'], ['مخزن رضا عطيه (ادهم)', 'distributor'], ['Ibn Sina Mwz3 Mh. kholi', 'distributor'],
  ['مندوب الحكمة', 'distributor'], ['رضا الحداد', null], ['Kemi Jack', null]]) assert.equal(V.guessRole(name), role, name);

// the search of the picker: words in the name, or digits in the number; by name
assert.deepEqual(names(V.findInBook(book, 'عطيه', 3)).length, 3);
assert.deepEqual(names(V.findInBook(book, 'sina')).sort(), ['Ibn Sina Mhasb Reda', 'Ibn Sina Mhmd']);
assert.deepEqual(V.findInBook(book, '0100000000').length, 9, 'digits: part of a number');
assert.deepEqual(V.findInBook(book, 'zzzz'), []);
assert.deepEqual(V.findInBook(null, 'sina'), []);

// the people saved in «الوارد» (owner: «الطبيعي ان السيلز هو اللي هيبعت الوارد وينفذ الطلبيات»): the number as the book writes it, the ones that fit the company's name first
assert.equal(V.normBook('201000009001'), '01000009001'); assert.equal(V.normBook('01000009001'), '01000009001'); assert.equal(V.normBook('447710173736'), '447710173736'); assert.equal(V.normBook('12'), ''); assert.equal(V.normBook(null), '');
const inbox = V.inboxPeople([
  { name: 'مخزن ايه ام جروب (محمد كمال)', phone: '201000009001' }, { name: 'مخزن رضا عطيه (بهاء)', phone: '201000009006' }, { name: 'مخزن رضا عطيه (ادهم)', phone: '201000009002' },
  { name: 'شركه ابن سينا (محمد صبرى)', phone: '201000009008' }, { name: 'من غير رقم', phone: null }, { name: '', phone: '201000000000' }], { name: 'رضا عطية' });
assert.deepEqual(inbox.map((p) => [p.name, p.phone, p.fit]), [['مخزن رضا عطيه (ادهم)', '01000009002', 2], ['مخزن رضا عطيه (بهاء)', '01000009006', 2], ['شركه ابن سينا (محمد صبرى)', '01000009008', 0], ['مخزن ايه ام جروب (محمد كمال)', '01000009001', 0]],
  'the company\'s own people first (by name), the rest by name; no number or no name: left out');
assert.deepEqual(V.inboxPeople(null, { name: 'x' }), []);
assert.equal(V.findInBook({ list: inbox }, 'بهاء', 5).length, 1, 'the search works on them like on the book');
// the number WhatsApp opens: a mobile gets 20, an international number stays
assert.equal(V.waDigits('01012345678'), '201012345678');
assert.equal(V.waDigits('447710173736'), '447710173736');
assert.equal(V.waDigits('0471234567'), '0471234567', 'a landline as it is (8 to 15 digits)');
assert.equal(V.waDigits('123'), ''); assert.equal(V.waDigits(null), '');

// a number he TYPES (owner 2026-11-21: «مش عارف اضيف رقم المخزن … مش عارف اضيف رقم واحد منهم»): the phone as the book writes it, a name that may be empty, null when it is not a number
assert.deepEqual(V.typedPerson('01012345678', 'أحمد'), { phone: '01012345678', name: 'أحمد' });
assert.deepEqual(V.typedPerson('٠١٠١٢٣٤٥٦٧٨', '  مخزن   النور  '), { phone: '01012345678', name: 'مخزن النور' }, 'Arabic digits; the name is tidied');
assert.deepEqual(V.typedPerson('+20 10 1234-5678', ''), { phone: '01012345678', name: '' }, '+20, spaces and dashes; no name is fine');
assert.deepEqual(V.typedPerson('0020 (10) 1234 5678', null), { phone: '01012345678', name: '' });
assert.deepEqual(V.typedPerson('۰۱۰۱۲۳۴۵۶۷۸', 'x'), { phone: '01012345678', name: 'x' }, 'Persian digits too');
assert.deepEqual(V.typedPerson('0471234567', 'خط أرضي'), { phone: '0471234567', name: 'خط أرضي' }, 'a landline stays as typed (8 to 15 digits)');
assert.deepEqual(V.typedPerson('+44 7710 173736', 'برة'), { phone: '447710173736', name: 'برة' }, 'an international number stays');
for (const bad of ['', '   ', 'abc', '0101234', '01012345678901234', '010-ab-345678', null, undefined]) assert.equal(V.typedPerson(bad, 'x'), null, 'not a number: ' + bad);
assert.equal(V.typedPerson('01012345678', 'x'.repeat(300)).name.length, 120, 'the name is cut at 120 (the table allows 120)');
// what the picker shows (the company's card and the missing-item form share it): «الوارد» first, the book after; a search covers both; book = null while it is not loaded
const L1 = V.pickList(inbox, book, { name: 'رضا عطية' }, '');
assert.deepEqual(L1.inbox.map((p) => p.phone), ['01000009002', '01000009006', '01000009008', '01000009001'], 'no search: the people of «الوارد», the company\'s own first');
assert.deepEqual(L1.book.map((c) => c.name), ['المحاسب رضا عطيه', 'تليسيلز رضا عطيه', 'موزع رضا عطيه الجديد', 'مخزن رضا عطيه (ادهم)', 'مكتب رضا عطيه الأرضي'], 'the book\'s suggestions (the same list as before)');
const dup = V.pickList([{ phone: '01000000004', name: 'مخزن رضا عطيه (ادهم)', key: 'مخزن رضا عطيه احمد', kind: 'other', private: false, fit: 2 }], book, { name: 'رضا عطية' }, '');
assert.ok(!dup.book.some((c) => c.phone === '01000000004'), 'a person already shown from «الوارد» (same number) is not shown again from the book');
assert.equal(L1.search, false);
const L2 = V.pickList(inbox, book, { name: 'رضا عطية' }, 'بهاء');
assert.deepEqual(L2.inbox.map((p) => p.name), ['مخزن رضا عطيه (بهاء)']); assert.equal(L2.search, true);
assert.equal(V.pickList(inbox, null, { name: 'رضا عطية' }, '').book, null, 'the book is not loaded yet');
assert.equal(V.pickList(inbox, book, { name: 'رضا عطية' }, '', 2, 1).inbox.length, 2, 'limits'); assert.equal(V.pickList(inbox, book, { name: 'رضا عطية' }, '', 2, 1).book.length, 1);
assert.deepEqual(V.pickList(null, book, { name: 'مخزن الدكتور مستحضرات' }, '').inbox, []);

// ---- English: every text the screen draws comes out with no Arabic left ----
global.window = global; require('../ar/i18n-en.js'); require('../ar/i18n.js');
const I = global.AskerI18n; I._use(global.AskerEN);
const AR = /[؀-ۿ]/, bad = [];
const check = (s) => { const out = I.translate(s); if (AR.test(out)) bad.push(s + '  →  ' + out); };
for (const s of ['📇 أرقام الشركة', 'التليسيلز', 'الموزع', 'المحاسب', 'الطلبات و«طلب مش موجود»', 'بيان المرتجعات', 'كشف الحساب وقايمة المخزن', 'لسه ما اتحددش', 'اختار من دفترك', 'شيله', 'قفل',
  'دوس على وظيفة الرقم. المقترح من الاسم بلون مميز، والقرار ليك.', 'دوّر في دفترك بالاسم أو الرقم', 'بحمّل دفترك…', 'دفتر الأرقام مش متاح دلوقتي.', 'مفيش حد بالاسم ده في دفترك.',
  'مالقيتش حد بالاسم ده في دفترك: دوّر بالاسم أو الرقم.', 'هيروح للمحاسب:', 'ماتحفظش: boom', 'ماتشالش: boom', 'سجّل وابعت للتليسيلز على واتساب', 'التليسيلز:',
  'اتسجّل. اتفتح الواتس على التليسيلز ومعاه الرسالة: دوس إرسال هناك.', 'الطلب ده كان مسجّل قبل كده. اتفتح الواتس على التليسيلز ومعاه الرسالة: دوس إرسال هناك.',
  'مسجلين في «الوارد»: بيبعتوا القوايم وبينفذوا الطلبيات', 'من دفترك',
  '+ ضيف رقم', 'مفيش رقم للتليسيلز عند المورد ده', 'أو اكتب الرقم', 'دوس على وظيفته:', 'رقم الموبايل', 'الاسم (اختياري)', 'احفظ كتليسيلز المورد ده', 'الرقم لازم يكون أرقام بس، من 8 لـ 15 رقم.', 'غيّره',
  '📲 ابعت للموزع على واتساب', 'الموزع:', 'الكشف طويل: اتنسخ، الزقه في المحادثة اللي اتفتحت.', 'اتفتحت محادثة الموزع ومعاها الكشف: دوس إرسال هناك.']) check(s);
for (const [, label, use] of V.VN_ROLES) { check(label); check(use); }
assert.deepEqual(bad, [], 'texts left in Arabic:\n' + bad.join('\n'));
assert.equal(I.translate('هيروح للمحاسب:'), 'It goes to the accountant:');
assert.equal(I.translate('📲 ابعت للموزع على واتساب'), '📲 Send to the distributor on WhatsApp');
console.log('vendor-numbers ok');
