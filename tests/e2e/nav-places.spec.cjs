// The bottom bar has 3 places (owner's layout of 2026-11-09): «النواقص العامة» (القايمة، الترجمة، الوارد), «الطلبيات» (الطلبيات،
// الفواتير، قوايم المخازن), «الموقع» (طلبات الموقع). Each place has small tabs under the top strip and remembers the one you were on.
const {run,assert}=require('./harness.cjs');
const vis=(page,id)=>page.isVisible('#'+id);
const chips=(page,place)=>page.$$eval(`.subbar[data-for="${place}"] [data-tab]`,b=>b.map(x=>x.textContent.trim()));
run('bottom bar: three places with small tabs',async({page})=>{
 // the first screen: النواقص العامة, the list
 assert.deepEqual(await page.$$eval('.bottomnav button',b=>b.map(x=>x.textContent.replace(/\s+/g,' ').trim())),['النواقص العامة','الطلبيات','الموقع']);
 assert.ok(await vis(page,'shortPanel'));assert.ok(!(await vis(page,'translatePanel')));assert.ok(!(await vis(page,'draftsPanel')));
 assert.ok(await page.isVisible('.subbar[data-for="general"]'));assert.ok(!(await page.isVisible('.subbar[data-for="orders"]')));
 assert.deepEqual(await chips(page,'general'),['القايمة','الترجمة','الوارد']);assert.deepEqual(await chips(page,'orders'),['الطلبيات','الفواتير','قوايم المخازن']);
 assert.equal(await page.$eval('.subbar[data-for="general"] .on',b=>b.textContent.trim()),'القايمة');
 assert.ok(!(await page.$eval('[data-group="general"]',b=>b.classList.contains('secondary'))));assert.ok(await page.$eval('[data-group="orders"]',b=>b.classList.contains('secondary')));
 // small tabs of the same place
 await page.click('[data-tab="translate"]');assert.ok(await vis(page,'translatePanel'));assert.ok(!(await vis(page,'shortPanel')));
 assert.equal(await page.$eval('.subbar[data-for="general"] .on',b=>b.textContent.trim()),'الترجمة');
 await page.click('[data-tab="read"]');assert.ok(await vis(page,'readPanel'));assert.ok(!(await vis(page,'translatePanel')));
 // another place: its first small tab, its own bar, the other bar is gone
 await page.click('[data-group="orders"]');
 assert.ok(await vis(page,'draftsPanel'));assert.ok(!(await vis(page,'readPanel')));assert.ok(await page.isVisible('.subbar[data-for="orders"]'));assert.ok(!(await page.isVisible('.subbar[data-for="general"]')));
 assert.ok(await page.$eval('[data-group="general"]',b=>b.classList.contains('secondary')));assert.ok(!(await page.$eval('[data-group="orders"]',b=>b.classList.contains('secondary'))));
 await page.click('[data-tab="docs"]');assert.ok(await vis(page,'docsPanel'));assert.ok(!(await vis(page,'draftsPanel')));
 await page.click('[data-tab="suppliers"]');assert.ok(await vis(page,'suppliersPanel'));assert.ok(!(await vis(page,'docsPanel')));
 // a place remembers the small tab you were on
 await page.click('[data-group="general"]');assert.ok(await vis(page,'readPanel'),'back on «الوارد»');assert.equal(await page.$eval('.subbar[data-for="general"] .on',b=>b.textContent.trim()),'الوارد');
 await page.click('[data-group="orders"]');assert.ok(await vis(page,'suppliersPanel'),'back on «قوايم المخازن»');
 // «الموقع»: one panel, no small tabs
 await page.click('[data-group="site"]');assert.ok(await vis(page,'storeOrdersPanel'));assert.ok(!(await vis(page,'suppliersPanel')));
 assert.ok(!(await page.isVisible('.subbar[data-for="general"]')));assert.ok(!(await page.isVisible('.subbar[data-for="orders"]')));
 // the whole page still fits the phone
 const wide=await page.evaluate(()=>{const W=document.documentElement.clientWidth;return [...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5)}).map(e=>e.tagName+'#'+e.id+'.'+e.className).slice(0,8)});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the screen; too wide: '+wide.join(' | '));
});
