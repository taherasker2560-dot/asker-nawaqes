// Google busy → a backup Gemini model at once; and the laptop's reader routes (list / file / fill) with the phone's
// key. Fake Supabase, storage and Gemini; nothing real is called.
const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
const F=await import(require('node:url').pathToFileURL(path.join(__dirname,'..','supabase','functions','arabic-shortages','index.ts')).href);
const ORIGIN='https://taherasker2560-dot.github.io';
const env={GEMINI_API_KEY:'k',ALLOWED_EMAILS:'owner@example.com',SUPABASE_URL:'https://p.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',GEMINI_RETRY_WAIT_MS:'1'};
const KEY='b'.repeat(64),HASH=crypto.createHash('sha256').update(KEY).digest('hex');
const JPG=new Uint8Array([0xff,0xd8,0xff,0xe0,9,8,7]);
const ID='59b9de35-8f91-4dd4-9f89-08da4d0bff53',ID2='69b9de35-8f91-4dd4-9f89-08da4d0bff54';
function fake({rows={},gem=()=>({rows:[{name:'فلاجيل شراب ١٢٥',english:''}]}),status=()=>200}={}){const calls=[],page=(u,a)=>new Response(JSON.stringify(u.includes('offset=0')?a:[]));
 const f=async(url,o={})=>{calls.push({url,o});
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({email:'owner@example.com'}));
  if(url.includes('/rest/v1/ar_inbox_keys'))return page(url,url.includes('key_hash=eq.'+HASH)?[{key_hash:HASH}]:[]);
  if(url.includes('/rest/v1/ar_inbox?select=id,received_at,kind'))return page(url,Object.values(rows).map(r=>({id:r.id,received_at:'2026-11-12T16:42:00Z',kind:r.kind,file_path:r.file_path,status:r.status})));
  if(url.includes('/rest/v1/ar_inbox?select=id,kind,file_path,status&id=eq.')){const id=url.match(/id=eq\.([^&]+)/)[1];return page(url,rows[id]?[rows[id]]:[])}
  if(url.includes('/rest/v1/ar_inbox?id=eq.')&&o.method==='PATCH'){const id=url.match(/id=eq\.([^&]+)/)[1],st=decodeURIComponent(url.match(/status=eq\.([^&]+)/)[1]);if(rows[id]&&rows[id].status===st)Object.assign(rows[id],JSON.parse(o.body));return new Response(null,{status:204})}
  if(url.includes('/storage/v1/object/ar-inbox/'))return new Response(JPG);
  if(url.includes('/rest/v1/ar_shortages'))return page(url,[{id:'s2',product_name:'FLAGYL 125MG SYP'}]);
  if(url.includes('/rest/v1/ar_names'))return page(url,[{name_key:'FLAGYL 125MG SYP',arabic_name:'فلاجيل ١٢٥ مجم شراب',status:'approved'}]);
  if(url.includes('/rest/v1/ar_'))return page(url,[]);
  if(url.startsWith('https://generativelanguage')){const m=url.match(/models\/([^:]+):/)[1];f.models.push(m);const s=status(m);
   return s===200?new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(gem())}]}}]})):new Response('busy',{status:s})}
  throw Error('unexpected '+url)};f.calls=calls;f.models=[];return f}
const page=body=>new Request('https://p.supabase.co/functions/v1/arabic-shortages',{method:'POST',headers:{origin:ORIGIN,authorization:'Bearer jwt','content-type':'application/json'},body:JSON.stringify(body)});
const lap=(q,body='',key=KEY)=>new Request('https://p.supabase.co/functions/v1/arabic-shortages?'+q,{method:'POST',headers:{'x-inbox-key':key,'content-type':'application/json'},body});

// the models: main first, then the backup; an env list replaces it, an empty one turns it off
assert.deepEqual(F.geminiModels({}),['gemini-flash-latest','gemini-flash-lite-latest']);
assert.deepEqual(F.geminiModels({GEMINI_FALLBACK_MODELS:'gemini-2.5-flash, gemini-flash-latest ,bad model'}),['gemini-flash-latest','gemini-2.5-flash']);
assert.deepEqual(F.geminiModels({GEMINI_FALLBACK_MODELS:''}),['gemini-flash-latest']);

