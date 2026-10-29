// «متاح النهارده»: today's shortage items from the automatic inbox with the companies that sent them; a company opens
// its inbox; «علّم «اتطلب»» / «لغي «اتطلب»» by hand. Yesterday, unread and photos waiting for their company are left out.
const {run,text,waitStatus,assert}=require('./harness.cjs');
run('available today board',async({page,table})=>{
 const now=new Date().toISOString(),old=new Date(Date.now()-2*864e5).toISOString();
 const row=(id,name)=>({name,key:name,match:{id,confidence:'high',score:0.9},candidates:[{id,score:0.9,numbersOk:true}]});
 await page.evaluate(([now,old,a,b,c,d])=>{window.__tables.ar_inbox=[
  {id:'i1',received_at:now,sender:'المتحدة للأدوية',supplier:'المتحدة للأدوية',kind:'text',status:'new',sure:2,review:0,rows:[a,b]},
  {id:'i2',received_at:now,sender:'شركة النور',supplier:'شركة النور',kind:'image',status:'new',sure:2,review:0,rows:[a,c]},
  {id:'i3',received_at:old,sender:'الفتح',supplier:'الفتح',kind:'text',status:'seen',sure:1,review:0,rows:[d]},
  {id:'i4',received_at:now,sender:'الفتح',supplier:'الفتح',kind:'image',status:'new',sure:1,review:0,maybe:['الفتح','شركة النور'],rows:[d]}]},
  [now,old,row('s2','فلاجيل شراب ١٢٥'),row('s3','جانوفيا ٥٠ مجم'),row('s1','بروفين ٤٠٠'),row('s9','حاجة قديمة')]);
 await page.click('[data-tab="read"]');await page.click('#inboxRefresh');await page.waitForFunction(()=>/متاح النهارده: 3 صنف/.test(document.getElementById('todaySum').textContent));
 await page.click('#todaySum');
 const items=await page.$$eval('#todayList .item',els=>els.map(e=>e.textContent.replace(/\s+/g,' ').trim()));
 assert.equal(items.length,3);assert.match(items[0],/^FLAGYL 125MG SYP\s*عند:\s*المتحدة للأدوية\s*شركة النور/,'two companies first (no Arabic name yet: the English one)');
 // a company's name opens its inbox and message
 await page.click('#todayList [data-today-co="شركة النور"]');await waitStatus(page,/شركة النور: اتقرا/);
 assert.match(await page.inputValue('#msgText'),/بروفين ٤٠٠/);
 // marked by hand: one company has it -> from that company; it leaves the open message
 await page.click('#todayList [data-today-order="s1"]');await page.waitForFunction(()=>/اتطلب 1/.test(document.getElementById('todaySum').textContent));
 assert.deepEqual((await table('ar_orders')).map(o=>[o.name_key,o.supplier]),[['BRUFEN 400MG 30TAB','شركة النور']]);
 assert.match(await text(page,'#todayList'),/اتطلب من شركة النور/);assert.doesNotMatch(await page.inputValue('#msgText'),/بروفين/);
 assert.match(await text(page,'#msgSkip'),/بروفين ٤٠٠ من شركة النور/);
 const last=await page.$$eval('#todayList .item',els=>els.at(-1).textContent);assert.match(last,/بروفين|BRUFEN/,'ordered items go last');
 // two companies have it -> marked without a company
 await page.click('#todayList [data-today-order="s2"]');await page.waitForFunction(()=>/اتطلب 2/.test(document.getElementById('todaySum').textContent));
 assert.equal((await table('ar_orders')).find(o=>o.name_key==='FLAGYL 125MG SYP').supplier,null);
 // undo from the board: back in the message
 await page.click('#todayList [data-today-unorder="s1"]');await page.waitForFunction(()=>/اتطلب 1/.test(document.getElementById('todaySum').textContent));
 assert.deepEqual((await table('ar_orders')).map(o=>o.name_key),['FLAGYL 125MG SYP']);assert.match(await page.inputValue('#msgText'),/بروفين ٤٠٠/);
});
run('available today: nothing yet',async({page})=>{
 await page.click('[data-tab="read"]');await page.waitForFunction(()=>/متاح النهارده: 0 صنف/.test(document.getElementById('todaySum').textContent));
 await page.click('#todaySum');assert.match(await text(page,'#todayList'),/لسه ماوصلش حاجة من النواقص النهارده/);
});
