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
// the sticker's barcode itself: 1 + code (5) + expiry month + year (the owner's scan 1634760729 = code 63476, 07/2029)
assert.equal(T.stickerCode('1634760729',true),63476);assert.deepEqual(T.stickerRead('1634760729'),{code:63476,exp:'2029-07'});
assert.deepEqual(T.stickerRead('1010600328'),{code:1060,exp:'2028-03'});assert.deepEqual(T.stickerRead('101060'),{code:1060,exp:null});
assert.equal(T.stickerRead('1634761329'),null,'month 13: not a sticker');assert.equal(T.stickerRead('1634036085'),null,'the owner\'s misread (month 60)');
assert.equal(T.stickerRead('1634760799'),null,'year 2099: a misread');assert.equal(T.stickerRead('2634760729'),null);assert.equal(T.stickerRead('163476072'),null);
assert.equal(T.stickerCode('1634760729'),63476,'typed too');assert.equal(T.stickerCode('A101060',true),null);assert.equal(T.stickerCode(' 163070 ',true),63070);
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
// his account with this bill (owner 2026-11-13): before + the bill − paid = after; a return takes the bill off and adds
// what was given back in cash
assert.deepEqual(T.account({balance:250},'sale',274.7,100),{before:250,amount:274.7,paid:100,ret:false,after:424.7});
assert.deepEqual(T.account({balance:250},'return',54,0),{before:250,amount:54,paid:0,ret:true,after:196});
assert.equal(T.account({balance:250},'return',54,20).after,216);assert.equal(T.account(null,'sale',5,0),null);
assert.equal(T.balText(196),'196 ج');assert.equal(T.balText(-50.5),'له 50.50 ج');
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
// the main back camera: «camera2 0, facing back», not the wide / zoom lens or the front one
const cams=[{deviceId:'f',label:'camera2 1, facing front'},{deviceId:'w',label:'camera2 2, facing back'},{deviceId:'m',label:'camera2 0, facing back'},{deviceId:'z',label:'camera2 3, facing back'}];
assert.equal(T.mainBack(cams).deviceId,'m');
assert.equal(T.mainBack([{deviceId:'a',label:'Back Camera'},{deviceId:'b',label:'Front Camera'}]).deviceId,'a','another naming: the first back one');
assert.equal(T.mainBack([{deviceId:'x',label:''}]),null,'no names yet: the phone decides');
// the thin camera strip (7 : 2): the centre band of a tall phone picture, or the centre of a very wide one
assert.deepEqual(T.stripBox(1080,1920,3.5),{sx:0,sy:806,sw:1080,sh:309});
assert.deepEqual(T.stripBox(1920,1080,3.5),{sx:0,sy:266,sw:1920,sh:549});
assert.deepEqual(T.stripBox(4000,500,3.5),{sx:1125,sy:0,sw:1750,sh:500});
assert.equal(T.stripBox(0,0,3.5),null);
// the line's stock and expiry, as in PharmaFly's sale
const L=[];T.addItem(L,{item_id:7,name:'X',price:100,parts:3,packs:2,units:1,exp_near:'2028-03-28'});
assert.deepEqual([L[0].sp,L[0].su,L[0].exp],[2,1,'2028-03-28']);
assert.equal(T.overStock(L[0]),false);L[0].q=3;assert.equal(T.overStock(L[0]),true,'3 boxes > 2 boxes + 1 unit');
T.setUnit(L[0],'unit');L[0].q=7;assert.equal(T.overStock(L[0]),false,'7 units = 2×3 + 1');L[0].q=8;assert.equal(T.overStock(L[0]),true);
const now=new Date(2026,10,13);
assert.deepEqual(T.expInfo('2028-03-28',now),{text:'صلاحية 03/2028',soon:false,gone:false});
assert.equal(T.expInfo('2027-01-28',now).soon,true,'within 3 months');assert.equal(T.expInfo('2026-11-28',now).gone,true);
assert.equal(T.expInfo(null,now),null,'no expiry in PharmaFly: nothing shown');
console.log('PASS: temp sale: sticker = 100000 + code, box/unit prices, the bill, the limit, the row, the list');
