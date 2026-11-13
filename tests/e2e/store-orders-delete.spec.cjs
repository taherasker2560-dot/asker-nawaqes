// «طلبات الموقع» (owner 2026-11-13 «عايز ابقى عندي اوبشن ان انا احذفها»): a delivered or cancelled order can be deleted
// (one, or all finished at once, after a «تأكيد»); an open order has no «امسح». Made-up orders only.
const {run,text,assert}=require('./harness.cjs');
const O=(id,status)=>({id,status,customer_name:'زبون تجربة '+id,phone:'01000000000',address:'عنوان',notes:'',items:[{name:'ITEM',qty:1,line_total:10}],total:10,rx_paths:[],created_at:'2026-11-12T10:00:00Z'});
run('Store orders: delete a finished one, then all finished; open ones stay',async({page,table})=>{
 await page.evaluate(o=>{window.__tables.ar_store_orders=o},[O(1,'new'),O(2,'cancelled'),O(3,'done'),O(4,'cancelled')]);
 let asked='';page.on('dialog',d=>{asked=d.message();d.accept()});
 await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="storeorders"]');
 await page.waitForSelector('#soClosed [data-order="2"]');
 // an open order: no «امسح»
 assert.equal(await page.$('#soOpen [data-order="1"] [data-del]'),null);
 // one finished order
 await page.click('#soClosed [data-order="2"] [data-del]');
 await page.waitForFunction(()=>!window.__tables.ar_store_orders.some(o=>o.id===2));
 assert.match(asked,/تمسح طلب #2 نهائي/);
 assert.match(await text(page,'#soStatus'),/طلب #2 اتمسح/);
 assert.equal(await page.$('#soClosed [data-order="2"]'),null);
 // all finished at once; the open one stays
 await page.click('#soDelAll');
 await page.waitForFunction(()=>window.__tables.ar_store_orders.length===1);
 assert.match(asked,/تمسح 2 طلب خلصوا نهائي/);
 assert.deepEqual((await table('ar_store_orders')).map(o=>o.id),[1]);
 assert.equal(await page.isHidden('#soClosedBox'),true);
});
