// «اتطلب»: opening a company's message in WhatsApp marks its items ordered today; the next company's message leaves
// them out (listed under it), the results show «اتطلب», and «لغي «اتطلب»» puts an item back. No duplicate marks.
const {run,text,waitStatus,assert}=require('./harness.cjs');
run('items ordered today',async({page,table})=>{
 const now=new Date().toISOString();
 const row=(id,name)=>({name,key:name,match:{id,confidence:'high',score:0.9},candidates:[{id,score:0.9,numbersOk:true}]});
 await page.evaluate(([now,a,b,c])=>{window.__tables.ar_inbox=[
  {id:'i1',received_at:now,sender:'المتحدة للأدوية',supplier:'المتحدة للأدوية',kind:'text',status:'new',sure:2,review:0,rows:[a,b]},
  {id:'i2',received_at:now,sender:'شركة النور',supplier:'شركة النور',kind:'text',status:'new',sure:2,review:0,rows:[a,c]}];
  window.open=u=>{(window.__opened=window.__opened||[]).push(u)}},[now,row('s2','فلاجيل شراب ١٢٥'),row('s3','جانوفيا ٥٠ مجم'),row('s1','بروفين ٤٠٠')]);
 await page.click('[data-tab="read"]');await page.click('#inboxRefresh');await page.waitForSelector('[data-inbox-open]');
 const openCo=async(co)=>{const i=await page.evaluate(co=>[...document.querySelectorAll('[data-inbox-open]')].findIndex(b=>b.closest('.item').textContent.includes(co)),co);
  await page.click(`[data-inbox-open="${i}"]`);await waitStatus(page,new RegExp(co+': اتقرا'))};
 await openCo('المتحدة للأدوية');
 const sent=await page.inputValue('#msgText');assert.match(sent,/فلاجيل شراب ١٢٥/);assert.match(sent,/جانوفيا ٥٠ مجم/);
 await page.click('#waBtn');await waitStatus(page,/اتعلّم 2 صنف «اتطلب»/,'msgStatus');
 assert.deepEqual((await table('ar_orders')).map(o=>[o.name_key,o.supplier]).sort(),[['FLAGYL 125MG SYP','المتحدة للأدوية'],['JANUVIA 50MG 28TAB','المتحدة للأدوية']]);
 assert.equal(await page.inputValue('#msgText'),sent,'the sent message stays as it was');
 assert.match(await text(page,'#results'),/اتطلب النهارده من المتحدة للأدوية/);
 await page.click('#waBtn');await page.waitForTimeout(200);assert.equal((await table('ar_orders')).length,2,'not marked twice');
 // another company with an ordered item and a new one: the message has only the new one, the other is listed under it
 await openCo('شركة النور');
 const m=await page.inputValue('#msgText');assert.match(m,/بروفين ٤٠٠/);assert.doesNotMatch(m,/فلاجيل/);
 assert.match(await text(page,'#msgSkip'),/اتطلبوا النهارده: فلاجيل شراب ١٢٥ من المتحدة للأدوية/);
 // undo: back in the message, the mark is deleted
 await page.click('#results [data-unorder="s2"]');await page.waitForFunction(()=>/فلاجيل/.test(document.getElementById('msgText').value));
 assert.deepEqual((await table('ar_orders')).map(o=>o.name_key),['JANUVIA 50MG 28TAB']);assert.equal(await text(page,'#msgSkip'),'');
 assert.match(await page.inputValue('#msgText'),/1- فلاجيل شراب ١٢٥\n2- بروفين ٤٠٠/);
 // yesterday's marks do not count today
 await page.evaluate(()=>{window.__tables.ar_orders.forEach(o=>{o.ordered_at=new Date(Date.now()-2*864e5).toISOString()})});
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(300);
 await openCo('المتحدة للأدوية');assert.match(await page.inputValue('#msgText'),/جانوفيا ٥٠ مجم/);
});
