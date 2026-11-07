// A long supplier list pasted in «الوارد» (action lines). Real case 2026-11-07: a 108-line «A.m Groub» list ran out of server
// time (546, CPU Time exceeded) because every line was compared with every owner answer (~900) by working the texts
// out again each time. The answers are now worked out once per request; the matches must stay exactly the same.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
const dir=path.join(__dirname,'..','supabase','functions','arabic-shortages');
const F=await import(pathToFileURL(path.join(dir,'index.ts')).href),M=await import(pathToFileURL(path.join(dir,'match.ts')).href);
const ORIGIN='https://taherasker2560-dot.github.io',env={GEMINI_API_KEY:'k',ALLOWED_EMAILS:'owner@example.com',SUPABASE_URL:'https://p.supabase.co',SUPABASE_ANON_KEY:'anon'};
// invented shortage list (the real one is private)
const items=[['BRUFEN 400MG 30TAB','بروفين ٤٠٠ مجم ٣٠ قرص'],['BRUFEN 600MG 30TAB','بروفين ٦٠٠ مجم ٣٠ قرص'],['FLAGYL 125MG SYP','فلاجيل ١٢٥ مجم شراب'],['FLAGYL 500MG 20TAB','فلاجيل ٥٠٠ مجم ٢٠ قرص'],
 ['JANUVIA 50MG 28TAB','جانوفيا ٥٠ مجم ٢٨ قرص'],['JANUVIA 100MG 28TAB','جانوفيا ١٠٠ مجم ٢٨ قرص'],['CONCOR 5MG 30TAB','كونكور ٥ مجم ٣٠ قرص'],['CONCOR 10MG 30TAB','كونكور ١٠ مجم ٣٠ قرص'],
 ['GLUCOPHAGE 500MG 50TAB','جلوكوفاج ٥٠٠ مجم ٥٠ قرص'],['GLUCOPHAGE 1000MG 30TAB','جلوكوفاج ١٠٠٠ مجم ٣٠ قرص'],['AUGMENTIN 1GM 14TAB','اوجمنتين ١ جم ١٤ قرص'],['AUGMENTIN 457MG SUSP','اوجمنتين ٤٥٧ مجم معلق'],
 ['CATAFLAM 50MG 20TAB','كتافلام ٥٠ مجم ٢٠ قرص'],['CATAFLAM 75MG 6AMP','كتافلام ٧٥ مجم ٦ امبول'],['VOLTAREN 100MG SUPP','فولتارين ١٠٠ مجم لبوس'],['VOLTAREN EMULGEL 50GM','فولتارين ايمولجيل ٥٠ جم'],
 ['NEXIUM 40MG 14TAB','نيكسيوم ٤٠ مجم ١٤ قرص'],['NEXIUM 40MG VIAL','نيكسيوم ٤٠ مجم فيال'],['ZYRTEC 10MG 20TAB','زيرتك ١٠ مجم ٢٠ قرص'],['ZYRTEC SYP 120ML','زيرتك شراب ١٢٠ مل'],
 ['PANADOL EXTRA 24TAB','بانادول اكسترا ٢٤ قرص'],['MILGA 50TAB','ميلجا ٥٠ قرص'],['DAFLON 500MG 30TAB','دافلون ٥٠٠ مجم ٣٠ قرص'],['DEPOVIT B12 3AMP I.M','ديبوفيت ب١٢ ٣ امبول عضل'],
 ['MOTILIUM 10MG 40TAB','موتيليوم ١٠ مجم ٤٠ قرص'],['ANTINAL 200MG 24CAP','انتينال ٢٠٠ مجم ٢٤ كبسول'],['ANTINAL SUSP 60ML','انتينال معلق ٦٠ مل'],['FUCIDIN CREAM 15GM','فيوسيدين كريم ١٥ جم'],
 ['FUCIDIN OINT 15GM','فيوسيدين مرهم ١٥ جم'],['DEXAMETHASONE 8MG AMP I.V','ديكساميثازون ٨ مجم امبول وريدي']];
