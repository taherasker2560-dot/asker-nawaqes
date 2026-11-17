// Two things the owner asked for on 2026-11-17:
// 1) «لما أبعت رابط الموقع لحد يعرف يثبته هو، حتى لو هو مش عميل»: the site's home box installs for ANY visitor on every phone (not only a customer with his link);
// 2) «أوبشن للدفع جوه الموقع وجوه الرابط بتاع العملاء … فودافون كاش … انستا باي»: in the cart and in the customer's account, from the numbers the pharmacy
//    typed in the bot (the function ar_store_pay_info). Made-up numbers and customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const UAS={
 chrome:'Mozilla/5.0 (Linux; Android 14; SM-A566B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
 samsung:'Mozilla/5.0 (Linux; Android 14; SM-A566B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
 firefox:'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
 ios:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
const INFO={vodafone:'01012345678',instapay:'asker@instapay',whatsapp:'01003032931'};
const PLACED={ok:true,order_id:5,total:66.7,items:[{id:1,name:'PANADOL EXTRA 24 TAB',qty:1,price:66.7,line_total:66.7}],rx:0};
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:7174.5,last_at:'2026-11-17T11:00:00',last_kind:'sale',moves:1}];
const MOVES=[{id:13,customer_id:101,at:'2026-11-17T11:00:00',kind:'sale',total:207.8,paid:0,balance:7174.5,items:[{n:'OMEZ 40 20 CAP',p:1,u:0,k:1,s:207.8,d:0}]}];
const tok='c'.repeat(64);
// the browser's name and the fake server's answers, set before the page's own scripts run
const setup=(page,ua,rpcs)=>page.addInitScript(([ua,info,placed])=>{
 if(ua)Object.defineProperty(navigator,'userAgent',{get:()=>ua});
 window.__fakeRpcs={ar_store_pay_info:()=>info,ar_store_place_order:()=>placed};
},[ua,rpcs===undefined?INFO:rpcs,PLACED]);
const seedCart=(page)=>page.evaluate(()=>localStorage.setItem('asker_store_cart',JSON.stringify([{id:1,name:'PANADOL EXTRA 24 TAB',arabic_name:null,price:66.7,qty:1}])));
const seedCustomer=(page)=>page.evaluate(([c,m,t])=>localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:m,ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[],ar_store_orders:[]})),[CUSTOMERS,MOVES,tok]);

