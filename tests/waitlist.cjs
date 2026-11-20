// «📝 الانتظار» (owner 2026-11-19): the pure helpers of ar/waitlist.js (the number he types, the card's name, the quantity, the two messages, the days in words, what
// needs his look, one card per medicine) and its English: every text the screen draws must come out in English with the bot's dictionary and engine.
const assert = require('node:assert/strict');
const W = require('../ar/waitlist.js');
// the number: spaces, +20, a missing 0, Arabic digits; anything else is not a mobile number
assert.equal(W.normPhone('01012345678'), '01012345678');
assert.equal(W.normPhone('+20 101 234 5678'), '01012345678');
assert.equal(W.normPhone('٠١٠١٢٣٤٥٦٧٨'), '01012345678');
assert.equal(W.normPhone('1012345678'), '01012345678', 'a phone without the 0');
assert.equal(W.normPhone('0020 1012345678'), '01012345678');
assert.equal(W.normPhone('0101234'), '');
assert.equal(W.normPhone('02012345678'), '', 'a landline is not a mobile');
assert.equal(W.normPhone(''), '');
// the card's name carries the mobile after an underscore
assert.equal(W.cleanName('أحمد محمود_01001112223'), 'أحمد محمود');
assert.equal(W.cleanName('منى سالم'), 'منى سالم');
assert.equal(W.cleanName(null), '');
// the quantity: empty = one, 1..999, Arabic digits, two decimals at most
assert.equal(W.parseQty(''), 1);
assert.equal(W.parseQty(' 3 '), 3);
assert.equal(W.parseQty('٣'), 3);
assert.equal(W.parseQty('2.5'), 2.5);
for (const bad of ['0', '1000', 'x', '-1', '1.234']) assert.ok(Number.isNaN(W.parseQty(bad)), 'refused: ' + bad);
assert.deepEqual([1, 2, 3, 10, 2.5].map(W.qtyWord), ['علبة', 'علبتين', '3 علب', '10 علب', '2.5 علب']);
// the message to the supplier: the medicine and the quantity, no customer in it; the one to the customer names the medicine
const vm = W.vendorMsg('AUGMENTIN 1GM 14 TAB', 2);
assert.match(vm, /محتاج علبتين AUGMENTIN 1GM 14 TAB لو متوفر/);
assert.doesNotMatch(vm, /\d{8,}/, 'no phone number goes to a supplier');
assert.match(W.customerMsg('AUGMENTIN 1GM'), /AUGMENTIN 1GM\) وصل في الصيدلية/);
assert.equal(W.waLink('01012345678', 'اهلا'), 'https://wa.me/201012345678?text=' + encodeURIComponent('اهلا'));
assert.equal(W.telLink('01012345678'), 'tel:01012345678');
assert.deepEqual(['warehouse', 'center', 'x'].map(W.kindText), ['مخزن', 'مركز توزيع', '']);
assert.deepEqual(W.KIND_DAYS, { warehouse: 30, center: 7 });
// «وصل من يومين», «اتطلب النهارده»
assert.deepEqual([0, 1, 2, 5, 10, 11, 40].map((n) => W.ago('وصل', n)), ['وصل النهارده', 'وصل من يوم', 'وصل من يومين', 'وصل من 5 أيام', 'وصل من 10 أيام', 'وصل من 11 يوم', 'وصل من 40 يوم']);
assert.equal(W.ago('اتطلب', -3), 'اتطلب النهارده', 'never a negative time');
// the days left to return in words; null = the supplier's kind is not set yet
assert.deepEqual([null, -3, 0, 1, 2, 5, 11].map(W.leftText), ['حدد نوع المورد عشان يظهر ميعاد الرجوع', 'عدّى ميعاد الرجوع من 3 يوم', 'آخر يوم للرجوع النهارده', 'فاضل يوم على الرجوع', 'فاضل يومين على الرجوع', 'فاضل 5 أيام على الرجوع', 'فاضل 11 يوم على الرجوع']);
// the days left, and what needs his look (to call; within 2 days of the deadline or past it)
const now = Date.parse('2026-11-19T12:00:00Z');
const ago = (d) => new Date(now - d * 864e5).toISOString();
assert.equal(W.daysLeft({ return_days: 7, arrived_at: ago(3) }, now), 4);
assert.equal(W.daysLeft({ return_days: 30, arrived_at: ago(35) }, now), -5);
assert.equal(W.daysLeft({ return_days: null, arrived_at: ago(3) }, now), null);
const R = [
  { status: 'arrived', called_at: null, return_days: 7, arrived_at: ago(1) },
  { status: 'arrived', called_at: ago(0.5), return_days: 7, arrived_at: ago(6) },
  { status: 'arrived', called_at: null, return_days: 30, arrived_at: ago(35) },
  { status: 'arrived', called_at: ago(1), return_days: null, arrived_at: ago(50) },
  { status: 'waiting', called_at: null },
  { status: 'delivered', called_at: null, return_days: 7, arrived_at: ago(9) },
];
assert.deepEqual(W.needs(R, now), { call: 2, near: 2 }, 'two to call; the one with 1 day left and the one past its deadline are near');
assert.deepEqual(W.needs([], now), { call: 0, near: 0 });
assert.deepEqual(W.needs(null, now), { call: 0, near: 0 });
// one card per medicine, in the order they came; a typed one is grouped by its name
const G = W.groupCall([{ id: 1, item_id: 5, item: 'A' }, { id: 2, item_id: 6, item: 'B' }, { id: 3, item_id: 5, item: 'A' }, { id: 4, item_id: null, item: 'Typed One' }, { id: 5, item_id: null, item: 'typed one' }]);
assert.deepEqual(G.map((g) => [g.item, g.rows.map((r) => r.id)]), [['A', [1, 3]], ['B', [2]], ['Typed One', [4, 5]]]);
assert.equal(W.errText('phone'), 'رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01.');
assert.equal(W.errText('xyz'), 'مقدرتش أكمّل. جرّب تاني.');