const shortages=items.map(([en],i)=>({id:'L'+(i+1),product_name:en}));
const names=items.map(([en,ar])=>({name_key:en,arabic_name:ar,status:'approved'}));
// names of items that are not short now (the real table has ~2300)
for(let i=0;i<300;i++)names.push({name_key:'OLD ITEM '+i,arabic_name:'صنف قديم '+i,status:'suggested'});
let seed=7;const rnd=n=>(seed=(seed*16807)%2147483647)%n;
// the short sample: one line for each rule of the matcher
const sample=['بروفين ٤٠٠ مجم ٣٠ قرص','بروفين ٦٠٠ اقراص','جانوفيا ٥٠ مجم ٢٨ قرص','جانوفيا ٢٨ قرص ٥٠ مجم','كونكور ٥ مجم','كونكور ٥ مجم اقراص','زيرتك شراب','كتافلام ٧٥ لبوس',
 'ديبوفيت ب١٢ وريدي','BRUFEN 400MG 30TAB','فلاجيل ١٢٥ شراب كوته ٣','شاش طبي ١٠ سم','نيكسيوم ٤٠ قيال','كريم مش مهم','قونقور ١٠ مجم','فيوسيدين كريم','GLUCOPHAGE 1000 TAB','اوجمنتين ٤٥٧ معلق | 5'];
const answers=[
 {alias_key:M.aliasKey('جانوفيا ٥٠ مجم ٢٨ قرص'),read_text:'جانوفيا ٥٠ مجم ٢٨ قرص',name_key:'JANUVIA 50MG 28TAB',decision:'yes'},
 {alias_key:M.aliasKey('جانوفيا ٥٠ مجم ٢٨ قرص علبه'),read_text:'جانوفيا ٥٠ مجم ٢٨ قرص علبه',name_key:'JANUVIA 50MG 28TAB',decision:'yes'},
 {alias_key:M.aliasKey('كونكور ٥ مجم'),read_text:'كونكور ٥ مجم',name_key:'CONCOR 5MG 30TAB',decision:'no'},
 {alias_key:M.aliasKey('كونكور ٥ مجم قرص'),read_text:'كونكور ٥ مجم قرص',name_key:'CONCOR 10MG 30TAB',decision:'no'},
 {alias_key:M.aliasKey('زيرتك شراب'),read_text:'زيرتك شراب',name_key:F.NOT_LISTED,decision:'no'},
 {alias_key:M.aliasKey('فيوسيدين كريم'),read_text:'فيوسيدين كريم',name_key:'FUCIDIN OINT 15GM',decision:'no'},
];
// ~2000 more answers about other names, with the same numbers and forms as the lines, as in the real table (~900 today)
const syl=['سا','لو','مي','تك','ري','دو','فا','نو','زي','جا','بي','كو'],forms=['قرص','اقراص','شراب','امبول','كريم','كبسول','معلق','لبوس'],nums=['٥','١٠','٢٠','٥٠','١٢٥','٤٠٠','٥٠٠','١٠٠٠'];
for(let i=0;i<2000;i++){const w=syl[rnd(12)]+syl[rnd(12)]+syl[rnd(12)],t=w+' '+nums[rnd(8)]+' مجم '+forms[rnd(8)];answers.push({alias_key:M.aliasKey(t),read_text:t,name_key:items[rnd(items.length)][0],decision:i%20?'no':'yes'})}
const fixes=[{read_key:M.aliasKey('نيكسيوم ٤٠ قيال'),corrected_text:'نيكسيوم ٤٠ مجم فيال'}],ignored=[{alias_key:M.aliasKey('كريم مش مهم')}];
// the long list: the sample, then the shortages written the ways suppliers write them, then lines that are no shortage
const longList=[...sample];
const variants=([en,ar])=>[ar,ar.replace('ك','ق'),ar+' كوته '+(1+rnd(5)),en,ar.split(' ').reverse().join(' '),ar+' | '+(1+rnd(20))];
for(const it of items)longList.push(...variants(it).slice(0,4));
for(let i=0;longList.length<150;i++)longList.push(['شاش طبي','سرنجه','قطن','كمامات','مياه معدنيه'][i%5]+' '+nums[rnd(8)]+' سم');
assert.equal(longList.length,150);
const fake=()=>{const f=async(url,o={})=>{
 if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({email:'owner@example.com'}));
 const page=a=>new Response(JSON.stringify(url.includes('offset=0')?a:[]));
 if(url.includes('/rest/v1/ar_shortages'))return page(shortages);if(url.includes('/rest/v1/ar_names'))return page(names);
 if(url.includes('/rest/v1/ar_answers'))return page(answers);if(url.includes('/rest/v1/ar_fixes'))return page(fixes);if(url.includes('/rest/v1/ar_ignored'))return page(ignored);
 throw Error('unexpected '+url)};return f};
const req=body=>new Request('https://p.supabase.co/functions/v1/arabic-shortages',{method:'POST',headers:{origin:ORIGIN,authorization:'Bearer jwt','content-type':'application/json'},body:JSON.stringify(body)});
const brief=r=>[r.match?.id||null,r.match?.confidence||null,r.match?.score??null,r.match?.via||'',r.corrected||'',r.ignored,
 r.candidates.map(c=>c.id+':'+c.score+(c.numbersOk?'':'!n')+(c.formOk===false?'!f':'')+(c.brandOk===false?'!b':''))];

