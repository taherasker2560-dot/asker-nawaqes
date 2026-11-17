// «الطلبيات» (owner 2026-11-17: «رتب صفحة الطلبيات وخلّي النوافذ الجديدة بسهم يفتحها ويقفلها … والوضع التلقائي مقفول»): the orders come first, the windows
// under them (محتاج قرارك, أصناف جديدة, فواتير المندوبين, طلب الجهاز × طلب السيستم) fold with an arrow and start closed; the count stays in the title.
const {run,text,assert}=require('./harness.cjs');
const stmt={generated_at:new Date().toISOString(),items:[{id:101,name:'ZEGAPETS 10MG 28TAB',why:'new',bag:'2428',have:0,sold30:3,min:0,need:1,qty:1,age:5},{id:102,name:'ORCAVI 30 TAB',why:'new',bag:'2428',have:0,sold30:1,min:0,need:1,qty:1,age:9}]};
run('orders page: the orders come first, the windows under them fold with an arrow and start closed',async({page})=>{
 await page.evaluate(o=>{window.__storage['orders/statement.json']=JSON.stringify(o);window.__tables.ar_po_items=[]},stmt);
 await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');
 await page.waitForSelector('#stBox:not(.hidden)');
 // the order in the page: the orders, then the four windows
 const seq=await page.evaluate(()=>[...document.querySelectorAll('#draftsPanel > #odBody, #draftsPanel > details.od-fold')].map(e=>e.id));
 assert.deepEqual(seq,['odBody','stBox','odNewBox','repBox','cmpBox']);
 // every window is a closed fold with its title (an h3 in the summary) and an arrow
 assert.deepEqual(await page.$$eval('#draftsPanel > details.od-fold',d=>d.map(x=>x.open)),[false,false,false,false],'closed by default');
 assert.equal(await page.$$eval('#draftsPanel > details.od-fold > summary > h3',h=>h.length),4);
 assert.equal(await page.$eval('#stBox > summary',s=>getComputedStyle(s,'::after').content),'""','the arrow is drawn');
 // the one with something to decide shows its title and count while closed, and its list is not on the page
 assert.match(await text(page,'#stBox > summary'),/محتاج قرارك قبل أمر الشرا 2/);
 assert.ok(await page.isVisible('#stBox > summary'));assert.ok(!(await page.isVisible('#stList')),'closed: no list');
 // the arrow opens it, and closes it
 await page.click('#stBox > summary');
 await page.waitForSelector('#stList .st-item');assert.ok(await page.isVisible('#stList'));
 assert.equal(await page.$eval('#stBox',d=>d.open),true);
 await page.click('[data-st-add="101"]');await page.waitForSelector('[data-st="101"] .st-done.ok');
 assert.equal(await text(page,'#stCount'),'1','the count in the title follows');
 await page.click('#stBox > summary');
 assert.ok(!(await page.isVisible('#stList')),'closed again');
 assert.equal(await text(page,'#stBox > summary'),'محتاج قرارك قبل أمر الشرا 1','the title still shows what waits');
});
run('orders page: a window with nothing to show is not on the page at all',async({page})=>{
 await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');
 await page.waitForFunction(()=>window.AskerPoStatement);await page.waitForTimeout(500);
 for(const id of ['stBox','odNewBox','repBox'])assert.ok(!(await page.isVisible('#'+id)),id+' hidden when empty');
});
