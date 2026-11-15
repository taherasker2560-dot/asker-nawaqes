// Quantity boxes that are READY (owner 2026-11-15): the first box has the cursor with its number selected, typing a number replaces it
// (5, 10, 50), Enter goes to the next box (ticked rows only), on the last one the keyboard closes, and a number he typed turns the box
// blue. «الطلبيات ← تعديل الأصناف» and the quantities of «الوارد».
const fs=require('node:fs'),path=require('node:path');
const {run,waitStatus,assert}=require('./harness.cjs');
const item=(id,name,qty)=>({item_id:id,name_pf:name,qty,need:qty-0.4,have:0,avg30:6,min:0,public_price:100,discount:30,source:'list',source_date:'2026-11-08',stale:false,bonus:0,mismatch:false,
 list:{discount:30,date:'2026-11-08'},buy:{discount:29,date:'2026-03-03',bonus:0},est_cost:qty*70,fallback:{supplier:'ELFATH',label:'الفتح',discount:28,source:'buy',date:'2026-10-01',stale:false}});
const drafts=()=>({generated_at:new Date().toISOString(),suppliers:[{id:'NEWCITY',label:'نيو سيتي',count:4,items:[item(11,'ITEM ONE',23),item(12,'ITEM TWO',3),item(13,'ITEM THREE',8),item(14,'ITEM FOUR',2)]}],no_offer:[]});
const active=(page)=>page.evaluate(()=>{const a=document.activeElement;return a&&a.closest&&a.closest('[data-k]')?a.closest('[data-k]').dataset.k:(a&&a.dataset&&a.dataset.qty)||(a&&a.tagName==='BODY'?'body':a&&a.tagName)});
run('quantity boxes: ready on the first, type to replace, Enter for the next, blue when typed (orders)',async({page})=>{
 await page.evaluate((o)=>{window.__storage['orders/drafts.json']=JSON.stringify(o);window.__tables.ar_orders=[];window.__tables.ar_suppliers=[]},drafts());
 await page.click('[data-group="purchases"]');await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');
 await page.waitForSelector('#odChips [data-sup]');
 // opening «تعديل الأصناف»: the cursor is ALREADY in the first quantity, no tap needed
 await page.click('#odEdit');
 assert.equal(await active(page),'11');
 assert.equal(await page.getAttribute('#odItems [data-k="11"] [data-qty]','enterkeyhint'),'next');
 assert.ok(!(await page.$eval('#odItems [data-k="11"] .od-qty',e=>e.classList.contains('mine'))),'not blue until he types');
 // typing replaces the whole number (23 -> 5, no deleting first)
 await page.keyboard.type('5');
 assert.equal(await page.inputValue('#odItems [data-k="11"] [data-qty]'),'5');
 assert.ok(await page.$eval('#odItems [data-k="11"] .od-qty',e=>e.classList.contains('mine')),'his number is blue');
 // Enter: the next box, its number selected, so «10» replaces 3
 await page.keyboard.press('Enter');
 assert.equal(await active(page),'12');
 await page.keyboard.type('10');
 assert.equal(await page.inputValue('#odItems [data-k="12"] [data-qty]'),'10');
 // Enter without typing keeps the number and moves on (not blue)
 await page.keyboard.press('Enter');
 assert.equal(await active(page),'13');
 assert.equal(await page.inputValue('#odItems [data-k="13"] [data-qty]'),'8');
 assert.ok(!(await page.$eval('#odItems [data-k="13"] .od-qty',e=>e.classList.contains('mine'))));
 await page.keyboard.press('Enter');
 assert.equal(await active(page),'14');
 assert.equal(await page.getAttribute('#odItems [data-k="14"] [data-qty]','enterkeyhint'),'done','the last box says «done»');
 await page.keyboard.type('50');
 // Enter on the last one: the cursor leaves (the keyboard closes), and the order follows the numbers
 await page.keyboard.press('Enter');
 assert.equal(await active(page),'body');
 assert.match(await page.inputValue('#odMsg'),/ITEM ONE.* × 5\n.*ITEM TWO.* × 10\n.*ITEM THREE.* × 8\n.*ITEM FOUR.* × 50/);
 // an unticked row is skipped by Enter
 await page.click('#odItems [data-k="12"] [data-on]');
 await page.click('#odItems [data-k="11"] [data-qty]');
 assert.equal(await active(page),'11');
 await page.keyboard.press('Enter');
 assert.equal(await active(page),'13','«ITEM TWO» is unticked: skipped');
 // a tap on a box selects its number too (typing replaces it)
 await page.click('#odItems [data-k="14"] [data-qty]');
 await page.keyboard.type('7');
 assert.equal(await page.inputValue('#odItems [data-k="14"] [data-qty]'),'7');
 // the page still fits the phone
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
});
run('quantity boxes in «الوارد»: ready, typed number replaces the suggestion and is saved, Enter for the next, blue',async({page,table})=>{
 const src="{id:'s2',product_name:'FLAGYL 125MG SYP',is_active:true}";
 const fake=fs.readFileSync(path.join(__dirname,'fake-supabase-ar.js'),'utf8').replace(src,src.slice(0,-1)+',suggested_qty:3}');
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
 // the cursor is already in the first quantity (the suggestion 3 is selected)
 await page.waitForFunction(()=>document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.qty==='s2',null,{timeout:5000});
 assert.ok(!(await page.$eval('[data-qty="s2"]',e=>e.closest('label').classList.contains('mine'))));
 await page.keyboard.type('12');
 assert.equal(await page.inputValue('[data-qty="s2"]'),'12','typing replaced the suggestion');
 await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.qty),'s3');
 await waitStatus(page,/اتحفظت الكمية/,'msgStatus');
 assert.equal((await table('ar_shortages')).find(x=>x.id==='s2').order_qty,12);
 assert.ok(await page.$eval('[data-qty="s2"]',e=>e.closest('label').classList.contains('mine')),'his number is blue');
 await page.keyboard.type('5');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>/جانوفيا ٥٠ مجم — 5/.test(document.getElementById('msgText').value));
 assert.equal(await page.evaluate(()=>document.activeElement.tagName),'BODY','Enter on the last quantity closes the keyboard');
 // empty = back to the suggestion: not blue any more
 await page.click('[data-qty="s2"]');await page.keyboard.press('Backspace');await page.keyboard.press('Enter');
 await waitStatus(page,/رجعت للكمية المقترحة/,'msgStatus');
 assert.ok(!(await page.$eval('[data-qty="s2"]',e=>e.closest('label').classList.contains('mine'))));
});

