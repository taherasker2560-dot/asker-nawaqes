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
 {const ro=Intl.DateTimeFormat.prototype.resolvedOptions;Intl.DateTimeFormat.prototype.resolvedOptions=function(){return {...ro.call(this),timeZone:localStorage.getItem('__tz')||'Africa/Cairo'}}}
 window.__say=[];window.__cancel=0;window.__vib=[];window.__notes=[];window.__voices=localStorage.getItem('__novoice')?0:1;
 window.SpeechSynthesisUtterance=class{constructor(t){this.text=t}};
 window.__subs=0;window.__swReg=null;window.__sub=null;
 Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak(u){window.__say.push(u.text);setTimeout(()=>u.onstart&&u.onstart(),0)},cancel(){window.__cancel++},getVoices(){return window.__voices?[{lang:'ar-EG',name:'Arabic (Egypt)'}]:[]},addEventListener(){}}});
 Object.defineProperty(navigator,'vibrate',{configurable:true,value:(p)=>{window.__vib.push(p);return true}});
 window.Notification=class{constructor(t,o){window.__notes.push([t,o&&o.body])}};window.Notification.permission=localStorage.getItem('__perm')||perm;window.Notification.requestPermission=()=>{window.Notification.permission='granted';localStorage.setItem('__perm','granted');return Promise.resolve('granted')};
 Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{addEventListener(t,f){(window.__swl=window.__swl||[]).push(f)},startMessages(){},register:async(url,o)=>{window.__swReg=[url,o&&o.scope];return {active:{},showNotification:async(t,o)=>{window.__shown=(window.__shown||[]).concat([[t,o&&o.body,o&&o.tag]]);window.__shownData=(window.__shownData||[]).concat([o&&o.data])},pushManager:{getSubscription:async()=>window.__sub,subscribe:async(opt)=>{window.__subs++;window.__subOpt=[opt.userVisibleOnly,opt.applicationServerKey&&opt.applicationServerKey.length];window.__sub={endpoint:'https://push.example/dose/'+'a'.repeat(30)};return window.__sub}}}}}});
 window.__fakeRpcs={ar_store_pay_info:()=>null,ar_customer_regular_view:()=>({ok:true,rows,at:new Date().toISOString()}),ar_dose_save:()=>({ok:true}),
  ar_customer_alarms_view:()=>({ok:true,items:JSON.parse(localStorage.getItem('__ph')||'[]')}),ar_customer_alarms_admin_get:()=>({ok:true,items:JSON.parse(localStorage.getItem('__ph')||'[]')}),
  ar_customer_alarms_admin_set:(a)=>{localStorage.setItem('__ph',JSON.stringify(a.p_items));window.__adminSets=(window.__adminSets||0)+1;return {ok:true,items:a.p_items}}};
};
const setup=(page,perm='default')=>page.addInitScript(FAKE,[ROWS,perm]);
const seed=(page)=>page.evaluate(([c,m,t])=>localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:m,ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[],ar_store_orders:[]})),[CUSTOMERS,MOVES,tok]);
const openAccount=async(page,base)=>{await page.setViewportSize({width:375,height:812});await seed(page);await page.goto(base+'store.html#me='+tok);await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-al-tile');};
const when=(h,m,d=17)=>`new Date(2026,10,${d},${h},${m},20)`;
const tick=(page,h,m,d)=>page.evaluate(`window.AskerStoreAlarm.tick(${when(h,m,d)}).length`);
const chips=(page)=>page.$$eval('#alarmSheet .al-card .al-chip',e=>e.map(x=>x.textContent));
// the copy of the alarms that are ON that the page keeps in this phone's IndexedDB for the notification's worker (asker-dose / kv / alarms); null = nothing there
const idbCopy=(page)=>page.evaluate(()=>new Promise((ok)=>{const r=indexedDB.open('asker-dose',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onerror=()=>ok(null);
 r.onsuccess=()=>{const g=r.result.transaction('kv').objectStore('kv').get('alarms');g.onsuccess=()=>{r.result.close();ok(g.result||null)};g.onerror=()=>ok(null)}}));

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
 assert.match(await text(page,'.al-say'),/هيقول: «ميعاد زانبرازان الآن، خدمة مقدمة من صيدلية عسكر»/);
 assert.deepEqual(await page.$$eval('[data-al-time]',e=>e.map(x=>x.value)),['08:00','20:00']);
 await page.click('[data-al-save]');await page.waitForSelector('#alarmSheet .al-card');
 assert.deepEqual(await chips(page),['8:00 ص','8:00 م']);
 assert.equal(await text(page,'#alarmSheet .al-card b'),'زانبرازان ٢٠ قرص');
 // saved on THIS phone, and nothing was sent anywhere (the pharmacy never learns which medicines or when)
 const kept=await page.evaluate(()=>JSON.parse(localStorage.getItem('asker_dose_alarms')));
 assert.deepEqual(kept.items.map(i=>[i.name,i.say,i.times,i.on]),[['زانبرازان ٢٠ قرص','زانبرازان ٢٠ قرص',['08:00','20:00'],true]]);
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.map(w=>w.rpc||w.table).filter(x=>/ar_dose_save|admin_set/.test(String(x)))),[],'nothing about the alarm reaches the server');
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
 assert.deepEqual(await page.evaluate(()=>window.__say),['ميعاد زانبرازان، وايزابريل كو الآن، خدمة مقدمة من صيدلية عسكر'],'the phone says it, with its own voice');
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
 assert.deepEqual((await page.evaluate(()=>window.__say)).slice(-1),['ميعاد زانبرازان الآن، خدمة مقدمة من صيدلية عسكر']);
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
 assert.equal(await page.$('#alarmRing'),null,'hidden: no card, and the alarm is not used up (11-18)');
 // he opens the page (the clock still at 8:01): now the card shows, and speaks
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false})});
 assert.equal(await tick(page,8,1),1);await page.waitForSelector('#alarmRing');
 await page.click('[data-al-took]');
 // the voice test, and the switch: off = it rings without speaking
 await page.click('[data-al-open]');await page.waitForSelector('[data-al-try]');
 await page.click('[data-al-try]');
 // (the answer comes after the server's voice was asked for and not there: the phone's own voice, and the answer is written under the button)
 await page.waitForFunction(()=>window.__say.slice(-1)[0]==='ميعاد دواء تجريبي الآن، خدمة مقدمة من صيدلية عسكر');
 assert.deepEqual((await page.evaluate(()=>window.__say)).slice(-1),['ميعاد دواء تجريبي الآن، خدمة مقدمة من صيدلية عسكر']);
 await page.waitForSelector('#alarmSheet .al-note');assert.equal(await text(page,'#alarmSheet .al-note'),'✓ اتنطق بصوت الموبايل');
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

