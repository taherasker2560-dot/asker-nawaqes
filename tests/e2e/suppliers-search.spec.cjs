// «المخازن» search: finds lines in every list (also items we do not stock), and «غلط، رجّعه» undoes an accepted line:
// the line becomes «غلط» and the warehouse forgets that name, so the next list does not accept it again by itself.
const {run,waitStatus,assert}=require('./harness.cjs');
const HEAD='page,supplier_name,supplier_price,discount_pct,status,similarity,item_id,pharmafly_name,pharmafly_price,bought_from_this_supplier,other_same_price_candidates';
const LIST=[HEAD,
 '1,"كانتي كولين شراب",200,22,strong,1,70001,CONTRA MEDICATED CONDITIONER 200ML,200,0,',
 '1,"كونكور ١٠ مجم اقراص",99,26,strong,0.9,1001,CONCOR 10 30TAB,99,1,',
 '2,"صنف مش عندنا",50,30,none,,,,,,'].join('\r\n');
const file=(name,body)=>({name,mimeType:'text/csv',buffer:Buffer.from('﻿'+body,'utf8')});
run('suppliers search: every line, undo an accepted one',async({page,table})=>{
 await page.click('[data-group="purchases"]');await page.click('[data-tab="suppliers"]');
 await page.click('#spTools summary');
 await page.setInputFiles('#spFile',file('AMG_2026-04-05_draft.csv',LIST));
 await page.click('#spUpload');await waitStatus(page,/اترفعت قايمة AMG/,'spStatus');
 await page.click('#spBulk');await waitStatus(page,/اتقبل 2 سطر «قوي»/,'spStatus');
 assert.equal((await table('ar_supplier_aliases')).length,2);
 // a line we do not stock is found too
 await page.fill('#spSearch','مش عندنا');
 await page.waitForFunction(()=>/صنف مش عندنا/.test(document.getElementById('spFound').textContent));
 assert.match(await page.textContent('#spFound'),/مش متطابق مع صنف عندنا/);
 // smart search (owner 2026-11-08): letters skipped, closest first; every line is read once, then kept
 await page.fill('#spSearch','كنكر 10');
 await page.waitForFunction(()=>/كونكور ١٠ مجم اقراص/.test(document.getElementById('spFound').textContent));
 assert.match(await page.textContent('#spSearchNote'),/الأقرب للي كتبته الأول/);
 assert.equal(await page.$$eval('#spFound .item',e=>e.length),1,'only the line that matches');
 const reads=()=>page.evaluate(()=>window.__reads.filter(r=>r.table==='ar_supplier_items').length);
 const before=await reads();
 await page.fill('#spSearch','zzzz');
 await page.waitForFunction(()=>/مفيش حاجة قريبة/.test(document.getElementById('spSearchNote').textContent));
 assert.equal(await reads(),before,'the second search uses the lines already read');
 // undo the wrong accepted cosmetic
 await page.fill('#spSearch','كانتي');
 await page.waitForSelector('#spFound [data-sp-found="undo"]');
 await page.click('#spFound [data-sp-found="undo"]');
 await page.waitForFunction(()=>/اترجع/.test(document.getElementById('spSearchNote').textContent));
 const row=(await table('ar_supplier_items')).find(r=>r.supplier_name==='كانتي كولين شراب');
 assert.equal(row.review,'rejected');
 const aliases=await table('ar_supplier_aliases');
 assert.equal(aliases.length,1);
 assert.equal(aliases[0].item_id,1001);
 assert.equal(await page.$('#spFound [data-sp-found="undo"]'),null); // the line now offers nothing to undo
 // searching again: the kept copy knows the line was undone
 await page.fill('#spSearch','');await page.fill('#spSearch','كانتي');
 await page.waitForFunction(()=>/كانتي كولين شراب/.test(document.getElementById('spFound').textContent));
 assert.equal(await page.$('#spFound [data-sp-found="undo"]'),null,'still nothing to undo after a new search');
 assert.match(await page.textContent('#spFound'),/مش متطابق مع صنف عندنا/,'an undone line no longer shows the wrong item');
});
