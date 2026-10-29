// Automatic incoming in the page: companies list, the phone key (only its hash is saved), the inbox grouped by company,
// opening it fills the results and the ready message and marks it seen.
const {run,text,waitStatus,assert}=require('./harness.cjs');
run('companies, phone key, inbox',async({page,table})=>{
 await page.click('[data-tab="read"]');await page.click('#autoSetup summary');
 await page.fill('#newSupplier','المتحدة للأدوية');await page.fill('#newSupplierPhone','01001234567');await page.click('#addSupplier');await waitStatus(page,/اتضافت/,'supplierStatus');
 assert.deepEqual((await table('ar_suppliers')).map(x=>[x.name,x.phone]),[['المتحدة للأدوية','201001234567']]);
 await page.click('#newKey');await waitStatus(page,/مفتاح جديد/,'keyStatus');
 const key=await page.inputValue('#keyText');assert.match(key,/^[0-9a-f]{64}$/);
 const keys=await table('ar_inbox_keys');assert.equal(keys.length,1);assert.match(keys[0].key_hash,/^[0-9a-f]{64}$/);assert.notEqual(keys[0].key_hash,key,'only the hash is saved');
 assert.match(await page.inputValue('#inboxUrl'),/\/functions\/v1\/arabic-shortages$/);
 await page.click('#newKey');await waitStatus(page,/مفتاح جديد/,'keyStatus');assert.equal((await table('ar_inbox_keys')).length,1,'a new key replaces the old one');
 const now=new Date().toISOString();
 await page.evaluate(now=>{window.__tables.ar_inbox=[
  {id:'i1',received_at:now,sender:'المتحدة للأدوية',supplier:'المتحدة للأدوية',kind:'image',status:'new',sure:1,review:0,rows:[{name:'فلاجيل شراب ١٢٥',key:'فلاجيل شراب 125',match:{id:'s2',confidence:'high',score:0.9},candidates:[{id:'s2',score:0.9,numbersOk:true}]}]},
  {id:'i2',received_at:now,sender:'المتحدة للأدوية',supplier:'المتحدة للأدوية',kind:'text',status:'new',sure:1,review:0,rows:[{name:'جانوفيا ٥٠ مجم',key:'جانوفيا 50 مجم',match:{id:'s3',confidence:'confirmed',score:1},candidates:[]}]}]},now);
 await page.click('#inboxRefresh');await page.waitForSelector('[data-inbox-open]');
 assert.match(await text(page,'#inboxList'),/المتحدة للأدوية.*جديد.*وصل 2/);
 await page.click('[data-inbox-open]');await waitStatus(page,/اتقرا/);
 assert.equal(await page.inputValue('#supplier'),'المتحدة للأدوية');assert.equal(await page.inputValue('#supplierPhone'),'201001234567');
 {const m=await page.inputValue('#msgText');assert.match(m,/فلاجيل شراب ١٢٥/);assert.match(m,/جانوفيا ٥٠ مجم/);}
 assert.deepEqual((await table('ar_inbox')).map(x=>x.status),['seen','seen']);assert.doesNotMatch(await text(page,'#inboxList'),/جديد/);
 // delete: asked first; «لأ» keeps it, «أيوه» removes this company's messages only; «امسح الكل» empties the list
 await page.evaluate(now=>window.__tables.ar_inbox.push({id:'i3',received_at:now,sender:'الفتح',supplier:'الفتح',kind:'text',status:'new',sure:0,review:0,rows:[]}),now);
 await page.click('#inboxRefresh');await page.waitForFunction(()=>document.querySelectorAll('[data-inbox-del]').length===2);
 const shown=async()=>(await table('ar_inbox')).filter(x=>!x.hidden_at);
 page.once('dialog',d=>d.dismiss());await page.click('[data-inbox-del="1"]');assert.equal((await shown()).length,3);
 const asked=[];page.once('dialog',d=>{asked.push(d.message());d.accept()});
 const del=await page.evaluate(()=>[...document.querySelectorAll('[data-inbox-del]')].findIndex(b=>b.closest('.item').textContent.includes('الفتح')));
 await page.click(`[data-inbox-del="${del}"]`);await page.waitForFunction(()=>document.querySelectorAll('[data-inbox-del]').length===1);
 assert.match(asked[0],/الفتح/);assert.deepEqual((await shown()).map(x=>x.id),['i1','i2']);
 assert.ok((await table('ar_inbox')).find(x=>x.id==='i3').hidden_at,'hidden, kept so a repeat is still known');
 page.once('dialog',d=>d.accept());await page.click('#inboxClear');await page.waitForFunction(()=>!document.querySelector('[data-inbox-del]'));
 assert.deepEqual(await shown(),[]);assert.equal((await table('ar_inbox')).length,3);assert.match(await text(page,'#inboxList'),/مفيش وارد/);
 assert.ok((await table('ar_suppliers')).length===1,'companies are kept');
 // photos that came while two companies sent photos: shown apart with each photo, until the owner picks its company
 await page.evaluate(now=>{window.__tables.ar_inbox.push(
  {id:'u1',received_at:now,sender:'المتحدة للأدوية',supplier:'المتحدة للأدوية',kind:'image',file_path:'2026-10-29/aaa.jpg',status:'new',sure:1,review:0,maybe:['المتحدة للأدوية','شركة النور'],rows:[]},
  {id:'u2',received_at:now,sender:'المتحدة للأدوية',supplier:'المتحدة للأدوية',kind:'image',file_path:'2026-10-29/bbb.jpg',status:'new',sure:0,review:2,maybe:['المتحدة للأدوية','شركة النور'],rows:[]})},now);
 await page.click('#inboxRefresh');await page.waitForSelector('[data-assign]');
 assert.match(await text(page,'#inboxList'),/صور من المتحدة للأدوية أو شركة النور/);assert.equal(await page.locator('[data-inbox-open]').count(),0,'no «افتح» before picking');
 await page.waitForFunction(()=>[...document.querySelectorAll('img[data-photo]')].every(i=>i.src.startsWith('data:image')));
 await page.click('[data-assign="u2"][data-to="شركة النور"]');await page.waitForFunction(()=>document.querySelectorAll('[data-assign]').length===2);
 const u2=(await table('ar_inbox')).find(x=>x.id==='u2');assert.equal(u2.supplier,'شركة النور');assert.equal(u2.maybe,null);
 assert.match(await text(page,'#inboxList'),/شركة النور.*وصل 0/);assert.equal(await page.locator('[data-inbox-open]').count(),1);
});
