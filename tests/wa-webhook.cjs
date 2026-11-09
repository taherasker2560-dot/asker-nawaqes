// WhatsApp Cloud API webhook, shadow mode (wa.ts): Meta's GET check, signed POSTs only, saved suppliers' messages
// logged in ar_wa_log (text, photo hash), customers dropped unsaved, nothing read/spoken/added to ar_inbox.
// Fake Supabase and Meta; nothing real is called.
const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
const dir=path.join(__dirname,'..','supabase','functions','arabic-shortages'),href=f=>require('node:url').pathToFileURL(path.join(dir,f)).href;
const F=await import(href('index.ts')),W=await import(href('wa.ts'));
const SECRET='app-secret-for-tests',VERIFY='verify-token-0123456789';
const env={GEMINI_API_KEY:'k',ALLOWED_EMAILS:'owner@example.com',SUPABASE_URL:'https://p.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',
 WA_APP_SECRET:SECRET,WA_VERIFY_TOKEN:VERIFY,WA_TOKEN:'wa-token'};
const PHOTO=new Uint8Array([0xff,0xd8,0xff,0xe0,1,2,3,4,5,6,7,8,9]);
const HASH=crypto.createHash('sha256').update(PHOTO).digest('hex').slice(0,32);
const suppliers=[{name:'مخزن الفتح (شريف)',phone:'201013791253'},{name:'مخزن نيو سيتى فارما',phone:'201003337262'},{name:'مخزن نيوسيتى (محمود جميل)',phone:'01003337262'},{name:'بدون رقم',phone:null}];
function fake({mediaUrl='https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1'}={}){
 const calls=[],log=[];
 const f=async(url,o={})=>{calls.push({url,o});
  if(url.includes('/rest/v1/ar_suppliers'))return new Response(JSON.stringify(suppliers));
  if(url.includes('/rest/v1/ar_wa_log')&&o.method==='POST'){const row=JSON.parse(o.body);if(log.some(r=>r.wa_id===row.wa_id))return new Response('dup',{status:409});log.push(row);return new Response('',{status:201})}
  if(url.includes('/rest/v1/ar_wa_log')&&o.method==='DELETE')return new Response('',{status:204});
  if(url.startsWith('https://graph.facebook.com/v23.0/MID1'))return new Response(JSON.stringify({url:mediaUrl,mime_type:'image/jpeg',file_size:PHOTO.length}));
  if(url.startsWith('https://lookaside.fbsbx.com/'))return new Response(PHOTO);
  throw Error('unexpected '+url)};
 Object.assign(f,{calls,log});return f}
const sign=(body,secret=SECRET)=>'sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex');
const post=(payload,sig)=>{const body=JSON.stringify(payload);return new Request('https://p.supabase.co/functions/v1/arabic-shortages',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':sig===undefined?sign(body):sig},body})};
const msg=(m,contacts=[{wa_id:m.from,profile:{name:'Shreif'}}])=>({object:'whatsapp_business_account',entry:[{id:'WABA',changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{phone_number_id:'PN'},contacts,messages:[m]}}]}]});
const text=(from,body,id='wamid.T1')=>msg({from,id,timestamp:'1794246830',type:'text',text:{body}});
const noOther=f=>assert.ok(!f.calls.some(c=>c.url.includes('generativelanguage')||c.url.includes('/rest/v1/ar_inbox')||c.url.includes('/storage/')),'no Gemini, no ar_inbox, no storage');

// which requests are Meta's
assert.equal(W.isWaRequest(new Request('https://p.supabase.co/f?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1')),true);
assert.equal(W.isWaRequest(new Request('https://p.supabase.co/f',{method:'POST',headers:{'x-hub-signature-256':'sha256=00'}})),true);
assert.equal(W.isWaRequest(new Request('https://p.supabase.co/f',{method:'POST',body:'{}'})),false);
// phones compared with the country code
assert.equal(W.phoneKey('01013791253'),'201013791253');
assert.equal(W.phoneKey('+20 101 379 1253'),'201013791253');
assert.equal(W.phoneKey('00201013791253'),'201013791253');
assert.equal(W.phoneKey(null),'');

