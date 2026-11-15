// The alerts file read by the bot (ar/alerts.js) and the notification rules (ar/notify.js): pure parts.
const assert=require('node:assert/strict');
global.window=global;
const A=require('../ar/alerts.js'),N=require('../ar/notify.js');
const file={generated_at:'2026-11-12T04:00:00Z',data_at:'2026-11-11T23:59:08',day_start:'2026-11-11T06:00:00',soon_until:'2027-03-01',
 tasks:{expiry_mix:[{id:1,name:'LAMIFEN CREAM',today:2,n7:5,last:'2026-11-11T22:34:52',parts:1,batches:[{store:1,exp:'2028-07-28',packs:2,units:0},{store:5,store_name:'مخزن انتظار ابن سينا',exp:'2028-09-28',packs:3,units:0}]},{id:2,name:'OLD ONE',today:0,n7:1,last:'2026-11-08T10:00:00',batches:[]}],
  negative:[{id:3,name:'EZAPRIL',today:1,n7:1,last:'2026-11-11T18:52:00',batches:[]}],expired_sold:[]},
 expiry:{expired:[{id:68195,name:'SOLONAL FACIAL WASH',exp:'2026-06-28',packs:1,value:150,batches:[{store:1,exp:'2026-06-28',packs:1,units:0}]}],soon:[{id:9,name:'X',exp:'2027-01-28',packs:2,value:300,batches:[]}]},
 customers:{owing:781,owed:388218,prepaid:102,over:[{id:5,name:'عميل تجربة',balance:5400.25,limit:1000,over:4400.25,pct:540,last_at:'2026-11-11T11:17:08',last_kind:'sale'}],near:[]}};
const a=A.parse(file);
assert.equal(a.mix.length,2);assert.equal(a.customers.over.length,1);assert.equal(A.parse({hello:1}),null,'not an alerts file');
// what needs work: only today's tasks count, the expired stock and the customers above their limit
assert.deepEqual(A.todo(a).map(t=>[t.key,t.n,t.tab,t.view]),[['mix',1,'expiry','today'],['negative',1,'expiry','today'],['expired',1,'expiry','expired'],['over',1,'customers','']]);
assert.equal(A.monthOf('2026-06-28'),'06/2026');assert.equal(A.monthOf(null),'من غير صلاحية');
assert.equal(A.batchText({store:1,exp:'2028-07-28',packs:2,units:0}),'07/2028: 2 علبة');
assert.equal(A.batchText({store:5,store_name:'مخزن انتظار ابن سينا',exp:'2028-09-28',packs:3,units:1}),'09/2028: 3 علبة و1 شريط (انتظار ابن سينا)','the store when it is not the main one');
assert.equal(A.money(388218),'388,218');assert.equal(A.value(a.expired),150);
assert.match(A.when('2026-11-11T22:34:52','2026-11-11T06:00:00'),/^10:34 م$/,'today: the clock only');
assert.match(A.when('2026-11-10T22:00:00','2026-11-11T06:00:00'),/^امبارح /);
assert.match(A.when('2026-11-05T09:05:00','2026-11-11T06:00:00'),/^05\/11 9:05 ص$/);
// the other bags (2026-11-15): absent in an older file = not counted yet; one home line per bag after the rest; late = more than 7 days
assert.equal(a.bags,null,'a file from before the bags');
const withBags=A.parse({...file,bags:{since:'2026-11-14',late_days:7,list:[
 {id:2274,name:'فارما مول',items:[{id:62386,name:'ZURCAL 40MG 14 TAB',have:1,sold30:33,min:0,need:16,last_buy:'2026-10-25',days:8,since:'2026-11-07'}]},
 {id:2654,name:'مالك',items:[{id:27382,name:'NEXIUM 40MG',have:0,sold30:1,min:0,need:1,last_buy:'2026-09-26',days:7,since:'2026-11-08'}]},
 {id:2446,name:'empty bag',items:[]}]}});
assert.deepEqual(withBags.bags.list.map(b=>[b.id,b.n,b.late]),[['2274',1,1],['2654',1,0]],'an empty bag is left out; 7 days is not late yet, 8 is');
const rowsB=A.todo(withBags);
assert.deepEqual(rowsB.slice(-2).map(t=>[t.key,t.tab,t.view,t.n,t.text,t.name,t.note]),[['bag','bags','bag:2274',1,'ناقص في حقيبة','فارما مول','منهم 1 بقالهم أكتر من 7 أيام'],['bag','bags','bag:2654',1,'ناقص في حقيبة','مالك','']]);
assert.deepEqual(rowsB.slice(0,4).map(t=>t.key),['mix','negative','expired','over'],'the bags come after the rest');
assert.equal(A.lateBags(withBags),1);assert.equal(A.lateBags(a),0);
assert.equal(A.dayText('2026-10-25','2026-11-14T23:38:50'),'25/10');assert.equal(A.dayText('2025-11-02','2026-11-14T23:38:50'),'02/11/2025');assert.equal(A.dayText(null,'2026'),'');
// notifications: a number that goes up rings; the first time only remembers; going down is quiet
assert.deepEqual(N.rises({incoming:2,docs:1},{incoming:3,docs:1,store:4}),['incoming']);
assert.deepEqual(N.rises({},{incoming:3}),[],'first time: nothing rings');
assert.deepEqual(N.rises({incoming:5},{incoming:1}),[]);
assert.deepEqual(N.groupCounts({incoming:2,docs:1,expiry:3,customers:4,store:1,care:2}),{purchases:6,accounts:4,sales:1,care:2});
assert.deepEqual(N.groupCounts({bags:2,docs:1}),{purchases:3,accounts:0,sales:0,care:0},'the late bags count on «المشتريات»');
// every section has a sound, every sound is well formed
for(const k of N.KINDS){assert.ok(N.SOUNDS[k.sound],k.key);assert.match(k.body(3),/3/)}
for(const [id,s] of Object.entries(N.SOUNDS)){assert.ok(s.name);for(const n of s.notes){assert.equal(n.length,5,id);assert.ok(n[0]>100&&n[2]>0&&n[3]<=1)}}
assert.equal(N.SOUNDS.none.notes.length,0);
console.log('alerts ok');
