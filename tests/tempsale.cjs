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
// the bill: a tap adds one box, the same item again = one more; two boxes per line: boxes (q) and units (w)
const lines=[];
T.addItem(lines,{item_id:1060,name:'ITEM ONE 14TAB',arabic_name:'صنف واحد',price:210,parts:2});
T.addItem(lines,{item_id:1060,name:'ITEM ONE 14TAB',price:210,parts:2});
T.addItem(lines,{item_id:4875,name:'CREAM SMALL',price:20,parts:1});
assert.deepEqual(lines.map(l=>[l.c,l.q,l.w,l.p,l.pu]),[[1060,2,0,210,105],[4875,1,0,20,20]]);
assert.equal(T.total(lines),440);
T.setQty(lines[0],'w',1);assert.equal(T.total(lines),545,'2 boxes + 1 unit');
T.setQty(lines[0],'q',0);assert.equal(T.total(lines),125,'units only');
T.setQty(lines[0],'w',0);assert.equal(lines[0].w,1,'never both boxes: a line that sells nothing');
T.setQty(lines[0],'w',2);assert.equal(T.total(lines),230,'2 units = one box\'s price');
T.setQty(lines[1],'w',3);assert.equal(lines[1].w,0,'a box that does not split has no units');
T.setQty(lines[1],'q',0);assert.equal(lines[1].q,1,'never both 0');
T.setQty(lines[1],'q','abc');assert.equal(lines[1].q,1,'a typed non-number changes nothing');
T.setQty(lines[1],'q',2.9);assert.equal(lines[1].q,2,'whole boxes only');T.setQty(lines[1],'q',1);
// the same item with ANOTHER expiry is another line (each batch its own quantity); the same expiry again = one more box
const xs=[];
T.addItem(xs,{item_id:7,name:'X',price:100,parts:3},'2028-03');T.addItem(xs,{item_id:7,name:'X',price:100,parts:3},'2029-01');T.addItem(xs,{item_id:7,name:'X',price:100,parts:3},'2028-03');
assert.deepEqual(xs.map(l=>[l.c,l.x,l.q]),[[7,'2028-03',2],[7,'2029-01',1]]);
assert.deepEqual(T.sellable([{x:'2028-03',k:2,u:0},{x:'2027-01',k:0,u:2},{x:'2029-01',k:-1,u:0},{x:null,k:5,u:0},{x:'2030-01',k:0,u:0}],3).map(b=>b.x),['2027-01','2028-03'],'only batches with stock, oldest first; a negative one, an empty one and a dateless one are not offered');
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
 items:[{c:1060,n:'ITEM ONE 14TAB',q:2,u:'unit',p:105},{c:4875,n:'CREAM SMALL',q:1,u:'pack',p:20}],total:230,adjust:null,paid:50,note:'بعد الضهر',status:'pending'});
// «الفكة» (owner 2026-11-13): round down / up to 5 pounds; the row keeps the amount and asks for the total after it
assert.deepEqual(T.roundOptions(274.7),[{to:270,adj:-4.7},{to:275,adj:0.3}]);
assert.deepEqual(T.roundOptions(270),[]);assert.deepEqual(T.roundOptions(3.5),[{to:5,adj:1.5}],'never down to zero');
const off=T.record({id:'o',soldAt:'t',lines,customer:null,paid:'',note:'',adjust:-5});assert.equal(off.total,225);assert.equal(off.adjust,-5);
assert.equal(T.due(lines,0.5),230.5);
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
// the line's stock, as in PharmaFly's sale: the whole item's, or the chosen expiry's batch
const L=[];T.addItem(L,{item_id:7,name:'X',price:100,parts:3,packs:2,units:1});
assert.deepEqual([L[0].sp,L[0].su,L[0].x],[2,1,null],'no expiry is taken for him');
assert.equal(T.overStock(L[0]),false);L[0].q=3;assert.equal(T.overStock(L[0]),true,'3 boxes > 2 boxes + 1 unit');
L[0].q=2;L[0].w=1;assert.equal(T.overStock(L[0]),false,'2 boxes + 1 unit = all of it');L[0].w=2;assert.equal(T.overStock(L[0]),true);
L[0].q=0;L[0].w=7;assert.equal(T.overStock(L[0]),false,'7 units = 2×3 + 1');L[0].w=8;assert.equal(T.overStock(L[0]),true);
L[0].bs={k:1,u:0};L[0].q=1;L[0].w=0;assert.equal(T.overStock(L[0]),false,'the chosen batch has 1 box');L[0].w=1;assert.equal(T.overStock(L[0]),true,'more than that batch holds, though the item has more in other batches');
const now=new Date(2026,10,13);
assert.deepEqual(T.expInfo('2028-03-28',now),{text:'صلاحية 03/2028',soon:false,gone:false});
assert.equal(T.expInfo('2027-01-28',now).soon,true,'within 3 months');assert.equal(T.expInfo('2026-11-28',now).gone,true);
assert.equal(T.expInfo(null,now),null,'no expiry in PharmaFly: nothing shown');
// a line with boxes AND units goes to the server as two entries (everything that reads {c,n,q,u,p} keeps working); the chosen expiry rides on both
const both=[];T.addItem(both,{item_id:7,name:'X',price:100,parts:3},'2028-03');T.setQty(both[0],'w',2);
T.addItem(both,{item_id:8,name:'Y',price:20,parts:1});
assert.equal(T.total(both),100+66.66+20);
assert.deepEqual(T.record({id:'b',soldAt:'t',lines:both,customer:null,paid:'',note:''}).items,[{c:7,n:'X',q:1,u:'pack',p:100,x:'2028-03'},{c:7,n:'X',q:2,u:'unit',p:33.33,x:'2028-03'},{c:8,n:'Y',q:1,u:'pack',p:20}]);
// up to 3 bills kept on the phone, made safe when read back
const cb=T.cleanBills({cur:5,bills:[{kind:'return',cart:[{c:1,n:'A',q:2,p:10,k:2,base:10},{c:'bad'}],cust:{id:3,name:'م'},paid:5,note:'n',adj:-2},{cart:'x'},null]});
assert.equal(cb.bills.length,1);assert.equal(cb.cur,0,'the open bill is brought into range');assert.equal(cb.bills[0].kind,'return');
assert.deepEqual(cb.bills[0].cart.map(l=>[l.c,l.q,l.w,l.p,l.pu,l.x]),[[1,2,0,10,5,null]],'a broken line is dropped, the unit price is made');assert.equal(cb.bills[0].cust.id,3);assert.equal(cb.bills[0].paid,'5');assert.equal(cb.bills[0].adj,-2);
assert.deepEqual(T.cleanBills(null),{cur:0,bills:[T.blankBill()]},'nothing kept: one empty bill');
const four=T.cleanBills({cur:2,bills:[1,2,3,4].map(()=>({cart:[]}))});assert.equal(four.bills.length,T.MAX_BILLS);assert.equal(T.MAX_BILLS,3);assert.equal(four.cur,2);
assert.equal(T.cleanBills({bills:[{cart:[{c:1,q:0,w:0,p:5}]}]}).bills[0].cart.length,0,'a line that sells nothing is dropped');
console.log('PASS: temp sale: sticker = 100000 + code, boxes + units, expiry lines, the bill, the limit, the row, the bills, the list');
