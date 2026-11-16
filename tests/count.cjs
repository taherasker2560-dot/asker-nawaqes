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
// «الأولى بالجرد» (owner 2026-11-16): what is most likely wrong, or dearest to get wrong, first; counted in the last 30 days is left out
{
  const mk=(i,v,b)=>({i,n:'ITEM '+i,s:3,p:1,v,b:b||[{x:'2029-01',k:1,u:0}]});
  const items=[mk(1,100),mk(2,50000),mk(3,20),mk(4,30,[{x:'2029-01',k:-2,u:0}]),mk(5,10),mk(6,40000),mk(7,0),mk(8,150),mk(9,900),mk(10,120)];
  const flags={soldNeg:new Set([3]),mix:new Set([8,3]),expSold:new Set([5])};
  const out=C.priority(items,new Map(),flags);
  const id=(o)=>o.it.i;
  // a negative balance first (60), then sold negative + mixed (40+35=75 beats 60!), then the dearest ones
  assert.deepEqual(out.map(id).slice(0,2),[3,4],'sold negative AND mixed (75) before a negative balance alone (60)');
  const by=new Map(out.map((o)=>[o.it.i,o]));
  assert.deepEqual(by.get(4).why,['neg'],'a negative batch in stock');
  assert.deepEqual(by.get(3).why,['soldNeg','mix']);
  assert.deepEqual(by.get(5).why,['expSold']);
  assert.equal(by.get(2).why.includes('value'),true,'the dearest has the value reason');
  assert.equal(by.get(2).score,30);assert.equal(by.get(5).score,35);
  // a cheap item with nothing wrong is not listed at all
  assert.equal(by.has(7),false,'no stock worth, nothing wrong');assert.equal(by.has(1),false,'a cheap item (44% of the values) with nothing wrong is not listed');
  assert.deepEqual(out.map(id),[3,4,8,5,2,6,9,10],'the whole order: score, then the value');
  // counted recently (any result): left out; a map without it brings it back
  const counted=new Map([[3,{item_id:3,counted_at:'2026-11-15T10:00:00',result:'ok'}]]);
  assert.equal(C.priority(items,counted,flags).some((o)=>o.it.i===3),false);
  // no flags, no stock worth: only the value ranks; empty input is fine
  assert.deepEqual(C.priority(items,new Map(),{}).map(id).slice(0,2),[4,2],'without the alerts: negative balance 60, then the dearest 30');
  assert.deepEqual(C.priority([],new Map(),flags),[]);assert.deepEqual(C.priority(null,null,null),[]);
  assert.equal(C.PRIO_WHY.neg,'رصيده بالسالب في فارمافلاي');
}console.log('PASS: count helpers: differences in words, the row, progress, latest entry');
