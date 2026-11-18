// store/dose/sw.js (the dose alarm's push worker): what it does when a push arrives and when the customer taps the notification (owner 2026-11-18: «بعت اشعار بس وحتى لما دخلت اسمع اسم الدوا مشتغلش»).
// Run in a sandbox with a fake worker scope: no browser needed.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const src=fs.readFileSync('store/dose/sw.js','utf8');
const scope='https://example.test/asker/store/dose/';
// a fake IndexedDB that answers the one read the worker makes: the page's copy of the enabled alarms ({items:[{spoken, times}]}), or nothing / an error
function fakeIdb(stored,mode){
 return {open(){const req={};setTimeout(()=>{
  if(mode==='error'){req.onerror&&req.onerror();return}
  const g={};req.result={createObjectStore(){},close(){},transaction:()=>({objectStore:()=>({get:()=>{setTimeout(()=>{if(mode==='geterror'){g.onerror&&g.onerror();return}g.result=stored;g.onsuccess&&g.onsuccess()});return g}})})};
  req.onupgradeneeded&&req.onupgradeneeded();req.onsuccess&&req.onsuccess()});return req}};
}
function load(clients,o={}){
 const listeners={},calls={shown:[],opened:[],focused:[],posted:[],navigated:[]};
 const self={registration:{scope,showNotification:async(t,o)=>{calls.shown.push([t,o])}},skipWaiting(){},
  clients:{claim(){},matchAll:async()=>clients.map((c)=>({url:c.url,focus:async()=>{calls.focused.push(c.url)},navigate:async(u)=>{calls.navigated.push(u)},postMessage:(m)=>{calls.posted.push([c.url,JSON.parse(JSON.stringify(m))])}})),openWindow:async(u)=>{calls.opened.push(u)}},
  addEventListener:(t,f)=>{listeners[t]=f}};
 if(o.idb!==undefined)self.indexedDB=o.idb;
 // the phone's clock: «now» is a fixed time of day
 class FakeDate extends Date{constructor(...a){a.length?super(...a):super(2026,10,18,o.h==null?8:o.h,o.m==null?0:o.m,20)}}
 vm.runInNewContext(src,{self,URL,Promise,console,Date:FakeDate,setTimeout},{filename:'sw.js'});
 const fire=async(type,ev)=>{let p=Promise.resolve();ev.waitUntil=(x)=>{p=x};listeners[type](ev);await p};
 return {calls,fire};
}
(async()=>{
 // a push: the notification says it is the dose time, nothing about a medicine; an open page is told at once
 let w=load([{url:'https://example.test/asker/store.html#account'},{url:'https://example.test/other.html'}]);
 await w.fire('push',{});
 assert.equal(w.calls.shown.length,1);assert.equal(w.calls.shown[0][0],'⏰ ميعاد دواك');
 assert.equal(w.calls.shown[0][1].tag,'asker-dose');assert.equal(w.calls.shown[0][1].requireInteraction,true);assert.equal(w.calls.shown[0][1].data.url,'https://example.test/asker/store.html#account');
 assert.equal(w.calls.shown[0][1].body,'دوس عشان تسمع اسم الدوا وتاخده','the same words for everyone: the worker knows no medicine name');
 assert.deepEqual(w.calls.posted.map(([,m])=>m.type),['dose-due','dose-due'],'every window hears it');
 // a tap, the page already open: it is told «opened from a dose notification», brought to the front, and NOT reloaded (a reload threw its ring away)
 w=load([{url:'https://example.test/asker/store.html#cart'}]);
 await w.fire('notificationclick',{notification:{close(){},data:{url:'https://example.test/asker/store.html#account'}}});
 assert.deepEqual(w.calls.posted,[['https://example.test/asker/store.html#cart',{type:'dose-open',kind:'dose'}]]);
 assert.deepEqual(w.calls.focused,['https://example.test/asker/store.html#cart']);assert.deepEqual(w.calls.navigated,[]);assert.deepEqual(w.calls.opened,[]);
 // a tap, no page open: a new window with ?dose=1, the account's hash kept
 w=load([]);
 await w.fire('notificationclick',{notification:{close(){},data:{url:'https://example.test/asker/store.html#account'}}});
 assert.deepEqual(w.calls.opened,['https://example.test/asker/store.html?dose=1#account']);
 // no data at all (an old notification): the account page of this worker's own scope
 w=load([]);
 await w.fire('notificationclick',{notification:{close(){},data:null}});
 assert.deepEqual(w.calls.opened,['https://example.test/asker/store.html?dose=1#account']);
 // the «جرّب الإشعار» notification: kind test, both ways
 w=load([{url:'https://example.test/asker/store.html#account'}]);
 await w.fire('notificationclick',{notification:{close(){},data:{url:'https://example.test/asker/store.html#account',kind:'test'}}});
 assert.deepEqual(w.calls.posted.map(([,m])=>m),[{type:'dose-open',kind:'test'}]);
 w=load([]);
 await w.fire('notificationclick',{notification:{close(){},data:{url:'https://example.test/asker/store.html#account',kind:'test'}}});
 assert.deepEqual(w.calls.opened,['https://example.test/asker/store.html?dose=test#account']);
 // a page's address that already has a query keeps it
 w=load([]);
 await w.fire('notificationclick',{notification:{close(){},data:{url:'https://example.test/asker/store.html?lang=en#account',kind:'dose'}}});
 assert.deepEqual(w.calls.opened,['https://example.test/asker/store.html?lang=en&dose=1#account']);

 // ---- the medicine's name in the notification (2026-11-18): read from the page's copy on THIS phone, at the push; nothing found = the plain one ----
 const A=[{id:'a1',spoken:'فيموجيسال',times:['08:00','20:00']},{id:'a2',spoken:'بنادول',times:['14:00']},{id:'a3',spoken:'اوميز',times:['08:02']}];
 const title=async(o)=>{const w=load([],o);await w.fire('push',{});return {t:w.calls.shown[0][0],b:w.calls.shown[0][1].body,w}};
 let r=await title({idb:fakeIdb({items:A}),h:8,m:0});
 assert.equal(r.t,'⏰ ميعاد فيموجيسال الآن');assert.equal(r.b,'خدمة مقدمة من صيدلية عسكر. دوس عشان تسمع الاسم وتاخده');assert.equal(r.w.calls.shown[0][1].tag,'asker-dose');assert.equal(r.w.calls.shown[0][1].requireInteraction,true);
 assert.equal((await title({idb:fakeIdb({items:A}),h:8,m:2})).t,'⏰ ميعاد فيموجيسال، واوميز الآن','two at once, and the one two minutes late still counts');
 assert.equal((await title({idb:fakeIdb({items:A}),h:8,m:3})).t,'⏰ ميعاد فيموجيسال، واوميز الآن','three minutes late is still this dose');
 assert.equal((await title({idb:fakeIdb({items:A}),h:8,m:4})).t,'⏰ ميعاد اوميز الآن','four minutes late: the 08:00 one is no longer this dose, the 08:02 one is');
 assert.equal((await title({idb:fakeIdb({items:A}),h:8,m:6})).t,'⏰ ميعاد دواك','more than three minutes after the last time: the plain one');
 assert.equal((await title({idb:fakeIdb({items:A}),h:13,m:59})).t,'⏰ ميعاد دواك','not yet');
 assert.equal((await title({idb:fakeIdb({items:A}),h:14,m:0})).t,'⏰ ميعاد بنادول الآن');
 assert.equal((await title({idb:fakeIdb({items:A}),h:20,m:1})).t,'⏰ ميعاد فيموجيسال الآن','the second time of the day');
 // no copy, an empty one, a broken one, no IndexedDB at all: the plain notification (the push is never lost)
 for(const [label,o] of [['nothing stored',{idb:fakeIdb(undefined)}],['empty list',{idb:fakeIdb({items:[]})}],['not a list',{idb:fakeIdb({items:'x'})}],['open fails',{idb:fakeIdb(null,'error')}],['read fails',{idb:fakeIdb(null,'geterror')}],['no IndexedDB',{}]]){
  r=await title({...o,h:8,m:0});assert.equal(r.t,'⏰ ميعاد دواك',label);assert.equal(r.b,'دوس عشان تسمع اسم الدوا وتاخده',label);assert.equal(r.w.calls.shown.length,1,label+': one notification');
 }
 // junk in the copy is ignored: an entry with no name, bad times, a long name cut, at most four names
 r=await title({idb:fakeIdb({items:[{spoken:'',times:['08:00']},{spoken:'ا',times:['25:99','x']},null,{spoken:'سيرنجا',times:null},{spoken:'ب'.repeat(90),times:['08:00']}]}),h:8,m:0});
 assert.equal(r.t,'⏰ ميعاد '+'ب'.repeat(60)+' الآن');
 const five=['أ','ب','ج','د','هـ'].map((s)=>({spoken:s,times:['09:00']}));
 assert.equal((await title({idb:fakeIdb({items:five}),h:9,m:0})).t,'⏰ ميعاد أ، وب، وج، ود الآن','four names at most');
 // the open page still hears it (the push is for it too), and a tap still opens it
 const w2=load([{url:'https://example.test/asker/store.html#account'}],{idb:fakeIdb({items:A}),h:8,m:0});await w2.fire('push',{});assert.deepEqual(w2.calls.posted.map(([,m])=>m.type),['dose-due']);
 console.log('dose-sw ok');
})().catch((e)=>{console.error(e);process.exit(1)});
