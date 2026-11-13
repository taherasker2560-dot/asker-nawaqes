// «جرد المخزون» (owner 2026-11-13): sections as in PharmaFly, «✓ مظبوط» or the difference per expiry batch, a wrong section,
// a random item by its sticker, the result for the owner (applied later). Made-up items only.
const {run,text,assert}=require('./harness.cjs');
const DATA={data_at:'2026-11-13T03:00:00',store:1,sections:[{i:3,n:'TABLETS + CAPSULES'},{i:33,n:'CREAMS'}],items:[
 {i:63476,n:'ITEM ONE TAB',s:3,p:1,b:[{x:'2029-07',k:2,u:0},{x:'2029-08',k:9,u:0}]},
 {i:7,n:'ITEM STRIP',s:3,p:3,b:[{x:'2028-01',k:2,u:1}]},
 {i:132,n:'ITEM CREAM',s:33,p:1,b:[{x:'2029-08',k:1,u:0}]}]};
run('Count: sections, correct or the difference per batch, a wrong section, random by sticker, the result',async({page,table})=>{
 await page.evaluate(d=>{window.__storage['count/stock.json']=JSON.stringify(d);window.__tables.ar_count_entries=[];localStorage.removeItem('asker-ct-queue');localStorage.removeItem('asker-ct-data')},DATA);
 page.on('dialog',d=>d.accept());
 await page.click('[data-pgroup="stock"]');
 await page.click('.subbar [data-tab="count"]');
 await page.waitForSelector('#ctSecList [data-ct-open]');
 // the sections, biggest first, in the owner's words, nothing counted yet; the search on top is gone here
 assert.deepEqual(await page.$$eval('#ctSecList b',b=>b.map(x=>x.textContent)),['أقراص وكبسول','كريمات']);
 assert.match(await text(page,'#ctSecList [data-ct-open="3"]'),/2 صنف · لسه/);
 assert.equal(await page.$eval('.topsearch',e=>getComputedStyle(e).display),'none');
 // inside a section: the batches as PharmaFly holds them
 await page.click('#ctSecList [data-ct-open="3"]');
 assert.match(await text(page,'#ctItems [data-ct="63476"]'),/صلاحية 07\/2029 · الجهاز: 2[\s\S]*صلاحية 08\/2029 · الجهاز: 9/);
 // the section box is on every card of the section list too (owner 2026-11-13), set to the item's own section
 assert.equal(await page.$eval('#ctItems [data-ct="63476"] [data-ct-move]',e=>e.options[e.selectedIndex].textContent),'أقراص وكبسول');
 // the dates are mixed up: one box less of 07/2029, one more of 08/2029
 await page.click('#ctItems [data-ct="63476"] [data-ct-edit]');
 await page.click('#ctItems [data-ct="63476"] [data-ct-key="2029-07"] [data-ct-dec]');
 await page.click('#ctItems [data-ct="63476"] [data-ct-key="2029-08"] [data-ct-inc]');
 assert.equal(await text(page,'#ctItems [data-ct="63476"] [data-ct-key="2029-07"] b'),'-1');
 await page.click('#ctItems [data-ct="63476"] [data-ct-save]');
 await page.waitForFunction(()=>window.__tables.ar_count_entries.length===1);
 const e1=(await table('ar_count_entries'))[0];
 assert.equal(e1.result,'diff');assert.deepEqual(e1.diffs,[{x:'2029-07',d:-1},{x:'2029-08',d:1}]);assert.equal(e1.item_id,63476);assert.equal(e1.status,'pending');
 assert.deepEqual(e1.system,DATA.items[0].b,'what PharmaFly held is kept with it');
 // a split box (3 units): one unit less, saved as units
 await page.click('#ctFilters [data-ct-filter="todo"]');
 await page.click('#ctItems [data-ct="7"] [data-ct-edit]');
 await page.click('#ctItems [data-ct="7"] [data-ct-kind="u"] [data-ct-dec]');
 await page.click('#ctItems [data-ct="7"] [data-ct-save]');
 await page.waitForFunction(()=>window.__tables.ar_count_entries.length===2);
 assert.deepEqual((await table('ar_count_entries')).find(e=>e.item_id===7).diffs,[{x:'2028-01',d:-1}]);
 // the section is all counted now
 assert.match(await text(page,'#ctItems'),/القسم ده اتجرد كله ✓/);
 assert.match(await text(page,'#ctFilters'),/لسه 0[\s\S]*اتجرد 2[\s\S]*فيه فرق 2/);
 // random: the sticker of the cream (1 + 00132 + 08/29); «✓ مظبوط» there
 await page.click('[data-ct-back]');
 await page.evaluate(()=>window.AskerCount.scanned('1001320829',true,'itf'));
 await page.waitForSelector('#ctHits [data-ct="132"]');
 // the card shows the section PharmaFly has it in, as the list of all sections (owner 2026-11-13); picking another one
 // opens the editor with «اتغير من كذا لكذا»: the cream is moved to «أقراص وكبسول»
 const selName=s=>page.$eval(s,e=>e.options[e.selectedIndex].textContent);
 assert.equal(await selName('#ctHits [data-ct="132"] .ct-where [data-ct-move]'),'كريمات');
 await page.selectOption('#ctHits [data-ct="132"] [data-ct-move]','3');
 assert.equal(await selName('#ctHits [data-ct="132"] [data-ct-sec]'),'أقراص وكبسول');
 assert.match(await text(page,'#ctHits [data-ct="132"]'),/القسم اتغير من كريمات لـ أقراص وكبسول/);
 await page.click('#ctHits [data-ct="132"] [data-ct-save]');
 await page.waitForFunction(()=>window.__tables.ar_count_entries.length===3);
 const e3=(await table('ar_count_entries')).find(e=>e.item_id===132);
 assert.equal(e3.result,'diff');assert.equal(e3.section_from,33);assert.equal(e3.section_to,3);assert.deepEqual(e3.diffs,[]);
 // after saving the card keeps the new section and says what changed
 assert.equal(await selName('#ctHits [data-ct="132"] [data-ct-move]'),'أقراص وكبسول');
 assert.match(await text(page,'#ctHits [data-ct="132"] .ct-res'),/القسم اتغير من كريمات لـ أقراص وكبسول/);
 // typing the sticker number finds the item too
 await page.fill('#ctQ','163476');
 assert.match(await text(page,'#ctHits'),/ITEM ONE TAB[\s\S]*فيه فرق/);
 // the result: what differs, in words, the dates mixed up; the owner marks it applied
 await page.click('[data-ct-view="results"]');
 assert.match(await text(page,'#ctResSum'),/3 صنف فيهم فرق/);
 const one=await text(page,`#ctResRows [data-ct-entry="${e1.id}"]`);
 assert.match(one,/ناقص علبة من صلاحية 07\/2029[\s\S]*زايد علبة في صلاحية 08\/2029[\s\S]*التاريخ متلخبط/);
 assert.match(await text(page,`#ctResRows [data-ct-entry="${e3.id}"]`),/القسم اتغير من كريمات لـ أقراص وكبسول/);
 await page.click(`#ctResRows [data-ct-entry="${e1.id}"] [data-ct-applied]`);
 assert.equal((await table('ar_count_entries')).find(e=>e.id===e1.id).status,'applied');
 assert.match(await text(page,'#ctResSum'),/2 صنف فيهم فرق/);
});