run('Dose alarm: the owner\'s look sets THIS customer\'s alarms from the pharmacy phone (kept on the server, never rings there, no voice or notification settings); the English site shows English only',async({page,base})=>{
 await setup(page,'granted');
 await seed(page);
 // the owner's look: the system is signed in on this phone
 await page.evaluate(()=>localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{}'));
 await page.setViewportSize({width:375,height:812});
 await page.goto(base+'store.html#me='+tok);await page.reload();await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-al-tile');
 await page.click('[data-al-open]');await page.waitForSelector('#alarmSheet');
 assert.match(await text(page,'#alarmSheet .rg-hint'),/بتظبط منبهات أحمد محمود من عندك/);
 assert.equal(await page.$('[data-al-speak]'),null,'no voice settings: they are his phone\'s');assert.equal(await page.$('[data-al-notiftest]'),null);
 await page.click('[data-al-new]');await page.click('[data-al-pick="0"]');await page.click('[data-al-save]');await page.waitForSelector('#alarmSheet .al-card');
 await page.waitForFunction(()=>window.__adminSets>=1);
 const sent=await page.evaluate(()=>JSON.parse(localStorage.getItem('__ph')));
 assert.deepEqual(sent.map(i=>[i.name,i.times,i.on]),[['لاكتيفينور ٣٥ قرص',['08:00','20:00'],true]],'saved for the customer on the server');assert.match(sent[0].id,/^p/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_dose_alarms')),null,'nothing kept on the pharmacy phone');
 assert.equal(await tick(page,8,0),0,'never rings there');assert.equal(await page.$('#alarmRing'),null);
 assert.equal(await idbCopy(page),null,'and no copy of the names is written for the notification worker (it is not his phone)');
 // a change, a switch-off and a delete are saved too
 await page.click('#alarmSheet .al-card:nth-of-type(1) [data-al-toggle]');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('__ph'))[0].on===false);
 await page.click('#alarmSheet .al-card:nth-of-type(1) [data-al-edit]');await page.click('[data-al-del]');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('__ph')).length===0);
 assert.equal(await page.evaluate(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_dose_save').length),0,'the pharmacy phone sends no push times');
 // English: no Arabic anywhere in the alarm's own screens (the medicine's name shows in English; the phone still says the Arabic one)
 await page.evaluate(()=>{localStorage.removeItem('__ph');localStorage.removeItem('sb-qwrzdjdgvanmhaicncuk-auth-token');localStorage.setItem('asker-lang','en')});
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
 assert.deepEqual(await page.evaluate(()=>window.__say),['ميعاد زانبرازان الآن، خدمة مقدمة من صيدلية عسكر'],'the phone says the Arabic name of the medicine');
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
 await page.evaluate(()=>{localStorage.removeItem('sb-qwrzdjdgvanmhaicncuk-auth-token');sessionStorage.clear();localStorage.removeItem('__ph')});
 // the page was opened by a tap on the notification: the browser does not allow speech before a tap, so the card asks for one, and the first tap speaks
 await page.addInitScript(()=>{window.__quiet=true});
 await page.goto(base+'store.html#me='+tok);await page.reload();await page.waitForSelector('.ac-al-tile');
 await page.evaluate(()=>{localStorage.setItem('asker_dose_alarms',JSON.stringify({v:1,speak:true,items:[{id:'a1',name:'زانبرازان ٢٠ قرص',say:'',times:['08:00'],on:true}],snoozes:[]}));
  // an engine that stays silent until a TAP, like Chrome on a page nobody touched yet: on a phone a tap is a click (touchend / pointerup), NOT pointerdown (11-18: the first version listened to pointerdown and stayed silent on his phone);
  // it says «not-allowed» out loud before a tap, as Chrome does
  let touched=false;addEventListener('click',()=>{touched=true},true);
  speechSynthesis.speak=(u)=>{window.__say.push(u.text);if(touched)setTimeout(()=>u.onstart&&u.onstart(),0);else setTimeout(()=>u.onerror&&u.onerror({error:'not-allowed'}),0)};window.__say.length=0});
 assert.equal(await page.evaluate(`window.AskerStoreAlarm.tick(new Date(2026,10,17,8,0,20)).length`),1);
 await page.waitForSelector('#alarmRing');
 await page.waitForSelector('.al-ring-hint',{timeout:5000});
 assert.equal(await text(page,'.al-ring-hint'),'دوس في أي مكان عشان تسمع اسم الدوا');
 assert.equal(await page.$eval('.al-ring-card .al-btn',e=>e.hasAttribute('data-al-hear')),true,'«اسمع الاسم» is the first, big button while nobody has tapped');
 const before=(await page.evaluate(()=>window.__say)).length;
 // a finger that only touched down (pointerdown, no tap yet) is not a tap for the browser: nothing is said
 await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'})));await page.waitForTimeout(300);
 assert.equal((await page.evaluate(()=>window.__say)).length,before,'pointerdown alone does not speak');
 await page.mouse.click(30,30);   // a tap anywhere: the name is said
 await page.waitForFunction(b=>window.__say.length>b,before);
 assert.equal((await page.evaluate(()=>window.__say)).slice(-1)[0],'ميعاد زانبرازان الآن، خدمة مقدمة من صيدلية عسكر');
 // and the button says it again
 const b2=(await page.evaluate(()=>window.__say)).length;await page.click('[data-al-hear]');
 await page.waitForFunction(b=>window.__say.length===b+1,b2);
},{home:true});

