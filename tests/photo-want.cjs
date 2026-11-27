// «📷 صور مطلوبة» pure helpers (ar/photo-want.js, owner 2026-11-27, with his correction the same day: the NEW items come first and by themselves, every other item only because he put it):
// what still waits of each, the small line under a name, what is new for a number, the WhatsApp message and the numbers.
const assert=require('node:assert/strict');
const P=require('../ar/photo-want.js');
// ---- the items under them ----
// (his second word, 2026-11-27: the items with no photo come by themselves too, under the new ones; and he adds any item whose photo is wrong)
const rows=[
 {item_id:1,name:'A TAB',why:'picked',added_at:'2026-11-27T08:00:00Z',removed_at:null},
 {item_id:2,name:'B TAB',why:'picked',added_at:'2026-11-27T10:00:00Z',removed_at:null},
 {item_id:3,name:'C TAB',why:'picked',added_at:'2026-11-27T09:00:00Z',removed_at:'2026-11-27T09:30:00Z'},   // his ✕
 {item_id:4,name:'D TAB',why:'picked',added_at:'2026-11-27T11:00:00Z',removed_at:null}];                   // photographed since
const st={1:'none',2:'net',3:'none',4:'ok'};
const w=P.waiting(rows,(id)=>st[id],(id)=>(id===4?'2026-11-27T12:00:00Z':null));
assert.deepEqual(w.map((r)=>r.key),['i:2','i:1'],'not the removed one, not the photographed one; the newest first');
assert.deepEqual(P.waiting(rows,()=>null),[],'before the photos are read nothing is shown');
// one he added although a person had chosen its photo: it waits for a new photo, or «تمام», AFTER he added it; one that came by itself leaves with any person's photo
const two=[{item_id:7,name:'G',why:'picked',added_at:'2026-11-27T10:00:00Z',removed_at:null},{item_id:8,name:'H',why:'none',added_at:'2026-11-27T10:00:00Z',removed_at:null}];
const ok=()=>'ok';
assert.deepEqual(P.waiting(two,ok,()=>'2026-11-20T08:00:00Z').map((r)=>r.item_id),[7],'the old choice does not count against what he added later');
assert.deepEqual(P.waiting(two,ok,()=>null).map((r)=>r.item_id),[7]);
assert.deepEqual(P.waiting(two,ok,()=>'2026-11-27T11:00:00Z').map((r)=>r.item_id),[],'a new photo after he added it: done');
// what the prepared invoices bring by themselves: the items with no photo, once, with a card, not rejected, and never one already there (one he took off stays off)
const reviews=[{id:1,status:'ready',answers:{R3:{v:'reject'}},lines:[{n:1,id:77,name:'NO PHOTO  TAB'},{n:2,id:78,name:'INTERNET TAB'},{n:3,id:79,name:'REJECTED TAB'},{n:4,name:'NEW ITEM WITH NO CARD'},{n:5,id:77,name:'NO PHOTO TAB'},{n:6,id:3,name:'HE TOOK IT OFF'}]},
 {id:2,status:'cancelled',lines:[{n:1,id:80,name:'CANCELLED INVOICE'}]},{id:3,status:'entered',lines:[{n:1,id:81,paper:'من الورقة'}]}];
assert.deepEqual(P.autoRows(reviews,rows,(id)=>(id===78?'net':'none')),[{item_id:77,name:'NO PHOTO TAB',why:'none'},{item_id:81,name:'من الورقة',why:'none'}]);
assert.deepEqual(P.autoRows(reviews,rows,()=>null),[],'nothing is added before the photos are read');
// ---- the new items ----
const line=(review,n,extra)=>({review_id:review,line_n:String(n),name:'صنف '+review+'-'+n,supplier:'مورد مثال',gone:false,removed_at:null,added_at:'2026-11-27T0'+n+':00:00Z',...extra});
const news=[line(5,1),line(5,2),line(5,3),line(5,4,{gone:true}),line(5,5,{removed_at:'2026-11-27T09:00:00Z'}),line(5,6),line(5,7),line(5,8),line(5,9)];
const read=(n,status,result,at='2026-11-27T10:00:00Z')=>({review_id:5,line_n:String(n),status,result,created_at:at});
const reads=[read(2,'pending'),read(3,'done',{found:true,name_en:'X'}),read(6,'failed'),read(7,'done',{found:false}),read(8,'applied',{found:true}),
 read(9,'failed',null,'2026-11-27T09:00:00Z'),read(9,'reading',null,'2026-11-27T09:30:00Z'),read(1,'cancelled')];
const nw=P.newWaiting(news,reads);
assert.deepEqual(nw.map((e)=>e.line_n+(e.retry?' again':'')),['7 again','6 again','1'],'sent / being read / read / on its card = done; failed or nothing found = again; rejected and his ✕ are out; the newest reading decides');
assert.equal(nw[2].key,'n:5|1');assert.equal(nw[2].kind,'new');
assert.deepEqual(P.newWaiting([],reads),[]);
// ---- the small line ----
assert.equal(P.why(nw[2],true),'من فاتورة مورد مثال');
assert.equal(P.why(nw[2],false),'صوّر العلبة من قدّام','a user is not told whose invoice');
assert.equal(P.why(nw[0],true),'الصورة ما اتقرتش، صوّرها تاني');
assert.equal(P.why(w[0],true),'إنت ضفتها من المراجعة');assert.equal(P.why({...w[0],why:'none'},true),'من غير صورة');assert.equal(P.why(w[0],false),'صوّرها أو هاتها من الصور');
// ---- what is new for a number, and the message (new items first, and marked) ----
const all=nw.concat(w);
assert.equal(P.newSince(all,null).length,5,'never sent: all of it');
assert.deepEqual(P.newSince(all,'2026-11-27T06:30:00Z').map((r)=>r.key),['n:5|7','i:2','i:1']);
assert.equal(P.newSince(all,'2026-11-27T23:00:00Z').length,0);
assert.equal(P.waText([nw[2],w[0]]),'محتاجين صور للأصناف دي 📷 (صورة العلبة من قدّام)\n\n1) صنف 5-1 (صنف جديد)\n2) B TAB');
// ---- numbers ----
for(const [a,b] of [['0100 000 0100','201000000100'],['+20 100 000 0100','201000000100'],['00201000000100','201000000100'],['1000000100','201000000100'],['٠١٠٠٠٠٠٠١٠٠','201000000100'],['123',''],['abc','']])assert.equal(P.intlPhone(a),b,a);
assert.equal(P.localPhone('201000000100'),'01000000100');assert.equal(P.localPhone('966500000000'),'966500000000');
console.log('PASS: photo list: new items first, then the ones with no photo by themselves and the wrong ones he adds, what is new for a number, the message and the numbers');
