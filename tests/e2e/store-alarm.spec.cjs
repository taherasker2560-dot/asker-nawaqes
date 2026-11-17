// «⏰ منبه الدوا» on the customer's own page (owner 2026-11-17: «زر منبه مواعيد الأدوية» … «ينطق بالصوت، صوت جوجل عشان ما يكلفناش»). The phone's speech engine, vibration and notifications
// are replaced by small recorders; the clock is driven through AskerStoreAlarm.tick(<a date>). Made-up customers and items only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const day=(n)=>{const d=new Date(Date.now()-n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:1240,last_at:`${day(0)}T11:00:00`,last_kind:'sale',moves:1}];
const MOVES=[{id:13,customer_id:101,at:`${day(0)}T11:00:00`,kind:'sale',total:207.8,paid:0,balance:1240,items:[{n:'OMEZ 40 20 CAP',p:1,u:0,k:1,s:207.8,d:0}]}];
const tok='c'.repeat(64);
const ROWS=[
 {i:11,n:'LACTEVENOR 35TAB',ar:'لاكتيفينور ٣٥ قرص',gap:33,times:4,q:1,last:day(46),avail:true},
 {i:12,n:'XANPRAZAN 20 TAB',ar:'زانبرازان ٢٠ قرص',gap:28,times:5,q:1,last:day(36),avail:true},
];
const FAKE=([rows,perm])=>{
 window.__say=[];window.__cancel=0;window.__vib=[];window.__notes=[];window.__voices=localStorage.getItem('__novoice')?0:1;
 window.SpeechSynthesisUtterance=class{constructor(t){this.text=t}};
 window.__subs=0;window.__swReg=null;window.__sub=null;
 Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak(u){window.__say.push(u.text);setTimeout(()=>u.onstart&&u.onstart(),0)},cancel(){window.__cancel++},getVoices(){return window.__voices?[{lang:'ar-EG',name:'Arabic (Egypt)'}]:[]},addEventListener(){}}});
 Object.defineProperty(navigator,'vibrate',{configurable:true,value:(p)=>{window.__vib.push(p);return true}});
 window.Notification=class{constructor(t,o){window.__notes.push([t,o&&o.body])}};window.Notification.permission=localStorage.getItem('__perm')||perm;window.Notification.requestPermission=()=>{window.Notification.permission='granted';localStorage.setItem('__perm','granted');return Promise.resolve('granted')};
 Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register:async(url,o)=>{window.__swReg=[url,o&&o.scope];return {active:{},pushManager:{getSubscription:async()=>window.__sub,subscribe:async(opt)=>{window.__subs++;window.__subOpt=[opt.userVisibleOnly,opt.applicationServerKey&&opt.applicationServerKey.length];window.__sub={endpoint:'https://push.example/dose/'+'a'.repeat(30)};return window.__sub}}}}}});
 window.__fakeRpcs={ar_store_pay_info:()=>null,ar_customer_regular_view:()=>({ok:true,rows,at:new Date().toISOString()}),ar_dose_save:()=>({ok:true})};
};
const setup=(page,perm='default')=>page.addInitScript(FAKE,[ROWS,perm]);
const seed=(page)=>page.evaluate(([c,m,t])=>localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:m,ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[],ar_store_orders:[]})),[CUSTOMERS,MOVES,tok]);
const openAccount=async(page,base)=>{await page.setViewportSize({width:375,height:812});await seed(page);await page.goto(base+'store.html#me='+tok);await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-al-tile');};
const when=(h,m,d=17)=>`new Date(2026,10,${d},${h},${m},20)`;
const tick=(page,h,m,d)=>page.evaluate(`window.AskerStoreAlarm.tick(${when(h,m,d)}).length`);
const chips=(page)=>page.$$eval('#alarmSheet .al-card .al-chip',e=>e.map(x=>x.textContent));

run('Dose alarm: the tile under the two buttons, a new alarm from his usual medicines, the list, the toggle, edit and delete; the times stay on his phone',async({page,base})=>{
 await setup(page);
 await openAccount(page,base);
 assert.equal(await page.evaluate(()=>document.querySelector('.ac-al-wrap').previousElementSibling.classList.contains('ac-reg-two')),true,'the tile comes right after the two buttons');
 assert.equal(await text(page,'.ac-al-tile b'),'⏰ منبه الدوا');assert.equal(await text(page,'.ac-al-tile small'),'يقولك بصوته: «ميعاد دواك»');
 await page.click('[data-al-open]');await page.waitForSelector('#alarmSheet .rg-body');
 assert.equal(await text(page,'#alarmSheet .rg-top b'),'منبه الدوا');
 assert.match(await text(page,'#alarmSheet .rg-body'),/لسه مفيش منبهات/);
 // a new alarm: pick one of his usual medicines, «مرتين» is already the default
 await page.click('[data-al-new]');await page.waitForSelector('[data-al-save]');
 assert.equal(await text(page,'#alarmSheet .rg-top b'),'منبه جديد');
 assert.deepEqual(await page.$$eval('.al-picks .al-pk.notr',e=>e.map(x=>x.textContent)),['لاكتيفينور ٣٥ قرص','زانبرازان ٢٠ قرص']);
 await page.click('[data-al-save]');
 assert.match(await text(page,'#alarmSheet .al-warn'),/اكتب اسم الدوا الأول/,'no name: it asks');
 await page.click('[data-al-pick="1"]');
 assert.match(await text(page,'.al-say'),/هيقول: «ميعاد دواء زانبرازان ٢٠ قرص»/);
 assert.deepEqual(await page.$$eval('[data-al-time]',e=>e.map(x=>x.value)),['08:00','20:00']);
 await page.click('[data-al-save]');await page.waitForSelector('#alarmSheet .al-card');
 assert.deepEqual(await chips(page),['8:00 ص','8:00 م']);
 assert.equal(await text(page,'#alarmSheet .al-card b'),'زانبرازان ٢٠ قرص');
 // saved on THIS phone, and nothing was sent anywhere (the pharmacy never learns which medicines or when)
 const kept=await page.evaluate(()=>JSON.parse(localStorage.getItem('asker_dose_alarms')));
 assert.deepEqual(kept.items.map(i=>[i.name,i.say,i.times,i.on]),[['زانبرازان ٢٠ قرص','زانبرازان ٢٠ قرص',['08:00','20:00'],true]]);
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.map(w=>w.rpc||w.table).filter(x=>/dose|alarm|reminder/i.test(String(x)))),[],'nothing about the alarm reaches the server');
 // another alarm by typing a name, three times a day; then change one time
 await page.click('[data-al-new]');await page.click('[data-al-pick="other"]');await page.fill('[data-al-name]','فيتامين د');await page.click('[data-al-preset="thrice"]');
 assert.deepEqual(await page.$$eval('[data-al-time]',e=>e.map(x=>x.value)),['08:00','14:00','20:00']);
 await page.fill('[data-al-time="1"]','13:30');await page.click('[data-al-save]');await page.waitForSelector('#alarmSheet .al-card:nth-of-type(2)');
 assert.deepEqual(await chips(page),['8:00 ص','8:00 م','8:00 ص','1:30 م','8:00 م']);
 // the toggle: off = a quieter card and no more ring; the tile counts the alarms that are on
 await page.click('#alarmSheet .al-card:nth-of-type(2) [data-al-toggle]');
 assert.equal(await page.$eval('#alarmSheet .al-card:nth-of-type(2)',e=>e.classList.contains('off')),true);
 assert.equal(await tick(page,8,0),1,'only the alarm that is on rings');
 await page.click('[data-al-took]');
 // edit: tap the card, change a time, save; delete it
 await page.click('#alarmSheet .al-card:nth-of-type(1) [data-al-edit]');await page.waitForSelector('[data-al-del]');
 assert.equal(await text(page,'#alarmSheet .rg-top b'),'تعديل المنبه');
 await page.click('[data-al-rm="1"]');await page.click('[data-al-save]');await page.waitForSelector('#alarmSheet .al-card');
 assert.deepEqual((await chips(page)).slice(0,1),['8:00 ص']);
 await page.click('#alarmSheet .al-card:nth-of-type(1) [data-al-edit]');await page.click('[data-al-del]');
 await page.waitForFunction(()=>document.querySelectorAll('#alarmSheet .al-card').length===1);
 // closing: the tile says how many are on; the phone's back button closes the sheet, and the alarms are still there after a reload
 await page.click('[data-al-close]');await page.waitForSelector('#alarmSheet',{state:'detached'});
 assert.equal(await text(page,'.ac-al-tile small'),'يقولك بصوته: «ميعاد دواك»','the one left is off: the tile shows its hint');
 await page.reload();await page.waitForSelector('.ac-al-tile');
 assert.equal(await page.evaluate(()=>window.AskerStoreAlarm.data().items.length),1);
 await page.click('[data-al-open]');await page.goBack();await page.waitForSelector('#alarmSheet',{state:'detached'});
 assert.equal(await page.$eval('[data-view="account"]',e=>!e.hidden),true,'still on his account');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no sideways scroll at 375 px');
},{home:true});

