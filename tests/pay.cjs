// «💸 المدفوعات» (owner 2026-11-19): the pure helpers of ar/pay.js: the amount he types, an order's state in words, what needs his
// look (a difference / late) and what waits for his yes, the order of the open ones, the 30-day totals, the filters, the supplier search.
const assert = require('node:assert/strict');
const P = require('../ar/pay.js');
// the amount: Arabic digits, thousands, the Arabic decimal mark; two decimals at most
assert.equal(P.parseAmount('20,000'), 20000);
assert.equal(P.parseAmount('٢٠٠٠٠'), 20000);
assert.equal(P.parseAmount('1٫5'), 1.5);
assert.equal(P.parseAmount(' 535.65 '), 535.65);
assert.ok(Number.isNaN(P.parseAmount('')));
assert.ok(Number.isNaN(P.parseAmount('12.345')));
assert.ok(Number.isNaN(P.parseAmount('-5')));
assert.ok(Number.isNaN(P.parseAmount('abc')));
assert.equal(P.money(1563.65), '1,563.65');
assert.equal(P.money(45040), '45,040');
// states
const now = Date.parse('2026-11-19T12:00:00Z');
const ago = (h) => new Date(now - h * 3600e3).toISOString();
assert.equal(P.statusText({ status: 'waiting' }, now), 'مستني موافقتك');
assert.equal(P.statusText({ status: 'approved', approved_at: ago(1) }, now), 'اتوافق عليه: دخّله في فارمافلاي');
assert.equal(P.statusText({ status: 'approved', approved_at: ago(3) }, now), 'اتوافق من أكتر من ساعتين ولسه ما ظهرش في فارمافلاي');
assert.equal(P.statusText({ status: 'matched' }, now), '✓ ظهر في فارمافلاي وطابق');
assert.equal(P.statusText({ status: 'mismatch' }, now), 'فيه فرق');
assert.equal(P.statusText({ status: 'cancelled' }, now), 'اتلغى');
const O = [
  { id: 1, status: 'approved', approved_at: ago(1), created_at: ago(1) },
  { id: 2, status: 'waiting', created_at: ago(5) },
  { id: 3, status: 'mismatch', approved_at: ago(4), created_at: ago(4) },
  { id: 4, status: 'approved', approved_at: ago(3), created_at: ago(3) },
  { id: 5, status: 'matched', created_at: ago(0.5), move_id: 77 },
  { id: 6, status: 'cancelled', created_at: ago(0.2) },
  { id: 7, status: 'waiting', created_at: ago(0.1) },
];
assert.deepEqual(P.needs(O, now), { look: 2, wait: 2 }, 'a difference and a late one ring; two wait for his yes');
assert.deepEqual(P.openOrders(O, now).map((o) => o.id), [3, 4, 7, 2, 1], 'difference, late, waiting (newest first), approved');
assert.deepEqual(Object.keys(P.byMove(O)), ['77']);
// the totals of the last 30 days (PharmaFly's local time) and the filters
const pad = (n) => String(n).padStart(2, '0');
const loc = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const day = (n) => loc(new Date(now - n * 864e5));
const M = [
  { id: 1, account_id: 4, at: day(1), kind: 'vendor', amount: -27100 },
  { id: 2, account_id: 3, at: day(2), kind: 'vendor', amount: -37750 },
  { id: 3, account_id: 3, at: day(5), kind: 'expense', amount: -1963 },
  { id: 4, account_id: 4, at: day(40), kind: 'vendor', amount: -150000 },
  { id: 5, account_id: 1, at: day(1), kind: 'sales', amount: 900 },
  { id: 6, account_id: 4, at: day(3), kind: 'owner', amount: -20000, memo: 'طاهر' },
];
assert.deepEqual(P.totals(M, 30, now), { vendor: 64850, vendorN: 2, expense: 1963, expenseN: 1, owner: 20000, ownerN: 1 });
assert.deepEqual(M.filter((m) => P.keepMove(m, 'all', '')).map((m) => m.id), [1, 2, 3, 4, 6], 'sales are not payments; the owner is');
assert.deepEqual(M.filter((m) => P.keepMove(m, 'owner', '')).map((m) => m.id), [6]);
assert.deepEqual(M.filter((m) => P.keepMove(m, 'vendor', '')).map((m) => m.id), [1, 2, 4]);
assert.deepEqual(M.filter((m) => P.keepMove(m, 'expense', '')).map((m) => m.id), [3]);
assert.deepEqual(M.filter((m) => P.keepMove(m, 'all', '4')).map((m) => m.id), [1, 4, 6]);
assert.deepEqual(P.KINDS, ['vendor', 'expense', 'owner']);
// the time: PharmaFly's local time as written; a server time on the phone's clock
assert.equal(P.when('2026-11-18T20:00:46'), '18/11 20:00');
assert.equal(P.when(''), '');
// the supplier search: Arabic spellings, the short name, the active and biggest balance first
const V = [
  { id: 2374, name: 'A M group', short: 'AMG', balance: 124144.88, active: true },
  { id: 2540, name: 'مخزن الفتح للادوية', short: 'ELFT', balance: 66176.39, active: true },
  { id: 2495, name: 'IBN SINA 1', short: 'IBN', balance: 3471.51, active: true },
  { id: 188, name: 'IBN SINA 2', short: 'IBN', balance: 0, active: true },
  { id: 9, name: 'OLD ONE', short: 'OLD', balance: 999999, active: false },
];
assert.deepEqual(P.findVendors(V, '', 3).map((v) => v.id), [2374, 2540, 2495], 'no search: the active ones with the biggest balance');
assert.deepEqual(P.findVendors(V, 'ibn').map((v) => v.id), [2495, 188], 'both cards of the same short name show');
assert.deepEqual(P.findVendors(V, 'أدويه').map((v) => v.id), [2540], 'أ / ا and ة / ه are the same letter');
assert.deepEqual(P.findVendors(V, 'amg').map((v) => v.id), [2374]);
assert.equal(P.findVendors(V, 'old')[0].id, 9, 'a stopped card is still found by name');
// the server's refusals in words; anything else: a plain sentence
assert.equal(P.errText('taken'), 'الدفعة دي اتقفل بيها أمر تاني.');
assert.equal(P.errText('xyz'), 'مقدرتش أكمّل. جرّب تاني.');
console.log('pay ok');
