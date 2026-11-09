// «حدّث النواقص دلوقتي»: hidden until the table exists; one tap adds one request; the line under the button follows the request
// (waiting, running, done, failed); with an open request the button is off. Nothing is sent or changed from the page.
const {run,text,assert}=require('./harness.cjs');
run('refresh button: ask the laptop for a shortage update',async({page,table})=>{
 // the table is not there yet (migration not applied): the box stays hidden
 await page.evaluate(()=>{localStorage.setItem('__fakeFail','ar_refresh_requests')});
 await page.evaluate(()=>window.AskerRefresh.open());await page.waitForTimeout(300);
 assert.ok(!(await page.isVisible('#rfBox')),'hidden without the table');
 await page.evaluate(()=>{localStorage.removeItem('__fakeFail')});
 // the table is there and empty: the button shows, nothing under it
 await page.evaluate(()=>window.AskerRefresh.open());await page.waitForSelector('#rfBox:not(.hidden)');
 assert.equal(await text(page,'#rfBtn'),'حدّث النواقص دلوقتي');assert.equal(await text(page,'#rfStatus'),'');assert.ok(!(await page.$eval('#rfBtn',b=>b.disabled)));
 // one tap = one request «manual»; the button turns off and the line says it is waiting
 await page.click('#rfBtn');await page.waitForFunction(()=>window.__tables.ar_refresh_requests&&window.__tables.ar_refresh_requests.length===1);
 let rows=await table('ar_refresh_requests');assert.equal(rows.length,1);assert.equal(rows[0].reason,'manual');assert.equal(rows[0].status,'new');
 assert.ok(await page.$eval('#rfBtn',b=>b.disabled),'off while a request is open');
 // (the database fills requested_at itself; the test double does not, so it is filled here)
 await page.evaluate(()=>{window.__tables.ar_refresh_requests[0].requested_at=new Date().toISOString()});
 await page.evaluate(()=>window.AskerRefresh.open());await page.waitForFunction(()=>/اتطلب التحديث/.test(document.getElementById('rfStatus').textContent));
 assert.match(await text(page,'#rfStatus'),/اتطلب التحديث النهارده .* اللاب بياخده خلال 5 دقايق/);assert.ok(await page.$eval('#rfBtn',b=>b.disabled),'off while a request is open');
 // the laptop takes it
 await page.evaluate(()=>{const r=window.__tables.ar_refresh_requests[0];r.status='running';r.started_at=new Date().toISOString()});
 await page.evaluate(()=>window.AskerRefresh.open());await page.waitForFunction(()=>/اللاب شغّال على التحديث/.test(document.getElementById('rfStatus').textContent));
 assert.ok(await page.$eval('#rfBtn',b=>b.disabled));
 // it finishes: the line says so (the phone says the update itself) and the button is back
 await page.evaluate(()=>{const r=window.__tables.ar_refresh_requests[0];r.status='done';r.finished_at=new Date().toISOString()});
 await page.evaluate(()=>window.AskerRefresh.open());await page.waitForFunction(()=>/خلص/.test(document.getElementById('rfStatus').textContent));
 assert.ok(await page.$eval('#rfStatus',e=>e.classList.contains('good')));assert.ok(!(await page.$eval('#rfBtn',b=>b.disabled)));
 // a failed one shows why, and the owner can ask again
 await page.evaluate(()=>{const r=window.__tables.ar_refresh_requests[0];r.status='failed';r.note='share unreachable'});
 await page.evaluate(()=>window.AskerRefresh.open());await page.waitForFunction(()=>/ما خلصش/.test(document.getElementById('rfStatus').textContent));
 assert.match(await text(page,'#rfStatus'),/share unreachable/);assert.ok(await page.$eval('#rfStatus',e=>e.classList.contains('bad')));
 await page.click('#rfBtn');await page.waitForFunction(()=>window.__tables.ar_refresh_requests.length===2);
 assert.equal((await table('ar_refresh_requests')).length,2);assert.equal((await table('ar_refresh_requests'))[1].status,'new');
 // it sits in النواقص العامة ← القايمة only
 await page.click('[data-tab="translate"]');assert.ok(!(await page.isVisible('#rfBox')));
 await page.click('[data-tab="short"]');assert.ok(await page.isVisible('#rfBox'));
});
