// «حركة البيع» (owner 2026-11-14: «بيان بالمبيعات … متقسمة مبيعات بالاجل ومبيعات نقدي، وفيها بحث عن الصنف جوه الفواتير، وفيها
// بحث عن مشتريات عميل»; one year only). The period's numbers, the bars, the invoices newest first with their items, cash /
// credit / returns, an item inside the invoices, a credit customer's purchases, and the server not ready yet.
// Made-up invoices and customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const at=(daysAgo,h,m)=>{const d=new Date();d.setDate(d.getDate()-daysAgo);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`};
const ITEMS=[{id:101,name:'PANADOL EXTRA 24 TAB',arabic_name:'بانادول اكسترا'},{id:102,name:'CONCOR 5MG 30 TAB',arabic_name:null},{id:103,name:'VIDROP 15ML',arabic_name:null}];
const SALES=[
 {id:5004,at:at(0,13,18),customer_id:null,kind:'sale',total:145,lines:[{i:101,p:1,u:0,k:2,s:116,d:0},{i:103,p:0,u:1,k:3,s:87,d:0}]},
 {id:5003,at:at(0,12,58),customer_id:null,kind:'return',total:-116,lines:[{i:101,p:1,u:0,k:2,s:116,d:0}]},
 {id:5002,at:at(0,11,12),customer_id:7,kind:'sale',total:281,lines:[{i:102,p:1,u:0,k:3,s:165,d:0},{i:101,p:1,u:0,k:2,s:116,d:0}]},
 {id:5001,at:at(0,9,5),customer_id:null,kind:'sale',total:29,lines:[{i:101,p:0,u:1,k:2,s:58,d:0}]},
 {id:4001,at:at(1,21,15),customer_id:null,kind:'sale',total:116,lines:[{i:101,p:1,u:0,k:2,s:116,d:0}]},
 {id:3001,at:at(30,16,30),customer_id:7,kind:'sale',total:165,lines:[{i:102,p:1,u:0,k:3,s:165,d:0}]},
];
const setData=(page)=>page.evaluate(([s,i])=>{window.__tables.ar_sales=s;window.__tables.ar_store_items=i;window.__tables.ar_customers=[{id:7,name:'عميل تجربة واحد'},{id:8,name:'عميل تجربة اتنين'}]},[SALES,ITEMS]);
const ids=(page)=>page.$$eval('#saList [data-sa-inv]',x=>x.map(e=>+e.dataset.saInv));
run('Sales activity: the day, the bars, the invoices, cash / credit / returns, an item, a customer',async({page})=>{
 await setData(page);
 await page.click('[data-group="sales"]');
 await page.click('.subbar[data-for="sales"] [data-tab="sales"]');
 await page.waitForSelector('#saSum .sa-s');
 // today: sales 455 in 3 invoices = cash 174 (2) + credit 281 (1); one return −116
 assert.deepEqual(await page.$$eval('#saSum .sa-s',x=>x.map(e=>e.textContent.replace(/\s+/g,' ').trim())),
  ['455إجمالي البيع · 3 فاتورة','174نقدي · 2 فاتورة','281آجل · 1 فاتورة','-116مرتجع · 1 فاتورة']);
 assert.ok((await page.$$('#saBars .sa-bars i')).length>=3,'the sales per hour');
 assert.match(await text(page,'#saBars .sa-bl'),/البيع كل ساعة/);
 assert.match(await text(page,'#saAge'),/^آخر فاتورة: النهارده 1:18 م$/);
 assert.deepEqual(await ids(page),[5004,5003,5002,5001],'newest first');
 assert.match(await text(page,'[data-sa-inv="5002"]'),/فاتورة رقم 5,002 آجل · عميل تجربة واحد ?281/);
 assert.match(await text(page,'[data-sa-inv="5003"]'),/مرتجع ?-116/);
 // a tap opens the items with their names, quantities and values
 await page.click('[data-sa-inv="5004"]');
 assert.deepEqual(await page.$$eval('[data-sa-inv="5004"] .sa-lines tr',x=>x.map(e=>[...e.cells].map(c=>c.innerText.replace(/\s+/g,' ').trim()).join('|'))),
  ['PANADOL EXTRA 24 TAB بانادول اكسترا|1 علبة|116','VIDROP 15ML|1 وحدة|29']);
 // cash / credit / returns
 await page.click('[data-sa-kind="cash"]');await page.waitForFunction(()=>document.querySelectorAll('#saList [data-sa-inv]').length===2);
 assert.deepEqual(await ids(page),[5004,5001]);
 await page.click('[data-sa-kind="return"]');await page.waitForFunction(()=>document.querySelectorAll('#saList [data-sa-inv]').length===1);
 assert.deepEqual(await ids(page),[5003]);
 await page.click('[data-sa-kind="all"]');
 // the year: every invoice, the bars by month
 await page.click('[data-sa-period="year"]');await page.waitForFunction(()=>document.querySelectorAll('#saList [data-sa-inv]').length===6);
 assert.match(await text(page,'#saBars .sa-bl'),/البيع كل شهر/);
 assert.ok(await page.$eval('#saMore',b=>b.classList.contains('hidden')),'nothing older');
 // an item inside the invoices
 await page.fill('#saQ','panadol');
 await page.waitForSelector('#saFind [data-sa-item]');
 assert.match(await text(page,'#saFind [data-sa-item="101"]'),/PANADOL EXTRA 24 TAB.*5 فاتورة في السنة/);
 await page.click('#saFind [data-sa-item="101"]');
 await page.waitForSelector('#saSum .sa-item');
 assert.match(await text(page,'#saSum .sa-item'),/اتباع منه 3 علب \+ 1 وحدة في 4 فاتورة · بقيمة 377 ج/);
 assert.match(await text(page,'#saSum .sa-item .hint'),/نقدي 3 · آجل 1 · مرتجع 1/);
 assert.deepEqual(await ids(page),[5004,5003,5002,5001,4001]);
 assert.equal(await page.$eval('#saQ',e=>e.value),'');
 await page.click('[data-sa-clear]');await page.waitForFunction(()=>!document.querySelector('#saSum .sa-item'));
 // a credit customer's purchases
 await page.click('#saCustBtn');
 await page.waitForSelector('#saCustList [data-sa-cust]');
 await page.fill('#saCustQ','واحد');
 await page.waitForFunction(()=>document.querySelectorAll('#saCustList [data-sa-cust]').length===1);
 await page.click('#saCustList [data-sa-cust="7"]');
 await page.waitForFunction(()=>/اشترى بـ/.test(document.getElementById('saSum').textContent));
 assert.match(await text(page,'#saWho'),/عميل تجربة واحد · كود 7/);
 assert.match(await text(page,'#saSum'),/446 ?اشترى بـ · 2 فاتورة ?223 ?متوسط الفاتورة/);
 assert.match(await text(page,'#saSum .sa-top3'),/CONCOR 5MG 30 TAB \(2\)/);
 assert.deepEqual(await ids(page),[5002,3001]);
 assert.ok(await page.$eval('[data-sa-kind="cash"]',b=>b.hidden),'no «cash» for a credit customer');
 assert.ok(await page.$eval('#saFindBox',b=>b.classList.contains('hidden')));
 await page.click('[data-sa-clear]');
 // the server's functions not there yet: said plainly
 await page.evaluate(()=>{delete window.__tables.ar_sales;window.AskerSales.open(true)});
 await page.waitForFunction(()=>/لسه مش متاحة/.test(document.getElementById('saStatus').textContent));
 assert.equal(await page.$$eval('#saList [data-sa-inv]',x=>x.length),0);
});
