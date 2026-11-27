// «الأصناف يوم بيوم» (owner 2026-11-28, «صح ابعتها» to the rule): three reports of «📊 التقارير» on one screen: the sales returns, the new items, and the old items that arrived to an empty shelf with
// why they are shown (a general shortage that came, by request, many of a slow one, waited for), the stock now beside each, a day at a time with the list of days. The laptop's files are played here.
// Made-up items, suppliers and numbers only: the repository is public.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const all=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const shot=async(page,name)=>{if(process.env.SHOT_DIR)await page.screenshot({path:process.env.SHOT_DIR+'/'+name+'.png',fullPage:true})};
const seed=(page)=>page.evaluate(()=>{
 const ok={r:true,g:true,q:true},old={r:true,g:true,q:false};
 const days={'2026-11-28':{r:0,nw:0,z:0,zo:[],ok},'2026-11-29':{r:0,nw:0,z:0,zo:[],ok},'2026-11-27':{r:2,nw:1,z:3,zo:[905,906],ok:old},'2026-11-26':{r:0,nw:0,z:0,zo:[],ok:old}};
 window.__storage['day/items.json']=JSON.stringify({v:1,today:'2026-11-29',data_at:'2026-11-29 00:20:00',days});
 const z=(i,n,q,at,why,m)=>Object.assign({i,n,s:'مورد مثال',q,at,why},m!=null?{m}:{});
 window.__storage['day/i_2026-11-27.json']=JSON.stringify({v:1,date:'2026-11-27',ok:old,
  r:[{i:901,n:'EXAMPLE SYRUP CHILD',q:0.5,v:29,t:'21:43',tk:1},{i:902,n:'EXAMPLE 3MG 30TAB',q:0.667,v:58,t:'15:08',tk:2}],
  nw:{i:903,n:'EXAMPLE NEW SHAMPOO',s:'مورد مثال',q:1,pr:250},
  z:[z(904,'EXAMPLE GENERAL CAPS',2,'18:00',['g']),z(905,'EXAMPLE WAITED GEL',1,'19:00',[]),z(906,'EXAMPLE PLAIN TAB',1,'19:30',[]),z(907,'EXAMPLE SLOW CREAM',6,'20:00',['b'],0.7),z(908,'EXAMPLE ORDERED DROPS',1,'20:30',['r'])]});
 window.__storage['day/i_2026-11-28.json']=JSON.stringify({v:1,date:'2026-11-28',ok,r:[],nw:[],z:[]});
 window.__storage['day/i_2026-11-29.json']=JSON.stringify({v:1,date:'2026-11-29',ok,r:[],nw:[],z:[]});
 window.__storage['day/items_stock.json']=JSON.stringify({v:1,data_at:'2026-11-29 00:20:00',s:{901:[20,1],902:[3.6667,3],903:[0,1],904:[2,1],905:[1,1],906:[1,1],907:[6,1],908:[0,2]}});
 window.__tables.ar_waitlist=[{item_id:905,status:'arrived',created_at:'2026-11-25T10:00:00',closed_at:null},{item_id:906,status:'cancelled',created_at:'2026-11-25T10:00:00',closed_at:'2026-11-26T10:00:00'}];
});

