// The customer's personal link (owner 2026-11-13, IDEAS row 1; his answers: account and ordering together, «موقوف» = his
// button, stopped = cash only, the others choose on account or cash, the full statement with items).
// The owner sends the link and stops/allows credit from the customer's statement; the customer opens store.html#me=<secret>
// and sees only his account, and orders on account or cash. Made-up customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const at=(d,h,m)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`;
const today=new Date(),old=new Date(Date.now()-40*864e5);
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:7174.5,last_at:at(today,11,0),last_kind:'sale',moves:3},{id:102,name:'سامية عبد الله',credit_limit:10000,balance:300,last_at:at(old,9,0),last_kind:'sale',moves:0}];
const MOVES=[
 {id:-7,customer_id:101,at:at(old,13,7),kind:'payment',total:0,paid:500,balance:6800,items:null},
 {id:11,customer_id:101,at:at(today,9,0),kind:'sale',total:166.7,paid:0,balance:6966.7,items:[{n:'PANADOL EXTRA 24 TAB',p:1,u:0,k:1,s:66.7,d:0},{n:'VITACID C 1000',p:0,u:2,k:2,s:100,d:0}]},
 {id:13,customer_id:101,at:at(today,11,0),kind:'sale',total:207.8,paid:0,balance:7174.5,items:[{n:'OMEZ 40 20 CAP',p:1,u:0,k:1,s:207.8,d:0}]},
 {id:21,customer_id:102,at:at(old,9,0),kind:'sale',total:300,paid:0,balance:300,items:[{n:'SECRET ITEM',p:1,u:0,k:1,s:300,d:0}]},
];
const PHONES=[{customer_id:101,phone:'201012345678',contact_name:null,last_sent_at:null,last_sent_from:null,updated_at:'2026-11-12T10:00:00Z'}];

