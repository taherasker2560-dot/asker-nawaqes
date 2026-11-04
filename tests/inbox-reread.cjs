// «اقرا تاني» (action reread): an incoming photo that was not read is read again from its stored copy and its row is
// filled in only while it is still not read. Fake Supabase, storage and Gemini; nothing real is called.
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
const F=await import(path.join(__dirname,'..','supabase','functions','arabic-shortages','index.ts'));
const ORIGIN='https://taherasker2560-dot.github.io',env={GEMINI_API_KEY:'k',ALLOWED_EMAILS:'owner@example.com',SUPABASE_URL:'https://p.supabase.co',SUPABASE_ANON_KEY:'anon'};
const JPG=new Uint8Array([0xff,0xd8,0xff,0xe0,1,2,3]);
function fake(row,{gem=()=>({rows:[{name:'فلاجيل شراب ١٢٥',english:''}]}),gemStatus=200,file=200}={}){const calls=[];const page=(u,a)=>new Response(JSON.stringify(u.includes('offset=0')?a:[]));
 const f=async(url,o={})=>{calls.push({url,o});
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({email:'owner@example.com'}));
  if(url.includes('/rest/v1/ar_inbox?select='))return page(url,row?[row]:[]);
  if(url.includes('/rest/v1/ar_inbox?id=eq.')&&o.method==='PATCH'){if(url.includes('status=eq.error')&&row.status==='error')Object.assign(row,JSON.parse(o.body));return new Response(null,{status:204})}
  if(url.includes('/storage/v1/object/authenticated/ar-inbox/'))return file===200?new Response(JPG):new Response('no',{status:file});
  if(url.includes('/rest/v1/ar_shortages'))return page(url,[{id:'s2',product_name:'FLAGYL 125MG SYP'}]);
  if(url.includes('/rest/v1/ar_names'))return page(url,[{name_key:'FLAGYL 125MG SYP',arabic_name:'فلاجيل ١٢٥ مجم شراب',status:'approved'}]);
  if(url.includes('/rest/v1/ar_'))return page(url,[]);
  if(url.startsWith('https://generativelanguage')){f.gemini=(f.gemini||0)+1;return gemStatus===200?new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(gem())}]}}]})):new Response('busy',{status:gemStatus})}
  throw Error('unexpected '+url)};f.calls=calls;return f}
const req=body=>new Request('https://p.supabase.co/functions/v1/arabic-shortages',{method:'POST',headers:{origin:ORIGIN,authorization:'Bearer jwt','content-type':'application/json'},body:JSON.stringify(body)});
const ID='59b9de35-8f91-4dd4-9f89-08da4d0bff53';
// not read before: read from the stored copy, matched, the same row filled in (status new, counts)
let row={id:ID,kind:'image',file_path:'2026-11-03/abc.jpg',status:'error',error:'Signal timed out.'};
let f=fake(row),r=await F.handle(req({action:'reread',id:ID}),env,f),b=await r.json();
assert.equal(r.status,200);assert.equal(b.sure,1);assert.equal(row.status,'new');assert.equal(row.error,null);assert.equal(row.rows[0].match.id,'s2');
assert.ok(f.calls.some(c=>c.url.endsWith('/storage/v1/object/authenticated/ar-inbox/2026-11-03/abc.jpg')&&c.o.headers.Authorization==='Bearer jwt'),'stored copy read with the owner\'s session');
assert.ok(!f.calls.some(c=>c.o.method==='POST'&&c.url.includes('/rest/v1/ar_inbox')),'no new row');
// already read (another try won): nothing read or written
f=fake(row);b=await (await F.handle(req({action:'reread',id:ID}),env,f)).json();assert.equal(b.already,true);assert.equal(f.gemini,undefined);
// Google busy again: the row stays «not read», the page gets a message
row={id:ID,kind:'image',file_path:'2026-11-03/abc.jpg',status:'error',error:'Signal timed out.'};
f=fake(row,{gemStatus:503});r=await F.handle(req({action:'reread',id:ID}),env,f);assert.equal(r.status,502);assert.equal(row.status,'error');
// quota: 429 with the Arabic message
f=fake(row,{gemStatus:429});r=await F.handle(req({action:'reread',id:ID}),env,f);assert.equal(r.status,429);assert.match((await r.json()).message,/حصة/);
// no stored copy / a text: told to share it by hand
f=fake({id:ID,kind:'text',file_path:null,status:'error'});r=await F.handle(req({action:'reread',id:ID}),env,f);assert.equal(r.status,400);
// bad id
f=fake(row);r=await F.handle(req({action:'reread',id:'x'}),env,f);assert.equal(r.status,400);
console.log('PASS: reread: stored copy read again, same row filled once, busy/quota leave it not read');
})().catch(e=>{console.error(e);process.exit(1)});
