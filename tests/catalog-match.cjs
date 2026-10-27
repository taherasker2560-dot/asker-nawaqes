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
assert.deepEqual(cat.search('5').map(x=>x.id),['5'],'code');assert.equal(cat.search('tegretol').length,2);assert.equal(cat.search('napib')[0].name.startsWith('NAPIBRADINE'),true);
{const f=new M.Catalog([['1','NEUROTON 30TAB'],['2','FLAGYL 500MG 20TAB.'],['3','FLAGYL 100ML SUSP125 MG .'],['4','VITAMIN A CREAM'],['5','CARBIMAZOLE 5MG 50T.']]);
 assert.deepEqual([...M.forms('FLAGYL 500MG 20TAB.')],['tablet'],'dotted TAB.');assert.deepEqual([...M.forms('CARBIMAZOLE 5MG 50T.')],['tablet'],'50T');assert.deepEqual([...M.forms('VITAMIN A CREAM')],['cream'],'lone A is not an ampoule');
 const g=f.candidates('نيوتون جل','NEOTONE GEL');assert.equal(g.find(x=>x.id==='1').formOk,false);assert.notEqual(M.decide(g)?.confidence,'high','a gel never matches a tablet clearly');
 const s=f.candidates('فلاجيل شراب','FLAGYL SYP');assert.equal(s[0].id,'3','syrup beats tablet');assert.equal(M.decide(s).confidence,'high');}
{const F=x=>M.forms(x),ok=(a,b)=>M.formsAgree(F(a),F(b));
 assert.equal(ok('فولتارين لبوس','VOLTAREN 100MG 5SUPP'),true);assert.equal(ok('فولتارين امبول','VOLTAREN 100MG 5SUPP'),false,'ampoule is not a suppository');
 assert.equal(ok('امبول','X 1GM VIAL'),false,'ampoule is not a vial');assert.equal(ok('حقن','X 1GM VIAL'),true,'injection may be a vial');
 assert.equal(ok('لبوس مهبلي','X VAGINAL SUPP'),true);assert.equal(ok('لبوس','X VAGINAL SUPP'),true,'general agrees with specific');assert.equal(ok('لبوس مهبلى','X 5SUPP'),true);
 assert.equal(ok('سبراي للفم','X HAIR SPRAY'),false,'mouth spray vs hair spray');assert.equal(ok('مضمضه','X M.W 120ML'),true);assert.equal(ok('غسول مهبلي','X VG 200ML'),true);
 assert.equal(ok('شامبو قشره','X ANTIDANDRUFF SHAMPOO'),true);assert.equal(ok('شامبو','X SOAP'),false);assert.equal(ok('فوار','X 10 SACH'),true);assert.equal(ok('اقراص فواره','X EFF 10TAB'),true);
 assert.equal(ok('اقراص','X 20CAP'),true,'tablets/capsules are often mixed up in lists');assert.equal(ok('زيت شعر','HAIR OIL 100ML'),true);assert.equal(ok('بودره','X POWDER 30G'),true);assert.equal(ok('جل','VOLTAREN EMULGEL'),true);assert.equal(ok('ميكوناز كريم','MICONAZ 400MG 3 VAG.OVULES'),false,'cream is not an ovule');assert.equal(ok('ميكوناز لبوس مهبلي','MICONAZ 400MG 3 VAG.OVULES'),true);assert.equal(ok('كريم','MIXTARD 50HM PENFILL'),false);assert.equal(ok('سيرتايد بخاخ','SERETIDE 50 EVOHALER'),true);
 assert.equal(M.routesAgree('ابيسفين ١جم فيال وريدي','EPICEPHIN 1GM I.M.'),false,'IV is not IM');assert.equal(M.routesAgree('ابيسفين ١جم وريدي','EPICEPHIN 1GM I.V INJECTION'),true);assert.equal(M.routesAgree('ابيسفين ١جم','EPICEPHIN 1GM I.M.'),true);}
console.log('PASS: catalogue matcher: owner form list (supp/amp/vial, vaginal, mouth, hair, sachet/فوار), dosage form must agree (gel/tab, syrup/tab); normalization, strength vs pack count, 50/100 never confused, pack count tolerated, ties go to review, Arabic alt names, unknown -> none')})().catch(e=>{console.error(e);process.exitCode=1});
