// store/dose/sw.js (the dose alarm's push worker): what it does when a push arrives and when the customer taps the notification (owner 2026-11-18: «بعت اشعار بس وحتى لما دخلت اسمع اسم الدوا مشتغلش»).
// Run in a sandbox with a fake worker scope: no browser needed.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const src=fs.readFileSync('store/dose/sw.js','utf8');
const scope='https://example.test/asker/store/dose/';
function load(clients){
 const listeners={},calls={shown:[],opened:[],focused:[],posted:[],navigated:[]};
 const self={registration:{scope,showNotification:async(t,o)=>{calls.shown.push([t,o])}},skipWaiting(){},
  clients:{claim(){},matchAll:async()=>clients.map((c)=>({url:c.url,focus:async()=>{calls.focused.push(c.url)},navigate:async(u)=>{calls.navigated.push(u)},postMessage:(m)=>{calls.posted.push([c.url,JSON.parse(JSON.stringify(m))])}})),openWindow:async(u)=>{calls.opened.push(u)}},
  addEventListener:(t,f)=>{listeners[t]=f}};
 vm.runInNewContext(src,{self,URL,Promise,console},{filename:'sw.js'});
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
 console.log('dose-sw ok');
})().catch((e)=>{console.error(e);process.exit(1)});