run('Customer link: the owner sends the link from the statement, a new one replaces it, «وقّف الآجل» and back',async({page,table})=>{
 await page.evaluate(([c,m,p])=>{Object.assign(window.__tables,{ar_customers:c,ar_customer_moves:m,ar_customer_phones:p,ar_customer_links:[],ar_customer_stops:[]});window.__opened=[];window.open=(u)=>{window.__opened.push(u);return null}},[CUSTOMERS,MOVES,PHONES]);
 await page.click('[data-group="accounts"]');await page.waitForSelector('#cuBox:not(.hidden)');await page.click('#cuChips [data-cu-view="all"]');
 await page.click('#cuRows [data-cu="101"]');await page.waitForSelector('#cuSt:not(.hidden) [data-cu-link-send]');
 assert.match(await text(page,'#cuSt .cu-link'),/لسه ما اتبعتلوش رابط/);
 assert.equal(await page.$('[data-cu-link-new]'),null,'no «رابط جديد» before the first link');
 // the first link: made on the server, WhatsApp opens on his number with it
 await page.click('[data-cu-link-send]');
 await page.waitForFunction(()=>window.__opened.length===1);
 let opened=await page.evaluate(()=>window.__opened);
 assert.ok(opened[0].startsWith('https://wa.me/201012345678?text='));
 const msg=decodeURIComponent(opened[0].split('?text=')[1]);
 const m1=/store\.html#me=([0-9a-f]{64})\n/.exec(msg);
 assert.ok(m1,'the link is in the message: '+msg);
 assert.match(msg,/^أهلًا بحضرتك 🌿\nده رابط حسابك في صيدلية عسكر يا أحمد محمود:\n/);
 assert.match(msg,/الرابط ده ليك انت بس، ما تبعتهوش لحد\.$/);
 assert.deepEqual((await table('ar_customer_links')).map(r=>[r.customer_id,r.token]),[[101,m1[1]]]);
 await page.waitForFunction(()=>/لسه ما فتحش رابطه/.test(document.querySelector('#cuSt .cu-link')?.textContent||''));
 assert.match(await text(page,'#cuSt .cu-link'),/اتفتحت محادثته في الواتس ومعاها رابطه/);
 // the same link again: no new secret
 await page.click('[data-cu-link-send]');
 opened=await page.evaluate(()=>window.__opened);
 assert.equal(opened.length,2);assert.ok(decodeURIComponent(opened[1]).includes('#me='+m1[1]));
 // «رابط جديد»: asks first, then a new secret (the old one stops)
 page.once('dialog',d=>{assert.match(d.message(),/الرابط القديم هيبطل/);d.accept()});
 await page.click('[data-cu-link-new]');
 await page.waitForFunction(()=>window.__opened.length===3);
 const t2=(await table('ar_customer_links'))[0].token;
 assert.notEqual(t2,m1[1]);assert.ok(decodeURIComponent((await page.evaluate(()=>window.__opened))[2]).includes('#me='+t2));
 // «وقّف الآجل»: a row in ar_customer_stops, the statement and the list say so
 await page.click('[data-cu-stop]');
 await page.waitForSelector('[data-cu-unstop]');
 assert.deepEqual((await table('ar_customer_stops')).map(r=>r.customer_id),[101]);
 assert.match(await text(page,'#cuSt .cu-stopped'),/⛔ موقوف من .*: رابطه بيقوله «حسابك موقوف»، وطلباته كاش بس/);
 await page.click('[data-cu-back]');await page.waitForSelector('#cuListView:not(.hidden)');
 assert.match(await text(page,'#cuRows [data-cu="101"] strong'),/⛔/);
 assert.doesNotMatch(await text(page,'#cuRows [data-cu="102"] strong'),/⛔/);
 // «رجّع الآجل»
 await page.click('#cuRows [data-cu="101"]');await page.waitForSelector('[data-cu-unstop]');
 await page.click('[data-cu-unstop]');await page.waitForSelector('[data-cu-stop]');
 assert.equal((await table('ar_customer_stops')).length,0);
 // no number: it says to add one first (no link made)
 await page.click('[data-cu-back]');await page.waitForSelector('#cuListView:not(.hidden)');
 await page.click('#cuRows [data-cu="102"]');await page.waitForSelector('#cuSt:not(.hidden) [data-cu-link-send]');
 await page.click('[data-cu-link-send]');
 assert.match(await text(page,'#cuSt .cu-link'),/ضيف رقم الواتس بتاعه الأول/);
 assert.equal((await table('ar_customer_links')).length,1);
},{home:true});

