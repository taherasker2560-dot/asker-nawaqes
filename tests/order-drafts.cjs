// «الطلبيات» tab helpers (ar/order-drafts.js): reading the laptop's file, the lines under each item (last discount, monthly average),
// the ticks + typed quantities that make the order, the total, the supplier's saved chat, and the WhatsApp link.
const assert=require('node:assert/strict');
const D=require('../ar/order-drafts.js');
assert.equal(D.PATH,'orders/drafts.json','same place the laptop script uploads to');
// same key as the shortages tab, the function and the database (ar_orders.name_key)
assert.equal(D.nk('  brufen   400mg 30tab '),'BRUFEN 400MG 30TAB');assert.equal(D.nk('x'.repeat(300)).length,250);
assert.equal(D.dm('2026-11-08'),'08/11');assert.equal(D.dm('bad'),'');assert.equal(D.dm(null),'');
assert.equal(D.pct(30),'30');assert.equal(D.pct(21.04),'21');assert.equal(D.pct(25.46),'25.5');assert.equal(D.pct('x'),'');
assert.equal(D.money(28720.4),'28,720');assert.equal(D.money(0),'0');assert.equal(D.money(999),'999');
// the file: anything that is not what the laptop writes means «no drafts yet»; suppliers with no items are dropped
assert.equal(D.parseDrafts(null),null);assert.equal(D.parseDrafts({}),null);assert.equal(D.parseDrafts({suppliers:'x'}),null);
const ok=D.parseDrafts({generated_at:'2026-11-09T07:00:00Z',suppliers:[{id:'AMG',label:'AMG',items:[{name_pf:'A'}]},{id:'REDA',label:'رضا',items:[]},null],no_offer:[{name_pf:'Z',qty:1}]});
assert.deepEqual(ok.suppliers.map(s=>s.id),['AMG']);assert.equal(ok.noOffer.length,1);assert.equal(ok.generatedAt,'2026-11-09T07:00:00Z');
assert.deepEqual(D.parseDrafts({suppliers:[]}).noOffer,[]);
// how old
const now=new Date(2026,10,9,12,0);
assert.deepEqual(D.age(new Date(2026,10,9,9,5).toISOString(),now),{text:'النهارده 9:05 ص',old:false});
assert.deepEqual(D.age(new Date(2026,10,8,23,30).toISOString(),now),{text:'امبارح 11:30 م',old:false});
assert.deepEqual(D.age(new Date(2026,10,6,14,0).toISOString(),now),{text:'06/11 2:00 م',old:true},'older than 36 hours is flagged');
assert.equal(D.age('bad',now).old,true);
// under each item: the LAST discount and where it came from, what to look at, the monthly average, the fallback supplier
const it={item_id:1,name_pf:'NOVISTORIC 20MG',qty:2,public_price:100,discount:30,source:'list',source_date:'2026-11-08',stale:false,bonus:0,mismatch:false,avg30:84,have:19,
 list:{discount:30,date:'2026-11-08'},buy:{discount:29,date:'2026-03-03',bonus:0},est_cost:140,fallback:{label:'الفتح',discount:28.5,source:'buy',date:'2026-10-01'}};