run('Dose alarm: the alarms the PHARMACY set show on his phone marked «من الصيدلية», ring and speak like his own, he can switch them off but not change them, their times go to the push, a worker message wakes the page, «جرّب الإشعار» shows a real notification',async({page,base})=>{
 await setup(page,'granted');
 await seed(page);
 await page.evaluate(()=>localStorage.setItem('__ph',JSON.stringify([{id:'p1',name:'زانبرازان ٢٠ قرص',say:'',times:['20:00','08:00'],on:true}])));
 await openAccount(page,base);
 await page.waitForFunction(()=>window.AskerStoreAlarm.all().items.length===1);
 assert.equal(await text(page,'.ac-al-tile small'),'منبه واحد شغال');
 await page.click('[data-al-open]');await page.waitForSelector('#alarmSheet .al-card');
 assert.equal(await text(page,'#alarmSheet .al-badge'),'من الصيدلية');
 assert.equal(await page.$('#alarmSheet [data-al-edit]'),null,'he cannot change it');assert.ok(await page.$('#alarmSheet [data-al-toggle="p1"]'),'but he can switch it');
 assert.deepEqual(await page.$$eval('#alarmSheet .al-chip',e=>e.map(x=>x.textContent)),['8:00 ص','8:00 م']);
 // its times go to the push (the server never sees the name), after the page asked for them
 await page.waitForFunction(()=>window.__fakeWrites.some(w=>w.rpc==='ar_dose_save'&&JSON.stringify(w.args.p_times)==='["08:00","20:00"]'));
 // it rings and speaks like his own
 assert.equal(await tick(page,8,0),1);await page.waitForSelector('#alarmRing');
 assert.deepEqual(await page.evaluate(()=>window.__say),['ميعاد زانبرازان الآن، خدمة مقدمة من صيدلية عسكر']);await page.click('[data-al-took]');
 // he switches it off: no ring, kept on his phone, and the push times follow (nothing on)
 await page.click('[data-al-toggle="p1"]');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker_dose_pharmacy')).off),{p1:true});
 assert.equal(await tick(page,20,0),0,'switched off by him');
 await page.waitForFunction(()=>{const s=window.__fakeWrites.filter(w=>w.rpc==='ar_dose_save');return s.length&&s[s.length-1].args.p_times.length===0});
 await page.click('[data-al-toggle="p1"]');
 // the pharmacy removes it: the next page load drops it and its off flag
 await page.evaluate(()=>localStorage.setItem('__ph','[]'));await page.reload();await page.waitForSelector('.ac-al-tile');
 await page.waitForFunction(()=>window.AskerStoreAlarm.all().items.length===0);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker_dose_pharmacy'))),{items:[],off:{}});
 // a push reached the worker while the app is alive in the background: the page rings at once (no tap, no wait for the 15 s clock)
 await page.evaluate(()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');localStorage.setItem('asker_dose_alarms',JSON.stringify({v:1,speak:true,items:[{id:'a9',name:'دوا الآن',say:'',times:[p(d.getHours())+':'+p(d.getMinutes())],on:true}],snoozes:[]}))});
 assert.equal(await page.$('#alarmRing'),null);
 await page.evaluate(()=>window.__swl.forEach(f=>f({data:{type:'dose-due'}})));
 await page.waitForSelector('#alarmRing');assert.match(await text(page,'#alarmRing'),/دوا الآن/);await page.click('[data-al-took]');
 // «جرّب الإشعار»: a real notification through the worker, so he hears his phone's own sound
 await page.click('[data-al-open]');await page.waitForSelector('[data-al-notiftest]');
 assert.match(await text(page,'#alarmSheet .rg-body'),/لو الإشعار جه من غير صوت/);
 await page.click('[data-al-notiftest]');await page.waitForFunction(()=>window.__shown&&window.__shown.length===1);
 assert.deepEqual(await page.evaluate(()=>window.__shown[0]),['🔔 تجربة منبه الدوا','لو سمعت صوت وظهر الإشعار ده، المنبه هيوصلك كده وقت الجرعة. دوس عليه.','asker-dose-test']);
 assert.equal(await page.evaluate(()=>window.__shownData[0].kind),'test','the worker knows this one is the test: a tap on it rings the demo');
},{home:true});

run('Dose alarm: the page keeps a copy of the alarms that are ON (the name as it is said + the times) in this phone\'s IndexedDB for the notification\'s worker, it follows every change, and the REAL worker file reads it and writes «⏰ ميعاد <الاسم> الآن» on the notification',async({page,base})=>{
 await setup(page,'granted');
 await seed(page);
 // the pharmacy set one for him, he has one that is on and one that is off
 await page.evaluate(()=>localStorage.setItem('__ph',JSON.stringify([{id:'p1',name:'زانبرازان ٢٠ قرص',say:'',times:['20:00','08:00'],on:true}])));
 await openAccount(page,base);
 await page.waitForFunction(()=>window.AskerStoreAlarm.all().items.length===1);
 await page.evaluate(()=>localStorage.setItem('asker_dose_alarms',JSON.stringify({v:1,speak:true,items:[{id:'a1',name:'فيموجيسال ق',say:'',times:['20:00','08:00'],on:true},{id:'a2',name:'دوا واقف',say:'',times:['14:00'],on:false}],snoozes:[]})));
 await page.reload();await page.waitForSelector('.ac-al-tile');
 const names=async()=>((await idbCopy(page))||{items:[]}).items.map((i)=>[i.spoken,i.times]);
 const until=async(want,why)=>{for(let k=0;k<60;k++){if(JSON.stringify(await names())===JSON.stringify(want))return;await page.waitForTimeout(100)}assert.deepEqual(await names(),want,why)};
 // only the alarms that are on, the name as it is SAID («فيموجيسال ق» → «فيموجيسال»), the times in the order of the day; the pharmacy's one too; the one that is off is not there
 await until([['فيموجيسال',['08:00','20:00']],['زانبرازان',['08:00','20:00']]],'the alarms that are on, own + pharmacy\'s');
 const c=await idbCopy(page);
 assert.deepEqual(c.items.map((i)=>i.id),['a1','p1']);assert.equal(typeof c.at,'number');
 assert.doesNotMatch(JSON.stringify(c),/دوا واقف|ar_dose|endpoint/,'the stopped one is not copied, and nothing but name + times');
 // the REAL worker file (store/dose/sw.js) on this page's real IndexedDB, with a fixed phone clock: 08:00 → both names, 08:10 → the plain one
 const push=(h,m)=>page.evaluate(async([h,m])=>{
  const src=await (await fetch('store/dose/sw.js')).text(),L={},out=[];
  const self={indexedDB:window.indexedDB,registration:{scope:location.origin+'/store/dose/',showNotification:async(t,o)=>{out.push([t,o.body,o.tag])}},skipWaiting(){},clients:{claim(){},matchAll:async()=>[]},addEventListener:(t,f)=>{L[t]=f}};
  class FD extends Date{constructor(...a){a.length?super(...a):super(2026,10,18,h,m,20)}}
  new Function('self','Date',src)(self,FD);
  let p;L.push({waitUntil:(x)=>{p=x}});await p;return out;
 },[h,m]);
 assert.deepEqual(await push(8,0),[['⏰ ميعاد فيموجيسال، وزانبرازان الآن','خدمة مقدمة من صيدلية عسكر. دوس عشان تسمع الاسم وتاخده','asker-dose']]);
 assert.deepEqual(await push(14,0),[['⏰ ميعاد دواك','دوس عشان تسمع اسم الدوا وتاخده','asker-dose']],'14:00 is the one that is OFF: the plain notification');
 assert.equal((await push(8,10))[0][0],'⏰ ميعاد دواك','10 minutes after the time: not this dose any more');
 // every change follows: he switches his first one off, a new one by hand comes in, he switches the pharmacy's one off
 await page.click('[data-al-open]');await page.waitForSelector('#alarmSheet .al-card');
 await page.click('[data-al-toggle="a1"]');
 await until([['زانبرازان',['08:00','20:00']]],'his alarm switched off leaves the copy');
 await page.click('[data-al-new]');await page.click('[data-al-pick="other"]');await page.fill('[data-al-name]','فيتامين د');await page.click('[data-al-preset="once"]');await page.click('[data-al-save]');await page.waitForSelector('#alarmSheet .al-card');
 await until([['فيتامين د',['08:00']],['زانبرازان',['08:00','20:00']]],'a new one comes in');
 assert.equal((await push(8,0))[0][0],'⏰ ميعاد فيتامين د، وزانبرازان الآن','the worker names the two that are on');
 await page.click('[data-al-toggle="p1"]');
 await until([['فيتامين د',['08:00']]],'the pharmacy\'s alarm switched off by him leaves the copy');
 assert.equal((await push(20,0))[0][0],'⏰ ميعاد دواك','nothing on at 20:00 any more');
},{home:true});

run('Dose alarm: a hidden page does not use the alarm up; a tap on the dose notification rings it and asks for the first tap (an open page by the worker\'s message, a new window by ?dose=1); the test notification rings a made-up «تجربة المنبه»',async({page,base})=>{
 await setup(page,'granted');
 await openAccount(page,base);
 // an alarm at THIS minute (the page reads the real clock here)
 const now=()=>page.evaluate(()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return p(d.getHours())+':'+p(d.getMinutes())});
 const setAlarm=async()=>{const t=await now();await page.evaluate((t)=>{localStorage.removeItem('asker_dose_fired');localStorage.setItem('asker_dose_alarms',JSON.stringify({v:1,speak:true,items:[{id:'a1',name:'دوا الصبح',say:'',times:[t],on:true}],snoozes:[]}))},t)};
 await setAlarm();   // (set after the page is open: the page's own first look at the clock would ring it at once, visible)
 // an engine that stays silent until a tap (Chrome on a page nobody touched)
 const silent=()=>page.evaluate(()=>{let touched=false;addEventListener('click',()=>{touched=true},true);speechSynthesis.speak=(u)=>{window.__say.push(u.text);if(touched)setTimeout(()=>u.onstart&&u.onstart(),0);else setTimeout(()=>u.onerror&&u.onerror({error:'not-allowed'}),0)};window.__say.length=0});
 await silent();
 // 1. the page is hidden when the time comes: ONE notification, no card, and the alarm is not marked as rung
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true})});
 assert.equal(await page.evaluate(()=>window.AskerStoreAlarm.tick().length),1);assert.equal(await page.evaluate(()=>window.AskerStoreAlarm.tick().length),1);
 assert.equal(await page.evaluate(()=>window.__notes.length),1,'one notification, not one every 15 seconds');
 assert.equal(await page.$('#alarmRing'),null,'nobody sees a card while the page is hidden');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_dose_fired')),null,'and the alarm is not used up');
 // 2. he taps the notification: the worker tells the open page; it rings at once, asks for the first tap, and the tap speaks
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false})});
 await page.evaluate(()=>window.__swl.forEach(f=>f({data:{type:'dose-open',kind:'dose'}})));
 await page.waitForSelector('#alarmRing');assert.match(await text(page,'#alarmRing'),/دوا الصبح/);
 await page.waitForSelector('.al-ring-hint');assert.equal(await page.$eval('.al-ring-card .al-btn',e=>e.hasAttribute('data-al-hear')),true);
 const b1=(await page.evaluate(()=>window.__say)).length;await page.click('[data-al-hear]');
 await page.waitForFunction(b=>window.__say.length>b,b1);assert.equal((await page.evaluate(()=>window.__say)).slice(-1)[0],'ميعاد دوا الصبح الآن، خدمة مقدمة من صيدلية عسكر');
 await page.click('[data-al-took]');await page.waitForSelector('#alarmRing',{state:'detached'});
 // 3. a closed page: the tap opens a NEW window with ?dose=1: it rings although the alarm was already marked as rung (he never saw it), and the address is clean
 assert.ok(await page.evaluate(()=>!!localStorage.getItem('asker_dose_fired')),'«خدته» marked it');
 await page.goto(base+'store.html?dose=1#account');await page.waitForSelector('#alarmRing');
 assert.equal(await page.evaluate(()=>location.search),'','?dose= goes out of the address');assert.equal(await page.evaluate(()=>location.hash),'#account');
 await page.click('[data-al-took]');
 // 4. the same tap long after the time (an hour): still the notification's alarm
 await page.evaluate(()=>{const d=new Date(Date.now()-60*60000),p=n=>String(n).padStart(2,'0');if(d.getDate()!==new Date().getDate())return;const x=JSON.parse(localStorage.getItem('asker_dose_alarms'));x.items[0].times=[p(d.getHours())+':'+p(d.getMinutes())];localStorage.setItem('asker_dose_alarms',JSON.stringify(x))});
 const lateOk=await page.evaluate(()=>{const d=new Date(Date.now()-60*60000);return d.getDate()===new Date().getDate()});
 if(lateOk){await page.reload();await page.waitForSelector('.ac-al-tile');assert.equal(await page.$('#alarmRing'),null,'an hour late and nobody tapped: not rung by itself');
  await page.evaluate(()=>window.AskerStoreAlarm.doseOpened('dose'));await page.waitForSelector('#alarmRing');await page.click('[data-al-took]')}
 // 5. the test notification: a demo ring with a made-up name; «ذكّرني» makes no real alarm
 await page.goto(base+'store.html?dose=test#account');await page.waitForSelector('#alarmRing');
 assert.match(await text(page,'#alarmRing'),/تجربة المنبه/);assert.equal(await page.evaluate(()=>location.search),'');
 await page.click('[data-al-snooze]');await page.waitForSelector('#alarmRing',{state:'detached'});
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker_dose_alarms')).snoozes),[],'the demo is not an alarm');
 // 6. the pharmacy's own phone never rings, whatever tapped
 await page.evaluate(()=>{localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{}')});await page.goto(base+'store.html?dose=1#me='+tok);await page.waitForSelector('.ac-al-tile');
 assert.equal(await page.$('#alarmRing'),null);await page.evaluate(()=>localStorage.removeItem('sb-qwrzdjdgvanmhaicncuk-auth-token'));
 // 7. (a photo of the card on his phone: «اسمع الاسم مبينطقش ولا بيعمل حاجة»): an engine that fails the first two ways (a listed voice that is not really installed) is tried a third way; one that fails all three says why on the card
 await page.goto(base+'store.html?s7=1#me='+tok);await page.waitForSelector('.ac-al-tile');await setAlarm();   // (a real load: the page above was the pharmacy's look, which forgot his link and is decided when the page loads)
 await page.evaluate(()=>{window.__tries=[];let n=0;speechSynthesis.speak=(u)=>{window.__tries.push([u.lang,!!u.voice]);n++;if(n<3)setTimeout(()=>u.onerror&&u.onerror({error:'synthesis-failed'}),0);else setTimeout(()=>u.onstart&&u.onstart(),0)}});
 await page.evaluate(()=>window.AskerStoreAlarm.doseOpened('dose'));await page.waitForSelector('#alarmRing');
 await page.waitForFunction(()=>window.__tries.length===3);
 assert.deepEqual(await page.evaluate(()=>window.__tries),[['ar-EG',true],['ar',false],['',false]],'the Egyptian voice, then «ar» with the engine\'s own choice, then its default');
 await page.waitForTimeout(200);assert.equal(await page.$('#alarmRing .al-warn'),null,'the third way worked: no warning');
 await page.click('[data-al-took]');
 await page.evaluate(()=>{window.__tries=[];speechSynthesis.speak=(u)=>{window.__tries.push(1);setTimeout(()=>u.onerror&&u.onerror({error:'synthesis-failed'}),0)}});
 await page.evaluate(()=>window.AskerStoreAlarm.doseOpened('dose'));await page.waitForSelector('#alarmRing .al-warn');
 assert.match(await text(page,'#alarmRing .al-warn'),/الموبايل ما نطقش الاسم.*synthesis-failed/);assert.equal(await page.evaluate(()=>window.__tries.length),3,'three tries, no more');
 // an engine that «ends» at once without ever starting (nothing was said) counts as a failure too
 await page.click('[data-al-took]');
 await page.evaluate(()=>{window.__tries=[];speechSynthesis.speak=(u)=>{window.__tries.push(1);setTimeout(()=>u.onend&&u.onend(),0)}});
 await page.evaluate(()=>window.AskerStoreAlarm.doseOpened('dose'));await page.waitForSelector('#alarmRing .al-warn');
 assert.match(await text(page,'#alarmRing .al-warn'),/silent/);
},{home:true});

