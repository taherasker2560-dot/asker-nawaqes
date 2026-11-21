// Owner 2026-11-12: alerts in the right sections (expiry under «المشتريات ← مخزون ← الصلاحيات», customers' limits under
// «الحسابات ← العملاء»), «محتاج شغل» on «الرئيسية», red numbers on the sections, and a sound per section in ⚙️.
// The data comes from the laptop's file (private bucket alerts/alerts.json); nothing is written anywhere.
const {run,assert}=require('./harness.cjs');
// the visible text (blocks and tags apart), spaces made single
const text=(page,sel)=>page.innerText(sel).then(s=>s.replace(/\s+/g,' ').trim());
const file=()=>({generated_at:new Date().toISOString(),data_at:'2026-11-11T23:59:08',day_start:'2026-11-11T06:00:00',next_month:'2026-12-01',soon_until:'2027-03-01',
 tasks:{expiry_mix:[{id:20731,name:'LAMIFEN CREAM 15GM',price:18,parts:1,today:2,n7:5,last:'2026-11-11T22:34:52',batches:[{store:1,store_name:'Main',exp:'2028-07-28',packs:2,units:0},{store:1,store_name:'Main',exp:'2028-09-28',packs:3,units:0}]},
   {id:2,name:'OLDER MIX ITEM',price:10,parts:1,today:0,n7:1,last:'2026-11-08T10:00:00',batches:[]}],
  negative:[{id:66358,name:'EZAPRIL-CO 72 TAB',price:72,parts:3,today:1,n7:1,last:'2026-11-11T18:52:00',batches:[{store:1,exp:'2029-07-28',packs:5,units:0}]}],expired_sold:[]},
 expiry:{expired:[{id:68195,name:'SOLONAL FACIAL WASH',price:150,parts:1,exp:'2026-06-28',packs:1,value:150,batches:[{store:1,store_name:'Main',exp:'2026-06-28',packs:1,units:0}]}],
  soon:[{id:9,name:'SOON ITEM',price:100,parts:1,exp:'2027-01-28',packs:2,value:200,batches:[{store:1,exp:'2027-01-28',packs:2,units:0}]}]},
 customers:{owing:781,owed:388218,prepaid:102,over:[{id:5,name:'عميل تجربة',balance:5400.25,limit:1000,over:4400.25,pct:540,last_at:'2026-11-11T11:17:08',last_kind:'sale'}],near:[{id:6,name:'عميل قريب',balance:9500,limit:10000,over:-500,pct:95,last_at:'2026-11-10T10:00:00',last_kind:'payment'}]},
 // the bags (2026-11-15): the daily bag and «كل الشركات» (no home line), one late item (8 days), one with a minimum and no sale,
 // an empty bag to move to (نقدى)
 bags:{since:'2026-11-03',late_days:7,gs:['999'],all:[{id:'2428',name:'نواقص يوميه'},{id:'pv',name:'نواقص كل الشركات'},{id:'gs',name:'النواقص العامة'},{id:'2495',name:'IBN SINA 1'},{id:'2274',name:'فارما مول'},{id:'2576',name:'zad pharma'},{id:'7',name:'نقدى'}],list:[
  {id:'2428',name:'نواقص يوميه',home:false,items:[{id:11,name:'DAILY ONE',have:1,sold30:33,min:0,need:16,last_buy:'2026-10-25',days:3},{id:12,name:'DAILY TWO',have:9,sold30:30,min:0,need:6,last_buy:'2026-10-25',days:1},{id:13,name:'DAILY THREE',have:5,sold30:10,min:0,need:2,last_buy:null,days:1}]},
  {id:'pv',name:'نواقص كل الشركات',home:false,items:[{id:21,name:'POSTPONED ONE',have:4,sold30:32,min:0,need:12,last_buy:'2026-10-30',days:1}]},
  {id:'2274',name:'فارما مول',home:true,items:[{id:62386,name:'ZURCAL 40MG 14 TAB',have:1,sold30:33,min:0,need:16,last_buy:'2026-10-25',days:8,since:'2026-11-04'}]},
  {id:'2576',name:'zad pharma',home:true,items:[{id:66288,name:'ECLATREM FIRMING CREAM',have:1,sold30:0,min:1,need:1,last_buy:'2025-11-02',days:1,since:'2026-11-11'},{id:3,name:'NEVER BOUGHT',have:0,sold30:2,min:0,need:1,last_buy:null,days:2,since:'2026-11-10',dup:{id:4,name:'NEVER BOUGHT BIG',have:5}}]}]},
 counts:{}});
