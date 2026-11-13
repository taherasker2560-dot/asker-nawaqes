// Customers' accounts (owner 2026-11-12 «ا»): «781 عليهم فلوس» is a button that opens the customers, a search by name, and a tap
// on a name opens the statement (sales with their items, returns, payments, the balance after each). Made-up customers only:
// the repository is public.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const at=(d,h,m)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`;
const today=new Date(),old=new Date(Date.now()-40*864e5);
const CUSTOMERS=[
 {id:101,name:'أحمد محمود',credit_limit:5000,balance:7174.5,last_at:at(today,11,0),last_kind:'sale',moves:4},
 {id:102,name:'سامية عبد الله',credit_limit:10000,balance:9500,last_at:at(old,9,10),last_kind:'payment',moves:1},
 {id:103,name:'هدى كمال',credit_limit:10000,balance:912,last_at:at(old,12,0),last_kind:'sale',moves:1},
 {id:104,name:'مصطفى إبراهيم',credit_limit:10000,balance:-200,last_at:at(old,12,0),last_kind:'payment',moves:1},
 {id:105,name:'منى فتحي',credit_limit:10000,balance:0.27,last_at:null,last_kind:null,moves:0},
];
const MOVES=[
 {id:-7,customer_id:101,at:at(old,13,7),kind:'payment',total:0,paid:500,balance:6800,items:[{n:'أصناف متنوعة',p:1,u:0,k:1,s:0,d:0}]},
 {id:11,customer_id:101,at:at(today,9,0),kind:'sale',total:166.7,paid:0,balance:6966.7,items:[{n:'PANADOL EXTRA 24 TAB',p:1,u:0,k:1,s:66.7,d:0},{n:'VITACID C 1000',p:0,u:2,k:2,s:100,d:0}]},
 {id:12,customer_id:101,at:at(today,10,0),kind:'return',total:-54,paid:0,balance:6912.7,items:[{n:'OMEZ 40 20 CAP',p:0,u:1,k:2,s:108,d:0}]},
 {id:13,customer_id:101,at:at(today,11,0),kind:'sale',total:261.8,paid:0,balance:7174.5,items:[{n:'لزق جروح طويل',p:5,u:0,k:1,s:0.5,d:0},{n:'B',p:1,u:0,k:1,s:290.3,d:0}]},
 {id:20,customer_id:102,at:at(old,9,10),kind:'payment',total:0,paid:1000,balance:9500,items:null},
];
const setData=(page,c=CUSTOMERS,m=MOVES)=>page.evaluate(([c,m])=>{window.__tables.ar_customers=c;window.__tables.ar_customer_moves=m},[c,m]);
run('Customers: the numbers are buttons, search by name, every customer',async({page})=>{
 // «محتاج شغل» is under «ادخل على طول» on the home screen
 assert.equal(await page.evaluate(()=>document.querySelector('#homePanel .qa').nextElementSibling.id),'todoCard');
 await setData(page);
 await page.click('[data-group="accounts"]');
 await page.waitForSelector('#cuBox:not(.hidden)');
 assert.ok(await page.$eval('#alCustomers',e=>e.classList.contains('hidden')),'the alerts list gives way to the accounts');
 assert.deepEqual(await page.$$eval('#cuStats .cu-stat',b=>b.map(x=>x.textContent.replace(/\s+/g,' ').trim())),['1عدّوا الحد','3عليهم فلوس','1ليهم فلوس']);
 // the net debt on top (owner 2026-11-13): what they owe minus what we owe
 assert.match(await text(page,'#cuNet'),/صافي الدين ?[\d,.]+ ج ?عليهم 17,586.50 − ليهم [\d,.]+/);
 // opens on «عدّوا الحد» (over first, then the ones close to it)
 assert.deepEqual(await page.$$eval('#cuRows .cu-row strong',s=>s.map(x=>x.textContent)),['أحمد محمود','سامية عبد الله']);
 // the «عليهم فلوس» number opens everyone who owes, biggest first, with the total
 await page.click('#cuStats [data-cu-view="owing"]');
 assert.deepEqual(await page.$$eval('#cuRows .cu-row strong',s=>s.map(x=>x.textContent)),['سامية عبد الله','أحمد محمود','هدى كمال']);
 assert.equal(await text(page,'#cuCount'),'3 عميل عليهم 17,586.50 ج');
 assert.equal(await text(page,'#cuRows [data-cu="101"] .cu-amt'),'عليه 7,174.50 جالحد 5,000');
 // «ليهم» and «الكل»
 await page.click('#cuChips [data-cu-view="prepaid"]');
 assert.deepEqual(await page.$$eval('#cuRows .cu-row strong',s=>s.map(x=>x.textContent)),['مصطفى إبراهيم']);
 assert.equal(await text(page,'#cuRows .cu-amt'),'ليه 200 جالحد 10,000');
 await page.click('#cuChips [data-cu-view="all"]');
 assert.equal((await page.$$('#cuRows .cu-row')).length,5);
 assert.match(await text(page,'#cuRows [data-cu="105"]'),/خالص/,'a crumb under half a pound is settled');
 // search: another spelling of the name, and the code
 await page.fill('#cuQ','مصطفي ابراهيم');
 assert.deepEqual(await page.$$eval('#cuRows .cu-row strong',s=>s.map(x=>x.textContent)),['مصطفى إبراهيم']);
 await page.fill('#cuQ','103');
 assert.deepEqual(await page.$$eval('#cuRows .cu-row strong',s=>s.map(x=>x.textContent)),['هدى كمال']);
 await page.click('#cuClear');
 assert.equal(await page.inputValue('#cuQ'),'');
 // nothing is written
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.filter(w=>/customer/.test(w.table||w.rpc||''))),[]);
});
run('Customers: the statement (sales with items, returns, payments, the balance after each), back with the phone',async({page})=>{
 await setData(page);
 await page.click('[data-group="accounts"]');
 await page.waitForSelector('#cuBox:not(.hidden)');
 await page.fill('#cuQ','احمد');
 await page.click('#cuRows [data-cu="101"]');
 await page.waitForSelector('#cuSt:not(.hidden) .cu-mv');
 assert.ok(await page.$eval('#cuListView',e=>e.classList.contains('hidden')));
 assert.equal(await text(page,'#cuSt .cu-name'),'أحمد محمود كود 101');
 assert.equal(await text(page,'#cuSt .cu-bal'),'عليه 7,174.50 ج');
 assert.equal(await text(page,'#cuSt .cu-head > .hint'),'الحد 5,000 ج · زيادة 2,174.50 ج');
 // this month: 166.70 − 54 + 261.80 bought, nothing paid (the 500 was 40 days ago)
 assert.equal(await text(page,'#cuSt .cu-sum'),'اشترى الشهر ده374.50 جدفع الشهر ده0 ج');
 // newest first, grouped by day, the balance after each
 const rows=await page.$$eval('#cuMoves .cu-mv',m=>m.map(x=>x.querySelector('.cu-k').textContent+' | '+x.querySelector('.cu-after').textContent));
 assert.deepEqual(rows,['فاتورة بيع 261.80 ج | بعدها: عليه 7,174.50 ج','مرتجع 54 ج | بعدها: عليه 6,912.70 ج','فاتورة بيع 166.70 ج | بعدها: عليه 6,966.70 ج','دفعة 500 ج | بعدها: عليه 6,800 ج']);
 const days=await page.$$eval('#cuMoves .cu-day',d=>d.map(x=>x.textContent));
 assert.equal(days[0],'النهارده');assert.equal(days.length,2);
 assert.match(await text(page,'#cuSt'),/ده كل حسابه: 4 حركة من أول/);
 // a sale's items open with a tap; a payment has none (PharmaFly's placeholder line is not shown)
 assert.equal(await page.$('#cuMoves .cu-items'),null);
 assert.equal(await page.$('#cuMoves [data-cu-items="-7"]'),null);
 await page.click('#cuMoves [data-cu-items="11"]');
 assert.deepEqual(await page.$$eval('#cuMoves .cu-items div',d=>d.map(x=>x.textContent.replace(/\s+/g,' ').trim())),['PANADOL EXTRA 24 TAB1 علبة · 66.70 ج','VITACID C 10002 وحدة · 100 ج']);
 assert.match(await text(page,'#cuMoves [data-cu-items="11"]'),/صنفين ▾/);
 // the customer's discount shows next to the invoice (items 292.80, charged 261.80); none when there is none
 const d=await page.$$eval('#cuMoves .cu-mv-d',x=>x.map(e=>e.textContent.replace(/\s+/g,' ').trim()));
 assert.match(d[0],/خصم 31 ج/);assert.doesNotMatch(d[2],/خصم/);
 // «المدفوعات» / «المبيعات»
 await page.click('[data-cu-filter="payments"]');
 assert.deepEqual(await page.$$eval('#cuMoves .cu-k',k=>k.map(x=>x.textContent)),['دفعة 500 ج']);
 await page.click('[data-cu-filter="sales"]');
 assert.equal((await page.$$('#cuMoves .cu-mv')).length,3);
 // the phone's back button goes back to the list (with the search still there)
 await page.goBack();
 await page.waitForSelector('#cuListView:not(.hidden)');
 assert.ok(await page.$eval('#cuSt',e=>e.classList.contains('hidden')));
 assert.equal(await page.inputValue('#cuQ'),'احمد');
 // and the «رجوع» button too
 await page.click('#cuRows [data-cu="101"]');
 await page.waitForSelector('#cuSt:not(.hidden) .cu-mv');
 await page.click('[data-cu-back]');
 await page.waitForSelector('#cuListView:not(.hidden)');
 // a customer with no movements
 await page.click('#cuChips [data-cu-view="all"]');await page.fill('#cuQ','منى');
 await page.click('#cuRows [data-cu="105"]');
 await page.waitForFunction(()=>/مفيش حركات للعميل ده/.test(document.getElementById('cuSt').textContent));
 assert.equal(await text(page,'#cuSt .cu-head > .hint'),'الحد 10,000 ج · 0% من الحد');
});
run('Customers: no accounts yet = the alerts list stays',async({page})=>{
 await page.click('[data-group="accounts"]');
 await page.waitForTimeout(500);
 assert.ok(await page.$eval('#cuBox',e=>e.classList.contains('hidden')));
 assert.equal(await page.$eval('#alCustomers',e=>e.classList.contains('hidden')),false);
});
