// The pages update THEMSELVES (owner 2026-11-19 night: the system stays open on his phone for days and kept running the old code; «الشريط اللي تحت لسه برتقالي»): ar/autoupdate.js compares
// the ?v= tokens of the page the phone is running with the page the server has now, and reloads when that costs nothing. Here the server's page is faked with page.route.
const {run,assert}=require('./harness.cjs');
const fake=(page,hit)=>page.route('**/asker-nawaqes-arabic.html*',async r=>{const res=await r.fetch();let body=await res.text();if(hit.on)body=body.replace(/ar\/airy\.css\?v=[\w-]+/,'ar/airy.css?v=NEW-VERSION');await r.fulfill({response:res,body})});
const ready=page=>page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
run('auto update: the same version changes nothing; a newer one reloads the page when it is untouched',async({page})=>{
 const hit={on:false};await fake(page,hit);
 await ready(page);
 assert.equal(await page.evaluate(()=>typeof window.AskerAutoUpdate.check),'function','the updater is on the page');
 assert.equal(await page.evaluate(()=>window.AskerAutoUpdate.check()),false,'the first look: nothing new');
 assert.ok((await page.evaluate(()=>window.AskerAutoUpdate.base())).includes('ar/airy.css?v='),'it knows the versions it is running');
 await page.evaluate(()=>{window.__marker=1;window.AskerAutoUpdate.untouched()});
 assert.equal(await page.evaluate(()=>window.AskerAutoUpdate.check()),false,'the same version again: nothing new');
 await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.__marker),1,'no reload');
 hit.on=true;
 const nav=page.waitForEvent('load',{timeout:10000});
 const pend=await page.evaluate(()=>window.AskerAutoUpdate.check().catch(()=>true)).catch(()=>true);
 await nav;
 assert.equal(await page.evaluate(()=>window.__marker),undefined,'the page was reloaded on its own');
 assert.ok(await page.evaluate(()=>sessionStorage.getItem('asker-autoupd')),'and it noted the time (no loop)');
},{home:true});
run('auto update: it never reloads under a hand that is typing, nor twice in ten minutes',async({page})=>{
 const hit={on:false};await fake(page,hit);
 await ready(page);
 await page.evaluate(()=>window.AskerAutoUpdate.check());
 hit.on=true;
 // typing in a field: the update waits
 await page.evaluate(()=>{window.__marker=1;window.AskerAutoUpdate.untouched();const i=[...document.querySelectorAll('input')].find(x=>x.offsetParent&&!x.disabled&&/^(search|text)$/.test(x.type));i.focus();window.__focused=document.activeElement===i});
 assert.equal(await page.evaluate(()=>window.__focused),true,'a visible field has the focus');
 assert.equal(await page.evaluate(()=>window.AskerAutoUpdate.check()),true,'it knows a newer version is there');
 await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.__marker),1,'but it does not reload while a field is focused');
 // an automatic reload a minute ago: it does not do it again
 await page.evaluate(()=>{document.activeElement.blur();sessionStorage.setItem('asker-autoupd',String(Date.now()-60000));window.AskerAutoUpdate.untouched()});
 await page.evaluate(()=>window.AskerAutoUpdate.check());
 await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.__marker),1,'no second reload within ten minutes');
},{home:true});