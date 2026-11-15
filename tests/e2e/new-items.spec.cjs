// «النواقص ← أصناف جديدة» (owner 2026-11-15): the English name + an approximate price, saved and translated with the shortages,
// «اتطلب» / «وصل», a hand-typed Arabic name, a repeated name, bad input. The new items are NOT written into the shortage list.
const {run,assert}=require('./harness.cjs');
const names=(page,sel)=>page.$$eval(sel,b=>b.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
run('New items: save with an approximate price, translated, ordered, arrived, a typed Arabic name',async({page})=>{
 await page.evaluate(()=>window.AskerNewItems.open());
 await page.waitForSelector('#niBox:not(.hidden)');
 assert.ok(await page.isVisible('#niBox > summary'));
 assert.match(await page.textContent('#niList'),/مفيش أصناف جديدة مستنية/);
 await page.click('#niBox > summary');
 // bad input first
 await page.click('#niAdd');assert.match(await page.textContent('#niStatus'),/اكتب اسم الصنف بالإنجليزي/);
 await page.fill('#niName','Zetapro 5mg syrup');await page.fill('#niPrice','abc');await page.click('#niAdd');
 assert.match(await page.textContent('#niStatus'),/السعر لازم يبقى رقم/);
 assert.equal((await page.evaluate(()=>window.__tables.ar_new_items||[])).length,0,'nothing saved on a bad price');
 // the real one: Arabic digits in the price, a note
 await page.fill('#niPrice','٨٥٫٥');await page.fill('#niNote','Eva Pharma');await page.click('#niAdd');
 await page.waitForSelector('#niList .ni-row');
 await page.waitForFunction(()=>/ترجمة/.test(document.querySelector('#niList .ni-ar')?.textContent||''));
 const saved=await page.evaluate(()=>window.__tables.ar_new_items.map(x=>({k:x.name_key,en:x.name_en,p:x.price,n:x.note,s:x.status})));
 assert.deepEqual(saved,[{k:'ZETAPRO 5MG SYRUP',en:'Zetapro 5mg syrup',p:85.5,n:'Eva Pharma',s:'new'}]);
 const row=(await names(page,'#niList .ni-row'))[0];
 assert.match(row,/Zetapro 5mg syrup/);assert.match(row,/ترجمة Zetapro 5mg syrup/);assert.match(row,/≈ 85\.5 ج/);assert.match(row,/Eva Pharma/);assert.match(row,/ترجمة تلقائية/);
 assert.match(await page.textContent('#niCount'),/1/);
 assert.equal(await page.inputValue('#niName'),'','the form is empty again');
 // it is in the shortages' own table of names (so «الترجمة» shows it too) and NOT in the shortage list
 assert.ok((await page.evaluate(()=>window.__tables.ar_names.some(n=>n.name_key==='ZETAPRO 5MG SYRUP'))));
 assert.ok(!(await page.evaluate(()=>window.__tables.ar_shortages.some(n=>/ZETAPRO/i.test(n.product_name)))),'not put in the shortage list');
 // the same name again: updated, not doubled; a price kept when none is typed
 await page.fill('#niName','ZETAPRO  5MG SYRUP');await page.fill('#niPrice','90');await page.click('#niAdd');
 await page.waitForFunction(()=>/كان مسجل/.test(document.getElementById('niStatus').textContent));
 assert.equal((await page.evaluate(()=>window.__tables.ar_new_items)).length,1);
 assert.equal(await page.evaluate(()=>window.__tables.ar_new_items[0].price),90);
 // a typed Arabic name is approved and the «automatic» tag goes
 await page.click('#niList [data-ni-edit]');
 await page.fill('#niList [data-ni-ar]','زيتابرو ٥ مجم شراب');await page.click('#niList [data-ni-save]');
 await page.waitForFunction(()=>(document.querySelector('#niList .ni-ar')?.textContent||'').includes('مجم'));
 assert.ok(!/ترجمة تلقائية/.test(await page.textContent('#niList')));
 assert.equal(await page.evaluate(()=>window.__tables.ar_names.find(n=>n.name_key==='ZETAPRO 5MG SYRUP').status),'approved');
 // ordered, then arrived: it moves under «اللي وصل واللي اتلغى»
 await page.click('#niList [data-ni-set^="ordered:"]');
 await page.waitForFunction(()=>/اتطلب/.test(document.getElementById('niList').textContent));
 assert.ok(!(await page.$('#niList [data-ni-set^="ordered:"]')),'no «اتطلب» button once ordered');
 await page.click('#niList [data-ni-set^="arrived:"]');
 await page.waitForFunction(()=>!document.querySelector('#niList .ni-row'));
 assert.match(await page.textContent('#niOld summary'),/1/);
 assert.ok(await page.evaluate(()=>!!window.__tables.ar_new_items[0].arrived_at));
 // brought back
 await page.click('#niOld summary');await page.click('#niOldList [data-ni-set^="new:"]');
 await page.waitForSelector('#niList .ni-row');
 // fits the phone
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
});
