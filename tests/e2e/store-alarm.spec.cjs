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

// ---- 2026-11-18 (owner: «مش موافق عالحل ده … لو بتينا APK ينزل من الموقع»): the customer's Android app «منبه الدوا» (alarm-android/) is a WebView that shows THIS page; the app is what rings ----
const APPFAKE=()=>{
 window.__app={sets:[],voices:{},asks:[],tests:0,stops:0,batt:0,ringing:false,diagData:{},closed:0,seed:localStorage.getItem('__seed')||'',notif:true,fs:true,battery:true,autostart:false,selftest:'ok',selftests:0};window.__invoked=[];
 window.AskerAndroid={setAlarms:(j)=>{window.__app.sets.push(JSON.parse(j));window.__app.seed='';return true},seed:()=>window.__app.seed,hasVoice:(n)=>!!window.__app.voices[n],saveVoice:(n,b)=>{window.__app.voices[n]=b.length;return true},
  status:()=>JSON.stringify({v:1,notifications:window.__app.notif,fullScreen:window.__app.fs,battery:window.__app.battery,needsAutostart:window.__app.autostart,selftest:window.__app.selftest}),selfTest:()=>{window.__app.selftests++;window.__app.selftest='pending'},ask:(k)=>{window.__app.asks.push(k)},testRing:()=>{window.__app.tests++;window.__app.ringing=true},stopRing:()=>{window.__app.stops++;window.__app.ringing=false},ringing:()=>window.__app.ringing,openBattery:()=>{window.__app.batt++},diag:()=>JSON.stringify(window.__app.diagData),close:()=>{window.__app.closed++},version:()=>'1'};
 window.__fakeInvokes={'asker-dose':async(b)=>{window.__invoked.push(b&&b.name);return {data:new Blob([new Uint8Array(3000)],{type:'audio/wav'}),error:null}}};
};
run('Dose alarm inside the Android app: the alarm sheet is the screen, the alarms that are ON (his own, the browser\'s seed, the pharmacy\'s) are handed to the app, the page never rings or asks for notifications, the sound files are handed over once, the app\'s needs and test ring work, back and close leave through the app',async({page,base})=>{
 await setup(page,'granted');
 await page.addInitScript(APPFAKE);
 await page.evaluate(()=>{localStorage.setItem('__seed',JSON.stringify({v:1,speak:true,items:[{id:'a1',name:'فيموجيسال ق',say:'',times:['20:00','08:00'],on:true}]}));
  localStorage.setItem('__ph',JSON.stringify([{id:'p1',name:'زانبرازان ٢٠ قرص',say:'',times:['20:00','08:00'],on:true}]))});
 await openAccount(page,base);
 // the sheet is already open (nobody tapped): his alarm from the browser (the app's seed, taken over once) and the pharmacy's
 await page.waitForSelector('#alarmSheet .al-card');
 await page.waitForFunction(()=>window.AskerStoreAlarm.all().items.length===2);
 assert.deepEqual(await page.evaluate(()=>window.AskerStoreAlarm.all().items.map(i=>[i.id,i.name,i.times])),[['a1','فيموجيسال ق',['08:00','20:00']],['p1','زانبرازان ٢٠ قرص',['08:00','20:00']]]);
 await page.waitForFunction(()=>{const s=window.__app.sets.slice(-1)[0];return s&&s.items.length===2});
 assert.deepEqual(await page.evaluate(()=>window.__app.sets.slice(-1)[0]),{speak:true,items:[{id:'a1',spoken:'فيموجيسال',times:['08:00','20:00']},{id:'p1',spoken:'زانبرازان',times:['08:00','20:00']}]},'the app gets the name as it is said and the times');
 assert.equal(await page.evaluate(()=>window.__app.seed),'','the seed was taken over once');
 // no browser ring, no notifications box, no push: the app does all that
 assert.equal(await tick(page,8,0),0,'the page does not ring in the app');assert.equal(await page.$('#alarmRing'),null);
 assert.equal(await page.$('[data-al-notif]'),null);assert.equal(await page.$('.rg-warn'),null);assert.equal(await page.$('[data-al-try]'),null);assert.equal(await page.$('#alarmSheet [data-al-getapp]'),null,'already in the app: no download button');
 assert.equal(await page.evaluate(()=>window.__subs),0,'no push subscription from inside the app');
 // the sound files are handed to the app: once per name, the test ring's too, and never asked again
 await page.waitForFunction(()=>Object.keys(window.__app.voices).length===3);
 assert.deepEqual(await page.evaluate(()=>Object.entries(window.__app.voices).sort()),[['زانبرازان',4000],['فيموجيسال',4000],['تجربة المنبه',4000]].sort(),'3000 bytes of sound = 4000 characters of base64 handed over');
 const asked=await page.evaluate(()=>window.__invoked.length);
 // a change follows at once: switching his alarm off leaves only the pharmacy's; the voice switch goes to the app
 await page.click('[data-al-toggle="a1"]');
 await page.waitForFunction(()=>window.__app.sets.slice(-1)[0].items.length===1);
 assert.deepEqual(await page.evaluate(()=>window.__app.sets.slice(-1)[0].items.map(i=>i.id)),['p1']);
 await page.click('[data-al-speak]');await page.waitForFunction(()=>window.__app.sets.slice(-1)[0].speak===false);
 await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.__invoked.length),asked,'the sound files are not asked for twice');
 // what the app still needs from the phone, read again when he comes back from the settings
 assert.equal(await page.$('[data-al-ask]'),null,'nothing missing');
 await page.evaluate(()=>{window.__app.notif=false;window.__app.fs=false;document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForSelector('[data-al-ask="notifications"]');await page.click('[data-al-ask="notifications"]');await page.click('[data-al-ask="fullScreen"]');
 assert.deepEqual(await page.evaluate(()=>window.__app.asks),['notifications','fullScreen']);
 // the test ring is the app's
 await page.click('[data-al-apptest]');assert.equal(await page.evaluate(()=>window.__app.tests),1);
 // while it rings the button says «⏹ وقّف الرنين» and stops it (a ring that «hangs» with no way to close it was the owner's first real-phone report)
 assert.equal(await text(page,'[data-al-apptest]'),'⏹ وقّف الرنين');
 await page.click('[data-al-apptest]');assert.equal(await page.evaluate(()=>window.__app.stops),1);assert.equal(await text(page,'[data-al-apptest]'),'🔔 جرّب المنبه');
 // «🔍 فحص المنبه»: what the phone answers, in plain Arabic (volume zero, do-not-disturb, the battery rule, the sound files, the last rings)
 await page.evaluate(()=>{const at=new Date(2026,10,18,11,45).getTime();window.__app.diagData={version:'1.1',model:'samsung SM-A525F',notifications:true,exact:true,alarms:2,nextOurs:at,nextSystem:at,alarmVol:0,alarmMax:7,musicVol:5,ringer:1,dnd:3,battery:false,speak:true,names:2,voices:1,log:['11:45:00 المنبه ضرب: 1 دوا','11:45:01 الرنين بدأ: فيموجيسال']}});
 await page.click('[data-al-appdiag]');await page.waitForSelector('#alarmSheet .al-diag-sum');
 assert.deepEqual(await page.$$eval('#alarmSheet .al-diag-sum p',els=>els.map(e=>e.textContent)),['✓ الإشعارات شغالة','✓ المنبه الجاي الساعة 11:45 ومتسجل في نظام الموبايل','✗ صوت المنبه على الموبايل صفر: ارفعه (زرار الصوت وإنت في التطبيق)','ℹ️ الموبايل على الصامت أو الاهتزاز (المنبه المفروض يرنّ برضه)','✗ «عدم الإزعاج» شغال على «ولا حاجة» وبيمنع المنبه','ℹ️ البطارية بتحسّن التطبيق: لو المنبه ما رنّش خلّيه من غير قيود','ℹ️ صوت الصيدلية جاهز لـ 1 من 2 دوا (الباقي بصوت الموبايل أو بنغمة)','ℹ️ إصدار التطبيق 1.1 · samsung SM-A525F','آخر الأحداث:','11:45:00 المنبه ضرب: 1 دوا','11:45:01 الرنين بدأ: فيموجيسال']);
 await page.click('[data-al-battery]');assert.equal(await page.evaluate(()=>window.__app.batt),1);
 // the system alarm that is NOT registered, and nothing saved, are said too
 await page.evaluate(()=>{window.__app.diagData={version:'1.1',model:'x',notifications:false,exact:false,alarms:0,nextOurs:0,nextSystem:0,alarmVol:3,alarmMax:7,ringer:2,dnd:1,battery:true,names:0,voices:0,log:[]}});
 await page.click('[data-al-appdiag]');
 assert.deepEqual((await page.$$eval('#alarmSheet .al-diag-sum p',els=>els.map(e=>e.textContent))).slice(0,6),['✗ الإشعارات مقفولة للتطبيق (من إعدادات الموبايل)','✗ «المنبهات والتذكيرات» مش مسموحة للتطبيق (إعدادات الموبايل ← التطبيقات ← منبه الدوا)','✗ مفيش منبه شغال محفوظ في التطبيق','✓ صوت المنبه 3 من 7','✓ البطارية: من غير قيود على التطبيق','ℹ️ إصدار التطبيق 1.1 · x']);
 assert.equal(await page.$('[data-al-battery]'),null,'no battery button when the app has no limits');
 // back: the editor goes back to the list through the app's back button; from the list the app is asked to leave
 await page.click('[data-al-new]');await page.waitForSelector('[data-al-save]');
 assert.equal(await page.evaluate(()=>window.AskerStoreAlarm.appBack()),true);await page.waitForSelector('[data-al-new]');
 assert.equal(await page.evaluate(()=>window.AskerStoreAlarm.appBack()),false,'on the list the app closes itself');
 await page.click('[data-al-close]');assert.equal(await page.evaluate(()=>window.__app.closed),1);
},{home:true});