// main model busy: the backup reads at once (no wait, no error)
let f=fake({status:m=>m==='gemini-flash-latest'?503:200});
let r=await F.handle(page({action:'read',image:'aGVsbG8=',mimeType:'image/png'}),env,f);
assert.equal(r.status,200);assert.deepEqual(f.models,['gemini-flash-latest','gemini-flash-lite-latest']);assert.equal((await r.json()).rows[0].match.id,'s2');
// main fine: the backup is never asked
f=fake();r=await F.handle(page({action:'read',image:'aGVsbG8=',mimeType:'image/png'}),env,f);assert.equal(r.status,200);assert.deepEqual(f.models,['gemini-flash-latest']);
// both busy every time: the page still gets the busy error after its tries
f=fake({status:()=>503});r=await F.handle(page({action:'read',image:'aGVsbG8=',mimeType:'image/png'}),env,f);assert.equal(r.status,502);assert.equal(f.models.length,6,'3 tries, each main + backup');
// a backup Google does not know (404) or without quota (429): the error stays «busy», not «quota»/«model»
for(const s of [404,429]){f=fake({status:m=>m==='gemini-flash-latest'?503:s});r=await F.handle(page({action:'read',image:'aGVsbG8=',mimeType:'image/png'}),env,f);assert.equal(r.status,502,'backup '+s);assert.doesNotMatch((await r.json()).message||'',/حصة|الموديل/)}

// laptop reader: a wrong key gets nothing
f=fake({rows:{[ID]:{id:ID,kind:'image',file_path:'2026-11-12/abc.jpg',status:'error'}}});
r=await F.handle(lap('reader=list','', 'c'.repeat(64)),env,f);assert.equal(r.status,401);
// list: the photos/PDFs of the last hours, read with the service key
r=await F.handle(lap('reader=list&since=2026-11-12T10:00:00Z'),env,f);assert.equal(r.status,200);let b=await r.json();assert.equal(b.items.length,1);assert.equal(b.items[0].id,ID);
assert.ok(f.calls.some(c=>c.url.includes('kind=in.(image,pdf)')&&c.o.headers.apikey==='service'));
// file: the stored copy itself
r=await F.handle(lap('reader=file&id='+ID),env,f);assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),JPG);
r=await F.handle(lap('reader=file&id=x'),env,f);assert.equal(r.status,400);
// fill a row Google could not read: matched here, status new, nothing said
const reading=JSON.stringify({supplier:'',rows:[{name:'فلاجيل شراب ١٢٥',english:'FLAGYL 125MG SYRUP',unclear:false},{name:'بانادول',english:'PANADOL',unclear:true}]});
r=await F.handle(lap('reader=fill&id='+ID,reading),env,f);b=await r.json();
assert.equal(r.status,200);assert.equal(b.sure,1);
const saved=f.calls.filter(c=>c.o.method==='PATCH');assert.equal(saved.length,1);
const patch=JSON.parse(saved[0].o.body);assert.equal(patch.status,'new');assert.equal(patch.error,null);assert.equal(patch.rows[0].match.id,'s2');assert.equal(patch.rows.length,2);
assert.ok(saved[0].url.includes('status=eq.error'),'written only while still not read');
assert.equal(f.models.length,0,'Gemini never asked');
// a row already read: kept as is unless replace=1
f=fake({rows:{[ID2]:{id:ID2,kind:'image',file_path:'2026-11-12/def.jpg',status:'seen',rows:[]}}});
b=await (await F.handle(lap('reader=fill&id='+ID2,reading),env,f)).json();assert.equal(b.skipped,true);assert.ok(!f.calls.some(c=>c.o.method==='PATCH'));
r=await F.handle(lap('reader=fill&replace=1&id='+ID2,reading),env,f);assert.equal(r.status,200);
const p2=JSON.parse(f.calls.find(c=>c.o.method==='PATCH').o.body);assert.equal(p2.status,undefined,'status (seen) kept');assert.equal(p2.rows.length,2);
// a reading that is not JSON: refused
r=await F.handle(lap('reader=fill&replace=1&id='+ID2,'not json'),env,f);assert.equal(r.status,400);
console.log('PASS: claude-reader: Gemini backup model when busy; laptop list/file/fill with the phone key');
})().catch(e=>{console.error(e);process.exit(1)});