run('Dose alarm: at the time the phone rings and SAYS the medicine\'s name, vibrates, the music steps aside; «خدته» closes it, «بعد 10 دقايق» comes back, never a double ring',async({page,base})=>{
 await setup(page,'granted');
 await openAccount(page,base);
 await page.evaluate(()=>{window.localStorage.setItem('asker_dose_alarms',JSON.stringify({v:1,speak:true,items:[{id:'a1',name:'زانبرازان ٢٠ قرص',say:'زانبرازان ٢٠ قرص',times:['08:00','20:00'],on:true},{id:'a2',name:'ايزابريل كو ٧٢ قرص',say:'',times:['08:00'],on:true}],snoozes:[]}))});
 await page.reload();await page.waitForSelector('.ac-al-tile');
 assert.equal(await text(page,'.ac-al-tile small'),'منبهين شغالين');
 // before the time: nothing
 assert.equal(await tick(page,7,59),0);assert.equal(await page.$('#alarmRing'),null);
 // 08:00: two alarms at once ring together, in ONE sentence
 assert.equal(await tick(page,8,0),2);
 await page.waitForSelector('#alarmRing');
 assert.equal(await text(page,'#alarmRing h2'),'⏰ ميعاد الدوا');
 assert.deepEqual(await page.$$eval('#alarmRing .al-ring-med',e=>e.map(x=>x.firstChild.textContent)),['زانبرازان ٢٠ قرص','ايزابريل كو ٧٢ قرص']);
 assert.deepEqual(await page.evaluate(()=>window.__say),['ميعاد دواء زانبرازان ٢٠ قرص، وايزابريل كو ٧٢ قرص'],'the phone says it, with its own voice');
 assert.equal(await page.evaluate(()=>window.__vib.length>=1),true,'and vibrates');
 assert.equal(await page.evaluate(()=>window.__notes.length),0,'the page is open: no extra notification');
 // the same minute again: no second ring
 assert.equal(await tick(page,8,0),0);assert.equal(await page.$$eval('#alarmRing',e=>e.length),1);
 // «خدته»: the card goes, the speech is cancelled, and it never comes back for that time
 await page.click('[data-al-took]');await page.waitForSelector('#alarmRing',{state:'detached'});
 assert.equal(await page.evaluate(()=>window.__cancel>=1),true);
 assert.equal(await tick(page,8,5),0,'rung already: not again');
 // 20:00: one alarm; «ذكّرني بعد 10 دقايق» closes it and it comes back 10 minutes later, once
 assert.equal(await tick(page,20,0),1);await page.waitForSelector('#alarmRing');
 await page.click('[data-al-snooze]');await page.waitForSelector('#alarmRing',{state:'detached'});
 assert.equal(await page.evaluate(()=>window.AskerStoreAlarm.data().snoozes.length),1);
 assert.equal(await tick(page,20,5),0,'not yet');
 assert.equal(await tick(page,20,11),1,'10 minutes later (a little after, as the clock ticks every 15 s)');await page.waitForSelector('#alarmRing');
 assert.deepEqual((await page.evaluate(()=>window.__say)).slice(-1),['ميعاد دواء زانبرازان ٢٠ قرص']);
 await page.click('[data-al-took]');assert.equal(await tick(page,20,13),0);
 // the next day it rings again
 assert.equal(await tick(page,8,1,18),2);await page.click('[data-al-took]');
 // a time that passed while the page was closed still rings for 10 minutes, then it is missed
 assert.equal(await tick(page,20,9,18),1);await page.click('[data-al-took]');
 await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('asker_dose_alarms'));d.items[0].times=['09:00'];localStorage.setItem('asker_dose_alarms',JSON.stringify(d))});
 assert.equal(await tick(page,9,11,18),0,'11 minutes late: missed');
 assert.equal(await tick(page,9,10,18),1,'10 minutes late still rings');
},{home:true});

