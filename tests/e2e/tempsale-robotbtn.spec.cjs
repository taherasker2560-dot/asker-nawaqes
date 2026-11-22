// «البيع المؤقت», owner 2026-11-22: «🤖 ادخلها دلوقتي»: his button on a waiting bill (and «ادخّل كل المستني دلوقتي» for all of them) makes the sales robot on the laptop
// enter it now; the robot's state shows on the bill (asked / typing / stopped) and the list looks again by itself while it is busy. The owner only.
// Made-up items only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const at=(m)=>new Date(Date.now()-m*60e3).toISOString();
const S=(id,no,status,ticket)=>({id,no,sold_at:at(no),kind:'sale',customer_id:null,customer_name:null,items:[{c:1060,n:'ITEM ONE 14TAB',q:1,u:'pack',p:210}],total:210,paid:null,note:null,status,entered_ticket:ticket,created_by:'u1'});
const STOCK=[{item_id:1060,name:'ITEM ONE 14TAB',arabic_name:'صنف تجربة',price:210,packs:5,units:1,parts:2,exp_near:null,other:[],data_at:'2026-11-12 22:00:00'}];
const seed=(page,sales)=>page.evaluate(([s,ts])=>{window.__tables.ar_stock=s;window.__tables.ar_customers=[];window.__tables.ar_temp_sales=ts},[STOCK,sales]);
const openList=async(page)=>{await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');await page.waitForSelector('#tempSalePanel:not(.hidden)');await page.click('[data-ts-view="list"]');await page.waitForSelector('#tsRows [data-ts-row="a1"]')};
const row=(page,id)=>page.evaluate((i)=>window.__tables.ar_temp_sales.find(r=>r.id===i),id);
const head=(page,id)=>text(page,`#tsRows [data-ts-row="${id}"] .ts-sale-h`);

run('Temp sale list: «🤖 ادخلها دلوقتي» asks the robot, the state shows on the bill, «ادخّل كل المستني دلوقتي» asks for all, the owner only',async({page})=>{
 await seed(page,[S('a1',1,'pending',null),S('a2',2,'pending',null),S('a3',3,'entered',385842)]);
 await openList(page);
 // the top button counts the waiting bills; each bill has its own, in the open row
 assert.match(await text(page,'#tsRows .ts-robot-all'),/ادخّل كل المستني دلوقتي ?2/);
 await page.click('#tsRows [data-ts-row="a1"] [data-ts-open]');
 assert.ok(await page.$('#tsRows [data-ts-row="a1"] [data-ts-robot]:not([disabled])'),'the bill\'s button');
 assert.ok(await page.$('#tsRows [data-ts-row="a1"] [data-ts-done]'),'«اتدخلت في فارمافلاي» stays beside it');
 // one bill: the ask is written (the server signs it as his), the tag and the note show, the button is off, the top one counts the other
 await page.click('#tsRows [data-ts-row="a1"] [data-ts-robot]');
 await page.waitForFunction(()=>(window.__tables.ar_temp_sales.find(r=>r.id==='a1')||{}).robot_ask_at);
 assert.equal((await row(page,'a2')).robot_ask_at||null,null,'only that bill');
 assert.match(await head(page,'a1'),/طلبك وصل/);
 assert.match(await text(page,'#tsRows [data-ts-row="a1"] .ts-rn'),/الروبوت هياخدها في أقل من دقيقة/);
 assert.ok(await page.$('#tsRows [data-ts-row="a1"] [data-ts-robot][disabled]'),'asked: the button is off');
 assert.match(await text(page,'#tsRows .ts-robot-all'),/ادخّل كل المستني دلوقتي ?1/);
 // the robot starts typing it: the list looks again by itself and shows it
 await page.evaluate(()=>{const r=window.__tables.ar_temp_sales.find(x=>x.id==='a1');r.robot_state='typing';r.robot_state_at=new Date().toISOString()});
 await page.waitForFunction(()=>/بيكتبها دلوقتي/.test(document.querySelector('#tsRows [data-ts-row="a1"] .ts-sale-h').textContent),null,{timeout:15000});
 // it stopped (its question is in «الروبوت محتاج رأيك»): the ask is cleared, the button is on again, and «all» counts it
 await page.evaluate(()=>{const r=window.__tables.ar_temp_sales.find(x=>x.id==='a1');r.robot_state='stopped';r.robot_ask_at=null});
 await page.waitForFunction(()=>/وقف/.test(document.querySelector('#tsRows [data-ts-row="a1"] .ts-sale-h').textContent),null,{timeout:15000});
 assert.match(await head(page,'a1'),/وقف/);
 assert.match(await text(page,'#tsRows [data-ts-row="a1"] .ts-rn'),/الروبوت وقف/);
 assert.match(await text(page,'#tsRows .ts-robot-all'),/ادخّل كل المستني دلوقتي ?2/);
 // all of them
 await page.click('#tsRows .ts-robot-all');
 await page.waitForFunction(()=>window.__tables.ar_temp_sales.filter(r=>r.status==='pending'&&r.robot_ask_at).length===2);
 assert.equal((await row(page,'a1')).robot_state,null,'a new press clears the old state');
 assert.equal(await page.$('#tsRows .ts-robot-all'),null,'nothing left to ask for');
 assert.match(await head(page,'a2'),/طلبك وصل/);
 assert.equal((await row(page,'a3')).robot_ask_at||null,null,'an entered bill is never asked');
 // saved by the robot: it leaves the waiting list
 await page.evaluate(()=>{const r=window.__tables.ar_temp_sales.find(x=>x.id==='a1');r.status='entered';r.entered_ticket=385850;r.robot_ask_at=null;r.robot_state=null});
 await page.waitForFunction(()=>!document.querySelector('#tsRows [data-ts-row="a1"]'),null,{timeout:15000});
 // a staff member: no robot button at all
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true});
 await page.click('[data-ts-kind="entered"]');await page.click('[data-ts-kind="pending"]');
 assert.equal(await page.$('#tsRows [data-ts-robot]'),null,'staff have no «ادخلها دلوقتي»');
 assert.equal(await page.$('#tsRows .ts-robot-all'),null);
});
