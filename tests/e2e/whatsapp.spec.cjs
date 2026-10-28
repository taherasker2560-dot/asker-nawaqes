// WhatsApp: share target (image and text through the service worker), company name read off the list, ready message,
// wa.me link with/without the company number, saved companies, paste of copied messages (time/sender prefix removed).
const {run,text,waitStatus,assert}=require('./harness.cjs'),fs=require('node:fs');
const share=(page,fields)=>page.evaluate(({img,txt})=>{const f=document.createElement('form');f.method='POST';f.action='ar/share';f.enctype='multipart/form-data';
 if(img){const i=document.createElement('input');i.type='file';i.name='files';const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(img),c=>c.charCodeAt(0))],'whatsapp1.png',{type:'image/png'}));i.files=dt.files;f.append(i)}
 if(txt){const t=document.createElement('textarea');t.name='text';t.value=txt;f.append(t)}
 document.body.append(f);f.submit()},fields);
run('share from WhatsApp, ready message, companies',async({page,fixture,table})=>{
 assert.equal(await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration('ar/');return r&&r.scope.endsWith('/ar/')}),true,'worker only controls ar/');
 await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration('ar/');return !!(r&&r.active)});
 await share(page,{img:fs.readFileSync(fixture('lines0.png')).toString('base64')});
 await page.waitForURL(/asker-nawaqes-arabic\.html$/);await waitStatus(page,/اتقرا/);
 assert.equal(await page.inputValue('#supplier'),'المتحدة للأدوية','company read off the list');
 assert.equal(await page.inputValue('#msgText'),'السلام عليكم،\nمحتاجين من المتاح عندكم:\n1- فلاجيل شراب ١٢٥\n\nصيدلية عسكر');
 assert.equal(await page.evaluate(async()=>(await (await caches.open('ar-share')).keys()).length),0,'shared files removed after reading');
 await page.evaluate(()=>{window.__opened=[];window.open=u=>{window.__opened.push(u)}});await page.click('#waBtn');
 assert.match((await page.evaluate(()=>window.__opened))[0],/^https:\/\/wa\.me\/\?text=/);
 await page.fill('#supplier','شركة جديدة');await page.fill('#supplierPhone','01112223334');await page.click('#waBtn');await page.waitForTimeout(300);
 assert.match((await page.evaluate(()=>window.__opened))[1],/^https:\/\/wa\.me\/201112223334\?text=/);
 assert.deepEqual((await table('ar_suppliers')).map(s=>[s.name,s.phone]),[['المتحدة للأدوية',null],['شركة جديدة','201112223334']],'both companies saved');
 await page.fill('#supplierPhone','');await page.fill('#supplier','');await page.type('#supplier','شركة جديدة');
 assert.equal(await page.inputValue('#supplierPhone'),'201112223334','saved company fills its number');
 await share(page,{txt:'فلاجيل شراب ١٢٥\nحاجة'});await page.waitForURL(/asker-nawaqes-arabic\.html$/);await waitStatus(page,/اتقرا/);
 assert.deepEqual(await page.evaluate(()=>window.__lines),['فلاجيل شراب ١٢٥','حاجة']);
});
run('paste copied WhatsApp messages',async({page})=>{
 await page.click('[data-tab="read"]');await page.click('[data-src="text"]');
 await page.click('#pasteBtn');await page.waitForTimeout(300);assert.match(await text(page,'#readStatus'),/مالقيتش كلام منسوخ/);
 await page.evaluate(()=>navigator.clipboard.writeText('[10:15, 28/10] المتحدة: فلاجيل شراب ١٢٥\nجانوفيا ٥٠ مجم'));
 await page.click('#pasteBtn');await waitStatus(page,/اتقرا/);
 assert.deepEqual(await page.evaluate(()=>window.__lines),['فلاجيل شراب ١٢٥','جانوفيا ٥٠ مجم'],'time and sender removed');
 assert.equal(await page.inputValue('#supplier'),'المتحدة','sender used as the company');
},{permissions:['clipboard-read','clipboard-write']});
