// «اتطلب» marks (review 2026-11-23 errors-1): when the page comes back and the read of today's orders fails (weak network), the marks the page
// already had stay (they used to be replaced by an empty list, and items already ordered from one company went into the next company's
// message), the phone says so, and the warning goes when a read works again. A mark just written holds even if the re-read fails.
const {run,assert}=require('./harness.cjs');
const ready=p=>p.waitForFunction(()=>/\d/.test(document.getElementById('shStats')?.textContent||''),null,{timeout:15000});
const back=p=>p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));   // the phone wakes: the page reads again
const count=p=>p.evaluate(()=>window.AskerApp.lookup().orders.length);
const WARN='مفيش نت: علامات «اتطلب» مش متحدثة، جرّب تاني';

run('orders: a failed read of today\'s marks keeps the marks and says so',async({page})=>{
 await ready(page);
 await page.evaluate(()=>{window.__tables.ar_orders=[{id:'o1',name_key:'X ITEM',product_name:'X ITEM',supplier:'AMG',ordered_at:new Date().toISOString()}]});
 await back(page);
 await page.waitForFunction(()=>window.AskerApp.lookup().orders.length===1);
 // the connection drops: the read fails, the mark it had stays, and it says so
 await page.evaluate(()=>localStorage.setItem('__fakeFail','ar_orders'));
 await back(page);
 await page.waitForFunction(w=>document.getElementById('msgStatus').textContent===w,WARN);
 assert.equal(await count(page),1,'the marks it had are kept');
 assert.ok(await page.$eval('#msgStatus',e=>e.classList.contains('bad')));
 // still down: the same
 await back(page);await page.waitForTimeout(300);
 assert.equal(await count(page),1);
 // back online: the warning goes, the marks are the server's
 await page.evaluate(()=>localStorage.removeItem('__fakeFail'));
 await back(page);
 await page.waitForFunction(()=>document.getElementById('msgStatus').textContent==='');
 assert.equal(await count(page),1);
 // a day with nothing ordered is a real empty list (not a failure): the mark goes
 await page.evaluate(()=>{window.__tables.ar_orders=[]});
 await back(page);
 await page.waitForFunction(()=>window.AskerApp.lookup().orders.length===0);
});