// ---- 2026-11-18 (a photo of the card, then «زرار جرّب الصوت من عند العميل برضو ما بيشتغلش … صخرة صلبة»): the phone's own speech engine stayed silent on his customer's phone, so the sentence is a sound
// file made by the server, kept on the phone, and the engine is the second way; and every answer is written on the page ----
const sentence=(n)=>`ميعاد ${n} الآن، خدمة مقدمة من صيدلية عسكر`;
run('Dose alarm voice: the sentence comes from the server and is kept on the phone, plays at the dose time from that copy, a refused sound asks for a tap, a failing server falls back to the phone\'s voice',async({page,base})=>{
 await setup(page,'granted');
 await page.addInitScript(()=>{
  window.__played=[];window.__playMode='ok';window.__server=localStorage.getItem('__server')||'ok';window.__voiceBodies=[];
  window.__fakeInvokes={'asker-dose':async(b)=>{if(b&&b.action==='voice'){window.__voiceBodies.push(b.name);if(window.__server==='ok')return {data:new Blob([new Uint8Array(3000)],{type:'audio/wav'}),error:null};return {data:null,error:{message:'Edge Function returned a non-2xx status code',context:{status:429,clone(){return {json:async()=>({error:'busy'})}}}}}}return {data:null,error:{message:'bad'}}}};
  const orig=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!String(this.src).startsWith('blob:'))return orig.call(this);window.__played.push('blob:');if(window.__playMode==='deny'){window.__playMode='ok';return Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}))}setTimeout(()=>this.dispatchEvent(new Event('playing')),0);return Promise.resolve()};
 });
 await openAccount(page,base);
 await page.evaluate(()=>{localStorage.setItem('asker_dose_alarms',JSON.stringify({v:1,speak:true,items:[{id:'a1',name:'فيموجيسال ق',say:'',times:['08:00'],on:true}],snoozes:[]}))});
 await page.reload();await page.waitForSelector('.ac-al-tile');
 // 1. when the page opens it asks for the sentence once (the brand only, as it will be said) and keeps it on the phone
 await page.waitForFunction(()=>window.__voiceBodies.length===1,null,{timeout:8000});
 assert.deepEqual(await page.evaluate(()=>window.__voiceBodies),['فيموجيسال']);
 await page.waitForFunction(async()=>{if(!window.caches)return true;return (await (await caches.open('asker-dose-voice-v1')).keys()).length===1},null,{timeout:5000});
 // 2. the dose time: the sound plays from the phone's own copy; the phone's voice is not used and the server is not asked again
 assert.equal(await tick(page,8,0),1);await page.waitForSelector('#alarmRing');
 await page.waitForFunction(()=>window.__played.length===1);
 assert.deepEqual(await page.evaluate(()=>window.__say),[],'the phone\'s own voice stays quiet');assert.equal(await page.evaluate(()=>window.__voiceBodies.length),1);
 assert.equal(await page.evaluate(()=>window.__played[0]),'blob:');
 await page.click('[data-al-took]');
 // 3. the browser refuses the sound (no tap yet): the card asks for a tap, the big «اسمع الاسم» button comes first, and the tap plays it
 await page.evaluate(()=>{window.__playMode='deny'});
 assert.equal(await tick(page,8,0,18),1);await page.waitForSelector('#alarmRing .al-ring-hint');
 assert.equal(await page.$eval('.al-ring-card .al-btn',e=>e.hasAttribute('data-al-hear')),true);
 const p0=(await page.evaluate(()=>window.__played)).length;await page.click('[data-al-hear]');await page.waitForFunction(n=>window.__played.length===n+1,p0);
 assert.deepEqual(await page.evaluate(()=>window.__say),[]);await page.click('[data-al-took]');
 // 4. a medicine not on the phone yet and the server failing (busy): the phone's own voice says the same sentence
 await page.evaluate(()=>{window.__server='fail';localStorage.setItem('asker_dose_alarms',JSON.stringify({v:1,speak:true,items:[{id:'a2',name:'اوميز',say:'',times:['09:00'],on:true}],snoozes:[]}))});
 assert.equal(await tick(page,9,0),1);await page.waitForSelector('#alarmRing');
 await page.waitForFunction(()=>window.__say.length===1);assert.deepEqual(await page.evaluate(()=>window.__say),[sentence('اوميز')]);
 await page.click('[data-al-took]');
 // 5. the test button writes its answer under itself: the natural voice when the server answers, the phone's when not, and the reason when nothing speaks
 await page.evaluate(()=>{window.__server='ok';window.__playMode='ok'});
 await page.click('[data-al-open]');await page.waitForSelector('[data-al-try]');
 await page.click('[data-al-try]');await page.waitForSelector('#alarmSheet .al-note');
 await page.waitForFunction(()=>/الصوت الطبيعي/.test(document.querySelector('#alarmSheet .al-note').textContent));
 assert.equal(await text(page,'#alarmSheet .al-note'),'✓ اتنطق بالصوت الطبيعي');
 // (the sentence was kept on the phone by the first press: clear the phone's copy, make the server fail and the engine fail, and open the page again)
 await page.evaluate(async()=>{localStorage.setItem('__server','fail');if(window.caches)await caches.delete('asker-dose-voice-v1')});
 await page.reload();await page.waitForSelector('.ac-al-tile');
 await page.evaluate(()=>{speechSynthesis.speak=(u)=>{setTimeout(()=>u.onerror&&u.onerror({error:'synthesis-failed'}),0)}});
 await page.click('[data-al-open]');await page.waitForSelector('[data-al-try]');await page.click('[data-al-try]');
 await page.waitForFunction(()=>/ما نطقش/.test(document.querySelector('#alarmSheet .al-note').textContent),null,{timeout:15000});
 assert.match(await text(page,'#alarmSheet .al-note'),/ما نطقش\. دوس «🔍 فحص الصوت» وصوّر النتيجة\. \(synthesis-failed\)/);
},{home:true});

