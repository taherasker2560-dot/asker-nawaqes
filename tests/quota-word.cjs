// «كوته/كوتة + رقم» on a supplier's line is the company's quota (boxes it will give), not a strength: dropped before matching,
// like a quantity after |. Real case 2026-11-06: «سينمت كوته 2» was silent because «2» was read as a strength of SINEMET TAB.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
const F=await import(pathToFileURL(path.join(__dirname,'..','supabase','functions','arabic-shortages','index.ts')).href);
const ORIGIN='https://taherasker2560-dot.github.io',env={GEMINI_API_KEY:'k',ALLOWED_EMAILS:'owner@example.com',SUPABASE_URL:'https://p.supabase.co',SUPABASE_ANON_KEY:'anon'};
const shortages=[{id:'q1',product_name:'SINEMET TAB'},{id:'q2',product_name:'BRUFEN 400MG 30TAB'},{id:'q3',product_name:'COTISTAD 40ML'},{id:'q4',product_name:'JANUVIA 50MG 28TAB'}];
const names=[{name_key:'SINEMET TAB',arabic_name:'سينيميت اقراص',status:'approved'},{name_key:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠ مجم ٣٠ قرص',status:'approved'},{name_key:'COTISTAD 40ML',arabic_name:'كوتيستاد ٤٠ مل',status:'approved'},{name_key:'JANUVIA 50MG 28TAB',arabic_name:'جانوفيا ٥٠ مجم ٢٨ قرص',status:'approved'}];
const fake=(gem)=>{const f=async(url,o={})=>{
 if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({email:'owner@example.com'}));
 const page=a=>new Response(JSON.stringify(url.includes('offset=0')?a:[]));
 if(url.includes('/rest/v1/ar_shortages'))return page(shortages);if(url.includes('/rest/v1/ar_names'))return page(names);
 // as in the real database: the owner had confirmed the line «سينيمت كوته» for SINEMET TAB (its text carries the word)
 if(url.includes('/rest/v1/ar_answers'))return page([{alias_key:'سينيمت كوته',read_text:'سينيمت كوته',name_key:'SINEMET TAB',decision:'yes'}]);
 if(url.includes('/rest/v1/ar_fixes')||url.includes('/rest/v1/ar_ignored'))return page([]);
 if(url.startsWith('https://generativelanguage'))return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(gem())}]}}]}));
 throw Error('unexpected '+url)};return f};
const req=body=>new Request('https://p.supabase.co/functions/v1/arabic-shortages',{method:'POST',headers:{origin:ORIGIN,authorization:'Bearer jwt','content-type':'application/json'},body:JSON.stringify(body)});
const lines=async l=>(await (await F.handle(req({action:'lines',lines:l}),env,fake(()=>({})))).json()).rows;

// 1) the word and its number are dropped, in every spelling (ة / ه, Arabic / Persian / western digits, colon, dash, decimals)
const drop=F.dropQuota;
for(const [from,to] of [['سينمت كوته 2','سينمت'],['سينمت كوتة 2','سينمت'],['سينمت كوته ٢','سينمت'],['سينمت كوته ۲','سينمت'],['سينمت كوته: 5','سينمت'],['سينمت كوته - 5','سينمت'],['سينمت كوته2','سينمت'],['سينمت كوته 2.5','سينمت'],
  ['كوته 3 سينمت','سينمت'],['سينمت كوته 2 كريم','سينمت كريم'],['بروفين ٤٠٠ كوته ٣','بروفين ٤٠٠'],['سينمت كوته 2 كوته 3','سينمت']])
 assert.equal(drop(from),to,from);
// nothing else is touched: strengths, other words that start with كوت, a lone word with no number
for(const same of ['بروفين ٤٠٠ مجم','كوتيستاد ٤٠ مل','سينمت','سينمت كوته','جانوفيا ٥٠ مجم ٢٨ قرص','FLAGYL 125MG SYP','اكوته ٣'])assert.equal(drop(same),same,same);

// 2) typed / Excel lines (lineRow): the quota is gone, a quota-only line is no line, a quantity after | still goes
assert.equal(F.lineRow('سينمت كوته 2').name,'سينمت');
assert.equal(F.lineRow('سينمت كوتة ٢ | 5').name,'سينمت');
assert.equal(F.lineRow('1. بروفين ٤٠٠ كوته ٣').name,'بروفين ٤٠٠');
assert.equal(F.lineRow('كوته 2'),null,'a line with only the quota is dropped');
assert.equal(F.lineRow('كوتيستاد ٤٠ مل').name,'كوتيستاد ٤٠ مل','a product that starts with كوت stays');

// 3) the real case: offered, with numbersOk true (was numbersOk false, 0.368, silent)
let rows=await lines(['سينمت كوته 2']);
assert.equal(rows[0].name,'سينمت');
assert.equal(rows[0].candidates[0].id,'q1','SINEMET TAB is the top candidate');
assert.equal(rows[0].candidates[0].numbersOk,true,'2 is not a strength');
assert.ok(rows[0].candidates[0].score>=0.45,'offered to the owner (score '+rows[0].candidates[0].score+')');
// the strength next to a quota is kept: 400 still matches BRUFEN 400MG, 3 is not a strength
rows=await lines(['بروفين ٤٠٠ كوته ٣']);
assert.equal(rows[0].match.id,'q2');assert.equal(rows[0].candidates[0].numbersOk,true);
// a wrong strength still fails: 100 is not 50
rows=await lines(['جانوفيا ١٠٠ كوته ٣']);
assert.ok(!rows[0].candidates.some(c=>c.id==='q4'&&c.numbersOk),'strength 100 does not match JANUVIA 50MG');
// a product that merely starts with كوت is matched by its own name
rows=await lines(['كوتيستاد ٤٠ مل']);
assert.equal(rows[0].match.id,'q3');

// 4) a supplier photo read by Gemini: the same
const g=await (await F.handle(req({action:'read',image:'aGVsbG8=',mimeType:'image/png'}),env,fake(()=>({rows:[{name:'سينمت كوته 2',english:''},{name:'بروفين ٤٠٠ كوتة ٣',english:''}]})))).json();
assert.deepEqual(g.rows.map(r=>r.name),['سينمت','بروفين ٤٠٠']);
assert.equal(g.rows[0].candidates[0].numbersOk,true);assert.equal(g.rows[1].match.id,'q2');

console.log('PASS: quota word dropped');
})().catch(e=>{console.error(e);process.exit(1)});
