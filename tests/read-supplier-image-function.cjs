// Tests the Supabase function with Node (22.18+ strips the TypeScript types). No network: fetch is faked.
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
const {handle,parseRows,decodeBase64Length,PROMPT,arabicLetters,annotate,resetCatalogCache}=await import(path.join(__dirname,'..','supabase','functions','read-supplier-image','index.ts'));
const ORIGIN='https://taherasker2560-dot.github.io';
const env={GEMINI_API_KEY:'test-key',ALLOWED_EMAILS:'Owner@Example.com, second@example.com',SUPABASE_URL:'https://proj.supabase.co/',SUPABASE_ANON_KEY:'anon'};
const png=Buffer.from('fake image bytes').toString('base64');
function fakeFetch({user={email:'owner@example.com'},userStatus=200,gemini,catalogResponse,aliasesResponse,fixesResponse}={}){const calls=[];const f=async(url,opts={})=>{calls.push({url,opts});
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify(user),{status:userStatus});
  if(url.includes('/storage/v1/object/authenticated/asker-private/catalog.json'))return catalogResponse?catalogResponse(url,opts):new Response('not found',{status:404});
  if(url.includes('/rest/v1/name_aliases'))return aliasesResponse?aliasesResponse(url,opts):new Response('[]',{status:200});
  if(url.includes('/rest/v1/reading_fixes'))return fixesResponse?fixesResponse(url,opts):new Response('[]',{status:200});
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
const sent=JSON.parse(g.opts.body);assert.equal(sent.generationConfig.temperature,0);assert.deepEqual(sent.generationConfig.thinkingConfig,{thinkingBudget:0},'no thinking for a copy task');assert.equal(sent.contents[0].parts[1].inline_data.data,png);assert.equal(sent.contents[0].parts[0].text,PROMPT);
assert.equal(f.calls.find(c=>c.url.endsWith('/auth/v1/user')).opts.headers.Authorization,'Bearer user-jwt');
assert.deepEqual(r.body.rows.map(x=>[x.name,x.unclear,x.match,x.candidates.length]),[['جانوفيا ١٠٠مجم ٢٨ قرص',false,null,0],['ديكسافين شراب س ج',true,null,0],['سطر مكسور فيه علامات',false,null,0]],'no catalogue uploaded yet: names still come back, without matching');assert.equal(r.body.model,'gemini-test-flash');assert.equal(r.body.catalog,0);
assert.equal(JSON.stringify(r.body).includes('test-key'),false,'key never returned');
// default model, then Google errors mapped to clear Arabic messages
f=fakeFetch();await handle(req(),env,f);assert.match(f.calls.find(c=>c.url.includes('generativelanguage')).url,/models\/gemini-flash-latest:generateContent$/);
for(const [status,code] of [[429,429],[404,502],[403,502],[500,502]]){r=await json(await handle(req(),env,fakeFetch({gemini:async()=>new Response('{}',{status})})));assert.equal(r.status,code);assert.ok(r.body.message)}
r=await json(await handle(req(),{...env,GEMINI_MODEL:'bad/model'},fakeFetch()));assert.equal(r.status,503);
r=await json(await handle(req(),env,fakeFetch({gemini:async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'not json'}]}}]}),{status:200})})));assert.equal(r.status,502);
r=await json(await handle(req(),env,fakeFetch({gemini:async()=>{throw Error('offline')}})));assert.equal(r.status,502);
const te=Object.assign(Error('t'),{name:'TimeoutError'});r=await json(await handle(req(),env,fakeFetch({gemini:async()=>{throw te}})));assert.equal(r.status,504);assert.match(r.body.message,/اتأخر/);
const slowAuth=async(u,o)=>{if(u.endsWith('/auth/v1/user'))throw Object.assign(Error('t'),{name:'TimeoutError'});};r=await json(await handle(req(),env,slowAuth));assert.equal(r.status,504);
assert.ok(f.calls.every(c=>c.opts.signal),'every outgoing call has a timeout');
// item matching: catalogue from the private bucket (read with the caller's session), confirmed names win
{const items=[['24738','JANUVIA 100MG 28TAB'],['24739','JANUVIA 50MG 28TAB'],['500','FLAGYL 125MG SYP',['فلاجيل شراب']],['900','TEGRETOL 200MG 30T.'],['901','TEGRETOL CR 200MG 20T.']];
 const gem=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({rows:[{name:'جانوفيا ١٠٠ مجم ٢٨ قرص',english:'JANUVIA 100MG 28TAB'},{name:'جانوفيا ٥٠ مجم ٢٨ قرص',english:'JANUVIA 50MG 28TAB'},{name:'فلاجیل شراب',english:''},{name:'تيجيريتول ٢٠٠ اقراص',english:'TEGRETOL 200 TAB'}]})}]}}]}),{status:200});
 const seen=[];const ff=fakeFetch({gemini:gem,catalogResponse:async(u,o)=>{seen.push(o.headers.Authorization);return new Response(JSON.stringify(items),{status:200})},aliasesResponse:async()=>new Response(JSON.stringify([{alias_key:'تيجيريتول 200 اقراص',target_name:'TEGRETOL 200MG 30T.',target_code:'900'}]),{status:200})});
 r=await json(await handle(req(),{...env,GEMINI_MODEL:'gemini-match-test'},ff));assert.equal(r.status,200);assert.equal(r.body.catalog,5);assert.equal(seen[0],'Bearer user-jwt','catalogue read with the user session, no service key');
 const m=r.body.rows.map(x=>x.match&&[x.match.name,x.match.confidence]);
 assert.deepEqual(m[0],['JANUVIA 100MG 28TAB','high']);assert.deepEqual(m[1],['JANUVIA 50MG 28TAB','high'],'50 never matched to 100');
 assert.deepEqual(m[2],['FLAGYL 125MG SYP','high'],'Arabic alt name + Persian yeh');assert.deepEqual(m[3],['TEGRETOL 200MG 30T.','confirmed'],'confirmed name wins over two equal candidates');
 assert.equal(r.body.rows[3].key,'تيجيريتول 200 اقراص');}
