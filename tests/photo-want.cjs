// «📷 صور مطلوبة» pure helpers (ar/photo-want.js, owner 2026-11-27): what still waits, what is added by itself from the prepared invoices, what is new for a number, the WhatsApp message and numbers.
const assert=require('node:assert/strict');
const P=require('../ar/photo-want.js');
const rows=[
 {item_id:1,name:'A TAB',why:'none',added_at:'2026-11-27T08:00:00Z',removed_at:null},
 {item_id:2,name:'B TAB',why:'picked',added_at:'2026-11-27T10:00:00Z',removed_at:null},
 {item_id:3,name:'C TAB',why:'none',added_at:'2026-11-27T09:00:00Z',removed_at:'2026-11-27T09:30:00Z'},   // his ✕
 {item_id:4,name:'D TAB',why:'none',added_at:'2026-11-27T11:00:00Z',removed_at:null},                    // photographed since
 {item_id:5,name:'E TAB',why:'none',added_at:'2026-11-20T11:00:00Z',removed_at:null}];                    // the night search found an internet photo: still waiting
const st={1:'none',2:'net',3:'none',4:'ok',5:'net'};
const w=P.waiting(rows,(id)=>st[id]);
assert.deepEqual(w.map((r)=>r.item_id),[2,1,5],'not the removed one, not the photographed one; the newest first');
assert.deepEqual(P.waiting(rows,()=>null),[],'before the photos are read nothing is shown');
const now=new Date('2026-11-27T12:00:00Z');
assert.equal(P.why(rows[1],now),'رشّحتها من المراجعة (صورتها مش تمام)');
assert.equal(P.why(rows[0],now),'من غير صورة · اتضافت النهارده');
assert.equal(P.why(rows[4],now),'من غير صورة');
// what is new for a number
assert.equal(P.newSince(w,null).length,3,'never sent: all of it');
assert.deepEqual(P.newSince(w,'2026-11-27T09:00:00Z').map((r)=>r.item_id),[2]);
assert.equal(P.newSince(w,'2026-11-27T23:00:00Z').length,0);
assert.equal(P.waText(w.slice(0,2)),'محتاجين صور للأصناف دي 📷 (صورة العلبة من قدّام)\n\n1) B TAB\n2) A TAB');
// numbers
for(const [a,b] of [['0100 000 0100','201000000100'],['+20 100 000 0100','201000000100'],['00201000000100','201000000100'],['1000000100','201000000100'],['٠١٠٠٠٠٠٠١٠٠','201000000100'],['123',''],['abc','']])assert.equal(P.intlPhone(a),b,a);
assert.equal(P.localPhone('201000000100'),'01000000100');assert.equal(P.localPhone('966500000000'),'966500000000');
// what the prepared invoices bring by themselves
const reviews=[{id:1,status:'ready',answers:{R3:{v:'reject'}},lines:[
  {n:1,id:7,name:'NO PHOTO  TAB'},{n:2,id:8,name:'INTERNET TAB'},{n:3,id:9,name:'REJECTED TAB'},{n:4,name:'NEW ITEM WITH NO CARD'},{n:5,id:7,name:'NO PHOTO TAB'},{n:6,id:1,name:'ALREADY ON THE LIST'}]},
 {id:2,status:'cancelled',lines:[{n:1,id:10,name:'CANCELLED INVOICE'}]},{id:3,status:'entered',lines:[{n:1,id:11,paper:'من الورقة'}]}];
const state=(id)=>(id===8?'net':id===12?'ok':'none');
assert.deepEqual(P.autoRows(reviews,rows,state),[{item_id:7,name:'NO PHOTO TAB',why:'none'},{item_id:11,name:'من الورقة',why:'none'}],'only the ones with no photo, once, with a card, not rejected, not already there (removed ones stay removed)');
assert.deepEqual(P.autoRows(reviews,rows,()=>null),[],'nothing is added before the photos are read');
console.log('PASS: photo list: waiting items, the automatic add, what is new for a number, the message and the numbers');
