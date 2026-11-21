// «البيع المؤقت» (owner 2026-11-21): up to 3 bills open together, kept on the phone; the expiry is ASKED when an item goes in (from the
// count's file of batches) and never taken for him; the sale keeps working with no such file. Made-up items and customers only.
const {run,text,assert}=require('./harness.cjs');
const ym=(m)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+m);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const SOON=ym(1),LATER=ym(14),FAR=ym(30);
const STOCK=[
 {item_id:1060,name:'ITEM ONE 14TAB',arabic_name:'صنف تجربة',price:210,packs:5,units:1,parts:2,exp_near:SOON+'-28',other:[],data_at:'2026-11-12 22:00:00'},
 {item_id:4875,name:'CREAM SMALL',arabic_name:'كريم صغير',price:20,packs:3,units:0,parts:1,exp_near:LATER+'-28',other:[],data_at:'2026-11-12 22:00:00'},
 {item_id:7,name:'NO DATE ITEM',arabic_name:'صنف من غير تاريخ',price:5,packs:4,units:0,parts:1,exp_near:null,other:[],data_at:'2026-11-12 22:00:00'},
 {item_id:8,name:'NEGATIVE ITEM',arabic_name:'صنف بالسالب',price:9,packs:0,units:0,parts:1,exp_near:null,other:[],data_at:'2026-11-12 22:00:00'},
];
// the count's file (Hub\count\BUILD_COUNT.ps1): per item with stock its batches {x: 'YYYY-MM' | null, k: boxes, u: units}
const COUNT={generated_at:new Date().toISOString(),data_at:'2026-11-21T13:19:17',store:1,sections:[],items:[
 {i:1060,n:'ITEM ONE 14TAB',s:1,p:2,v:210,b:[{x:SOON,k:1,u:1},{x:LATER,k:3,u:0},{x:FAR,k:1,u:0}]},
 {i:4875,n:'CREAM SMALL',s:1,p:1,v:20,b:[{x:LATER,k:3,u:0}]},
 {i:7,n:'NO DATE ITEM',s:1,p:1,v:5,b:[{x:null,k:4,u:0}]},
 {i:8,n:'NEGATIVE ITEM',s:1,p:1,v:9,b:[{x:LATER,k:-2,u:0}]}]};
