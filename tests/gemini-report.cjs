// «وصل من النواقص» report rules, without a browser.
const assert=require('node:assert/strict'),R=require('../gemini-report.js');
const shortages=[{id:'s1',product_name:'BRUFEN 400'},{id:'s2',product_name:'JANUVIA 100MG 28TAB'},{id:'s3',product_name:'TEGRETOL 200MG 30T.'}];
const rows=[
 {fileName:'a.jpg',name:'بروفين ٤٠٠',key:'k1',match:{id:'1',name:'BRUFEN 400',confidence:'high'},candidates:[{id:'1',name:'BRUFEN 400',numbersOk:true}]},
 {fileName:'b.jpg',name:'بروفين 400 اقراص',key:'k1b',match:{id:'1',name:'brufen  400',confidence:'confirmed'},candidates:[]},
 {fileName:'a.jpg',name:'جانوفيا ٥٠ مجم',key:'k2',match:{id:'9',name:'JANUMET 50MG',confidence:'review'},candidates:[{id:'2',name:'JANUVIA 100MG 28TAB',numbersOk:false},{id:'9',name:'JANUMET 50MG',numbersOk:true}]},
 {fileName:'a.jpg',name:'تيجيريتول ٢٠٠',key:'k3',match:{id:'6',name:'TEGRETOL 200MG 30T.',confidence:'review'},candidates:[{id:'6',name:'TEGRETOL 200MG 30T.',numbersOk:true},{id:'7',name:'TEGRETOL CR 200MG 20T.',numbersOk:true}]},
 {fileName:'a.jpg',name:'بانادول',key:'k4',match:{id:'5',name:'PANADOL 500',confidence:'high'},candidates:[]},
 {fileName:'a.jpg',name:'اسم غريب',key:'k5',match:null,candidates:[],unclear:true}];
const r=R.buildReport(rows,shortages);
assert.equal(r.arrived.length,1,'two lines for the same shortage are grouped');assert.equal(r.arrived[0].shortage.id,'s1');assert.equal(r.arrived[0].sources.length,2);
assert.deepEqual(r.review.map(x=>[x.row.key,x.options.map(o=>o.shortage.id)]),[['k3',['s3']]],'only shortage candidates with matching numbers are offered; 50 never offered as 100');
assert.deepEqual(r.other.map(x=>x.item),['PANADOL 500']);assert.deepEqual(r.unknown.map(x=>x.name).sort(),['اسم غريب','جانوفيا ٥٠ مجم'].sort());
const r2=R.buildReport([{fileName:'x.jpg',name:'tegretol 200mg 30t.',key:'t',match:null,candidates:[]}],shortages);assert.equal(r2.arrived[0].sources[0].confidence,'same-name','exact same name counts even without the item list');
console.log('PASS: report: clear matches grouped per shortage, review only offers shortage items with matching strength, other items and unknown names separated');
