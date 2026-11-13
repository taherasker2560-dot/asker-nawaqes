// Store site helpers (store/store.js): search words, the PostgREST filter, phone numbers, the cart, and error words
// that match the codes ar_store_place_order returns.
const assert=require('node:assert/strict');
const S=require('../store/store.js');

// search words: letters and digits only (no commas or brackets that could break the filter), 2+ letters, max 5
assert.deepEqual(S.searchTerms('  Panadol  extra '),['Panadol','extra']);
assert.deepEqual(S.searchTerms('بانادول'),['بانادول']);
assert.deepEqual(S.searchTerms('أوجمنتين'),['اوجمنتين'],'hamza forms read as ا');
assert.deepEqual(S.searchTerms('a,b),(c*d'),[],'single letters and symbols dropped');
assert.deepEqual(S.searchTerms('zithro,500)'),['zithro','500']);
assert.deepEqual(S.searchTerms('a b c d e f g h ii jj kk ll mm nn'),['ii','jj','kk','ll','mm']);
assert.deepEqual(S.searchTerms('vit vit'),['vit'],'no repeats');
assert.deepEqual(S.searchTerms(''),[]);
assert.equal(S.termFilter('panadol'),'name.ilike.*panadol*,arabic_name.ilike.*panadol*');
assert.equal(S.termFilter('اوجمنتين'),'name.ilike.*_وجمنتين*,arabic_name.ilike.*_وجمنتين*','ا matches أ / إ / ا');

// phone
assert.equal(S.normPhone('01012345678'),'01012345678');
assert.equal(S.normPhone('+20 101 234 5678'),'01012345678');
assert.equal(S.normPhone('٠١٠١٢٣٤٥٦٧٨'),'01012345678','Arabic digits');
assert.equal(S.normPhone('0101234567'),null);
assert.equal(S.normPhone('02123456789'),null);

// money and what can go in the cart
assert.equal(S.money(91.5),'91.5');assert.equal(S.money(1234),'1,234');assert.equal(S.money('x'),'');
assert.equal(S.canAdd({status:'available',price:75,needs_rx:false}),true);
assert.equal(S.canAdd({status:'available',price:null,needs_rx:false}),false,'no price');
assert.equal(S.canAdd({status:'on_order',price:null,needs_rx:false}),true,'on order: asked for, priced on the order day');
assert.equal(S.canAdd({status:'on_order',price:null,needs_rx:true}),false,'on order but prescription');
assert.equal(S.canAdd({status:'unavailable',price:null,needs_rx:false}),false,'on the shortages list: «غير متوفر», not ordered (owner 2026-11-12)');
assert.equal(S.canAdd({status:'unavailable',price:null,needs_rx:true}),false,'but not a prescription item');
assert.equal(S.onOrder({status:'unavailable'}),false);assert.equal(S.STATUS.unavailable.label,'غير متوفر');
{let o=S.cartAdd([],{id:7,name:'L',status:'on_order',price:null});o=S.cartAdd(o,{id:8,name:'M',status:'available',price:4});
 assert.equal(o[0].price,null);assert.equal(o[0].on_order,true);assert.equal(o[1].on_order,undefined);assert.equal(S.cartTotal(o),4,'on-order lines add nothing to the total');assert.equal(S.cartLater(o),1);}
assert.equal(S.canAdd({status:'available',price:75,needs_rx:true}),false,'prescription');

// cart: add, add again, change, remove, limits
let c=S.cartAdd([],{id:1,name:'A',price:10});
c=S.cartAdd(c,{id:1,name:'A',price:10});
c=S.cartAdd(c,{id:2,name:'B',arabic_name:'ب',price:2.5});
assert.deepEqual(c,[{id:1,name:'A',arabic_name:null,price:10,qty:2},{id:2,name:'B',arabic_name:'ب',price:2.5,qty:1}]);
assert.equal(S.cartCount(c),3);assert.equal(S.cartTotal(c),22.5);
c=S.cartSet(c,1,0);assert.deepEqual(c.map(x=>x.id),[2],'qty 0 removes the line');
c=S.cartSet(c,2,99);assert.equal(c[0].qty,S.MAX_QTY,'same max qty as the function');
let big=[];for(let i=1;i<=35;i++)big=S.cartAdd(big,{id:i,name:'X'+i,price:1});
assert.equal(big.length,S.MAX_LINES,'same max lines as the function');
const before=[{id:1,name:'A',price:10,qty:1}];S.cartAdd(before,{id:1,name:'A',price:10});assert.equal(before[0].qty,1,'cart is not changed in place');

