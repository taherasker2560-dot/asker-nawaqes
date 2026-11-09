// The bottom bar has 3 sections (owner's layout of 2026-11-10, (ب) «شريط تحت»): «المشتريات» (النواقص، الوارد، الترجمة، الطلبيات،
// الفواتير، قوايم المخازن، المخزون), «الحسابات» (العملاء، الموردين: coming), «المبيعات» (الموقع، حركة البيع: coming). The stock
// search is on top of every screen. Each section has small tabs under the top strip and remembers the one you were on.
const {run,assert}=require('./harness.cjs');
const vis=(page,id)=>page.isVisible('#'+id);
const chips=(page,place)=>page.$$eval(`.subbar[data-for="${place}"] [data-tab]`,b=>b.map(x=>x.textContent.trim()));
run('bottom bar: three sections with small tabs, the stock search on top',async({page})=>{
 // the first screen: المشتريات, the shortages list, the stock search on top
 assert.deepEqual(await page.$$eval('.bottomnav button',b=>b.map(x=>x.textContent.replace(/\s+/g,' ').trim())),['المشتريات','الحسابات','المبيعات']);
 assert.ok(await vis(page,'gsQ'),'stock search on top');assert.ok(!(await vis(page,'gsOut')));
 assert.ok(await vis(page,'shortPanel'));assert.ok(!(await vis(page,'translatePanel')));assert.ok(!(await vis(page,'draftsPanel')));
 assert.ok(await page.isVisible('.subbar[data-for="purchases"]'));assert.ok(!(await page.isVisible('.subbar[data-for="accounts"]')));assert.ok(!(await page.isVisible('.subbar[data-for="sales"]')));
 assert.deepEqual(await chips(page,'purchases'),['النواقص','الوارد','الترجمة','الطلبيات','الفواتير','قوايم المخازن','المخزون']);
 assert.deepEqual(await chips(page,'accounts'),['العملاء','الموردين']);assert.deepEqual(await chips(page,'sales'),['الموقع','حركة البيع']);
 assert.equal(await page.$eval('.subbar[data-for="purchases"] .on',b=>b.textContent.trim()),'النواقص');
 assert.ok(!(await page.$eval('[data-group="purchases"]',b=>b.classList.contains('secondary'))));assert.ok(await page.$eval('[data-group="accounts"]',b=>b.classList.contains('secondary')));
 // small tabs of the same section
 await page.click('[data-tab="translate"]');assert.ok(await vis(page,'translatePanel'));assert.ok(!(await vis(page,'shortPanel')));
 await page.click('[data-tab="read"]');assert.ok(await vis(page,'readPanel'));assert.ok(!(await vis(page,'translatePanel')));
 await page.click('[data-tab="drafts"]');assert.ok(await vis(page,'draftsPanel'));assert.ok(!(await vis(page,'readPanel')));
 await page.click('[data-tab="docs"]');assert.ok(await vis(page,'docsPanel'));
 await page.click('[data-tab="suppliers"]');assert.ok(await vis(page,'suppliersPanel'));assert.ok(!(await vis(page,'docsPanel')));
 await page.click('[data-tab="stock"]');assert.ok(await vis(page,'stockPanel'));assert.ok(!(await vis(page,'suppliersPanel')));
 // another section: its first small tab, its own bar, the other bar is gone
 await page.click('[data-group="accounts"]');
 assert.ok(await vis(page,'customersPanel'));assert.ok(!(await vis(page,'stockPanel')));assert.ok(await page.isVisible('.subbar[data-for="accounts"]'));assert.ok(!(await page.isVisible('.subbar[data-for="purchases"]')));
 await page.click('[data-tab="vendors"]');assert.ok(await vis(page,'vendorsPanel'));assert.ok(!(await vis(page,'customersPanel')));
 await page.click('[data-group="sales"]');assert.ok(await vis(page,'storeOrdersPanel'));assert.ok(!(await vis(page,'vendorsPanel')));
 await page.click('[data-tab="sales"]');assert.ok(await vis(page,'salesPanel'));assert.ok(!(await vis(page,'storeOrdersPanel')));
 // a section remembers the small tab you were on
 await page.click('[data-group="purchases"]');assert.ok(await vis(page,'stockPanel'),'back on «المخزون»');assert.equal(await page.$eval('.subbar[data-for="purchases"] .on',b=>b.textContent.trim()),'المخزون');
 await page.click('[data-group="accounts"]');assert.ok(await vis(page,'vendorsPanel'),'back on «الموردين»');
 // typing in the top search hides the section until it is cleared; choosing a section leaves the search
 await page.fill('#gsQ','بانادول');assert.ok(await vis(page,'gsOut'));assert.ok(!(await vis(page,'vendorsPanel')));assert.ok(await vis(page,'gsClear'));
 await page.click('#gsClear');assert.ok(!(await vis(page,'gsOut')));assert.ok(await vis(page,'vendorsPanel'));assert.equal(await page.$eval('#gsQ',e=>e.value),'');
 await page.fill('#gsQ','بانادول');await page.click('[data-group="purchases"]');assert.ok(!(await vis(page,'gsOut')));assert.ok(await vis(page,'stockPanel'));
 // the whole page still fits the phone
 const wide=await page.evaluate(()=>{const W=document.documentElement.clientWidth;return [...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5)}).map(e=>e.tagName+'#'+e.id+'.'+e.className).slice(0,8)});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the screen; too wide: '+wide.join(' | '));
});
