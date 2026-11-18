// Customers' accounts (ar/customers.js, owner 2026-11-12 «ا»): the list's numbers, search and order, and the statement's
// texts and month sums. Made-up customers only: the repository is public.
const assert=require('node:assert/strict');
const L=require('../ar/customers.js');
const C=[
 {id:101,name:'أحمد محمود',credit_limit:5000,balance:7174.5,last_at:'2026-11-12T16:32:00',last_kind:'sale'},
 {id:102,name:'سامية عبد الله',credit_limit:10000,balance:9500,last_at:'2026-11-11T09:10:00',last_kind:'payment'},
 {id:103,name:'هدى كمال',credit_limit:10000,balance:912,last_at:'2026-11-02T12:00:00',last_kind:'sale'},
 {id:104,name:'مصطفى إبراهيم',credit_limit:10000,balance:-200,last_at:'2026-10-01T12:00:00',last_kind:'payment'},
 {id:105,name:'منى فتحي',credit_limit:0,balance:0.27,last_at:null,last_kind:null},
 {id:2489,name:'عميل بكود',credit_limit:null,balance:15,last_at:'2026-11-01T10:00:00',last_kind:'sale'},
];
// the numbers on top: crumbs under half a pound are settled
// and the net debt (owner 2026-11-13): what they owe minus what we owe the ones who paid ahead
assert.deepEqual(L.counts(C),{over:1,near:1,owing:4,prepaid:1,all:6,owed:17601.5,credit:200,net:17401.5});
// «عدّوا الحد»: over first, then near; «عليهم» by balance; «ليهم» the biggest credit first; «الكل» by name
assert.deepEqual(L.pick(C,'over','').rows.map(c=>c.id),[101,102]);
assert.deepEqual(L.pick(C,'owing','').rows.map(c=>c.id),[102,101,103,2489]);
assert.deepEqual(L.pick(C,'prepaid','').rows.map(c=>c.id),[104]);
assert.equal(L.pick(C,'all','').rows.length,6);
// search: Arabic spelled another way, part of the name, the code; searching from «عدّوا الحد» looks in everyone
assert.deepEqual(L.pick(C,'all','احمد').rows.map(c=>c.id),[101]);
assert.deepEqual(L.pick(C,'all','مصطفي ابراهيم').rows.map(c=>c.id),[104]);
assert.deepEqual(L.pick(C,'all','هدي').rows.map(c=>c.id),[103]);
assert.deepEqual(L.pick(C,'all','٢٤٨٩').rows.map(c=>c.id),[2489]);
assert.deepEqual(L.pick(C,'all','248').rows.map(c=>c.id),[2489],'3+ digits: the start of a code');
const r=L.pick(C,'over','منى');assert.equal(r.view,'all');assert.deepEqual(r.rows.map(c=>c.id),[105]);
// «عملاء التوصيل» (owner 2026-11-19; PharmaFly's delivery-customer cards, kind 'pickup'): the same accounts but APART. Not in the numbers, «عدّوا الحد», «عليهم», «ديون قديمة»; their own view;
// a name search from «الكل» finds them, a late medicine («💊 مزمن») counts like anyone's.
const D=[...C,
 {id:2902,name:'عميل توصيل تجربة',credit_limit:0,balance:350,last_at:'2026-11-12T10:00:00',last_kind:'sale',kind:'pickup'},
 {id:2903,name:'منى توصيل',credit_limit:null,balance:9000,last_at:'2026-08-01T10:00:00',last_kind:'sale',kind:'pickup'}];