run('Install for anyone: the home box shows to a visitor on every phone and does what that phone needs; a customer and a computer without an offer do not get it',async({page,base})=>{
 // an iPhone (no browser installs by itself): the box is there, the tap opens the 3-tap guide
 await setup(page,UAS.ios,INFO);
 await page.goto(base+'store.html?x=1');
 await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 await page.waitForSelector('#installBox:not([hidden])');
 assert.equal(await text(page,'#installBtn'),'📲 ثبّته');
 await page.click('#installBtn');
 await page.waitForSelector('#acctGuide');
 assert.equal(await page.$$eval('#acctGuide li',l=>l.length),3);
 await page.click('[data-acct-guide-close]');
 await page.waitForSelector('#acctGuide',{state:'detached'});
 // sent over from another browser to Chrome (?install=1, no link): the address is cleaned, the box asks for the last tap, and the offer that comes then installs
 await page.goto(base+'store.html?install=1');
 await page.reload();
 await page.waitForSelector('#installBox:not([hidden])');
 assert.deepEqual(await page.evaluate(()=>[location.search,location.hash]),['','']);
 // Firefox with no Chrome to go to (the fallback page): its own steps, in the box
 await page.goto(base+'store.html?x=2');
 await page.waitForSelector('#installBox:not([hidden])');
},{home:true});
run('Install for anyone: Firefox gets its steps back from the hand-off, Chrome installs on its offer, a customer has his own button, a computer needs an offer',async({page,base})=>{
 await page.addInitScript(()=>{const ua=sessionStorage.getItem('__ua');if(ua)Object.defineProperty(navigator,'userAgent',{get:()=>ua});window.__fakeRpcs={ar_store_pay_info:()=>null}});
 // Firefox arriving with ?install=1 (Chrome was not on the phone): the steps show in the box
 await page.evaluate(([ua])=>sessionStorage.setItem('__ua',ua),[UAS.firefox]);
 await page.goto(base+'store.html?install=1');
 await page.waitForSelector('#installBox:not([hidden]) #installNote:not([hidden])');
 assert.match(await text(page,'#installNote'),/في فايرفوكس: دوس ⋮/);
 assert.equal(await page.evaluate(()=>location.search),'','?install=1 leaves the address');
 // Chrome: its offer, one tap
 await page.evaluate(([ua])=>sessionStorage.setItem('__ua',ua),[UAS.chrome]);
 await page.goto(base+'store.html?x=5');
 await page.waitForSelector('#installBox:not([hidden])');
 await page.evaluate(()=>{window.__prompted=false;const e=new Event('beforeinstallprompt');e.prompt=()=>{window.__prompted=true};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e)});
 await page.click('#installBtn');
 await page.waitForFunction(()=>window.__prompted===true,null,{timeout:8000});
 await page.waitForFunction(()=>/اتنزّل/.test(document.getElementById('installNote').textContent),null,{timeout:5000});
 // a customer with his link: the account has the install button first thing, so the home box is not shown
 await seedCustomer(page);
 await page.goto(base+'store.html#me='+tok);
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 await page.goto(base+'store.html#home');
 await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 assert.equal(await page.$eval('#installBox',e=>e.hidden),true,'a customer: his account has the button');
 // a computer (no touch, not a phone) with no offer: nothing to install from here; with the browser's offer: the box
 await page.evaluate(()=>{sessionStorage.removeItem('__ua');localStorage.removeItem('__fakeTables');localStorage.removeItem('asker_store_customer')});
 await page.goto(base+'store.html?x=6');
 await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 assert.equal(await page.$eval('#installBox',e=>e.hidden),true,'a computer with no offer: no box');
 await page.evaluate(()=>{const e=new Event('beforeinstallprompt');e.prompt=()=>{};e.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(e)});
 await page.waitForFunction(()=>!document.getElementById('installBox').hidden,null,{timeout:5000});
},{home:true});

