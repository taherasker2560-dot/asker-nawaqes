// «مش مهم» + undo, «تصحيح» → «دوّر بالاسم ده» → pick, and undo of the correction.
const {run,text,waitStatus,assert}=require('./harness.cjs');
run('ignore, correct and re-match, undo',async({page,fixture,table})=>{
 await page.click('[data-tab="translate"]');await page.click('#trOne');await page.waitForTimeout(500);
 await page.click('[data-tab="read"]');await page.setInputFiles('#images',fixture('lines0.png'));await page.click('#readBtn');await waitStatus(page,/اتقرا/);
 const open=()=>page.evaluate(()=>document.querySelectorAll('#results details').forEach(d=>d.open=true));
 await open();await page.click('[data-ignore]');await page.waitForTimeout(300);
 assert.deepEqual((await table('ar_ignored')).map(x=>x.read_text),['بانادول اكسترا']);assert.match(await text(page,'#results'),/اتخبّى 1/);
 await page.click('#undoBtn');await page.waitForTimeout(300);assert.equal((await table('ar_ignored')).length,0);
 await open();const i=await page.$eval('[data-ignore]',x=>x.dataset.ignore);
 await page.fill(`[data-fix-text="${i}"]`,'جانوفيا ٥٠ مجم');await page.click(`[data-rematch="${i}"]`);await page.waitForSelector('[data-fixpick]');
 await page.click('[data-fixpick]');await page.waitForTimeout(400);
 assert.deepEqual((await table('ar_fixes')).map(f=>[f.read_text,f.corrected_text]),[['بانادول اكسترا','جانوفيا ٥٠ مجم']]);
 assert.deepEqual((await table('ar_answers')).map(a=>[a.read_text,a.name_key,a.decision]),[['بانادول اكسترا','JANUVIA 50MG 28TAB','yes']]);
 assert.match(await text(page,'#results'),/اتصحح لـ: جانوفيا ٥٠ مجم/);
 await page.click('#undoBtn');await page.waitForTimeout(300);
 assert.equal((await table('ar_fixes')).length,0);assert.equal((await table('ar_answers')).length,0);
});