// ---- the book of numbers (owner 2026-11-20): a number → his name, a name → the numbers that fit; Arabic digits and letters are read alike ----
{
  const bk = W.makeBook([
    { phone: '01001234567', name: 'عميل ١٢١', kind: 'cash', last_item: 'Entresto' },
    { phone: '01061287937', name: 'احمد الطنطاوى', kind: 'account', last_item: null },
    { phone: '01112223334', name: 'أحمد الطنطاوي الصغير', kind: 'other', last_item: null },
    { phone: '0471234567', name: 'احمد الطنطاوى مكتب', kind: 'other', last_item: null },   // a landline: in the book, but not offered for the form
    { phone: '447710173736', name: 'خارجي', kind: 'other', last_item: null },
  ]);
  assert.equal(W.bookFind(bk, '+20 100 123 4567').name, 'عميل ١٢١', 'a number as he types it (+20, spaces) finds the name');
  assert.equal(W.bookFind(bk, '٠١٠٠١٢٣٤٥٦٧').name, 'عميل ١٢١', 'Arabic digits');
  assert.equal(W.bookFind(bk, '01099999999'), null);
  assert.equal(W.bookFind(bk, '010'), null, 'half a number finds nothing');
  assert.deepEqual(W.bookSearch(bk, 'عميل 121').map((c) => c.phone), ['01001234567'], '«121» finds «١٢١»');
  assert.deepEqual(W.bookSearch(bk, 'entresto').map((c) => c.phone), ['01001234567'], 'the drug beside the name is searched too');
  assert.deepEqual(W.bookSearch(bk, 'احمد الطنطاوي').map((c) => c.phone), ['01061287937', '01112223334'], 'ى/ي and أ/ا are the same; the shorter name first; a landline is not offered');
  assert.deepEqual(W.bookSearch(bk, 'ا'), [], 'one letter offers nothing');
  assert.equal(W.bookSearch(bk, 'احمد').length, 2);
  assert.equal(W.bookKind('cash'), 'نقدي'); assert.equal(W.bookKind('account'), 'له حساب'); assert.equal(W.bookKind('other'), '');
  const h = W.historyRows([{ item_name: 'Entresto 50 mg', status: 'waiting', created_at: '2026-11-20T10:00:00Z' }, { item_name: 'Eltroxin 100', status: 'delivered', created_at: '2026-11-05T09:00:00Z' }], bk.list[0]);
  assert.deepEqual(h, [{ item: 'Entresto 50 mg', day: '11-20', status: 'مستني' }, { item: 'Eltroxin 100', day: '11-05', status: 'اتسلّم' }, { item: 'Entresto', day: '', status: 'قديم' }], 'the kept requests, then the old one from his phone');
  assert.deepEqual(W.historyRows([], null), []);
}

