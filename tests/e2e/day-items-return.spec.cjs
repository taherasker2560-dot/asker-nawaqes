// «↩️ رجّعه» on «الأصناف يوم بيوم» (owner 2026-11-28: «زرار في كل صنف اللي انا عايز ارجعه يتعمل له عمليه مرتجع … ويعمل لي لسته … اعمل بيها تفويض للمستخدمين اللي معايا»,
// and for a customer's return «على فاتورته اللى جاى بيها»): the owner marks a lot on the invoice the laptop wrote beside the item (mv + ex), the boxes offered = what is in hand up to what came;
// the mark goes to ar_return_marks (the list «↩️ مرتجعات» the staff with «تجهيز المرتجعات» prepare). Made-up items and numbers only (a public repo).
const {run,assert}=require('./harness.cjs');
const seed=(page)=>page.evaluate(()=>{
 const ok={r:true,g:true,q:true},days={},files={};
 const day=(k)=>'2026-11-'+String(k).padStart(2,'0');
 for(let k=1;k<=29;k++){days[day(k)]={r:0,rv:0,nw:0,z:0,zo:[],ok};files[day(k)]={v:1,date:day(k),ok,r:[],nw:[],z:[]}}
 Object.assign(days[day(27)],{r:1,rv:29,nw:0,z:2,zo:[]});
 Object.assign(files[day(27)],{
  r:[{i:901,n:'EXAMPLE SYRUP CHILD',q:1,v:29,t:'21:43',tk:1,mv:5001,ex:'2027-06-30',s:'مورد ب',ed:'2026-11-10'}],
  z:[{i:904,n:'EXAMPLE ORDERED DROPS',s:'مورد أ',q:10,at:'20:22',why:['r'],mv:5002,ex:'2028-01-31'},{i:905,n:'EXAMPLE NOT IN HAND',s:'مورد أ',q:1,at:'20:30',why:['r'],mv:5002,ex:''}]});
 window.__storage['day/items.json']=JSON.stringify({v:1,today:day(29),data_at:day(29)+' 00:20:00',days});
 for(const k in files)window.__storage['day/i_'+k+'.json']=JSON.stringify(files[k]);
 window.__storage['day/items_stock.json']=JSON.stringify({v:1,data_at:day(29)+' 00:20:00',s:{901:[4,1],904:[8,1],905:[0,1]}});
 window.__tables.ar_waitlist=[];
 const T=window.__tables;
 T.ar_vendors=[{id:71,name:'مورد أ',short:'مورد أ'},{id:72,name:'مورد ب',short:'مورد ب'}];
 T.ar_store_items=[{id:901,name:'EXAMPLE SYRUP CHILD',arabic_name:''},{id:904,name:'EXAMPLE ORDERED DROPS',arabic_name:''},{id:905,name:'EXAMPLE NOT IN HAND',arabic_name:''}];
 T.ar_vendor_moves=[{id:5001,kind:'purchase',vendor_id:72,code:'11/10/1001',at:'2026-11-10 12:00:00',lines:[{i:901,x:'2027-06-30',p:6,b:0,k:1,u:0}]},
  {id:5002,kind:'purchase',vendor_id:71,code:'11/27/2002',at:'2026-11-27 20:22:00',lines:[{i:904,x:'2028-01-31',p:10,b:0,k:1,u:0},{i:905,x:'',p:1,b:0,k:1,u:0}]}];
 T.ar_return_marks=[];
 let next=1;
 window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{
  ar_return_sync:()=>({ok:true,closed:0,touched:0}),
  ar_return_mark:a=>{const m=T.ar_vendor_moves.find(x=>x.id===a.p_move),it=T.ar_store_items.find(x=>x.id===a.p_item),v=T.ar_vendors.find(x=>x.id===m.vendor_id);
   const l=m&&m.lines.find(x=>x.i===a.p_item&&(x.x||null)===(a.p_x||null));if(!l)return {ok:false,error:'line'};
   if(a.p_units>(l.p+l.b)*l.k+l.u)return {ok:false,error:'units'};
   const r={id:next++,move_id:a.p_move,vendor_id:m.vendor_id,vendor_name:v.short,code:m.code,invoiced_at:m.at,item_id:a.p_item,item_name:it.name,item_ar:it.arabic_name,expiry:a.p_x,k:l.k,units:a.p_units,returned_units:0,status:'marked',marked_at:new Date().toISOString(),prepared_by:null};
   T.ar_return_marks.push(r);window.__marked=(window.__marked||[]).concat([a]);return {ok:true,id:r.id}},
  ar_return_unmark:a=>{const r=T.ar_return_marks.find(x=>x.id===Number(a.p_id));if(!r)return {ok:false,error:'state'};r.status='cancelled';return {ok:true,id:r.id}}});
});
const openReport=async(page,key)=>{await page.click('#spareBar .sp-slot >> nth=0');await page.waitForSelector('#reportsPanel:not(.hidden) .rp-card');await page.click(`#rpMain [data-rp="${key}"]`);await page.waitForSelector('#dayItemsPanel:not(.hidden) #diFrom',{state:'attached'})};
const openDay=async(page,d)=>{await page.waitForSelector(`#diMain [data-di-open="${d}"]`);if(!(await page.$eval(`#diMain [data-di-open="${d}"]`,b=>b.getAttribute('aria-expanded')==='true')))await page.click(`#diMain [data-di-open="${d}"]`);await page.waitForSelector('#diMain .di-block.open .di-row')};

