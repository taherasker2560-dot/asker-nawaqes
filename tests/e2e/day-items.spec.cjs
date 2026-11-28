// «الأصناف يوم بيوم» (owner 2026-11-28, «صح ابعتها» to the rule): three reports of «📊 التقارير» on one screen: the sales returns, the new items, and the old items that arrived to an empty shelf with
// why they are shown (a general shortage that came, by request, many of a slow one, waited for), the stock now beside each. Over a period he picks (his word the same day: «من يوم كذا ليوم كذا لحد شهر…
// عشان أقارن»): «من يوم» and «لحد يوم», one line per day that opens in place, several or all at once, one day alone. The laptop's files are played here. Made-up items and numbers only (a public repo).
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const all=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const shot=async(page,name)=>{if(process.env.SHOT_DIR)await page.screenshot({path:process.env.SHOT_DIR+'/'+name+'.png',fullPage:true})};
const seed=(page)=>page.evaluate(()=>{
 const ok={r:true,g:true,q:true},old={r:true,g:true,q:false},days={},files={};
 const day=(k)=>'2026-11-'+String(k).padStart(2,'0');
 for(let k=1;k<=29;k++){days[day(k)]={r:0,rv:0,nw:0,z:0,zo:[],ok:k<28?old:ok};files[day(k)]={v:1,date:day(k),ok:k<28?old:ok,r:[],nw:[],z:[]}}
 const z=(i,n,q,at,why,m)=>Object.assign({i,n,s:'مورد مثال',q,at,why},m!=null?{m}:{});
 const ret=(i,n,q,v,t,tk)=>({i,n,q,v,t,tk});
 Object.assign(days[day(27)],{r:2,rv:87,nw:1,z:3,zo:[905,906]});
 Object.assign(files[day(27)],{r:[ret(901,'EXAMPLE SYRUP CHILD',0.5,29,'21:43',1),ret(902,'EXAMPLE 3MG 30TAB',0.667,58,'15:08',2)],nw:{i:903,n:'EXAMPLE NEW SHAMPOO',s:'مورد مثال',q:1,pr:250},
  z:[z(904,'EXAMPLE GENERAL CAPS',2,'18:00',['g']),z(905,'EXAMPLE WAITED GEL',1,'19:00',[]),z(906,'EXAMPLE PLAIN TAB',1,'19:30',[]),z(907,'EXAMPLE SLOW CREAM',6,'20:00',['b'],0.7),z(908,'EXAMPLE ORDERED DROPS',1,'20:30',['r'])]});
 // a day written before the index carried the returns' value: the page adds it up from the day's file
 Object.assign(days[day(26)],{r:1});delete days[day(26)].rv;files[day(26)].r=[ret(901,'EXAMPLE SYRUP CHILD',1,10,'12:00',3)];
 Object.assign(days[day(22)],{r:3,rv:300});files[day(22)].r=[ret(903,'EXAMPLE A',1,100,'10:00',4),ret(904,'EXAMPLE B',2,150,'11:00',4),ret(907,'EXAMPLE C',1,50,'12:00',5)];
 window.__storage['day/items.json']=JSON.stringify({v:1,today:day(29),data_at:day(29)+' 00:20:00',days});
 for(const k in files)window.__storage['day/i_'+k+'.json']=JSON.stringify(files[k]);
 window.__storage['day/items_stock.json']=JSON.stringify({v:1,data_at:day(29)+' 00:20:00',s:{901:[20,1],902:[3.6667,3],903:[0,1],904:[2,1],905:[1,1],906:[1,1],907:[6,1],908:[0,2]}});
 window.__tables.ar_waitlist=[{item_id:905,status:'arrived',created_at:'2026-11-25T10:00:00',closed_at:null},{item_id:906,status:'cancelled',created_at:'2026-11-25T10:00:00',closed_at:'2026-11-26T10:00:00'}];
});
const period=(page)=>page.evaluate(()=>[document.getElementById('diFrom').value,document.getElementById('diTo').value]);
const waitPeriod=(page,from,to)=>page.waitForFunction(([a,b])=>document.getElementById('diFrom')?.value===a&&document.getElementById('diTo')?.value===b,[from,to]);
const rowsAre=(page,n)=>page.waitForFunction((n)=>document.querySelectorAll('#diMain .di-row').length===n,n);
const openDays=(page)=>page.$$eval('#diMain .di-block.open .di-dl',(b)=>b.map((x)=>x.dataset.diOpen));

