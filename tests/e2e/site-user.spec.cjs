// Owner 2026-11-17: «حسابات العملاء من غير باسورد، لكن الناس اللي هتنزّل الموقع هنعمله بباسورد حتى نعرف عدد المستخدمين» + «إجباري جوه التطبيق».
// Inside the INSTALLED app a person with no customer link makes an account (name, mobile, password) before he gets in; the browser site, a customer with his
// link and the pharmacy's own phone are never asked. The server is a small stand-in kept in localStorage (the real one is migration 202611170300).
const {run,text,assert}=require('./harness.cjs');
const tok='c'.repeat(64);
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:300,last_at:'2026-11-17T11:00:00',last_kind:'sale',moves:0}];
// the page's own scripts see an installed app (display-mode: standalone) and the stand-in server
const setup=(page,{standalone=true,net=true}={})=>page.addInitScript(([standalone,net])=>{
 if(standalone){const mm=window.matchMedia.bind(window);window.matchMedia=(q)=>/display-mode:\s*standalone/.test(q)?{matches:true,media:q,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return false}}:mm(q)}
 const L=()=>JSON.parse(localStorage.getItem('__su')||'{"users":[],"sessions":{},"calls":[]}'),S=(v)=>localStorage.setItem('__su',JSON.stringify(v));
 const hex=()=>Array.from({length:64},()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join('');
 const rec=(n,a)=>{const d=L();d.calls.push({n,a});S(d)};
 window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{
  ar_store_pay_info:()=>({vodafone:null,instapay:null,whatsapp:'01003032931'}),
  ar_site_signup:(a)=>{rec('signup',a);const d=L();if(d.users.some(u=>u.phone===a.p_phone))return {ok:false,error:'exists'};const u={id:d.users.length+1,name:a.p_name,phone:a.p_phone,pw:a.p_password};d.users.push(u);const t=hex();d.sessions[t]=u.id;S(d);return {ok:true,token:t,user:{id:u.id,name:u.name,phone:u.phone}}},
  ar_site_login:(a)=>{rec('login',a);const d=L();const u=d.users.find(x=>x.phone===a.p_phone);if(!u||u.pw!==a.p_password)return {ok:false,error:'bad'};const t=hex();d.sessions[t]=u.id;S(d);return {ok:true,token:t,user:{id:u.id,name:u.name,phone:u.phone}}},
  ar_site_me:(a)=>{rec('me',a);if(!net)throw new Error('no network');const d=L();const id=d.sessions[a.p_token];const u=id&&d.users.find(x=>x.id===id);return u?{ok:true,user:{id:u.id,name:u.name,phone:u.phone}}:{ok:false,error:'session'}},
  ar_site_logout:(a)=>{rec('logout',a);const d=L();delete d.sessions[a.p_token];S(d);return {ok:true}},
  ar_site_customer_open:(a)=>{rec('customer_open',a);return {ok:true}},
 });
},[standalone,net]);
const calls=(page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('__su')||'{"calls":[]}').calls);
const reset=(page)=>page.evaluate(()=>{['__su','asker_store_user','asker_store_me','asker_store_customer','__fakeTables'].forEach(k=>localStorage.removeItem(k));Object.keys(localStorage).filter(k=>/^sb-/.test(k)).forEach(k=>localStorage.removeItem(k))});

