// Tests the Supabase function with Node (22.18+ strips the TypeScript types). No network: fetch is faked.
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
const {handle,parseRows,decodeBase64Length,PROMPT}=await import(path.join(__dirname,'..','supabase','functions','read-supplier-image','index.ts'));
const ORIGIN='https://taherasker2560-dot.github.io';
const env={GEMINI_API_KEY:'test-key',ALLOWED_EMAILS:'Owner@Example.com, second@example.com',SUPABASE_URL:'https://proj.supabase.co/',SUPABASE_ANON_KEY:'anon'};
const png=Buffer.from('fake image bytes').toString('base64');
function fakeFetch({user={email:'owner@example.com'},userStatus=200,gemini}={}){const calls=[];const f=async(url,opts={})=>{calls.push({url,opts});
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify(user),{status:userStatus});
  if(url.startsWith('https://generativelanguage.googleapis.com/'))return gemini?gemini(url,opts):new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({rows:[{name:'جانوفيا ١٠٠مجم ٢٨ قرص'},{name:'ديكسافين شراب س ج',unclear:true},{name:'x'},{name:'سطر\nمكسور | فيه علامات'}]})}]}}]}),{status:200});
  throw Error('unexpected url '+url)};f.calls=calls;return f}
const req=(o={})=>new Request('https://proj.supabase.co/functions/v1/read-supplier-image',{method:o.method||'POST',headers:{origin:o.origin??ORIGIN,...(o.auth===false?{}:{authorization:'Bearer user-jwt'}),'content-type':'application/json'},...(o.method==='OPTIONS'?{}:{body:JSON.stringify(o.body??{image:png,mimeType:'image/png'})})});
const json=async r=>({status:r.status,body:await r.json(),cors:r.headers.get('access-control-allow-origin')});

// CORS: preflight only for the allowed page; other origins refused
let r=await handle(req({method:'OPTIONS'}),env,fakeFetch());assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),ORIGIN);
// newer supabase-js sends extra headers: the preflight must allow them, and drop malformed names
const pre=await handle(new Request('https://x/f',{method:'OPTIONS',headers:{origin:ORIGIN,'access-control-request-headers':'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-region, bad header!'}}),env,fakeFetch());
const allowH=pre.headers.get('access-control-allow-headers').split(', ');for(const h of ['x-supabase-api-version','x-region','authorization','content-type'])assert.ok(allowH.includes(h),h);assert.equal(allowH.some(h=>/ /.test(h)||h.includes('!')),false);
r=await json(await handle(req({origin:'https://evil.example'}),env,fakeFetch()));assert.equal(r.status,403);assert.equal(r.cors,null);
// fails closed when secrets are missing (no key, or no allow-list)
assert.equal((await handle(req(),{...env,GEMINI_API_KEY:''},fakeFetch())).status,503);
assert.equal((await handle(req(),{...env,ALLOWED_EMAILS:''},fakeFetch())).status,503);
// auth: no token, rejected token, email not on the list
assert.equal((await handle(req({auth:false}),env,fakeFetch())).status,401);
assert.equal((await handle(req(),env,fakeFetch({userStatus:401}))).status,401);
let f=fakeFetch({user:{email:'stranger@example.com'}});r=await json(await handle(req(),env,f));assert.equal(r.status,403);assert.equal(f.calls.some(c=>c.url.includes('generativelanguage')),false,'Gemini is never called for a stranger');
// input checks
assert.equal((await handle(req({body:{image:png,mimeType:'application/pdf'}}),env,fakeFetch())).status,400);
assert.equal((await handle(req({body:{image:'not base64!!',mimeType:'image/png'}}),env,fakeFetch())).status,400);
assert.equal((await handle(req({body:{image:'A'.repeat(Math.ceil(8*1024*1024*4/3)+8),mimeType:'image/png'}}),env,fakeFetch())).status,413);
assert.equal(decodeBase64Length(Buffer.alloc(10).toString('base64')),10);
// success: key only in a header, chosen model, image inline, deterministic settings, rows cleaned
f=fakeFetch();r=await json(await handle(req(),{...env,GEMINI_MODEL:'gemini-test-flash'},f));assert.equal(r.status,200);assert.equal(r.cors,ORIGIN);
const g=f.calls.find(c=>c.url.includes('generativelanguage'));assert.match(g.url,/models\/gemini-test-flash:generateContent$/);assert.equal(g.url.includes('test-key'),false,'key never in the URL');assert.equal(g.opts.headers['x-goog-api-key'],'test-key');
const sent=JSON.parse(g.opts.body);assert.equal(sent.generationConfig.temperature,0);assert.equal(sent.contents[0].parts[1].inline_data.data,png);assert.equal(sent.contents[0].parts[0].text,PROMPT);
assert.equal(f.calls.find(c=>c.url.endsWith('/auth/v1/user')).opts.headers.Authorization,'Bearer user-jwt');
assert.deepEqual(r.body.rows,[{name:'جانوفيا ١٠٠مجم ٢٨ قرص',unclear:false},{name:'ديكسافين شراب س ج',unclear:true},{name:'سطر مكسور فيه علامات',unclear:false}]);assert.equal(r.body.model,'gemini-test-flash');
assert.equal(JSON.stringify(r.body).includes('test-key'),false,'key never returned');
// default model, then Google errors mapped to clear Arabic messages
f=fakeFetch();await handle(req(),env,f);assert.match(f.calls.at(-1).url,/models\/gemini-flash-latest:generateContent$/);
for(const [status,code] of [[429,429],[404,502],[403,502],[500,502]]){r=await json(await handle(req(),env,fakeFetch({gemini:async()=>new Response('{}',{status})})));assert.equal(r.status,code);assert.ok(r.body.message)}
r=await json(await handle(req(),{...env,GEMINI_MODEL:'bad/model'},fakeFetch()));assert.equal(r.status,503);
r=await json(await handle(req(),env,fakeFetch({gemini:async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'not json'}]}}]}),{status:200})})));assert.equal(r.status,502);
r=await json(await handle(req(),env,fakeFetch({gemini:async()=>{throw Error('offline')}})));assert.equal(r.status,502);
assert.throws(()=>parseRows(JSON.stringify({rows:Array(601).fill({name:'اسم'})})),/too-many-rows/);
assert.deepEqual(parseRows(JSON.stringify({rows:[]})),[]);
console.log('PASS: read-supplier-image: CORS allow-list, fails closed without secrets, Supabase auth + email allow-list before any Gemini call, type/size checks, key only in header, model setting, cleaned rows with unclear flags, Google errors mapped');
})().catch(e=>{console.error(e);process.exitCode=1});