// every error code the function returns has words
for(const k of ['bad_phone','bad_name','bad_address','bad_items','too_many','item_not_available'])assert.ok(S.errorText(k)!==S.errorText('x'),k);
assert.equal(S.MAX_LINES,30);assert.equal(S.MAX_QTY,20);
assert.deepEqual(Object.keys(S.STATUS),['available','on_order','unavailable'],'same statuses as ar_store_items');
// «طلباتي»: newest first, no repeats, at most 20
let mine=[];for(let i=1;i<=25;i++)mine=S.rememberOrder(mine,{id:i});
assert.equal(mine.length,S.MAX_SAVED_ORDERS);assert.equal(mine[0].id,25);
mine=S.rememberOrder(mine,{id:20,status:'confirmed'});assert.equal(mine[0].id,20);assert.equal(mine.filter(x=>x.id===20).length,1);
assert.deepEqual(S.rememberOrder(null,{id:1}),[{id:1}]);
// «اطلب تاني»: what is still in stock goes back to the cart with the same quantity, the rest is named
const plan=S.reorderPlan([{id:1,name:'A',qty:2},{id:2,name:'B',qty:1},{id:3,name:'C',qty:50}],
 [{id:1,status:'available',price:10,needs_rx:false},{id:2,status:'on_order',price:null,needs_rx:false},{id:3,status:'available',price:5,needs_rx:false}]);
