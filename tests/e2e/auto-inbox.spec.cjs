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
});