run('Dose alarm in the browser on an Android phone: one button opens the app with his link and his alarms, or (no app) downloads it; not on a computer, not on the pharmacy\'s phone',async({page,base})=>{
 await setup(page,'granted');
 await page.addInitScript(()=>{Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=>'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'})});
 await page.evaluate(()=>localStorage.setItem('asker_dose_alarms',JSON.stringify({v:1,speak:true,items:[{id:'a1',name:'فيموجيسال ق',say:'',times:['08:00'],on:true}],snoozes:[]})));
 await openAccount(page,base);
 await page.click('[data-al-open]');await page.waitForSelector('#alarmSheet [data-al-getapp]');
 assert.equal(await text(page,'#alarmSheet [data-al-getapp]'),'📲 نزّل تطبيق المنبه');
 const href=await page.$eval('#alarmSheet [data-al-getapp]',e=>e.getAttribute('href'));
 const m=/^intent:\/\/alarm\?me=([0-9a-f]{64})#Intent;scheme=askeralarm;package=com\.askerpharmacy\.alarm;S\.alarms=([^;]+);S\.browser_fallback_url=([^;]+);end$/.exec(href);
 assert.ok(m,'the intent link: '+href);
 assert.equal(m[1],tok,'his link goes to the app');
 assert.deepEqual(JSON.parse(decodeURIComponent(m[2])),{v:1,speak:true,items:[{id:'a1',name:'فيموجيسال ق',say:'',times:['08:00'],on:true}]},'and his alarms');
 assert.equal(decodeURIComponent(m[3]),'https://github.com/taherasker2560-dot/asker-nawaqes/releases/download/alarm-build/asker-alarm.apk','no app on the phone: the download');
 assert.match(await text(page,'#alarmSheet .al-app'),/بعد ما الملف ينزل: افتحه واضغط «تثبيت»/);
 assert.match(await text(page,'#alarmSheet .al-app-head'),/الموقع لوحده بيبعتلك إشعار بس. عشان المنبه يرنّ وينطق اسم الدوا والموبايل مقفول، نزّل تطبيق «منبه الدوا»:/);
 assert.equal(await text(page,'#alarmSheet .al-app .al-warn'),'⚠️ ده لأندرويد بس، ومش بيشتغل على الآيفون.','written under the download button: Android only, not on iPhone');
 assert.ok(await page.evaluate(()=>{const a=document.querySelector('#alarmSheet .al-app'),b=document.querySelector('#alarmSheet .al-add');return !!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING)}),'the download box is the first thing in the sheet, above the alarms and the add button');
 // the push way is still offered there (the app is an extra)
 assert.ok(await page.$('[data-al-notiftest]'),'(notifications are allowed in this test: its test button shows)');
 // the pharmacy's own phone: no button
 await page.evaluate(()=>localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{}'));
 await page.goto(base+'store.html#me='+tok);await page.reload();await page.waitForSelector('.ac-al-tile');
 await page.click('[data-al-open]');await page.waitForSelector('#alarmSheet');assert.equal(await page.$('#alarmSheet [data-al-getapp]'),null);
},{home:true});