run('Items by day: «↩️ رجّعه» marks the lot on the invoice it came on; nothing in hand = no button',async({page})=>{
 await seed(page);
 await openReport(page,'izero');
 await openDay(page,'2026-11-27');
 const rows=()=>page.$$eval('#diMain .di-block.open .di-row',r=>r.map(x=>({n:x.querySelector('b').textContent.trim(),btn:!!x.querySelector('[data-di-ret]')})));
 assert.deepEqual(await rows(),[{n:'EXAMPLE ORDERED DROPS',btn:true},{n:'EXAMPLE NOT IN HAND',btn:false}],'stock 0: nothing to send back');
 await page.click('#diMain [data-di-ret]');
 await page.waitForSelector('#diMain .di-ret-box [data-di-qty]');
 assert.equal(await page.inputValue('#diMain [data-di-qty]'),'8','what is in hand (8), not more than came (10)');
 assert.match(await page.textContent('#diMain .di-ret-inv'),/على فاتورة\s*مورد أ\s*اللي جه بيها\s*\(27\/11\)/);
 await page.setViewportSize({width:412,height:900});await page.$eval('#diMain .di-ret-box',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:'test-results/day-items-return.png'});
 // more than the stock: refused before the server
 await page.fill('#diMain [data-di-qty]','9');await page.click('#diMain [data-di-ret-ok]');
 await page.waitForFunction(()=>/أكبر من رصيدك/.test(document.querySelector('#diMain .di-ret-box')?.textContent||''));
 await page.fill('#diMain [data-di-qty]','5');await page.click('#diMain [data-di-ret-ok]');
 await page.waitForSelector('#diMain .rm-chip');
 assert.match(await page.textContent('#diMain .rm-chip'),/مطلوب إرجاعه/);
 assert.deepEqual(await page.evaluate(()=>window.__marked),[{p_move:5002,p_item:904,p_x:'2028-01-31',p_units:5}],'on the invoice it came on, its expiry, 5 boxes');
 // the mark can be taken off again
 await page.click('#diMain [data-di-unmark]');
 await page.waitForSelector('#diMain [data-di-ret]');
},{home:true});
run('Items by day: a customer\'s return goes back on the invoice that box came on',async({page})=>{
 await seed(page);
 await openReport(page,'iret');
 await openDay(page,'2026-11-27');
 await page.click('#diMain [data-di-ret]');
 await page.waitForSelector('#diMain .di-ret-box');
 assert.equal(await page.inputValue('#diMain [data-di-qty]'),'1','what came back (1), the stock is 4');
 assert.match(await page.textContent('#diMain .di-ret-inv'),/مورد ب.*\(10\/11\)/);
 await page.click('#diMain [data-di-ret-ok]');
 await page.waitForSelector('#diMain .rm-chip');
 assert.deepEqual(await page.evaluate(()=>window.__marked),[{p_move:5001,p_item:901,p_x:'2027-06-30',p_units:1}]);
},{home:true});
