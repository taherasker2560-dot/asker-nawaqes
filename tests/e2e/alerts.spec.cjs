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
 counts:{}});
run('alerts: home card, red numbers, «الصلاحيات», customers, sounds',async({page})=>{
 await page.evaluate((o)=>{window.__storage['alerts/alerts.json']=JSON.stringify(o);window.__tables.ar_store_orders=[{id:1,status:'new'},{id:2,status:'done'}];window.__tables.ar_documents=[{id:'d1',status:'new'}];},file());
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForFunction(()=>!document.getElementById('todoCard').classList.contains('hidden'));
 // «محتاج شغل»: the invoices, the store order, today's mix-up and negative sale, the expired stock, the customer
 const rows=await page.$$eval('#todoList .todo-row',r=>r.map(x=>[...x.children].map(c=>c.textContent.trim()).join(' ')));
 assert.deepEqual(rows,['1 صورة مستنية في الفواتير','1 طلب جديد من الموقع','1 صنف صلاحياته اتلخبطت من البيع النهارده','1 صنف اتباع بالسالب النهارده','1 صنف منتهي الصلاحية وليه رصيد','1 عميل عدّى الحد']);
 // red numbers: purchases = invoices 1 + today's expiry 2, accounts = 1, sales = 1
 assert.deepEqual(await page.$$eval('.bottomnav [data-group]',b=>b.map(x=>[x.dataset.group,x.dataset.badge||''])),[['home',''],['purchases','3'],['accounts','1'],['sales','1'],['care','']]);
 // a home row opens «الصلاحيات» on its view
 await page.click('#todoList .todo-row[data-view="expired"]');
 await page.waitForFunction(()=>!document.getElementById('expiryPanel').classList.contains('hidden')&&/SOLONAL/.test(document.getElementById('alExpiry').textContent));
 assert.match(await text(page,'#alExpiry'),/منتهية وليها رصيد 1 SOLONAL FACIAL WASH 06\/2026 · 1 علبة · حوالي 150 ج 06\/2026: 1/);
 assert.equal(await page.$eval('[data-tab="expiry"]',b=>b.dataset.badge),'2','the small tab has its number');
 // today: the mix-up with its batches, the negative sale; the older one under «آخر 7 أيام»
 await page.click('[data-al-view="today"]');
 const today=await text(page,'#alExpiry');
 assert.match(today,/صلاحيات اتلخبطت من البيع 1 LAMIFEN CREAM 15GM النهارده 2 مرة · 5 في 7 أيام · آخر مرة 10:34 م 07\/2028: 2 .* 09\/2028: 3/);
 assert.match(today,/بيع بالسالب 1 EZAPRIL-CO 72 TAB/);assert.match(today,/آخر 7 أيام \(قبل النهارده\): 1 صنف/);
 await page.click('[data-al-view="soon"]');assert.match(await text(page,'#alExpiry'),/هتخلص خلال 3 شهور 1 SOON ITEM 01\/2027/);
 // customers above the limit, and close to it
 await page.click('[data-group="accounts"]');await page.waitForFunction(()=>/عميل تجربة/.test(document.getElementById('alCustomers').textContent));
 const cust=await text(page,'#alCustomers');
 assert.match(cust,/1 عدّوا الحد 781 عليهم فلوس 388,218 ج إجمالي/);
 assert.match(cust,/عميل تجربة عليه 5,400 ج · الحد 1,000 ج · زيادة 4,400 ج/);
 assert.match(cust,/قربوا من الحد \(90% أو أكتر\) 1 عميل قريب .* 95% من الحد/);
 // ⚙️: a sound per section, kept on the phone
 await page.click('#settingsBtn');
 assert.deepEqual(await page.$$eval('#notifySounds [data-sound]',s=>s.map(x=>x.dataset.sound+':'+x.value)),['incoming:pop','docs:ding','expiry:double','customers:alert','store:bell']);
 await page.selectOption('#notifySounds [data-sound="store"]','pop');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker-notify-sounds')).store),'pop');
 // a new store order: the number goes up (the notification itself needs the phone's permission)
 await page.evaluate(()=>{window.__tables.ar_store_orders.push({id:3,status:'new'})});
 await page.evaluate(()=>window.AskerNotify.tick());
 assert.equal(await page.$eval('[data-group="sales"]',b=>b.dataset.badge),'2');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker-notify-seen')).store),2);
 // nothing was written to the server
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.filter(w=>!/ar_sync_log/.test(JSON.stringify(w)))),[]);
},{home:true});
run('alerts: no file yet',async({page})=>{
 await page.click('[data-group="purchases"]');await page.click('[data-pgroup="stock"]');await page.click('[data-tab="expiry"]');
 await page.waitForFunction(()=>/لسه مفيش تنبيهات/.test(document.getElementById('alAge').textContent));
 assert.ok(await page.$eval('#todoCard',c=>c.classList.contains('hidden')),'nothing on the home card');
},{home:true});
