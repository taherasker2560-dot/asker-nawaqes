// «الخزن» (ar/cash.js, owner 2026-11-15): the pure part. A move's words, the filters, the balance after each move counted back from
// the balance now, the days, today's in and out, the total.
const assert = require('node:assert/strict');
global.window = global;
const C = require('../ar/cash.js');

// money: no decimals when whole, two when not; a real minus sign in the signed form
assert.equal(C.money(1234.5), '1,234.50');
assert.equal(C.money(2150), '2,150');
assert.equal(C.money(-0.001), '0');
assert.equal(C.signed(150), '+150');
assert.equal(C.signed(-8800), '−8,800');
assert.equal(C.signed(0), '0');

// what a move is
assert.deepEqual(C.label({ kind: 'sales', n: 312 }), { word: 'مبيعات نقدي', who: '', small: '312 بيعة' });
assert.deepEqual(C.label({ kind: 'customer', who: 'أحمد مسعود' }), { word: 'تحصيل من عميل', who: 'أحمد مسعود', small: '' });
assert.deepEqual(C.label({ kind: 'vendor', who: 'مخزن الفتح للادوية' }).word, 'دفعة لمورد');
// PharmaFly's op 51 = the owner (2026-11-19), with his note («طاهر», «ام طاهر») under it
assert.deepEqual(C.label({ kind: 'owner', op: 51, memo: 'ام طاهر' }), { word: 'لصاحب المنشأة', who: '', small: 'ام طاهر' });
// op 50 is «دعم من صاحب المنشأة» (his name for it, 2026-11-19): no «رقم 50» any more; another unnamed one keeps its number
assert.deepEqual(C.label({ kind: 'other_in', op: 50, memo: 'كريدت المشرق' }), { word: 'دعم من صاحب المنشأة', who: '', small: 'كريدت المشرق' });
assert.deepEqual(C.label({ kind: 'other_in', op: 8 }), { word: 'حركة داخلة', who: '', small: 'رقم 8' });
assert.deepEqual(C.label({ kind: 'transfer_out', who: 'احتياطى 2' }), { word: 'تحويل لخزنة', who: 'احتياطى 2', small: '' });
assert.equal(C.label({ kind: 'transfer_in' }).word, 'تحويل من خزنة');
assert.equal(C.label({ kind: 'drawer_out' }).word, 'تسليم الدرج للخزينة');
assert.deepEqual(C.label({ kind: 'expense', who: 'مرتبات و اجور', memo: 'مرتب طارق' }), { word: 'مصروف', who: 'مرتبات و اجور', small: 'مرتب طارق' });
// an operation nobody named is shown as «حركة داخلة / خارجة» with its number, never guessed
assert.deepEqual(C.label({ kind: 'other_out', op: 51 }), { word: 'حركة خارجة', who: '', small: 'رقم 51' });
assert.equal(C.label({ kind: 'nothing' }).word, 'حركة');

// the filters
const M = [
  { id: 5, account_id: 2, at: '2026-11-15T10:00:00', kind: 'customer', amount: 150 },
  { id: 4, account_id: 2, at: '2026-11-15T09:00:00', kind: 'expense', amount: -300 },
  { id: 3, account_id: 2, at: '2026-11-14T23:40:31', kind: 'transfer_out', amount: -8800 },
  { id: 2, account_id: 2, at: '2026-11-14T23:40:04', kind: 'drawer_in', amount: 8920 },
  { id: -2026111401, account_id: 2, at: '2026-11-14T20:00:00', kind: 'sales', amount: 1000, n: 50 },
];
const ids = (f) => M.filter((m) => C.keep(m, f)).map((m) => m.id);
assert.deepEqual(ids('all'), [5, 4, 3, 2, -2026111401]);
assert.deepEqual(ids('in'), [5, 2, -2026111401]);
assert.deepEqual(ids('out'), [4, 3]);
assert.deepEqual(ids('sales'), [-2026111401]);
assert.deepEqual(ids('transfer'), [3, 2], 'a transfer between boxes and the drawer handover');
assert.deepEqual(ids('expense'), [4]);

// the balance after each move: counted back from the balance now, newest first, whatever order the moves arrive in
const w = C.withBalance([...M].reverse(), 580);
assert.deepEqual(w.map((m) => m.id), [5, 4, 3, 2, -2026111401]);
assert.deepEqual(w.map((m) => m.after), [580, 430, 730, 9530, 610]);
assert.equal(w[0].after - 150, 430, 'before the newest move the box held 430');

// by day, newest first, with the day's net
const days = C.byDay(w);
assert.deepEqual(days.map((d) => d.day), ['2026-11-15', '2026-11-14']);
assert.deepEqual(days.map((d) => d.net), [-150, 1120]);
assert.deepEqual(days[1].moves.map((m) => m.id), [3, 2, -2026111401]);

// today's in and out of every box
assert.deepEqual(C.todayTotals([{ account_id: 1, amount: 100 }, { account_id: 1, amount: -30 }, { account_id: 2, amount: -5 }]), { 1: { in: 100, out: 30 }, 2: { in: 0, out: 5 } });
assert.equal(C.sumBalance([{ balance: 2150 }, { balance: 580 }, { balance: -10000 }]), -7270);
assert.equal(C.sumBalance(null), 0);

// the day's title and clock
const now = new Date(2026, 10, 15, 14, 0, 0);
assert.equal(C.dayTitle('2026-11-15', now), 'النهارده');
assert.equal(C.dayTitle('2026-11-14', now), 'امبارح');
assert.equal(C.dayTitle('2026-11-01', now), '01/11/2026');
assert.equal(C.clock('2026-11-15T14:07:29'), '14:07');
assert.equal(C.clock(null), '');
console.log('cash: ok');
