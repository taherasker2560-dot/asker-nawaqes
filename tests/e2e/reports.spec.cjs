// «📊 التقارير» (owner 2026-11-26, «ا، ابنيها» to the mockup): the sixth button (the first slot under the bottom bar) opens one page with every report in four groups; each card opens its report, with
// «‹ التقارير» on top; going elsewhere takes it away; «المبيعات» keeps only «الموقع» and «البيع المؤقت»; the sixth button is fixed; what he had in that slot moves; a staff member has none.
const {run,assert}=require('./harness.cjs');
const ready=(page)=>page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
const names=(page,sel)=>page.$$eval(sel,b=>b.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
const vis=(page,id)=>page.isVisible('#'+id);
const WHERE={iret:'dayItemsPanel',inew:'dayItemsPanel',izero:'dayItemsPanel',day:'dayPanel',profit:'profitPanel',dayclose:'closePanel',cash:'cashPanel',sales:'salesPanel',custst:'customersPanel',olddebt:'customersPanel',chronic:'customersPanel',users:'storeOrdersPanel',
 stockval:'stockValPanel',expiry:'expiryPanel',season:'shortPanel',retmarks:'expiryPanel',vendst:'vendorsPanel',returns:'vendorsPanel',whofrom:'vendorsPanel',compare:'draftsPanel'};

run('Reports: the sixth button opens one page with every report; each card opens its report with «‹ التقارير» on top',async({page})=>{
 await ready(page);
 const six=page.locator('#spareBar .sp-slot').first();
 assert.equal((await six.textContent()).trim(),'التقارير','the first slot under the bar is the sixth button');
 assert.equal(await six.getAttribute('data-go'),'reports');
 await six.click();
 await page.waitForSelector('#reportsPanel:not(.hidden) .rp-card');
 assert.deepEqual(await names(page,'#rpMain h3'),['الأصناف يوم بيوم','الفلوس والربح','المبيعات والعملاء','المخزون','المشتريات والموردين']);
 const ids=await page.$$eval('#rpMain [data-rp]',(b)=>b.map(x=>x.dataset.rp));
 assert.deepEqual(ids,Object.keys(WHERE).sort((a,b)=>ids.indexOf(a)-ids.indexOf(b)));
 assert.equal(ids.length,20);
 await page.waitForFunction(()=>document.querySelector('.brand p').textContent.trim()==='التقارير');
 assert.equal(await page.$$eval('.bottomnav [data-group]:not(.secondary)',(b)=>b.length),0,'no button of the bar is lit');
 assert.equal(await vis(page,'rpBack'),false,'the page itself has no «back»');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the phone');
 for(const id of ids){
  await page.click(`#rpMain [data-rp="${id}"]`);
  await page.waitForSelector('#'+WHERE[id]+':not(.hidden)');
  assert.ok(await vis(page,'rpBack'),'«‹ التقارير» on '+id);
  assert.equal(await vis(page,'reportsPanel'),false,id);
  await page.click('#rpBack button');
  await page.waitForSelector('#reportsPanel:not(.hidden) .rp-card');
 }
});

run('Reports: a customers card opens the list on its filter, and a suppliers card opens the right view even after another one was left open',async({page})=>{
 await ready(page);
 // made-up customers: one with an old debt and no movement, one who owes us nothing
 await page.evaluate(()=>{const iso=(n)=>new Date(Date.now()-n*864e5).toISOString();
  window.__tables.ar_customers=[{id:101,name:'عميل مثال أ',credit_limit:100,balance:500,last_at:iso(200),last_kind:'sale',moves:3},{id:102,name:'عميل مثال ب',credit_limit:0,balance:-20,last_at:iso(2),last_kind:'sale',moves:2}];
  window.__tables.ar_customer_moves=[];window.__tables.ar_customer_phones=[]});
 const card=async(id)=>{await page.evaluate(()=>window.AskerApp.showTab('reports'));await page.click(`#rpMain [data-rp="${id}"]`)};
 for(const [id,view] of [['olddebt','old'],['custst','all'],['olddebt','old']]){
  await card(id);
  await page.waitForSelector(`#cuChips .chip.on[data-cu-view="${view}"]`);
 }
 // «الصنف ده جه من مين»: its own view with its search box, not just the suppliers list
 await card('whofrom');await page.waitForSelector('#veFindBox',{state:'visible'});
 assert.equal(await page.isVisible('#veListView'),false);assert.ok(await vis(page,'rpBack'));
 // then «كشف حساب مورد»: back to the list
 await card('vendst');await page.waitForSelector('#veListView',{state:'visible'});
 assert.equal(await page.isVisible('#veItem'),false);
 // the home button of the same report (2026-11-19) opens the same view
 await page.evaluate(()=>localStorage.setItem('asker-spare-buttons',JSON.stringify(['reports','whofrom',null,null,null])));
 await page.reload();await ready(page);
 await page.click('#spareBar .sp-slot >> nth=1');await page.waitForSelector('#veFindBox',{state:'visible'});
});

run('Reports: going elsewhere takes «‹ التقارير» away; a report screen of its own always has it; «المبيعات» keeps two tabs; the sixth button is fixed',async({page})=>{
 await ready(page);
 await page.click('#spareBar .sp-slot >> nth=0');await page.click('#rpMain [data-rp="cash"]');await page.waitForSelector('#cashPanel:not(.hidden)');
 await page.click('[data-group="purchases"]');assert.equal(await vis(page,'rpBack'),false);
 await page.click('[data-group="accounts"]');await page.click('.subbar[data-for="accounts"] [data-tab="cash"]');
 assert.equal(await vis(page,'rpBack'),false,'«الخزن» from its own section has no «back»');
 // the day from the home card or anywhere: it has no tab of its own any more, so the way to the reports is on top of it
 await page.evaluate(()=>window.AskerApp.showTab('day'));await page.waitForSelector('#dayPanel:not(.hidden)');
 assert.ok(await vis(page,'rpBack'));
 await page.click('[data-group="sales"]');
 assert.deepEqual(await names(page,'.subbar[data-for="sales"] [data-tab]'),['الموقع','البيع المؤقت']);
 assert.equal(await vis(page,'rpBack'),false);
 // a long press on the sixth button changes nothing; on an empty slot the picker does not offer «التقارير» again, and offers the reports
 const b=await page.locator('#spareBar .sp-slot').first().boundingBox();
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
 assert.equal(await page.isVisible('#spSheet .qa-sheet-in'),false,'the sixth button is fixed');
 await page.click('#spareBar .sp-slot >> nth=1');await page.waitForSelector('#spSheet .qa-sheet-in',{state:'visible'});
 assert.equal(await page.$('#spSheet [data-sp-pick="reports"]'),null);
 for(const t of ['day','profit','dayclose','stockval','sales'])assert.ok(await page.$(`#spSheet [data-sp-pick="${t}"]`),t);
 await page.click('#spSheet [data-sp-pick="profit"]');
 await page.click('#spareBar .sp-slot >> nth=1');await page.waitForSelector('#profitPanel:not(.hidden)');
});

run('Reports: what he had in the first slot moves to an empty one; a staff member has neither the row nor the page',async({page})=>{
 await ready(page);
 await page.evaluate(()=>localStorage.setItem('asker-spare-buttons',JSON.stringify(['docs',null,'stock',null,null])));
 await page.reload();await ready(page);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker-spare-buttons'))),['reports','docs','stock',null,null]);
 assert.deepEqual((await names(page,'#spareBar .sp-slot.on')),['التقارير','الفواتير','المخزون']);
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;window.AskerStaff.fixTab=(t)=>window.AskerStaffLib.fixTab(t,[]);document.documentElement.classList.add('staff');window.AskerApp.showTab('reports')});
 assert.equal(await page.$eval('#reportsPanel',(x)=>x.classList.contains('hidden')),true,'a staff member does not reach the page');
 assert.equal(await page.isVisible('#spareBar'),false);
});