run('Dose alarm: a hidden page gets a phone notification, the voice can be switched off and tried, no Arabic voice on the phone is said out loud',async({page,base})=>{
 await setup(page,'granted');
 await openAccount(page,base);
 await page.evaluate(()=>{localStorage.setItem('asker_dose_alarms',JSON.stringify({v:1,speak:true,items:[{id:'a1',name:'دوا الصبح',say:'',times:['08:00'],on:true}],snoozes:[]}))});
 await page.reload();await page.waitForSelector('.ac-al-tile');
 // the page is hidden (another tab, the phone's screen is off but the browser is alive): a notification with the medicine's name
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true})});
 assert.equal(await tick(page,8,0),1);
 await page.waitForFunction(()=>window.__notes.length===1);
 assert.deepEqual(await page.evaluate(()=>window.__notes),[['⏰ ميعاد دواك','دوا الصبح']]);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))});
 await page.click('[data-al-took]');
 // the voice test, and the switch: off = it rings without speaking
 await page.click('[data-al-open]');await page.waitForSelector('[data-al-try]');
 await page.click('[data-al-try]');
 assert.deepEqual((await page.evaluate(()=>window.__say)).slice(-1),['ميعاد دواء، تجربة الصوت']);
 const before=(await page.evaluate(()=>window.__say)).length;
 await page.click('[data-al-speak]');assert.equal(await page.evaluate(()=>window.AskerStoreAlarm.data().speak),false);
 await page.click('[data-al-try]');assert.equal((await page.evaluate(()=>window.__say)).length,before,'switched off: no voice');
 await page.click('[data-al-close]');
 await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('asker_dose_alarms'));d.items[0].times=['09:00'];localStorage.setItem('asker_dose_alarms',JSON.stringify(d))});
 await page.reload();await page.waitForSelector('.ac-al-tile');
 assert.equal(await tick(page,9,0),1);assert.deepEqual(await page.evaluate(()=>window.__say),[],'it rings (the card shows) without speaking');
 await page.waitForSelector('#alarmRing');await page.click('[data-al-took]');
 // a phone with no Arabic voice: the list says so
 await page.evaluate(()=>localStorage.setItem('__novoice','1'));await page.reload();await page.waitForSelector('.ac-al-tile');
 await page.click('[data-al-open]');await page.waitForSelector('#alarmSheet');
 assert.match(await text(page,'#alarmSheet .al-warn'),/موبايلك مفيهوش صوت عربي/);
 await page.click('[data-al-close]');
},{home:true});

