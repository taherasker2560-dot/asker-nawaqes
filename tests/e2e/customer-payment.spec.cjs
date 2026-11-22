// «💵 دفعة» (owner 2026-11-22/23: «ا، الدفعات», mockup customer_payment_2026-11-22): in a customer's statement, the amount (a tap selects the number), his balance before
// and after while typing, who took it, a note; «سجّل الدفعة» puts a waiting payment in «البيع المؤقت» (kind 'payment', one «أصناف متنوعة» line at 0, paid = the amount)
// that the robot enters in PharmaFly. Made-up customers only: the repository is public.
const {run,assert}=require('./harness.cjs');
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:1250,last_at:'2026-11-20T11:00:00',last_kind:'sale',moves:1}];
const MOVES=[{id:11,customer_id:101,at:'2026-11-20T11:00:00',kind:'sale',total:100,paid:0,balance:1250,items:[{n:'PANADOL EXTRA 24 TAB',p:1,u:0,k:1,s:100,d:0}]}];

run('Customer payment: «💵 دفعة» in his statement, the balance after while typing, «سجّل الدفعة» = a waiting payment in «البيع المؤقت»',async({page})=>{
 await page.evaluate(([c,m])=>{window.__tables.ar_customers=c;window.__tables.ar_customer_moves=m;window.__tables.ar_customer_phones=[];window.__tables.ar_temp_sales=[];window.__tables.ar_stock=[]},[CUSTOMERS,MOVES]);
 await page.click('[data-group="accounts"]');await page.waitForSelector('#cuBox:not(.hidden)');await page.click('#cuChips [data-cu-view="all"]');
 await page.click('#cuRows [data-cu="101"]');await page.waitForSelector('#cuSt:not(.hidden) [data-cu-pay]');
 await page.click('#cuSt [data-cu-pay]');await page.waitForSelector('#cuPayAmt');
 assert.ok(await page.$eval('[data-cu-paygo]',(b)=>b.disabled),'no amount: the button waits');
 await page.click('#cuPayAmt');await page.keyboard.type('500');
 await page.waitForFunction(()=>/بعد الدفعة/.test(document.getElementById('cuPayAfter').textContent));
 const after=await page.$eval('#cuPayAfter',(x)=>x.textContent.replace(/\s+/g,' '));
 assert.match(after,/رصيده دلوقتي عليه 1,250 ج ← بعد الدفعة عليه 750 ج/);assert.match(after,/استلمها:/);
 assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),'cuPayAmt','the box he types in stays under his fingers');
 assert.equal(await page.$eval('[data-cu-paygo]',(b)=>b.disabled),false);
 await page.fill('#cuPayNote','باقي حساب الشهر');
 await page.click('[data-cu-paygo]');
 await page.waitForFunction(()=>window.__tables.ar_temp_sales.length===1);
 const r=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__tables.ar_temp_sales[0])));
 assert.deepEqual([r.kind,r.customer_id,r.customer_name,r.total,r.paid,r.note,r.status||'pending'],['payment',101,'أحمد محمود',0,500,'باقي حساب الشهر','pending']);
 assert.deepEqual(r.items,[{c:1,n:'أصناف متنوعة',q:1,u:'pack',p:0}],'his own way in PharmaFly: one «أصناف متنوعة» line at 0');
 await page.waitForFunction(()=>/اتسجّلت دفعة 500 ج/.test(document.getElementById('cuSt').textContent));
 // «البيع المؤقت»: the waiting payment with its tag and amount (the robot button is there for the owner)
 await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');await page.waitForSelector('#tempSalePanel:not(.hidden)');
 await page.click('[data-ts-view="list"]').catch(()=>{});
 await page.waitForSelector('.ts-sale .ts-st.p');
 const row=await page.$eval('.ts-sale',(x)=>x.textContent.replace(/\s+/g,' '));
 assert.match(row,/أحمد محمود/);assert.match(row,/💵 دفعة/);assert.match(row,/دفع 500 ج/);
});