run('quantity boxes learn: the number he chose last time starts blue, the new one is remembered',async({page,table})=>{
 await page.evaluate((o)=>{window.__storage['orders/drafts.json']=JSON.stringify(o);window.__tables.ar_orders=[];window.__tables.ar_suppliers=[];window.__tables.ar_order_qty=[{item_id:11,item_name:'ITEM ONE',qty:6,suggested:23,supplier:'NEWCITY'}]},drafts());
 await page.click('[data-group="purchases"]');await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');
 await page.waitForSelector('#odChips [data-sup]');
 // an item he chose a number for starts at it (blue), the others at the laptop's number; the order follows
 await page.click('#odEdit');
 assert.equal(await page.inputValue('#odItems [data-k="11"] [data-qty]'),'6');
 assert.ok(await page.$eval('#odItems [data-k="11"] .od-qty',e=>e.classList.contains('mine')));
 assert.equal(await page.inputValue('#odItems [data-k="12"] [data-qty]'),'3');
 assert.ok(!(await page.$eval('#odItems [data-k="12"] .od-qty',e=>e.classList.contains('mine'))));
 assert.match(await page.inputValue('#odMsg'),/ITEM ONE.* × 6\n.*ITEM TWO.* × 3/);
 // a new number is remembered when the cursor leaves the box (Enter); the old one is replaced, not doubled
 await page.keyboard.type('9');await page.keyboard.press('Enter');
 await page.keyboard.type('4');await page.keyboard.press('Enter');
 const rows=async()=>(await table('ar_order_qty')).map(x=>[x.item_id,x.qty,x.suggested,x.supplier]).sort((a,b)=>a[0]-b[0]);
 await page.waitForFunction(()=>window.__tables.ar_order_qty.length===2);
 assert.deepEqual(await rows(),[[11,9,23,'NEWCITY'],[12,4,3,'NEWCITY']]);
 // 0 or empty is not learned (it only means «not now»)
 await page.fill('#odItems [data-k="13"] [data-qty]','0');await page.press('#odItems [data-k="13"] [data-qty]','Tab');
 await page.fill('#odItems [data-k="14"] [data-qty]','');await page.press('#odItems [data-k="14"] [data-qty]','Tab');
 await page.waitForTimeout(300);
 assert.equal((await rows()).length,2);
 // a server without the table yet: the page still opens at the laptop's numbers
 await page.evaluate(()=>{delete window.__tables.ar_order_qty;window.__fakeWrites=[]});
 await page.evaluate(()=>window.AskerOrderDrafts.open());
 await page.waitForSelector('#odChips [data-sup]');
});
