// «⚙️ عمليات وتقارير» on the item card (owner 2026-11-20): the plain rules of the sheet: the rows of the report from the two sources, the filters, the merge newest first with pages read only when needed,
// the labels' number, and the English of every text it draws. Made-up items and invoices only.
const assert = require('node:assert/strict');
const A = require('../ar/item-actions.js');

// words and money
assert.equal(A.dmy('2026-11-18T12:00:00'), '18/11/2026'); assert.equal(A.dmy(null), '');
assert.equal(A.expText('2028-08-28'), '08/2028'); assert.equal(A.expText(null), '—');
assert.equal(A.buyQty({ p: 10, u: 0, b: 1 }), '10 + 1 بونص'); assert.equal(A.buyQty({ p: 0, u: 3 }), '3 وحدة'); assert.equal(A.buyQty({}), '0');
assert.equal(A.saleQty({ p: 2, u: 3 }), '2 علبة + 3 وحدة'); assert.equal(A.saleQty({ p: 1.5, u: 0 }), '1.5 علبة'); assert.equal(A.saleQty({}), '0');
assert.equal(A.buyValue({ p: 10, u: 5, k: 10, c: 86 }), 903, 'packs + units / units in a pack, times the cost of a pack');
assert.equal(A.saleValue({ p: 2, u: 0, k: 1, s: 85, d: 5 }), 165, 'the line discount comes off');
assert.equal(A.money(1234.5), '1,234.50'); assert.equal(A.money(86), '86');

// the filters
assert.deepEqual(['all', 'buy', 'sale', 'ret'].map((t) => ['buy', 'buyret', 'cash', 'credit', 'saleret'].filter((k) => A.keepKind(t, k))), [
  ['buy', 'buyret', 'cash', 'credit', 'saleret'], ['buy'], ['cash', 'credit'], ['buyret', 'saleret']]);
assert.equal(A.periodFrom('all'), null);
assert.equal(A.periodFrom('month', new Date(2026, 10, 20, 15, 0)), '2026-10-21T00:00:00');
assert.equal(A.periodFrom('year', new Date(2026, 10, 20, 15, 0)), '2025-11-20T00:00:00');

// the rows
const b = A.buyRow({ id: 14, vendor_id: 5, at: '2026-11-18T12:00:00', kind: 'purchase', code: '11/26/300', line: { i: 101, p: 10, u: 0, k: 1, b: 1, c: 86, t: 16, x: '2028-08-28' } }, 'المتحدة');
assert.deepEqual([b.key, b.src, b.kind, b.party, b.code, b.qty, b.price, b.disc, b.exp], ['b14', 'buy', 'buy', 'المتحدة', '11/26/300', '10 + 1 بونص', 86, 16, '2028-08-28']);
assert.equal(A.buyRow({ id: 1, at: '2026-11-01T10:00:00', kind: 'return', code: '~1', line: { i: 101, p: 2 } }, 'x').kind, 'buyret', 'a purchase return');
assert.equal(A.buyRow({ id: 2, at: '2026-11-01T10:00:00', kind: 'purchase', code: null, line: null }, '').qty, '0', 'a line that is not found does not break it');
const tk = { id: 59812, at: '2026-11-17T10:00:00', customer_id: null, customer: null, kind: 'sale', total: 255, lines: [{ i: 101, p: 2, u: 0, k: 1, s: 85, d: 0, n: 'CATAFLAM 50MG 20 TAB' }, { i: 102, p: 1, u: 0, k: 1, s: 85, d: 0, n: 'OTHER ITEM' }] };
const sc = A.saleRow(tk, 101), sk = A.saleRow({ ...tk, id: 2, customer_id: 9, customer: 'عميل مثال' }, 101), sr = A.saleRow({ ...tk, id: 3, kind: 'return', total: -85 }, 101);
assert.deepEqual([sc.kind, sc.party, sc.code, sc.qty, sc.price, sc.mine.length, sc.lines.length], ['cash', 'نقدي', '59812', '2 علبة', 85, 1, 2], 'a cash sale: this item\'s line is «mine», the whole ticket is kept to open');
assert.deepEqual([sk.kind, sk.party], ['credit', 'عميل مثال']); assert.equal(sr.kind, 'saleret');
assert.equal(A.saleRow({ ...tk, customer_id: 7, customer: null }, 101).party, '#7', 'a credit customer with no name');
// newest first; the same moment: the higher id first
assert.deepEqual([{ at: '2026-11-01T10:00:00', id: 1 }, { at: '2026-11-02T10:00:00', id: 2 }, { at: '2026-11-02T10:00:00', id: 5 }].sort(A.newer).map((x) => x.id), [5, 2, 1]);