// 1) the whole 150-line paste in one request
const t0=Date.now(),res=await F.handle(req({action:'lines',lines:longList}),env,fake()),ms=Date.now()-t0;
assert.equal(res.status,200);const body=await res.json();
assert.equal(body.rows.length,150);
// 2) the short sample gives exactly what the matcher gave before this change (recorded from main 71d07fd)
const GOLDEN=[
 ["L1","high",1,"","",false,["L1:1","L2:0.5!n","L5:0.049!n!b"]],
 ["L2","high",1,"","",false,["L2:1","L1:0.5!n","L5:0.058!n!b"]],
 ["L5","confirmed",1,"","",false,["L5:0.919","L6:0.438!n","L13:0.089!b"]],
 ["L5","high",0.95,"alias","",false,["L5:0.438!n","L6:0.438!n","L11:0.067!n"]],
 [null,null,null,"","",false,["L29:0.125!n!b","L23:0.068!n!b","L10:0.063!n!b"]],
 [null,null,null,"","",false,["L29:0.075!n!f!b","L23:0.068!n!b","L10:0.063!n!b"]],
 [null,null,null,"","",false,[]],
 ["L14","review",0.63,"","",false,["L14:0.63!f","L13:0.3!n!f","L23:0.035!n!f!b"]],
 ["L24","review",0.63,"","",false,["L24:0.63!f","L1:0.058!n!b","L2:0.058!n!b"]],
 ["L1","high",1,"","",false,["L1:1","L2:0.5!n","L15:0.032!n!f!b"]],
 ["L3","high",1,"","",false,["L3:1","L4:0.3!n!f","L16:0.041!n!f!b"]],
 [null,null,null,"","",false,["L1:0.054!n!b","L4:0.054!n!b","L12:0.054!n!b"]],
 ["L18","high",1,"","نيكسيوم ٤٠ مجم فيال",false,["L18:1","L17:0.63!f","L25:0.06!n!f!b"]],
 [null,null,null,"","",true,[]],
 ["L8","high",0.741,"","",false,["L8:0.741","L7:0.353!n","L29:0.088!n!b"]],
 ["L28","high",0.95,"","",false,["L28:0.95","L1:0.061!f!b","L2:0.061!f!b"]],
 ["L10","high",1,"","",false,["L10:1","L9:0.5!n"]],
 ["L12","high",1,"","",false,["L12:1","L11:0.3!n!f","L27:0.133!n"]]];
assert.deepEqual(body.rows.slice(0,sample.length).map(brief),GOLDEN);
// 3) a line gets the same result in the long list as when it is sent alone (nothing leaks from line to line); every 5th line
const k={names,answers,fixes,ignored:new Set(ignored.map(x=>x.alias_key))},cat=F.shortageCatalog(shortages,names,answers);
const rows=longList.map(F.lineRow).filter(Boolean);assert.equal(rows.length,150);
rows.forEach((r,i)=>{if(i%5===0)assert.deepEqual(F.matchRows([r],cat,k,shortages)[0],body.rows[i],'line '+i+': '+r.name)});
// 4) the shortcut used for the owner's answers is the old check (same numbers, same form, then similarity), for every
// line against the hand-made answers and every 10th other one
let close=0;const lineFacts=rows.map(r=>M.facts(r.name));
for(const d of answers.filter((d,i)=>i<6||i%10===0)){const b=d.read_text,fb=M.facts(b);
 for(const [j,r] of rows.entries()){const a=r.name,fa=lineFacts[j],old=M.sameNumbers(a,b)&&M.formsAgree(M.forms(a),M.forms(b))?M.similarity(a,b):0;
  assert.equal(M.factsSimilarity(fa,fb),old,a+' / '+b);
  assert.equal(fa.nums===fb.nums,M.sameNumbers(a,b),'same numbers: '+a+' / '+b);if(old>=0.85)close++}}
assert.ok(close>=3,'the check met answers close enough to count ('+close+')');
// 5) fast enough: the old matcher needed seconds for this (2000 answers x 150 lines); the server stops at ~2 s of CPU
assert.ok(ms<1500,'150 lines took '+ms+' ms');
console.log('PASS: long paste ('+body.rows.length+' lines, '+answers.length+' answers, '+ms+' ms)');
})().catch(e=>{console.error(e);process.exit(1)});