// owner tools: item search and re-matching after an Arabic correction; a saved reading fix is applied before matching
{resetCatalogCache();const items=[['24738','JANUVIA 100MG 28TAB'],['24739','JANUVIA 50MG 28TAB'],['500','FLAGYL 125MG SYP',['فلاجيل شراب']],['77','CLEXANE 4000/0.4ML 2AMP']];
 const cat=async()=>new Response(JSON.stringify(items),{status:200});
 r=await json(await handle(req({body:{action:'search',q:'janu'}}),{...env},fakeFetch({catalogResponse:cat})));assert.equal(r.status,200);assert.deepEqual(r.body.items.map(x=>x.id).sort(),['24738','24739']);
 r=await json(await handle(req({body:{action:'search',q:'77'}}),env,fakeFetch({catalogResponse:cat})));assert.deepEqual(r.body.items,[{id:'77',name:'CLEXANE 4000/0.4ML 2AMP'}],'item code search');
 r=await json(await handle(req({body:{action:'search',q:'j'}}),env,fakeFetch({catalogResponse:cat})));assert.equal(r.status,400);
 resetCatalogCache();r=await json(await handle(req({body:{action:'search',q:'janu'}}),env,fakeFetch()));assert.equal(r.status,503,'no catalogue uploaded');
 f=fakeFetch({user:{email:'stranger@example.com'},catalogResponse:cat});r=await json(await handle(req({body:{action:'search',q:'janu'}}),env,f));assert.equal(r.status,403,'search is owner-only too');
 r=await json(await handle(req({body:{action:'match',name:'جانوفيا ٥٠ مجم ٢٨ قرص',english:'JANUVIA 50MG'}}),env,fakeFetch({catalogResponse:cat})));assert.equal(r.status,200);assert.equal(r.body.row.match.name,'JANUVIA 50MG 28TAB');
 const gem=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({rows:[{name:'جانوفيا ٥٠٠ مجم ٢٨ قرص',english:'JANUVIA 500MG 28TAB'}]})}]}}]}),{status:200});
 r=await json(await handle(req(),{...env,GEMINI_MODEL:'gemini-fix-test'},fakeFetch({gemini:gem,catalogResponse:cat,fixesResponse:async()=>new Response(JSON.stringify([{read_key:'جانوفيا 500 مجم 28 قرص',corrected_text:'جانوفيا ٥٠ مجم ٢٨ قرص'}]),{status:200})})));
 assert.equal(r.body.rows[0].corrected,'جانوفيا ٥٠ مجم ٢٨ قرص');assert.equal(r.body.rows[0].name,'جانوفيا ٥٠٠ مجم ٢٨ قرص','text as read is kept for display');assert.equal(r.body.rows[0].match.name,'JANUVIA 50MG 28TAB','matched on the corrected text');}
