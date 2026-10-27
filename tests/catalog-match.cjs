// Matcher rules on a small invented item list (the real list is private and not in this repository).
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{const M=await import(path.join(__dirname,'..','supabase','functions','read-supplier-image','match.ts'));
const cat=new M.Catalog([['1','JANUVIA 100MG 28TAB'],['2','JANUVIA 50MG 28TAB'],['3','KAST4  MG SACH'],['4','KAST 10MG 10TAB'],['5','CARBIMAZOLE 5MG 50T.'],['6','TEGRETOL 200MG 30T.'],['7','TEGRETOL CR 200MG 20T.'],['8','NAPIBRADINE 7.5 M TAB'],['9','NAPIBRADINE 5M TAB'],['10','FLAGYL 125MG SYP',['فلاجيل شراب']]]);
const best=(a,e)=>{const c=cat.candidates(a,e);return [c[0]?.name,M.decide(c)?.confidence]};
assert.equal(M.normalize('سيرافى ٣٤٠جم'),'سيرافي 340 جم');assert.equal(M.normalize('نابيبرادين ٧,٥مجم'),'نابيبرادين 7.5 مجم');assert.equal(M.normalize('گاست'),'كاست');
assert.deepEqual(M.strengthAndCount('جانوفيا ١٠٠ مجم ٢٨ قرص'),{strength:['100'],count:['28']});assert.deepEqual(M.strengthAndCount('تيجيريتول ٢٠٠ اقراص'),{strength:['200'],count:[]},'a lone number is a strength');
assert.deepEqual(best('جانوفيا ١٠٠ مجم ٢٨ قرص','JANUVIA 100MG 28TAB'),['JANUVIA 100MG 28TAB','high']);
assert.deepEqual(best('جانوفيا ٥٠ مجم ٢٨ قرص','JANUVIA 50MG 28TAB'),['JANUVIA 50MG 28TAB','high']);
const c50=cat.candidates('جانوفيا ٥٠ مجم','JANUVIA');assert.equal(c50.find(x=>x.name==='JANUVIA 100MG 28TAB').numbersOk,false,'100 never passes for 50');
assert.deepEqual(best('گاست ٤ مجم ١٤ كيس','KAST 4MG 14SACH'),['KAST4  MG SACH','high'],'pack count missing from the item name does not block');
assert.deepEqual(best('نابيبرادين ٧,٥ مجم اقراص','NAPIBRADINE 7.5MG TAB'),['NAPIBRADINE 7.5 M TAB','high']);
assert.equal(best('تيجيريتول ٢٠٠ اقراص','TEGRETOL 200 TAB')[1],'review','two equally good items -> owner chooses');
assert.deepEqual(best('فلاجیل شراب',''),['FLAGYL 125MG SYP','high'],'Arabic alternative name, Persian yeh');
assert.equal(M.decide(cat.candidates('منتج غير موجود خالص','UNKNOWN THING')),null);
assert.equal(M.aliasKey('  گاست ٤ مجم '),'كاست 4 مجم');
console.log('PASS: catalogue matcher: normalization, strength vs pack count, 50/100 never confused, pack count tolerated, ties go to review, Arabic alt names, unknown -> none')})().catch(e=>{console.error(e);process.exitCode=1});