run('Dose alarm voice: «🔍 فحص الصوت» writes down what this phone has and what each way did, and copies it',async({page,base})=>{
 await setup(page,'granted');
 await page.addInitScript(()=>{
  window.__fakeInvokes={'asker-dose':async(b)=>b&&b.action==='voice'?{data:new Blob([new Uint8Array(3000)],{type:'audio/wav'}),error:null}:{data:null,error:{message:'bad'}}};
  const orig=HTMLMediaElement.prototype.play;window.__beepMode='ok';HTMLMediaElement.prototype.play=function(){if(!String(this.src).startsWith('blob:'))return orig.call(this);if(window.__beepMode==='deny')return Promise.reject(Object.assign(new Error('x'),{name:'NotAllowedError'}));setTimeout(()=>this.dispatchEvent(new Event('playing')),0);return Promise.resolve()};
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied=t}},configurable:true});
 });
 await openAccount(page,base);
 await page.click('[data-al-open]');await page.waitForSelector('[data-al-diag]');
 await page.click('[data-al-diag]');
 await page.waitForFunction(()=>/\ndone$/.test((document.querySelector('#alarmSheet .al-diag')||{}).textContent||''),null,{timeout:30000});
 const d=await page.$eval('#alarmSheet .al-diag',e=>e.textContent);
 assert.match(d,/^version: /m);assert.match(d,/^ua: /m);assert.match(d,/^active: /m);
 assert.match(d,/beep \(audio element\): playing/);assert.match(d,/server voice: (server|cache) · \d+ bytes/);assert.match(d,/server voice play: playing/);
 assert.match(d,/speechSynthesis: 1 voices · arabic: Arabic \(Egypt\) \[ar-EG/);
 assert.match(d,/tts ar-EG voice: start/);assert.match(d,/tts ar: start/);assert.match(d,/tts default: start/);
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied=t}},configurable:true})});
 await page.click('[data-al-diagcopy]');await page.waitForFunction(()=>!!window.__copied);
 assert.equal(await page.evaluate(()=>window.__copied),d,'the copy is what is on the page');
 await page.waitForFunction(()=>/اتنسخت/.test(document.querySelector('[data-al-diagcopy]').textContent));
 // an engine that is not there at all and a sound that cannot play are written down too
 await page.evaluate(()=>{window.__beepMode='deny';Object.defineProperty(window,'speechSynthesis',{configurable:true,value:undefined})});
 await page.evaluate(()=>window.AskerStoreAlarm.runDiag());
 const d2=await page.$eval('#alarmSheet .al-diag',e=>e.textContent);assert.match(d2,/beep \(audio element\): rejected NotAllowedError/);assert.match(d2,/speechSynthesis: none/);
},{home:true});

