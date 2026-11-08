// «فواتير» tab: the documents that came from the WhatsApp group (waiting / done, with their photo), and taking photos
// here: every photo is one more page of the same invoice, sent with one note, kept once in ar-inbox/docs/.
const {run,waitStatus,assert}=require('./harness.cjs');
const img=(n)=>({name:`IMG-${n}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from([0xff,0xd8,0xff,0xe0,n,1,2,3])});
run('documents tab: list and take photos',async({page,table})=>{
 const t=new Date().toISOString();
 await page.evaluate((t)=>{window.__tables.ar_documents=[
  {id:'d1',received_at:t,source:'whatsapp',chat:'الجروب',file_path:'docs/2026-11-08/aaa.jpg',kind:'image',status:'new'},
  {id:'d2',received_at:'2026-11-07T10:00:00Z',source:'whatsapp',chat:'الجروب',file_path:'docs/2026-11-07/bbb.jpg',kind:'image',status:'entered',doc_type:'purchase',supplier:'رضا عطية',doc_no:'89233',total:1156.86}]},t);
 await page.click('[data-tab="docs"]');
 await page.waitForFunction(()=>/مستنية \(1\)/.test(document.getElementById('dcWaitTitle').textContent));
 assert.ok(await page.isVisible('#docsPanel'));assert.ok(!(await page.isVisible('#suppliersPanel')));
 assert.match(await page.textContent('#dcWait'),/النهارده .* · من الجروب/);assert.match(await page.textContent('#dcWait'),/مستنية Claude/);
 assert.match(await page.textContent('#dcDone'),/اتدخلت في فارمافلاي/);assert.match(await page.textContent('#dcDone'),/فاتورة شرا · رضا عطية · 89233 · 1156\.86/);
 assert.equal(await page.$$eval('#dcWait img',x=>x.length),1,'its photo (private link)');
 // two photos = two pages of one invoice, then one note
 assert.ok(await page.$eval('#dcSend',b=>b.disabled),'nothing to send yet');
 await page.setInputFiles('#dcFile',img(1));
 assert.match(await page.textContent('#dcPickLabel'),/زوّد صفحة/);
 await page.setInputFiles('#dcFile',img(2));
 assert.match(await page.textContent('#dcPicked'),/صفحات الفاتورة دي: 2/);
 await page.fill('#dcNote','فيها إشعار');
 await page.click('#dcSend');
 await waitStatus(page,/اتبعتت 2 صفحة/,'dcStatus');
 const rows=(await table('ar_documents')).filter(r=>r.source==='upload');
 assert.equal(rows.length,2);assert.equal(rows[0].batch,rows[1].batch,'same invoice');assert.ok(rows[0].batch);
 assert.ok(rows.every(r=>r.note==='فيها إشعار'&&r.kind==='image'&&r.status==='new'&&/^docs\/\d{4}-\d\d-\d\d\/[0-9a-f]{32}\.jpg$/.test(r.file_path)));
 assert.notEqual(rows[0].file_path,rows[1].file_path);
 assert.ok(await page.evaluate((p)=>p.every(x=>x in window.__storage),rows.map(r=>r.file_path)),'files kept in the private bucket');
 await page.waitForFunction(()=>/مستنية \(3\)/.test(document.getElementById('dcWaitTitle').textContent));
 assert.match(await page.textContent('#dcWait'),/صورتها من هنا/);
 assert.equal(await page.inputValue('#dcNote'),'');assert.ok(await page.$eval('#dcSend',b=>b.disabled));
 // the page still fits the phone with five tabs
 const wide=await page.evaluate(()=>{const W=document.documentElement.clientWidth;return [...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5)}).map(e=>e.tagName+'#'+e.id+'.'+e.className+' '+Math.round(e.getBoundingClientRect().left)+'..'+Math.round(e.getBoundingClientRect().right)).slice(0,8)});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the screen; too wide: '+wide.join(' | '));
});