run('Pay by transfer, a visitor: cash by default, Vodafone Cash and InstaPay from the pharmacy\'s numbers, the transfer card, the order note and the WhatsApp proof',async({page,base})=>{
 await setup(page,UAS.chrome,INFO);
 await seedCart(page);
 await page.goto(base+'store.html#cart');
 await page.waitForSelector('#payBox:not([hidden]) input[value="vodafone"]');
 assert.ok(await page.isChecked('#payBox input[value="cash"]'),'cash first');
 assert.ok(await page.$('#payBox input[value="instapay"]'));
 assert.equal(await page.$('#payBox input[value="account"]'),null,'a visitor has no «على حسابي»');
 assert.equal(await page.$('.pay-card'),null,'no card while cash is picked');
 assert.equal(await text(page,'#cashNote'),'الدفع في الصيدلية لما تستلم');
 // Vodafone Cash: the number, the whole total, the dialer link (Android), the proof link
 await page.check('#payBox input[value="vodafone"]');
 await page.waitForSelector('.pay-card[data-pay-card="vodafone"]');
 assert.equal(await text(page,'.pay-num'),'01012345678');
 assert.equal(await text(page,'.pay-amt'),'حوّل 67 ج على فودافون كاش');
 assert.equal(await page.getAttribute('.pay-card a[data-pay-open]','href'),'tel:*9*7*01012345678*67%23');
 const proof=await page.getAttribute('.pay-card a[data-pay-proof]','href');
 assert.ok(proof.startsWith('https://wa.me/201003032931?text='));
 assert.equal(decodeURIComponent(proof.split('?text=')[1]),'حوّلت 67 ج على فودافون كاش. دي صورة التحويل.');
 assert.match(await text(page,'#cashNote'),/^الدفع بتحويل فودافون كاش/);
 // copy the number
 await page.click('.pay-card [data-pay-copy]');
 await page.waitForFunction(()=>/اتنسخ/.test(document.querySelector('.pay-card [data-pay-copy]').textContent),null,{timeout:3000});
 // InstaPay: the address and a copy button; no dialer, no «open» (no ipn.eg link was typed)
 await page.check('#payBox input[value="instapay"]');
 await page.waitForSelector('.pay-card[data-pay-card="instapay"]');
 assert.equal(await text(page,'.pay-num'),'asker@instapay');
 assert.equal(await page.$('.pay-card a[data-pay-open]'),null);
 assert.match(await text(page,'.pay-how'),/افتح تطبيق إنستا باي/);
 // the order: Vodafone Cash again, the order goes with a note and says what to do next
 await page.check('#payBox input[value="vodafone"]');
 await page.fill('#cName','Ahmed');await page.fill('#cPhone','01012345678');
 await page.fill('#cNotes','عايز كيس');
 await page.click('#sendBtn');
 await page.waitForSelector('[data-view="done"]:not([hidden])');
 const w=await page.evaluate(()=>window.__fakeWrites.filter(x=>x.rpc==='ar_store_place_order').map(x=>x.args));
 assert.equal(w.length,1);assert.equal(w[0].p_notes,'عايز كيس · الدفع: تحويل فودافون كاش');assert.equal(w[0].p_address,'استلام من الصيدلية');
 assert.equal(await text(page,'#donePay'),'الدفع بتحويل فودافون كاش. بعد التحويل ابعت صورته على واتساب.');
 const dp=await page.getAttribute('#doneProof','href');
 assert.equal(decodeURIComponent(dp.split('?text=')[1]),'حوّلت 67 ج على فودافون كاش (Ahmed). دي صورة التحويل.');
 // cash: no note, no proof button
 await seedCart(page);
 await page.goto(base+'store.html#cart');await page.reload();
 await page.waitForSelector('#payBox:not([hidden]) input[value="cash"]');
 await page.fill('#cName','Ahmed');await page.fill('#cPhone','01012345678');
 await page.click('#sendBtn');
 await page.waitForSelector('[data-view="done"]:not([hidden])');
 const w2=await page.evaluate(()=>window.__fakeWrites.filter(x=>x.rpc==='ar_store_place_order').map(x=>x.args.p_notes));
 assert.deepEqual(w2,[null],'cash: no payment note (the page was reloaded, so only this order is in the list)');
 assert.equal(await page.$eval('#doneProof',e=>e.hidden),true);
 assert.equal(await page.$eval('#donePay',e=>e.hidden),true);
},{home:true});

run('Pay by transfer: an iPhone gets the app\'s name instead of a dialer; an InstaPay link opens; no numbers = no option anywhere',async({page,base})=>{
 await setup(page,UAS.ios,{vodafone:'01012345678',instapay:'https://ipn.eg/S/asker/instapay/AbC123',whatsapp:''});
 await seedCart(page);
 await page.goto(base+'store.html#cart');
 await page.waitForSelector('#payBox:not([hidden]) input[value="vodafone"]');
 await page.check('#payBox input[value="vodafone"]');
 await page.waitForSelector('.pay-card');
 assert.equal(await page.$('.pay-card a[data-pay-open]'),null,'an iPhone cannot dial a transfer code');
 assert.match(await text(page,'.pay-how'),/«أنا فودافون»/);
 assert.equal(await page.$('.pay-card a[data-pay-proof]'),null,'no WhatsApp number = no proof button');
 await page.check('#payBox input[value="instapay"]');
 await page.waitForSelector('.pay-card[data-pay-card="instapay"] a[data-pay-open]');
 assert.equal(await page.getAttribute('.pay-card a[data-pay-open]','href'),'https://ipn.eg/S/asker/instapay/AbC123');
 // nothing typed by the pharmacy: the cart is as before (no payment box for a visitor)
 await page.evaluate(()=>{localStorage.removeItem('asker_store_payinfo')});
 await page.addInitScript(()=>{window.__fakeRpcs.ar_store_pay_info=()=>({vodafone:null,instapay:null,whatsapp:'01003032931'})});
 await page.goto(base+'store.html#cart');await page.reload();
 await page.waitForSelector('#checkout:not([hidden])');
 await page.waitForTimeout(600);
 assert.equal(await page.$eval('#payBox',e=>e.hidden),true,'no number, no option');
 assert.equal(await text(page,'#cashNote'),'الدفع في الصيدلية لما تستلم');
},{home:true});

