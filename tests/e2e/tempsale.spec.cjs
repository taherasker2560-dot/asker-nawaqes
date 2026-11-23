// «البيع المؤقت» (owner 2026-11-12 «ماشي»): a sale by name, by code, by the PharmaFly sticker (100000 + code), a credit
// customer over his limit, kept on the phone with no internet and sent later, then marked «اتدخلت». Made-up items and
// customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
// a line's two boxes: boxes (q) and units (w) are inputs now (owner 2026-11-21)
const qv=(page,i,w='q')=>page.inputValue(`#tsCart .ts-line[data-i="${i}"] [data-ts-n="${w}"]`);
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
 // the top is one thin bar (owner 2026-11-13 «في 2 سنتي»): بيع/مرتجع, 📷 🔎 #, «البيعات», then the search; no data-age
 // line here, so the bill starts high on the screen (360: the header's wave, the owner's 2026-11-21 look, makes the header 16 px taller than the flat one the old 340 was written for,
 // and the row of the 3 bills' tabs, which took the place of the «الفاتورة» heading, is 6 px taller than that heading was)
 const top=await page.evaluate(()=>({bar:document.querySelector('.ts-bar').getBoundingClientRect().height,
  cart:document.getElementById('tsCart').getBoundingClientRect().top,age:getComputedStyle(document.getElementById('dataAge')).display}));
 assert.ok(top.bar<=52,'one row: '+top.bar);assert.ok(top.cart<360,'the bill starts at '+top.cart);assert.equal(top.age,'none');
 await page.click('.subbar [data-tab="storeorders"]');
 assert.equal(await page.evaluate(()=>document.body.classList.contains('ts-page')),false,'the data-age line is back elsewhere');
 await page.click('.subbar [data-tab="tempsale"]');
 // by name: a pick adds one box and closes the list at once (owner 2026-11-15: the list stayed open under the search);
 // the box empties for the next item; the same item picked again (Enter = the first one) adds one more
 const closed=async(why)=>{
  assert.equal((await page.$$('#tsHits [data-ts-add]')).length,0,'the list closes after a pick: '+why);
  assert.equal(await page.inputValue('#tsQ'),'','the search box empties: '+why);
  assert.ok(await page.$eval('#tsClear',e=>e.classList.contains('hidden')),'no ✕ on the empty box: '+why)};
 await page.fill('#tsQ','كريم');
 await page.waitForSelector('#tsHits [data-ts-add="4875"]');
 assert.match(await text(page,'#tsHits [data-ts-add="4875"] small'),/كود 4875 · 20 ج · رصيد 3 علب/);
 // group 4: the photo sits BESIDE the button; a tap on it opens «تعديل الصنف» and adds nothing, the list stays
 assert.equal(await page.$$eval('#tsHits .im-lrow > button.im-th[data-im="4875"]',x=>x.length),1);
 await page.click('#tsHits .im-th[data-im="4875"]');await page.waitForSelector('#imSheet:not([hidden])');await page.click('#imSheet .im-x');
 assert.match(await text(page,'#tsCart'),/لسه مفيش أصناف/,'the photo adds nothing to the bill');
 assert.equal((await page.$$('#tsHits [data-ts-add="4875"]')).length,1,'the list stays');
 await page.click('#tsHits [data-ts-add="4875"]');
 await closed('sale, tap');
 await page.waitForSelector('#tsCart .ts-line[data-i="0"]');
 assert.equal(await qv(page,0),'1');
 await page.fill('#tsQ','كريم');
 await page.waitForSelector('#tsHits [data-ts-add="4875"]');
 await page.press('#tsQ','Enter');
 await closed('sale, Enter');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'tsQ','Enter keeps the cursor in the search box');
 await page.waitForFunction(()=>document.querySelector('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]')?.value==='2');
 // the line shows the stock and the nearest expiry, as in PharmaFly; more than the stock = red
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-info'),/رصيد 3 علب/);
 assert.equal(await page.$('#tsCart .ts-line[data-i="0"] .ts-warn'),null);
 // group 4: the bill's line carries the item's photo; a tap on it opens the sheet over the bill and touches nothing in it
 assert.equal(await page.$eval('#tsCart .ts-line[data-i="0"] > .im-lrow > .im-th',b=>b.dataset.im),'4875');
 await page.click('#tsCart .ts-line[data-i="0"] .im-th');await page.waitForSelector('#imSheet:not([hidden])');await page.click('#imSheet .im-x');
 assert.equal(await qv(page,0),'2','the quantity did not move');
 assert.equal((await page.$$('#tsCart .ts-line')).length,1,'the line is still there');
 await page.click('#tsCart .ts-line[data-i="0"] [data-ts-plus="q"]');await page.click('#tsCart .ts-line[data-i="0"] [data-ts-plus="q"]');
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-warn'),/الكمية أكتر من الرصيد/);
 await page.click('#tsCart .ts-line[data-i="0"] [data-ts-minus="q"]');await page.click('#tsCart .ts-line[data-i="0"] [data-ts-minus="q"]');
 // by code: the sticker's number works too (101060 = code 1060)
 await page.click('[data-ts-way="code"]');
 assert.equal(await page.getAttribute('#tsQ','inputmode'),'numeric');
 await page.fill('#tsQ','101060');
 await page.waitForSelector('#tsHits [data-ts-add="1060"]');
 await page.click('#tsHits [data-ts-add="1060"]');
 await closed('sale, by code');
 // the camera's reading (the sticker barcode) counts only when the same number comes twice in a row
 await page.evaluate(()=>window.AskerTempSale.scanned('169423'));
 await page.evaluate(()=>window.AskerTempSale.scanned('101060'));
 assert.equal(await qv(page,1),'1','one reading alone adds nothing');
 await page.evaluate(()=>window.AskerTempSale.scanned('101060'));
 assert.equal(await qv(page,1),'2');
 assert.match(await text(page,'#tsFind'),/اتضاف: صنف تجربة \(الباركود 101060\)/,'the number read is shown');
 // the sticker's barcode itself (ITF, 10 digits): 1 + code + the batch's month and year; it is the batch in his hand, so the line
 // takes that expiry with no question, and it is a line of its own (another batch of the same item), not a box added to line 0
 await page.evaluate(()=>window.AskerTempSale.scanned('1048750729',true,'itf'));
 assert.match(await text(page,'#tsCart .ts-line[data-i="2"] .ts-exp'),/صلاحية 07\/2029/);
 assert.equal(await qv(page,0),'2','the line with no expiry did not move');
 await page.click('#tsCart .ts-line[data-i="2"] [data-ts-del]');
 // from the camera (owner: «بعض مرة بيقرا كده»): an ITF value counts after 3 reads in a row; a misread is ignored quietly;
 // the same sticker kept in front of the camera adds one box only
 const before=await text(page,'#tsFind');
 for(let i=0;i<3;i++)await page.evaluate(()=>window.AskerTempSale.scanned('1634036085',false,'itf'));
 assert.equal(await text(page,'#tsFind'),before,'a misread says nothing');
 // (the sticker's batch, 03/2028, is a line of its own: index 2)
 await page.evaluate(()=>{window.AskerTempSale.scanned('1010600328',false,'itf');window.AskerTempSale.scanned('1010600328',false,'itf')});
 assert.equal(await page.$('#tsCart .ts-line[data-i="2"]'),null,'two ITF reads are not enough');
 await page.evaluate(()=>window.AskerTempSale.scanned('1010600328',false,'itf'));
 assert.equal(await qv(page,2),'1','the third adds the batch\'s line, one box');
 assert.match(await text(page,'#tsCart .ts-line[data-i="2"] .ts-exp'),/صلاحية 03\/2028/);
 for(let i=0;i<6;i++)await page.evaluate(()=>window.AskerTempSale.scanned('1010600328',false,'itf'));
 assert.equal(await qv(page,2),'1','still in view: no more boxes');
 await page.click('#tsCart .ts-line[data-i="2"] [data-ts-del]');
 // a short or long reading is never taken as a code; the number read is shown
 await page.evaluate(()=>window.AskerTempSale.scanned('9493',true,'itf'));
 assert.match(await text(page,'#tsFind'),/الكاميرا قرت 9493 \(itf\): ده مش رقم ملصق فارمافلاي/,'the number and its barcode kind are shown');
 // a phone that cannot read barcodes in the page (this test browser): told to type the number instead
 await page.click('[data-ts-way="scan"]');
 assert.match(await text(page,'#tsFind'),/مش بيقرا الباركود من السيستم/);
 await page.click('[data-ts-way="code"]');
 await page.evaluate(()=>window.AskerTempSale.scanned('6221234567890',true));
 assert.match(await text(page,'#tsFind'),/مش رقم ملصق فارمافلاي/);
 assert.equal((await page.$$('#tsCart .ts-line')).length,2);
 // the newest line is drawn on top, the oldest at the bottom (owner 2026-11-22); the bill itself keeps its order (data-i)
 assert.deepEqual(await page.$$eval('#tsCart .ts-line',x=>x.map(e=>e.dataset.i)),['1','0'],'newest on top');
 // a box that splits: two boxes, «علب» and «وحدات», typed (a unit = half the price here); a box that does not split has no units box
 assert.ok(await page.$('#tsCart .ts-line[data-i="0"] .ts-qbox.off'),'cream does not split: its units box is shut');
 const typed=async(i,w,v)=>{const s=`#tsCart .ts-line[data-i="${i}"] [data-ts-n="${w}"]`;await page.fill(s,String(v));await page.press(s,'Tab')};
 await typed(1,'w',2);
 assert.equal(await text(page,'#tsCart .ts-line[data-i="1"] .ts-amt'),'630 ج','2 boxes at 210 + 2 units at 105');
 assert.match(await text(page,'#tsCart .ts-line[data-i="1"] .ts-calc'),/2 × 210 ج \+ 2 × 105 ج/);
 await typed(1,'q',0);
 assert.equal(await qv(page,1,'w'),'2');
 await page.click('#tsCart .ts-line[data-i="1"] [data-ts-minus="w"]');await page.click('#tsCart .ts-line[data-i="1"] [data-ts-plus="w"]');
 assert.equal(await qv(page,1,'w'),'2','minus then plus: back to 2');
 await typed(1,'w',0);
 assert.equal(await qv(page,1,'w'),'2','never both boxes at 0');
 assert.equal(await text(page,'#tsCart .ts-line[data-i="1"] .ts-amt'),'210 ج');
 assert.equal(await text(page,'#tsCart .ts-total b'),'250 ج');
 // a credit customer: over his limit after this sale -> the red warning; paying enough takes it away
 await page.click('[data-ts-credit]');
 await page.fill('#tsCQ','عميل تجربة');
 await page.click('#tsCHits [data-ts-cust="101"]');
 assert.match(await text(page,'#tsCust .ts-warn'),/هيبقى عليه 500 ج والحد 300 ج/);
 // his account with this bill, like a PharmaFly invoice (owner 2026-11-13)
 assert.match(await text(page,'#tsCust .ts-acct'),/حسابه السابق ?250 ج قيمة الفاتورة ?\+ 250 ج حسابه بعد الفاتورة ?500 ج/);
 await page.fill('#tsPaid','200');
 assert.equal(await page.$('#tsCust .ts-warn'),null);
 assert.match(await text(page,'#tsCust .ts-acct'),/قيمة الفاتورة ?\+ 250 ج دفع ?− 200 ج حسابه بعد الفاتورة ?300 ج/);
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
 // group 4: each item of a waiting sale has its photo (by the code); a tap opens the sheet and the sale stays open and waiting
 assert.deepEqual(await page.$$eval('#tsRows .ts-items .ts-li > .im-th',b=>b.map(x=>x.dataset.im)),['4875','1060']);
 await page.click('#tsRows .ts-items .im-th[data-im="1060"]');await page.waitForSelector('#imSheet:not([hidden])');await page.click('#imSheet .im-x');
 assert.equal((await page.$$('#tsRows .ts-sale.open [data-ts-done]')).length,1,'the sale is still open and waiting');
 assert.equal((await table('ar_temp_sales'))[0].status,'pending','the photo did not mark it');
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
 // «الفكة» (owner 2026-11-13): 210 needs no rounding, so only «مبلغ تاني»: 10 off -> «المطلوب» 200
 assert.equal(await page.$('[data-ts-adj]'),null);
 await page.click('[data-ts-adjx]');
 await page.fill('#tsAdj','10');
 assert.match(await text(page,'.ts-due'),/المطلوب \(خصم 10 ج\) ?200 ج/);
 await page.click('#tsSave');
 await page.waitForFunction(()=>/اتحفظت ✓/.test(document.getElementById('tsStatus').textContent));
 const cash=(await table('ar_temp_sales')).find(r=>r.status==='pending');
 assert.equal(cash.customer_id,null);assert.equal(cash.paid,null);assert.equal(cash.total,200);assert.equal(cash.adjust,-10);assert.equal(cash.kind,'sale');
 assert.equal(await page.$('.ts-due'),null,'a new bill has no change');
 // a return (مرتجع): its own bill, red; NO «رجّعتله كام فلوس؟» box (his rule 11-22: no return is paid back in part; review money-12); marked in the list
 await page.click('[data-ts-type="return"]');
 assert.equal(await text(page,'#tsSave'),'احفظ المرتجع');
 assert.ok(await page.$eval('#tsPaidRow',e=>e.classList.contains('hidden')),'a return has no money-given-back box');
 await page.fill('#tsQ','كريم');
 await page.waitForSelector('#tsHits [data-ts-add="4875"]');
 await page.click('#tsHits [data-ts-add="4875"]');
 await closed('return, tap');
 await page.click('#tsSave');
 await page.waitForFunction(()=>/اتحفظت ✓/.test(document.getElementById('tsStatus').textContent));
 const back=(await table('ar_temp_sales')).find(r=>r.kind==='return');
 assert.equal(back.total,20);assert.equal(back.paid,null);assert.deepEqual(back.items,[{c:4875,n:'CREAM SMALL',q:1,u:'pack',p:20}]);
 assert.equal(await text(page,'#tsSave'),'احفظ البيعة','the next bill is a sale again');
 await page.click('[data-ts-view="list"]');
 await page.waitForFunction(()=>/مرتجع/.test(document.getElementById('tsRows').textContent));
 assert.match(await text(page,'#tsRows'),/مرتجع/);assert.doesNotMatch(await text(page,'#tsRows'),/رجعله/,'no money given back is shown');
});
