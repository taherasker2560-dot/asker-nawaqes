// «📄 فواتير المندوبين» (ar/rep-invoices.js, owner 2026-11-16): the pure part. The laptop's file, the chips of a line, the arithmetic and account lines, which
// invoices need a look. Made-up warehouse and items only (the repo is public).
const assert = require('node:assert/strict');
global.window = global;
const R = require('../ar/rep-invoices.js');

const line = (o) => ({ n: 'صنف تجربة', qty: 1, price: 100, disc: 20, total: 80, item: { id: 5, name: 'TEST ITEM 10TAB' }, usual: 20, pf_price: 100, flags: [], ...o });
const inv = (o) => ({
  id: 'a1', inv_no: '5001', date: '15/11/2026', warehouse: 'مخزن تجربة', received_at: '2026-11-15T22:00:00Z', vendor: { id: 9, name: 'تجربة' },
  page: 1, pages: 1, lines: [line({})], totals: { retail: 100, previous: 1000, net: 80, total: 1080, paid: 0, balance: 1080 },
  math: { lines_bad: [], sum_ok: true, chain_ok: true, balance_ok: true }, orders_known: false, missing: [], account: null, ...o,
});
const FILE = { generated_at: '2026-11-16T01:00:00Z', invoices: [inv({}), { inv_no: '', lines: [] }, null, { inv_no: '7', lines: 'x' }] };
const d = R.parse(FILE);
assert.equal(d.invoices.length, 1, 'a row with no number or no lines is dropped');
assert.deepEqual([d.invoices[0].invNo, d.invoices[0].vendor, d.invoices[0].lines.length, d.invoices[0].totals.net], ['5001', 'تجربة', 1, 80]);
assert.equal(d.invoices[0].lines[0].item.name, 'TEST ITEM 10TAB');
assert.equal(R.parse(null), null);
assert.equal(R.parse({}), null);
assert.equal(R.parse({ invoices: 'x' }), null, 'anything that is not the laptop\'s file is no data');
assert.deepEqual(R.parse({ invoices: [] }).invoices, []);
// a line with no match has no item and no usual discount
const nm = R.parse({ invoices: [inv({ lines: [line({ item: null, usual: null, pf_price: null, flags: ['no_match'] })] })] }).invoices[0].lines[0];
assert.deepEqual([nm.item, nm.usual, nm.pf], [null, null, null]);

// numbers
assert.equal(R.money(1234.5), '1,234.50');
assert.equal(R.money(538.4), '538.40');
assert.equal(R.money(1297), '1,297');
assert.equal(R.money('x'), '0');

// the chips of a line
const L = (o) => R.parse({ invoices: [inv({ lines: [line(o)] })] }).invoices[0].lines[0];
assert.deepEqual(R.chips(L({ flags: [] })), [], 'nothing found = no chip (the page draws a ✓)');
assert.deepEqual(R.chips(L({ disc: 15, usual: 22, flags: ['disc_low'] })), [['خصم أقل: 15% وآخر مرة 22%', 'warn']]);
assert.deepEqual(R.chips(L({ disc: 29, usual: 20, flags: ['disc_high'] })), [['خصم أعلى: 29% وآخر مرة 20%', 'good']]);
assert.deepEqual(R.chips(L({ price: 52, pf_price: 55.5, flags: ['price'] })), [['السعر 52 وفي فارمافلاي 55.5', 'warn']]);
assert.deepEqual(R.chips(L({ flags: ['not_ordered', 'new_here', 'no_match', 'bad_math'] })).map((c) => c[1]), ['warn', 'gray', 'gray', 'bad']);
assert.deepEqual(R.chips(L({ flags: ['something_new'] })), [], 'a flag this page does not know says nothing');