run('Pay by transfer, a customer with his link: «ادفع حسابك» with the amount he owes, both ways; a transfer order goes as cash with a note',async({page,base})=>{
 await setup(page,UAS.chrome,INFO);
 await seedCustomer(page);
 await seedCart(page);
 await page.goto(base+'store.html#me='+tok);
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 await page.waitForSelector('[data-acct-paysheet]');
 assert.equal(await text(page,'[data-acct-paysheet]'),'💳 ادفع حسابك');
 await page.click('[data-acct-paysheet]');
 await page.waitForSelector('.pay-sheet #payAmount');
 assert.equal(await page.inputValue('#payAmount'),'7175','what he owes, in whole pounds');
 assert.equal(await page.getAttribute('.pay-sheet a[data-pay-open]','href'),'tel:*9*7*01012345678*7175%23');
 await page.fill('#payAmount','100');
 assert.equal(await page.getAttribute('.pay-sheet a[data-pay-open]','href'),'tel:*9*7*01012345678*100%23','he changes the amount');
 assert.equal(await text(page,'.pay-sheet .pay-amt'),'حوّل 100 ج على فودافون كاش');
 const proof=decodeURIComponent((await page.getAttribute('.pay-sheet a[data-pay-proof]','href')).split('?text=')[1]);
 assert.equal(proof,'حوّلت 100 ج على فودافون كاش (أحمد محمود · كود 101). دي صورة التحويل.');
 await page.check('.pay-sheet input[value="instapay"]');
 await page.waitForSelector('.pay-sheet .pay-card[data-pay-card="instapay"]');
 assert.equal(await text(page,'.pay-sheet .pay-num'),'asker@instapay');
 assert.equal(await page.inputValue('#payAmount'),'100','the amount stays when he switches');
 await page.click('[data-pay-close]');
 await page.waitForSelector('.pay-sheet',{state:'detached'});
 // the cart: on account, cash, and the two transfers; a transfer goes to the server as cash (the server knows only account / cash) with a note
 await page.goto(base+'store.html#cart');
 await page.waitForSelector('#payBox:not([hidden]) input[value="account"]');
 assert.ok(await page.isChecked('#payBox input[value="account"]'));
 await page.check('#payBox input[value="instapay"]');
 await page.waitForSelector('.pay-card[data-pay-card="instapay"]');
 await page.fill('#cPhone','01012345678'); // the fake pharmacy has no saved number for him
 await page.click('#sendBtn');
 await page.waitForSelector('[data-view="done"]:not([hidden])');
 const w=await page.evaluate(()=>window.__fakeWrites.filter(x=>x.rpc==='ar_customer_place_order').map(x=>x.args));
 assert.equal(w.length,1);assert.equal(w[0].p_pay,'cash');assert.equal(w[0].p_notes,'الدفع: تحويل إنستا باي');assert.equal(w[0].p_token,tok);
 assert.equal(await text(page,'#donePay'),'الدفع بتحويل إنستا باي. بعد التحويل ابعت صورته على واتساب.');
 // no number: no button; and nothing owed: no button
 await page.addInitScript(()=>{window.__fakeRpcs.ar_store_pay_info=()=>({vodafone:null,instapay:null,whatsapp:'01003032931'})});
 await page.evaluate(()=>localStorage.removeItem('asker_store_payinfo'));
 await page.goto(base+'store.html#account');await page.reload();
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 await page.waitForTimeout(600);
 assert.equal(await page.$('[data-acct-paysheet]'),null,'no number, no «ادفع حسابك»');
},{home:true,permissions:['clipboard-read','clipboard-write']});