// two sources read page by page, merged newest first; a source is read again only when its buffer is empty
(async () => {
  const buys = ['2026-11-20', '2026-11-16', '2026-11-12', '2026-11-08', '2026-11-04', '2026-10-31'].map((d, i) => ({ id: 60 - i * 10, at: d + 'T10:00:00', kind: 'buy' }));
  const sales = ['2026-11-19', '2026-11-14', '2026-11-09', '2026-11-04'].map((d, i) => ({ id: 400 - i, at: d + 'T10:00:00', kind: 'cash' }));  // a stream that returns less than a page is done at once: here each one is given its whole list
  const all = await A.takeMerged([A.makeStream(async () => buys, null, null), A.makeStream(async () => sales, null, null)], 99);
  assert.deepEqual(all.map((r) => r.at.slice(5, 10)), ['11-20', '11-19', '11-16', '11-14', '11-12', '11-09', '11-08', '11-04', '11-04', '10-31'].map((x) => x));
  // the first n only; and the rest later, in order
  const ba = A.makeStream(async () => buys, null, null), sa = A.makeStream(async () => sales, null, null);
  const first = await A.takeMerged([ba, sa], 3), rest = await A.takeMerged([ba, sa], 99);
  assert.deepEqual(first.map((r) => r.at.slice(5, 10)), ['11-20', '11-19', '11-16']); assert.equal(rest.length, 7); assert.equal(A.hasMore([ba, sa]), false);
  // a filter drops rows, and a stream ends at the period's start
  const only = A.makeStream(async () => buys, (r) => r.id >= 40, (r) => r.at < '2026-11-10T00:00:00');
  const got = await A.takeMerged([only], 99);
  assert.deepEqual(got.map((r) => r.id), [60, 50, 40], 'kept ids 40 and over, and nothing older than the period');
  assert.equal(A.hasMore([only]), false);
  // many pages: the stream reads the next page with the last id as the cursor, until a short page
  const big = Array.from({ length: 120 }, (_, i) => ({ id: 1000 - i, at: '2026-11-01T10:00:00' }));
  const calls = [];
  const paged = A.makeStream(async (before) => { calls.push(before); return big.filter((r) => before == null || r.id < before).slice(0, A.PAGE); }, null, null);
  const got2 = await A.takeMerged([paged], 120);
  assert.equal(got2.length, 120); assert.deepEqual(calls, [null, 951, 901], 'page 1, then after the 50th, then after the 100th (a short page ends it)');
  assert.equal(A.hasMore([paged]), false);
  assert.deepEqual(await A.takeMerged([], 5), [], 'no streams');

  // the labels
  assert.equal(A.parseCopies('10'), 10); assert.equal(A.parseCopies('٢٥'), 25); assert.equal(A.parseCopies(' 500 '), 500);
  for (const bad of ['0', '501', '', 'abc', '1.5', '-3', '1000']) assert.ok(Number.isNaN(A.parseCopies(bad)), bad);

  // ---- the monthly summary: years newest first, months newest first, a row of zeros for a month nothing sold, totals, bars ----
  const now = new Date(2026, 10, 20, 15, 0);
  const yrs = A.byYear({ '2026-11': [5, 1, 300, 3], '2025-06': [20, 2, 1000, 12], '2025-12': [8, 0, 400, 6], '2018-03': [10, 0, 850.5, 4], 'bad': [1], '2019-13': [1, 1, 1, 1], '2019-05': 'x' }, now);
  assert.deepEqual(yrs.map((g) => g.year), [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018], 'every year from the first month to this one; bad keys and shapes are left out');
  assert.deepEqual(yrs[0].rows.map((r) => r.month), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 'this year: January to this month, newest first');
  assert.deepEqual(yrs[1].rows.length, 12); assert.deepEqual(yrs[yrs.length - 1].rows.map((r) => r.month), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3], '2018 starts at the first month');
  assert.deepEqual(yrs[0].tot, { s: 5, r: 1, v: 300, n: 3 }); assert.deepEqual(yrs[1].tot, { s: 28, r: 2, v: 1400, n: 18 });
  assert.deepEqual(yrs[1].rows.find((r) => r.month === 1), { ym: '2025-01', month: 1, s: 0, r: 0, v: 0, n: 0 }, 'a month nothing sold is zeros');
  assert.deepEqual(A.grandTotal(yrs), { s: 43, r: 3, v: 2550.5, n: 25 });
  assert.equal(A.maxSold(yrs), 20);
  assert.deepEqual([[20, 20], [5, 20], [0, 20], [0.1, 20], [3, 0], [25, 20]].map(([s, m]) => A.barPct(s, m)), [100, 25, 0, 3, 0, 100], 'a stub when something sold, nothing when not, never over 100');
  assert.deepEqual(A.byYear({}, now), []); assert.deepEqual(A.byYear(null, now), []); assert.deepEqual(A.byYear([1, 2], now), []);
  assert.deepEqual(A.byYear({ '2026-12': [1, 0, 1, 1] }, now).map((g) => [g.year, g.rows.map((r) => r.month)]), [[2026, [12]]], 'a month later than today (a wrong clock) ends the range there');
  assert.equal(A.MONTHS.length, 12);
  assert.equal(A.localDmy('2026-11-20T10:30:00+02:00'), '20/11/2026'); assert.equal(A.localDmy('nope'), '');

  // ---- English: every text the sheet draws comes out with no Arabic left ----
  global.window = global; require('../ar/i18n-en.js'); require('../ar/i18n.js');
  const I = global.AskerI18n; I._use(global.AskerEN);
  const AR = /[؀-ۿ]/, bad = [];
  const check = (s) => { const out = I.translate(s); if (AR.test(out)) bad.push(s + '  →  ' + out); };
  for (const s of ['⚙️ عمليات وتقارير', 'الصنف ده لسه مش متسجل في فارما فلاي', '📊 تقارير', 'حركة الصنف', 'مشتريات ومبيعات ومرتجعات بالتاريخ، وتدوس على الفاتورة تتفتح', 'حركة المشتريات',
    'كل شراء: الشركة، الفاتورة، الكمية والبونص، الخصم، الصلاحية', 'حركة المبيعات', 'كل بيعة: التذكرة، الكمية، السعر، نقدي ولا آجل', '⚙️ عمليات على الصنف', 'جرد', 'تسجّل اللي لقيته لكل صلاحية (للصنف اللي عليه رصيد)',
    'طباعة باركود', 'عدد الملصقات:', 'عدد الملصقات', 'سجّل', 'العملية بتتسجّل في «الحسابات ← العمليات» بحالة «مستنية» وتقدر تلغيها هناك. بتتنفذ على فارما فلاي بالريموت لما نخلّص ربط الشاشة دي.',
    'عدد الملصقات من 1 لـ 500.', 'اتسجّلت في «العمليات»: طباعة باركود (مستنية).', 'ما اتسجّلتش: boom', '‹ رجوع للقايمة', 'الكل', 'مشتريات', 'مبيعات', 'مرتجعات', 'آخر شهر', 'آخر سنة', 'من 2018',
    'بيجيب الحركة…', 'ما اتعاملناش على الصنف ده في الفترة دي.', 'عرض أكتر', 'المشتريات من 2018. المبيعات التفصيلية آخر سنة بس، وقبلها في «المبيعات الشهرية».', 'التقارير دي لسه مش متاحة: محتاجة تفعيل على السيرفر الأول.',
    'المبيعات الشهرية', 'كام اتباع من الصنف كل شهر من 2018، سنة بسنة', 'بيجيب الملخص الشهري…', 'الملخص الشهري لسه ما اتحمّلش من اللابتوب.', 'الصنف ده ما اتباعش في أي شهر من 2018.',
    'مقدرتش أجيب الملخص الشهري: boom', 'الإجمالي من', 'مفيش مبيعات', 'فواتير', 'مرتجع', 'الأرقام بالعلب (العلب + الوحدات ÷ عدد الوحدات في العلبة). الشهر الحالي بيكتمل مع التحديث اليومي.', 'آخر تحديث من اللابتوب:',
    ...A.MONTHS,
    'مقدرتش أجيب الحركة: boom', 'الفاتورة مش موجودة.', 'مقدرتش أفتح الفاتورة: boom', 'بيفتح الفاتورة…', 'شراء', 'مرتجع شراء', 'بيع نقدي', 'بيع آجل', 'مرتجع بيع', 'نقدي', 'رقم الفاتورة', 'رقم التذكرة',
    'التكلفة', 'السعر', 'الخصم', 'الصلاحية', 'الصنف', 'الكمية', 'القيمة', 'الإجمالي:', 'ج', 'الرصيد بعدها', 'علبة', 'وحدة', 'بونص', 'إغلاق',
    'طباعة 10 ملصق باركود: CATAFLAM', 'الصنف ده ملوش رصيد في فارما فلاي دلوقتي، والجرد بيشتغل على اللي عليه رصيد.', 'اتفتح للجرد: CATAFLAM']) check(s);
  assert.deepEqual(bad, [], 'texts left in Arabic:\n' + bad.join('\n'));
  assert.equal(I.translate('طباعة 10 ملصق باركود: CATAFLAM'), 'Print 10 barcode labels: CATAFLAM');
  assert.equal(I.translate('مرتجع شراء'), 'Purchase return');
  console.log('item-actions ok');
})().catch((e) => { console.error(e); process.exit(1); });
