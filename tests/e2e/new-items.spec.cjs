// «النواقص ← أصناف جديدة» (owner 2026-11-15): the English name + an approximate price, saved and translated with the shortages,
// «موافق» (in the purchase order) / «اتطلب» / «وصل», a quantity, the form worked out from the name (حبوب / كريم …), a hand-typed Arabic name,
// a repeated name, bad input. The new items are NOT written into the shortage list. The approved ones show in «الطلبيات» with a message to copy.
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
 await page.fill('#niPrice','٨٥٫٥');await page.fill('#niQty','abc');await page.click('#niAdd');
 assert.match(await page.textContent('#niStatus'),/الكمية لازم تبقى رقم/);
 await page.fill('#niQty','٣');await page.fill('#niNote','Eva Pharma');await page.click('#niAdd');
 await page.waitForSelector('#niList .ni-row');
 await page.waitForFunction(()=>/ترجمة/.test(document.querySelector('#niList .ni-ar')?.textContent||''));
 const saved=await page.evaluate(()=>window.__tables.ar_new_items.map(x=>({k:x.name_key,en:x.name_en,p:x.price,n:x.note,s:x.status,q:x.qty,f:x.form})));
 assert.deepEqual(saved,[{k:'ZETAPRO 5MG SYRUP',en:'Zetapro 5mg syrup',p:85.5,n:'Eva Pharma',s:'new',q:3,f:'شراب'}],'quantity 3 (Arabic digit) and the form worked out from «SYRUP»');
 const row=(await names(page,'#niList .ni-row'))[0];
 assert.match(row,/Zetapro 5mg syrup/);assert.match(row,/ترجمة Zetapro 5mg syrup/);assert.match(row,/≈ 85\.5 ج/);assert.match(row,/Eva Pharma/);assert.match(row,/ترجمة تلقائية/);assert.match(row,/شراب/);assert.match(row,/× 3/);
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
 // «موافق»: in the purchase order. A new item cannot be «ordered» before it is approved
 assert.ok(!(await page.$('#niList [data-ni-set^="ordered:"]')),'«اتطلب» comes after «موافق»');
 await page.click('#niList [data-ni-set^="approved:"]');
 await page.waitForFunction(()=>/في أمر الشراء/.test(document.getElementById('niList').textContent));
 assert.equal(await page.evaluate(()=>window.__tables.ar_new_items[0].status),'approved');
 assert.ok(await page.evaluate(()=>!!window.__tables.ar_new_items[0].approved_at));
 // the orders page lists it with its quantity, the form and a message to copy; «علّمهم اتطلبوا» marks it
 await page.evaluate(()=>{window.__storage['orders/drafts.json']=JSON.stringify({generated_at:new Date().toISOString(),suppliers:[],no_offer:[]});window.__tables.ar_orders=[];window.__tables.ar_suppliers=[];window.__copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied=t}},configurable:true})});
 // 2026-11-16: the laptop found it in two warehouses' lists (the «new_items» block of drafts.json): grouped under the best discount, its own message
 await page.evaluate(()=>{window.__storage['orders/drafts.json']=JSON.stringify({generated_at:new Date().toISOString(),suppliers:[],no_offer:[],new_items:[{key:'ZETAPRO 5MG SYRUP',name_en:'Zetapro 5mg syrup',qty:3,price:90,form:'شراب',best:'REDA',offers:[
  {supplier:'REDA',label:'رضا عطية',name:'زيتابرو شراب',price:90,discount:27,date:'2026-11-07',fresh:true,strength:'strong'},
  {supplier:'NEWCITY',label:'نيو سيتي',name:'زيتابرو ٥ مجم شراب',price:90,discount:24.5,date:'2026-11-08',fresh:true,strength:'strong'}]}]})});
 await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');await page.evaluate(()=>document.querySelectorAll('details.od-fold').forEach(d=>{d.open=true}));
 await page.waitForSelector('#odNewBox:not(.hidden)');
 await page.waitForFunction(()=>!!document.querySelector('#odNewList [data-new-group="REDA"]'));
 assert.match(await page.textContent('#odNewTitle'),/أصناف جديدة في أمر الشراء \(1\)/);
 assert.equal(await page.$$eval('#odNewList [data-new-group]',g=>g.length),1,'one group: the best warehouse');
 assert.match(await page.textContent('#odNewList [data-new-group="REDA"] h4'),/رضا عطية/);
 assert.match(await page.textContent('#odNewList'),/Zetapro 5mg syrup.*زيتابرو.*شراب.*× 3.*≈ 90 ج.*في قايمتهم: زيتابرو شراب 90 ج خصم 27% وكمان عند: نيو سيتي 24\.5%/);
 assert.equal((await page.textContent('#odNewList [data-new-copy="REDA"]')).trim(),'انسخ رسالة رضا عطية');
 await page.click('#odNewList [data-new-copy="REDA"]');
 await page.waitForFunction(()=>/Zetapro 5mg syrup/.test(window.__copied));
 assert.equal(await page.evaluate(()=>window.__copied),'السلام عليكم\nمحتاج الأصناف دي:\n• زيتابرو شراب (Zetapro 5mg syrup) × 3\nشكرًا','the warehouse\'s own name and the English one in brackets');
 // «علّمهم اتطلبوا» on a warehouse group records WHERE it was ordered from (ar_orders, like every other order) so the invoice can say «لم يصل»
 await page.click('#odNewList [data-new-mark="REDA"]');
 await page.waitForFunction(()=>window.__tables.ar_new_items[0].status==='ordered');
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_orders.map(o=>[o.name_key,o.product_name,o.supplier])),[['ZETAPRO 5MG SYRUP','Zetapro 5mg syrup','رضا عطية']]);
 await page.evaluate(()=>{window.__tables.ar_new_items[0].status='approved';window.__tables.ar_orders=[]});   // back to «موافق» for the plain-card part
 // not in any list (the block is gone): the plain card, a plain message, he picks the supplier
 await page.evaluate(()=>{window.__storage['orders/drafts.json']=JSON.stringify({generated_at:new Date().toISOString(),suppliers:[],no_offer:[]});window.__copied=''});
 await page.click('[data-pgroup="short"]');await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');await page.evaluate(()=>document.querySelectorAll('details.od-fold').forEach(d=>{d.open=true}));
 await page.waitForFunction(()=>!!document.querySelector('#odNewList [data-new-group=""]'));
 assert.match(await page.textContent('#odNewList'),/Zetapro 5mg syrup.*زيتابرو.*شراب.*× 3.*≈ 90 ج.*مش لاقيه في قوايم المخازن/);
 assert.equal(await page.$('#odNewList h4'),null,'no warehouse heading');
 await page.click('#odNewList [data-new-copy=""]');
 await page.waitForFunction(()=>/Zetapro 5mg syrup × 3/.test(window.__copied));
 assert.equal(await page.evaluate(()=>window.__copied),'السلام عليكم\nمحتاج الأصناف دي:\n• Zetapro 5mg syrup × 3\nشكرًا');
 await page.click('#odNewList [data-new-mark=""]');
 await page.waitForFunction(()=>window.__tables.ar_new_items[0].status==='ordered');
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_orders),[],'no warehouse chosen: nothing to record');
 assert.ok(await page.evaluate(()=>document.getElementById('odNewBox').classList.contains('hidden')),'no longer waiting in the order');
 await page.click('[data-pgroup="short"]');await page.click('[data-tab="short"]');
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
