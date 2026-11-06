// «الوارد» has three small tabs: النهارده (today's board + the automatic inbox), قراية بإيدك (company, photos / text / Excel)
// and الشركات (companies + the phone link). The status line, the results and the message sit under the first two. A number on
// «النهارده» counts what is new. The message says who it goes to, with a button that goes to the company box.
const {run,text,waitStatus,assert}=require('./harness.cjs');
run('inbox sub-tabs',async({page,table})=>{
 const vis=async ids=>Object.fromEntries(await Promise.all(ids.map(async id=>[id,await page.isVisible('#'+id)])));
 await page.click('[data-tab="read"]');

 // 1) starts on «النهارده»: today's board and the inbox, nothing of the other two
 assert.deepEqual(await vis(['subToday','todayBox','inboxBox','subManual','subCompanies','supplier','autoSetup']),
  {subToday:true,todayBox:true,inboxBox:true,subManual:false,subCompanies:false,supplier:false,autoSetup:false});
 assert.deepEqual(await page.$$eval('[data-sub]',b=>b.map(x=>[x.dataset.sub,!x.classList.contains('secondary')])),[['today',true],['manual',false],['companies',false]],'one tab looks selected');

 // 2) «قراية بإيدك»: company, phone, «غيّر الشركة», the three sources; the inbox is out of the way
 await page.click('[data-sub="manual"]');
 assert.deepEqual(await vis(['subToday','subManual','supplier','supplierPhone','pasteText','subCompanies']),{subToday:false,subManual:true,supplier:true,supplierPhone:true,pasteText:false,subCompanies:false});
 assert.equal(await page.$eval('#readOut',e=>e.classList.contains('hidden')),false,'status / results area shown under the manual tab');
 assert.ok(await page.isVisible('[data-src="img"]')&&await page.isVisible('[data-src="text"]')&&await page.isVisible('[data-src="excel"]'));
 assert.ok(await page.isVisible('#images'),'photos box is the first source');

 // 3) «الشركات»: companies and the phone link; no results area under it
 await page.click('[data-sub="companies"]');
 assert.deepEqual(await vis(['subCompanies','autoSetup','newSupplier','newKey','subManual','subToday']),{subCompanies:true,autoSetup:true,newSupplier:true,newKey:true,subManual:false,subToday:false});
 assert.equal(await page.$eval('#readOut',e=>e.classList.contains('hidden')),true,'no status / results area under the companies tab');

 await page.fill('#newSupplier','المتحدة للأدوية');await page.fill('#newSupplierPhone','01001234567');await page.click('#addSupplier');await waitStatus(page,/اتضافت/,'supplierStatus');
 // 4) the number on «النهارده»: companies with something new (and photos waiting for their company)
 const now=new Date().toISOString();
 await page.evaluate(now=>{window.__tables.ar_inbox=[
  {id:'i1',received_at:now,sender:'المتحدة للأدوية',supplier:'المتحدة للأدوية',kind:'text',status:'new',sure:1,review:0,rows:[{name:'فلاجيل شراب ١٢٥',key:'فلاجيل شراب 125',match:{id:'s2',confidence:'high',score:0.9},candidates:[{id:'s2',score:0.9,numbersOk:true}]}]},
  {id:'i2',received_at:now,sender:'شركة النور',supplier:'شركة النور',kind:'text',status:'seen',sure:0,review:0,rows:[]}];
  document.dispatchEvent(new Event('visibilitychange'))},now);
 await page.waitForFunction(()=>!document.getElementById('subBadge').classList.contains('hidden'));
 assert.equal(await text(page,'#subBadge'),'1','one company is new, the other was seen');

 // 5) opening a company stays on «النهارده»: results, and the message says who it goes to
 await page.click('[data-sub="today"]');
 await page.waitForSelector('[data-inbox-open]');
 await page.locator('[data-inbox-open]').first().click();await waitStatus(page,/اتقرا/);
 assert.ok(await page.isVisible('#subToday')&&!(await page.isVisible('#subManual')),'still on the today tab');
 assert.ok(await page.isVisible('#results'),'results under the tab');
 assert.match(await text(page,'#msgTo'),/الرسالة لـ المتحدة للأدوية · 201001234567/);
 assert.equal(await page.isVisible('#msgBox'),true);
 await page.waitForFunction(()=>document.getElementById('subBadge').classList.contains('hidden'));

 // 6) «غيّر الشركة» on the message goes to the company box, which is focused; typing there changes who the message is for
 await page.click('#msgChange');
 assert.ok(await page.isVisible('#subManual')&&await page.isVisible('#supplier'));
 assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),'supplier');
 await page.fill('#supplier','شركة النور');await page.fill('#supplierPhone','01112223334');
 assert.match(await text(page,'#msgTo'),/الرسالة لـ شركة النور · 01112223334/);
 assert.ok(await page.isVisible('#msgBox')&&await page.isVisible('#results'),'the message and results stay under the manual tab too');

 // 7) the company box empty: the message asks for a company
 await page.fill('#supplier','');
 assert.match(await text(page,'#msgTo'),/اختار الشركة الأول/);

 // 8) a manual read keeps working from its own tab, and the status line is shown there
 await page.click('[data-src="text"]');await page.fill('#pasteText','فلاجيل شراب ١٢٥');await page.click('#textBtn');await waitStatus(page,/اتقرا/);
 assert.ok(await page.isVisible('#readStatus'));

 // 9) the tabs only show and hide: nothing written
 assert.deepEqual((await page.evaluate(()=>window.__fakeWrites)).filter(w=>!['ar_inbox','ar_suppliers'].includes(w.table)),[],'only what this test did was written: the company it added and the «seen» mark of the opened company');
});