run('Site account inside the installed app: a visitor must make an account (checks, sign up, kept across opens, a forgotten session asks again, sign in, sign out)',async({page,base})=>{
 await reset(page);await setup(page);
 await page.goto(base+'store.html?u=1');
 await page.waitForSelector('#siteGate');
 assert.equal(await text(page,'#siteGate h2'),'اعمل حسابك');
 assert.equal(await page.$('#siteGate [data-close], #siteGate .close'),null,'no way to dismiss it');
 // the page behind cannot be used: a tap on the dark part does nothing
 await page.mouse.click(200,40);
 assert.ok(await page.$('#siteGate'),'a tap outside does not close it');
 // the checks come first (the server is not asked)
 await page.click('#siteGate .sg-main');
 assert.equal(await text(page,'#sgErr'),'اكتب اسمك (حرفين على الأقل).');
 await page.fill('#sgName','أحمد محمود');await page.click('#siteGate .sg-main');
 assert.match(await text(page,'#sgErr'),/^رقم الموبايل لازم يكون 11 رقم/);
 await page.fill('#sgPhone','+20 10 1234 5678');await page.fill('#sgPw','123');await page.click('#siteGate .sg-main');
 assert.equal(await text(page,'#sgErr'),'الباسورد لازم يكون 6 حروف أو أرقام على الأقل.');
 assert.equal((await calls(page)).filter(c=>c.n==='signup').length,0,'nothing was sent yet');
 // the show / hide button
 assert.equal(await page.getAttribute('#sgPw','type'),'password');
 await page.click('[data-sg-show]');assert.equal(await page.getAttribute('#sgPw','type'),'text');
 // the forgot-password line goes to the pharmacy's WhatsApp
 assert.ok((await page.getAttribute('#siteGate .sg-fine a','href')).startsWith('https://wa.me/201003032931?text='));
 // sign up
 await page.fill('#sgPw','secret1');await page.click('#siteGate .sg-main');
 await page.waitForSelector('#siteGate',{state:'detached'});
 const su=(await calls(page)).filter(c=>c.n==='signup');
 assert.equal(su.length,1);assert.deepEqual(su[0].a,{p_name:'أحمد محمود',p_phone:'01012345678',p_password:'secret1',p_platform:'desktop',p_standalone:true});
 const kept=await page.evaluate(()=>JSON.parse(localStorage.getItem('asker_store_user')));
 assert.match(kept.t,/^[0-9a-f]{64}$/);assert.equal(kept.n,'أحمد محمود');assert.equal(kept.p,'01012345678');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker_store_me'))),{name:'أحمد محمود',phone:'01012345678'},'the checkout knows him');
 assert.equal(await text(page,'#siteUserLine'),'👤 أحمد محمود · خروج');
 // the next open: the session is checked (an «open»), no gate
 await page.reload();
 await page.waitForSelector('#siteUserLine:not([hidden])');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('__su')).calls.some(c=>c.n==='me'));
 const me=(await calls(page)).filter(c=>c.n==='me').pop().a;
 assert.equal(me.p_token,kept.t);assert.equal(me.p_event,'open');assert.equal(me.p_standalone,true);
 assert.equal(await page.$('#siteGate'),null,'signed in: no gate');
 // no network at that moment: he is not locked out because of it
 await setup(page,{net:false});
 await page.reload();await page.waitForTimeout(700);
 assert.equal(await page.$('#siteGate'),null,'no net: not locked out');
 // the pharmacy forgot this phone (the server says «session»): the gate asks again, and the dead token is gone
 await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('__su'));d.sessions={};localStorage.setItem('__su',JSON.stringify(d))});
 await setup(page);
 await page.reload();
 await page.waitForSelector('#siteGate');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_user')),null);
 // «معنديش حساب» / «عندي حساب؟ ادخل»: the same mobile again is refused, then sign in with a wrong and a right password
 await page.fill('#sgName','أحمد');await page.fill('#sgPhone','01012345678');await page.fill('#sgPw','another1');await page.click('#siteGate .sg-main');
 await page.waitForFunction(()=>/الرقم ده عنده حساب/.test(document.getElementById('sgErr')?.textContent||''));
 await page.click('[data-sg-mode]');
 assert.equal(await text(page,'#siteGate h2'),'ادخل على حسابك');
 assert.equal(await page.$('#sgName'),null,'signing in needs no name');
 assert.equal(await page.inputValue('#sgPhone'),'01012345678','the mobile he typed stays');
 await page.fill('#sgPw','wrong-one');await page.click('#siteGate .sg-main');
 await page.waitForFunction(()=>/الرقم أو الباسورد مش مظبوطين/.test(document.getElementById('sgErr')?.textContent||''));
 await page.fill('#sgPw','secret1');await page.click('#siteGate .sg-main');
 await page.waitForSelector('#siteGate',{state:'detached'});
 assert.equal((await calls(page)).filter(c=>c.n==='login').pop().a.p_standalone,true);
 // sign out: the phone forgets, the server is told, the gate comes back
 page.once('dialog',d=>d.accept());
 await page.click('#siteUserOut');
 await page.waitForSelector('#siteGate');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_user')),null);
 assert.equal((await calls(page)).filter(c=>c.n==='logout').length,1);
},{home:true});

run('Site account: not asked in the browser, a customer with his link, or the pharmacy\'s own phone; a customer who forgets his link inside the app is asked',async({page,base})=>{
 // the browser (not installed): no gate, no matter what
 await reset(page);await setup(page,{standalone:false});
 await page.goto(base+'store.html?u=2');
 await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 await page.waitForTimeout(600);
 assert.equal(await page.$('#siteGate'),null,'the browser site needs no account');
 assert.equal(await page.$eval('#siteUserLine',e=>e.hidden),true);
 // inside the installed app with a customer's link: his link is his key, the bot is told it is installed
 await page.evaluate(([c,t])=>{localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:[],ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[]}));localStorage.setItem('asker_store_customer',t)},[CUSTOMERS,tok]);
 await setup(page,{standalone:true});
 await page.goto(base+'store.html?u=3#account');
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('__su')||'{"calls":[]}').calls.some(c=>c.n==='customer_open'));
 assert.deepEqual((await calls(page)).filter(c=>c.n==='customer_open').pop().a,{p_token:tok,p_standalone:true});
 assert.equal(await page.$('#siteGate'),null,'a customer is not asked for a password');
 // he taps «مش ده حسابك؟» inside the app: from now on he is a visitor and is asked for an account
 page.once('dialog',d=>d.accept());
 await page.click('[data-acct-forget]');
 await page.waitForSelector('#siteGate');
 // the pharmacy's own phone (the bot is signed in there): never asked
 await reset(page);
 await page.evaluate(()=>localStorage.setItem('sb-abc123-auth-token','{"access_token":"x"}'));
 await page.goto(base+'store.html?u=4');
 await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 await page.waitForTimeout(600);
 assert.equal(await page.$('#siteGate'),null,'the pharmacy\'s own phone is never asked');
 await page.evaluate(()=>localStorage.removeItem('sb-abc123-auth-token'));
},{home:true});
