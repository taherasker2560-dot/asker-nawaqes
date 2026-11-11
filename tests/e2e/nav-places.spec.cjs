// The bottom bar has 5 sections (owner 2026-11-12): «الرئيسية» (one search for an item, first screen), «المشتريات» in three
// groups (نواقص: النواقص، الوارد، الترجمة / طلبيات: الطلبيات، الفواتير، قوايم المخازن / مخزون: المخزون، جرد المخزون),
// «الحسابات» (العملاء، الموردين), «المبيعات» (الموقع، حركة البيع، البيع المؤقت) and «خدمة العملاء». Each section, and each group of
// «المشتريات», remembers the small tab you were on. «حدّث النواقص دلوقتي» is gone (the list is sent every hour).
const {run,assert}=require('./harness.cjs');
const vis=(page,id)=>page.isVisible('#'+id);
const names=(page,sel)=>page.$$eval(sel,b=>b.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
run('bottom bar: five sections, «الرئيسية» first, «المشتريات» in three groups',async({page})=>{
 assert.deepEqual(await names(page,'.bottomnav button'),['الرئيسية','المشتريات','الحسابات','المبيعات','خدمة العملاء']);
 // the first screen: «الرئيسية» with its one search, no small tabs
 assert.ok(await vis(page,'homePanel'));assert.ok(await vis(page,'hsQ'));assert.ok(!(await vis(page,'shortPanel')));
 assert.ok(!(await page.isVisible('.subbar[data-for="purchases"]')));
 assert.ok(!(await page.$eval('[data-group="home"]',b=>b.classList.contains('secondary'))));
 assert.equal(await page.$('#rfBtn'),null,'no «حدّث النواقص دلوقتي» button any more');
 assert.equal(await page.$('#gsQ'),null,'the old search boxes on top are gone');assert.equal(await page.$('#gwQ'),null);
 // «المشتريات»: the three groups, «نواقص» open on «النواقص»
 await page.click('[data-group="purchases"]');
 assert.ok(await vis(page,'shortPanel'));assert.ok(!(await vis(page,'homePanel')));
 assert.deepEqual(await names(page,'[data-pgroup]'),['نواقص','طلبيات','مخزون']);
 assert.deepEqual(await names(page,'[data-pfor="short"] [data-tab]'),['النواقص','الوارد','الترجمة']);
 assert.deepEqual(await names(page,'[data-pfor="orders"] [data-tab]'),['الطلبيات','الفواتير','قوايم المخازن']);
 assert.deepEqual(await names(page,'[data-pfor="stock"] [data-tab]'),['المخزون','جرد المخزون']);
 assert.ok(await page.isVisible('[data-pfor="short"]'));assert.ok(!(await page.isVisible('[data-pfor="orders"]')));
 await page.click('[data-tab="translate"]');assert.ok(await vis(page,'translatePanel'));assert.ok(!(await vis(page,'shortPanel')));
 // «طلبيات» opens on «الطلبيات»; «مخزون» on «المخزون»; «جرد المخزون» is coming
 await page.click('[data-pgroup="orders"]');assert.ok(await vis(page,'draftsPanel'));assert.ok(await page.isVisible('[data-pfor="orders"]'));assert.ok(!(await page.isVisible('[data-pfor="short"]')));
 await page.click('[data-tab="suppliers"]');assert.ok(await vis(page,'suppliersPanel'));assert.ok(!(await vis(page,'draftsPanel')));
 await page.click('[data-pgroup="stock"]');assert.ok(await vis(page,'stockPanel'));
 await page.click('[data-tab="count"]');assert.ok(await vis(page,'countPanel'));assert.ok(!(await vis(page,'stockPanel')));
 // each group remembers its small tab
 await page.click('[data-pgroup="short"]');assert.ok(await vis(page,'translatePanel'),'back on «الترجمة»');
 await page.click('[data-pgroup="orders"]');assert.ok(await vis(page,'suppliersPanel'),'back on «قوايم المخازن»');
 // the other sections
 await page.click('[data-group="accounts"]');assert.ok(await vis(page,'customersPanel'));assert.ok(!(await page.isVisible('.subbar[data-for="purchases"]')));
 await page.click('[data-group="sales"]');assert.ok(await vis(page,'storeOrdersPanel'));
 assert.deepEqual(await names(page,'.subbar[data-for="sales"] [data-tab]'),['الموقع','حركة البيع','البيع المؤقت']);
 await page.click('[data-tab="tempsale"]');assert.ok(await vis(page,'tempSalePanel'));assert.ok(!(await vis(page,'storeOrdersPanel')));
 await page.click('[data-group="care"]');assert.ok(await vis(page,'carePanel'));assert.ok(!(await vis(page,'tempSalePanel')));
 // «المشتريات» comes back where it was; «الرئيسية» comes back with its search
 await page.click('[data-group="purchases"]');assert.ok(await vis(page,'suppliersPanel'));
 await page.click('[data-group="home"]');assert.ok(await vis(page,'homePanel'));assert.ok(!(await vis(page,'suppliersPanel')));
 // the whole page still fits the phone, in every section
 for(const g of ['home','purchases','accounts','sales','care']){
  await page.click(`[data-group="${g}"]`);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the screen in '+g);
 }
},{home:true});