assert.deepEqual(plan.add.map(a=>[a.item.id,a.qty]),[[1,2],[2,1],[3,20]],'on order is asked for again');assert.deepEqual(plan.missing,[]);
assert.deepEqual(S.reorderPlan([{id:4,name:'D',qty:1}],[{id:4,status:'unavailable',price:null,needs_rx:true}]).missing,['D'],'prescription item');
assert.deepEqual(S.reorderPlan([{name:'typed one',qty:3,free_text:true}],[]).add,[{text:'typed one',qty:3}],'a typed line comes back as typed');
assert.deepEqual(S.reorderPlan([{id:9,name:'Z',qty:1}],[]).missing,['Z'],'item gone from the site');
assert.deepEqual(Object.keys(S.ORDER_STATUS),['new','confirmed','done','cancelled'],'same statuses as ar_store_orders');
assert.ok(S.errorText('closed')!==S.errorText('x'),'closed has words');
// prescription photos: same path rule as the storage policy, same limits as the bucket and the function
assert.equal(S.rxExt('image/jpeg','a.jpg'),'jpg');assert.equal(S.rxExt('image/png',''),'png');assert.equal(S.rxExt('','scan.PDF'),'pdf');
assert.equal(S.rxExt('image/heif','x'),'heic');assert.equal(S.rxExt('','photo'),'jpg');
const rxRe=/^rx\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/[0-9a-f-]{20,40}\.(jpg|png|webp|heic|pdf)$/;
const p=S.rxPath('2026-11-09','3f2a9c1e-7b4d-4e8a-9c2b-1d5e6f7a8b9c','jpg');assert.ok(rxRe.test(p),'matches the upload policy');
assert.equal(S.rxPath('2026-11-09','../etc','jpg'),null);assert.equal(S.rxPath('9-11','3f2a9c1e-7b4d-4e8a-9c2b-1d5e6f7a8b9c','jpg'),null);
assert.equal(S.rxPath('2026-11-09','3f2a9c1e-7b4d-4e8a-9c2b-1d5e6f7a8b9c','exe'),null);
assert.equal(S.MAX_RX,4);assert.equal(S.MAX_RX_BYTES,8388608);
for(const k of ['bad_rx','rx_upload','rx_big'])assert.ok(S.errorText(k)!==S.errorText('x'),k);
// shape icons for items without a photo (from PharmaFly names)
const sh=(n,c)=>S.shapeOf(n,c);
assert.equal(sh('PANADOL EXTRA 48 TAB'),'pills');assert.equal(sh('URSOPLUS 20CAP'),'pills');assert.equal(sh('CONCOR 5 30TAB'),'pills');
assert.equal(sh('CONTAFEVER 120ML SYR'),'bottle');assert.equal(sh('HIBIOTIC N 600MG SUSP'),'bottle');assert.equal(sh('DUPHALAC 200ML SYR.'),'bottle');
assert.equal(sh('VOLTAREN AMP 6 AMP'),'injection');assert.equal(sh('APIDRA 100 UNIT/ML'),'injection');assert.equal(sh('EPICEPHIN 1GM I.M.'),'injection');
assert.equal(sh('OTRIVIN AD. 1% 15ML NSE DROPS'),'drops');assert.equal(sh('MEBO 15GM OINT'),'tube');assert.equal(sh('REGAINE 5% SPRAY'),'spray');
assert.equal(sh('NAN COMFORT 400 G'),'can');assert.equal(sh('HERO BABY 2 MILK'),'can');assert.equal(sh('بيبى جوى رقم 4','baby'),'can');
assert.equal(sh('SOMETHING ODD'),'box');assert.equal(sh('GLOSS NATURE','cosmetic'),'tube');
// one item's link (#item=id): opens the item sheet; anything else is not an item link
assert.equal(S.itemIdFromHash('#item=4468'),4468);
assert.equal(S.itemIdFromHash('item=12'),12);
assert.equal(S.itemIdFromHash('#cart'),null);
assert.equal(S.itemIdFromHash('#item=12x'),null);
assert.equal(S.itemIdFromHash('#item=1);alert(1)'),null);
assert.equal(S.itemLink('https://x.io/store.html#search','4468'),'https://x.io/store.html#item=4468');
assert.equal(S.itemLink('https://x.io/store.html#item=1',7),'https://x.io/store.html#item=7');
assert.equal(S.shareText({name:'PANADOL EXTRA',arabic_name:'بانادول اكسترا',status:'available',price:65},'L'),'بانادول اكسترا بـ 65 جنيه من صيدلية عسكر، اطلبه من هنا: L');
assert.equal(S.shareText({name:'CONGESTAL',status:'on_order',price:null},'L'),'CONGESTAL من صيدلية عسكر، اطلبه من هنا: L','no price for an on-order item');
// a line the customer types (not on the site): no price, same name = one line, sent as {text, qty}
let tc=S.cartAddText([], '  ابيمول   شراب ').cart;
assert.deepEqual(tc,[{id:'t:ابيمول شراب',name:'ابيمول شراب',arabic_name:null,price:null,qty:1,on_order:true,free_text:true}]);
tc=S.cartAddText(tc,'ابيمول شراب').cart;assert.equal(tc[0].qty,2,'same text adds one');
assert.equal(S.cartAddText([],'x').error,'bad_text');
assert.equal(S.cartAddText([],'a'.repeat(121)).error,'bad_text');
assert.equal(S.cleanText('<b>x</b> y'),'b x /b y','no tags');
let ten=[];for(let i=0;i<10;i++)ten=S.cartAddText(ten,'صنف '+i).cart;
assert.equal(S.cartAddText(ten,'صنف 11').error,'too_many_text');
const mixed=S.cartAdd(tc,{id:5,name:'P',status:'available',price:10,needs_rx:false});
assert.deepEqual(S.orderItems(mixed),[{text:'ابيمول شراب',qty:2},{id:5,qty:1}]);
assert.equal(S.cartTotal(mixed),10,'typed lines have no price');
assert.equal(S.cartLater(mixed),1);
// «شفته قريب»: newest first, no repeats, 10 at most, only what the card needs
let seenL=[];
for(let i=1;i<=12;i++)seenL=S.rememberSeen(seenL,{id:i,name:'X'+i,price:i,status:'available',secret:'no'});
assert.equal(seenL.length,S.MAX_SEEN);assert.equal(seenL[0].id,12);
seenL=S.rememberSeen(seenL,{id:5,name:'X5'});assert.equal(seenL[0].id,5);assert.equal(seenL.filter(x=>x.id===5).length,1);
assert.equal('secret' in seenL[1],false);
assert.deepEqual(S.rememberSeen(null,null),[]);
// «محتاج إيه النهارده؟»: every chip opens real store categories
for(const n of S.NEEDS){assert.ok(n.key&&n.name&&n.cats.length);for(const c of n.cats)assert.ok(S.SECTIONS.some(s=>s.cats.includes(c)),c)}
// the card of an item with no photo: section color, short name, strength or size
const ci=(name,cat)=>S.cardInfo({name,cat});
assert.deepEqual(ci('ANGIOFOX TAB 25MG','blood_pressure_heart'),{sec:'meds',shape:'pills',short:'ANGIOFOX',strength:'25 MG'});
assert.equal(ci('AQUA GRIPE 120ML  SYP','baby').sec,'baby');assert.equal(ci('AQUA GRIPE 120ML  SYP','baby').shape,'bottle');assert.equal(ci('AQUA GRIPE 120ML  SYP','baby').strength,'120 ML');
assert.equal(ci('BETADERM 0.1% OINT','skin_drug').strength,'0.1%');
assert.equal(ci('EMPACOZA TRIO 10/5/1000MG  TAB','diabetes').strength,'10/5/1000 MG');
assert.equal(ci('SENOLAN FACIAL CLEANSING GEL','cosmetic').sec,'care');
assert.equal(ci('قلم تحديد حواجب','cosmetic').short,'قلم تحديد');
assert.equal(ci('X','no_such_cat').sec,'other');
assert.ok(ci('A VERY VERY LONG PRODUCTNAMEHERE TAB','cosmetic').short.length<=18);
console.log('store ok');
