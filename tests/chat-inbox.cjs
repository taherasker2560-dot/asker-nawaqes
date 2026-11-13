// The warehouses' link (owner 2026-11-14): arabic-shortages ?chat=1 takes what a warehouse sent on our messages page into
// «الوارد» (ar_inbox, via 'link'), read and matched like the phone's WhatsApp inbox. No login: the chat's secret; a customer's
// chat is never read; each message is taken once; a file that cannot be fetched is given back. Fake Supabase and Gemini.
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
const F=await import(require('node:url').pathToFileURL(path.join(__dirname,'..','supabase','functions','arabic-shortages','index.ts')).href);
const env={GEMINI_API_KEY:'k',ALLOWED_EMAILS:'owner@example.com',SUPABASE_URL:'https://p.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',ALLOWED_ORIGINS:'https://taherasker2560-dot.github.io'};
const W='a'.repeat(64),C='b'.repeat(64),SUP='مخزن تجربة (حسن)';
const shortages=[{id:'s1',product_name:'BRUFEN 400MG 30TAB'},{id:'s2',product_name:'FLAGYL 125MG SYP'}];
const names=[{name_key:'FLAGYL 125MG SYP',arabic_name:'فلاجيل ١٢٥ مجم شراب',status:'approved'},{name_key:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠ مجم ٣٠ قرص',status:'approved'}];
const JPG=new Uint8Array([255,216,255,224,1,2,3]),PDF=new TextEncoder().encode('%PDF-1.4 list');
function fake({msgs,files={}}){const calls=[],saved=[],stored=[];const page=(u,a)=>new Response(JSON.stringify(u.includes('offset=0')?a:[]));
 const f=async(url,o={})=>{calls.push({url,o});const u=decodeURIComponent(url);
  if(url.includes('/rest/v1/ar_chats?'))return page(url,u.includes('secret=eq.'+W)?[{id:'c1',supplier:SUP}]:u.includes('secret=eq.'+C)?[{id:'c2',supplier:null}]:[]);
  if(url.includes('/rest/v1/ar_chat_messages')&&o.method==='PATCH'){const id=+u.match(/id=eq\.(\d+)/)[1],m=msgs.find(x=>x.id===id),v=JSON.parse(o.body).inbox_at;
   if(u.includes('inbox_at=is.null')){if(!m||m.inbox_at)return new Response('[]');m.inbox_at=v;return new Response(JSON.stringify([{id}]))}
   m.inbox_at=v;return new Response('[]')}
  if(url.includes('/rest/v1/ar_chat_messages?')){assert.match(u,/chat_id=eq\.c1&sender=eq\.customer&inbox_at=is\.null&at=gte\./);return page(url,msgs.filter(m=>!m.inbox_at).map(({id,kind,body,media})=>({id,kind,body,media})))}
  if(url.includes('/storage/v1/object/ar-chat/')){const p=url.split('/ar-chat/')[1];return files[p]?new Response(files[p],{headers:{'content-type':p.endsWith('.pdf')?'application/pdf':'image/jpeg'}}):new Response('{}',{status:404})}
  if(url.includes('/storage/v1/object/ar-inbox/')){stored.push(url.split('/ar-inbox/')[1]);return new Response('{}')}
  if(url.includes('/rest/v1/ar_inbox?select=id&file_path=like.'))return page(url,saved.filter(r=>r.file_path&&url.includes(r.file_path.split('/')[1].split('.')[0])).map(()=>({id:'x'})));
  if(url.includes('/rest/v1/ar_inbox')&&o.method==='POST'){const row=JSON.parse(o.body);if(saved.some(r=>r.chat_msg===row.chat_msg))return new Response('{}',{status:409});saved.push(row);return new Response('',{status:201})}
  if(url.includes('/rest/v1/ar_shortages'))return page(url,shortages);
  if(url.includes('/rest/v1/ar_names'))return page(url,names);
  if(url.includes('/rest/v1/ar_answers')||url.includes('/rest/v1/ar_fixes')||url.includes('/rest/v1/ar_ignored'))return page(url,[]);
  if(url.startsWith('https://generativelanguage'))return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})}]}}]}));
  throw Error('unexpected '+url)};Object.assign(f,{calls,saved,stored});return f}
