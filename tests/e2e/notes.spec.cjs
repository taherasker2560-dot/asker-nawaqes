// «الرئيسية ← ملاحظاتي» (owner 2026-11-15): add a note by hand, tick it, bring it back, drop it; when the laptop says he is in the
// pharmacy the card turns amber with «انت في الصيدلية: عندك N حاجة» and the bell is asked for once; no card when the server has no
// notes tables yet.
const {run,assert}=require('./harness.cjs');
run('Notes: add, tick, bring back, drop; the pharmacy reminder with one bell per arrival',async({page})=>{
 await page.evaluate(()=>{window.__rung=0;window.AskerNotify&&(window.AskerNotify.play=()=>{window.__rung++});
  const iso=m=>new Date(Date.now()-m*6e4).toISOString();
  window.__tables.ar_notes=[{id:1,text:'اسأل على فاتورة الفتح',place:'pharmacy',status:'open',created_at:iso(3000)},{id:2,text:'كلم المحاسب',place:'any',status:'open',created_at:iso(100)},{id:3,text:'خلصت دي',place:'pharmacy',status:'done',created_at:iso(500),done_at:iso(20)}];
  window.__tables.ar_presence=[{id:1,at_pharmacy:false,since:iso(300),checked_at:iso(2)}];});
 await page.evaluate(()=>window.AskerNotes.refresh());
 await page.waitForSelector('#ntList .nt-row');
 assert.ok(await page.isVisible('#notesCard'));
 assert.equal(await page.$$eval('#ntList .nt-row',r=>r.length),2);
 assert.match(await page.textContent('#ntPresence'),/انت برا الصيدلية/);
 assert.ok(!(await page.$eval('#notesCard',e=>e.classList.contains('nt-hot'))),'outside: no amber');
 assert.match(await page.textContent('#ntDoneBox summary'),/اتعملت.*1/);
 // add by hand: the box (Enter works too), «في الصيدلية» on
 await page.fill('#ntText','اطلب أكياس');await page.click('#ntAdd');
 await page.waitForFunction(()=>document.querySelectorAll('#ntList .nt-row').length===3);
 assert.equal(await page.inputValue('#ntText'),'');
 const w=await page.evaluate(()=>window.__fakeWrites.filter(x=>x.table==='ar_notes'&&x.k==='insert').map(x=>x.v[0]));
 assert.deepEqual([w[0].text,w[0].place,w[0].status],['اطلب أكياس','pharmacy','open']);
 // a note without the reminder
 await page.uncheck('#ntPlace');await page.fill('#ntText','فكرة بس');await page.press('#ntText','Enter');
 await page.waitForFunction(()=>document.querySelectorAll('#ntList .nt-row').length===4);
 assert.equal((await page.evaluate(()=>window.__fakeWrites.filter(x=>x.table==='ar_notes'&&x.k==='insert').pop().v[0].place)),'any');
 // tick one: it moves under «اتعملت», and comes back
 await page.click('#ntList [data-nt-done="2"]');
 await page.waitForFunction(()=>document.querySelectorAll('#ntList .nt-row').length===3);
 assert.match(await page.textContent('#ntDoneBox summary'),/2/);
 await page.click('#ntDoneBox summary');await page.click('#ntDone [data-nt-undo="2"]');
 await page.waitForFunction(()=>document.querySelectorAll('#ntList .nt-row').length===4);
 // drop one
 await page.click('#ntList [data-nt-drop="2"]');
 await page.waitForFunction(()=>document.querySelectorAll('#ntList .nt-row').length===3);
 // he arrives: the laptop says so → amber, the count, the due rows, ONE bell
 await page.evaluate(()=>{const iso=m=>new Date(Date.now()-m*6e4).toISOString();window.__tables.ar_presence=[{id:1,at_pharmacy:true,since:iso(1),checked_at:iso(1)}];return window.AskerNotes.refresh()});
 await page.waitForFunction(()=>document.getElementById('notesCard').classList.contains('nt-hot'));
 assert.match(await page.textContent('#ntPresence'),/انت في الصيدلية: عندك 2 حاجة تعملها/);
 assert.equal(await page.$$eval('#ntList .nt-row.due',r=>r.length),2,'the two pharmacy notes are marked');
 assert.equal(await page.evaluate(()=>window.__rung),1,'one bell on arrival');
 await page.evaluate(()=>window.AskerNotes.refresh());await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>window.__rung),1,'not again on the next refresh');
 // fits the phone
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
 // the laptop stops talking: «مش عارف» and no amber
 await page.evaluate(()=>{const iso=m=>new Date(Date.now()-m*6e4).toISOString();window.__tables.ar_presence=[{id:1,at_pharmacy:true,since:iso(200),checked_at:iso(90)}];return window.AskerNotes.refresh()});
 await page.waitForFunction(()=>!document.getElementById('notesCard').classList.contains('nt-hot'));
 assert.match(await page.textContent('#ntPresence'),/مش عارف انت فين/);
},{home:true});
