// «البيع المؤقت» (owner 2026-11-12 «ماشي»): a sale by name, by code, by the PharmaFly sticker (100000 + code), a credit
// customer over his limit, kept on the phone with no internet and sent later, then marked «اتدخلت». Made-up items and
// customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const STOCK=[
 {item_id:1060,name:'ITEM ONE 14TAB',arabic_name:'صنف تجربة',price:210,packs:5,units:0,parts:2,exp_near:'2028-03-28',other:[],data_at:'2026-11-12 22:00:00'},
 {item_id:4875,name:'CREAM SMALL',arabic_name:'كريم صغير',price:20,packs:3,units:0,parts:1,exp_near:'2028-07-28',other:[],data_at:'2026-11-12 22:00:00'},
];
const CUSTOMERS=[{id:101,name:'عميل تجربة',credit_limit:300,balance:250},{id:102,name:'عميلة تانية',credit_limit:5000,balance:0}];
run('Temp sale: name, code, sticker, credit customer over the limit, offline then sent, marked entered',async({page,table})=>{
 await page.evaluate(([s,c])=>{window.__tables.ar_stock=s;window.__tables.ar_customers=c;window.__tables.ar_temp_sales=[];localStorage.removeItem('asker-ts-queue')},[STOCK,CUSTOMERS]);
 await page.click('[data-group="sales"]');
 await page.click('.subbar [data-tab="tempsale"]');
 await page.waitForSelector('#tempSalePanel:not(.hidden)');
 // the sale takes the whole page: the search on top is gone here and back elsewhere
 assert.equal(await page.$eval('.topsearch',e=>getComputedStyle(e).display),'none');
 await page.click('.subbar [data-tab="storeorders"]');
 assert.notEqual(await page.$eval('.topsearch',e=>getComputedStyle(e).display),'none');
 await page.click('.subbar [data-tab="tempsale"]');
 assert.match(await text(page,'#tsCart'),/لسه مفيش أصناف/);
 // by name: a tap adds one box, another tap one more
 await page.fill('#tsQ','كريم');
 await page.waitForSelector('#tsHits [data-ts-add="4875"]');
 assert.match(await text(page,'#tsHits [data-ts-add="4875"] small'),/كود 4875 · 20 ج · رصيد 3 علب/);
 await page.click('#tsHits [data-ts-add="4875"]');
 await page.click('#tsHits [data-ts-add="4875"]');
 assert.equal(await text(page,'#tsCart .ts-line[data-i="0"] .ts-qty b'),'2');
 // by code: the sticker's number works too (101060 = code 1060)
 await page.click('[data-ts-way="code"]');
 assert.equal(await page.getAttribute('#tsQ','inputmode'),'numeric');
 await page.fill('#tsQ','101060');
 await page.waitForSelector('#tsHits [data-ts-add="1060"]');
 await page.click('#tsHits [data-ts-add="1060"]');
 assert.equal(await page.inputValue('#tsQ'),'','the code box empties for the next one');
 // the camera's reading (the sticker barcode) counts only when the same number comes twice in a row
 await page.evaluate(()=>window.AskerTempSale.scanned('169423'));
 await page.evaluate(()=>window.AskerTempSale.scanned('101060'));
 assert.equal(await text(page,'#tsCart .ts-line[data-i="1"] .ts-qty b'),'1','one reading alone adds nothing');
 await page.evaluate(()=>window.AskerTempSale.scanned('101060'));
 assert.equal(await text(page,'#tsCart .ts-line[data-i="1"] .ts-qty b'),'2');
 assert.match(await text(page,'#tsFind'),/اتضاف: صنف تجربة \(الباركود 101060\)/,'the number read is shown');
 // a short or long reading is never taken as a code; the number read is shown
 await page.evaluate(()=>window.AskerTempSale.scanned('9493',true,'itf'));
 assert.match(await text(page,'#tsFind'),/الكاميرا قرت 9493 \(itf\): ده مش رقم ملصق فارمافلاي/,'the number and its barcode kind are shown');
 // a phone that cannot read barcodes in the page (this test browser): told to type the number instead
 await page.click('[data-ts-way="scan"]');
 assert.match(await text(page,'#tsFind'),/مش بيقرا الباركود من البوت/);
 await page.click('[data-ts-way="code"]');
 await page.evaluate(()=>window.AskerTempSale.scanned('6221234567890',true));
 assert.match(await text(page,'#tsFind'),/مش رقم ملصق فارمافلاي/);
 assert.equal((await page.$$('#tsCart .ts-line')).length,2);
 // a box that splits: one unit = half the price
 await page.click('#tsCart .ts-line[data-i="1"] [data-ts-u="unit"]');
 assert.equal(await text(page,'#tsCart .ts-line[data-i="1"] .ts-amt'),'210 ج');
 assert.equal(await text(page,'#tsCart .ts-total b'),'250 ج');
 // a credit customer: over his limit after this sale -> the red warning; paying enough takes it away
 await page.click('[data-ts-credit]');
 await page.fill('#tsCQ','عميل تجربة');
 await page.click('#tsCHits [data-ts-cust="101"]');
 assert.match(await text(page,'#tsCust .ts-warn'),/هيبقى عليه 500 ج والحد 300 ج/);
 await page.fill('#tsPaid','200');
 assert.equal(await page.$('#tsCust .ts-warn'),null);
 await page.fill('#tsNote','بعد الضهر');
 // no internet: kept on the phone, shown as «لسه ما اتبعتتش»
 await page.evaluate(()=>{window.__realClient=window.AskerApp.client;window.AskerApp.client={from:()=>({upsert:async()=>({error:{message:'offline'}}),select(){return this},gte(){return this},order(){return this},range:async()=>({data:null,error:{message:'offline'}})})}});
 await page.click('#tsSave');
 await page.waitForFunction(()=>/النت يرجع/.test(document.getElementById('tsStatus').textContent));
 assert.match(await text(page,'#tsCart'),/لسه مفيش أصناف/,'a new bill after saving');
 assert.equal((await table('ar_temp_sales')).length,0);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker-ts-queue')).length),1);
 assert.equal(await text(page,'#tsPendN'),'1');
 await page.click('[data-ts-view="list"]');
 assert.match(await text(page,'#tsRows'),/لسه ما اتبعتتش/);
 // the internet is back: sent once
 await page.evaluate(()=>{window.AskerApp.client=window.__realClient});
 await page.evaluate(()=>window.AskerTempSale.flush());
 const rows=await table('ar_temp_sales');
 assert.equal(rows.length,1);
 assert.deepEqual(rows[0].items,[{c:4875,n:'CREAM SMALL',q:2,u:'pack',p:20},{c:1060,n:'ITEM ONE 14TAB',q:2,u:'unit',p:105}]);
 assert.equal(rows[0].total,250);assert.equal(rows[0].paid,200);assert.equal(rows[0].customer_id,101);assert.equal(rows[0].note,'بعد الضهر');assert.equal(rows[0].status,'pending');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker-ts-queue')).length),0);
 // the list: waiting -> open -> «اتدخلت في فارمافلاي»
 await page.waitForFunction(()=>/مستنية/.test(document.getElementById('tsRows').textContent));
 assert.match(await text(page,'#tsRows .ts-sale'),/عميل تجربة \(آجل\)/);
 await page.click('#tsRows [data-ts-open]');
 assert.match(await text(page,'#tsRows .ts-items'),/2 علبة[\s\S]*2 وحدة/);
 await page.click('#tsRows [data-ts-done]');
 assert.equal((await table('ar_temp_sales'))[0].status,'entered');
 assert.match(await text(page,'#tsChips'),/مستنية 0[\s\S]*اتدخلت 1/);
 // a cash sale: no customer, no paid part
 await page.click('[data-ts-view="new"]');
 await page.click('[data-ts-way="name"]');
 await page.fill('#tsQ','صنف');
 await page.waitForSelector('#tsHits [data-ts-add="1060"]');
 await page.click('#tsHits [data-ts-add="1060"]');
 assert.ok(await page.$eval('#tsPaidRow',e=>e.classList.contains('hidden')),'cash: no «دفع كام»');
 await page.click('#tsSave');
 await page.waitForFunction(()=>/اتحفظت ✓/.test(document.getElementById('tsStatus').textContent));
 const cash=(await table('ar_temp_sales')).find(r=>r.status==='pending');
 assert.equal(cash.customer_id,null);assert.equal(cash.paid,null);assert.equal(cash.total,210);assert.equal(cash.kind,'sale');
 // a return (مرتجع): its own bill, red; «رجّعتله كام فلوس؟» even for cash; marked in the list
 await page.click('[data-ts-type="return"]');
 assert.equal(await text(page,'#tsSave'),'احفظ المرتجع');
 assert.ok(!(await page.$eval('#tsPaidRow',e=>e.classList.contains('hidden'))));
 assert.equal(await text(page,'#tsPaidLbl'),'رجّعتله كام فلوس؟');
 await page.fill('#tsQ','كريم');
 await page.waitForSelector('#tsHits [data-ts-add="4875"]');
 await page.click('#tsHits [data-ts-add="4875"]');
 await page.fill('#tsPaid','20');
 await page.click('#tsSave');
 await page.waitForFunction(()=>/اتحفظت ✓/.test(document.getElementById('tsStatus').textContent));
 const back=(await table('ar_temp_sales')).find(r=>r.kind==='return');
 assert.equal(back.total,20);assert.equal(back.paid,20);assert.deepEqual(back.items,[{c:4875,n:'CREAM SMALL',q:1,u:'pack',p:20}]);
 assert.equal(await text(page,'#tsSave'),'احفظ البيعة','the next bill is a sale again');
 await page.click('[data-ts-view="list"]');
 await page.waitForFunction(()=>/مرتجع/.test(document.getElementById('tsRows').textContent));
 assert.match(await text(page,'#tsRows'),/مرتجع[\s\S]*رجعله 20 ج/);
});
