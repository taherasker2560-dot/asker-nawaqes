// «اللي باخده دايمًا» + «أدويتي المزمنة» on the customer's own page (owner 2026-11-17: «زرارين كده، كل زرار فيهم بيان بالأصناف … وزرار تاني بيان بالأصناف بتاعة
// المزمن وتحذيراتها اللي احنا عاملينها في الصفحة لينا، تبقى باينة عندهم هنا»). The server's answer is faked; made-up customers and items only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const day=(n)=>{const d=new Date(Date.now()-n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const today=new Date();
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:1240,last_at:`${day(0)}T11:00:00`,last_kind:'sale',moves:1}];
const MOVES=[{id:13,customer_id:101,at:`${day(0)}T11:00:00`,kind:'sale',total:207.8,paid:0,balance:1240,items:[{n:'OMEZ 40 20 CAP',p:1,u:0,k:1,s:207.8,d:0}]}];
const tok='c'.repeat(64);
// the rows the server sends for this customer (item 5 was bought again today on his statement: not late any more)
const ROWS=[
 {i:11,n:'LACTEVENOR 35TAB',ar:'لاكتيفينور ٣٥ قرص',gap:33,times:4,q:1,last:day(46),avail:true},
 {i:12,n:'XANPRAZAN 20 TAB',ar:'زانبرازان ٢٠ قرص',gap:28,times:5,q:1,last:day(36),avail:true},
 {i:13,n:'EZAPRIL-CO 72 TAB',ar:'ايزابريل كو ٧٢ قرص',gap:38,times:4,q:1,last:day(36),avail:true},
 {i:14,n:'SYRING 3 CM',ar:'سرنجة ٣ سم',gap:43,times:4,q:7,last:day(34),avail:false},
 {i:15,n:'OMEZ 40 20 CAP',ar:'اوميز ٤٠ ٢٠ كبسولة',gap:30,times:4,q:0.5,last:day(45),avail:true},
 {i:16,n:'NO ARABIC NAME 10 TAB',ar:null,gap:20,times:4,q:1,last:day(9),avail:true},
];
// the server's answer for «ar_customer_regular_view» lives in localStorage (__regular) so it survives a reload; null = the function is not there
const setup=(page,regular)=>page.addInitScript(([regular])=>{
 try{if(regular!==undefined&&!localStorage.getItem('__regularSet')){localStorage.setItem('__regular',JSON.stringify(regular));localStorage.setItem('__regularSet','1')}}catch(e){}
 window.__fakeRpcs={ar_store_pay_info:()=>null,ar_customer_regular_view:()=>{try{return JSON.parse(localStorage.getItem('__regular'))}catch(e){return null}}};
},[regular]);
const answer=(page,v)=>page.evaluate((v)=>localStorage.setItem('__regular',JSON.stringify(v)),v);
const seed=(page)=>page.evaluate(([c,m,t])=>localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:m,ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[],ar_store_orders:[]})),[CUSTOMERS,MOVES,tok]);
const openAccount=async(page,base)=>{await page.setViewportSize({width:375,height:812});await seed(page);await page.goto(base+'store.html#me='+tok);await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');};

run('Customer regular items: two buttons with the counts, the list of what he takes, the chronic list with its dates, and the way back',async({page,base})=>{
 await setup(page,{ok:true,rows:ROWS,at:new Date().toISOString()});
  await openAccount(page,base);
 await page.waitForSelector('.ac-reg-two');
 assert.deepEqual(await page.$$eval('.ac-reg-btn b',e=>e.map(x=>x.textContent)),['🧾 اللي باخده دايمًا','💊 أدويتي المزمنة']);
 assert.deepEqual(await page.$$eval('.ac-reg-btn small',e=>e.map(x=>x.textContent)),['6 أصناف على حسابي','ميعادين عدّوا'],'6 items; 2 late (the OMEZ he bought today does not count)');
 assert.equal(await text(page,'.ac-reg-dot'),'2');
 // the buttons come right after «كرّر دواك بالباركود», before the PDF row
 assert.equal(await page.evaluate(()=>{const b=document.querySelector('.ac-reg-two');return b.previousElementSibling.classList.contains('ac-scan')&&b.nextElementSibling.classList.contains('ac-row')}),true);
 // the list of what he takes: the nearest next refill first, Arabic name with the English under it, the pills
 await page.click('[data-reg-open="usual"]');
 await page.waitForSelector('#regSheet .rg-it');
 assert.equal(await text(page,'#regSheet .rg-top b'),'اللي باخده دايمًا');
 const names=await page.$$eval('#regSheet .rg-it .rg-main > b',e=>e.map(x=>x.textContent));
 assert.deepEqual(names,['لاكتيفينور ٣٥ قرص','زانبرازان ٢٠ قرص','ايزابريل كو ٧٢ قرص','سرنجة ٣ سم','NO ARABIC NAME 10 TAB','اوميز ٤٠ ٢٠ كبسولة'],'the nearest next refill first');
 assert.equal(await text(page,'#regSheet .rg-it:first-of-type .rg-en'),'LACTEVENOR 35TAB');
 assert.equal(await page.$$eval('#regSheet .rg-it',e=>e.filter(x=>/NO ARABIC/.test(x.textContent)&&x.querySelector('.rg-en')).length),0,'no second line when there is no Arabic name');
 const first=await text(page,'#regSheet .rg-it:first-of-type .rg-pills');
 assert.match(first,/بتاخده كل 33 يوم تقريبًا/);assert.match(first,/آخر مرة من 46 يوم/);assert.match(first,/أخدت 1 علبة/);assert.match(first,/متوفر/);
 const syr=await page.$$eval('#regSheet .rg-it',e=>e.map(x=>x.textContent).find(t=>/سرنجة/.test(t)));
 assert.doesNotMatch(syr,/متوفر/,'not available: no pill');assert.match(syr,/أخدت 7 علبة/);
 assert.match(await text(page,'#regSheet'),/آخر مرة النهارده/,'his own statement shows OMEZ today');
 // no pharmacy-only things
 assert.doesNotMatch(await text(page,'#regSheet'),/عندك \d|خلص من عندك|رسالة|خلصنا/);
 // the arrow closes it
 await page.click('[data-reg-close]');
 await page.waitForSelector('#regSheet',{state:'detached'});
 // the chronic list: the warning, then the late ones, the soon one, the on-time ones; the on-time ones are quieter
 await page.click('[data-reg-open="chron"]');
 await page.waitForSelector('#regSheet .rg-warn');
 assert.equal(await text(page,'#regSheet .rg-top b'),'أدويتي المزمنة');
 assert.match(await text(page,'#regSheet .rg-warn'),/فيه أدوية ميعاد علبتها الجاية عدّى/);
 assert.deepEqual(await page.$$eval('#regSheet .rg-grp',e=>e.map(x=>x.textContent)),['ميعادها عدّى','قرّب ميعادها','في معادها']);
 const pills=await page.$$eval('#regSheet .rg-pill.late, #regSheet .rg-pill.soon',e=>e.map(x=>x.className.replace('rg-pill ','')+':'+x.textContent));
 assert.deepEqual(pills,['late:ميعاده عدّى من 13 يوم','late:ميعاده عدّى من 8 أيام','soon:باقي يومين']);
 assert.equal(await page.$$eval('#regSheet .rg-it.rg-quiet',e=>e.length),3);
 assert.match(await text(page,'#regSheet'),/الجاي بعد 9 أيام/);
 // the phone's own back button closes it too (not the page behind)
 await page.goBack();
 await page.waitForSelector('#regSheet',{state:'detached'});
 assert.equal(await page.$eval('[data-view="account"]',e=>!e.hidden),true,'still on his account');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no sideways scroll at 375 px');
},{home:true});

run('Customer regular items: nothing shows with no rows, an old list, an error, a stranger\'s page, or on a visitor\'s site',async({page,base})=>{
 // no regular item: no buttons, the account is as before
 await setup(page,{ok:true,rows:[],at:new Date().toISOString()});
 await openAccount(page,base);
 await page.waitForFunction(()=>window.AskerStoreRegular&&window.AskerStoreRegular.usable!==undefined);
 await page.waitForTimeout(400);
 assert.equal(await page.$('.ac-reg-two'),null);
 // a list the laptop stopped sending (4 days old): not shown (its «late» would be wrong)
 await answer(page,{ok:true,rows:ROWS,at:new Date(Date.now()-4*864e5).toISOString()});
 await page.reload();await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');await page.waitForTimeout(400);
 assert.equal(await page.$('.ac-reg-two'),null,'old list: no buttons');
 // the server fails / does not have the function yet: the account is as before
 await answer(page,null);
 await page.reload();await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');await page.waitForTimeout(400);
 assert.equal(await page.$('.ac-reg-two'),null,'no answer: no buttons');
 assert.ok(await page.$('.ac-order'),'the order button is still there');
 // a visitor (no link): the site has no such buttons
 await page.evaluate(()=>{localStorage.removeItem('__fakeTables');localStorage.removeItem('asker_store_customer')});
 await page.goto(base+'store.html?x=9');await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 assert.equal(await page.$('.ac-reg-two'),null);assert.equal(await page.$('#regSheet'),null);
},{home:true});

run('Customer regular items: the English site, the night look, and the owner\'s look on the pharmacy phone show the same buttons',async({page,base})=>{
 await setup(page,{ok:true,rows:ROWS,at:new Date().toISOString()});
 await page.addInitScript(()=>{try{localStorage.setItem('asker-lang','en')}catch(e){}});
 await seed(page);
 await openAccount(page,base);
 await page.waitForSelector('.ac-reg-two');
 assert.deepEqual(await page.$$eval('.ac-reg-btn b',e=>e.map(x=>x.textContent)),['🧾 What I usually take','💊 My chronic medicines']);
 assert.deepEqual(await page.$$eval('.ac-reg-btn small',e=>e.map(x=>x.textContent)),['6 items on my account','2 are past their date']);
 await page.click('[data-reg-open="chron"]');
 await page.waitForSelector('#regSheet .rg-it');
 const t=await text(page,'#regSheet');
 assert.match(t,/Past their date/);assert.match(t,/Due 13 days ago/);assert.match(t,/Due 8 days ago/);assert.match(t,/2 days left/);assert.match(t,/Next in 9 days/);
 assert.doesNotMatch(t,/[؀-ۿ]/,'English names and English texts only');
 await page.click('[data-reg-close]');await page.waitForSelector('#regSheet',{state:'detached'});
 // the pharmacy's own phone (the bot signed in): a look at the customer's page, the same two buttons (his words: the look must show what the customer sees)
 await page.evaluate(()=>{localStorage.setItem('asker-lang','ar');localStorage.setItem('sb-abcdefgh-auth-token','{}')});
 await page.goto(base+'store.html#me='+tok);await page.reload();await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-reg-two');
 assert.ok(await page.$('#acctBox .ac-back'),'the way back to the bot is there: this is the owner\'s look');
 assert.equal(await page.$$eval('.ac-reg-btn',e=>e.length),2);
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_customer_view').map(w=>w.args.p_preview===true)),[true],'the look is not counted as the customer opening his link');
},{home:true});
