// «مش واحد منهم» saves a «no» for each offered item and one for the line itself, and undo removes them all.
const {run,waitStatus,assert}=require('./harness.cjs');
run('«مش واحد منهم» remembered for the line',async({page,fixture,table})=>{
 await page.click('[data-tab="read"]');await page.setInputFiles('#images',fixture('lines0.png'));await page.click('#readBtn');await waitStatus(page,/اتقرا/);
 await page.click('[data-noall]');await page.waitForTimeout(300);
 assert.deepEqual((await table('ar_answers')).map(a=>[a.read_text,a.name_key,a.decision]).sort(),[['جانوفيا ٥٠','*','no'],['جانوفيا ٥٠','JANUVIA 50MG 28TAB','no']]);
 await page.click('#undoBtn');await page.waitForTimeout(300);assert.equal((await table('ar_answers')).length,0);
});