run('Items by day: the three cards of «التقارير», the rows with the stock now and the reasons, the list of days',async({page})=>{
 await seed(page);
 await page.click('#spareBar .sp-slot >> nth=0');await page.waitForSelector('#reportsPanel:not(.hidden) .rp-card');
 assert.deepEqual((await all(page,'#rpMain .rp-grid:first-of-type .rp-card b')),['مرتجعات البيع','أصناف جديدة','جه ورصيده صفر']);
 await shot(page,'items-reports');
 await page.click('#rpMain [data-rp="izero"]');
 await page.waitForSelector('#dayItemsPanel:not(.hidden) #diDate',{state:'attached'});
 await page.waitForFunction(()=>/مفيش في اليوم ده/.test(document.getElementById('diMain').textContent));
 assert.ok(await page.isVisible('#rpBack'),'«‹ التقارير» on top');
 // today (29) and yesterday (28) have nothing and yesterday is a day in the file: it opens on the day that is over
 assert.equal(await page.inputValue('#diDate'),'2026-11-28');
 await page.click('#dayItemsPanel [data-di-day="2026-11-27"]');await page.waitForFunction(()=>document.querySelectorAll('#diMain .di-row').length===4);
 assert.equal(await page.$eval('[data-di-kind="z"]',(b)=>b.classList.contains('on')),true,'the card he tapped picked the report');
 assert.deepEqual(await all(page,'#diMain .di-row b.notr'),['EXAMPLE GENERAL CAPS','EXAMPLE WAITED GEL','EXAMPLE SLOW CREAM','EXAMPLE ORDERED DROPS'],'by arrival; the plain one and the cancelled wait are not shown');
 assert.deepEqual(await all(page,'#diMain .di-why'),['نواقص جت','كان في الانتظار','كمية كبيرة بيعه حوالي 0.7 في الشهر','بالطلب']);
 assert.match(await txt(page,'#diMain .di-sum'),/4 أصناف .*نواقص جت 1 · بالطلب 1 · كمية كبيرة 1 · كان في الانتظار 1/);
 assert.deepEqual(await all(page,'#diMain .di-st'),['رصيده : 2 علبة','رصيده : 1 علبة','رصيده : 6 علب','رصيده : صفر']);
 assert.match(await txt(page,'#diMain .dy-stamp'),/الرصيد والبيانات لحد 12:20 ص \(آخر نسخة\)/);
 assert.match(await txt(page,'#diMain'),/الأيام قبل 28\/11: «بالطلب» مش محسوبة/);
 assert.match(await txt(page,'[data-di-day="2026-11-27"]'),/27 نوفمبر 4 أصناف ‹/,'the day\'s count with the waited one');
 assert.match(await txt(page,'[data-di-day="2026-11-26"]'),/مفيش/);
 await shot(page,'items-zero');
 // returns: the latest first, the loose units said
 await page.click('[data-di-kind="r"]');
 assert.deepEqual(await all(page,'#diMain .di-row b.notr'),['EXAMPLE SYRUP CHILD','EXAMPLE 3MG 30TAB']);
 assert.match(await txt(page,'#diMain .di-sum'),/2 صنف في 2 تذكرة 87 ج/);
 assert.deepEqual(await all(page,'#diMain .di-row small'),['رجع ½ علبة · 29 ج · 9:43 م','رجع 2 وحدة · 58 ج · 3:08 م']);
 assert.deepEqual(await all(page,'#diMain .di-st'),['رصيده : 20 علبة','رصيده : 3 علب + 2 وحدة']);
 await shot(page,'items-returns');
 // new items
 await page.click('[data-di-kind="n"]');
 assert.deepEqual(await all(page,'#diMain .di-row small'),['مورد مثال · جه 1 · الجمهور 250']);
 assert.deepEqual(await all(page,'#diMain .di-st'),['رصيده : صفر']);
 // the arrows go a day at a time and stop at the ends
 await page.click('[data-di-next]');await page.waitForFunction(()=>document.getElementById('diDate').value==='2026-11-28');
 await page.click('[data-di-next]');await page.waitForFunction(()=>document.getElementById('diDate').value==='2026-11-29');
 assert.equal(await page.isDisabled('[data-di-next]'),true);
 assert.match(await txt(page,'#diMain'),/مفيش في اليوم ده\./);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the phone');
});

run('Items by day: no file yet says so; a staff member does not reach it',async({page})=>{
 await page.evaluate(()=>window.AskerApp.showTab('dayitems'));
 await page.waitForFunction(()=>/الصفحة محتاجة ملف الأصناف من اللاب/.test(document.getElementById('diMain').textContent));
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;window.AskerStaff.fixTab=(t)=>window.AskerStaffLib.fixTab(t,[]);window.AskerApp.showTab('dayitems')});
 assert.equal(await page.$eval('#dayItemsPanel',(x)=>x.classList.contains('hidden')),true);
});