assert.equal(D.sourceNote(it),'آخر خصم 30% · قايمة 08/11');
assert.equal(D.sourceNote({...it,source:'buy',source_date:'2026-10-19',discount:21.2,bonus:3}),'آخر خصم 21.2% · آخر شرا 19/10 · فيه بونص');
assert.equal(D.sourceNote({...it,stale:true}),'آخر خصم 30% · قايمة 08/11 · قديم، راجعه');
assert.equal(D.mismatchNote({...it,mismatch:true,list:{discount:23,date:'2026-11-08'},buy:{discount:29,date:'2026-03-03'},discount:23}),'القايمة 23% وآخر شرا 29% (03/03)');
assert.equal(D.mismatchNote(it),'','no gap = no line');assert.equal(D.mismatchNote({mismatch:true}),'');
assert.equal(D.fallbackNote(it),'لو مش متاح: الفتح 28.5% (آخر شرا 01/10)');assert.equal(D.fallbackNote({...it,fallback:null}),'');
assert.equal(D.avgNote(it),'المتوسط الشهري 84 · الرصيد 19');assert.equal(D.avgNote({avg30:3.25,have:0}),'المتوسط الشهري 3.3 · الرصيد 0');
assert.equal(D.avgNote({}),'','an older file without the numbers shows nothing');assert.equal(D.avgNote({avg30:null,have:5}),'الرصيد 5');
// quantity typed by the owner: whole packs; empty, 0, negative or text = not ordered
assert.equal(D.qtyOf('3'),3);assert.equal(D.qtyOf(' 12 '),12);assert.equal(D.qtyOf('٤'),4,'Arabic digits');assert.equal(D.qtyOf('2.9'),2);assert.equal(D.qtyOf('2,5'),2);
for(const v of ['','0','-1','abc',null,undefined,'0.5'])assert.equal(D.qtyOf(v),0,String(v));
assert.equal(D.qtyOf('999999'),D.MAX_QTY);
// the order = what is ticked, with its typed quantity; an item that is not ticked (or has no quantity) is not in it
const sup={id:'NEWCITY',label:'نيو سيتي',items:[
 {item_id:1,name_pf:'ANTINAL 24CAP',name_supplier:'انتينال 24 كبسولة',qty:2,public_price:100,discount:30,est_cost:140},
 {item_id:2,name_pf:'ANTINAL 24CAP X',name_supplier:null,qty:1,public_price:50,discount:20,est_cost:40},
 {item_id:3,name_pf:'FERRODEP 150 ML SYRUP',qty:3,public_price:0,discount:10,est_cost:225}]};
const st=D.defaultSel(sup);
assert.deepEqual(st,{1:{on:true,qty:'2'},2:{on:true,qty:'1'},3:{on:true,qty:'3'}},'everything ticked at the laptop\'s quantity');
assert.equal(D.buildMessage(sup,st),'السلام عليكم\nمحتاج الأصناف دي:\n• انتينال 24 كبسولة (ANTINAL 24CAP) × 2\n• ANTINAL 24CAP X × 1\n• FERRODEP 150 ML SYRUP × 3\nشكرًا');
st[1].qty='5';st[2].on=false;
assert.equal(D.buildMessage(sup,st),'السلام عليكم\nمحتاج الأصناف دي:\n• انتينال 24 كبسولة (ANTINAL 24CAP) × 5\n• FERRODEP 150 ML SYRUP × 3\nشكرًا','typed quantity replaces the suggestion; the unticked item is not in the order');
st[3].qty='';assert.deepEqual(D.picked(sup,st).map(x=>[x.item.item_id,x.qty]),[[1,5]],'ticked with no quantity = not ordered');
st[1].on=false;assert.equal(D.buildMessage(sup,st),'');assert.deepEqual(D.picked(sup,st),[]);
assert.deepEqual(D.picked(sup,undefined),[],'no state yet = nothing');
// Pharma and Ibn Sina lines use the PharmaFly name only
assert.equal(D.nameFor('PHARMA',{name_pf:'CYSTONE 60TAB',name_supplier:'x'}),'CYSTONE 60TAB');assert.equal(D.nameFor('AMG',{name_pf:'A',name_supplier:null}),'A');assert.equal(D.nameFor('AMG',{name_pf:'A',name_supplier:'ا'}),'ا (A)');
// total: the item's own price after its discount × the typed quantity (the suggested cost when the price is missing)
assert.equal(D.unitCost(sup.items[0]),70);assert.equal(D.unitCost(sup.items[2]),75);
assert.equal(D.totalOf([{item:sup.items[0],qty:5},{item:sup.items[2],qty:3}]),575);assert.equal(D.totalOf([]),0);
// WhatsApp: the supplier's number opens ITS chat; short messages ride in the link, long ones (NEWCITY's list) go by clipboard
assert.equal(D.waPhone('01012345678'),'201012345678');assert.equal(D.waPhone('٠١٠١٢٣٤٥٦٧٨'),'201012345678','Arabic digits');
assert.equal(D.waPhone('0020 101 234 5678'),'201012345678');assert.equal(D.waPhone('abc'),'');assert.equal(D.waPhone(''),'');
assert.equal(D.urlText('السلام عليكم'),'السلام عليكم');assert.equal(D.urlText('س'.repeat(2000)),'');
assert.equal(D.waLink('a b','01012345678'),'https://wa.me/201012345678?text=a%20b');assert.equal(D.waLink('','01012345678'),'https://wa.me/201012345678');
assert.equal(D.waLink('a',''),'https://wa.me/?text=a','no number = the owner picks the chat');
// the saved companies (several people per supplier) -> the supplier; «مخزن نيو سيتى فارما» is New City's, not Pharma's
const saved=[{name:'شركه ابن سينا (محمد سعيد)',phone:'01000000001'},{name:'شركه فارما بالليل (احمد مسعد)',phone:'01000000002'},{name:'شركه فارما بالنهار (امانى)',phone:''},
 {name:'مخزن الفتح (شريف)',phone:'01000000003'},{name:'مخزن ايه ام جروب (رمضان)',phone:'01000000004'},{name:'مخزن ايه ام جروب (محمد على)',phone:'01000000005'},
 {name:'مخزن رضا عطيه (احمد)',phone:'01000000006'},{name:'مخزن نيو سيتى فارما',phone:'01000000007'},{name:'مخزن نيوسيتى (محمود جميل)',phone:'01000000008'}];
