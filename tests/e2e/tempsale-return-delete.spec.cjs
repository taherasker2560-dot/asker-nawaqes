// «البيع المؤقت», owner 2026-11-22, after the robot's first sale / return in PharmaFly:
// 1) a RETURN asks the expiry of the box that came back: the batches in stock, and «الصلاحية مش هنا؟ اكتبها» opens a box to type it as PharmaFly asks it (month/year);
//    an item with nothing in stock goes straight to that box;
// 2) the bills: who sold each one is always written («باعها … / إنت»); «🗑 امسح» is the owner's, a second tap, only for a bill that never went into PharmaFly with a ticket number.
// Made-up items and customers only.
const {run,text,assert}=require('./harness.cjs');
const ym=(m)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+m);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const LATER=ym(14),FAR=ym(30);
const STOCK=[
 {item_id:1060,name:'ITEM ONE 14TAB',arabic_name:'صنف تجربة',price:210,packs:5,units:1,parts:2,exp_near:LATER+'-28',other:[],data_at:'2026-11-12 22:00:00'},
 {item_id:9,name:'GONE ITEM',arabic_name:'صنف خلص',price:40,packs:1,units:0,parts:1,exp_near:null,other:[],data_at:'2026-11-12 22:00:00'}];
const COUNT={generated_at:new Date().toISOString(),data_at:'2026-11-21T13:19:17',store:1,sections:[],items:[
 {i:1060,n:'ITEM ONE 14TAB',s:1,p:2,v:210,b:[{x:LATER,k:3,u:0},{x:FAR,k:1,u:0}]}]};
