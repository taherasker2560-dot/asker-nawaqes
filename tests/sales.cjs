// ar/sales.js helpers («حركة البيع», owner 2026-11-14): the periods, a line's value, the quantities in words, the times, the
// bars' labels, what a customer takes most.
const assert=require('node:assert/strict');
const L=require('../ar/sales.js');
const now=new Date(2026,10,14,13,20);
assert.deepEqual(L.range('today',now),{from:'2026-11-14T00:00:00',to:'2026-11-15T00:00:00'});
assert.deepEqual(L.range('yesterday',now),{from:'2026-11-13T00:00:00',to:'2026-11-14T00:00:00'});
assert.deepEqual(L.range('week',now),{from:'2026-11-08T00:00:00',to:'2026-11-15T00:00:00'},'the last 7 days with today');
assert.deepEqual(L.range('month',now),{from:'2026-11-01T00:00:00',to:'2026-11-15T00:00:00'});
assert.deepEqual(L.range('year',now),{from:'2025-11-14T00:00:00',to:'2026-11-15T00:00:00'},'365 days back');
assert.deepEqual(L.range('custom',now,{from:'2026-11-10',to:'2026-11-03'}),{from:'2026-11-03T00:00:00',to:'2026-11-11T00:00:00'},'either order, the last day included');
assert.deepEqual(L.range('custom',now,{from:'',to:''}),L.range('today',now),'nothing chosen yet: today');
// a line: (packs + units / units in a pack) × price of a pack − discount
assert.equal(L.lineValue({p:0,u:1,k:2,s:170,d:0}),85);
assert.equal(Math.round(L.lineValue({p:1,u:2,k:5,s:160,d:4})*100)/100,220);
assert.equal(L.lineValue({p:2,u:0,k:0,s:24}),48,'k missing = 1');
assert.equal(L.qtyText(2,1),'2 علبة + 1 وحدة');assert.equal(L.qtyText(5,0),'5 علب');assert.equal(L.qtyText(0,3),'3 وحدات');assert.equal(L.qtyText(0,0),'0');
assert.equal(L.money(18420),'18,420');assert.equal(L.money(-116.5),'-116.50');
assert.equal(L.whenText('2026-11-14T13:18:00',now),'النهارده 1:18 م');
assert.equal(L.whenText('2026-11-13T21:15:00',now),'امبارح 9:15 م');
assert.equal(L.whenText('2026-11-12T08:02:00',now),'12/11 8:02 ص');
assert.equal(L.barLabel('2026-11-14T09:00','hour'),'9:00 ص');assert.equal(L.barLabel('2026-11-14T00:00','day'),'14/11');assert.equal(L.barLabel('2026-11-01T00:00','month'),'11/2026');
const rows=[
 {kind:'sale',lines:[{i:1,n:'CONCOR 5',p:1,u:0},{i:2,n:'GLUCOPHAGE',p:2,u:0}]},
 {kind:'sale',lines:[{i:1,n:'CONCOR 5',p:1,u:0}]},
 {kind:'return',lines:[{i:3,n:'X',p:9,u:0}]},
 {kind:'sale',lines:[{i:2,n:'GLUCOPHAGE',p:1,u:0},{i:4,a:'لزق',p:0,u:3}]},
];
assert.deepEqual(L.topItems(rows,2).map(x=>[x.name,x.n,x.packs]),[['GLUCOPHAGE',2,3],['CONCOR 5',2,2]],'by invoices, then packs; returns left out');
assert.equal(L.topItems(rows,5).length,3);
console.log('PASS: sales helpers: periods, line value, quantities, times, bars, a customer\'s top items');
