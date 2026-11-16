// «الأولى بالجرد» (owner 2026-11-16, idea 4 of the three he picked): the items most likely wrong, or dearest to get wrong, first, with
// their reasons; «اعرض N كمان»; counting one removes it; what was counted in the last 30 days is not listed. Made-up items only.
const {run,text,assert}=require('./harness.cjs');
const mk=(i,v,b)=>({i,n:'ITEM '+i,s:3,p:1,v,b:b||[{x:'2029-01',k:1,u:0}]});
const DATA={data_at:'2026-11-16T03:00:00',store:1,sections:[{i:3,n:'TABLETS + CAPSULES'}],items:[
 mk(1,5),                                   // sold negative, but counted 2 days ago: left out
 mk(2,5,[{x:'2029-01',k:-2,u:0}]),          // a negative balance in PharmaFly: 60
 mk(3,99999),                               // the dearest: 30
 ...Array.from({length:35},(_,k)=>mk(100+k,5)), // mixed up by the sales: 35 each
]};
run('Count first: ranked by what is likely wrong, with the reasons, paged, counted ones leave',async({page,table})=>{
 await page.evaluate(([d,at])=>{window.__storage['count/stock.json']=JSON.stringify(d);
  window.__tables.ar_count_entries=[{id:'e-recent',item_id:1,item_name:'ITEM 1',counted_at:at,result:'ok',diffs:[],system:[],parts:1,section_from:3,section_to:null,note:null,status:'pending'}];
  localStorage.removeItem('asker-ct-queue');localStorage.removeItem('asker-ct-data');
  // the alerts' lists (sold negative / mixed batches / sold expired), as the bot's alerts page parsed them
  const real=window.AskerAlerts.data;window.AskerAlerts.data=()=>({...(real()||{}),negative:[{id:1}],mix:Array.from({length:35},(_,k)=>({id:100+k})),expiredSold:[]});   // the rest of the alerts' shape stays (the home reads it too)
 },[DATA,new Date(Date.now()-2*864e5).toISOString()]);
 await page.click('[data-pgroup="stock"]');
 await page.click('.subbar [data-tab="count"]');
 await page.waitForSelector('#ctSecList [data-ct-open]');
 assert.deepEqual(await page.$$eval('[data-ct-view]',b=>b.map(x=>x.dataset.ctView)),['sections','priority','results'],'the third small tab');
 await page.click('[data-ct-view="priority"]');
 await page.waitForSelector('#ctPrioList .ct-prio');
 assert.equal(await page.$eval('#ctPriority',e=>e.classList.contains('hidden')),false);
 assert.equal(await page.$eval('#ctSections',e=>e.classList.contains('hidden')),true);
 // 37 items listed (the recently counted one is not), 30 shown, the negative balance first
 assert.equal(await text(page,'#ctPrioCount'),'37 صنف');
 assert.equal(await page.$$eval('#ctPrioList .ct-prio',c=>c.length),30);
 assert.equal(await page.$eval('#ctPrioList .ct-prio [data-ct]',e=>e.dataset.ct),'2','a negative balance (60) first');
 assert.match(await text(page,'#ctPrioList .ct-prio'),/رصيده بالسالب في فارمافلاي[\s\S]*ITEM 2/);
 assert.equal(await page.$('#ctPrioList [data-ct="1"]'),null,'counted 2 days ago: left out');
 assert.match(await text(page,'#ctPrioList .ct-prio:nth-child(2)'),/صلاحياته اتلخبطت من البيع/);
 assert.equal(await page.$('#ctPrioList [data-ct="3"]'),null,'the dearest (30) is after the mixed ones (35): on the next page');
 // «اعرض 7 كمان»: the rest, the dearest last with its value
 assert.match(await text(page,'#ctPrioList [data-ct-prio-more]'),/اعرض 7 كمان/);
 await page.click('#ctPrioList [data-ct-prio-more]');
 assert.equal(await page.$$eval('#ctPrioList .ct-prio',c=>c.length),37);
 assert.match(await text(page,'#ctPrioList .ct-prio:last-child'),/قيمته كبيرة \(99,999 ج\)[\s\S]*ITEM 3/);
 // «✓ مظبوط» on the first: it is saved and leaves the list
 await page.click('#ctPrioList [data-ct="2"] [data-ct-ok]');
 await page.waitForFunction(()=>window.__tables.ar_count_entries.some(e=>e.item_id===2));
 assert.equal(await page.$('#ctPrioList [data-ct="2"]'),null,'counted: it leaves the list');
 assert.equal(await text(page,'#ctPrioCount'),'36 صنف');
 // «فيه فرق» works inside this list too, and the other tabs are untouched
 await page.click('#ctPrioList [data-ct="100"] [data-ct-edit]');
 assert.ok(await page.$('#ctPrioList [data-ct="100"] [data-ct-save]'),'the editor opens in place');
 await page.click('[data-ct-view="sections"]');
 assert.equal(await page.$eval('#ctPriority',e=>e.classList.contains('hidden')),true);
 assert.equal(await page.$eval('#ctSections',e=>e.classList.contains('hidden')),false);
});