// Meta's GET check: only the right token gets the challenge back (through the function's main entry)
let f=fake();
let r=await F.handle(new Request(`https://p.supabase.co/f?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=4242`),env,f);
assert.equal(r.status,200);assert.equal(await r.text(),'4242');
r=await F.handle(new Request('https://p.supabase.co/f?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=4242'),env,f);
assert.equal(r.status,403);
r=await F.handle(new Request('https://p.supabase.co/f?hub.mode=subscribe&hub.verify_token=short&hub.challenge=1'),{...env,WA_VERIFY_TOKEN:'short'},f);
assert.equal(r.status,403,'a short verify token is never accepted');
assert.equal(f.calls.length,0);

// unsigned / wrongly signed POST: refused before anything is read or saved
f=fake();
r=await F.handle(post(text('201013791253','فلاجيل'),'sha256='+'0'.repeat(64)),env,f);assert.equal(r.status,401);
r=await F.handle(post(text('201013791253','فلاجيل'),sign('other body')),env,f);assert.equal(r.status,401);
r=await F.handle(post(text('201013791253','فلاجيل'),sign(JSON.stringify(text('201013791253','فلاجيل')),'wrong-secret')),env,f);assert.equal(r.status,401);
assert.equal(f.calls.length,0);
// not configured (no app secret): refused
r=await F.handle(post(text('201013791253','x')),{...env,WA_APP_SECRET:''},f);assert.equal(r.status,503);

// a saved supplier's text: logged with its company, nothing read or spoken
f=fake();
r=await F.handle(post(text('201013791253','وارد اليوم\nفلاجيل شراب')),env,f);
assert.equal(r.status,200);
assert.equal(f.log.length,1);
assert.deepEqual(f.log[0].suppliers,['مخزن الفتح (شريف)']);
assert.equal(f.log[0].kind,'text');assert.equal(f.log[0].body_text,'وارد اليوم\nفلاجيل شراب');
assert.equal(f.log[0].phone,'201013791253');assert.equal(f.log[0].wa_id,'wamid.T1');
assert.equal(f.log[0].at,new Date(1794246830*1000).toISOString());
assert.equal(f.log[0].profile,'Shreif');assert.equal(f.log[0].media_hash,null);
noOther(f);
// the same message sent again by Meta (same wa_id): still 200, logged once
r=await F.handle(post(text('201013791253','وارد اليوم\nفلاجيل شراب')),env,f);
assert.equal(r.status,200);assert.equal(f.log.length,1);

// a customer (number not saved): dropped, nothing stored
f=fake();
r=await F.handle(post(text('201234567890','عندكم بانادول؟','wamid.C1')),env,f);
assert.equal(r.status,200);assert.equal(f.log.length,0);
assert.ok(!f.calls.some(c=>c.url.includes('ar_wa_log')),'nothing written for a customer');

