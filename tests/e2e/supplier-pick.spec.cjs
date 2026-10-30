// «غيّر الشركة (المندوب)»: all saved companies, whatever is in the box; picking one writes its name and number
// (an empty number when it has none), and the message then opens that company's chat.
const {run,text,waitStatus,assert}=require('./harness.cjs');
run('change the company the message goes to',async({page})=>{
 await page.click('[data-tab="read"]');await page.click('#autoSetup summary');
 for(const [n,p] of [['شركه فارما بالنهار (امانى)','01042141991'],['شركه فارما بالليل (احمد مسعد)','01000000001'],['مخزن جديد','']]){
  await page.fill('#newSupplier',n);await page.fill('#newSupplierPhone',p);await page.click('#addSupplier');await waitStatus(page,new RegExp('اتضافت: '+n.replace(/[()]/g,'.')),'supplierStatus');}
 await page.click('[data-src="text"]');await page.fill('#pasteText','فلاجيل شراب ١٢٥');await page.click('#textBtn');await waitStatus(page,/اتقرا/);
 await page.fill('#supplier','شركه فارما بالنهار (امانى)');await page.fill('#supplierPhone','201042141991');
 await page.click('#supplierPickBox summary');
 assert.equal(await page.locator('#supplierPick [data-pick-supplier]').count(),3,'every company, not only names like the one written');
 await page.click('#supplierPick [data-pick-supplier="شركه فارما بالليل (احمد مسعد)"]');
 assert.equal(await page.inputValue('#supplier'),'شركه فارما بالليل (احمد مسعد)');assert.equal(await page.inputValue('#supplierPhone'),'201000000001');
 assert.equal(await page.evaluate(()=>document.getElementById('supplierPickBox').open),false,'closes after picking');
 await page.evaluate(()=>{window.__opened=[];window.open=u=>window.__opened.push(u)});await page.click('#waBtn');
 assert.match((await page.evaluate(()=>window.__opened))[0],/^https:\/\/wa\.me\/201000000001\?text=/);
 // a company with no number: the old number is not kept
 await page.click('#supplierPickBox summary');await page.click('#supplierPick [data-pick-supplier="مخزن جديد"]');
 assert.equal(await page.inputValue('#supplierPhone'),'','no number left from the other company');
});
