const assert=require('node:assert/strict');
const {names,classify}=require('../availability.js');
const importer=require('../file-import.js');
const deps={norm:s=>s.toLowerCase().trim(),asciiDigits:s=>s.replace(/٥/g,'5'),approvedAliasSuggestion:(s,items)=>s==='عربي'?{item:items[0]}:null};
const rows=classify(names('Drug 500mg\nDrug 500mg\nDrug 50mg\nعربي\nTablet ٥'),[{id:'a',product_name:'Drug 500mg'},{id:'b',product_name:'Tablet 5'}],deps);
assert.deepEqual(rows.map(r=>r.kind),['exact','unresolved','alias','exact']);assert.equal(rows[2].target.id,'a');
assert.equal(classify(['Same'],[{product_name:'Same'},{product_name:'Same'}],deps)[0].kind,'unresolved');
const draft=[{name:'Drug 500mg',rawQuantity:'',include:true}];assert.deepEqual(importer.validate(draft,true),['']);assert.equal(importer.pasteText(draft,true),'Drug 500mg');assert.ok(importer.validate(draft)[0]);
console.log('PASS: names deduplicated, no strength stripping, ambiguous names unresolved, approved aliases, blank quantity accepted only for availability');
