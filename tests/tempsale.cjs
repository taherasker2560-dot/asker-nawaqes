// «البيع المؤقت» helpers (ar/tempsale.js): the PharmaFly sticker number, prices per box / unit, the bill, the customer's
// limit, the row sent to ar_temp_sales and the list. Made-up items and customers only: the repository is public.
const assert=require('node:assert/strict');
const T=require('../ar/tempsale.js');
// a PharmaFly sticker = 100000 + the item's code (101060 = 1060); a typed code stays a code; Arabic digits too
assert.equal(T.stickerCode('101060'),1060);assert.equal(T.stickerCode('163070'),63070);assert.equal(T.stickerCode(' 104875\n'),4875);
assert.equal(T.stickerCode('١٠١٠٦٠'),1060);assert.equal(T.stickerCode('1060'),1060);assert.equal(T.stickerCode('70595'),70595);
assert.equal(T.stickerCode('6221234567890'),null,'a factory barcode is not a sticker');assert.equal(T.stickerCode(''),null);assert.equal(T.stickerCode('100000'),null);assert.equal(T.stickerCode('abc'),null);
// from the camera only a whole sticker number counts: a short or long reading is never taken as a code
assert.equal(T.stickerCode('101060',true),1060);assert.equal(T.stickerCode('9493',true),null);assert.equal(T.stickerCode('69423',true),null);
assert.equal(T.stickerCode('1010600328',true),null);assert.equal(T.stickerCode('A101060',true),null);assert.equal(T.stickerCode(' 163070 ',true),63070);
// price of one box, or one unit when the box splits
assert.equal(T.priceOf(66.7,1,'unit'),66.7,'a box that does not split');assert.equal(T.priceOf(108,2,'unit'),54);assert.equal(T.priceOf(100,3,'unit'),33.33);assert.equal(T.priceOf(100,3,'pack'),100);
// the bill: a tap adds one box, the same item again = one more; a unit changes the price
const lines=[];
T.addItem(lines,{item_id:1060,name:'ITEM ONE 14TAB',arabic_name:'صنف واحد',price:210,parts:2});
T.addItem(lines,{item_id:1060,name:'ITEM ONE 14TAB',price:210,parts:2});
T.addItem(lines,{item_id:4875,name:'CREAM SMALL',price:20,parts:1});
assert.deepEqual(lines.map(l=>[l.c,l.q,l.u,l.p]),[[1060,2,'pack',210],[4875,1,'pack',20]]);
assert.equal(T.total(lines),440);
T.setUnit(lines[0],'unit');assert.equal(lines[0].p,105);assert.equal(T.total(lines),230);
T.setUnit(lines[1],'unit');assert.equal(lines[1].u,'pack','a box that does not split stays a box');
// the customer's limit: balance + this sale − what he paid, above the limit on his card
const c={id:101,name:'عميل تجربة',credit_limit:5000,balance:4900};
assert.deepEqual(T.overLimit(c,230,0),{bal:4900,lim:5000,after:5130});
assert.equal(T.overLimit(c,230,200),null,'paid enough: no warning');
assert.equal(T.overLimit({...c,credit_limit:0},99999,0),null,'no limit on the card');assert.equal(T.overLimit(null,500,0),null);
// the row sent to the server
const rec=T.record({id:'00000000-0000-4000-8000-000000000001',soldAt:'2026-11-12T19:42:00.000Z',lines,customer:c,paid:'50',note:'  بعد الضهر '});
assert.deepEqual(rec,{id:'00000000-0000-4000-8000-000000000001',sold_at:'2026-11-12T19:42:00.000Z',kind:'sale',customer_id:101,customer_name:'عميل تجربة',
 items:[{c:1060,n:'ITEM ONE 14TAB',q:2,u:'unit',p:105},{c:4875,n:'CREAM SMALL',q:1,u:'pack',p:20}],total:230,paid:50,note:'بعد الضهر',status:'pending'});
// a return (مرتجع): its own bill; paid = what was given back (also to a cash customer)
const back=T.record({id:'r',soldAt:'t',lines,customer:null,paid:'20',note:'',kind:'return'});assert.equal(back.kind,'return');assert.equal(back.total,230);assert.equal(back.paid,20);
const cash=T.record({id:'x',soldAt:'t',lines,customer:null,paid:'40',note:''});assert.equal(cash.customer_id,null);assert.equal(cash.paid,null,'cash: no paid part');assert.equal(cash.note,null);
// words and money
assert.equal(T.qtyText(1,'pack'),'1 علبة');assert.equal(T.qtyText(3,'pack'),'3 علب');assert.equal(T.qtyText(4,'unit'),'4 وحدات');assert.equal(T.qtyText(12,'unit'),'12 وحدة');
assert.equal(T.countText(1),'صنف واحد');assert.equal(T.countText(2),'صنفين');assert.equal(T.countText(5),'5 أصناف');assert.equal(T.countText(14),'14 صنف');
assert.equal(T.money(274.7),'274.70 ج');assert.equal(T.money(1500),'1,500 ج');
// the list: what is still on the phone first and once, newest first
const m=T.merged([{id:'a',sold_at:'2026-11-12T10:00:00Z',status:'entered'},{id:'b',sold_at:'2026-11-12T12:00:00Z',status:'pending'}],[{id:'b',sold_at:'2026-11-12T12:00:00Z'},{id:'c',sold_at:'2026-11-12T13:00:00Z'}]);
assert.deepEqual(m.map(x=>[x.id,!!x.queued]),[['c',true],['b',true],['a',false]]);
console.log('PASS: temp sale: sticker = 100000 + code, box/unit prices, the bill, the limit, the row, the list');