const post=(body,origin='https://taherasker2560-dot.github.io')=>new Request('https://p.supabase.co/functions/v1/arabic-shortages?chat=1',{method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer anon'},body:JSON.stringify(body)});
const day='2026-11-14';
// a warehouse's chat: text, a photo, a voice note with its words, one still without, and a PDF
let msgs=[{id:1,kind:'text',body:'فلاجيل شراب ١٢٥\nحاجة تانية',media:null},{id:2,kind:'photo',body:null,media:`c/${day}/11111111-2222-4333-8444-555555555555.jpg`},
 {id:3,kind:'voice',body:'بروفين ٤٠٠',media:`c/${day}/11111111-2222-4333-8444-666666666666.wav`},{id:4,kind:'voice',body:null,media:`c/${day}/11111111-2222-4333-8444-777777777777.wav`}];
let f=fake({msgs,files:{[`c/${day}/11111111-2222-4333-8444-555555555555.jpg`]:JPG}});
let r=await F.handle(post({secret:W}),env,f);assert.equal(r.status,200);let j=await r.json();
assert.deepEqual(j.done,{1:'ok',2:'ok',3:'ok'});assert.equal(j.left,0);
assert.ok(!f.calls.some(c=>c.url.includes('/auth/v1/')),'no login asked');
assert.ok(f.calls.filter(c=>c.url.includes('/rest/v1/')).every(c=>c.o.headers.apikey==='service'),'service role');
assert.deepEqual(f.saved.map(x=>[x.chat_msg,x.kind,x.supplier,x.sender,x.via,x.status,x.sure]),[[1,'text',SUP,'رابط المخزن','link','new',1],[2,'image',SUP,'رابط المخزن','link','new',1],[3,'text',SUP,'رابط المخزن','link','new',1]]);
assert.equal(f.saved[0].body_text,'فلاجيل شراب ١٢٥\nحاجة تانية');assert.equal(f.saved[0].rows.length,2);
assert.match(f.saved[1].file_path,/^\d{4}-\d\d-\d\d\/[0-9a-f]{32}\.jpg$/);assert.deepEqual(f.stored,[f.saved[1].file_path],'the photo kept in ar-inbox like WhatsApp\'s');
assert.equal(msgs[3].inbox_at,undefined,'a voice note waits for its words');
assert.ok(msgs.slice(0,3).every(m=>m.inbox_at),'taken once');
// again: nothing new is read (and the voice note, once it has its words, goes)
msgs[3].body='كونكور ٥';r=await F.handle(post({secret:W}),env,f);j=await r.json();assert.deepEqual(j.done,{4:'ok'});
r=await F.handle(post({secret:W}),env,f);j=await r.json();assert.deepEqual(j.done,{});assert.equal(f.saved.length,4);
// a PDF; a file that cannot be fetched is given back for the next call; the same photo again is kept once
msgs=[{id:5,kind:'file',body:'عروض.pdf',media:`c/${day}/22222222-2222-4333-8444-555555555555.pdf`},{id:6,kind:'photo',body:null,media:`c/${day}/22222222-2222-4333-8444-666666666666.jpg`},{id:7,kind:'photo',body:null,media:`c/${day}/22222222-2222-4333-8444-777777777777.jpg`}];
f=fake({msgs,files:{[msgs[0].media]:PDF,[msgs[2].media]:JPG}});
f.saved.push({chat_msg:99,file_path:'2026-11-13/'+require('node:crypto').createHash('sha256').update(JPG).digest('hex').slice(0,32)+'.jpg'});
r=await F.handle(post({secret:W}),env,f);j=await r.json();assert.deepEqual(j.done,{5:'ok',6:'file',7:'duplicate'});
assert.equal(f.saved[1].kind,'pdf');assert.match(f.saved[1].file_path,/\.pdf$/);
assert.equal(msgs[1].inbox_at,null,'given back');assert.ok(msgs[2].inbox_at);
// at most 4 a call (a long list of photos goes over the next calls)
msgs=Array.from({length:6},(_,i)=>({id:10+i,kind:'text',body:'بروفين ٤٠٠ '+i,media:null}));f=fake({msgs});
j=await (await F.handle(post({secret:W}),env,f)).json();assert.equal(Object.keys(j.done).length,4);assert.equal(j.left,2);
// a customer's chat is never read; a wrong secret; another page's origin
f=fake({msgs:[{id:20,kind:'text',body:'بانادول',media:null}]});
j=await (await F.handle(post({secret:C}),env,f)).json();assert.deepEqual(j,{ok:false,error:'not-supplier'});
assert.ok(!f.calls.some(c=>c.url.includes('ar_chat_messages')||c.url.includes('generativelanguage')));
assert.equal((await F.handle(post({secret:'c'.repeat(64)}),env,f)).status,404);
assert.equal((await F.handle(post({secret:'xyz'}),env,f)).status,400);
assert.equal((await F.handle(post({secret:W},'https://evil.example'),env,f)).status,403);
console.log('PASS: chat inbox: a warehouse\'s link → «الوارد» (read like WhatsApp\'s, taken once, files given back, 4 a call), never a customer\'s');
})().catch(e=>{console.error(e);process.exit(1)});
