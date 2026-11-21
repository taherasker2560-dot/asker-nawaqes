// «طلبات الموقع» + the item's small photo (owner 2026-11-21, group 4 of «الصورة في كل قايمة»): each site item of an order has its photo
// (by the item number the order carries); a line the customer typed has none (no item number: never a guess by name); a tap on the
// photo opens «تعديل الصنف» and changes nothing in the order or in the WhatsApp message. Made-up orders only.
const {run,text,assert}=require('./harness.cjs');
const ORDER={id:7,status:'new',customer_name:'زبون تجربة',phone:'01000000000',address:'عنوان',notes:'',total:120,rx_paths:[],created_at:'2026-11-12T10:00:00Z',
 items:[{id:101,name:'PANADOL EXTRA 24 TAB',qty:2,price:60,line_total:120},{name:'ZINC SPECIAL',qty:1,price:null,line_total:null,on_order:true,free_text:true}]};
run('Store orders: the photo of each site item, none for a typed line, a tap opens the sheet and changes nothing',async({page,table})=>{
 await page.evaluate(o=>{window.__tables.ar_store_orders=[o]},ORDER);
 await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="storeorders"]');
 await page.waitForSelector('#soOpen [data-order="7"] .so-lines li');
 assert.deepEqual(await page.$$eval('#soOpen [data-order="7"] .so-lines .im-th',b=>b.map(x=>x.dataset.im)),['101'],'one photo: the site item');
 assert.equal(await page.$$eval('#soOpen [data-order="7"] .so-lines li.so-nophoto',x=>x.length),1,'the typed line has no photo');
 assert.match(await text(page,'#soOpen [data-order="7"] .so-lines li.so-nophoto'),/ZINC SPECIAL.*كتبه الزبون.*بالطلب/);
 assert.match(await text(page,'#soOpen [data-order="7"] .so-lines li:first-child'),/PANADOL EXTRA 24 TAB × 2.*120/);
 const wa=await page.$eval('#soOpen [data-order="7"] .so-wa',a=>a.href);
 await page.click('#soOpen [data-order="7"] .so-lines .im-th[data-im="101"]');await page.waitForSelector('#imSheet:not([hidden])');await page.click('#imSheet .im-x');
 assert.equal((await table('ar_store_orders'))[0].status,'new','the photo did not touch the order');
 assert.equal(await page.$eval('#soOpen [data-order="7"] .so-wa',a=>a.href),wa,'the WhatsApp message is the same');
 assert.deepEqual((await page.evaluate(()=>window.__fakeWrites)).filter(w=>!/^(ar_is_staff|ar_people_list)$/.test(w.rpc||'')).map(w=>w.rpc||JSON.stringify(w).slice(0,80)),[],'nothing was written');
});
