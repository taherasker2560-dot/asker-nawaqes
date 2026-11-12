// ar/staff.js helpers: the open tabs, a closed tab falls on an open one, what he did in words, the WhatsApp message.
const assert=require('node:assert/strict');
const S=require('../ar/staff.js');
assert.deepEqual(S.allowedTabs(['expiry','tempsale','return','search']),['expiry','tempsale'],'extras are not tabs');
assert.equal(S.fixTab('short',['expiry','tempsale']),'expiry','another open tab of «المشتريات»');
assert.equal(S.fixTab('customers',['expiry']),'home','nothing open in «الحسابات»: his home');
assert.equal(S.fixTab('tempsale',['tempsale']),'tempsale');assert.equal(S.fixTab('home',[]),'home');
// every section key the server knows has a switch, and the other way round
const server=['short','read','translate','drafts','docs','suppliers','stock','count','expiry','customers','storeorders','tempsale','search','return','credit'];
assert.deepEqual(S.SECTIONS.map(x=>x[0]).sort(),[...server].sort());
// what he did
assert.equal(S.activityText({tbl:'ar_temp_sales',op:'insert',info:{no:14,n:3,total:274.7}}),'سجّل بيعة مؤقتة (#14 · 3 صنف · 274.7 ج)');
assert.equal(S.activityText({tbl:'ar_temp_sales',op:'insert',info:{kind:'return',n:1,total:20}}),'سجّل مرتجع (1 صنف · 20 ج)');
assert.equal(S.activityText({tbl:'ar_orders',op:'insert',info:{name:'ITEM'}}),'علّم «اتطلب» على «ITEM»');
assert.equal(S.activityText({tbl:'ar_shortages',op:'delete',info:{name:'ITEM'}}),'شال من النواقص «ITEM»');
assert.equal(S.activityText({tbl:'ar_documents',op:'update',info:{status:'entered'}}),'عدّل في الفواتير (entered)');
// the message: his name, the link, «ثبّت», keep it to yourself
const m=S.waMessage('موظف تجربة','https://x/#staff=abc');
assert.match(m,/أهلاً موظف تجربة/);assert.match(m,/https:\/\/x\/#staff=abc/);assert.match(m,/ثبّت/);assert.match(m,/ليك انت بس/);
console.log('PASS: staff helpers: open tabs, closed tab falls on an open one, activity in words, WhatsApp message');