run('alerts: home card, red numbers, «الصلاحيات», customers, sounds',async({page})=>{
 await page.evaluate((o)=>{window.__storage['alerts/alerts.json']=JSON.stringify(o);window.__tables.ar_store_orders=[{id:1,status:'new'},{id:2,status:'done'}];window.__tables.ar_documents=[{id:'d1',status:'new'}];},file());
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForFunction(()=>!document.getElementById('todoCard').classList.contains('hidden'));
 // «محتاج شغل»: the invoices, the store order, today's mix-up and negative sale, the expired stock, the customer
 const rows=await page.$$eval('#todoList .todo-row',r=>r.map(x=>[...x.children].map(c=>c.textContent.trim()).join(' ')));
 assert.deepEqual(rows,['1 صورة مستنية في الفواتير','1 طلب جديد من الموقع','1 صنف صلاحياته اتلخبطت من البيع النهارده','1 صنف اتباع بالسالب النهارده','1 صنف منتهي الصلاحية وليه رصيد','1 عميل عدّى الحد',
  '1 ناقص في حقيبة فارما مول منهم 1 بقالهم أكتر من 7 أيام','2 ناقص في حقيبة zad pharma']);
 assert.equal(await page.$$eval('#todoList .todo-row.late',r=>r.length),1,'only the bag with a late item is marked');
 // red numbers: purchases = invoices 1 + today's expiry 2 + the late bag item 1, accounts = 1, sales = 1
 assert.deepEqual(await page.$$eval('.bottomnav [data-group]',b=>b.map(x=>[x.dataset.group,x.dataset.badge||''])),[['home',''],['purchases','4'],['accounts','1'],['sales','1'],['care','']]);
 // a bag's home row opens «المشتريات ← نواقص ← الحقائب» on that bag
 await page.click('#todoList .todo-row[data-view="bag:2576"]');
 await page.waitForFunction(()=>!document.getElementById('bagsPanel').classList.contains('hidden')&&/ECLATREM/.test(document.getElementById('bgList').textContent));
 assert.equal(await page.$eval('[data-tab="bags"]',b=>b.classList.contains('on')),true);
 // the bags one under the other, each on its line with its whole name; the open one shows its items
 const chips=()=>page.$$eval('#bgList .bg-bag',b=>b.map(x=>[x.querySelector('.bg-bag-h').textContent.replace(/\s+/g,' ').trim(),!x.classList.contains('open')]));
 const openBag=async(id)=>{if(!(await page.$eval(`#bgList [data-bag="${id}"]`,b=>b.closest('.bg-bag').classList.contains('open'))))await page.click(`#bgList [data-bag="${id}"]`)};
 assert.equal(await page.$eval('#bgChips',c=>c.classList.contains('hidden')),true,'no strip of bags on top any more');
 assert.deepEqual(await chips(),[['نواقص يوميه 3',true],['نواقص كل الشركات 1',true],['IBN SINA 1 0',true],['فارما مول 1',true],['zad pharma 2',false],['نقدى 0',true]],'every bag even an empty one, «كل الشركات» as one, not the general shortages');
 const bagText=await text(page,'#bgList');
 assert.match(bagText,/ECLATREM FIRMING CREAM عندك 1 · الحد الأدنى 1 · اتباع في شهر 0 · المطلوب 1 آخر شرا 02\/11\/2025 · ناقص من النهارده/);
 assert.match(bagText,/NEVER BOUGHT عندك 0 · اتباع في شهر 2 · المطلوب 1 ما اتشراش قبل كده · ناقص بقاله 2 يوم ⚠️ ممكن نفس الصنف: NEVER BOUGHT BIG عندك منه 5/,'a card with the same name and stock is pointed out');
 assert.doesNotMatch(bagText,/ZURCAL/,'only the chosen bag');
 // his two answers to the warning (owner 11-15 «الحل فين؟»): «✖ صنف تاني» = the warning goes away; undo brings it back
 await page.click('#bgList [data-dup-diff="3"]');
 await page.waitForFunction(()=>/صنف تاني: التحذير اتشال/.test(document.getElementById('bgList').textContent));
 assert.doesNotMatch(await text(page,'#bgList .bg-bag.open'),/ممكن نفس الصنف/);
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_item_dups.map(d=>[d.item_id,d.other_id,d.bag,d.decision,d.status])),[[3,4,'2576','different','open']]);
 assert.equal(await page.$eval('#bgList [data-pick="3"]',b=>b.checked),false,'the button did not tick the item');
 await page.click('#bgList [data-dup-undo]');
 await page.waitForFunction(()=>/ممكن نفس الصنف/.test(document.getElementById('bgList').textContent));
 // «✔ نفس الصنف» = a duplicate card: it leaves the bag and waits in the list of duplicates to take out of PharmaFly
 await page.click('#bgList [data-dup-same="3"]');
 await page.waitForFunction(()=>/مكررات تتشال من نواقص فارمافلاي \(1\)/.test(document.getElementById('bgList').textContent));
 assert.match(await text(page,'#bgList .bg-dups'),/NEVER BOUGHT \(zad pharma\) نفس: NEVER BOUGHT BIG · ⏳ لسه في فارمافلاي/);
 assert.match(await text(page,'#bgList'),/zad pharma 1/,'out of its bag');
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_item_dups.map(d=>[d.decision,d.status])),[['different','cancelled'],['same','open']]);
 await page.click('#bgList .bg-dups [data-dup-undo]');
 await page.waitForFunction(()=>/zad pharma\s*2/.test(document.getElementById('bgList').textContent));
 assert.equal(await page.$('#bgList .bg-dups'),null);
 await openBag('2274');
 assert.equal(await page.$$eval('#bgList .bg-bag.open',b=>b.length),1,'one bag open at a time');
 assert.match(await text(page,'#bgList'),/فارما مول 1 رتّب: الرصيد: الأقل فوق ▲ المتوسط: الأكتر فوق علّم الكل ZURCAL 40MG 14 TAB عندك 1 · اتباع في شهر 33 · المطلوب 16 آخر شرا 25\/10 · ناقص بقاله 8 يوم/);
 assert.equal(await page.$$eval('#bgList .al-item.late',r=>r.length),1,'the late item is red');
 assert.equal(await page.$eval('[data-tab="bags"]',b=>b.dataset.badge),'1','the small tab counts the late items');
 // the daily bag, ordered by the real stock: smallest first (none on top), a tap = largest first, again = smallest first
 await openBag('2428');
 const order=()=>page.$$eval('#bgList .bg-it strong',s=>s.map(x=>x.textContent.trim()));
 assert.deepEqual(await order(),['DAILY ONE','DAILY THREE','DAILY TWO']);
 assert.equal(await text(page,'#bgList .bg-sort'),'رتّب: الرصيد: الأقل فوق ▲ المتوسط: الأكتر فوق');
 await page.click('#bgList [data-sort="have"]');assert.deepEqual(await order(),['DAILY TWO','DAILY THREE','DAILY ONE']);
 assert.equal(await text(page,'#bgList .bg-sort'),'رتّب: الرصيد: الأكتر فوق ▼ المتوسط: الأكتر فوق');
 // the monthly average («اتباع في شهر», owner 11-15): largest first, a tap = smallest first
 await page.click('#bgList [data-sort="sold30"]');assert.deepEqual(await order(),['DAILY ONE','DAILY TWO','DAILY THREE']);
 assert.equal(await text(page,'#bgList .bg-sort'),'رتّب: الرصيد: الأقل فوق المتوسط: الأكتر فوق ▼');
 await page.click('#bgList [data-sort="sold30"]');assert.deepEqual(await order(),['DAILY THREE','DAILY TWO','DAILY ONE']);
 await page.click('#bgList [data-sort="have"]');assert.deepEqual(await order(),['DAILY ONE','DAILY THREE','DAILY TWO']);
 // «🛒 أمر شراء»: the ticked item goes in his purchase order with what is needed; ticked again it can come out
 await page.click('#bgList [data-pick="11"]');
 assert.equal((await page.textContent('#bgPoBtn')).trim(),'🛒 أمر شراء (1)');
 await page.click('#bgPoBtn');
 await page.waitForFunction(()=>/اتضاف 1 صنف لأمر الشرا/.test(document.getElementById('bgList').textContent));
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_po_items.map(p=>[p.item_id,p.item_name,p.bag,p.qty,p.status,p.item.sold30])),[[11,'DAILY ONE','2428',16,'open',33]]);
 assert.match(await text(page,'#bgList'),/في أمر الشرا: 1 صنف مش ظاهرين في الحقائب\. .* افتح الطلبيات اعرضهم/);
 // it leaves the bag (owner 11-15: «طالما راحت أمر شراء يبقى ما تظهرش في الحقائب»); «اعرضهم» shows it again
 assert.deepEqual(await order(),['DAILY THREE','DAILY TWO']);
 assert.match(await text(page,'#bgList'),/نواقص يوميه 2/);
 await page.click('#bgList [data-show-po]');
 assert.match(await text(page,'#bgList'),/DAILY ONE 🛒 في أمر الشرا/);
 await page.click('#bgList [data-pick="11"]');
 assert.equal(await page.$('#bgPoBtn'),null,'already in the order');
 await page.click('#bgPoDrop');
 await page.waitForFunction(()=>/اتشال 1 صنف من أمر الشرا/.test(document.getElementById('bgList').textContent));
 assert.equal(await page.evaluate(()=>window.__tables.ar_po_items[0].status),'cancelled');
 // the laptop's automatic order may put the same item in after this page read the order (one open line per item): the clash is not a failure, the item is in the order
 await page.click('#bgList [data-pick="11"]');
 await page.evaluate(()=>{window.__tables.ar_po_items.push({id:'auto11',item_id:11,item_name:'DAILY ONE',bag:'2428',qty:16,status:'open',item:{auto:true},created_at:new Date().toISOString()})});
 await page.click('#bgPoBtn');
 await page.waitForFunction(()=>/اتضاف 1 صنف لأمر الشرا/.test(document.getElementById('bgList').textContent));
 assert.ok(!/ما اتسجلش/.test(await page.textContent('#bgList')),'no failure message');
 assert.equal(await page.evaluate(()=>window.__tables.ar_po_items.filter(p=>p.item_id===11&&p.status==='open').length),1,'still one open line');
 await page.click('#bgList [data-pick="11"]');
 await page.click('#bgPoDrop');
 await page.waitForFunction(()=>/اتشال 1 صنف من أمر الشرا/.test(document.getElementById('bgList').textContent));
 assert.equal(await page.evaluate(()=>window.__tables.ar_po_items.filter(p=>p.item_id===11&&p.status==='open').length),0,'taken out again');
 // two lines an invoice closed (the laptop's PO_CLOSE sets them 'received'), one an old one: «✅ وصل من أمر الشرا» lists the recent two
 await page.evaluate(()=>{const now=Date.now(),iso=(d)=>new Date(now-d*864e5).toISOString();window.__tables.ar_po_items.push(
  {id:901,item_id:21,item_name:'RECEIVED ONE',bag:'2428',qty:3,status:'received',received_qty:3,inv_code:'11/26/100001',vendor:'AMG',received_at:iso(0.2)},
  {id:902,item_id:22,item_name:'RECEIVED TWO',bag:'pv',qty:4,status:'received',received_qty:1,inv_code:'11/26/100002',vendor:'SKY',received_at:iso(1)},
  {id:903,item_id:23,item_name:'OLD RECEIVED',bag:'pv',qty:2,status:'received',received_qty:2,inv_code:'11/26/100003',vendor:'AMG',received_at:iso(5)})});
 // «الطلبيات» with an empty purchase order says how to fill it
 await page.evaluate(()=>{window.__storage['orders/drafts.json']=JSON.stringify({generated_at:new Date().toISOString(),suppliers:[{id:'NEWCITY',label:'نيو سيتي',items:[]}],no_offer:[],summary:{items:0}})});
 await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');await page.evaluate(()=>document.querySelectorAll('details.od-fold').forEach(d=>{d.open=true}));
 await page.waitForFunction(()=>/أمر الشرا فاضي/.test(document.getElementById('draftsPanel').textContent));
 await page.click('[data-pgroup="short"]');await page.click('[data-tab="bags"]');await page.waitForTimeout(300);
 assert.match(await text(page,'#bgList .bg-po-done summary'),/✅ وصل من أمر الشرا \(آخر 3 أيام\): 2 صنف/);
 await page.click('#bgList .bg-po-done summary');
 assert.match(await text(page,'#bgList .bg-po-done'),/RECEIVED ONE وصل 3 الفاتورة: 11\/26\/100001 AMG/);
 assert.match(await text(page,'#bgList .bg-po-done'),/RECEIVED TWO وصل 1 من 4 الفاتورة: 11\/26\/100002 SKY/,'it came short: how many of how many');
 assert.doesNotMatch(await text(page,'#bgList .bg-po-done'),/OLD RECEIVED/,'only the last 3 days');
 await openBag('2428');
 // tick two, «حوّل» shows every other bag (where they are now greyed), pick «نواقص كل الشركات», move
 await page.click('#bgList [data-pick="11"]');await page.click('#bgList [data-pick="12"]');
 assert.equal((await page.textContent('#bgMoveBtn')).trim(),'⇄ حوّل (2)');
 await page.click('#bgMoveBtn');
 assert.deepEqual(await page.$$eval('#bgSheet [data-to]',b=>b.map(x=>x.dataset.to)),['pv','gs','2495','2274','2576','7'],'every bag, the general shortages and the empty Ibn Sina bag too');
 assert.match(await text(page,'#bgSheet .bg-dest.cur'),/نواقص يوميه هنا دلوقتي/);
 assert.ok(await page.$eval('#bgSheet',s=>s.parentElement===document.body&&!s.classList.contains('hidden')),'the sheet is on the page itself, over everything');
 // a tap on the dark part closes it; open it again
 await page.mouse.click(200,40);assert.ok(await page.$eval('#bgSheet',s=>s.classList.contains('hidden')),'closed by the dark part');
 await page.click('#bgMoveBtn');
 await page.click('#bgSheet [data-to="pv"]');
 assert.equal(await text(page,'#bgGo'),'حوّل لـ نواقص كل الشركات');
 await page.click('#bgGo');
 await page.waitForFunction(()=>/اتحوّل 2 صنف لـ/.test(document.getElementById('bgList').textContent));
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_bag_moves.map(m=>[m.item_id,m.item_name,m.from_bag,m.to_bag,m.status,m.item.need])),[[11,'DAILY ONE','2428','pv','pending',16],[12,'DAILY TWO','2428','pv','pending',6]]);
 assert.ok(await page.$eval('#bgSheet',s=>s.classList.contains('hidden')),'the sheet closes');
 assert.deepEqual(await chips(),[['نواقص يوميه 1',false],['نواقص كل الشركات 3',true],['IBN SINA 1 0',true],['فارما مول 1',true],['zad pharma 2',true],['نقدى 0',true]],'they show in their new bag at once');
 // undo: both moves cancelled, back in the daily bag
 await page.click('#bgList [data-undo]');
 await page.waitForFunction(()=>/نواقص يوميه\s*3/.test(document.getElementById('bgList').textContent));
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_bag_moves.map(m=>m.status)),['cancelled','cancelled']);
 // a move to an empty bag makes it show, the item marked «لسه في فارمافلاي» with where it came from
 await page.click('#bgList [data-pick="13"]');await page.click('#bgMoveBtn');await page.click('#bgSheet [data-to="7"]');await page.click('#bgGo');
 await page.waitForFunction(()=>/نقدى\s*1/.test(document.getElementById('bgList').textContent));
 await openBag('7');
 assert.match(await text(page,'#bgList'),/DAILY THREE ⏳ لسه في فارمافلاي .* جاي من نواقص يوميه/);
 // the two quick buttons: «أجّل» → «نواقص كل الشركات», «للنواقص العامة» → 'gs' (none shown for the bag they are already in)
 await openBag('2428');await page.click('#bgList [data-pick="12"]');
 assert.deepEqual(await page.$$eval('#bgBar button',b=>b.map(x=>x.textContent.trim())),['🛒 أمر شراء (1)','⇄ حوّل (1)','للنواقص العامة','أجّل','إلغاء']);
 await page.click('#bgBar [data-quick="pv"]');
 await page.waitForFunction(()=>/اتحوّل 1 صنف لـ\s*نواقص كل الشركات/.test(document.getElementById('bgList').textContent));
 await page.click('#bgList [data-pick="11"]');await page.click('#bgBar [data-quick="gs"]');
 await page.waitForFunction(()=>/النواقص العامة\s*1/.test(document.getElementById('bgList').textContent));
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_bag_moves.filter(m=>m.status==='pending').map(m=>[m.item_id,m.to_bag]).sort()),[[11,'gs'],[12,'pv'],[13,'7']]);
 await openBag('pv');await page.click('#bgList [data-pick="21"]');
 // a second tap on the open bag closes it
 await page.click('#bgList [data-bag="pv"]');assert.equal(await page.$$eval('#bgList .bg-bag.open',b=>b.length),0);await openBag('pv');await page.click('#bgList [data-pick="21"]');
 assert.deepEqual(await page.$$eval('#bgBar button',b=>b.map(x=>x.textContent.trim())),['🛒 أمر شراء (1)','⇄ حوّل (1)','للنواقص العامة','إلغاء'],'no «أجّل» inside «كل الشركات»');
 await page.click('[data-group="home"]');
 // a home row opens «الصلاحيات» on its view
 await page.click('#todoList .todo-row[data-view="expired"]');
 await page.waitForFunction(()=>!document.getElementById('expiryPanel').classList.contains('hidden')&&/SOLONAL/.test(document.getElementById('alExpiry').textContent));
 assert.match(await text(page,'#alExpiry'),/منتهية وليها رصيد 1 SOLONAL FACIAL WASH 06\/2026 · 1 علبة · حوالي 150 ج 06\/2026: 1/);
 assert.equal(await page.$eval('[data-tab="expiry"]',b=>b.dataset.badge),'2','the small tab has its number');
 // the item's small photo beside its name (owner 2026-11-21), the batches stay full width below
 assert.equal(await page.$eval('#alExpiry .al-item > .im-lrow > .im-th',b=>b.dataset.im),'68195','«منتهية»: the photo of the item, by its number');
 assert.equal(await page.$$eval('#alExpiry .al-item > .al-batches',b=>b.length),1);
 // today: the mix-up with its batches, the negative sale; the older one under «آخر 7 أيام»
 await page.click('[data-al-view="today"]');
 const today=await text(page,'#alExpiry');
 assert.match(today,/صلاحيات اتلخبطت من البيع 1 LAMIFEN CREAM 15GM النهارده 2 مرة · 5 في 7 أيام · آخر مرة 10:34 م 07\/2028: 2 .* 09\/2028: 3/);
 assert.match(today,/بيع بالسالب 1 EZAPRIL-CO 72 TAB/);assert.match(today,/آخر 7 أيام \(قبل النهارده\): 1 صنف/);
 assert.deepEqual(await page.$$eval('#alExpiry .al-item > .im-lrow > .im-th',b=>b.map(x=>x.dataset.im)),['20731','66358','2'],'«النهارده»: a photo on every card, the older one under «آخر 7 أيام» too');
 await page.click('[data-al-view="soon"]');assert.match(await text(page,'#alExpiry'),/هتخلص خلال 3 شهور 1 SOON ITEM 01\/2027/);
 assert.equal(await page.$eval('#alExpiry .al-item > .im-lrow > .im-th',b=>b.dataset.im),'9','«هتخلص»: the photo of the item');
 // a tap on the photo opens «تعديل الصنف» and writes nothing
 await page.click('#alExpiry .al-item .im-th[data-im="9"]');await page.waitForSelector('#imSheet:not([hidden])');await page.click('#imSheet .im-x');
 // customers above the limit, and close to it
 await page.click('[data-group="accounts"]');await page.waitForFunction(()=>/عميل تجربة/.test(document.getElementById('alCustomers').textContent));
 const cust=await text(page,'#alCustomers');
 assert.match(cust,/1 عدّوا الحد 781 عليهم فلوس 388,218 ج إجمالي/);
 assert.match(cust,/عميل تجربة عليه 5,400 ج · الحد 1,000 ج · زيادة 4,400 ج/);
 assert.match(cust,/قربوا من الحد \(90% أو أكتر\) 1 عميل قريب .* 95% من الحد/);
 // ⚙️: a sound per section, kept on the phone
 await page.click('#settingsBtn');
 assert.deepEqual(await page.$$eval('#notifySounds [data-sound]',s=>s.map(x=>x.dataset.sound+':'+x.value)),['incoming:pop','docs:ding','expiry:double','customers:alert','store:bell','care:pop','bags:ding','pay:alert']);
 await page.selectOption('#notifySounds [data-sound="store"]','pop');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker-notify-sounds')).store),'pop');
 // a new store order: the number goes up (the notification itself needs the phone's permission)
 await page.evaluate(()=>{window.__tables.ar_store_orders.push({id:3,status:'new'})});
 await page.evaluate(()=>window.AskerNotify.tick());
 assert.equal(await page.$eval('[data-group="sales"]',b=>b.dataset.badge),'2');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker-notify-seen')).store),2);
 // nothing else was written to the server (only his moves between bags; the item sheet only asks whether he may edit: ar_staff_can)
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.filter(w=>!/ar_sync_log|ar_bag_moves|ar_po_items|ar_item_dups|ar_staff_can/.test(JSON.stringify(w)))),[]);
},{home:true});
run('alerts: no file yet',async({page})=>{
 await page.click('[data-group="purchases"]');await page.click('[data-pgroup="stock"]');await page.click('[data-tab="expiry"]');
 await page.waitForFunction(()=>/لسه مفيش تنبيهات/.test(document.getElementById('alAge').textContent));
 assert.ok(await page.$eval('#todoCard',c=>c.classList.contains('hidden')),'nothing on the home card');
},{home:true});
