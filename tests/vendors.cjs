// ar/vendors.js helpers («الموردين», owner 2026-11-14): the balance in words, the default range and the server's times, a
// purchase line's quantity and value, the expiry, this year's suppliers and the totals.
const assert=require('node:assert/strict');
const V=require('../ar/vendors.js');
const now=new Date(2026,10,14,15,0);
assert.deepEqual(V.balanceText(96422.75),{cls:'owe',text:'96,422.75'});
assert.deepEqual(V.balanceText(-11702.28),{cls:'ok',text:'لينا 11,702.28'});
assert.deepEqual(V.balanceText(0.3),{cls:'zero',text:'خالص'});
assert.deepEqual(V.defaultRange(now),{from:'2026-10-01',to:'2026-11-14'},'from the first of last month to today');
assert.deepEqual(V.defaultRange(new Date(2026,0,10)),{from:'2025-12-01',to:'2026-01-10'});
assert.deepEqual(V.rangeArgs({from:'2026-10-01',to:'2026-11-14'}),{from:'2026-10-01T00:00:00',to:'2026-11-15T00:00:00'});
assert.deepEqual(V.rangeArgs({from:'2026-11-14',to:'2026-10-01'}),{from:'2026-10-01T00:00:00',to:'2026-11-15T00:00:00'},'either order');
assert.equal(V.rangeArgs({from:'',to:'2026-11-14'}),null);
// the dates kept on the phone (2026-11-19: an «until» saved as a fixed day froze there and hid the 3,500 invoice of 15/11): «until today» stays today
const later=new Date(2026,10,19,9,0);
assert.deepEqual(V.saveRange({from:'2026-10-01',to:'2026-11-14'},now),{from:'2026-10-01',to:'2026-11-14',open:true},'until today when saved');
assert.deepEqual(V.saveRange({from:'2026-10-01',to:'2026-11-14'},later),{from:'2026-10-01',to:'2026-11-14',open:false},'a past day picked on purpose');
assert.deepEqual(V.restoreRange({from:'2026-10-01',to:'2026-11-14',open:true},later),{from:'2026-10-01',to:'2026-11-19'},'follows today');
assert.deepEqual(V.restoreRange({from:'2026-10-01',to:'2026-11-14'},later),{from:'2026-10-01',to:'2026-11-19'},'an old save has no mark: until today');
assert.deepEqual(V.restoreRange({from:'2026-10-01',to:'2026-10-20',open:false},later),{from:'2026-10-01',to:'2026-10-20'},'a chosen past day stays');
assert.equal(V.restoreRange(null,later),null);assert.equal(V.restoreRange({from:'2026-10-01'},later),null);
// a supplier's last invoice after the dates shown is announced
const rama={last_invoice_at:'2026-11-15 18:25:55'};
assert.equal(V.lateInvoice(rama,{from:'2026-10-01',to:'2026-11-14'}),'2026-11-15');
assert.equal(V.lateInvoice(rama,{from:'2026-11-14',to:'2026-10-01'}),'2026-11-15','either order');
assert.equal(V.lateInvoice(rama,{from:'2026-10-01',to:'2026-11-15'}),null,'the day itself is inside');
assert.equal(V.lateInvoice({last_invoice_at:null},{from:'2026-10-01',to:'2026-11-14'}),null);
assert.equal(V.lateInvoice(null,{from:'2026-10-01',to:'2026-11-14'}),null);
assert.equal(V.qtyText({p:10,u:0,b:1}),'10 + 1 بونص');assert.equal(V.qtyText({p:0,u:2,b:0}),'2 وحدة');assert.equal(V.qtyText({p:3,u:1}),'3 + 1 وحدة');
assert.equal(Math.round(V.lineValue({p:10,u:0,k:1,c:8.71})*100)/100,87.1);assert.equal(V.lineValue({p:1,u:2,k:4,c:100}),150);
assert.equal(V.expText('2029-03-28'),'03/2029');assert.equal(V.expText(null),'—');
assert.equal(V.dayText('2026-11-14T10:00:00',now),'النهارده');assert.equal(V.dayText('2026-11-13T22:00:00',now),'امبارح');assert.equal(V.dayText('2026-10-05T10:00:00',now),'05/10/2026');
const list=[
 {id:1,name:'A',balance:100,last_invoice_at:'2026-11-01T10:00:00'},
 {id:2,name:'B',balance:0,last_invoice_at:'2024-01-01T10:00:00',last_payment_at:'2024-02-01T10:00:00'},   // old and settled
 {id:3,name:'C',balance:-50,last_invoice_at:'2023-01-01T10:00:00'},                                       // old but they owe us
 {id:4,name:'D',balance:900,last_invoice_at:'2026-10-01T10:00:00'},
 {id:5,name:'E',balance:0,last_payment_at:'2026-06-01T10:00:00'},                                         // a payment this year
];
assert.deepEqual(V.pickVendors(list,'year',now).map(v=>v.id),[4,1,5,3],'this year or a balance; biggest balance first');
assert.deepEqual(V.pickVendors(list,'all',now).map(v=>v.id),[4,1,2,5,3]);
assert.deepEqual(V.totals(list,now),{owed:1000,year:2});
console.log('PASS: vendors helpers: balance words, ranges, quantities and values, expiry, this year\'s suppliers, totals');