const ANDROID_UA='Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const IPHONE_UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const withUa=(page,ua)=>page.addInitScript((u)=>{Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=>u})},ua);
run('Account movement alerts (owner 2026-11-18, «🔔 تنبيه حركة الحساب»): the owner of the account has the tile; a tap asks for the notifications, registers the account worker (scope store/acct/), subscribes with the public key and tells the server this phone\'s address with his link; a second tap turns it off; a refusal from the server is said; nothing on the pharmacy\'s own phone or inside the Android app',async({page,base})=>{
 await setup(page,'default');
 await page.addInitScript(()=>{window.__fakeRpcs.ar_account_push_save=()=>({ok:true});if(localStorage.getItem('__keepsub'))window.__sub={endpoint:'https://push.example/dose/'+'a'.repeat(30)}});   // (on every load, so the address told again after a reload is recorded too; a real browser keeps its subscription, the fake one is told to)
 await openAccount(page,base);
 await page.waitForSelector('.ac-push-tile');
 assert.equal(await text(page,'.ac-push-tile b'),'🔔 تنبيه حركة الحساب');
 assert.match(await text(page,'.ac-push-tile small'),/اضغط عشان يوصلك إشعار لما يحصل حركة جديدة على حسابك/);
 await page.click('.ac-push-tile');
 await page.waitForSelector('.ac-push-tile.on');
 assert.match(await text(page,'.ac-push-tile small'),/✓ شغّال: هيجيلك إشعار/);
 assert.deepEqual(await page.evaluate(()=>window.__swReg),['store/acct/sw.js','store/acct/'],'its own worker and scope');
 assert.equal(await page.evaluate(()=>window.__subs),1);
 const saves=()=>page.evaluate(()=>window.__fakeWrites.filter(x=>x.rpc==='ar_account_push_save').map(x=>x.args));
 assert.deepEqual(await saves(),[{p_token:tok,p_endpoint:'https://push.example/dose/'+'a'.repeat(30),p_on:true}],'the server gets the address and his link, nothing else');
 // a later open tells the server the address again (the push service may have changed it)
 await page.evaluate(()=>localStorage.setItem('__keepsub','1'));
 await page.reload();await page.waitForSelector('.ac-push-tile.on');
 await page.waitForFunction(()=>window.__fakeWrites.filter(x=>x.rpc==='ar_account_push_save').length>=1);
 assert.deepEqual(await saves(),[{p_token:tok,p_endpoint:'https://push.example/dose/'+'a'.repeat(30),p_on:true}],'the same address, told again');
 // off: the server forgets the address
 await page.click('.ac-push-tile');
 await page.waitForFunction(()=>!document.querySelector('.ac-push-tile.on'));
 assert.equal((await saves()).pop().p_on,false);
 assert.match(await text(page,'.ac-push-tile small'),/اضغط عشان يوصلك إشعار/);
 // the server refuses (a person of his house, a bad link): it is said, and it stays off
 await page.evaluate(()=>{window.__fakeRpcs.ar_account_push_save=()=>({ok:false,error:'not_owner'})});
 await page.click('.ac-push-tile');
 await page.waitForFunction(()=>/ما اتفعّلش/.test((document.querySelector('.ac-push-tile small')||{}).textContent||''));
 assert.equal(await page.$('.ac-push-tile.on'),null);
 // the pharmacy's own phone (the system is signed in): no tile
 await page.evaluate(()=>localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{}'));
 await page.goto(base+'store.html#me='+tok);await page.reload();await page.waitForSelector('.ac-al-tile');
 assert.equal(await page.$('.ac-push-tile'),null,'not on the pharmacy\'s phone');
},{home:true});

run('Account movement alerts: the account worker shows «فيه حركة جديدة على حسابك» and nothing else (no amount, no name), and a tap opens the account page; nothing inside the Android app',async({page,base})=>{
 await setup(page,'granted');await page.addInitScript(APPFAKE);
 await openAccount(page,base);await page.waitForSelector('.al-setup, .ac-al-tile');
 assert.equal(await page.$('.ac-push-tile'),null,'a WebView has no web push: the tile is not offered inside the app');
 // the worker file itself: run it with a fake worker scope
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','..','store','acct','sw.js'),'utf8');
 const shown=await page.evaluate((code)=>{
  const handlers={},out={shown:[],opened:[]};
  const self={registration:{scope:'https://x.test/asker-nawaqes/store/acct/',showNotification:async(t,o)=>{out.shown.push([t,o])}},skipWaiting(){},clients:{claim(){},matchAll:async()=>[],openWindow:async(u)=>{out.opened.push(u)}},addEventListener(t,f){handlers[t]=f}};
  new Function('self',code)(self);
  const waits=[];handlers.push({waitUntil:(p)=>waits.push(p)});
  return Promise.all(waits).then(()=>{const c={notification:{close(){},data:out.shown[0][1].data},waitUntil:(p)=>waits.push(p)};handlers.notificationclick(c);return Promise.all(waits)}).then(()=>out);
 },src);
 assert.equal(shown.shown.length,1);assert.equal(shown.shown[0][0],'صيدلية عسكر');assert.equal(shown.shown[0][1].body,'فيه حركة جديدة على حسابك، دوس عشان تشوفها');
 assert.ok(!/\d/.test(shown.shown[0][1].body),'no amount in the notification');
 assert.deepEqual(shown.opened,['https://x.test/asker-nawaqes/store.html#account'],'a tap opens the account page');
},{home:true});

run('Dose alarm inside the app: the «🔧 جهّز موبايلك» card (owner 2026-11-18, a Redmi: «عايز حاجة في متناول المستخدم الغبي»): one big button per missing step (battery question, the maker\'s autostart screen + «✓ عملتها»), a real-alarm test whose answer (waiting, failed, ok) comes from the phone, and a plain «موبايلك جاهز» when all is done',async({page,base})=>{
 await setup(page,'granted');await page.addInitScript(APPFAKE);
 await page.addInitScript(()=>{window.__app.battery=false;window.__app.autostart=true;window.__app.selftest='none'});
 await openAccount(page,base);await page.waitForSelector('.al-setup');   // (inside the app the alarm sheet is the screen: it is already open)
 assert.equal(await text(page,'.al-setup .al-app-head'),'🔧 جهّز موبايلك عشان المنبه يشتغل');
 await page.click('[data-al-ask="battery"]');await page.click('[data-al-ask="autostart"]');
 assert.deepEqual(await page.evaluate(()=>window.__app.asks),['battery','autostart'],'each button asks the app for its own screen');
 await page.click('[data-al-autodone]');assert.equal(await page.$('[data-al-ask="autostart"]'),null,'the autostart step is done once he says so');
 // the real test: waiting, then the phone says it blocked the alarm, then he tries again and it rings
 await page.click('[data-al-selftest]');assert.equal(await page.evaluate(()=>window.__app.selftests),1);
 assert.match(await text(page,'.al-setup'),/⏳ اقفل الشاشة وسيب الموبايل/);
 await page.evaluate(()=>{window.__app.selftest='failed'});await page.waitForSelector('.al-setup .al-warn',{timeout:15000});
 assert.match(await text(page,'.al-setup .al-warn'),/✗ المنبه ما رنّش: موبايلك بيمنعه/);
 await page.click('[data-al-selftest]');assert.equal(await page.evaluate(()=>window.__app.selftests),2);
 await page.evaluate(()=>{window.__app.battery=true;window.__app.selftest='ok'});
 await page.waitForFunction(()=>/✓ موبايلك جاهز: المنبه رنّ وهو مقفول/.test((document.querySelector('.al-setup')||{}).textContent||''),null,{timeout:15000});
 assert.equal(await page.$('.al-setup [data-al-ask]'),null,'nothing is asked any more');
},{home:true});

run('Alarm app card on the pharmacy app\'s home (owner 2026-11-18: «المنبه ينزل من جوه التطبيق»): an Android phone gets the card with the download button (the intent link, whose fallback is the download) and «⚠️ ده لأندرويد بس…» under it; once the app has opened from the button the card says connected and the button opens it',async({page,base})=>{
 await setup(page,'granted');await withUa(page,ANDROID_UA);
 await page.setViewportSize({width:375,height:812});await page.goto(base+'store.html');
 await page.waitForSelector('#alarmAppBox:not([hidden]) [data-al-getapp]');
 assert.equal(await text(page,'#alarmAppBox strong'),'منبه الدوا');
 assert.equal(await text(page,'#alarmAppBox .al-home-warn'),'⚠️ ده لأندرويد بس، ومش بيشتغل على الآيفون.');
 assert.equal(await text(page,'#alarmAppBox [data-al-getapp]'),'📲 نزّل تطبيق المنبه');
 const href=await page.$eval('#alarmAppBox [data-al-getapp]',e=>e.getAttribute('href'));
 assert.match(href,/^intent:\/\/alarm#Intent;scheme=askeralarm;package=com\.askerpharmacy\.alarm;S\.browser_fallback_url=https%3A%2F%2Fgithub\.com%2F[^;]+asker-alarm\.apk;end$/);
 // connected (the mark the button's tap leaves when the app opens): the card says so and the button opens the app
 await page.evaluate(()=>localStorage.setItem('asker_dose_app','1'));await page.reload();
 await page.waitForSelector('#alarmAppBox:not([hidden]) [data-al-getapp]');
 assert.equal(await text(page,'#alarmAppBox [data-al-getapp]'),'📲 افتح منبه الدوا');
 assert.match(await text(page,'#alarmAppBox'),/✓ متوصّل: المنبهات اللي بتظبطها هنا بتروح له لوحدها/);
},{home:true});

run('Alarm app card on the home: an iPhone sees the card and the note with NO download button; a computer, the pharmacy\'s own phone (the system is signed in) and the Android app itself see nothing',async({page,base})=>{
 await setup(page,'granted');await withUa(page,IPHONE_UA);
 await page.setViewportSize({width:375,height:812});await page.goto(base+'store.html');
 await page.waitForSelector('#alarmAppBox:not([hidden])');
 assert.equal(await text(page,'#alarmAppBox .al-home-warn'),'⚠️ ده لأندرويد بس، ومش بيشتغل على الآيفون.');
 assert.equal(await page.$('#alarmAppBox [data-al-getapp]'),null,'no download button on an iPhone');
 // the pharmacy's own phone, even on Android: nothing
 await withUa(page,ANDROID_UA);
 await page.evaluate(()=>localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{}'));await page.reload();
 await page.waitForSelector('#sections');
 assert.equal(await page.$eval('#alarmAppBox',e=>e.hidden),true,'hidden where the system is signed in');
 // a computer: nothing
 await page.evaluate(()=>localStorage.removeItem('sb-qwrzdjdgvanmhaicncuk-auth-token'));
 await withUa(page,'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
 await page.reload();await page.waitForSelector('#sections');
 assert.equal(await page.$eval('#alarmAppBox',e=>e.hidden),true,'hidden on a computer');
},{home:true});

run('Dose alarm hand-off (owner 2026-11-18: the work stays on the site, the «منبه الدوا» app only rings): once the app is connected every save / toggle / voice switch / delete hands the alarms to it (an askeralarm://handoff intent link sent from inside the tap); the button that opens the app marks it connected; before that, on a computer and in the app, nothing is sent',async({page,base})=>{
 await setup(page,'granted');
 await page.addInitScript((ua)=>{Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=>ua});window.__intents=[];window.__askerGoIntent=(u)=>window.__intents.push(u)},ANDROID_UA);
 await openAccount(page,base);
 await page.click('[data-al-open]');await page.waitForSelector('[data-al-new]');
 const add=async(name)=>{await page.click('[data-al-new]');await page.click('[data-al-pick="other"]');await page.fill('[data-al-name]',name);await page.click('[data-al-preset="once"]');await page.click('[data-al-save]');await page.waitForSelector('#alarmSheet .al-card')};
 const sent=()=>page.evaluate(()=>window.__intents.map(u=>{const m=/^intent:\/\/handoff#Intent;scheme=askeralarm;package=com\.askerpharmacy\.alarm;S\.alarms=([^;]+);S\.browser_fallback_url=([^;]+);end$/.exec(u);return m?{...JSON.parse(decodeURIComponent(m[1])),fb:decodeURIComponent(m[2])}:u}));
 // the answer is not known yet: the first save TRIES the hand-off, and the link carries a harmless fallback (this very page + #alarm-noapp: with no app Chrome goes there, never to Google Play)
 await add('فيموجيسال ق');
 let s=await sent();assert.equal(s.length,1,'the first save tries once');
 assert.match(s[0].fb,/^http.*store\.html#alarm-noapp$/);assert.deepEqual(s[0].app.items.map(i=>i.spoken),['فيموجيسال']);
 // no app on this phone: Chrome followed the fallback (only the hash changes): the page learns it, the address goes back to where it was, and the card keeps offering the download
 await page.evaluate(()=>{location.hash='#alarm-noapp'});
 await page.waitForFunction(()=>location.hash!=='#alarm-noapp'&&localStorage.getItem('asker_dose_noapp'));
 assert.equal(await page.evaluate(()=>location.hash),'#account','the address is back where it was (the store had already turned his link into #account)');
 assert.equal(await page.$('#alarmSheet [data-al-appoff]'),null);
 await add('زانبرازان ٢٠ قرص');
 assert.equal((await sent()).length,1,'no app (known for days): a save sends nothing more');
 // the button opened the app: the page went to the background right after the tap, so the app is there
 await page.evaluate(()=>document.querySelector('#alarmSheet [data-al-getapp]').addEventListener('click',(e)=>e.preventDefault(),true));   // (no real navigation in the test)
 await page.click('#alarmSheet [data-al-getapp]');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForSelector('[data-al-appoff]');
 assert.match(await text(page,'#alarmSheet .al-app-head'),/تطبيق «منبه الدوا» متوصّل/);
 assert.equal(await text(page,'#alarmSheet [data-al-getapp]'),'📲 افتح منبه الدوا');
 // a toggle goes over: the app's list (the name as it is said) and the site's own copy (kept as the seed of the app's page)
 const id0=await page.evaluate(()=>window.AskerStoreAlarm.data().items[0].id);
 await page.click(`[data-al-toggle="${id0}"]`);
 s=await sent();assert.equal(s.length,2);assert.equal(s[1].app.speak,true);
 assert.deepEqual(s[1].app.items.map(i=>[i.spoken,i.times]),[['زانبرازان',['08:00']]],'the switched-off alarm is not in the app\'s list');
 assert.deepEqual(s[1].page.items.map(i=>i.name),['فيموجيسال ق','زانبرازان ٢٠ قرص']);
 // the voice switch and a delete go over too
 await page.click('[data-al-speak]');
 s=await sent();assert.equal(s.length,3);assert.equal(s[2].app.speak,false);
 await page.click(`[data-al-edit="${id0}"]`);await page.waitForSelector('[data-al-del]');await page.click('[data-al-del]');
 await page.waitForSelector('#alarmSheet .al-card');
 s=await sent();assert.equal(s.length,4);assert.deepEqual(s[3].page.items.map(i=>i.name),['زانبرازان ٢٠ قرص'],'the deleted alarm is gone from the site\'s copy');
 // «مش متثبّت؟ شيل التوصيل»: back to the download box, and a save sends nothing again
 await page.click('[data-al-appoff]');await page.waitForSelector('#alarmSheet [data-al-getapp]');
 assert.equal(await text(page,'#alarmSheet [data-al-getapp]'),'📲 نزّل تطبيق المنبه');
 await page.click('[data-al-speak]');
 assert.equal((await sent()).length,4,'disconnected: nothing more is sent');
},{home:true});

run('Dose alarm hand-off, no tap needed (owner 2026-11-18: «لازم أروح لتطبيق المنبه»): the first save on an Android phone tries the hand-off by itself; when the fallback never comes (the app took it) the app is «connected» after a moment and every change goes over; the store\'s own router never sees the fallback hash',async({page,base})=>{
 await setup(page,'granted');
 await page.addInitScript((ua)=>{Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=>ua});window.__intents=[];window.__askerGoIntent=(u)=>window.__intents.push(u)},ANDROID_UA);
 await openAccount(page,base);
 // a listener added now comes AFTER the alarm script's own (the way the store's router does): it must never hear the marker hash
 await page.evaluate(()=>{window.__routed=0;window.addEventListener('hashchange',()=>{window.__routed++})});
 await page.click('[data-al-open]');await page.waitForSelector('[data-al-new]');
 const add=async(name)=>{await page.click('[data-al-new]');await page.click('[data-al-pick="other"]');await page.fill('[data-al-name]',name);await page.click('[data-al-preset="once"]');await page.click('[data-al-save]');await page.waitForSelector('#alarmSheet .al-card')};
 await add('فيموجيسال ق');
 assert.equal(await page.evaluate(()=>window.__intents.length),1,'the first save tried the hand-off');
 // nothing came back (no fallback): after a moment the app is connected, with no tap on any button
 await page.waitForFunction(()=>localStorage.getItem('asker_dose_app')==='1',null,{timeout:8000});
 await page.waitForSelector('[data-al-appoff]');
 assert.match(await text(page,'#alarmSheet .al-app-head'),/تطبيق «منبه الدوا» متوصّل/);
 await add('زانبرازان ٢٠ قرص');
 assert.equal(await page.evaluate(()=>window.__intents.length),2,'now every save goes over');
 // the app is removed later: the fallback comes, the page forgets «connected», and the router did not see the marker hash
 const before=await page.evaluate(()=>window.__routed);
 await page.evaluate(()=>{location.hash='#alarm-noapp'});
 await page.waitForFunction(()=>localStorage.getItem('asker_dose_app')==='0');
 assert.equal(await page.evaluate(()=>window.__routed),before,'the store\'s own hashchange listener never ran for the marker');
 assert.equal(await page.evaluate(()=>location.hash),'#account');
 await page.waitForSelector('#alarmSheet [data-al-getapp]');
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
 // what the customer reads: one plain line per thing; the technical lines stay folded
 assert.deepEqual(await page.$$eval('#alarmSheet .al-diag-sum p',els=>els.map(e=>e.textContent)),['✓ الموبايل بيشغّل صوت من الصفحة','✓ صوت الصيدلية الطبيعي وصل واشتغل','✓ صوت الموبايل العربي شغال']);
 assert.equal(await page.$('#alarmSheet details.al-diag-more[open]'),null,'the technical lines are folded');
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied=t}},configurable:true})});
 await page.click('[data-al-diagcopy]');await page.waitForFunction(()=>!!window.__copied);
 assert.equal(await page.evaluate(()=>window.__copied),d,'the copy is what is on the page');
 await page.waitForFunction(()=>/اتنسخت/.test(document.querySelector('[data-al-diagcopy]').textContent));
 // an engine that is not there at all and a sound that cannot play are written down too
 await page.evaluate(()=>{window.__beepMode='deny';Object.defineProperty(window,'speechSynthesis',{configurable:true,value:undefined})});
 await page.evaluate(()=>window.AskerStoreAlarm.runDiag());
 const d2=await page.$eval('#alarmSheet .al-diag',e=>e.textContent);assert.match(d2,/beep \(audio element\): rejected NotAllowedError/);assert.match(d2,/speechSynthesis: none/);
 assert.deepEqual(await page.$$eval('#alarmSheet .al-diag-sum p',els=>els.map(e=>e.textContent)),['✗ الموبايل مش بيشغّل صوت من الصفحة (الصوت واطي أو على الصامت)','✗ صوت الصيدلية الطبيعي وصل بس الموبايل ما شغّلوش','✗ الموبايل مفيهوش نطق خالص']);
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