// Documents group (owner 2026-11-08): the pharmacy's own WhatsApp group (ar_doc_chats) sends purchase invoices,
// credit notes and receipts. Its photos/PDFs are kept as documents (ar_documents, ar-inbox/docs/), never read by
// Gemini and never spoken; its texts are ignored. A photo that reaches a company's run while only the group announced
// photos is the group's document. Fake Supabase and Gemini; nothing real is called.
const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
(async()=>{
const F=await import(pathToFileURL(path.join(__dirname,'..','supabase','functions','arabic-shortages','index.ts')).href);
const env={GEMINI_API_KEY:'k',ALLOWED_EMAILS:'owner@example.com',SUPABASE_URL:'https://p.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',INBOX_CLAIM_WAIT_MS:'1'};
const KEY='a'.repeat(64),HASH=crypto.createHash('sha256').update(KEY).digest('hex');
const GROUP='ص/عسكر( نواقص و فواتير)',TITLE=GROUP+': احمد',COMPANY='المتحدة للأدوية';
function fake({chats=[GROUP],media=[],inboxFiles=[]}={}){const calls=[],docs=[],files=[],saved=[];let gemini=0;
 const page=(u,a)=>new Response(JSON.stringify(u.includes('offset=0')||!u.includes('offset=')?a:[]));
 const f=async(url,o={})=>{calls.push({url,o});const m=o.method||'GET';
  if(url.includes('/rest/v1/ar_inbox_keys'))return page(url,url.includes('key_hash=eq.'+HASH)?[{key_hash:HASH}]:[]);
  if(url.includes('/rest/v1/ar_suppliers'))return page(url,[{name:COMPANY,phone:'201001234567'}]);
  if(url.includes('/rest/v1/ar_doc_chats'))return page(url,chats.map(name=>({name})));
  if(url.includes('/rest/v1/ar_inbox_media')){
   if(m==='POST'){media.push({fresh:true,done:false,at:new Date().toISOString(),...JSON.parse(o.body)});return new Response('',{status:201})}
   if(m==='DELETE')return new Response('',{status:204});
   if(m==='PATCH')return new Response('[]');
   const sup=decodeURIComponent((url.match(/supplier=eq\.([^&]+)/)||[])[1]||'');
   const noteEq=decodeURIComponent((url.match(/[?&]note=eq\.([^&]+)/)||[])[1]||'');
   if(url.includes('select=note'))return new Response(JSON.stringify(media.filter(x=>x.supplier===sup&&(!noteEq||x.note===noteEq)).slice(-1).map(x=>({note:x.note,at:x.at}))));
   if(url.includes('select=at&'))return new Response(JSON.stringify(media.filter(x=>x.supplier===sup&&x.fresh!==false).slice(-1).map(x=>({at:x.at}))));
   return page(url,media.map(x=>({supplier:x.supplier,fresh:x.fresh,note:x.note})))}
  if(url.includes('/rest/v1/ar_documents')){
   if(m==='POST'){const row=JSON.parse(o.body);if(docs.some(d=>d.file_path===row.file_path))return new Response('{}',{status:409});docs.push(row);return new Response('',{status:201})}
   const h=(url.match(/file_path=like\.\*([0-9a-f]+)\*/)||[])[1];return new Response(JSON.stringify(docs.filter(d=>h&&d.file_path.includes(h)).map(()=>({id:'d'}))))}
  if(url.includes('/storage/v1/object/ar-inbox/')){files.push({url,headers:o.headers});return new Response('{}')}
  if(url.includes('/rest/v1/ar_inbox?select=id&file_path=like.')){const h=(url.match(/like\.\*([0-9a-f]+)\*/)||[])[1];return new Response(JSON.stringify(inboxFiles.some(p=>h&&p.includes(h))?[{id:'in'}]:[]))}
  if(url.includes('/rest/v1/ar_inbox')&&m==='POST'){const row=JSON.parse(o.body);row.id='in'+(saved.length+1);row.received_at=new Date().toISOString();saved.push(row);return new Response(JSON.stringify([{id:row.id,received_at:row.received_at}]),{status:201})}
  if(url.startsWith('https://generativelanguage')){gemini++;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})}]}}]}))}
  if(url.includes('/rest/v1/')&&m==='GET')return page(url,[]);
  throw Error('unexpected '+m+' '+url)};
 Object.assign(f,{calls,docs,files,saved,media,gemini:()=>gemini});return f}
