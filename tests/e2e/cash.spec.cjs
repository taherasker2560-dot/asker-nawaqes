// «الحسابات ← الخزن» (owner 2026-11-15): PharmaFly's cash boxes with the balance now, today's in and out, and a box's statement
// (newest first, by day, the balance after each move, filters). Made-up boxes; names stay as they are.
const {run,assert}=require('./harness.cjs');
const names=(page,sel)=>page.$$eval(sel,b=>b.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
run('Cash: the boxes, today\'s in and out, a statement with the balance after each move, the filters',async({page})=>{
 await page.evaluate(()=>{
  const p=n=>String(n).padStart(2,'0'),d=new Date(),y=new Date(Date.now()-864e5);
  const at=(x,h,m)=>`${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}T${p(h)}:${p(m)}:00`;
  window.__tables.ar_cash_accounts=[
   {id:1,name:'درج خزينة النقدية',type:0,balance:2150,last_at:at(d,9,30)},
   {id:2,name:'الخزينة الرئيسية',type:0,balance:580.5,last_at:at(y,23,40)},
   {id:7,name:'احمد ربيع',type:1,balance:-10000,last_at:null}];
  window.__tables.ar_cash_moves=[
   {id:-1,account_id:1,at:at(d,9,30),op:1,kind:'sales',amount:700,who:null,memo:null,n:12},
   {id:10,account_id:1,at:at(d,9,0),op:2,kind:'customer',amount:150,who:'أحمد مسعود',memo:null,n:null},
   {id:11,account_id:1,at:at(d,8,30),op:1002,kind:'expense',amount:-50,who:'فواتير كهرباة',memo:'كهربا',n:null},
   {id:12,account_id:1,at:at(y,23,40),op:5,kind:'drawer_out',amount:-8910.35,who:null,memo:null,n:null},
   {id:13,account_id:2,at:at(y,23,40),op:6,kind:'drawer_in',amount:8920,who:null,memo:null,n:null},
   {id:14,account_id:2,at:at(y,23,41),op:52,kind:'transfer_out',amount:-8800,who:'احتياطى 2',memo:null,n:null},
   {id:15,account_id:2,at:at(y,20,0),op:51,kind:'other_out',amount:-41.99,who:null,memo:null,n:null}];});
 await page.click('[data-group="accounts"]');
 assert.deepEqual(await names(page,'.subbar[data-for="accounts"] [data-tab]'),['العملاء','الموردين','الخزن','المدفوعات','العمليات']);
 await page.click('[data-tab="cash"]');
 assert.ok(await page.isVisible('#cashPanel'));assert.ok(!(await page.isVisible('#customersPanel')));
 await page.waitForSelector('#csList .cs-box');
 // the boxes, the total and today's in/out
 assert.equal(await page.$$eval('#csList .cs-box',b=>b.length),3);
 assert.match(await page.textContent('#csList .cs-total'),/مجموع الأرصدة\s*-?7,269\.50 ج|مجموع الأرصدة\s*−?7,269\.50 ج|مجموع الأرصدة\s*-7,269\.5/);
 const first=await page.textContent('#csList .cs-box');
 assert.match(first,/درج خزينة النقدية/);assert.match(first,/2,150 ج/);assert.match(first,/النهارده: داخل 850 · خارج 50/);
 assert.ok(await page.$eval('#csList [data-cs-open="7"] .cs-amt',e=>e.classList.contains('neg')),'a negative box is red');
 assert.match(await page.textContent('#csList [data-cs-open="7"]'),/مفيش حركات/);
 // a statement: newest first, by day, the balance after each move
 await page.click('#csList [data-cs-open="1"]');
 await page.waitForSelector('#csStatement .cs-move');
 assert.ok(!(await page.isVisible('#csList')));
 assert.match(await page.textContent('#csStatement .cs-now'),/2,150 ج/);
 assert.match(await page.textContent('#csStatement .cs-sum'),/النهارده داخل 850\s*خارج 50/);
 const days=await names(page,'#csStatement .cs-day h4');
 assert.match(days[0],/^النهارده/);assert.match(days[1],/^امبارح/);
 const rows=await names(page,'#csStatement .cs-move');
 assert.equal(rows.length,4);
 assert.match(rows[0],/09:30.*مبيعات نقدي.*12 بيعة.*\+700.*2,150/,'the newest first, with the balance after it');
 assert.match(rows[1],/تحصيل من عميل أحمد مسعود.*\+150.*1,450/);
 assert.match(rows[2],/مصروف فواتير كهرباة.*كهربا.*−50.*1,300/);
 assert.match(rows[3],/تسليم الدرج للخزينة.*−8,910\.35.*1,350/);
 // the filters
 await page.click('#csStatement [data-cs-filter="out"]');
 assert.equal(await page.$$eval('#csStatement .cs-move',b=>b.length),2);
 await page.click('#csStatement [data-cs-filter="sales"]');
 assert.equal(await page.$$eval('#csStatement .cs-move',b=>b.length),1);
 await page.click('#csStatement [data-cs-filter="transfer"]');
 assert.equal(await page.$$eval('#csStatement .cs-move',b=>b.length),1,'the drawer handover counts as a transfer');
 // another box: a transfer says where to, and an operation nobody named is not guessed
 await page.click('#csStatement [data-cs-back]');
 assert.ok(await page.isVisible('#csList'));
 await page.click('#csList [data-cs-open="2"]');await page.waitForSelector('#csStatement .cs-move');
 const r2=await names(page,'#csStatement .cs-move');
 assert.match(r2[0],/تحويل لخزنة احتياطى 2.*−8,800/);
 assert.match(r2.join('|'),/حركة خارجة.*رقم 51/);
 // fits the phone; the 📌 is there
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
 assert.ok(await page.isVisible('.subbar[data-for="accounts"] .qa-pin'));
 // the page says so when the server has no cash tables yet
 await page.evaluate(()=>{delete window.__tables.ar_cash_accounts;delete window.__tables.ar_cash_moves});
 await page.click('[data-tab="ops"]');await page.click('[data-tab="cash"]');await page.waitForTimeout(300);
 assert.match(await page.textContent('#csList'),/مفيش خزن لسه/);
},{home:true});