run('Dose alarm, the pharmacy\'s phone: a save says whether it reached the server, and the calls go through the owner\'s sign-in (the store\'s own client is a visitor\'s: the server answered 401 and nothing was said)',async({page,base})=>{
 await setup(page,'granted');await seed(page);
 await page.evaluate(()=>localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{}'));
 await page.setViewportSize({width:375,height:812});await page.goto(base+'store.html#me='+tok);await page.reload();await page.waitForSelector('.ac-al-tile');
 await page.click('[data-al-open]');await page.click('[data-al-new]');await page.click('[data-al-pick="0"]');await page.click('[data-al-save]');
 await page.waitForSelector('#alarmSheet .al-note');assert.equal(await text(page,'#alarmSheet .al-note'),'✓ اتحفظ. هيظهر عند العميل أول ما يفتح صفحته.');
 // the server refuses: the page says so (it used to say nothing)
 await page.evaluate(()=>{window.__fakeRpcs.ar_customer_alarms_admin_set=()=>({ok:false,error:'forbidden'})});
 await page.click('#alarmSheet .al-card:nth-of-type(1) [data-al-toggle]');await page.waitForSelector('#alarmSheet .al-warn');
 assert.match(await text(page,'#alarmSheet .al-warn'),/ما اتحفظش على السيرفر: مفيش دخول للسيستم على الموبايل ده/);
 // the guard: the owner's functions are never called on the visitor client
 const src=await page.evaluate(()=>fetch('store/alarm.js').then(r=>r.text()));
 assert.doesNotMatch(src,/\bclient\.rpc\('ar_customer_alarms_admin_/);assert.match(src,/adminClient\(\)\.rpc\('ar_customer_alarms_admin_get'/);assert.match(src,/c\.rpc\('ar_customer_alarms_admin_set'/);
 const st=await page.evaluate(()=>fetch('store/store.js').then(r=>r.text()));assert.match(st,/createClient\(SUPABASE_URL, SUPABASE_KEY, \{ auth: \{ persistSession: false \} \}\)/,'(the store\'s client stays a visitor\'s: that is why the owner\'s calls need their own)');
},{home:true});