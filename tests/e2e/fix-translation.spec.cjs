// A translation approved by mistake can be fixed: «عدّل» right after saving, «تراجع» to put the old one back,
// and the search box finds an item in any list (approved ones included).
const {run,text,waitStatus,assert}=require('./harness.cjs');
run('fix or undo an approved translation',async({page,table})=>{
 const row=async k=>(await table('ar_names')).find(n=>n.name_key===k);
 await page.click('[data-tab="translate"]');await page.click('#trOne');await page.waitForTimeout(500);
 // approve a wrong Arabic name, then «عدّل» and save the right one
 const en=await page.textContent('#trList .item:first-child .en');
 await page.fill('#trList .item:first-child [data-ar]','غلط');await page.click('#trList .item:first-child [data-ok]');await waitStatus(page,/اتحفظ/,'trStatus');
 assert.equal((await row(en.trim())).arabic_name,'غلط');
 await page.click('[data-tr-edit]');
 assert.equal(await page.inputValue('#trFilter'),en.trim());assert.match(await text(page,'#trList'),/اتأكدت/);
 await page.fill('#trList .item:first-child [data-ar]','الاسم الصح');await page.click('#trList .item:first-child [data-ok]');await waitStatus(page,/اتحفظ: الاسم الصح/,'trStatus');
 assert.deepEqual([(await row(en.trim())).arabic_name,(await row(en.trim())).status],['الاسم الصح','approved']);
 // «تراجع» puts back what was there before
 await page.fill('#trFilter','');await page.dispatchEvent('#trFilter','input');
 const en2=(await page.textContent('#trList .item:first-child .en')).trim(),old=(await row(en2)).arabic_name;
 await page.fill('#trList .item:first-child [data-ar]','غلط تاني');await page.click('#trList .item:first-child [data-ok]');await waitStatus(page,/اتحفظ/,'trStatus');
 await page.click('[data-tr-undo]');await waitStatus(page,/رجعت/,'trStatus');
 assert.deepEqual([(await row(en2)).arabic_name,(await row(en2)).status],[old,'suggested']);
 // search from the «محتاجة مراجعة» list still finds the approved item
 await page.fill('#trFilter','الاسم الصح');await page.dispatchEvent('#trFilter','input');
 assert.match(await text(page,'#trList'),new RegExp(en.trim()+'.*اتأكدت'));
});