const names=(id)=>D.contactsFor(id,saved).map(c=>c.name);
assert.deepEqual(names('NEWCITY'),['مخزن نيو سيتى فارما','مخزن نيوسيتى (محمود جميل)']);
assert.deepEqual(names('PHARMA'),['شركه فارما بالليل (احمد مسعد)','شركه فارما بالنهار (امانى)'],'New City\'s «فارما» contact is not Pharma\'s');
assert.deepEqual(names('AMG'),['مخزن ايه ام جروب (رمضان)','مخزن ايه ام جروب (محمد على)']);
assert.deepEqual(names('ELFATH'),['مخزن الفتح (شريف)']);assert.deepEqual(names('REDA'),['مخزن رضا عطيه (احمد)']);assert.deepEqual(names('IBNSINA'),['شركه ابن سينا (محمد سعيد)']);
assert.deepEqual(D.contactsFor('NOPE',saved),[]);assert.deepEqual(D.contactsFor('AMG',null),[]);
const ph=D.contactsFor('PHARMA',saved);
assert.equal(D.chooseContact(ph,null).name,'شركه فارما بالليل (احمد مسعد)','first one with a number');
assert.equal(D.chooseContact(ph,'شركه فارما بالنهار (امانى)').name,'شركه فارما بالنهار (امانى)','the remembered one wins');
assert.equal(D.chooseContact(ph,'gone').name,'شركه فارما بالليل (احمد مسعد)','a forgotten name falls back');
assert.equal(D.chooseContact([{name:'x',phone:''}],null).name,'x');assert.equal(D.chooseContact([],null),null);
// no approved photo: a shape from the name (same shapes as the store)
assert.equal(D.shapeOf('FERRODEP 150 ML SYRUP'),'bottle');assert.equal(D.shapeOf('ADRENOCORTINE 1MG AMP'),'injection');assert.equal(D.shapeOf('FLUCON 5CC E.D.'),'drops');
assert.equal(D.shapeOf('SKINOPROCIN OINT'),'tube');assert.equal(D.shapeOf('AMARYL 3MG 30TAB'),'pills');assert.equal(D.shapeOf('WISE CARE'),'box');
// the pharmacy's working day starts at 6:00 (after midnight is still the same night)
assert.equal(D.businessDayStart(new Date(2026,10,10,19,0)).getTime(),new Date(2026,10,10,6,0).getTime());
assert.equal(D.businessDayStart(new Date(2026,10,11,1,30)).getTime(),new Date(2026,10,10,6,0).getTime(),'1:30 at night = still yesterday');
assert.equal(D.businessDayStart(new Date(2026,10,11,6,0)).getTime(),new Date(2026,10,11,6,0).getTime());
// what was marked «اتطلب» today is hidden from today's orders (any supplier); a supplier left empty is dropped; noOffer too
const dd={generatedAt:'x',summary:{},suppliers:[{id:'NEWCITY',label:'نيوسيتي',count:2,items:[{item_id:1,name_pf:'BRUFEN 400MG 30TAB'},{item_id:2,name_pf:'FLAGYL 125MG SYP'}]},{id:'AMG',label:'AMG',count:1,items:[{item_id:1,name_pf:'brufen  400mg 30tab'}]}],noOffer:[{name_pf:'FLAGYL 125MG SYP',qty:2},{name_pf:'OTHER',qty:1}]};
let h=D.hideOrdered(dd,[{name_key:'BRUFEN 400MG 30TAB',supplier:'نيوسيتي'}]);
assert.equal(h.hidden,1);
assert.deepEqual(h.drafts.suppliers.map(s=>[s.id,s.count,s.items.map(i=>i.item_id)]),[['NEWCITY',1,[2]]],'AMG had only the ordered item: dropped');
assert.deepEqual(h.drafts.noOffer.map(i=>i.name_pf),['FLAGYL 125MG SYP','OTHER']);
h=D.hideOrdered(dd,[{name_key:'FLAGYL 125MG SYP'},{name_key:'BRUFEN 400MG 30TAB'}]);
assert.equal(h.hidden,2);assert.deepEqual(h.drafts.suppliers,[]);assert.deepEqual(h.drafts.noOffer.map(i=>i.name_pf),['OTHER']);
// nothing ordered: the same drafts back; the original object is never changed
assert.equal(D.hideOrdered(dd,[]).drafts,dd);assert.equal(D.hideOrdered(dd,null).hidden,0);assert.equal(D.hideOrdered(null,[{name_key:'X'}]).drafts,null);
assert.equal(dd.suppliers[0].items.length,2,'the loaded file is not changed in place');
// «ابعت الطلبية دي لـ»: the six suppliers, the file's own label when that supplier has an order
assert.deepEqual(D.sendOptions({suppliers:[{id:'NEWCITY',label:'نيوسيتى'}]}).map(x=>x.id),['NEWCITY','AMG','REDA','ELFATH','PHARMA','IBNSINA']);
assert.equal(D.sendOptions({suppliers:[{id:'NEWCITY',label:'نيوسيتى'}]})[0].label,'نيوسيتى');assert.equal(D.sendOptions(null)[1].label,'AMG');
// sent to its own supplier: the same message as before; to another one: PharmaFly names only
const supX={id:'REDA',items:[{item_id:7,name_pf:'BRUFEN 400MG 30TAB',name_supplier:'بروفين ٤٠٠',qty:3}]},stX=D.defaultSel(supX);
assert.equal(D.buildMessageTo(supX,stX,'REDA'),D.buildMessage(supX,stX));
assert.match(D.buildMessageTo(supX,stX,'REDA'),/بروفين ٤٠٠ \(BRUFEN 400MG 30TAB\) × 3/);
assert.equal(D.buildMessageTo(supX,stX,'AMG'),'السلام عليكم\nمحتاج الأصناف دي:\n• BRUFEN 400MG 30TAB × 3\nشكرًا');
assert.equal(D.buildMessageTo(supX,{},'AMG'),'','nothing ticked: no message');
console.log('order-drafts ok');