// two different confirmations for the same supplier name -> review, never a silent pick
{const cat=null;const rows=annotate([{name:'اسم',english:'',unclear:false}],cat,[{alias_key:'اسم',target_name:'A',target_code:'1'},{alias_key:'اسم',target_name:'B',target_code:'2'}]);assert.equal(rows[0].match,null);}
// a model that rejects optional settings with a bare 400 steps down: no thinking, then no schema
{let n=0;const bodies=[];const ff=fakeFetch({gemini:async(u,o)=>{n++;bodies.push(JSON.parse(o.body).generationConfig);return n<3?new Response(JSON.stringify({error:{message:'Request contains an invalid argument.'}}),{status:400}):new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"rows":[{"name":"اسم صنف"}]}'}]}}]}),{status:200})}});
 r=await json(await handle(req(),{...env,GEMINI_MODEL:'gemini-step-down-test'},ff));assert.equal(r.status,200);assert.equal(n,3);
 assert.ok(bodies[0].thinkingConfig&&bodies[0].responseSchema);assert.ok(!bodies[1].thinkingConfig&&bodies[1].responseSchema);assert.ok(!bodies[2].thinkingConfig&&!bodies[2].responseSchema);assert.equal(bodies[2].responseMimeType,'application/json');}
// a bad key is not retried
{let n=0;r=await json(await handle(req(),env,fakeFetch({gemini:async()=>{n++;return new Response(JSON.stringify({error:{message:'API key not valid. Please pass a valid API key.'}}),{status:400})}})));assert.equal(n,1);assert.equal(r.status,502);assert.match(r.body.message,/GEMINI_API_KEY/);}
// all variants rejected: one clear error after 3 tries
{let n=0;r=await json(await handle(req(),{...env,GEMINI_MODEL:'gemini-all-reject-test'},fakeFetch({gemini:async()=>{n++;return new Response(JSON.stringify({error:{message:'Request contains an invalid argument.'}}),{status:400})}})));assert.equal(n,3);assert.equal(r.status,502);}
// Persian look-alike letters from the suppliers' font become the Arabic ones V10 matches on (real Gemini output, 27 Oct)
assert.equal(arabicLetters('گاربیمازول اقراص'),'كاربيمازول اقراص');assert.equal(arabicLetters('کليکسان ٦٠ امبول'),'كليكسان ٦٠ امبول');
assert.equal(arabicLetters('بی ای ايه ٤٠٠ مجم كبسول'),'بى اى ايه ٤٠٠ مجم كبسول');assert.equal(arabicLetters('ایفی مارش شراب'),'ايفى مارش شراب');assert.equal(arabicLetters('فلاجیل شراب'),'فلاجيل شراب');
assert.deepEqual(parseRows(JSON.stringify({rows:[{name:'گاست ٤ مجم ١٤ كيس'}]})),[{name:'كاست ٤ مجم ١٤ كيس',english:'',unclear:false}]);
// a rejected setting is remembered per model: the next image skips the failing call
{let n=0;const mk=()=>fakeFetch({gemini:async(u,o)=>{n++;return JSON.parse(o.body).generationConfig.thinkingConfig?new Response(JSON.stringify({error:{message:'Request contains an invalid argument.'}}),{status:400}):new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"rows":[{"name":"اسم صنف"}]}'}]}}]}),{status:200})}});
 const e2={...env,GEMINI_MODEL:'gemini-remember-test'};await handle(req(),e2,mk());assert.equal(n,2);n=0;r=await json(await handle(req(),e2,mk()));assert.equal(r.status,200);assert.equal(n,1,'second image: one call only');}
assert.throws(()=>parseRows(JSON.stringify({rows:Array(601).fill({name:'اسم'})})),/too-many-rows/);
assert.deepEqual(parseRows(JSON.stringify({rows:[]})),[]);
console.log('PASS: read-supplier-image: CORS allow-list, fails closed without secrets, Supabase auth + email allow-list before any Gemini call, type/size checks, key only in header, model setting, cleaned rows with unclear flags, Google errors mapped');
})().catch(e=>{console.error(e);process.exitCode=1});
