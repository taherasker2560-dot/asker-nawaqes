// «العمليات» (ar/ops.js): one list from the two tables, newest first, the status in words, only a waiting one can be cancelled.
const assert = require('node:assert/strict');
global.window = global;
const { merge, statusText, money } = require('../ar/ops.js') && global.AskerOpsLib;
const ops = [
  { id: 3, kind: 'customer_payment', party_id: 7, party_name: 'عميل تجربة', amount: '500.00', status: 'pending', created_at: '2026-11-15T10:00:00Z' },
  { id: 4, kind: 'vendor_payment', party_id: 9, party_name: null, amount: 12000, status: 'done', created_at: '2026-11-15T12:00:00Z' },
];
const sales = [
  { no: 21, kind: 'sale', customer_name: null, items: [{}, {}, {}], total: '301.00', status: 'pending', created_at: '2026-11-15T11:00:00Z' },
  { no: 22, kind: 'return', customer_name: 'عميل تاني', items: [{}], total: 30.5, status: 'cancelled', created_at: '2026-11-15T09:00:00Z' },
];
const m = merge(ops, sales);
assert.deepEqual(m.map((x) => x.key), ['op4', 'sale21', 'op3', 'sale22'], 'newest first');
assert.equal(m[0].text, 'دفعة لمورد: #9 · 12,000 ج');
assert.equal(m[1].text, 'بيعة رقم 21: نقدي · 3 صنف · 301 ج');
assert.equal(m[2].text, 'دفعة من عميل: عميل تجربة · 500 ج');
assert.equal(m[3].text, 'مرتجع رقم 22: عميل تاني · 1 صنف · 30.50 ج');
assert.deepEqual(m.map((x) => x.table), ['ar_ops', 'ar_temp_sales', 'ar_ops', 'ar_temp_sales']);
assert.deepEqual(['pending', 'running', 'done', 'failed', 'cancelled', 'entered', 'x'].map(statusText), ['مستنية', 'بتتنفذ', 'اتنفذت', 'فشلت', 'اتلغت', 'اتنفذت', 'x']);
assert.equal(money(0.001), '0'); assert.equal(money(1234.5), '1,234.50');
assert.deepEqual(merge(null, undefined), []);
// a purchase order chosen item by item
const b = merge([{ id: 10, kind: 'purchase_order', party_id: 2540, party_name: 'مخزن الفتح للادوية', items: [{ i: 1, q: 3 }, { i: 2, q: 1 }], status: 'pending', created_at: '2026-11-15T14:00:00Z' }], []);
assert.equal(b[0].text, 'أمر شرا لـ مخزن الفتح للادوية: 2 صنف');
console.log('PASS: ops list: both tables in one list, newest first, statuses in words');
