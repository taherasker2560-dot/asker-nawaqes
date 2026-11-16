// «محتاج قرارك قبل أمر الشرا» at the top of «الطلبيات» (owner 2026-11-16): the new and «بالطلب» items the laptop did not put in the purchase order by
// itself (private bucket asker-private/orders/statement.json). «➕ ضيفه» writes an open line in ar_po_items (like the bags page), «مش دلوقتي» writes a
// cancelled line that says «no» (the laptop does not ask again or order it for 7 days); each has its undo. Nothing is sent.
const {run,text,assert}=require('./harness.cjs');
const item=(id,name,why,extra={})=>({id,name,why,bag:'2428',have:0,sold30:3,min:0,need:1.4,qty:2,last_buy:'2026-11-01',...(why==='new'?{age:20}:{n:3}),...extra});
const file=(items,at=new Date().toISOString())=>({generated_at:at,items});
const put=(page,o)=>page.evaluate(o=>{window.__storage['orders/statement.json']=JSON.stringify(o);window.__tables.ar_po_items=[]},o);
const openOrders=async(page)=>{await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]')};
run('statement: the items waiting for him, «ضيفه» and «مش دلوقتي» write the right rows, each with its undo',async({page,table})=>{
 await put(page,file([item(101,'ZEGAPETS 10MG 28TAB','new'),item(102,'BENDATREOTID 25MG VIAL','byreq',{bag:'pv',have:0.5,sold30:0,qty:1}),item(103,'COSMETIC NEW ITEM','new',{bag:'2434'})]));
 await openOrders(page);
 await page.waitForSelector('#stBox:not(.hidden)');
 assert.equal(await text(page,'#stCount'),'3');assert.match(await text(page,'#stBox h3'),/محتاج قرارك قبل أمر الشرا/);
 const chips=await page.$$eval('#stList .st-item',r=>r.map(x=>[x.querySelector('strong').textContent.trim(),[...x.querySelectorAll('.st-chip')].map(c=>c.textContent.trim())]));
 assert.deepEqual(chips[0],['ZEGAPETS 10MG 28TAB',['جديد: اتعمل من 20 يوم','رصيده 0','بيع الشهر 3','الكمية المقترحة 2']]);
 assert.deepEqual(chips[1],['BENDATREOTID 25MG VIAL',['بالطلب: آخر 3 مرات اتباع في يومين','رصيده 0.5','الكمية المقترحة 1']]);
 // «➕ ضيفه»: an open line like the bags page writes
 await page.click('[data-st-add="101"]');
 await page.waitForSelector('[data-st="101"] .st-done.ok');
 assert.match(await text(page,'[data-st="101"] .st-done'),/✓ اتضاف لأمر الشرا \(2\)/);assert.equal(await text(page,'#stCount'),'2');
 let po=await table('ar_po_items');assert.equal(po.length,1);
 assert.deepEqual([po[0].item_id,po[0].item_name,po[0].bag,po[0].qty,po[0].status],[101,'ZEGAPETS 10MG 28TAB','2428',2,'open']);
 assert.deepEqual(po[0].item,{have:0,sold30:3,min:0,need:1.4,last_buy:'2026-11-01'});
 // «رجّعه»: the line is cancelled, the item is asked again
 await page.click('[data-st-undo="101"]');
 await page.waitForSelector('[data-st="101"] [data-st-add]');
 po=await table('ar_po_items');assert.equal(po[0].status,'cancelled');assert.equal(await text(page,'#stCount'),'3');
 // «مش دلوقتي»: a cancelled line that says «no», for an item in «كل الشركات» too
 await page.click('[data-st-skip="102"]');
 await page.waitForSelector('[data-st="102"] .st-done.skip');
 assert.match(await text(page,'[data-st="102"] .st-done'),/مش دلوقتي: مش هيتطلب لوحده 7 أيام/);assert.equal(await text(page,'#stCount'),'2');
 po=await table('ar_po_items');const no=po.find(r=>r.item_id===102);
 assert.deepEqual([no.status,no.bag,no.item.decision],['cancelled','pv','no']);
 // «رجّعه للبيان»: the same row now says undone (the laptop ignores it)
 await page.click('[data-st-undo="102"]');
 await page.waitForSelector('[data-st="102"] [data-st-skip]');
 po=await table('ar_po_items');assert.equal(po.find(r=>r.item_id===102).item.decision,'undone');assert.equal(await text(page,'#stCount'),'3');
 assert.ok(await page.isVisible('#draftsPanel'));
});
run('statement: nothing to decide = no box; no file, an empty file, a broken file and a stale file show nothing',async({page})=>{
 await openOrders(page);
 await page.waitForFunction(()=>window.AskerPoStatement);
 assert.ok(!(await page.isVisible('#stBox')),'no file');
 await put(page,file([]));
 await page.click('[data-tab="docs"]');await page.click('[data-tab="drafts"]');
 await page.waitForTimeout(400);assert.ok(!(await page.isVisible('#stBox')),'empty file');
 await put(page,{items:'oops'});
 await page.click('[data-tab="docs"]');await page.click('[data-tab="drafts"]');
 await page.waitForTimeout(400);assert.ok(!(await page.isVisible('#stBox')),'broken file');
 await put(page,file([item(101,'OLD FILE ITEM','new')],new Date(Date.now()-48*3600e3).toISOString()));
 await page.click('[data-tab="docs"]');await page.click('[data-tab="drafts"]');
 await page.waitForTimeout(400);assert.ok(!(await page.isVisible('#stBox')),'a file the laptop stopped updating is not asked');
 await put(page,file([item(101,'FRESH FILE ITEM','new')]));
 await page.click('[data-tab="docs"]');await page.click('[data-tab="drafts"]');
 await page.waitForSelector('#stBox:not(.hidden)');assert.equal(await text(page,'#stCount'),'1');
});
run('statement in English: texts translate, item names stay',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-lang','en'));
 await page.reload();
 await page.waitForFunction(()=>window.__tables);
 await put(page,file([item(101,'ZEGAPETS 10MG 28TAB','new'),item(102,'BENDATREOTID 25MG VIAL','byreq',{bag:'pv',have:0.5,sold30:0,qty:1})]));
 await openOrders(page);
 await page.waitForSelector('#stBox:not(.hidden)');
 assert.match(await text(page,'#stBox h3'),/Needs your decision before the purchase order/);
 assert.match(await text(page,'#stBox .hint'),/Tap «Add» if you want it, or «Not now»/);
 const chips=await page.$$eval('#stList .st-item',r=>r.map(x=>[...x.querySelectorAll('.st-chip')].map(c=>c.textContent.trim()).join(' | ')));
 assert.equal(chips[0],'New: created 20 days ago | Stock 0 | Sold this month 3 | Suggested quantity 2');
 assert.equal(chips[1],'On request: the last 3 buys sold within two days | Stock 0.5 | Suggested quantity 1');
 assert.deepEqual(await page.$$eval('[data-st="101"] button',b=>b.map(x=>x.textContent.trim())),['➕ Add it','Not now']);
 await page.click('[data-st-add="101"]');await page.waitForSelector('[data-st="101"] .st-done.ok');
 assert.match(await text(page,'[data-st="101"] .st-done'),/✓ Added to the purchase order \(2\)/);
 await page.click('[data-st-skip="102"]');await page.waitForSelector('[data-st="102"] .st-done.skip');
 assert.match(await text(page,'[data-st="102"] .st-done'),/Not now: it will not be ordered by itself for 7 days/);
 assert.equal(await page.$eval('[data-st="102"] .st-undo',e=>e.textContent.trim()),'Put it back');
 assert.equal(await page.$eval('[data-st="101"] strong',e=>e.textContent.trim()),'ZEGAPETS 10MG 28TAB','item names are not touched');
 const ar=await page.evaluate(()=>[...document.querySelectorAll('#stBox *')].filter(e=>!e.closest('.notr')&&e.children.length===0&&/[؀-ۿ]/.test(e.textContent)).map(e=>e.textContent.trim()));
 assert.deepEqual(ar,[],'no Arabic left in the statement');
});
