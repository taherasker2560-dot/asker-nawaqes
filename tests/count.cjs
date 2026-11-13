// «جرد المخزون» helpers (ar/count.js): differences per expiry batch in words, the row sent to ar_count_entries, progress per
// section, the latest entry per item. Made-up items only.
const assert=require('node:assert/strict');
const C=require('../ar/count.js');
assert.equal(C.secName(3,'TABLETS + CAPSULES'),'أقراص وكبسول');assert.equal(C.secName(999,'NEW ONE'),'NEW ONE');assert.equal(C.secName(0,''),'من غير قسم');
assert.equal(C.toUnits(2,1,3),7);assert.equal(C.toUnits(2,0,1),2);
assert.equal(C.amountText(-1,1),'علبة');assert.equal(C.amountText(3,1),'3 علب');assert.equal(C.amountText(7,3),'2 علبة ووحدة');
assert.equal(C.amountText(-2,3),'2 وحدة');assert.equal(C.amountText(4,2),'2 علبة');
// the owner's examples
assert.equal(C.diffLine({x:'2027-10',d:-1},1),'ناقص علبة من صلاحية 10/2027');
assert.equal(C.diffLine({x:'2027-12',d:1},1),'زايد علبة في صلاحية 12/2027');
assert.equal(C.diffLine({x:null,d:-2},1),'ناقص 2 علبة');
assert.equal(C.mixedDates([{x:'2027-12',d:1},{x:'2027-09',d:-1}]),true,'1 more in one batch, 1 less in another: dates mixed up');
assert.equal(C.mixedDates([{x:'2027-10',d:-1}]),false);
// the row: only the batches that differ, a new batch found, a wrong section
const item={i:63476,n:'ITEM ONE TAB',s:3,p:1,b:[{x:'2029-07',k:2,u:0},{x:'2029-08',k:9,u:0}]};
const ok=C.entry({id:'a',at:'t',item,edits:{},extra:[],sectionTo:null});
assert.equal(ok.result,'ok');assert.deepEqual(ok.diffs,[]);assert.equal(ok.section_to,null);assert.deepEqual(ok.system,item.b);
const d=C.entry({id:'b',at:'t',item,edits:{'2029-07':-1,'2029-08':0},extra:[{x:'2030-01',d:1}],sectionTo:33,note:'  رف تاني '});
assert.equal(d.result,'diff');assert.deepEqual(d.diffs,[{x:'2029-07',d:-1},{x:'2030-01',d:1}]);assert.equal(d.section_from,3);assert.equal(d.section_to,33);assert.equal(d.note,'رف تاني');
assert.equal(C.entry({id:'c',at:'t',item,edits:{},extra:[],sectionTo:3}).section_to,null,'the same section is no change');
assert.equal(C.entry({id:'c',at:'t',item,edits:{},extra:[],sectionTo:33}).result,'diff','a section change alone is a difference');
const noexp={i:5,n:'NO EXPIRY',s:109,p:1,b:[{x:null,k:41,u:0}]};
assert.deepEqual(C.entry({id:'e',at:'t',item:noexp,edits:{'-':-1}}).diffs,[{x:null,d:-1}]);
// progress per section and the latest entry
const items=[{i:1,s:3},{i:2,s:3},{i:3,s:33}];
const p=C.progress(items,new Set([2,3]));assert.deepEqual(p.get(3),{n:2,done:1});assert.deepEqual(p.get(33),{n:1,done:1});
const L=C.latest([{id:'s1',item_id:1,counted_at:'2026-11-10',result:'ok'},{id:'s2',item_id:2,counted_at:'2026-11-10',status:'cancelled'}],[{id:'q1',item_id:1,counted_at:'2026-11-13',result:'diff'}]);
assert.equal(L.get(1).id,'q1','the phone\'s newer entry wins');assert.equal(L.has(2),false,'a cancelled entry does not count');
console.log('PASS: count helpers: differences in words, the row, progress, latest entry');