const seed=(page,sales)=>page.evaluate(([s,f,ts])=>{window.__tables.ar_stock=s;window.__tables.ar_customers=[];window.__tables.ar_temp_sales=ts||[];window.__storage['count/stock.json']=JSON.stringify(f)},[STOCK,COUNT,sales||[]]);
const openSale=async(page)=>{await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');await page.waitForSelector('#tempSalePanel:not(.hidden)');await page.waitForFunction(()=>!/بيحمّل الأصناف/.test(document.getElementById('tsFind').textContent))};
const hit=async(page,q,code)=>{await page.fill('#tsQ',q);await page.waitForSelector(`#tsHits [data-ts-add="${code}"]`);await page.click(`#tsHits [data-ts-add="${code}"]`)};

run('Temp sale return: the batches of the box that came back, «الصلاحية مش هنا؟ اكتبها» types it like PharmaFly; no stock = the box at once; a sale has no such button',async({page,table})=>{
 await seed(page);
 await openSale(page);
 // a SALE: the batches only, no «type it»
 await hit(page,'صنف تجربة',1060);await page.waitForSelector('#tsExp:not(.hidden) [data-ts-xpick]');
 assert.equal(await page.$('#tsExp [data-ts-xtype]'),null,'a sale never types an expiry of a batch it has');
 await page.click('#tsExp button[data-ts-xclose]');
 // a RETURN: the same batches, its own words, and the button
 await page.click('[data-ts-type="return"]');
 await hit(page,'صنف تجربة',1060);await page.waitForSelector('#tsExp:not(.hidden) [data-ts-xpick]');
 assert.match(await text(page,'#tsExp'),/اختار صلاحية العلبة اللي رجعت/);
 assert.deepEqual(await page.$$eval('#tsExp [data-ts-xpick]',b=>b.map(x=>x.dataset.tsXpick)),[LATER,FAR]);
 assert.equal((await page.textContent('#tsExp [data-ts-xtype]')).trim(),'الصلاحية مش هنا؟ اكتبها');
 // not in the list: the box, PharmaFly's way (month/year); a date long past is fine for a return
 await page.click('#tsExp [data-ts-xtype]');await page.waitForSelector('#tsExpIn');
 assert.match(await text(page,'#tsExp'),/اكتب الصلاحية اللي على العلبة اللي رجعت، زي ما بتكتبها في فارمافلاي \(شهر وسنة\)/);
 await page.fill('#tsExpIn','11/2023');await page.click('#tsExp [data-ts-xok]');
 await page.waitForSelector('#tsCart .ts-line[data-i="0"]');
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-exp'),/11\/2023/);
 // a batch from the list still works the old way
 await hit(page,'صنف تجربة',1060);await page.waitForSelector('#tsExp:not(.hidden) [data-ts-xpick]');await page.click(`#tsExp [data-ts-xpick="${FAR}"]`);
 await page.waitForSelector('#tsCart .ts-line[data-i="1"]');
 // an item with nothing in stock: the box opens at once
 await hit(page,'صنف خلص',9);await page.waitForSelector('#tsExpIn');
 assert.equal(await page.$('#tsExp [data-ts-xpick]'),null);
 assert.match(await text(page,'#tsExp'),/اكتب الصلاحية اللي على العلبة اللي رجعت/);
 await page.fill('#tsExpIn','٠٣/٢٠٢٨');await page.click('#tsExp [data-ts-xok]');
 await page.waitForSelector('#tsCart .ts-line[data-i="2"]');
 // saved: each line carries its expiry
 await page.click('#tsSave');
 await page.waitForFunction(()=>(window.__tables.ar_temp_sales||[]).length===1);
 const r=(await table('ar_temp_sales'))[0];
 assert.equal(r.kind,'return');
 assert.deepEqual(r.items.map(x=>[x.c,x.x||null]),[[1060,'2023-11'],[1060,FAR],[9,'2028-03']]);
});

run('Temp sale list: who sold it is always written; «🗑 امسح» only for a bill with no PharmaFly ticket, a second tap, the owner only',async({page,table})=>{
 const at=(m)=>new Date(Date.now()-m*60e3).toISOString();
 const S=(id,no,status,ticket)=>({id,no,sold_at:at(no),kind:'sale',customer_id:null,customer_name:null,items:[{c:1060,n:'ITEM ONE 14TAB',q:1,u:'pack',p:210}],total:210,paid:null,note:null,status,entered_ticket:ticket,created_by:'u1'});
 await seed(page,[S('a1',1,'pending',null),S('a2',2,'entered',null),S('a3',3,'entered',385842)]);
 await openSale(page);
 await page.click('[data-ts-view="list"]');await page.waitForSelector('#tsRows [data-ts-row="a1"]');
 assert.match(await text(page,'#tsRows [data-ts-row="a1"] .ts-sale-h'),/باعها إنت/,'his own: «إنت»');
 // the waiting one: the old buttons + «امسح»; a first tap only asks
 await page.click('#tsRows [data-ts-row="a1"] [data-ts-open]');
 assert.ok(await page.$('#tsRows [data-ts-row="a1"] [data-ts-done]'),'«اتدخلت في فارمافلاي» stays');
 await page.click('#tsRows [data-ts-row="a1"] [data-ts-delsale]');
 assert.equal((await page.textContent('#tsRows [data-ts-row="a1"] [data-ts-delsale]')).trim(),'متأكد؟ دوس تاني تتمسح خالص');
 assert.equal((await table('ar_temp_sales')).length,3,'the first tap deletes nothing');
 await page.click('#tsRows [data-ts-row="a1"] [data-ts-delsale]');
 await page.waitForFunction(()=>window.__tables.ar_temp_sales.length===2);
 assert.deepEqual((await table('ar_temp_sales')).map(r=>r.id).sort(),['a2','a3']);
 assert.equal(await page.$('#tsRows [data-ts-row="a1"]'),null);
 // the entered ones: marked by hand with no ticket = may go; with a PharmaFly ticket = the number shows, no «امسح»
 await page.click('[data-ts-kind="entered"]');await page.waitForSelector('#tsRows [data-ts-row="a3"]');
 assert.match(await text(page,'#tsRows [data-ts-row="a3"] .ts-st'),/اتدخلت #385842/);
 await page.click('#tsRows [data-ts-row="a3"] [data-ts-open]');
 assert.equal(await page.$('#tsRows [data-ts-row="a3"] [data-ts-delsale]'),null,'a bill in PharmaFly with a ticket is never deleted here');
 await page.click('#tsRows [data-ts-row="a2"] [data-ts-open]');
 assert.ok(await page.$('#tsRows [data-ts-row="a2"] [data-ts-delsale]'),'marked «اتدخلت» by hand, no ticket: a trial, it may go');
 // a staff member: no «امسح» at all
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true});
 await page.click('[data-ts-kind="pending"]');await page.click('[data-ts-kind="entered"]');
 await page.click('#tsRows [data-ts-row="a2"] [data-ts-open]').catch(()=>{});
 assert.equal(await page.$('#tsRows [data-ts-delsale]'),null,'staff never delete');
});
