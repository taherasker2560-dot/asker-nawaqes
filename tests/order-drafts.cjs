// «الطلبيات» tab helpers (ar/order-drafts.js): reading the laptop's file, the note under each item, which items are still in the
// message after the owner's edits, the total, and the WhatsApp link (long messages go by clipboard, not by link).
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
// the line under an item: where the discount came from and what to look at
const it={name_pf:'NOVISTORIC 20MG',discount:30,source:'list',source_date:'2026-11-08',stale:false,bonus:0,mismatch:false,list:{discount:30,date:'2026-11-08'},buy:{discount:29,date:'2026-03-03',bonus:0},
 fallback:{label:'الفتح',discount:28.5,source:'buy',date:'2026-10-01'}};
assert.equal(D.sourceNote(it),'خصم 30% · قايمة 08/11');
assert.equal(D.sourceNote({...it,source:'buy',source_date:'2026-10-19',discount:21.2,bonus:3}),'خصم 21.2% · آخر شرا 19/10 · فيه بونص');
assert.equal(D.sourceNote({...it,stale:true}),'خصم 30% · قايمة 08/11 · قديم، راجعه');
assert.equal(D.sourceNote({...it,mismatch:true,list:{discount:23,date:'2026-11-08'},buy:{discount:29,date:'2026-03-03'},discount:23}),'خصم 23% · قايمة 08/11 · القايمة 23% وآخر شرا 29% (03/03)');
assert.equal(D.fallbackNote(it),'لو مش متاح: الفتح 28.5% (آخر شرا 01/10)');assert.equal(D.fallbackNote({...it,fallback:null}),'');
// items still in the message: with the warehouse's own name, with the PharmaFly name alone, edited quantity, deleted line
const sup={id:'NEWCITY',label:'نيو سيتي',items:[{name_pf:'ANTINAL 24CAP',est_cost:100},{name_pf:'ANTINAL 24CAP X',est_cost:50},{name_pf:'FERRODEP 150 ML SYRUP',est_cost:75.5},{name_pf:'PEDIASURE',est_cost:10}]};
const msg='السلام عليكم\nمحتاج الأصناف دي:\n• انتينال 24 كبسولة (ANTINAL 24CAP) × 2\n• FERRODEP 150 ML SYRUP × 5\n• ANTINAL 24CAP X x 1\nشكرًا';
assert.deepEqual(D.itemsInMessage(sup,msg).map(i=>i.name_pf),['ANTINAL 24CAP','ANTINAL 24CAP X','FERRODEP 150 ML SYRUP'],'a name that starts like another one is not confused with it');
assert.deepEqual(D.itemsInMessage(sup,msg.replace(/• انتينال.*\n/,'')).map(i=>i.name_pf),['ANTINAL 24CAP X','FERRODEP 150 ML SYRUP'],'a deleted line is not marked');
assert.deepEqual(D.itemsInMessage(sup,'').map(i=>i.name_pf),[]);
assert.equal(D.estTotal(D.itemsInMessage(sup,msg)),225.5);assert.equal(D.estTotal([]),0);
// WhatsApp: short messages ride in the link, long ones (the 196-item NEWCITY list) open WhatsApp bare and are pasted
assert.equal(D.urlText('السلام عليكم'),'السلام عليكم');assert.equal(D.urlText('س'.repeat(2000)),'');
assert.equal(D.waLink('a b'),'https://wa.me/?text=a%20b');assert.equal(D.waLink(''),'https://wa.me/');
console.log('order-drafts ok');
