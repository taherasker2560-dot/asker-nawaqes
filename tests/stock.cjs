// «المخزون» (ar/stock.js): how the stock is written on a card, the other stores apart, the data time, and the search.
const assert=require('node:assert/strict');
require('../ar/fuzzy.js');
const S=require('../ar/stock.js');
// packs and units (units only when the pack is split), Arabic counting with western digits
assert.equal(S.qtyText(5,1,2),'5 علب + 1 وحدة');
assert.equal(S.qtyText(1,1,2),'1 علبة + 1 وحدة');
assert.equal(S.qtyText(11,4,6),'11 علبة + 4 وحدات');
assert.equal(S.qtyText(2,0,1),'2 علبة');
assert.equal(S.qtyText(0,3,10),'3 وحدات');
assert.equal(S.qtyText('7','0',null),'7 علب');
assert.equal(S.qtyText(0,0,2),'مفيش');
assert.equal(S.qtyText(-1,'x',2),'مفيش','junk numbers are not shown');
assert.equal(S.qtyText(1.5,0,1),'1.5 علبة');
// expiry
assert.equal(S.expText('2028-08-01'),'أقرب صلاحية 08/2028');
assert.equal(S.expText(null),'من غير صلاحية متسجّلة');
// other stores: shown apart, empty ones dropped
assert.deepEqual(S.otherText([{store:'مخزن انتظار ابن سينا',packs:2,units:0},{store:'فاضي',packs:0,units:0}],1),['+ 2 علبة في مخزن انتظار ابن سينا']);
assert.deepEqual(S.otherText(null,1),[]);assert.deepEqual(S.otherText('x',1),[]);
// data time
const now=new Date(2026,10,9,22,30);
assert.equal(S.ageText('2026-11-09 20:00:00',now),'آخر رصيد: النهارده 8:00 م');
assert.equal(S.ageText('2026-11-08 09:05:00',now),'آخر رصيد: امبارح 9:05 ص');
assert.equal(S.ageText('2026-11-01 00:10:00',now),'آخر رصيد: 01/11 12:10 ص');
assert.equal(S.ageText('',now),'');
// search: Arabic or English, letters that sound alike, best first
const rows=[{item_id:1,name:'SELOKENZOC 50MG',arabic_name:'سيلوكين زوك ٥٠'},{item_id:2,name:'DUSPATALIN 200MG',arabic_name:'دوسباتالين ٢٠٠'},{item_id:3,name:'FAWAR FRUIT',arabic_name:null}];
assert.deepEqual(S.search('سيلوكين',rows).map(x=>x.item_id),[1]);
assert.deepEqual(S.search('duspa',rows).map(x=>x.item_id),[2]);
assert.deepEqual(S.search('دسبتالين',rows).map(x=>x.item_id),[2],'letters skipped still find it');
assert.deepEqual(S.search('fawar',rows).map(x=>x.item_id),[3]);
assert.deepEqual(S.search('zzzz',rows),[]);
console.log('stock ok');