run('Customer link: he opens it, sees only his account with the items, orders on his account; stopped = cash only',async({page,base})=>{
 const tok='c'.repeat(64);
 const seed=(stops)=>page.evaluate(([c,m,p,t,s])=>{localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:m,ar_customer_phones:p,ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:s,ar_store_orders:[]}));
  localStorage.setItem('asker_store_cart',JSON.stringify([{id:1,name:'PANADOL EXTRA 24 TAB',arabic_name:null,price:66.7,qty:1}]))},[CUSTOMERS,MOVES,PHONES,tok,stops]);
 await seed([]);
 await page.goto(base+'store.html#me='+tok);
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 // the secret leaves the address at once, and stays on the phone
 assert.equal(await page.evaluate(()=>location.hash),'#account');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_customer')),tok);
 assert.equal(await text(page,'#acctName'),'حسابك يا أحمد محمود · كود 101');
 assert.equal(await text(page,'.ac-big'),'عليك 7,174.50 ج');
 assert.equal(await page.$('.ac-stop'),null,'not stopped');
 assert.match(await text(page,'.ac-order'),/اطلب من الصيدلية/);
 // his movements only, newest first, the items open on a tap
 const titles=await page.$$eval('.ac-k',e=>e.map(x=>x.textContent));
 assert.deepEqual(titles,['فاتورة 207.80 ج','فاتورة 166.70 ج','دفعة 500 ج']);
 assert.doesNotMatch(await text(page,'#acctBox'),/SECRET ITEM|سامية/);
 await page.click('[data-acct-items="11"]');
 assert.deepEqual(await page.$$eval('.ac-items > div',r=>r.map(d=>[...d.children].map(s=>s.textContent).join(' | '))),['PANADOL EXTRA 24 TAB | 1 علبة · 66.70','VITACID C 1000 | 2 وحدة · 100']);
 await page.click('[data-acct-filter="payments"]');
 assert.deepEqual(await page.$$eval('.ac-k',e=>e.map(x=>x.textContent)),['دفعة 500 ج']);
 // «حسابي» in the tabs and on the home
 assert.ok(await page.isVisible('.tabbar a[data-go="account"]'));
 // day by default; the customer chooses night, colors and language himself from «حسابي» too (owner: «براحته»)
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('night')),false,'day by default');
 await page.click('[data-view="account"] [data-theme-open]');
 await page.waitForSelector('#themeSheet:not([hidden])');
 await page.check('#themeNight');
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('night')),true);
 await page.uncheck('#themeNight');
 await page.click('#themeClose');
 await page.waitForSelector('#themeSheet[hidden]',{state:'attached'});
 // installing on his phone: the page's manifest is his own (the icon opens on his account); no install offer here = the steps
 const mf=await page.evaluate(async()=>{const h=document.querySelector('link[rel="manifest"]').href;return {blob:h.startsWith('blob:'),m:await (await fetch(h)).json()}});
 assert.ok(mf.blob,'his own manifest');assert.equal(mf.m.start_url,base+'store.html#me='+tok);assert.equal(mf.m.display,'standalone');
 await page.click('[data-acct-install]');
 // Chrome with no offer yet: it waits a moment (still inside the tap), then the steps
 await page.waitForSelector('.ac-install-note',{timeout:8000});
 assert.match(await text(page,'.ac-install-note'),/دوس ⋮ فوق في كروم، وبعدين «تثبيت التطبيق»/);
 // Chrome offers to install: one tap
 await page.evaluate(()=>{const e=new Event('beforeinstallprompt');e.prompt=()=>{window.__prompted=true};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e)});
 await page.click('[data-acct-install]');
 await page.waitForFunction(()=>window.__prompted===true);
 await page.waitForFunction(()=>/اتنزّل/.test(document.querySelector('.ac-install-note')?.textContent||''));
 // the order: his name from the pharmacy (no name box), his number filled, on his account by default
 await page.goto(base+'store.html#cart');
 await page.waitForSelector('#payBox:not([hidden]) input[value="account"]');
 assert.ok(await page.isHidden('#cName'));
 assert.equal(await page.inputValue('#cPhone'),'01012345678');
 assert.ok(await page.isChecked('#payBox input[value="account"]'));
 await page.fill('#cAddr','شارع التجربة 12');
 await page.click('#sendBtn');
 await page.waitForSelector('[data-view="done"]:not([hidden])');
 const w=await page.evaluate(()=>window.__fakeWrites.filter(x=>x.rpc==='ar_customer_place_order').map(x=>x.args));
 assert.equal(w.length,1);assert.equal(w[0].p_token,tok);assert.equal(w[0].p_pay,'account');assert.equal(w[0].p_name,undefined);
 assert.equal(await text(page,'#donePay'),'الطلب هيتحط على حسابك في الصيدلية');
 // the owner stopped him: the page says so, and the order is cash only
 await seed([{customer_id:101}]);
 await page.goto(base+'store.html#account');await page.reload();
 await page.waitForSelector('.ac-stop');
 assert.equal(await text(page,'.ac-stop strong'),'⛔ حسابك موقوف دلوقتي');
 assert.match(await text(page,'.ac-stop span'),/^تقدر تطلب عادي، والدفع كاش عند الاستلام/);
 assert.match(await text(page,'.ac-order'),/اطلب \(كاش عند الاستلام\)/);
 await page.goto(base+'store.html#cart');
 await page.waitForSelector('#payBox:not([hidden]) input[value="cash"]');
 assert.ok(await page.isDisabled('#payBox input[value="account"]'));
 assert.ok(await page.isChecked('#payBox input[value="cash"]'));
 await page.fill('#cAddr','شارع التجربة 12');
 await page.click('#sendBtn');
 await page.waitForSelector('[data-view="done"]:not([hidden])');
 const w2=await page.evaluate(()=>window.__fakeWrites.filter(x=>x.rpc==='ar_customer_place_order').map(x=>x.args.p_pay));
 assert.deepEqual(w2,['cash']);
 assert.equal(await text(page,'#donePay'),'الدفع كاش عند الاستلام');
 // sent over from another browser to Chrome by the install button (?me=…&install=1): the same account, the secret leaves
 // the address, and the big button asks for the last tap; the offer comes a moment later and that tap installs
 await page.evaluate(()=>localStorage.removeItem('asker_store_customer'));
 await page.goto(base+'store.html?me='+tok+'&install=1');
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 assert.deepEqual(await page.evaluate(()=>[location.search,location.hash,localStorage.getItem('asker_store_customer')]),['','#account',tok]);
 assert.equal(await text(page,'[data-acct-install]'),'📲 دوسة كمان ويتثبت');
 assert.ok(await page.$('[data-acct-install].pulse'));
 await page.evaluate(()=>{window.__prompted=false;setTimeout(()=>{const e=new Event('beforeinstallprompt');e.prompt=()=>{window.__prompted=true};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e)},600)});
 await page.$eval('[data-acct-install]',b=>b.click()); // it pulses (never «stable» for a normal click)
 await page.waitForFunction(()=>window.__prompted===true,null,{timeout:8000});
 // a link that no longer works: said, and the phone forgets it
 await page.evaluate(()=>localStorage.setItem('asker_store_customer','d'.repeat(64)));
 await page.goto(base+'store.html#account');await page.reload();
 await page.waitForFunction(()=>/الرابط ده مبقاش شغال/.test(document.getElementById('acctBox')?.textContent||''));
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_customer')),null);
 assert.ok(await page.isHidden('.tabbar a[data-go="account"]'));
 assert.match(await page.evaluate(()=>document.querySelector('link[rel="manifest"]').getAttribute('href')),/^manifest-store\.json$/,'back to the store\'s own manifest');
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
},{home:true});