// the arithmetic of the paper
const ok = d.invoices[0];
assert.deepEqual(R.mathIssues(ok), []);
const wrong = R.parse({ invoices: [inv({ math: { lines_bad: [1, 3], sum_ok: false, chain_ok: false, balance_ok: false } })] }).invoices[0];
assert.deepEqual(R.mathIssues(wrong), ['2 سطر حسابه مش مظبوط', 'مجموع السطور مش بيساوي الصافي', 'الحساب السابق + الصافي مش بيساوي الإجمالي', 'الرصيد الحالي مش بيساوي الإجمالي − المسدد']);

// the account lines
const acc = (o) => R.parse({ invoices: [inv({ account: { theirs: 33053.27, ours: 28460.11, unentered: ['109524', '107662'], unentered_net: 1297.78, unexplained: 3295.38, ...o } })] }).invoices[0].account;
assert.deepEqual(R.accountLines(acc({})), [
  ['الحساب: عندهم 33,053.27 وعندك 28,460.11', 'gray'],
  ['فواتير لسه ما اتدخلتش عندك: 109524, 107662 (1,297.78)', 'gray'],
  ['الفرق اللي مش مفسّر: عندهم أكتر منك بـ 3,295.38', 'warn'],
]);
assert.deepEqual(R.accountLines(acc({ unentered: [], unentered_net: 0, unexplained: 0.4 })).map((c) => c[0]), ['الحساب: عندهم 33,053.27 وعندك 28,460.11', '✓ الحساب مطابق']);
assert.equal(R.accountLines(acc({ unexplained: -120.5 }))[2][0], 'الفرق اللي مش مفسّر: عندك أكتر منهم بـ 120.50');
assert.deepEqual(R.accountLines(null), []);

// which invoices need a look: a flagged line, a wrong paper, an account that does not close (a «no match» or «new here» alone is only information)
const need = (o) => R.needsLook(R.parse({ invoices: [inv(o)] }).invoices[0]);
assert.equal(need({}), false);
assert.equal(need({ lines: [line({ flags: ['no_match', 'new_here', 'disc_high'] })] }), false);
assert.equal(need({ lines: [line({ flags: ['disc_low'] })] }), true);
assert.equal(need({ lines: [line({ flags: ['not_ordered'] })] }), true);
assert.equal(need({ math: { lines_bad: [], sum_ok: false, chain_ok: true, balance_ok: true } }), true);
assert.equal(need({ account: { theirs: 10, ours: 5, unentered: [], unentered_net: 0, unexplained: 5 } }), true);
assert.equal(need({ account: { theirs: 10, ours: 10, unentered: [], unentered_net: 0, unexplained: 0.5 } }), false);

// the invoices shown: the last 7 days, newest first; the home counts the last two days that need a look
const NOW = new Date('2026-11-16T12:00:00Z');
const many = R.parse({ invoices: [
  inv({ id: 'old', received_at: '2026-11-05T10:00:00Z' }),
  inv({ id: 'mid', received_at: '2026-11-12T10:00:00Z', lines: [line({ flags: ['disc_low'] })] }),
  inv({ id: 'new', received_at: '2026-11-16T01:00:00Z', lines: [line({ flags: ['price'] })] }),
  inv({ id: 'new2', received_at: '2026-11-15T20:00:00Z' }),
] });
assert.deepEqual(R.recent(many, NOW).map((x) => x.id), ['new', 'new2', 'mid'], 'newest first, older than 7 days dropped');
assert.equal(R.freshLook(many, NOW), 1, 'only the last two days, only the ones that need a look');
assert.equal(R.freshLook(null, NOW), 0);
// a file the laptop stopped updating
assert.equal(R.isOld('2026-11-16T01:00:00Z', NOW), false);
assert.equal(R.isOld('2026-11-12T01:00:00Z', NOW), true);
assert.equal(R.isOld('', NOW), true);
// the time shown is the phone's own: day/month and hour:minute
const t0 = new Date(2026, 10, 16, 1, 20);
assert.equal(R.when(t0.toISOString()), '16/11 01:20');
assert.equal(R.when('junk'), '');
console.log('PASS: rep-invoices: the file, the chips, the arithmetic and account lines, who needs a look');
