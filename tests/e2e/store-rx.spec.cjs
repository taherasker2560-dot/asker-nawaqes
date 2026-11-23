// «📋 ابعت الروشتة» on the customer's account and «💳 ادفع حسابك» right under the amount (owner 2026-11-18: «خدمة الدفع المفروض تبقى تحت المبلغ كده، وحلوة … ومكان مخصص للعميل يبعت الروشتة على الصفحة عشان القراءة
// الأوتوماتيك … وبعدين نبقى نخليها على الواتس. بس حاليا اعملها تتبعت على الصفحة»). The server's answers are faked; made-up customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const TOK='c'.repeat(64);
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:7174.5,last_at:'2026-11-17T11:00:00',last_kind:'sale',moves:1}];
const MOVES=[{id:13,customer_id:101,at:'2026-11-17T11:00:00',kind:'sale',total:207.8,paid:0,balance:7174.5,items:[{n:'OMEZ 40 20 CAP',p:1,u:0,k:1,s:207.8,d:0}]}];
const INFO={vodafone:'01012345678',instapay:'asker@instapay',whatsapp:'01003032931'};
const setup=(page,info,lang)=>page.addInitScript(([info,lang])=>{try{if(lang)localStorage.setItem('asker-lang',lang)}catch(e){}window.__fakeRpcs={ar_store_pay_info:()=>info}},[info===undefined?INFO:info,lang||'']);
const seed=(page,balance)=>page.evaluate(([c,m,t,b])=>{const cc=JSON.parse(JSON.stringify(c));cc[0].balance=b;localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:cc,ar_customer_moves:m,ar_customer_phones:[{customer_id:101,phone:'201001112223'}],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[],ar_store_orders:[],ar_chats:[],ar_chat_messages:[],ar_chat_push:[]}))},[CUSTOMERS,MOVES,TOK,balance===undefined?7174.5:balance]);
const open=async(page,base,sel,balance)=>{await page.setViewportSize({width:375,height:812});await seed(page,balance);await page.goto(base+'store.html?o='+Math.random().toString(36).slice(2,8)+'#me='+TOK);await page.waitForSelector(sel||'[data-view="account"]:not([hidden]) .ac-bal');};
const png=(n)=>({name:'rx'+n+'.jpg',mimeType:'image/jpeg',buffer:Buffer.from('fake-image-'+n)});