const post=(q,body,type)=>new Request('https://p.supabase.co/functions/v1/arabic-shortages?'+q,{method:'POST',headers:{'x-inbox-key':KEY,'content-type':type},body});
const from=(t,extra='')=>'from='+encodeURIComponent(t)+extra;
const jpg=(n)=>new Uint8Array([0xff,0xd8,0xff,0xe0,n,1,2,3]);

// 1) a text in the group («تمام يا دكتور»): ignored, nothing kept, nothing said
let f=fake(),r=await F.handle(post(from(TITLE,'&say=1'),'تمام يا دكتور','text/plain; charset=utf-8'),env,f);
assert.equal(r.status,200);assert.equal(await r.text(),'');assert.equal(f.docs.length,0);assert.equal(f.saved.length,0);assert.equal(f.media.length,0);

// 2) a photo notification in the group: remembered under the group's name, 202 so the phone sends the photo
f=fake();r=await F.handle(post(from(TITLE,'&say=1'),'📷 صورة','text/plain'),env,f);
assert.equal(r.status,202);assert.equal(await r.text(),'');assert.equal(f.media.length,1);assert.equal(f.media[0].supplier,GROUP);
// the same notification shown again (WhatsApp repeats it every few minutes): never a second look at the folder, even
// long after (live 2026-11-08: a repeat sent a customer's prescription photo)
r=await F.handle(post(from(TITLE),'📷 صورة','text/plain'),env,f);assert.equal(r.status,200);assert.equal((await r.json()).repeat,true);
f.media.forEach(m=>{m.at=new Date(Date.now()-10*60e3).toISOString()});
r=await F.handle(post(from(TITLE),'📷 صورة','text/plain'),env,f);assert.equal(r.status,200,'a repeat 10 minutes later: still no look');
// a new photo in the group (WhatsApp changes the notification: new time) is looked at
r=await F.handle(post(from(TITLE+' ~w'+Date.now()),'📷 صورة','text/plain'),env,f);assert.equal(r.status,202);

// 2b) the photo's own time (&mod=, from the phone) must be around the group message's time (~w): other chats' photos
// of the last 3 minutes are not the group's; without the times every photo is taken (older phone setup)
{const when=Date.now()-30e3,sec=(ms)=>Math.floor(ms/1000);f=fake();
 r=await F.handle(post(from(TITLE+' ~w'+when,'&mod='+sec(when-150e3)),jpg(11),'image/jpeg'),env,f);assert.equal((await r.json()).other,true);assert.equal(f.docs.length,0,'saved 2.5 minutes before the message: another chat');
 r=await F.handle(post(from(TITLE+' ~w'+when,'&mod='+sec(when+250e3)),jpg(12),'image/jpeg'),env,f);assert.equal(f.docs.length,0,'4 minutes after: another chat');
 r=await F.handle(post(from(TITLE+' ~w'+when,'&mod='+sec(when+8e3)),jpg(13),'image/jpeg'),env,f);assert.equal(f.docs.length,1,'8 seconds after the message: the group\'s');
 r=await F.handle(post(from(TITLE+' ~w'+when),jpg(14),'image/jpeg'),env,f);assert.equal(f.docs.length,2,'no photo time: taken as before');
 assert.equal(F.nearMessage(null,when),true);assert.equal(F.nearMessage('abc',when),true);assert.equal(F.nearMessage(String(sec(when)),0),true);
 assert.equal(F.nearMessage(String(sec(when-50e3)),when),true,'phone clock a little behind');assert.equal(F.nearMessage(String(when+5e3),when),true,'milliseconds too');}

