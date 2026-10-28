// Translate the shortages, approve one, read a supplier image, «أيوه» + undo, pick an item from the shortage list.
const {run,text,waitStatus,assert}=require('./harness.cjs');
run('translate, read, yes/undo, pick from shortages',async({page,fixture,table})=>{
 await page.click('[data-tab="translate"]');
 assert.match(await text(page,'#trStats'),/3نواقص ?0اتترجمت/);
 await page.click('#trAll');await waitStatus(page,/خلص/,'trStatus');
 assert.match(await text(page,'#trStats'),/3نواقص ?3اتترجمت/);
 await page.fill('#trList .item:first-child [data-ar]','بروفين ٤٠٠ مجم ٣٠ قرص');await page.click('#trList .item:first-child [data-ok]');await page.waitForTimeout(300);
 const b=(await table('ar_names')).find(n=>n.name_key==='BRUFEN 400MG 30TAB');assert.equal(b.arabic_name,'بروفين ٤٠٠ مجم ٣٠ قرص');assert.equal(b.status,'approved');
 await page.click('[data-tab="read"]');await page.setInputFiles('#images',fixture('lines0.png'));await page.click('#readBtn');await waitStatus(page,/اتقرا/);
 assert.match(await text(page,'#results'),/وصل من النواقص: 1 ?FLAGYL 125MG SYP/);
 await page.click('[data-yes]');await page.waitForTimeout(300);
 assert.deepEqual((await table('ar_answers')).map(d=>[d.read_text,d.name_key,d.decision]),[['جانوفيا ٥٠','JANUVIA 50MG 28TAB','yes']]);
 await page.click('#undoBtn');await page.waitForTimeout(300);assert.equal((await table('ar_answers')).length,0,'undo removes the answer');
 await page.evaluate(()=>document.querySelectorAll('#results details').forEach(d=>d.open=true));
 await page.fill('#results details:last-of-type [data-pick-q]','brufen');await page.waitForTimeout(200);
 await page.click('#results details:last-of-type [data-pick-list] [data-yes]');await page.waitForTimeout(300);
 assert.deepEqual((await table('ar_answers')).map(d=>[d.read_text,d.name_key,d.decision]),[['جانوفيا ٥٠','BRUFEN 400MG 30TAB','yes']]);
 assert.match(await text(page,'#results'),/وصل من النواقص: 2/);
});