run('Prescription: a tile on his account opens a page of its own; photos, his number, a note; it goes as an order with the photos, and «طلباتي» shows it',async({page,base})=>{
 await setup(page);
 await open(page,base,'.ac-rx-tile');
 assert.equal(await text(page,'.ac-rx-tile b'),'📋 ابعت الروشتة');assert.equal(await text(page,'.ac-rx-tile small'),'صوّرها واحنا نقراها ونكلمك بالأسعار');
 // the second of the four big buttons, right after «اطلب» (owner 2026-11-23)
 assert.equal(await page.evaluate(()=>{const t=document.querySelector('.ac-rx-tile');return t.parentElement.classList.contains('ac-g4')&&t.previousElementSibling.classList.contains('ac-order')}),true);
 await page.click('.ac-rx-tile');await page.waitForSelector('#rxSheet');
 assert.equal(await text(page,'#rxSheet .rg-top b'),'ابعت الروشتة');
 assert.match(await text(page,'#rxSheet .rg-hint'),/لحد 4 صور/);
 assert.equal(await page.inputValue('#rxsPhone'),'01001112223','his saved number, as he writes it');
 // nothing to send yet
 await page.click('[data-rxs-send]');await page.waitForSelector('#rxSheet .al-warn');assert.equal(await text(page,'#rxSheet .al-warn'),'ضيف صورة الروشتة الأول.');
 // two photos, one removed, one more
 await page.setInputFiles('#rxsFile',[png(1),png(2)]);await page.waitForFunction(()=>document.querySelectorAll('#rxSheet .rx-thumb').length===2);
 await page.click('[data-rxs-remove="0"]');assert.equal(await page.$$eval('#rxSheet .rx-thumb',e=>e.length),1);
 assert.equal(await text(page,'#rxSheet .rx-pick'),'＋ زوّد صورة تانية');
 await page.setInputFiles('#rxsFile',[png(3)]);await page.waitForFunction(()=>document.querySelectorAll('#rxSheet .rx-thumb').length===2);
 // a fifth is refused quietly: four at most
 await page.setInputFiles('#rxsFile',[png(4),png(5),png(6)]);await page.waitForFunction(()=>document.querySelectorAll('#rxSheet .rx-thumb').length===4);
 assert.equal(await page.$('#rxSheet .rx-pick'),null,'four photos: no more picker');
 await page.click('[data-rxs-remove="3"]');await page.click('[data-rxs-remove="2"]');assert.equal(await page.$$eval('#rxSheet .rx-thumb',e=>e.length),2);
 await page.fill('#rxsNote','عايز البديل الأرخص');
 await page.click('[data-rxs-send]');await page.waitForSelector('#rxSheet .rxs-done');
 assert.equal(await text(page,'#rxSheet .rxs-done h2'),'وصلتنا الروشتة ✓');assert.match(await text(page,'#rxSheet .rxs-done p b'),/طلب رقم \d+/);
 // what the server got: an order of this customer with NO items, two photos in the private place, to be picked up at the pharmacy, on his account (he is not stopped)
 const o=await page.evaluate(()=>window.__tables.ar_store_orders.slice(-1)[0]);
 assert.deepEqual([o.items.length,o.customer_id,o.phone,o.address,o.pay],[0,101,'01001112223','استلام من الصيدلية','account']);
 assert.equal(await page.evaluate(()=>Object.keys(window.__storage).filter(k=>/^rx\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{20,40}\.jpg$/.test(k)).length),2,'two photos uploaded under rx/<day>/<random>.jpg');
 // «طلباتي»: the page keeps it as an order with a prescription
 const mine=await page.evaluate(()=>JSON.parse(localStorage.getItem('asker_store_orders')));assert.equal(mine.length,1);assert.deepEqual([mine[0].items.length,mine[0].phone],[0,'01001112223']);
 // another one, or close
 await page.click('[data-rxs-again]');await page.waitForSelector('#rxsFile');assert.equal(await page.$$eval('#rxSheet .rx-thumb',e=>e.length),0,'a clean page');
 await page.click('#rxSheet [data-rxs-close]');await page.waitForFunction(()=>!document.getElementById('rxSheet'));
 await page.click('[data-view="account"] a[href="#orders"],nav a[href="#orders"]');
 await page.waitForSelector('#ordersList .order');assert.match(await text(page,'#ordersList'),/طلب بالروشتة/);
},{home:true});

