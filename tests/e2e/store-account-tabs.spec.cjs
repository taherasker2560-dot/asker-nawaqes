// The customer's account as an APP (owner 2026-11-17: «تبقى صفحة قصيرة … وكل صفحة من جوه طولها على قد اللي ياخدها … زي ابلكيشن بالفعل، مش رابط وخلاص» and «لما يدوس على الكل يفتح له
// المشتريات والمبيعات كلها في الصفحة من فوق مش من تحت»): four tabs pinned at the top (الرئيسية / الكل / المشتريات / المدفوعات); the home is short (the balance and the buttons); every other
// tab is a page of its own that opens from its top, however long his history is. Made-up customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const at=(n,h=10)=>{const d=new Date(Date.now()-n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:00:00`};
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:7174.5,last_at:at(0),last_kind:'sale',moves:130}];
// 130 movements, newest first by id: every third one a payment, the rest sales (one item each)
const MOVES=Array.from({length:130},(_,i)=>{const id=1000-i,pay=i%3===2;return {id,customer_id:101,at:at(Math.floor(i/2),10+(i%2)),kind:pay?'payment':'sale',total:pay?0:100+i,paid:pay?200+i:0,balance:7000-i,items:pay?null:[{n:'ITEM '+i,p:1,u:0,k:1,s:100+i,d:0}]}});
const tok='c'.repeat(64);
const open=async(page,base,extra='')=>{await page.setViewportSize({width:375,height:812});
 await page.evaluate(([c,m,t])=>localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:m,ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[],ar_store_orders:[]})),[CUSTOMERS,MOVES,tok]);
 await page.goto(base+'store.html#me='+tok+extra);await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');};
const tabs=(page)=>page.$$eval('.ac-tab',e=>e.map(x=>[x.textContent,x.getAttribute('aria-selected'),x.dataset.acctFilter]));
const scrollY=(page)=>page.evaluate(()=>Math.round(window.scrollY));

run('Account app: four tabs at the top, the home is short (the balance and the buttons, no history), a tab opens its own page from the top, the tabs stay pinned',async({page,base})=>{
 await open(page,base);
 assert.deepEqual(await tabs(page),[['الرئيسية','true','home'],['الكل','false','all'],['المشتريات','false','sales'],['المدفوعات','false','payments']]);
 // the home: balance, order, the buttons; his history is NOT under them any more
 assert.equal(await text(page,'.ac-big'),'عليك 7,174.50 ج');assert.ok(await page.$('.ac-order'));assert.ok(await page.$('.ac-row'));
 assert.equal(await page.$('.ac-moves'),null);assert.equal(await page.$('.ac-mv'),null);assert.equal(await page.$('[data-acct-older]'),null);
 const homeH=await page.evaluate(()=>document.getElementById('acctBox').getBoundingClientRect().height);
 // «الكل»: his history from its top, even when the home was scrolled down
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 await page.click('[data-acct-filter="all"]');
 await page.waitForSelector('.ac-mv');
 assert.equal(await scrollY(page),0,'the page opens from its top, not where the home was scrolled to');
 assert.deepEqual((await tabs(page)).map(t=>t[1]),['false','true','false','false']);
 assert.equal(await page.$('.ac-big'),null,'the big balance card belongs to the home');
 assert.match(await text(page,'.ac-mini'),/عليك 7,174.50 ج/,'a short balance line on top of the list');
 assert.equal(await page.$('.ac-order'),null,'no buttons on a history page');
 const first=await page.$$eval('.ac-mv .ac-k',e=>e.slice(0,3).map(x=>x.textContent));
 assert.deepEqual(first,['فاتورة 101 ج','فاتورة 100 ج','فاتورة 103 ج'],'newest first (by time, then number)');
 assert.equal(await page.$$eval('.ac-mv',e=>e.length),100,'a hundred at a time');
 // a long list: the tabs stay pinned at the top while he scrolls; «اعرض أقدم» is at the end of the page
 await page.evaluate(()=>window.scrollTo(0,1500));
 const stuck=await page.$eval('.ac-tabs',e=>Math.round(e.getBoundingClientRect().top));assert.equal(stuck,0,'the tabs stay at the top of the screen');
 assert.ok(await page.isVisible('.ac-tab[data-acct-filter="home"]'));
 await page.click('[data-acct-older]');await page.waitForFunction(()=>document.querySelectorAll('.ac-mv').length===130);
 // «المشتريات»: sales only, from the top; «المدفوعات»: payments only, from the top
 await page.evaluate(()=>window.scrollTo(0,900));
 await page.click('[data-acct-filter="sales"]');
 assert.equal(await scrollY(page),0);
 const kinds=await page.$$eval('.ac-mv .ac-k',e=>e.map(x=>x.textContent));
 assert.ok(kinds.length>60&&kinds.every(k=>/^فاتورة /.test(k)),'only invoices: '+kinds.slice(0,3));
 await page.evaluate(()=>window.scrollTo(0,900));
 await page.click('[data-acct-filter="payments"]');
 assert.equal(await scrollY(page),0);
 const pays=await page.$$eval('.ac-mv .ac-k',e=>e.map(x=>x.textContent));assert.ok(pays.length>30&&pays.every(k=>/^دفعة /.test(k)),'only payments');
 // an invoice opens its items in place, and the page is still the same page
 await page.click('[data-acct-filter="sales"]');await page.click('[data-acct-items]');
 assert.ok(await page.$('.ac-items > div'));
 // back to the home: the balance card and the buttons again, short
 await page.click('[data-acct-filter="home"]');
 assert.equal(await scrollY(page),0);assert.equal(await text(page,'.ac-big'),'عليك 7,174.50 ج');assert.equal(await page.$('.ac-mv'),null);
 const homeH2=await page.evaluate(()=>document.getElementById('acctBox').getBoundingClientRect().height);
 assert.equal(Math.round(homeH2),Math.round(homeH),'the home is as short as before: his history never makes it long');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no sideways scroll at 375 px');
},{home:true});

run('Account app: the tabs are in English too, the pharmacy\'s look shows them, an order from the home still works, a refresh or a new data draw keeps the tab he is on',async({page,base})=>{
 await page.addInitScript(()=>{try{localStorage.setItem('asker-lang','en')}catch(e){}});
 await open(page,base);
 assert.deepEqual((await tabs(page)).map(t=>t[0]),['Home','All','Purchases','Payments']);
 await page.click('[data-acct-filter="payments"]');await page.waitForSelector('.ac-mv');
 assert.match(await text(page,'.ac-mini'),/You owe 7,174.50/);
 assert.match(await text(page,'.ac-mv'),/Payment/);
 // a draw that is not his tap (the pictures arrive, the data refreshes) stays on his tab
 await page.evaluate(()=>window.AskerStoreAccount.refresh());await page.waitForTimeout(600);
 assert.deepEqual((await tabs(page)).map(t=>t[1]),['false','false','false','true'],'still on «Payments»');
 await page.click('[data-acct-filter="home"]');
 assert.ok(await page.$('.ac-order'));
});