// 3) the group's photo: kept as a document under docs/, never read by Gemini, nothing said; the same photo again kept once
f=fake();r=await F.handle(post(from(TITLE,'&say=1&name=IMG-20261108-WA0001.jpg'),jpg(1),'application/octet-stream'),env,f);
assert.equal(r.status,200);assert.equal(await r.text(),'');
assert.equal(f.docs.length,1);assert.deepEqual(Object.keys(f.docs[0]).sort(),['chat','file_path','kind','source']);
assert.equal(f.docs[0].chat,GROUP);assert.equal(f.docs[0].source,'whatsapp');assert.equal(f.docs[0].kind,'image');
assert.match(f.docs[0].file_path,/^docs\/\d{4}-\d\d-\d\d\/[0-9a-f]{32}\.jpg$/);
assert.equal(f.files.length,1);assert.match(f.files[0].url,/\/ar-inbox\/docs\/\d{4}-\d\d-\d\d\/[0-9a-f]{32}\.jpg$/);assert.equal(f.files[0].headers['Content-Type'],'image/jpeg');
assert.equal(f.gemini(),0,'never read by Gemini');assert.equal(f.saved.length,0,'not an inbox row');
r=await F.handle(post(from(TITLE),jpg(1),'image/jpeg'),env,f);assert.equal((await r.json()).duplicate,true);assert.equal(f.docs.length,1);assert.equal(f.files.length,1);
assert.ok(f.calls.filter(c=>c.url.includes('/rest/v1/')).every(c=>c.o.headers.apikey==='service'),'service role');

// 4) a PDF from the group is a document too; an Excel file is not
f=fake();r=await F.handle(post(from(TITLE),new TextEncoder().encode('%PDF-1.4 invoice'),'application/pdf'),env,f);
assert.equal(f.docs[0].kind,'pdf');assert.match(f.docs[0].file_path,/\.pdf$/);
r=await F.handle(post(from(TITLE,'&name=list.xlsx'),new Uint8Array([0x50,0x4b,3,4,1,2]),'application/octet-stream'),env,f);
assert.equal((await r.json()).ignored,true);assert.equal(f.docs.length,1);

// 5) «seen» from the group: silent
f=fake();r=await F.handle(post(from(TITLE,'&seen=1&say=1'),'📷 صورة','text/plain'),env,f);assert.equal(r.status,200);assert.equal(await r.text(),'');

// 6) a company's run gets a photo while only the group announced photos (shared folder): the group's document
f=fake({media:[{supplier:GROUP,chat:TITLE,note:'x',fresh:true,done:false,at:new Date().toISOString()},{supplier:COMPANY,chat:COMPANY,note:'old',fresh:false,done:false,at:new Date().toISOString()}]});
r=await F.handle(post(from(COMPANY,'&say=1'),jpg(2),'image/jpeg'),env,f);
assert.equal(r.status,200);assert.equal(await r.text(),'');assert.equal(f.docs.length,1);assert.equal(f.docs[0].chat,GROUP);assert.equal(f.gemini(),0);assert.equal(f.saved.length,0);

// 7) the company announced its own photo too: read as the company's list as before, and the group is never in «maybe»
f=fake({media:[{supplier:GROUP,chat:TITLE,note:'x',fresh:true,done:false,at:new Date().toISOString()},{supplier:COMPANY,chat:COMPANY,note:'new',fresh:true,done:false,at:new Date().toISOString()}]});
r=await F.handle(post(from(COMPANY),jpg(3),'image/jpeg'),env,f);
assert.equal(r.status,200);assert.equal(f.gemini(),1);assert.equal(f.saved.length,1);assert.equal(f.saved[0].supplier,COMPANY);assert.equal(f.saved[0].maybe,null);assert.equal(f.docs.length,0);

// 7b) the group's run also sends the newest photos of the phone's shared folder: a photo a company sent minutes ago
// (already kept as that company's message) is not saved again as a document (seen live 2026-11-08: 5 of 6)
{const h=crypto.createHash('sha256').update(jpg(4)).digest('hex').slice(0,32);
 f=fake({inboxFiles:['2026-11-08/'+h+'.jpg']});r=await F.handle(post(from(TITLE,'&say=1'),jpg(4),'image/jpeg'),env,f);
 assert.equal(r.status,200);assert.equal(await r.text(),'');assert.equal(f.docs.length,0,'a company photo is not a document');assert.equal(f.files.length,0,'not stored again');
 r=await F.handle(post(from(TITLE),jpg(5),'image/jpeg'),env,f);assert.equal(f.docs.length,1,'the group\'s own photo is kept');}

// 8) no documents chat saved yet (or the table is missing): companies work exactly as before
f=fake({chats:[]});r=await F.handle(post(from(TITLE),'📷 صورة','text/plain'),env,f);assert.equal(r.status,200);assert.equal((await r.json()).ignored,true);
{const g=fake();const h=(u,o)=>u.includes('/rest/v1/ar_doc_chats')?Promise.reject(Error('no table')):g(u,o);
 r=await F.handle(post(from(COMPANY,'&say=1'),'📷 صورة','text/plain'),env,h);assert.equal(r.status,202,'a company photo notification still works');}