run('Items by day over a period: it opens on the last week, a line per day that opens in place, the stock now and the reasons',async({page})=>{
 await seed(page);
 await page.click('#spareBar .sp-slot >> nth=0');await page.waitForSelector('#reportsPanel:not(.hidden) .rp-card');
 assert.deepEqual((await all(page,'#rpMain .rp-grid:first-of-type .rp-card b')),['مرتجعات البيع','أصناف جديدة','جه ورصيده صفر']);
 await page.click('#rpMain [data-rp="izero"]');
 await page.waitForSelector('#dayItemsPanel:not(.hidden) #diFrom',{state:'attached'});
 assert.ok(await page.isVisible('#rpBack'),'«‹ التقارير» on top');
 // today (29) has nothing yet: a week ending on the day that is over
 await waitPeriod(page,'2026-11-22','2026-11-28');
 assert.equal(await page.$eval('[data-di-quick="7"]',(b)=>b.classList.contains('on')),true);
 assert.deepEqual(await all(page,'#diMain .di-quick button'),['يوم','أسبوع','15 يوم','شهر']);
 await rowsAre(page,4);
 assert.deepEqual(await openDays(page),['2026-11-27'],'the newest day that has something is open');
 assert.equal((await all(page,'#diMain .di-dl')).length,7,'a line for each day of the period');
 assert.match((await all(page,'#diMain .di-dl'))[1],/^الجمعة 27\/11 4 أصناف ▴$/,'the day\'s count with the waited one');
 assert.match((await all(page,'#diMain .di-dl'))[0],/^السبت 28\/11 مفيش ▾$/);
 assert.deepEqual(await all(page,'#diMain .di-row b.notr'),['EXAMPLE GENERAL CAPS','EXAMPLE WAITED GEL','EXAMPLE SLOW CREAM','EXAMPLE ORDERED DROPS'],'by arrival; the plain one and the cancelled wait are not shown');
 assert.deepEqual(await all(page,'#diMain .di-why'),['نواقص جت','كان في الانتظار','كمية كبيرة بيعه حوالي 0.7 في الشهر','بالطلب']);
 assert.equal(await txt(page,'#diMain .di-in'),'نواقص جت 1 · بالطلب 1 · كمية كبيرة 1 · كان في الانتظار 1');
 assert.deepEqual(await all(page,'#diMain .di-st'),['رصيده : 2 علبة','رصيده : 1 علبة','رصيده : 6 علب','رصيده : صفر']);
 assert.equal(await txt(page,'#diMain .di-sum'),'7 أيام · 4 أصناف');
 assert.match(await txt(page,'#diMain .dy-stamp'),/الرصيد والبيانات لحد 12:20 ص \(آخر نسخة\)/);
 assert.equal((await txt(page,'#diMain')).split('الأيام قبل 28/11').length-1,1,'what the period misses is said once');
 await shot(page,'range-zero');
 // returns: the period's total and value, the bars compare by value, and the file of the day with no value in the index is read for it
 await page.click('[data-di-kind="r"]');
 await page.waitForFunction(()=>/397/.test(document.querySelector('#diMain .di-sum').textContent));
 assert.equal(await txt(page,'#diMain .di-sum'),'7 أيام · 6 أصناف 397 ج');
 assert.deepEqual(await openDays(page),['2026-11-27'],'the open day stays open on the other report');
 const bars=()=>page.$$eval('#diMain .di-bar i',(b)=>b.map((x)=>x.style.width));
 assert.deepEqual(await bars(),['0%','29%','4%','0%','0%','0%','100%'],'by value: the biggest day full, a small one still seen');
 assert.deepEqual(await all(page,'#diMain .di-row small'),['رجع ½ علبة · 29 ج · 9:43 م','رجع 2 وحدة · 58 ج · 3:08 م']);
 assert.equal(await txt(page,'#diMain .di-in'),'في 2 تذكرة');
 // two days open together; then all; then none
 await page.click('[data-di-open="2026-11-22"]');await rowsAre(page,5);
 assert.deepEqual(await openDays(page),['2026-11-27','2026-11-22']);
 await shot(page,'range-returns');
 assert.equal(await txt(page,'[data-di-all]'),'افتح كل الأيام');
 await page.click('[data-di-all]');await rowsAre(page,6);
 assert.equal(await txt(page,'[data-di-all]'),'اقفل كل الأيام');
 await page.click('[data-di-all]');await rowsAre(page,0);assert.deepEqual(await openDays(page),[]);
 // one day alone: «يوم» keeps the end of the period; it is open, with no «all days»
 await page.click('[data-di-quick="1"]');await waitPeriod(page,'2026-11-28','2026-11-28');
 await page.waitForFunction(()=>/مفيش في اليوم ده\./.test(document.getElementById('diMain').textContent));
 assert.equal(await page.$('[data-di-all]'),null);assert.equal(await txt(page,'#diMain .di-sum'),'0 صنف 0 ج');
 // the arrows move the whole period: a day at a time here
 await page.click('[data-di-shift="-1"]');await waitPeriod(page,'2026-11-27','2026-11-27');await rowsAre(page,2);
 await page.click('[data-di-shift="1"]');await waitPeriod(page,'2026-11-28','2026-11-28');
 // from a day to a day, picked by hand: from after to makes it that day; then back to a longer one
 await page.fill('#diTo','2026-11-27');await waitPeriod(page,'2026-11-27','2026-11-27');
 await page.fill('#diFrom','2026-11-10');await waitPeriod(page,'2026-11-10','2026-11-27');
 assert.equal((await all(page,'#diMain .di-dl')).length,18);
 await page.click('[data-di-shift="-1"]');await waitPeriod(page,'2026-11-01','2026-11-09');
 assert.equal(await page.isDisabled('[data-di-shift="-1"]'),true,'nothing before the first day kept');
 await page.click('[data-di-quick="30"]');await waitPeriod(page,'2026-11-01','2026-11-09');
 // new items over the week
 await page.fill('#diTo','2026-11-28');await waitPeriod(page,'2026-11-01','2026-11-28');
 await page.click('[data-di-quick="7"]');await waitPeriod(page,'2026-11-22','2026-11-28');
 await page.click('[data-di-kind="n"]');await rowsAre(page,1);
 assert.deepEqual(await all(page,'#diMain .di-row small'),['مورد مثال · جه 1 · الجمهور 250']);
 assert.equal(await txt(page,'#diMain .di-sum'),'7 أيام · 1 صنف');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the phone');
});

run('Items by day: no file yet says so; a staff member does not reach it',async({page})=>{
 await page.evaluate(()=>window.AskerApp.showTab('dayitems'));
 await page.waitForFunction(()=>/الصفحة محتاجة ملف الأصناف من اللاب/.test(document.getElementById('diMain').textContent));
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;window.AskerStaff.fixTab=(t)=>window.AskerStaffLib.fixTab(t,[]);window.AskerApp.showTab('dayitems')});
 assert.equal(await page.$eval('#dayItemsPanel',(x)=>x.classList.contains('hidden')),true);
});