// ---- English: every text the screen draws, fixed and built, comes out with no Arabic left ----
global.window = global; require('../ar/i18n-en.js'); require('../ar/i18n.js');
const I = global.AskerI18n; I._use(global.AskerEN);
const AR = /[؀-ۿ]/, bad = [];
const check = (s) => { const out = I.translate(s); if (AR.test(out)) bad.push(s + '  →  ' + out); };
for (const s of ['الانتظار', '📝 الانتظار', '📝 طلب مش موجود', 'اسم الدوا (إنجليزي أو عربي)', 'اسم الدوا', 'اكتبه زي ما هو', 'الدوا', 'العميل', 'رقم العميل', 'الكمية 1', 'الكمية', 'اسم العميل (اختياري)', 'اسم العميل', 'المورد اللي هتبعتله',
  'من غير مورد', 'المورد ده مخزن ولا مركز توزيع؟ (مرة واحدة بس)', 'مخزن · رجوع 30 يوم', 'مركز توزيع · رجوع 7 أيام', 'سجّل وانسخ رسالة المورد', 'سجّل بس', 'إلغاء', '📞 كلّم دول', 'مستنيين الدوا', '↩️ قرار الرجوع',
  'اللي وصل وما اتسلّمش. الأقرب ميعادًا فوق. القرار ليك: السيستم بيعرض الأرقام بس.', 'مفيش طلبات انتظار دلوقتي. لما عميل يسأل على دوا مش موجود، دوس «طلب مش موجود».', '📦 حطه في مكان الانتظار، مش مع الرف العادي',
  'اتصل', 'واتساب', 'اتسلّم', 'مش وصل لسه', 'وصل', 'متأكد؟ دوس تاني', 'رجّعته للمورد', 'هسيبه', 'اتكلم', 'صنف مش معروف للسيستم: دوس «وصل» بإيدك', 'صلاحيته أقل من سنة ونص', 'رسالة المورد', 'بحمّل…',
  'اللي بيوصل بيتعرف من قايمة المخزون لوحده (على قد تحديث اللاب)، أو دوس «وصل» بإيدك. السيستم ما بيبعتش رسالة لوحده.',
  'اتسجّل.', 'الطلب ده كان مسجّل قبل كده.', 'اتسجّل. رسالة المورد اتنسخت، ابعتها من واتساب.', 'الطلب ده كان مسجّل قبل كده. رسالة المورد اتنسخت، ابعتها من واتساب.',
  'اتسجّل. ماقدرتش أنسخ الرسالة، انسخها بإيدك من تحت.', 'الطلب ده كان مسجّل قبل كده. ماقدرتش أنسخ الرسالة، انسخها بإيدك من تحت.',
  'من دفتر أرقامك', 'سجل طلباته', 'نقدي', 'له حساب', 'قديم', 'مستني', 'اتلغى', 'اتحفظ', 'رجع للمورد',
  'مقدرتش أحمّل الانتظار: boom', 'ماتغيّرش: boom', 'دوا وصل لعملاء مستنيينه: كلّمهم', 'دوا ميعاد رجوعه للمورد قرب (يومين أو أقل)']) check(s);
for (const e of ['item', 'name', 'phone', 'qty', 'vendor', 'kind', 'state', 'missing', 'action']) check(W.errText(e));
for (const n of [0, 1, 2, 5, 11]) { check(W.ago('وصل', n)); check(W.ago('اتطلب', n)); }
for (const n of [null, -3, 0, 1, 2, 5, 11]) check(W.leftText(n));
for (const q of [1, 2, 3, 10, 2.5]) check(W.qtyWord(q));
for (const k of ['warehouse', 'center']) check(W.kindText(k));
for (const s of ['اتباع آخر سنة: 3.5 علبة', 'السعر 62 ج', 'أقرب صلاحية في المخزن 2027-05']) check(s);
assert.deepEqual(bad, [], 'texts left in Arabic:\n' + bad.join('\n'));
assert.equal(I.translate('وصل من يومين'), 'Arrived 2 days ago');
assert.equal(I.translate('فاضل يوم على الرجوع'), '1 day left to return');
assert.equal(I.translate('فاضل 5 أيام على الرجوع'), '5 days left to return');
assert.equal(I.translate('اتباع آخر سنة: 3.5 علبة'), 'Sold in the last year: 3.5 packs');
assert.equal(I.translate('3 علب'), '3 packs');
console.log('waitlist ok');