const CUSTOMERS=[{id:101,name:'عميل تجربة',credit_limit:5000,balance:0}];
const seed=(page,withFile)=>page.evaluate(([s,c,f])=>{window.__tables.ar_stock=s;window.__tables.ar_customers=c;window.__tables.ar_temp_sales=[];if(f)window.__storage['count/stock.json']=JSON.stringify(f)},[STOCK,CUSTOMERS,withFile?COUNT:null]);
const openSale=async(page)=>{await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');await page.waitForSelector('#tempSalePanel:not(.hidden)');await page.waitForFunction(()=>!/بيحمّل الأصناف/.test(document.getElementById('tsFind').textContent))};
const hit=async(page,q,code)=>{await page.fill('#tsQ',q);await page.waitForSelector(`#tsHits [data-ts-add="${code}"]`);await page.click(`#tsHits [data-ts-add="${code}"]`)};
const lines=(page)=>page.$$eval('#tsCart .ts-line',x=>x.length);
const sheetOpen=(page)=>page.$eval('#tsExp',e=>!e.classList.contains('hidden')).catch(()=>false);

run('Temp sale: the expiry is asked, never taken; a batch is its own line; the sticker needs no question',async({page,table})=>{
 await seed(page,true);
 await openSale(page);
 // an item with dated batches: the question opens, nothing is added before he chooses
 await hit(page,'صنف تجربة',1060);
 await page.waitForSelector('#tsExp:not(.hidden) [data-ts-xpick]');
 assert.equal(await lines(page),0,'nothing goes in before he chooses');
 assert.deepEqual(await page.$$eval('#tsExp [data-ts-xpick]',b=>b.map(x=>x.dataset.tsXpick)),[SOON,LATER,FAR],'the batches with stock, nearest expiry first');
 assert.equal(await page.$$eval('#tsExp .ts-exp-row.on',x=>x.length),0,'none is chosen for him');
 assert.ok(await page.$eval(`#tsExp [data-ts-xpick="${SOON}"]`,b=>b.classList.contains('soon')),'the one that is close is marked');
 assert.match(await text(page,'#tsExp'),/اختار الصلاحية اللي هتتباع[\s\S]*الرصيد حسب داتا 2026-11-21 13:19/);
 assert.match(await text(page,`#tsExp [data-ts-xpick="${LATER}"]`),/3 علب/);
 // cancel: nothing added
 await page.click('#tsExp button[data-ts-xclose]');
 assert.equal(await sheetOpen(page),false);assert.equal(await lines(page),0);
 // choose a batch: the line carries it, with that batch's stock
 await hit(page,'صنف تجربة',1060);await page.waitForSelector('#tsExp:not(.hidden) [data-ts-xpick]');
 await page.click(`#tsExp [data-ts-xpick="${LATER}"]`);
 await page.waitForSelector('#tsCart .ts-line[data-i="0"]');
 assert.equal(await sheetOpen(page),false,'the question closes');
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-exp'),new RegExp(`صلاحية ${LATER.slice(5)}/${LATER.slice(0,4)} ✓`));
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-info'),/رصيد التشغيلة 3 علب/);
 // the same batch again = one more box on the same line; another batch = a line of its own
 await hit(page,'صنف تجربة',1060);await page.waitForSelector('#tsExp:not(.hidden) [data-ts-xpick]');await page.click(`#tsExp [data-ts-xpick="${LATER}"]`);
 await page.waitForFunction(()=>document.querySelector('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]')?.value==='2');
 assert.equal(await lines(page),1);
 await hit(page,'صنف تجربة',1060);await page.waitForSelector('#tsExp:not(.hidden) [data-ts-xpick]');await page.click(`#tsExp [data-ts-xpick="${FAR}"]`);
 await page.waitForSelector('#tsCart .ts-line[data-i="1"]');
 assert.equal(await lines(page),2);
 // more than that batch holds: the red warning (the item has more in the other batches)
 assert.equal(await page.$('#tsCart .ts-line[data-i="1"] .ts-warn'),null);
 await page.fill('#tsCart .ts-line[data-i="1"] [data-ts-n="q"]','2');await page.press('#tsCart .ts-line[data-i="1"] [data-ts-n="q"]','Tab');
 assert.match(await text(page,'#tsCart .ts-line[data-i="1"] .ts-warn'),/الكمية أكتر من الرصيد/);
 // «تغيير»: the question again with the line's batch marked; choosing the batch of another line joins the two
 await page.click('#tsCart .ts-line[data-i="1"] [data-ts-xchg]');await page.waitForSelector('#tsExp:not(.hidden) [data-ts-xpick]');
 assert.equal(await page.$eval('#tsExp .ts-exp-row.on',b=>b.dataset.tsXpick),FAR);
 await page.click(`#tsExp [data-ts-xpick="${LATER}"]`);
 await page.waitForFunction(()=>document.querySelectorAll('#tsCart .ts-line').length===1);
 assert.equal(await page.inputValue('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]'),'4','2 + 2 boxes of the same batch');
 // the whole line moves to a batch that is not on the bill: same line, new expiry and stock
 await page.click('#tsCart .ts-line[data-i="0"] [data-ts-xchg]');await page.waitForSelector('#tsExp:not(.hidden) [data-ts-xpick]');await page.click(`#tsExp [data-ts-xpick="${FAR}"]`);
 await page.waitForFunction((x)=>new RegExp(x).test(document.querySelector('#tsCart .ts-line[data-i="0"] .ts-exp')?.textContent||''),`${FAR.slice(5)}/${FAR.slice(0,4)}`);
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-info'),/رصيد التشغيلة 1 علبة/);
 // an item PharmaFly says has no expiry, and one with nothing to choose from: no question
 await hit(page,'من غير تاريخ',7);await page.waitForSelector('#tsCart .ts-line[data-i="1"]');
 assert.equal(await sheetOpen(page),false);assert.equal(await page.$('#tsCart .ts-line[data-i="1"] .ts-exp'),null,'no expiry shown for an item with none');
 await hit(page,'بالسالب',8);await page.waitForSelector('#tsCart .ts-line[data-i="2"]');
 assert.equal(await sheetOpen(page),false);assert.match(await text(page,'#tsCart .ts-line[data-i="2"] .ts-warn'),/الكمية أكتر من الرصيد/);
 await page.click('#tsCart .ts-line[data-i="2"] [data-ts-del]');await page.click('#tsCart .ts-line[data-i="1"] [data-ts-del]');
 // the sticker's barcode: month + year of the batch in his hand, so no question; its stock is that batch's
 const sticker=(code,ym_)=>`1${String(code).padStart(5,'0')}${ym_.slice(5)}${ym_.slice(2,4)}`;
 await page.evaluate((s)=>window.AskerTempSale.scanned(s,true,'itf'),sticker(4875,LATER));
 await page.waitForSelector('#tsCart .ts-line[data-i="1"]');
 assert.equal(await sheetOpen(page),false,'the sticker names the batch');
 assert.match(await text(page,'#tsCart .ts-line[data-i="1"] .ts-exp'),new RegExp(`صلاحية ${LATER.slice(5)}/${LATER.slice(0,4)}`));
 assert.match(await text(page,'#tsCart .ts-line[data-i="1"] .ts-info'),/رصيد التشغيلة 3 علب/);
 // a sticker whose batch is not in stock: it is the batch in his hand, so it goes in, with the warning
 await page.evaluate((s)=>window.AskerTempSale.scanned(s,true,'itf'),sticker(1060,ym(5)));
 await page.waitForSelector('#tsCart .ts-line[data-i="2"]');
 assert.match(await text(page,'#tsCart .ts-line[data-i="2"] .ts-warn'),/الكمية أكتر من الرصيد/);
 await page.click('#tsCart .ts-line[data-i="2"] [data-ts-del]');
 // a sticker with the 6 digits only carries no expiry: it asks like any other way in
 await page.evaluate(()=>window.AskerTempSale.scanned('101060',true));
 await page.waitForSelector('#tsExp:not(.hidden) [data-ts-xpick]');
 assert.equal(await lines(page),2,'asked first');
 await page.click('#tsExp button[data-ts-xclose]');
 // a line with boxes AND units goes to the server as two entries with its expiry; the waiting list says the expiry
 await page.fill('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]','1');await page.press('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]','Tab');
 await page.fill('#tsCart .ts-line[data-i="0"] [data-ts-n="w"]','1');await page.press('#tsCart .ts-line[data-i="0"] [data-ts-n="w"]','Tab');
 await page.click('#tsSave');
 await page.waitForFunction(()=>/اتحفظت ✓/.test(document.getElementById('tsStatus').textContent));
 const rows=await table('ar_temp_sales');
 assert.deepEqual(rows[0].items,[{c:1060,n:'ITEM ONE 14TAB',q:1,u:'pack',p:210,x:FAR},{c:1060,n:'ITEM ONE 14TAB',q:1,u:'unit',p:105,x:FAR},{c:4875,n:'CREAM SMALL',q:1,u:'pack',p:20,x:LATER}]);
 assert.equal(rows[0].total,335);
 await page.click('[data-ts-view="list"]');await page.waitForSelector('#tsRows [data-ts-open]');await page.click('#tsRows [data-ts-open]');
 assert.match(await text(page,'#tsRows .ts-items'),new RegExp(`صلاحية ${FAR.slice(5)}/${FAR.slice(0,4)}[\\s\\S]*1 علبة[\\s\\S]*1 وحدة[\\s\\S]*صلاحية ${LATER.slice(5)}/${LATER.slice(0,4)}`));
});

run('Temp sale: with no batches file the sale still works, the line says its expiry is not known',async({page})=>{
 await seed(page,false);
 await openSale(page);
 await hit(page,'صنف تجربة',1060);
 await page.waitForSelector('#tsCart .ts-line[data-i="0"]');
 assert.equal(await sheetOpen(page),false,'nothing to ask from');
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-exp.none'),/الصلاحية مش متاحة دلوقتي/);
 assert.equal(await page.$('#tsCart .ts-line[data-i="0"] [data-ts-xchg]'),null);
 // the line's own stock is the item's
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-info'),/رصيد 5 علب/);
});

run('Temp sale: up to 3 bills open together, each its own; kept on the phone',async({page,table})=>{
 await seed(page,false);
 await openSale(page);
 const tabs=()=>page.$$eval('#tsBills .ts-bill',x=>x.map(b=>b.textContent.replace(/\s+/g,' ').trim()));
 assert.deepEqual(await tabs(),['بيعة 1','＋'],'one bill and the way to open another');
 await hit(page,'صنف تجربة',1060);await page.waitForSelector('#tsCart .ts-line[data-i="0"]');
 assert.deepEqual(await tabs(),['بيعة 1 210 ج','＋']);
 await page.click('[data-ts-credit]');await page.fill('#tsCQ','عميل');await page.click('#tsCHits [data-ts-cust="101"]');
 await page.fill('#tsNote','ملاحظة البيعة الأولى');
 // a second bill: empty, its own; the first one waits as it was
 await page.click('[data-ts-billadd]');
 assert.deepEqual(await tabs(),['بيعة 1 210 ج','بيعة 2','＋']);
 assert.match(await text(page,'#tsCart'),/لسه مفيش أصناف/);
 assert.equal(await page.inputValue('#tsNote'),'');assert.equal(await page.$('#tsCust .ts-cust'),null,'no customer on the new bill');
 await hit(page,'كريم',4875);await page.waitForSelector('#tsCart .ts-line[data-i="0"]');
 await page.click('[data-ts-type="return"]');
 assert.deepEqual(await tabs(),['بيعة 1 210 ج','مرتجع 2 20 ج','＋']);
 // a third; then no more (and each time a new bill is a sale)
 await page.click('[data-ts-billadd]');
 assert.equal(await page.$eval('[data-ts-type="sale"]',b=>b.classList.contains('on')),true);
 assert.equal(await page.$('[data-ts-billadd]'),null,'3 is the most');
 assert.equal((await tabs()).length,3);
 await hit(page,'من غير تاريخ',7);await page.waitForSelector('#tsCart .ts-line[data-i="0"]');
 // back to the first: its line, its customer, its note, still a sale
 await page.click('[data-ts-bill="0"]');
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"]'),/صنف تجربة/);
 assert.match(await text(page,'#tsCust .ts-cust'),/عميل تجربة/);
 assert.equal(await page.inputValue('#tsNote'),'ملاحظة البيعة الأولى');
 assert.equal(await page.$eval('[data-ts-type="sale"]',b=>b.classList.contains('on')),true);
 // the second is still a return, with its own line
 await page.click('[data-ts-bill="1"]');
 assert.equal(await page.$eval('[data-ts-type="return"]',b=>b.classList.contains('on')),true);
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"]'),/كريم صغير/);
 assert.equal(await text(page,'#tsSave'),'احفظ المرتجع');
 assert.equal(await page.$('#tsCust .ts-cust'),null);
 // the three are kept on the phone as they are
 const kept=await page.evaluate(()=>JSON.parse(localStorage.getItem('asker-ts-bills')));
 assert.equal(kept.cur,1);assert.equal(kept.bills.length,3);assert.deepEqual(kept.bills.map(b=>[b.kind,b.cart.length,b.cart[0].c]),[['sale',1,1060],['return',1,4875],['sale',1,7]]);
 assert.equal(kept.bills[0].note,'ملاحظة البيعة الأولى');assert.equal(kept.bills[0].cust.id,101);
 // saving saves THIS bill only: its tab empties, the others stay
 await page.fill('#tsPaid','20');await page.click('#tsSave');
 await page.waitForFunction(()=>/اتحفظت ✓/.test(document.getElementById('tsStatus').textContent));
 const rows=await table('ar_temp_sales');
 assert.equal(rows.length,1);assert.equal(rows[0].kind,'return');assert.deepEqual(rows[0].items,[{c:4875,n:'CREAM SMALL',q:1,u:'pack',p:20}]);
 assert.deepEqual(await tabs(),['بيعة 1 210 ج','بيعة 2','بيعة 3 5 ج']);
 assert.match(await text(page,'#tsCart'),/لسه مفيش أصناف/);
 // the page is closed and opened again: the bills come back as they were
 await page.reload();await seed(page,false);await openSale(page);
 assert.deepEqual(await tabs(),['بيعة 1 210 ج','بيعة 2','بيعة 3 5 ج']);
 await page.click('[data-ts-bill="0"]');
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"]'),/صنف تجربة/);
 assert.equal(await page.inputValue('#tsNote'),'ملاحظة البيعة الأولى');
 assert.match(await text(page,'#tsCust .ts-cust'),/عميل تجربة/);
 // saving the first leaves the others
 await page.click('#tsSave');await page.waitForFunction(()=>/اتحفظت ✓/.test(document.getElementById('tsStatus').textContent));
 assert.deepEqual(await tabs(),['بيعة 1','بيعة 2','بيعة 3 5 ج']);
 const after=await table('ar_temp_sales');   // (the page was reloaded: the fake server started empty again)
 assert.equal(after.length,1);assert.equal(after[0].kind,'sale');assert.equal(after[0].customer_id,101);assert.equal(after[0].note,'ملاحظة البيعة الأولى');
});