// a supplier's photo: downloaded with the token (Meta's hosts only), logged by the same hash the phone path uses
f=fake();
const photo=msg({from:'201013791253',id:'wamid.P1',timestamp:'1794246900',type:'image',image:{id:'MID1',mime_type:'image/jpeg',caption:'وارد'}});
r=await F.handle(post(photo),env,f);
assert.equal(r.status,200);assert.equal(f.log.length,1);
assert.equal(f.log[0].kind,'image');assert.equal(f.log[0].media_hash,HASH);assert.equal(f.log[0].size,PHOTO.length);
assert.equal(f.log[0].caption,'وارد');assert.equal(f.log[0].error,null);
const meta=f.calls.find(c=>c.url.startsWith('https://graph.facebook.com/'));
assert.equal(meta.o.headers.Authorization,'Bearer wa-token');
assert.equal(f.calls.find(c=>c.url.startsWith('https://lookaside.fbsbx.com/')).o.headers.Authorization,'Bearer wa-token');
noOther(f);
// a media link on another host: the token is not sent there; the message is still logged, with the error
f=fake({mediaUrl:'https://evil.example.com/x'});
r=await F.handle(post(photo),env,f);
assert.equal(r.status,200);assert.equal(f.log.length,1);
assert.equal(f.log[0].media_hash,null);assert.equal(f.log[0].error,'media url');
assert.ok(!f.calls.some(c=>c.url.startsWith('https://evil.example.com')));
// no WA_TOKEN: the photo is logged without its hash
f=fake();
r=await F.handle(post(photo),{...env,WA_TOKEN:''},f);
assert.equal(r.status,200);assert.equal(f.log[0].error,'no-token');
assert.ok(!f.calls.some(c=>c.url.startsWith('https://graph.facebook.com/')));

// documents: PDF and Excel kinds by type or name
const doc=(id,mime,filename)=>W.waMessages(msg({from:'201013791253',id,timestamp:'1',type:'document',document:{id:'M',mime_type:mime,filename}}))[0].kind;
assert.equal(doc('d1','application/pdf','list.pdf'),'pdf');
assert.equal(doc('d2','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','x.xlsx'),'sheet');
assert.equal(doc('d3','application/octet-stream','list.csv'),'sheet');
assert.equal(doc('d4','application/zip','a.zip'),'file');
// voice notes, reactions, stickers and delivery statuses: not incoming lists
for(const m of [{type:'audio',audio:{id:'A'}},{type:'reaction',reaction:{emoji:'👍'}},{type:'sticker',sticker:{id:'S'}}])
 assert.equal(W.waMessages(msg({from:'201013791253',id:'x',timestamp:'1',...m})).length,0);
f=fake();
r=await F.handle(post({entry:[{changes:[{field:'messages',value:{statuses:[{id:'wamid.X',status:'read'}]}}]}]}),env,f);
assert.equal(r.status,200);assert.equal(f.calls.length,0,'statuses only: nothing done');
// echoes of the pharmacy's own messages (another field) are not incoming
assert.equal(W.waMessages({entry:[{changes:[{field:'smb_message_echoes',value:{message_echoes:[{from:'201013791253',id:'e',type:'text',text:{body:'x'}}]}}]}]}).length,0);
// junk payloads never throw
for(const p of [null,{},{entry:'x'},{entry:[{changes:'x'}]},{entry:[{changes:[{field:'messages',value:{messages:'x'}}]}]}])assert.deepEqual(W.waMessages(p),[]);

// one phone saved under two names (a rep's own chat and his company's group record): both kept for the owner to see
f=fake();
r=await F.handle(post(text('201003337262','متاح النهارده','wamid.N1')),env,f);
assert.equal(r.status,200);assert.deepEqual(f.log[0].suppliers,['مخزن نيو سيتى فارما','مخزن نيوسيتى (محمود جميل)']);

// the phone path and the page are untouched: a request without Meta's headers still goes the old way
f=fake();
r=await F.handle(new Request('https://p.supabase.co/f',{method:'POST',headers:{origin:'https://taherasker2560-dot.github.io'},body:'{}'}),env,f);
assert.equal(r.status,401,'page request still needs the login');
// signature check itself
const raw=new TextEncoder().encode('{"a":1}');
assert.equal(await W.validSignature(raw,sign('{"a":1}'),SECRET),true);
assert.equal(await W.validSignature(raw,sign('{"a":1}').toUpperCase().replace('SHA256','sha256'),SECRET),true);
assert.equal(await W.validSignature(raw,null,SECRET),false);
assert.equal(await W.validSignature(raw,sign('{"a":1}'),''),false);
assert.equal(await W.mediaHash(PHOTO),HASH);
console.log('wa-webhook ok');
})().catch(e=>{console.error(e);process.exit(1)});
