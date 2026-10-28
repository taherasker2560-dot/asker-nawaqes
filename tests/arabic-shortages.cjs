// Trial bot function (supabase/functions/arabic-shortages): translate and read with fake Supabase and Gemini.
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
const F=await import(path.join(__dirname,'..','supabase','functions','arabic-shortages','index.ts'));
const ORIGIN='https://taherasker2560-dot.github.io',env={GEMINI_API_KEY:'k',ALLOWED_EMAILS:'owner@example.com',SUPABASE_URL:'https://p.supabase.co',SUPABASE_ANON_KEY:'anon'};
const shortages=[{id:'s1',product_name:'BRUFEN 400MG 30TAB'},{id:'s2',product_name:'FLAGYL 125MG SYP'},{id:'s3',product_name:'JANUVIA 50MG 28TAB'},{id:'s4',product_name:'JANUVIA 100MG 28TAB'}];
function fake({names=[],decisions=[],gem}){const calls=[];const f=async(url,o={})=>{calls.push({url,o});
 if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({email:'owner@example.com'}));
 if(url.includes('/rest/v1/shortage_items'))return new Response(JSON.stringify(url.includes('offset=0')?shortages:[]));
 if(url.includes('/rest/v1/ar_names')&&o.method==='POST'){f.saved=JSON.parse(o.body);return new Response('',{status:201})}
 if(url.includes('/rest/v1/ar_names'))return new Response(JSON.stringify(url.includes('offset=0')?names:[]));
 if(url.includes('/rest/v1/ar_answers'))return new Response(JSON.stringify(url.includes('offset=0')?decisions:[]));
 if(url.startsWith('https://generativelanguage'))return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(gem(JSON.parse(o.body)))}]}}]}));
 throw Error('unexpected '+url)};f.calls=calls;return f}
const req=body=>new Request('https://p.supabase.co/functions/v1/arabic-shortages',{method:'POST',headers:{origin:ORIGIN,authorization:'Bearer jwt','content-type':'application/json'},body:JSON.stringify(body)});
// translate: only shortages without an Arabic name, Persian letters cleaned, approved names untouched
let f=fake({names:[{name_key:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠',status:'approved'}],gem:b=>{const list=JSON.parse(b.contents[0].parts[0].text.split('\n\n')[1]);return {items:list.map(x=>({i:x.i,ar:x.name.startsWith('FLAGYL')?'فلاجیل ١٢٥ مجم شراب':'جانوفيا'}))}}});
let r=await F.handle(req({action:'translate',limit:10}),env,f);let b=await r.json();
assert.equal(r.status,200);assert.equal(b.translated,3);assert.equal(b.remaining,0);assert.ok(!f.saved.some(x=>x.name_key==='BRUFEN 400MG 30TAB'),'approved name kept even though the shortage row is new (s1 came back)');
assert.equal(f.saved.find(x=>x.name_key==='FLAGYL 125MG SYP').arabic_name,'فلاجيل ١٢٥ مجم شراب');assert.equal(f.saved.find(x=>x.name_key==='FLAGYL 125MG SYP').english_name,'FLAGYL 125MG SYP');assert.ok(f.calls.find(c=>c.url.includes('ar_names')&&c.o.method==='POST').o.headers.Prefer.includes('ignore-duplicates'));
// read: Arabic supplier lines matched to shortages through the Arabic names; strength from the English name
const names=[{name_key:'FLAGYL 125MG SYP',arabic_name:'فلاجيل ١٢٥ مجم شراب',status:'approved'},{name_key:'JANUVIA 50MG 28TAB',arabic_name:'جانوفيا ٥٠ مجم ٢٨ قرص',status:'suggested'},{name_key:'JANUVIA 100MG 28TAB',arabic_name:'جانوفيا ١٠٠ مجم ٢٨ قرص',status:'suggested'}];
const gemRows={rows:[{name:'فلاجيل شراب ١٢٥',english:''},{name:'جانوفيا ٥٠ مجم ٢٨ قرص',english:''},{name:'بانادول اكسترا',english:'PANADOL EXTRA'}]};
f=fake({names,gem:()=>gemRows});r=await F.handle(req({action:'read',image:'aGVsbG8=',mimeType:'image/png'}),env,f);b=await r.json();
assert.equal(r.status,200);assert.equal(b.rows[0].match.id,'s2');assert.equal(b.rows[1].match.id,'s3','50 is not 100');assert.equal(b.rows[1].match.confidence,'high');assert.equal(b.rows[2].match,null);
// owner decisions: yes wins, no removes
f=fake({names,decisions:[{alias_key:'جانوفيا 50 مجم 28 قرص',read_text:'جانوفيا ٥٠ مجم ٢٨ قرص',name_key:'JANUVIA 50MG 28TAB',decision:'no'},{alias_key:'بانادول اكسترا',read_text:'بانادول اكسترا',name_key:'BRUFEN 400MG 30TAB',decision:'yes'}],gem:()=>gemRows});
b=await (await F.handle(req({action:'read',image:'aGVsbG8=',mimeType:'image/png'}),env,f)).json();
assert.ok(!b.rows[1].candidates.some(c=>c.id==='s3'),'rejected shortage not suggested again');assert.equal(b.rows[2].match.id,'s1');assert.equal(b.rows[2].match.confidence,'confirmed');
// security: other accounts refused before any Gemini call
const g=fake({gem:()=>({})});const other=async(u,o)=>u.endsWith('/auth/v1/user')?new Response(JSON.stringify({email:'x@y.z'})):g(u,o);
r=await F.handle(req({action:'translate'}),env,other);assert.equal(r.status,403);assert.ok(!g.calls.some(c=>c.url.includes('generativelanguage')));
console.log('PASS: arabic-shortages: translate only missing names, read + match Arabic-to-Arabic with strength from the English name, yes/no decisions, owner only');
})().catch(e=>{console.error(e);process.exitCode=1});