run('Customer link install: iPhone gets the big guide; Firefox with no Chrome (back from the hand-off) shows its steps at once',async({page,base})=>{
 const tok='c'.repeat(64);
 await page.evaluate(([c,m,t])=>localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:m,ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[]})),[CUSTOMERS,MOVES,tok]);
 // iPhone: one tap = the guide over the page, pointing at the Share button; «تمام» closes it
 await page.addInitScript(()=>{const ua=sessionStorage.getItem('__ua');if(ua)Object.defineProperty(navigator,'userAgent',{get:()=>ua})});
 await page.evaluate(()=>sessionStorage.setItem('__ua','Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'));
 await page.goto(base+'store.html#me='+tok);await page.reload();
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 await page.click('[data-acct-install]');
 await page.waitForSelector('#acctGuide');
 assert.deepEqual(await page.$$eval('#acctGuide li',l=>l.map(x=>x.textContent)),['دوس زرار المشاركة ⬆️ اللي تحت','انزل واختار «إضافة إلى الشاشة الرئيسية»','دوس «إضافة» فوق']);
 assert.equal(await page.evaluate(()=>location.hash),'#me='+tok,'Safari keeps his link in the address while he adds it');
 await page.click('[data-acct-guide-close]');
 await page.waitForSelector('#acctGuide',{state:'detached'});
 // Firefox, back from the hand-off (no Chrome on the phone): its own steps at once, no second hand-off
 await page.evaluate(()=>sessionStorage.setItem('__ua','Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0'));
 await page.goto(base+'store.html?me='+tok+'&install=1');
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-install-note');
 assert.match(await text(page,'.ac-install-note'),/^في فايرفوكس: دوس ⋮/);
 assert.equal(await text(page,'[data-acct-install]'),'📲 ثبّت التطبيق الآن');
 await page.evaluate(()=>{sessionStorage.removeItem('__ua');localStorage.removeItem('__fakeTables')});
},{home:true});
