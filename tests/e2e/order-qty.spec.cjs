// Quantity in the message to the company: the laptop's suggestion (suggested_qty) is filled in next to each item, the
// owner changes it (saved as order_qty, it wins), empty goes back to the suggestion, 0 is refused, and a message the
// owner edited by hand is not rewritten. Items without any quantity keep the old line format.
const fs=require('node:fs'),path=require('node:path');
const {run,text,waitStatus,assert}=require('./harness.cjs');
run('order quantity in the message',async({page,table})=>{
 // the same fake Supabase, with a suggested quantity for FLAGYL (s2) from the laptop
 const src="{id:'s2',product_name:'FLAGYL 125MG SYP',is_active:true}";
 const fake=fs.readFileSync(path.join(__dirname,'fake-supabase-ar.js'),'utf8').replace(src,src.slice(0,-1)+',suggested_qty:3}');
 assert.ok(fake.includes('suggested_qty:3'),'fixture patched');
 await page.route(u=>u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase'),r=>r.fulfill({contentType:'application/javascript',body:fake}));
 await page.reload();await page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
 const now=new Date().toISOString();
 const row=(id,name)=>({name,key:name,match:{id,confidence:'high',score:0.9},candidates:[{id,score:0.9,numbersOk:true}]});
 await page.evaluate(([now,a,b])=>{
  window.__tables.ar_inbox=[{id:'i1',received_at:now,sender:'المتحدة للأدوية',supplier:'المتحدة للأدوية',kind:'text',status:'new',sure:2,review:0,rows:[a,b]}];
  window.open=u=>{(window.__opened=window.__opened||[]).push(u)}},[now,row('s2','فلاجيل شراب ١٢٥'),row('s3','جانوفيا ٥٠ مجم')]);
 await page.click('[data-tab="read"]');await page.click('#inboxRefresh');await page.waitForSelector('[data-inbox-open]');
 await page.click('[data-inbox-open="0"]');await waitStatus(page,/المتحدة للأدوية: اتقرا/);
 await page.waitForSelector('[data-qty="s2"]');
 // suggestion filled in and written in the message; the item without a quantity keeps the old line
 assert.equal(await page.inputValue('[data-qty="s2"]'),'3');
 assert.equal(await page.inputValue('[data-qty="s3"]'),'');
 const m=await page.inputValue('#msgText');
 assert.match(m,/1- فلاجيل شراب ١٢٥ — 3\n/);assert.match(m,/2- جانوفيا ٥٠ مجم\n/);
 assert.match(await text(page,'#msgQty'),/مقترح: 3/);
 // the owner sets a quantity: saved and written in the message
 await page.fill('[data-qty="s3"]','5');await page.press('[data-qty="s3"]','Tab');
 await waitStatus(page,/اتحفظت الكمية/,'msgStatus');
 assert.match(await page.inputValue('#msgText'),/2- جانوفيا ٥٠ مجم — 5\n/);
 assert.equal((await table('ar_shortages')).find(x=>x.id==='s3').order_qty,5);
 // the owner's quantity wins over the suggestion
 await page.fill('[data-qty="s2"]','7');await page.press('[data-qty="s2"]','Tab');
 await page.waitForFunction(()=>/فلاجيل شراب ١٢٥ — 7/.test(document.getElementById('msgText').value));
 // empty: back to the suggestion
 await page.fill('[data-qty="s2"]','');await page.press('[data-qty="s2"]','Tab');
 await waitStatus(page,/رجعت للكمية المقترحة/,'msgStatus');
 assert.equal((await table('ar_shortages')).find(x=>x.id==='s2').order_qty,null);
 assert.match(await page.inputValue('#msgText'),/فلاجيل شراب ١٢٥ — 3\n/);
 // 0 is refused and nothing is saved
 await page.fill('[data-qty="s3"]','0');await page.press('[data-qty="s3"]','Tab');
 await waitStatus(page,/لازم تكون رقم أكبر من صفر/,'msgStatus');
 assert.equal(await page.inputValue('[data-qty="s3"]'),'5');
 assert.equal((await table('ar_shortages')).find(x=>x.id==='s3').order_qty,5);
 // a message edited by hand is not rewritten; the quantity is still saved
 await page.fill('#msgText','رسالة كتبتها بإيدي');
 await page.fill('[data-qty="s3"]','2');await page.press('[data-qty="s3"]','Tab');
 await waitStatus(page,/غيّر الرقم فيها بنفسك/,'msgStatus');
 assert.equal(await page.inputValue('#msgText'),'رسالة كتبتها بإيدي');
 assert.equal((await table('ar_shortages')).find(x=>x.id==='s3').order_qty,2);
});
