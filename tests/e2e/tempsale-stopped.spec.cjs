// «البيع المؤقت» and «وقّف الآجل» (review 2026-11-23 money-6): a credit sale for a customer the owner stopped (ar_customer_stops) used to be only a warning,
// so staff saved it and the robot typed it on credit. Now staff cannot save it; the owner saves it with a second tap (his call); a return and a cash sale
// are not touched; the stopped list is kept on the phone, so a failed read after a reload still shows the warning. Made-up items and customers only.
const {run,text,assert}=require('./harness.cjs');
const STOCK=[{item_id:4875,name:'CREAM SMALL',arabic_name:'كريم صغير',price:20,packs:3,units:0,parts:1,exp_near:'2028-07-28',other:[],data_at:'2026-11-12 22:00:00'}];
const CUSTOMERS=[{id:201,name:'عميل موقوف تجربة',credit_limit:5000,balance:0},{id:202,name:'عميل عادي تجربة',credit_limit:5000,balance:0}];
const open=async(page)=>{await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');await page.waitForSelector('#tempSalePanel:not(.hidden)')};
const addItem=async(page)=>{await page.fill('#tsQ','كريم');await page.waitForSelector('#tsHits [data-ts-add="4875"]');await page.click('#tsHits [data-ts-add="4875"]')};
const pick=async(page,id,name)=>{await page.click('[data-ts-credit]');await page.fill('#tsCQ',name);await page.click(`#tsCHits [data-ts-cust="${id}"]`)};
run('Temp sale: a stopped customer: staff cannot save credit, the owner needs a second tap, the list is kept on the phone',async({page,table})=>{
 await page.evaluate(([s,c])=>{window.__tables.ar_stock=s;window.__tables.ar_customers=c;window.__tables.ar_customer_stops=[{customer_id:201}];window.__tables.ar_temp_sales=[];localStorage.removeItem('asker-ts-queue')},[STOCK,CUSTOMERS]);
 await open(page);
 // a staff member: the warning shows and the save is refused, nothing is written
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true});
 await addItem(page);await pick(page,201,'عميل موقوف');
 assert.match(await text(page,'#tsCust'),/العميل ده موقوف: البيع ليه كاش بس/);
 await page.click('#tsSave');
 assert.match(await text(page,'#tsStatus'),/موقوف: البيع ليه كاش بس\. غيّر العميل/);
 await page.click('#tsSave');
 assert.match(await text(page,'#tsStatus'),/غيّر العميل/,'a second tap does not let staff through');
 assert.equal((await table('ar_temp_sales')).length,0);
 assert.equal(await page.evaluate(()=>(JSON.parse(localStorage.getItem('asker-ts-queue')||'[]')).length),0,'nothing queued');
 assert.match(await text(page,'#tsCart'),/CREAM SMALL|كريم صغير/,'the bill stays as it was');
 // the same staff member, another customer: saved as before
 await page.click('#tsCust [data-ts-change]');await page.fill('#tsCQ','عميل عادي');await page.click('#tsCHits [data-ts-cust="202"]');
 await page.click('#tsSave');
 await page.waitForFunction(()=>window.__tables.ar_temp_sales.length===1);
 assert.equal((await table('ar_temp_sales'))[0].customer_id,202);
 // the owner: the first tap warns, the second saves (his call)
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>false});
 await addItem(page);await pick(page,201,'عميل موقوف');
 await page.click('#tsSave');
 assert.match(await text(page,'#tsStatus'),/لو عاوز تبيعه آجل برضه دوس «احفظ» تاني/);
 assert.equal((await table('ar_temp_sales')).length,1,'not saved on the first tap');
 await page.click('#tsSave');
 await page.waitForFunction(()=>window.__tables.ar_temp_sales.length===2);
 assert.equal((await table('ar_temp_sales'))[1].customer_id,201);
 // the list is kept on the phone: a reload whose read fails still knows who is stopped
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker-ts-stopped'))),['201']);
});