assert.equal(L.isPickup(D[6]),true);assert.equal(L.isPickup(C[0]),false,'no kind = a credit customer');assert.equal(L.isPickup(null),false);
assert.deepEqual(L.creditOnly(D).map(c=>c.id),C.map(c=>c.id));
assert.deepEqual(L.counts(L.creditOnly(D)),L.counts(C),'the credit numbers do not change when delivery customers exist');
assert.deepEqual(L.counts(D.filter(L.isPickup)),{over:0,near:0,owing:2,prepaid:0,all:2,owed:9350,credit:0,net:9350},'their own numbers');
assert.deepEqual(L.pick(D,'over','').rows.map(c=>c.id),[101,102]);
assert.deepEqual(L.pick(D,'owing','').rows.map(c=>c.id),[102,101,103,2489],'owing: credit customers only');
assert.equal(L.pick(D,'all','').rows.length,6,'the list «الكل» has the credit customers only');
assert.deepEqual(L.pick(D,'pickup','').rows.map(c=>c.id),[2903,2902],'their own chip: most owed first');
assert.deepEqual(L.pick(D,'pickup','تجربة').rows.map(c=>c.id),[2902],'searching inside their chip');
assert.deepEqual(L.pick(D,'all','توصيل').rows.map(c=>c.id),[2902,2903],'a name search from «الكل» finds them too (by name)');
assert.deepEqual(L.pick(D,'owing','منى').rows.map(c=>c.id),[],'a search from «عليهم» stays inside the credit customers');
assert.equal(L.pick(D,'chronic','').rows.length,8,'«💊 مزمن» is about medicines: everyone');
assert.deepEqual(L.oldCounts(L.creditOnly(D),60,new Date(2026,10,13)),L.oldCounts(C,60,new Date(2026,10,13)),'a delivery customer\'s old debt is not an «old debt»');
// the balance in words
assert.deepEqual(L.balanceText(7174.5),{cls:'owe',text:'عليه 7,174.50 ج'});
assert.deepEqual(L.balanceText(-227.4),{cls:'paid',text:'ليه 227.40 ج'});
assert.deepEqual(L.balanceText(0.27),{cls:'zero',text:'خالص'});
assert.equal(L.money(10420),'10,420');assert.equal(L.money(166.7),'166.70');assert.equal(L.money(-0.001),'0');
// movements: title, balance after, items
assert.equal(L.moveTitle({kind:'sale',total:166.7,paid:0}).text,'فاتورة بيع 166.70 ج');
assert.equal(L.moveTitle({kind:'return',total:-54,paid:0}).text,'مرتجع 54 ج');
assert.equal(L.moveTitle({kind:'payment',total:0,paid:8000}).text,'دفعة 8,000 ج');
assert.equal(L.moveTitle({kind:'refund',total:0,paid:-200}).text,'رجّعناله 200 ج');
assert.equal(L.afterText(7174.5),'بعدها: عليه 7,174.50 ج');assert.equal(L.afterText(-227.4),'بعدها: ليه 227.40 ج');assert.equal(L.afterText(0.1),'بعدها: خالص');
assert.deepEqual([1,2,3,10,11].map(L.itemsWord),['صنف واحد','صنفين','3 أصناف','10 أصناف','11 صنف']);
// a line: price of a pack × (packs + strips / strips in a pack) − discount
assert.equal(Math.round(L.lineValue({s:288,p:0,u:1,k:3,d:0})*100)/100,96);
assert.equal(L.lineValue({s:170,p:1,u:0,k:1,d:0}),170);
assert.equal(L.lineValue({s:50,p:2,u:1,k:2,d:5}),120);
assert.equal(L.lineValue({s:24,p:1,u:0,k:0}),24,'no strips count = 1');
// the customer's discount: the items' value minus what was charged (PharmaFly's Total minus the ticket's Discount)
assert.equal(L.discountOf({kind:'sale',total:336.97,items:[{s:374,p:1,u:0,k:2,d:0}]}),37.03);
assert.equal(L.discountOf({kind:'return',total:-48.65,items:[{s:54,p:1,u:0,k:1,d:0}]}),5.35);
assert.equal(L.discountOf({kind:'sale',total:374,items:[{s:374,p:1,u:0,k:2,d:0}]}),0,'no discount');
assert.equal(L.discountOf({kind:'sale',total:100.3,items:[{s:100,p:1,u:0,k:1,d:0}]}),0,'never a negative discount');
assert.equal(L.discountOf({kind:'payment',total:0,items:[{s:0,p:1}]}),0);
// this month: sales minus returns, and everything paid (on a sale too) minus refunds
const now=new Date(2026,10,12,12,0,0);
const M=[
 {id:1,at:'2026-11-12T10:33:00',kind:'sale',total:166.7,paid:0},
 {id:2,at:'2026-11-11T16:32:00',kind:'return',total:-54,paid:0},
 {id:3,at:'2026-11-05T13:07:00',kind:'payment',total:0,paid:8000},
 {id:4,at:'2026-11-04T10:00:00',kind:'sale',total:191,paid:700},
 {id:5,at:'2026-11-03T10:00:00',kind:'refund',total:0,paid:-100},
 {id:6,at:'2026-10-31T23:59:00',kind:'sale',total:999,paid:0},
];
assert.deepEqual(L.monthSums(M,now),{bought:166.7-54+191,paid:8000+700-100});
assert.deepEqual(L.movesFor(M,'sales').map(m=>m.id),[1,2,4,6]);
assert.deepEqual(L.movesFor(M,'payments').map(m=>m.id),[3,4,5]);
assert.deepEqual(L.sortMoves([{id:1,at:'2026-11-01T10:00:00'},{id:3,at:'2026-11-02T09:00:00'},{id:2,at:'2026-11-01T10:00:00'}]).map(m=>m.id),[3,2,1]);
// days and times
assert.equal(L.dayLabel(L.parseAt('2026-11-12T01:00:00'),now),'النهارده');
assert.equal(L.dayLabel(L.parseAt('2026-11-11T23:00:00'),now),'امبارح');
assert.equal(L.dayLabel(L.parseAt('2026-11-05T13:07:00'),now),'05/11/2026');
assert.equal(L.whenText('2026-11-12T16:32:00',now),'النهارده 4:32 م');
assert.equal(L.whenText('2026-11-11T09:10:00',now),'امبارح 9:10 ص');
assert.equal(L.whenText('2026-11-02T12:00:00',now),'02/11/2026');
assert.equal(L.whenText(null,now),'');
// WhatsApp numbers: kept with the country code, shown the local way
assert.equal(L.intlPhone('01012345678'),'201012345678');
assert.equal(L.intlPhone('٠١٠١٢٣٤٥٦٧٨'),'201012345678');
assert.equal(L.intlPhone('+20 101 234 5678'),'201012345678');
assert.equal(L.intlPhone('0020 101-234-5678'),'201012345678');
assert.equal(L.intlPhone('1012345678'),'201012345678');
assert.equal(L.intlPhone('0222334455'),'20222334455','a Cairo landline');
assert.equal(L.intlPhone('+966 50 123 4567'),'966501234567','another country stays');
assert.equal(L.intlPhone('123'),'');assert.equal(L.intlPhone(''),'');
assert.equal(L.showPhone('201012345678'),'0101 234 5678');
assert.equal(L.showPhone('966501234567'),'+966501234567');
// what a phone's contacts app shares: plain text, or a contact card (vCard, the Arabic name quoted-printable)
assert.deepEqual(L.numbersIn('جار الصيدلية\n+20 101 111 2222\nموبايل: 0101 111 2222\n0222334455'),[{p:'201011112222',name:'جار الصيدلية'},{p:'20222334455',name:'جار الصيدلية'}]);
assert.deepEqual(L.numbersIn('BEGIN:VCARD\r\nVERSION:2.1\r\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D8=A7=D9=84=D8=A7=D8=A8=D9=86\r\nTEL;CELL:010-4444-5555\r\nitem1.TEL;TYPE=WORK:+20 2 2233 4455\r\nEND:VCARD'),[{p:'201044445555',name:'الابن'},{p:'20222334455',name:'الابن'}]);
assert.deepEqual(L.numbersIn('BEGIN:VCARD\nFN:A\nTEL:01011112222\nEND:VCARD\nBEGIN:VCARD\nFN:B\nTEL:01033334444\nEND:VCARD').map(x=>x.name+x.p),['A201011112222','B201033334444']);
assert.deepEqual(L.numbersIn('جار الصيدلية'),[]);
assert.deepEqual(L.numbersIn(''),[]);
// «ديون قديمة» (owner 2026-11-16): owes AND nothing moved for 30 / 60 / 90 days; most owed first; no movement date = not counted
{
  const now=new Date(), ago=(d)=>{const x=new Date(now.getTime()-d*864e5);const p=n=>String(n).padStart(2,'0');return `${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}:00`};
  const O=[
   {id:1,name:'قديم كبير',balance:3000,last_at:ago(70)},{id:2,name:'قديم صغير',balance:400,last_at:ago(95)},
   {id:3,name:'حديث',balance:800,last_at:ago(5)},{id:4,name:'مقدم',balance:-100,last_at:ago(80)},
   {id:5,name:'من غير تاريخ',balance:50,last_at:null},{id:6,name:'خالص',balance:0.2,last_at:ago(200)},
   {id:7,name:'على الحد بالظبط',balance:100,last_at:ago(60)},
  ];
  assert.equal(L.daysSince(O[0],now),70);assert.equal(L.daysSince(O[4],now),null);
  assert.deepEqual(O.filter(c=>L.isOld(c,60,now)).map(c=>c.id),[1,2,7],'60 days: 60 itself counts; a prepaid, a crumb, a recent and a dateless one do not');
  assert.deepEqual(O.filter(c=>L.isOld(c,90,now)).map(c=>c.id),[2]);
  assert.deepEqual(O.filter(c=>L.isOld(c,30,now)).map(c=>c.id),[1,2,7]);
  assert.deepEqual(L.oldCounts(O,60,now),{n:3,amount:3500});
  assert.deepEqual(L.oldCounts(O,90,now),{n:1,amount:400});
  assert.deepEqual(L.oldCounts([],60,now),{n:0,amount:0});
  // pick(list,'old',q,days): biggest debt first, searchable by name
  const pk=(q,d)=>L.pick(O,'old',q,d).rows.map(c=>c.id);
  assert.deepEqual(pk('',60),[1,2,7],'the biggest debt first');
  assert.deepEqual(pk('',90),[2]);
  assert.equal(L.pick(O,'old','',60).view,'old');
  assert.deepEqual(pk('صغير',60),[2]);
  // the reminder: the name, the amount, the day of the last movement; none of it when there is no date
  const m=L.reminderMessage('أحمد',1250.5,'2026-09-02T10:00:00');
  assert.match(m,/يا أحمد/);assert.match(m,/1,250.50 ج/);assert.match(m,/آخر حركة على الحساب يوم 02\/09\/2026/);
  assert.doesNotMatch(L.reminderMessage('أحمد',100,null),/آخر حركة/);
}console.log('customers ok');