run('Dose alarm: the pharmacy\'s own phone is a look only (kept for the tab, never rings); the English site shows English only',async({page,base})=>{
 await setup(page,'granted');
 await seed(page);
 // the owner's look: the bot is signed in on this phone
 await page.evaluate(()=>localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{}'));
 await page.setViewportSize({width:375,height:812});
 await page.goto(base+'store.html#me='+tok);await page.reload();await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-al-tile');
 await page.click('[data-al-open]');await page.waitForSelector('#alarmSheet');
 assert.match(await text(page,'#alarmSheet .rg-hint'),/ده شكل المنبه عند العميل/);
 await page.click('[data-al-new]');await page.click('[data-al-pick="0"]');await page.click('[data-al-save]');await page.waitForSelector('#alarmSheet .al-card');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_dose_alarms')),null,'not kept on the pharmacy phone');
 assert.equal(await page.evaluate(()=>!!sessionStorage.getItem('asker_dose_alarms')),true,'only for this tab');
 assert.equal(await tick(page,8,0),0,'never rings there');assert.equal(await page.$('#alarmRing'),null);
 // English: no Arabic anywhere in the alarm's own screens (the medicine's name shows in English; the phone still says the Arabic one)
 await page.evaluate(()=>{sessionStorage.clear();localStorage.removeItem('sb-qwrzdjdgvanmhaicncuk-auth-token');localStorage.setItem('asker-lang','en')});
 await page.goto(base+'store.html#me='+tok);await page.reload();await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-al-tile');
 assert.equal(await text(page,'.ac-al-tile b'),'⏰ Medicine alarm');
 await page.click('[data-al-open]');await page.waitForSelector('#alarmSheet');
 await page.click('[data-al-new]');await page.click('[data-al-pick="1"]');
 const t=await text(page,'#alarmSheet');
 assert.doesNotMatch(t.replace(/«[^»]*»/g,''),/[؀-ۿ]/,'English only (the spoken sentence in «» stays Arabic): '+t);
 assert.match(t,/XANPRAZAN 20 TAB/);assert.match(t,/Which medicine\?/);assert.match(t,/Save alarm/);
 await page.click('[data-al-save]');await page.waitForSelector('#alarmSheet .al-card');
 assert.match(await text(page,'#alarmSheet .al-card'),/8:00 AM.*8:00 PM/);assert.doesNotMatch(await text(page,'#alarmSheet'),/[؀-ۿ]/);
 assert.equal(await tick(page,8,0),1);await page.waitForSelector('#alarmRing');
 assert.equal(await text(page,'#alarmRing h2'),'⏰ Time for your medicine');assert.equal(await text(page,'[data-al-took]'),'✓ Taken');
 assert.deepEqual(await page.evaluate(()=>window.__say),['ميعاد دواء زانبرازان ٢٠ قرص'],'the phone says the Arabic name of the medicine');
},{home:true});

run('Dose alarm stage 2: turning the notifications on subscribes this phone and sends ONLY the clock times of the alarms that are on (never a name); it follows every change; the pharmacy phone sends nothing',async({page,base})=>{
 await setup(page,'default');
 await seed(page);
 await page.setViewportSize({width:375,height:812});
 await page.evaluate(()=>localStorage.setItem('asker_dose_alarms',JSON.stringify({v:1,speak:true,items:[{id:'a1',name:'زانبرازان ٢٠ قرص',say:'',times:['20:00','08:00'],on:true},{id:'a2',name:'لاكتيفينور ٣٥ قرص',say:'',times:['14:00'],on:false}],snoozes:[]})));
 await page.goto(base+'store.html#me='+tok);await page.waitForSelector('.ac-al-tile');
 const saves=()=>page.evaluate(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_dose_save').map(w=>w.args));
 assert.deepEqual(await saves(),[],'notifications not allowed yet: nothing is sent, not even the times');
 await page.click('[data-al-open]');await page.waitForSelector('[data-al-notif]');
 assert.match(await text(page,'#alarmSheet .rg-body'),/مواعيد الجرعات بس \(من غير اسم الدوا\) بتتبعت لسيرفر الصيدلية/,'it says what is sent before he agrees');
 await page.click('[data-al-notif]');
 await page.waitForFunction(()=>window.__fakeWrites.some(w=>w.rpc==='ar_dose_save'));
 assert.deepEqual(await page.evaluate(()=>window.__swReg),['store/dose/sw.js','store/dose/'],'the dose worker has its own scope (the messages keep theirs)');
 assert.deepEqual(await page.evaluate(()=>window.__subOpt),[true,65],'a visible-notification subscription with the server public key');
 let s=await saves();
 assert.deepEqual(s,[{p_endpoint:'https://push.example/dose/'+'a'.repeat(30),p_times:['08:00','20:00']}],'the address and the clock times of the alarms that are ON');
 assert.doesNotMatch(JSON.stringify(s),/[؀-ۿ]|زانبرازان|لاكتيفينور/,'no medicine name leaves the phone');
 assert.match(await text(page,'#alarmSheet .rg-body'),/الإشعارات شغالة/);
 // every change follows: the second alarm on, the first off, all off
 await page.click('#alarmSheet .al-card:nth-of-type(2) [data-al-toggle]');
 await page.waitForFunction(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_dose_save').length>=2);
 assert.deepEqual((await saves()).pop().p_times,['08:00','14:00','20:00']);
 await page.click('#alarmSheet .al-card:nth-of-type(1) [data-al-toggle]');
 await page.waitForFunction(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_dose_save').length>=3);
 assert.deepEqual((await saves()).pop().p_times,['14:00']);
 await page.click('#alarmSheet .al-card:nth-of-type(2) [data-al-toggle]');
 await page.waitForFunction(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_dose_save').length>=4);
 assert.deepEqual((await saves()).pop().p_times,[],'nothing on: the server forgets this phone');
 assert.equal(await page.evaluate(()=>window.__subs),1,'one subscription, reused');
 // a new alarm by hand is sent too
 await page.click('[data-al-new]');await page.click('[data-al-pick="other"]');await page.fill('[data-al-name]','دوا تاني');await page.click('[data-al-preset="once"]');await page.click('[data-al-save]');
 await page.waitForFunction(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_dose_save').length>=5);
 assert.deepEqual((await saves()).pop().p_times,['08:00']);
 // the next visit (permission already given): the times are sent again by themselves (the server's copy stays fresh)
 const n=(await saves()).length;await page.reload();await page.waitForSelector('.ac-al-tile');
 await page.waitForFunction(()=>window.__fakeWrites.some(w=>w.rpc==='ar_dose_save'));
 assert.deepEqual((await saves()).pop().p_times,['08:00']);void n;
},{home:true});

run('Dose alarm stage 2: the pharmacy\'s own phone sends nothing; a ring opened from a notification asks for a tap and speaks on it',async({page,base})=>{
 await setup(page,'granted');
 await seed(page);
 await page.evaluate(()=>{localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{}')});
 await page.setViewportSize({width:375,height:812});
 await page.goto(base+'store.html#me='+tok);await page.reload();await page.waitForSelector('.ac-al-tile');
 await page.click('[data-al-open]');await page.click('[data-al-new]');await page.click('[data-al-pick="0"]');await page.click('[data-al-save]');await page.waitForSelector('.al-card');
 await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_dose_save').length+window.__subs),0,'the look sends nothing and subscribes nothing');
 await page.evaluate(()=>{localStorage.removeItem('sb-qwrzdjdgvanmhaicncuk-auth-token');sessionStorage.clear()});
 // the page was opened by a tap on the notification: the browser does not allow speech before a tap, so the card asks for one, and the first tap speaks
 await page.addInitScript(()=>{window.__quiet=true});
 await page.goto(base+'store.html#me='+tok);await page.reload();await page.waitForSelector('.ac-al-tile');
 await page.evaluate(()=>{localStorage.setItem('asker_dose_alarms',JSON.stringify({v:1,speak:true,items:[{id:'a1',name:'زانبرازان ٢٠ قرص',say:'',times:['08:00'],on:true}],snoozes:[]}));
  // an engine that stays silent until a tap, like Chrome on a page nobody touched yet
  let touched=false;addEventListener('pointerdown',()=>{touched=true},true);
  speechSynthesis.speak=(u)=>{window.__say.push(u.text);if(touched)setTimeout(()=>u.onstart&&u.onstart(),0)};window.__say.length=0});
 assert.equal(await page.evaluate(`window.AskerStoreAlarm.tick(new Date(2026,10,17,8,0,20)).length`),1);
 await page.waitForSelector('#alarmRing');
 await page.waitForSelector('.al-ring-hint',{timeout:5000});
 assert.equal(await text(page,'.al-ring-hint'),'دوس في أي مكان عشان تسمع اسم الدوا');
 const before=(await page.evaluate(()=>window.__say)).length;
 await page.mouse.click(30,30);   // a tap anywhere: the name is said
 await page.waitForFunction(b=>window.__say.length>b,before);
 assert.equal((await page.evaluate(()=>window.__say)).slice(-1)[0],'ميعاد دواء زانبرازان ٢٠ قرص');
 // and the button says it again
 const b2=(await page.evaluate(()=>window.__say)).length;await page.click('[data-al-hear]');
 assert.equal((await page.evaluate(()=>window.__say)).length,b2+1);
},{home:true});