run('Prescription: the phone number is checked, a failing server shows its words, and the pharmacy\'s own phone (the owner\'s look) shows the tile but sends nothing',async({page,base})=>{
 await setup(page);
 await open(page,base,'.ac-rx-tile');
 await page.click('.ac-rx-tile');await page.waitForSelector('#rxSheet');
 await page.setInputFiles('#rxsFile',[png(1)]);await page.waitForSelector('#rxSheet .rx-thumb');
 await page.fill('#rxsPhone','123');await page.click('[data-rxs-send]');await page.waitForSelector('#rxSheet .al-warn');
 assert.equal(await text(page,'#rxSheet .al-warn'),'رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01');assert.equal(await page.$('#rxSheet .rxs-done'),null);
 assert.equal(await page.$$eval('#rxSheet .rx-thumb',e=>e.length),1,'the photo stays: he fixes the number and sends again');
 // the phone's back button closes the page
 await page.goBack();await page.waitForFunction(()=>!document.getElementById('rxSheet'));
 // the owner's look: nothing to send from there
 await page.evaluate(()=>{localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{}');sessionStorage.clear();localStorage.removeItem('asker_store_customer')});
 await page.goto(base+'store.html?look=1#me='+TOK);await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 assert.ok(await page.$('.ac-rx-tile'),'he sees what the customer sees');assert.ok(await page.$('.ac-fb-tile'));
 await page.click('.ac-rx-tile');await page.waitForSelector('#rxSheet');await page.setInputFiles('#rxsFile',[png(1)]);await page.waitForSelector('#rxSheet .rx-thumb');
 await page.click('[data-rxs-send]');await page.waitForSelector('#rxSheet .al-warn');
 assert.equal(await text(page,'#rxSheet .al-warn'),'ده شكل الصفحة زي ما العميل بيشوفها. الإرسال من موبايل الصيدلية مش شغال.');
 assert.equal(await page.evaluate(()=>(window.__tables.ar_store_orders||[]).length),0,'nothing was sent');assert.equal(await page.evaluate(()=>Object.keys(window.__storage).filter(k=>k.startsWith('rx/')).length),0,'and nothing uploaded');
 await page.evaluate(()=>localStorage.removeItem('sb-qwrzdjdgvanmhaicncuk-auth-token'));
},{home:true});

run('Pay: «ادفع حسابك» sits right under the amount he owes (only then), with the ways to pay under it; it opens the same payment page',async({page,base})=>{
 await setup(page);
 await open(page,base);
 assert.equal(await page.evaluate(()=>document.querySelector('.ac-bal .ac-big').nextElementSibling.classList.contains('ac-paybtn')),true,'the very next thing under the amount');
 assert.equal(await text(page,'.ac-bal .ac-paybtn b'),'💳 ادفع حسابك');assert.equal(await text(page,'.ac-bal .ac-paybtn small'),'فودافون كاش · إنستا باي');
 assert.equal(await page.$$eval('.ac-paybtn',e=>e.length),1,'one pay button, not a second one further down');
 assert.equal(await page.evaluate(()=>!!document.querySelector('.ac-bal .ac-paybtn').closest('.ac-bal')),true);
 await page.click('.ac-bal .ac-paybtn');await page.waitForSelector('.pay-sheet');
},{home:true});
run('Pay: nothing owed (he is even or ahead) = no pay button',async({page,base})=>{
 await setup(page);
 await open(page,base,undefined,-300);assert.equal(await page.$('.ac-paybtn'),null,'he does not owe: no pay button');
},{home:true});
run('Pay: no payment numbers set = no button; in English too',async({page,base})=>{
 await setup(page,null);
 await open(page,base);assert.equal(await page.$('.ac-paybtn'),null);
},{home:true});
run('Prescription and pay in English',async({page,base})=>{
 await setup(page,undefined,'en');
 await open(page,base,'.ac-rx-tile');
 assert.equal(await text(page,'.ac-rx-tile b'),'📋 Send the prescription');
 assert.equal(await text(page,'.ac-bal .ac-paybtn small'),'Vodafone Cash · InstaPay');assert.match(await text(page,'.ac-bal .ac-paybtn b'),/Pay your balance/);
 await page.click('.ac-rx-tile');await page.waitForSelector('#rxSheet');
 assert.equal(await text(page,'#rxSheet .rg-top b'),'Send the prescription');
 assert.equal(await page.getAttribute('#rxsNote','placeholder'),'e.g. I want the cheaper alternative');
 assert.equal(await text(page,'[data-rxs-send]'),'📤 Send the prescription');
 assert.equal(await page.evaluate(()=>/[؀-ۿ]/.test(document.getElementById('rxSheet').innerText)),false,'nothing Arabic left in the page');
 await page.setInputFiles('#rxsFile',[png(1)]);await page.waitForSelector('#rxSheet .rx-thumb');await page.click('[data-rxs-send]');await page.waitForSelector('#rxSheet .rxs-done');
 assert.equal(await text(page,'#rxSheet .rxs-done h2'),'We got your prescription ✓');assert.match(await text(page,'#rxSheet .rxs-done p b'),/^Order no\. \d+$/);
},{home:true});
