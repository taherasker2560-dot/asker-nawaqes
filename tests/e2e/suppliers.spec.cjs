// «المخازن»: upload a matched warehouse list, accept every «قوي» line at once, check the rest one by one,
// and a later list from the same warehouse knows the accepted names by itself.
const {run,waitStatus,assert}=require('./harness.cjs');
const HEAD='page,supplier_name,supplier_price,discount_pct,status,similarity,item_id,pharmafly_name,pharmafly_price,bought_from_this_supplier,other_same_price_candidates';
const LIST1=[HEAD,
 '1,"انتریستو ٥٠ مجم ٢٨ قرص",1700,15,strong,0.83,64040,ENTRESTO 50MG 28TABLET,1700,1,',
 '1,"اوجمنتین ١ جم اقراص",210,20,strong,0.83,1060,AUGMENTIN 1G 14TAB,210,1,',
 '2,"دولوكسبرین ٣٠ مجم اقراص",180,28,good,0.63,63508,DULOXEPRIN 30MG,180,1,',
 '3,"ابیروفاستین ٤٠ مجم اقراص",68,24,none,,,,,,'].join('\r\n');
const LIST2=[HEAD,
 '1,"انتريستو 50 مجم 28 قرص",1750,14,none,,,,,,',
 '2,"دولوكسبرین ٣٠ مجم اقراص",185,27,none,,,,,,'].join('\r\n');
const file=(name,body)=>({name,mimeType:'text/csv',buffer:Buffer.from('﻿'+body,'utf8')});
run('suppliers tab: upload, accept strong at once, review the rest, next list knows the names',async({page,table})=>{
 await page.click('[data-group="purchases"]');await page.click('[data-tab="suppliers"]');
 await page.waitForSelector('#suppliersPanel:not(.hidden)');
 assert.ok(await page.isVisible('#spEmpty'));
 await page.click('#spTools summary');
 await page.setInputFiles('#spFile',file('AMG_2026-04-05_v2_price_first_draft.csv',LIST1));
 assert.equal(await page.inputValue('#spSupplier'),'AMG');
 assert.equal(await page.inputValue('#spDate'),'2026-04-05');
 await page.click('#spUpload');await waitStatus(page,/اترفعت قايمة AMG \(4 سطر\)/,'spStatus');
 assert.equal((await table('ar_supplier_lists')).length,1);
 assert.equal((await table('ar_supplier_items')).length,4);
 assert.match(await page.textContent('#spBulk'),/اقبل الـ 2 «قوي»/);
 await page.click('#spBulk');await waitStatus(page,/اتقبل 2 سطر «قوي»/,'spStatus');
 const aliases=await table('ar_supplier_aliases');
 assert.deepEqual(aliases.map(a=>a.item_id).sort((a,b)=>a-b),[1060,64040]);
 assert.ok(aliases.every(a=>a.supplier==='AMG'&&a.first_seen==='2026-04-05'));
 assert.ok(await page.isHidden('#spBulk'));
 // the «كويس» line waits for review; «صح» accepts it and learns the name
 await page.waitForSelector('#spRows [data-sp-row] [data-sp-act="accepted"]');
 await page.click('#spRows [data-sp-row] [data-sp-act="accepted"]');await waitStatus(page,/اتقبل واتحفظ الاسم/,'spStatus');
 assert.equal((await table('ar_supplier_aliases')).length,3);
 const items=await table('ar_supplier_items');
 assert.equal(items.filter(r=>r.review==='accepted').length,3);
 assert.equal(items.find(r=>r.match_status==='none').review,'pending');
 // next month: the same names (spelled with other letter forms and digits) are known at once
 await page.setInputFiles('#spFile',file('AMG_2026-05-10.csv',LIST2));
 await page.fill('#spSupplier','');await page.fill('#spDate','');
 await page.setInputFiles('#spFile',file('AMG_2026-05-10.csv',LIST2));
 await page.click('#spUpload');await waitStatus(page,/2 اسم اتعرف لوحده/,'spStatus');
 const second=(await table('ar_supplier_items')).filter(r=>r.list_date==='2026-05-10');
 assert.deepEqual(second.map(r=>[r.review,r.item_id]).sort(),[['accepted',63508],['accepted',64040]].sort());
 const after=await table('ar_supplier_aliases');
 assert.equal(after.find(a=>a.item_id===64040).first_seen,'2026-04-05');
 assert.equal(after.find(a=>a.item_id===64040).last_seen,'2026-05-10');
 // the same list cannot be uploaded twice
 await page.setInputFiles('#spFile',file('AMG_2026-05-10.csv',LIST2));
 await page.click('#spUpload');await waitStatus(page,/اترفعت قبل كده/,'spStatus');
});
