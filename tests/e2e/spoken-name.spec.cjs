// «النطق»: an optional spoken form saved with the Arabic name (ar_names.spoken_name), shown again when the item is
// opened, cleared when the box is emptied; a name saved without it does not send the field at all.
const {run,waitStatus,assert}=require('./harness.cjs');
run('spoken form of an item',async({page,table})=>{
 const row=async k=>(await table('ar_names')).find(n=>n.name_key===k);
 await page.click('[data-tab="translate"]');await page.click('#trOne');await page.waitForTimeout(500);
 const en=(await page.textContent('#trList .item:first-child .en')).trim();
 // approve without a spoken form: the field is not sent
 await page.click('#trList .item:first-child [data-ok]');await waitStatus(page,/اتحفظ/,'trStatus');
 assert.equal('spoken_name' in (await row(en)),false,'no spoken_name when none was typed');
 // set a spoken form
 await page.fill('#trFilter',en);await page.dispatchEvent('#trFilter','input');
 await page.fill('#trList .item:first-child [data-say]','  بروفين   أربعمية  ');await page.click('#trList .item:first-child [data-ok]');
 await waitStatus(page,/بيتنطق: بروفين أربعمية/,'trStatus');
 assert.equal((await row(en)).spoken_name,'بروفين أربعمية');
 // shown again
 await page.fill('#trFilter',en);await page.dispatchEvent('#trFilter','input');
 assert.equal(await page.inputValue('#trList .item:first-child [data-say]'),'بروفين أربعمية');
 // emptied: cleared
 await page.fill('#trList .item:first-child [data-say]','');await page.click('#trList .item:first-child [data-ok]');await waitStatus(page,/اتحفظ/,'trStatus');
 assert.equal((await row(en)).spoken_name,null);
});