// 9) whose photo, by time (live 2026-11-10: a customer's prescription and another chat's photo, saved 90 and 115 s
// after the group's one photo, were kept as the group's). Real photos came 10 s before to 13 s after their message.
{const sec=(ms)=>Math.floor(ms/1000),W=Date.now()-60e3;
 // how many photos a notification announces
 assert.equal(F.photoCount('📷 \u200fتم إرسال صورة'),1);assert.equal(F.photoCount(GROUP+': صيدلية ~w1 📷 مخمرية 🌹📢'),1,'a photo with its caption');
 assert.equal(F.photoCount('📷 تم إرسال صورتين'),2);assert.equal(F.photoCount('📷 \u200fتم إرسال ١٥ صور'),15);assert.equal(F.photoCount('📷 تم ارسال 4 صور'),4);
 assert.equal(F.photoCount('📄 فاتورة.pdf'),1);assert.equal(F.photoCount('تمام يا دكتور'),0,'no photo sign: not known');
 assert.equal(F.noteWhen('x ~w1794342634000 📷'),1794342634000);assert.equal(F.noteWhen('x ~w1794342634 y'),1794342634000,'seconds too');assert.equal(F.noteWhen('none'),0);
 // the rule itself
 assert.equal(F.fileOwner(String(sec(W+2e3)),W,true,[]),'own');assert.equal(F.fileOwner(String(sec(W+90e3)),W,true,[]),'far','one photo: 90 s after is not it');
 assert.equal(F.fileOwner(String(sec(W+90e3)),W,false,[]),'own','an album downloads for a minute or two');
 assert.equal(F.fileOwner(String(sec(W-25e3)),W,true,[]),'own','several photos: the message time is the newest one');
 assert.equal(F.fileOwner(String(sec(W+70e3)),W,false,[W+69e3]),'other','another chat\'s photo message is clearly nearer');
 assert.equal(F.fileOwner(String(sec(W+20e3)),W,true,[W+19e3]),'unsure','another chat\'s photo is nearer but this one is close too');
 assert.equal(F.fileOwner(String(sec(W+2e3)),W,true,[W+30e3]),'own','this chat\'s message is clearly nearer');
 assert.equal(F.fileOwner(String(sec(W+5e3)),W,true,[W+9e3]),'unsure','about as near');
 assert.equal(F.fileOwner(null,W,true,[W]),'unknown');assert.equal(F.fileOwner(String(sec(W)),0,true,[]),'unknown');
 assert.equal(F.nearestPhoto(String(sec(W+6e3)),[{when:W,s:'a'},{when:W+5e3,s:'b'},{when:W+200e3,s:'c'}]).s,'b');assert.equal(F.nearestPhoto(String(sec(W+100e3)),[{when:W}]),null);

 // the group's message of one photo: the photo saved a second later is kept, the photos 90 and 115 s later are not
 f=fake();r=await F.handle(post(from(TITLE+' ~w'+W,'&say=1'),'📷 \u200fتم إرسال صورة','text/plain'),env,f);assert.equal(r.status,202);
 r=await F.handle(post(from(TITLE+' ~w'+W,'&mod='+sec(W+1e3)),jpg(21),'image/jpeg'),env,f);assert.equal(f.docs.length,1,'the group\'s photo');assert.equal(f.docs[0].handled_note,undefined);
 r=await F.handle(post(from(TITLE+' ~w'+W,'&mod='+sec(W+90e3)),jpg(22),'image/jpeg'),env,f);assert.equal((await r.json()).other,true);
 r=await F.handle(post(from(TITLE+' ~w'+W,'&mod='+sec(W+115e3)),jpg(23),'image/jpeg'),env,f);assert.equal(f.docs.length,1,'other chats\' photos are not kept');assert.equal(f.files.length,1);
 // an album keeps its photos for a minute or two, as before
 const A=W+5e3;r=await F.handle(post(from(TITLE+' ~w'+A),'📷 \u200fتم إرسال ٥ صور','text/plain'),env,f);assert.equal(r.status,202);
 r=await F.handle(post(from(TITLE+' ~w'+A,'&mod='+sec(A+90e3)),jpg(24),'image/jpeg'),env,f);assert.equal(f.docs.length,2,'a late page of an album');

 // 10) another chat's photo: the phone sends only its message time (no name, no text); kept once, nothing said
 f=fake();const O=W+300e3;r=await F.handle(post('other=1&say=1&'+from('~w'+O),'','text/plain'),env,f);assert.equal(r.status,200);assert.equal(await r.text(),'');
 assert.equal(f.media.length,1);assert.equal(f.media[0].supplier,F.OTHER_CHAT);assert.equal(f.media[0].note,'~w'+O);assert.equal(f.media[0].fresh,false);
 r=await F.handle(post('other=1&'+from('~w'+O),'','text/plain'),env,f);assert.equal(f.media.length,1,'WhatsApp shows it again: kept once');
 r=await F.handle(post('other=1&'+from('no time'),'','text/plain'),env,f);assert.equal(f.media.length,1,'no time: nothing kept');
 assert.equal(f.calls.some(c=>c.url.includes('ar_suppliers')||c.url.includes('ar_doc_chats')),false,'no chat lookup');
 r=await F.handle(new Request('https://p.supabase.co/functions/v1/arabic-shortages?other=1&'+from('~w'+O),{method:'POST',headers:{'x-inbox-key':'b'.repeat(64)},body:''}),env,f);assert.equal(r.status,401,'still needs the phone key');
 // the group's album and another chat's photo a minute later: the photo at that second is the other chat's (not kept);
 // a photo near both is kept, marked for a look
 const B=O-60e3;r=await F.handle(post(from(TITLE+' ~w'+B),'📷 \u200fتم إرسال ٥ صور','text/plain'),env,f);
 r=await F.handle(post(from(TITLE+' ~w'+B,'&mod='+sec(B+61e3)),jpg(25),'image/jpeg'),env,f);assert.equal(f.docs.length,0,'the other chat\'s photo');
 r=await F.handle(post('other=1&'+from('~w'+(B+22e3)),'','text/plain'),env,f);
 r=await F.handle(post(from(TITLE+' ~w'+B,'&mod='+sec(B+20e3)),jpg(26),'image/jpeg'),env,f);assert.equal(f.docs.length,1);assert.match(f.docs[0].handled_note,/مش متأكد/);

 // 11) a company's run: a customer's photo (another chat's photo message at its second) is not read as the list
 f=fake();const C=W+600e3;
 r=await F.handle(post(from(COMPANY+' ~w'+C,'&say=1'),'📷 صورة','text/plain'),env,f);assert.equal(r.status,202);
 r=await F.handle(post('other=1&'+from('~w'+(C+100e3)),'','text/plain'),env,f);
 r=await F.handle(post(from(COMPANY+' ~w'+C,'&say=1&mod='+sec(C+101e3)),jpg(31),'image/jpeg'),env,f);
 assert.equal(r.status,200);assert.equal(await r.text(),'','nothing said');assert.equal(f.gemini(),0,'not read');assert.equal(f.saved.length,0);assert.equal(f.docs.length,0);
 // its own photo is read as before
 r=await F.handle(post(from(COMPANY+' ~w'+C,'&mod='+sec(C+2e3)),jpg(32),'image/jpeg'),env,f);assert.equal(f.gemini(),1);assert.equal(f.saved.length,1);assert.equal(f.saved[0].supplier,COMPANY);assert.equal(f.saved[0].maybe,null,'other chats never in «maybe»');
 // a company's run gets the documents group's photo (the group's message at its second): kept as the group's document
 const D=C+400e3;r=await F.handle(post(from(TITLE+' ~w'+D),'📷 \u200fتم إرسال صورة','text/plain'),env,f);
 r=await F.handle(post(from(COMPANY+' ~w'+C,'&mod='+sec(D+1e3)),jpg(33),'image/jpeg'),env,f);assert.equal(f.docs.length,1);assert.equal(f.docs[0].chat,GROUP);assert.equal(f.gemini(),1,'not read');
 // a late photo near nobody's message: decided as before (read as the company's)
 r=await F.handle(post(from(COMPANY+' ~w'+C,'&mod='+sec(C+150e3)),jpg(34),'image/jpeg'),env,f);assert.equal(f.saved.length,2);}

console.log('inbox-docs ok');
})().catch(e=>{console.error(e);process.exit(1)});
