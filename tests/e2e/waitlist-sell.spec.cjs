// «📝 الانتظار» → «🧾 بيعها» (owner 2026-11-22: «جهّز طلبات الانتظار بزرار، ان انا ادوس عليه يعمل لي الصنف بيعة ويدخله هنا في الفواتير»): an ARRIVED request (call these, or a leftover)
// whose item the system knows has a button; it opens «البيع المؤقت» with that item in a new bill (the request's quantity, the customer in the note) and saving the bill marks the request «اتسلّم».
// The server's functions are played here (the real ones are tested in tests/waitlist-migration.cjs). Made-up people and medicines only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const seed=(page)=>page.evaluate(()=>{
 const iso=(d)=>new Date(Date.now()-d*864e5).toISOString();
 window.__tables.ar_store_items=[{id:5,name:'AUGMENTIN 1GM 14 TAB',arabic_name:'اوجمنتين',status:'available',price:160,is_listed:true}];
 window.__tables.ar_stock=[{item_id:5,name:'AUGMENTIN 1GM 14 TAB',arabic_name:'اوجمنتين',price:160,packs:6,units:0,parts:1,exp_near:null,other:[],data_at:'2026-11-12 22:00:00'}];
 window.__tables.ar_customers=[];window.__tables.ar_temp_sales=[];
 window.__tables.ar_waitlist=[{id:3,status:'arrived'}];
 const S=window.__wl={
  waiting:[],
  call:[{id:3,item_id:5,item:'AUGMENTIN 1GM 14 TAB',qty:2,phone:'01012345678',who:'فلان',vendor:'المتحدة للأدوية',by:'stock',return_days:30,arrived_at:iso(0)},
        {id:4,item_id:null,item:'PHARMABILAST ORAL',qty:1,phone:'01111111111',who:null,vendor:'المتحدة للأدوية',by:'manual',return_days:30,arrived_at:iso(0)}],
  left:[],vendors:[{id:10,name:'المتحدة للأدوية',short:'UNIT',kind:'warehouse'}],calls:[]};
 const drop=(list,id)=>{const i=list.findIndex(x=>x.id===id);return i<0?null:list.splice(i,1)[0]};
 window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{
  ar_waitlist_overview:()=>({ok:true,waiting:S.waiting,call:S.call,leftover:S.left,vendors:S.vendors}),
  ar_waitlist_set:(a)=>{S.calls.push([a.p_id,a.p_action]);if(a.p_action==='delivered')drop(S.call,a.p_id);return {ok:true}}});
 });
const openWait=async(page)=>{await page.click('[data-group="purchases"]');await page.click('[data-pgroup="orders"]');await page.click('[data-tab="wait"]');await page.waitForSelector('#wlMain .py-card')};

run('Waiting list «🧾 بيعها»: an arrived request becomes a bill with its item, quantity and customer; saving it marks the request «اتسلّم»; an unknown item has no button',async({page,table})=>{
 await seed(page);
 await openWait(page);
 // the button is on the request whose item the system knows, not on the typed one
 assert.equal((await page.$$('#wlMain [data-wl-sell]')).length,1);
 assert.ok(await page.$('#wlMain [data-wl-sell="3"]'));
 assert.equal(await page.$('#wlMain [data-wl-sell="4"]'),null,'an item the system does not know: no button');
 assert.match(await text(page,'#wlMain [data-wl-sell="3"]'),/بيعها/);
 await page.click('#wlMain [data-wl-sell="3"]');
 // the quick sale opens on a bill with that item, 2 boxes, the customer in the note
 await page.waitForSelector('#tempSalePanel:not(.hidden) #tsCart .ts-line[data-i="0"]',{timeout:15000});
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"]'),/اوجمنتين.*320 ج.*كود 5/,'its Arabic name, 2 boxes at 160, code 5');
 await page.waitForFunction(()=>document.querySelector('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]')?.value==='2',null,{timeout:8000});
 assert.match(await page.inputValue('#tsNote'),/طلب انتظار: فلان · 01012345678/);
 // not saved yet: the request is still waiting to be handed over
 assert.deepEqual(await page.evaluate(()=>window.__wl.calls),[]);
 // saved: the bill is on its way to the robot and the request is «اتسلّم»
 await page.click('#tsSave');
 await page.waitForFunction(()=>(window.__tables.ar_temp_sales||[]).length===1,null,{timeout:10000});
 await page.waitForFunction(()=>window.__wl.calls.length===1,null,{timeout:8000});
 assert.deepEqual(await page.evaluate(()=>window.__wl.calls),[[3,'delivered']]);
 const r=(await table('ar_temp_sales'))[0];
 assert.equal(r.kind,'sale');assert.deepEqual(r.items.map(x=>[x.c,x.q,x.u]),[[5,2,'pack']]);
 assert.match(r.note,/طلب انتظار: فلان/);
});

run('Waiting list «🧾 بيعها»: when the open bill already has items it goes into a new bill',async({page})=>{
 await seed(page);
 // the bill in the sale already has an item
 await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');await page.waitForSelector('#tempSalePanel:not(.hidden)');
 await page.waitForFunction(()=>!/بيحمّل الأصناف/.test(document.getElementById('tsFind').textContent));
 await page.fill('#tsQ','AUGMENTIN');await page.waitForSelector('#tsHits [data-ts-add="5"]');await page.click('#tsHits [data-ts-add="5"]');
 await page.waitForSelector('#tsCart .ts-line[data-i="0"]');
 await openWait(page);
 await page.click('#wlMain [data-wl-sell="3"]');
 await page.waitForSelector('#tempSalePanel:not(.hidden) #tsBills .ts-bill:nth-child(2)',{timeout:15000});
 assert.equal((await page.$$('#tsBills .ts-bill:not(.add)')).length,2,'a second bill');
 await page.waitForFunction(()=>document.querySelector('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]')?.value==='2',null,{timeout:8000});
});
