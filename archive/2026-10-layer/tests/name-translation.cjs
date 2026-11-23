const assert=require('node:assert/strict'),T=require('../name-translation.js'),A=require('../availability.js');
const rows=names=>names.map((product_name,id)=>({product_name,id:String(id),is_active:true}));
const items=rows(['GLUCOPHAGE 500MG 30TAB','GLUCOPHAGE 1000MG 30TAB','CAPOTEN 50MG 20TAB','MEGABIO 500MG TAB','STREPTOQUIN SUSP','BRUFEN 400MG TAB','BRUFEN 600MG TAB','PARAFFIN OIL','VALSATENS PLUS 160/25 MG','VALSATENS PLUS 160/12.5 MG','MINIRIN MELT 120MCG TAB','MINIRIN MELT 120MG TAB','AUGMENTIN 500/125MG TAB','ZYPREXA 10MG 7TAB','ZYPREXA 10MG 28TAB']);
const targets=q=>T.candidates(q,items).map(c=>c.item.product_name);
assert.deepEqual(targets('جلوكوفاج ٥٠٠ اقراص'),['GLUCOPHAGE 500MG 30TAB']);
assert.deepEqual(targets('كابوتن ۵۰ اقراص'),['CAPOTEN 50MG 20TAB']);
assert.deepEqual(targets('بروفن ٤٠٠ اقراص'),['BRUFEN 400MG TAB']);
assert.deepEqual(targets('فالساتنس بلس ١٦٠/١٢٫٥'),['VALSATENS PLUS 160/12.5 MG']);
assert.deepEqual(targets('مينيرين ملت ١٢٠ ميكروجرام'),['MINIRIN MELT 120MCG TAB']);
assert.deepEqual(targets('ميجابيو ٧٥٠ اقراص'),[]);
assert.deepEqual(targets('ستربتوكين اقراص'),[]);
assert.deepEqual(targets('بروفن ٤٠٠ كبسول'),[]);
assert.deepEqual(targets('فالساتنس بلس ١٦٠/٢٥'),['VALSATENS PLUS 160/25 MG']);
assert.deepEqual(targets('فالساتنس ١٦٠/٢٥'),[]); // PLUS must not be guessed.
assert.deepEqual(targets('اوجمنتين ٥٠٠ اقراص'),[]); // second active strength cannot be discarded.
assert.deepEqual(targets('زيبركسا ١٠ مجم ٧ قرص'),['ZYPREXA 10MG 7TAB']);
assert.equal(targets('زيبركسا اقراص').length,2); // missing strength is a choice, never an automatic match.
assert.equal(T.candidates('جلوكوفاج',items.map(r=>({...r,is_active:false}))).length,0);
assert.equal(T.candidates('جلوكوفاج',[]).length,0);
assert.equal(T.candidates('مجهول تماما',items).length,0);
assert.ok(T.candidates('جلوكوفاج اقراص',items).every(c=>c.kind==='translation_candidate'&&!c.complete));
const deps={norm:s=>T.normalize(s),asciiDigits:s=>s,approvedAliasSuggestion:()=>null,translationCandidates:T.candidates};
const classified=A.classify(['جلوكوفاج ٥٠٠ اقراص'],items,deps);
assert.equal(classified[0].kind,'unresolved');assert.equal(classified[0].target,undefined);assert.equal(classified[0].candidates.length,1);
// Even an identical phonetic spelling cannot choose among duplicate active SKUs.
assert.equal(T.candidates('جلوكوفاج ٥٠٠ اقراص',[items[0],{...items[0],id:'duplicate'}]).length,2);
assert.equal(T.normalize('١٢٫٥'),T.normalize('12.5'));
assert.deepEqual(targets('بارافين زيت'),['PARAFFIN OIL']);
assert.deepEqual(T.candidates('فيوسيدين ١٪ كريم',rows(['FUCIDIN 2% CREAM'])),[]);
assert.deepEqual(T.candidates('فيوسيدين 1% كريم',rows(['FUCIDIN 2% CREAM'])),[]);
assert.equal(targets('فالساتنس بلس 160 / 25').length,1);
assert.equal(T.candidates('فيوسيدين ١٪ كريم',rows(['FUCIDIN 1MG CREAM'])).length,0);
console.log('PASS: Arabic/English names, spelling variants, Arabic/Persian digits, fractions and decimal strengths, forms, units, modifiers, packs, inactive and ambiguous targets; suggestions never auto-match');
