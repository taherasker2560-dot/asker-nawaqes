// Automatic incoming (phone → function): key check, only saved companies, text/image/PDF read and matched, file kept,
// row saved in ar_inbox, spoken summary. Fake Supabase and Gemini; nothing real is called.
const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
const F=await import(path.join(__dirname,'..','supabase','functions','arabic-shortages','index.ts'));
const env={GEMINI_API_KEY:'k',ALLOWED_EMAILS:'owner@example.com',SUPABASE_URL:'https://p.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',INBOX_CLAIM_WAIT_MS:'1'};
const KEY='a'.repeat(64),HASH=crypto.createHash('sha256').update(KEY).digest('hex');
const shortages=[{id:'s1',product_name:'BRUFEN 400MG 30TAB'},{id:'s2',product_name:'FLAGYL 125MG SYP'}];
const names=[{name_key:'FLAGYL 125MG SYP',arabic_name:'فلاجيل ١٢٥ مجم شراب',status:'approved'},{name_key:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠ مجم ٣٠ قرص',status:'approved'}];
function fake({gem,fileAt='2026-01-01T00:00:00Z',orders=[]}={}){const calls=[],saved=[],files=[],media=[];const page=(u,a)=>new Response(JSON.stringify(u.includes('offset=0')?a:[]));
 const f=async(url,o={})=>{calls.push({url,o});
  if(url.includes('/rest/v1/ar_inbox_keys'))return page(url,url.includes('key_hash=eq.'+HASH)?[{key_hash:HASH}]:[]);
  if(url.includes('/rest/v1/ar_suppliers'))return page(url,[{name:'المتحدة للأدوية',phone:'201001234567'}]);
  if(url.includes('/rest/v1/ar_shortages'))return page(url,shortages);
  if(url.includes('/rest/v1/ar_orders'))return page(url,orders);
  if(url.includes('/rest/v1/ar_names'))return page(url,names);
  if(url.includes('/rest/v1/ar_answers')||url.includes('/rest/v1/ar_fixes')||url.includes('/rest/v1/ar_ignored'))return page(url,[]);
  if(url.includes('/rest/v1/ar_inbox_media')){const q=k=>decodeURIComponent((url.match(new RegExp(k+'=eq\\.([^&]+)'))||[])[1]||'');
   if(o.method==='POST'){media.push({fresh:true,done:false,...JSON.parse(o.body)});return new Response('',{status:201})}if(o.method==='DELETE')return new Response('',{status:204});
   if(o.method==='PATCH'){const hit=media.filter(m=>m.supplier===q('supplier')&&!m.done&&(!url.includes('fresh=is.true')||m.fresh!==false));hit.forEach(m=>{m.done=true});return new Response(JSON.stringify(hit))}
   if(url.includes('select=at&'))return new Response(JSON.stringify(media.filter(m=>m.supplier===q('supplier')&&m.chat===q('chat')&&m.fresh!==false).slice(-1).map(m=>({at:m.at||new Date(Date.now()-1000).toISOString()}))));
   if(url.includes('select=note'))return new Response(JSON.stringify(media.filter(m=>m.supplier===q('supplier')&&m.chat===q('chat')).slice(-1).map(m=>({note:m.note}))));
   return page(url,media.map(m=>({supplier:m.supplier,fresh:m.fresh})))}
  if(url.includes('/rest/v1/ar_inbox?select=rows,review'))return page(url,saved.filter(r=>r.status!=='error'&&!r.maybe).map(r=>({rows:r.rows,review:r.review})));
  if(url.includes('/rest/v1/ar_inbox?select=maybe&maybe=not.is.null'))return page(url,saved.filter(r=>r.maybe).map(r=>({maybe:r.maybe})));
  if(url.includes('/rest/v1/ar_inbox?select=id&maybe=not.is.null')){const lt=decodeURIComponent((url.match(/received_at=lt\.([^&]+)/)||[])[1]||'');return page(url,saved.filter(r=>r.maybe&&r.received_at<lt).map(()=>({id:'x'})))}
  if(url.includes('/rest/v1/ar_inbox?select=id&kind=neq.text&or=')){const sup=decodeURIComponent(url).match(/supplier\.eq\."([^"]+)"/)[1];return page(url,saved.filter(r=>r.kind!=='text'&&(r.supplier===sup||(r.maybe||[]).includes(sup))).map(()=>({id:'x'})))}
  if(url.includes('/rest/v1/ar_inbox?select=id&kind=neq.text')){const sup=decodeURIComponent((url.match(/supplier=eq\.([^&]+)/)||[])[1]||'');return page(url,saved.filter(r=>r.kind!=='text'&&r.supplier===sup).map(()=>({id:'x'})))}
  if(url.includes('/rest/v1/ar_inbox?select=id&kind=eq.text')){const lt=decodeURIComponent((url.match(/received_at=lt\.([^&]+)/)||[])[1]||'');return page(url,saved.filter(r=>r.kind==='text'&&r.received_at<lt).map(()=>({id:'x'})))}
  if(url.includes('/rest/v1/ar_inbox?select=body_text'))return page(url,saved.filter(r=>r.kind==='text').map(r=>({body_text:r.body_text})));
  if(url.includes('/rest/v1/ar_inbox?select=id,received_at&file_path=like.'))return page(url,saved.filter(r=>r.file_path&&url.includes(r.file_path.split('/')[1].split('.')[0])).map(()=>({id:'x'})));
  if(url.includes('/rest/v1/ar_inbox?id=eq.')&&o.method==='PATCH'){const id=decodeURIComponent(url.match(/id=eq\.([^&]+)/)[1]);const r=saved.find(x=>x.id===id&&x.status==='error');if(r)Object.assign(r,JSON.parse(o.body));return new Response('',{status:204})}
  if(url.includes('/rest/v1/ar_inbox')&&o.method==='POST'){const row=JSON.parse(o.body);row.received_at=new Date(Date.now()+saved.length).toISOString();row.id='in'+(saved.length+1);saved.push(row);return new Response(JSON.stringify([{id:'in'+saved.length,received_at:row.received_at}]),{status:201})}
  if(url.includes('/rest/v1/rpc/ar_inbox_file_at'))return new Response(JSON.stringify(fileAt));
  if(url.includes('/storage/v1/object/ar-inbox/')){files.push({url,headers:o.headers});return new Response('{}')}
  if(url.startsWith('https://generativelanguage'))return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(gem())}]}}]}));
  throw Error('unexpected '+url)};Object.assign(f,{calls,saved,files,media});return f}
const post=(q,body,type,key=KEY)=>new Request('https://p.supabase.co/functions/v1/arabic-shortages?'+q,{method:'POST',headers:{'x-inbox-key':key,'content-type':type},body});
// wrong key: refused, nothing read
let f=fake();let r=await F.handle(post('from=x','hi','text/plain','b'.repeat(64)),env,f);assert.equal(r.status,401);
// unknown sender (not a saved company): ignored before reading or storing
f=fake({gem:()=>{throw Error('no')}});r=await F.handle(post('from='+encodeURIComponent('زبون'),'فلاجيل','text/plain'),env,f);
assert.equal(r.status,200);assert.equal((await r.json()).ignored,true);assert.equal(f.saved.length,0);assert.ok(!f.calls.some(c=>c.url.includes('generativelanguage')));
// text from a saved company (name written a little differently): matched, saved, spoken summary
f=fake();r=await F.handle(post('from='+encodeURIComponent('المتحده للادويه')+'&say=1','فلاجيل شراب ١٢٥ | 3\nحاجة تانية','text/plain; charset=utf-8'),env,f);
assert.equal(r.status,200);assert.equal(await r.text(),'المتحدة للأدوية: وصل فلاجيل ١٢٥ مجم شراب','one item: said by its Arabic name');
assert.equal(f.saved[0].kind,'text');assert.equal(f.saved[0].supplier,'المتحدة للأدوية');assert.equal(f.saved[0].sure,1);assert.equal(f.saved[0].rows.length,2);
assert.ok(f.calls.filter(c=>c.url.includes('/rest/v1/')).every(c=>c.o.headers.Authorization==='Bearer service'&&c.o.headers.apikey==='service'),'service role (as apikey too), no login');
// WhatsApp count in the chat title is dropped: "(2 رسائل)" / "(3 messages)"
assert.equal(F.inboxSender('الفتح shreif (2 رسائل)'),'الفتح shreif');assert.equal(F.inboxSender('Al Fath (12 messages)'),'Al Fath');assert.equal(F.inboxSender('شركة (الفرع)'),'شركة (الفرع)');
f=fake();r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية (٣ رسائل)')+'&say=1','فلاجيل شراب ١٢٥','text/plain'),env,f);assert.match(await r.text(),/^المتحدة للأدوية: وصل فلاجيل/);
// mixed Arabic/English name: word order ignored, other names still refused
assert.equal(F.sameCompany('Shreif الفتح','الفتح shreif'),true);assert.equal(F.sameCompany('Shreif الفتح','الفتح'),false);assert.equal(F.sameCompany('Shreif الفتح',''),false);assert.equal(F.sameCompany('','الفتح'),false);
// a group message: the title holds the group's name and the sender
assert.equal(F.sameCompany('Shreif الفتح','وارد مخزن النور كفر الشيخ: Shreif الفتح'),true);assert.equal(F.sameCompany('Shreif الفتح','وارد مخزن النور: احمد'),false);
// the same text notification twice: kept once
{const g=fake();const t='فلاجيل شراب ١٢٥\nبروفين';await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية'),t,'text/plain'),env,g);
 const r2=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية'),t,'text/plain'),env,g);assert.equal((await r2.json()).duplicate,true);assert.equal(g.saved.length,1);
 // the check looks back to the start of today in Cairo (not only 10 minutes): an old unread notification shown again is not read twice
 const q=g.calls.map(c=>c.url).filter(u=>u.includes('ar_inbox?select=body_text')).pop();const since=decodeURIComponent(q.match(/received_at=gte\.([^&]+)/)[1]);
 assert.equal(since,F.cairoDayStart(new Date(since)));assert.ok(Date.parse(since)<=Date.now()&&Date.now()-Date.parse(since)<=25*3600e3);}
// several photos of one list: each photo with 1 to 3 items says their names
{const g=fake({gem:(()=>{let i=0;return()=>({supplier:'',rows:[i++?{name:'فلاجيل ١٢٥ مجم شراب',english:'FLAGYL 125MG SYP'}:{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})})()});
 const img=(b)=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,b]),'image/jpeg'),env,g);
 assert.equal(await (await img(1)).text(),'المتحدة للأدوية: وصل بروفين ٤٠٠ مجم ٣٠ قرص');
 assert.equal(await (await img(2)).text(),'المتحدة للأدوية: وصل فلاجيل ١٢٥ مجم شراب');}
// more than 3 items: the count; after the first photo of the day, the company's total for today
{const extra=[{id:'s3',product_name:'JANUVIA 50MG 28TAB'},{id:'s4',product_name:'CONCOR 5MG 30TAB'}];
 shortages.push(...extra);names.push({name_key:'JANUVIA 50MG 28TAB',arabic_name:'جانوفيا ٥٠ مجم ٢٨ قرص',status:'approved'},{name_key:'CONCOR 5MG 30TAB',arabic_name:'كونكور ٥ مجم ٣٠ قرص',status:'approved'});
 try{const four=[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'},{name:'فلاجيل ١٢٥ مجم شراب',english:'FLAGYL 125MG SYP'},{name:'جانوفيا ٥٠ مجم ٢٨ قرص',english:'JANUVIA 50MG 28TAB'},{name:'كونكور ٥ مجم ٣٠ قرص',english:'CONCOR 5MG 30TAB'}];
  const g=fake({gem:()=>({supplier:'',rows:four})});
  const img=(b)=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,b]),'image/jpeg'),env,g);
  assert.equal(await (await img(61)).text(),'المتحدة للأدوية: وصل 4 صنف من النواقص');
  assert.equal(await (await img(62)).text(),'المتحدة للأدوية: النهارده لحد دلوقتي 4 صنف من النواقص');
  // the same name twice is said once; a line with no Arabic name: the supplier's text without notes after «//»
  assert.equal(F.namesSay('س',['أ','ب','أ'],0),'س: وصل أ وب');assert.equal(F.namesSay('س',['أ'],2),'س: وصل أ، و2 محتاجين تأكيدك');
  assert.equal(F.spokenName(undefined,'دوليبران ١٠٠٠مجم اقراص //٢شريط'),'دوليبران ١٠٠٠مجم اقراص');assert.equal(F.spokenName(' كونكور ',''),'كونكور');}
 finally{shortages.splice(2);names.splice(2)}}
assert.match(F.cairoDayStart(new Date('2026-10-29T10:00:00Z')),/^2026-10-2[89]T2[12]:00:00\.000Z$/);
// Tasker sends the file with its own Content-Type and no name: the first bytes decide
assert.equal(F.sniffKind(new Uint8Array([0xff,0xd8,0xff,0xe0])),'image');assert.equal(F.sniffKind(new TextEncoder().encode('%PDF-1.4')),'pdf');
assert.equal(F.sniffKind(new Uint8Array([0x50,0x4b,3,4])),'sheet');assert.equal(F.sniffKind(new TextEncoder().encode('فلاجيل')),'');
{const g=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})});
 let r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية'),new Uint8Array([0xff,0xd8,0xff,7]),'application/octet-stream'),env,g);assert.equal((await r.json()).ok,true);assert.equal(g.saved[0].kind,'image');
 const fd=new FormData();fd.append('file',new Blob([new Uint8Array([0xff,0xd8,0xff,8])],{type:'application/octet-stream'}),'IMG-1.jpg');
 r=await F.handle(new Request('https://p.supabase.co/functions/v1/arabic-shortages?from='+encodeURIComponent('المتحدة للأدوية'),{method:'POST',headers:{'x-inbox-key':KEY},body:fd}),env,g);
 assert.equal((await r.json()).ok,true);assert.equal(g.saved[1].kind,'image');
 r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية'),new Uint8Array([1,2,3]),'application/zip'),env,g);assert.equal(r.status,415);
 // Tasker's real upload: multipart/related, an empty text part, then the photo
 const B='joaomgcdTasker',enc=new TextEncoder(),img=new Uint8Array([0xff,0xd8,0xff,9,0x0d,0x0a,0x2d,0x2d,5]);
 const body=new Uint8Array([...enc.encode('--'+B+'\r\nContent-Type: text/plain\r\n\r\n\r\n--'+B+'\r\nContent-Type: application/octet-stream\r\n\r\n'),...img,...enc.encode('\r\n--'+B+'--\r\n')]);
 assert.deepEqual([...F.filePart(body,B).bytes],[...img]);
 r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية'),body,'multipart/related; boundary='+B),env,g);assert.equal((await r.json()).ok,true);assert.equal(g.saved.at(-1).kind,'image');}
// new-style secret key (sb_secret_…) is not a JWT: sent only as apikey
f=fake();r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية'),'فلاجيل شراب ١٢٥','text/plain'),{...env,SUPABASE_SERVICE_ROLE_KEY:'sb_secret_x'},f);assert.equal(r.status,200);
assert.ok(f.calls.filter(c=>c.url.includes('/rest/v1/')).every(c=>c.o.headers.apikey==='sb_secret_x'&&!c.o.headers.Authorization));
// image: read by Gemini, file kept in the private bucket
f=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})});
r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&name=IMG-1.jpg',new Uint8Array([255,216,255,0]),'image/jpeg'),env,f);
const b=await r.json();assert.equal(b.ok,true);assert.equal(b.sure,1);assert.equal(b.say,'المتحدة للأدوية: وصل بروفين ٤٠٠ مجم ٣٠ قرص');
assert.equal(f.files.length,1);assert.match(f.files[0].url,/ar-inbox\/\d{4}-\d\d-\d\d\/[0-9a-f-]+\.jpg$/);assert.equal(f.saved[0].kind,'image');assert.ok(f.saved[0].file_path);
// the photo's notification text is ignored (the photo comes by itself); the same photo sent again is kept once
f=fake();r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1','📷 صورة','text/plain'),env,f);assert.equal(await r.text(),'');assert.equal(f.saved.length,0);
assert.equal(r.status,202,'a saved company: the phone sends the photo');
f=fake();r=await F.handle(post('from='+encodeURIComponent('زبون')+'&say=1','📷 صورة','text/plain'),env,f);assert.equal(r.status,200,'not a company: no photo is sent');
{const g=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})});const seen=[];
 const h=async(u,o)=>{if(u.includes('/rest/v1/ar_inbox?select=id,received_at&file_path=like.')){return new Response(JSON.stringify(seen.some(p=>u.includes(p.split('/')[1].split('.')[0]))?[{id:'x'}]:[]))}const res=await g(u,o);if(u.includes('/rest/v1/ar_inbox')&&o.method==='POST')seen.push(g.saved.at(-1).file_path);return res};
 const path='/storage/emulated/0/Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Business Images/IMG-20261029-WA0001.jpg';
 const send=()=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&name='+encodeURIComponent(path),new Uint8Array([255,216,255,9]),'application/octet-stream'),env,h);
 assert.equal((await (await send()).json()).ok,true);assert.equal((await (await send()).json()).duplicate,true);assert.equal(g.saved.length,1);
 assert.match(g.saved[0].file_path,/^\d{4}-\d\d-\d\d\/[0-9a-f]{32}\.jpg$/);assert.equal(g.files[0].headers['Content-Type'],'image/jpeg');}
// the same photo again: silent when it was read minutes ago (the phone re-sends the newest ones), told when it is old
for(const [ago,expect] of [[60e3,''],[3*3600e3,'المتحدة للأدوية: الصورة دي اتقرت قبل كده']]){const g=fake({gem:()=>{throw Error('not read again')}});
 const h=async(u,o)=>u.includes('/rest/v1/ar_inbox?select=id,received_at&file_path=like.')?new Response(JSON.stringify(u.includes('offset=0')?[{id:'x',received_at:new Date(Date.now()-ago).toISOString()}]:[])):g(u,o);
 const r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,7]),'application/octet-stream'),env,h);
 assert.equal(r.status,200);assert.equal(await r.text(),expect);assert.equal(g.saved.length,0);}
// seen=1: a photo notification with no new photo on the phone (WhatsApp does not save a photo it already has):
// told once per new notification, with today's totals when something came today; nothing read or stored; other chats still ignored
{const g=fake({gem:()=>{throw Error('not read')}});
 const note=(t)=>F.handle(post('from='+encodeURIComponent(t)+'&say=1','📷 صورة','text/plain'),env,g);
 let r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1&seen=1','','text/plain'),env,g);
 assert.equal(await r.text(),'','no notification: nothing to tell');
 assert.equal((await note('المتحدة للأدوية')).status,202);
 r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1&seen=1','','text/plain'),env,g);
 assert.equal(r.status,200);assert.equal(await r.text(),'المتحدة للأدوية: بعت صورة مالقيتهاش على الموبايل، لو جديدة افتح الشات بتاعه');assert.equal(g.saved.length,0);
 r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1&seen=1','','text/plain'),env,g);assert.equal(await r.text(),'','said once');
 g.saved.push({kind:'text',status:'new',rows:[{match:{id:'s1',confidence:'high'}}],review:2});
 // a new message in that chat changes its notification (WhatsApp adds the count): told again
 assert.equal((await note('المتحدة للأدوية (2 رسائل)')).status,202);assert.equal(g.media.at(-1).fresh,true);
 r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1&seen=1','📷 صورة','text/plain'),env,g);
 assert.equal(await r.text(),'المتحدة للأدوية: بعت صورة مالقيتهاش على الموبايل، لو جديدة افتح الشات بتاعه');assert.equal(g.saved.length,1);
 r=await F.handle(post('from='+encodeURIComponent('زبون')+'&say=1&seen=1','','text/plain'),env,g);assert.equal(await r.text(),'');
 assert.ok(!g.calls.some(c=>c.url.startsWith('https://generativelanguage')));}
assert.equal(F.seenSay('س','الملف ده اتقرا',null),'س: الملف ده اتقرا قبل كده');
// several photos not on the phone: not downloaded yet (they are almost never all old ones)
assert.equal(F.missingSay('الفتح',['الفتح 📷 \u200fتم إرسال ٥ صور']),'الفتح: بعت صور ولسه ما اتحملتش على الموبايل، افتح الشات بتاعه');
assert.equal(F.missingSay('الفتح',['x','الفتح 📷 4 photos']),'الفتح: بعت صور ولسه ما اتحملتش على الموبايل، افتح الشات بتاعه');
assert.equal(F.missingSay('الفتح',['الفتح 📷 \u200fتم إرسال صورة']),'الفتح: بعت صورة مالقيتهاش على الموبايل، لو جديدة افتح الشات بتاعه');
assert.equal(F.missingSay('الفتح',['📷 صورة']),'الفتح: بعت صورة مالقيتهاش على الموبايل، لو جديدة افتح الشات بتاعه');
// WhatsApp shows the same notification again (after the phone speaks, or when another message comes): a repeat, not
// fresh. The phone still checks the folder, but «seen» stays silent, so the same sentence is not said over and over
{const g=fake({gem:()=>{throw Error('not read')}});
 const note=()=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1','📷 صورة','text/plain'),env,g);
 const seen=()=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1&seen=1','','text/plain'),env,g).then(r=>r.text());
 assert.equal((await note()).status,202);assert.match(await seen(),/مالقيتهاش/);
 for(let i=0;i<3;i++){assert.equal((await note()).status,202,'still checks the folder');assert.equal(await seen(),'')}
 assert.deepEqual(g.media.map(m=>m.fresh),[true,false,false,false]);assert.equal(g.media[1].chat,'المتحدة للأدوية');
 // another chat of the same company has its own last notification
 await F.handle(post('from='+encodeURIComponent('جروب المتحدة للأدوية: احمد')+'&say=1','📷 صورة','text/plain'),env,g);assert.equal(g.media.at(-1).fresh,true);}
// several runs at once: «seen» is silent when this company's photo was read a moment ago (another run says the totals)
{const g=fake();g.saved.push({kind:'image',supplier:'المتحدة للأدوية',status:'new',rows:[],review:0});
 const r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1&seen=1','','text/plain'),env,g);assert.equal(await r.text(),'');}
// two runs save the same photo/text at the same moment: the database refuses the second (409): a silent repeat
{const g=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})});
 const h=async(u,o={})=>u.includes('/rest/v1/ar_inbox')&&o.method==='POST'?new Response('{"code":"23505"}',{status:409}):u.includes('/storage/v1/object/ar-inbox/')?new Response('{"error":"Duplicate","message":"The resource already exists"}',{status:400}):g(u,o);
 let r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,5]),'application/octet-stream'),env,h);
 assert.equal(r.status,200);assert.equal(await r.text(),'');
 r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1','بروفين ٤٠٠','text/plain'),env,h);assert.equal(r.status,200);assert.equal(await r.text(),'');}
// several runs send the same new photo at once: the first stores it (the claim) and reads it; a run that finds it
// already stored waits for that run's row and stays silent, without reading it again (one Gemini call)
{const g=fake({gem:()=>{throw Error('read twice')}});let checks=0;
 const h=async(u,o={})=>{if(u.includes('/storage/v1/object/ar-inbox/'))return new Response('{"error":"Duplicate","message":"The resource already exists"}',{status:400});
  if(u.includes('/rest/v1/ar_inbox?select=id,received_at&file_path=like.'))return new Response(JSON.stringify(u.includes('offset=0')&&checks++>=2?[{id:'x'}]:[]));return g(u,o)};
 const r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,3]),'application/octet-stream'),env,h);
 assert.equal(r.status,200);assert.equal(await r.text(),'');assert.ok(!g.calls.some(c=>c.url.startsWith('https://generativelanguage')),'not read again');assert.equal(g.saved.length,0);}
// an old stored copy with no row (the owner cleared the list): after waiting, it is read and saved
{const g=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})});
 const h=async(u,o={})=>u.includes('/storage/v1/object/ar-inbox/')?new Response('{"error":"Duplicate","message":"The resource already exists"}',{status:400}):g(u,o);
 const r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,4]),'application/octet-stream'),env,h);
 assert.equal(r.status,200);assert.match(await r.text(),/وصل بروفين/);assert.equal(g.saved.length,1);assert.match(g.saved[0].file_path,/\.jpg$/);}
// stored minutes ago with no row: the owner deleted it from the page; the phone re-sends it: not read again, silent
{const g=fake({gem:()=>{throw Error('read again')},fileAt:new Date(Date.now()-60e3).toISOString()});
 const h=async(u,o={})=>u.includes('/storage/v1/object/ar-inbox/')?new Response('{"error":"Duplicate","message":"The resource already exists"}',{status:400}):g(u,o);
 const r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,50]),'application/octet-stream'),env,h);
 assert.equal(r.status,200);assert.equal(await r.text(),'');assert.equal(g.saved.length,0);assert.ok(!g.calls.some(c=>c.url.startsWith('https://generativelanguage')));}
// photos from two companies at the same time: the phone cannot tell whose photo is whose (one folder), so each
// photo keeps both names (maybe) until the owner picks one; said once; not counted in a company's totals meanwhile
{const g=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})});
 let r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1','📷 صورة','text/plain'),env,g);assert.equal(r.status,202);assert.deepEqual(g.media.map(m=>m.supplier),['المتحدة للأدوية']);
 r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,20]),'application/octet-stream'),env,g);
 assert.match(await r.text(),/وصل بروفين/);assert.equal(g.saved[0].maybe,null,'one company: sure');
 g.media.push({supplier:'شركة النور',fresh:true,done:false});
 r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,21]),'application/octet-stream'),env,g);
 assert.equal(await r.text(),'وصلت صور من أكتر من مورد في نفس الوقت: المتحدة للأدوية وشركة النور. اختار كل صورة من مين من البوت');
 assert.deepEqual(g.saved[1].maybe,['المتحدة للأدوية','شركة النور']);
 r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,22]),'application/octet-stream'),env,g);
 assert.equal(await r.text(),'','said once');assert.ok(g.saved[2].maybe);
 // the owner has not picked yet: today's total counts the sure photo only, and «seen» stays silent
 r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1&seen=1','','text/plain'),env,g);assert.equal(await r.text(),'');}
// a repeat of an old notification from one chat and a new one from another company at the same moment: the new
// photo is the other company's, even when the repeat's run sends it first
{const g=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})});
 g.media.push({supplier:'المتحدة للأدوية',chat:'المتحدة للأدوية',note:'x',fresh:false,done:false},{supplier:'شركة النور',chat:'شركة النور',note:'y',fresh:true,done:false});
 let r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,30]),'application/octet-stream'),env,g);
 assert.equal(await r.text(),'شركة النور: وصل بروفين ٤٠٠ مجم ٣٠ قرص');assert.equal(g.saved[0].supplier,'شركة النور');assert.equal(g.saved[0].maybe,null);
 assert.equal(g.saved[0].sender,'المتحدة للأدوية','the chat that sent it is kept');assert.ok(g.media[1].done,'its notification is handled: no «seen» for it');
 // no new notification at all: any company with one in that time may be the one
 g.media.length=0;g.media.push({supplier:'شركة النور',chat:'شركة النور',note:'y',fresh:false,done:false});
 r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,31]),'application/octet-stream'),env,g);
 assert.match(await r.text(),/أكتر من مورد/);assert.deepEqual(g.saved[1].maybe,['المتحدة للأدوية','شركة النور']);
 // nobody else: the run's own company
 g.media.length=0;r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,32]),'application/octet-stream'),env,g);
 await r.text();assert.equal(g.saved[2].supplier,'المتحدة للأدوية');assert.equal(g.saved[2].maybe,null);}
// «seen» is also silent for a company named on an unsure photo saved under the other company's run
{const g=fake();g.saved.push({kind:'image',supplier:'شركة النور',maybe:['المتحدة للأدوية','شركة النور'],status:'new',rows:[],review:0});
 const r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1&seen=1','','text/plain'),env,g);assert.equal(await r.text(),'');}
// a PDF or Excel file by its (long) path name
assert.equal(F.inboxKind('application/octet-stream','x'.repeat(200)+'.pdf'.slice(-120)),'pdf');
// PDF and unknown type
assert.equal(F.inboxKind('application/pdf',''),'pdf');assert.equal(F.inboxKind('application/octet-stream','list.xlsx'),'sheet');assert.equal(F.inboxKind('application/zip','a.zip'),'');
// Gemini quota: the message is still kept (status error) so nothing is lost
f=fake({gem:()=>{throw Error('x')}});const q=async(u,o)=>u.startsWith('https://generativelanguage')?new Response('',{status:429}):f(u,o);
r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية'),new Uint8Array([1,2,3]),'image/png'),env,q);
assert.equal(r.status,200);assert.equal(f.saved[0].status,'error');assert.match(f.saved[0].error,/حصة/);
// Gemini busy (503): the photo is kept as not read, the phone is told it will be read again, and it is read again
// in the background; the row is filled in. Another error (not 5xx) is not tried again.
{const g=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})});let calls=0;
 const h=async(u,o)=>u.startsWith('https://generativelanguage')&&calls++<1?new Response('',{status:503}):g(u,o);
 const r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,40]),'application/octet-stream'),{...env,INBOX_RETRY_WAIT_MS:'1'},h);
 assert.equal(await r.text(),'المتحدة للأدوية: الوارد وصل بس جوجل مشغول، البوت هيقراه تاني لوحده');
 assert.equal(g.saved[0].status,'new');assert.equal(g.saved[0].error,null);assert.equal(g.saved[0].sure,1);assert.equal(calls,2);}
{const g=fake();let calls=0;const h=async(u,o)=>u.startsWith('https://generativelanguage')?(calls++,new Response('',{status:500})):g(u,o);
 await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,41]),'application/octet-stream'),{...env,INBOX_RETRY_WAIT_MS:'1'},h);
 assert.equal(g.saved[0].status,'error');assert.equal(calls,3,'first try + 2 retries, then it stays not read');}
// a list sent as one message per item: the first is spoken, the next ones within 3 minutes only when they bring
// something from the shortages (then with today's totals)
{const g=fake();const t=(x)=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',x,'text/plain'),env,g).then(r=>r.text());
 assert.equal(await t('توبرادكس مرهم'),'','one line, nothing from the shortages: kept, not spoken');
 assert.equal(await t('دوليبران'),'','nothing from the shortages: silent');
 assert.equal(await t('فلاجيل شراب ١٢٥'),'المتحدة للأدوية: وصل فلاجيل ١٢٥ مجم شراب','brings a shortage item: said by name');
 assert.equal(await t('كلوباترا كريم'),'');assert.equal(g.saved.length,4,'all kept');}
// reactions (they quote the owner's own message) and voice notes / videos: ignored, not kept, nothing said, no folder check
{const g=fake({gem:()=>{throw Error('not read')}});const t=(x)=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',x,'text/plain'),env,g);
 for(const x of ['\u200fتفاعل بالرمز 👍 على "السلام عليكم،\nمحتاجين فلاجيل ١٢٥ مجم شراب"','Reacted 👍 to "فلاجيل"','🎤 \u200fرسالة صوتية (٠:٠٨)','\u200f🎥 فيديو']){
  const r=await t(x);assert.equal(r.status,200,x);assert.equal(await r.text(),'',x);}
 assert.equal(g.saved.length,0);assert.equal(g.media.length,0);}
// a short chat line with nothing from the shortages: kept, not spoken; a longer list with nothing still says so
{const g=fake();const t=(x)=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',x,'text/plain'),env,g).then(r=>r.text());
 assert.equal(await t('حاضر يادكتور'),'');assert.equal(g.saved.length,1);
 const g2=fake();assert.equal(await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1','توبرادكس مرهم\nدوليبران\nكلوباترا كريم','text/plain'),env,g2).then(r=>r.text()),'المتحدة للأدوية: مفيش حاجة من النواقص');}
// WhatsApp repeating a photo notification after that photo came: 200 (the phone does not check the folder again);
// before it came (not downloaded yet): still 202, so a late download is sent
{const g=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})});
 const note=()=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1','📷 ‏تم إرسال ٤ صور','text/plain'),env,g);
 assert.equal((await note()).status,202);
 assert.equal((await note()).status,202,'repeat, photo not come yet: still check');
 await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',new Uint8Array([255,216,255,77]),'application/octet-stream'),env,g);
 assert.equal(g.saved.length,1);
 assert.equal((await note()).status,200,'repeat after the photo came');
 assert.equal((await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية (2 رسائل)')+'&say=1','📷 ‏تم إرسال صورة','text/plain'),env,g)).status,202,'a new notification');}
// AutoNotification: the chat's name plus the notification's time («~w<ms>»). The same time again is WhatsApp showing the
// notification again (not fresh); a new time is a new photo; an old time (15 min+) never makes the phone check the folder
{const g=fake();const t0=Date.now();
 const note=(w)=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية ~w'+w)+'&say=1','📷 ‏تم إرسال صورة','text/plain'),env,g);
 assert.equal((await note(t0)).status,202);assert.equal(g.media.at(-1).fresh,true);assert.equal(g.media.at(-1).chat,'المتحدة للأدوية');
 assert.equal((await note(t0)).status,202,'same time again, photo not come yet: still check');assert.equal(g.media.at(-1).fresh,false);
 assert.equal((await note(t0+60000)).status,202);assert.equal(g.media.at(-1).fresh,true,'a new message: new time');
 const old=t0-20*60000;assert.equal((await note(old)).status,200,'an old notification shown again');assert.equal(g.media.at(-1).fresh,false);
 assert.equal((await note(Math.floor(old/1000))).status,200,'time in seconds too');
 const g2=fake();g2.media.push({supplier:'المتحدة للأدوية',chat:'المتحدة للأدوية',note:'المتحدة للأدوية ~w'+old+' 📷 ‏تم إرسال صورة',fresh:false,done:false});
 assert.equal((await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية ~w'+old)+'&say=1','📷 ‏تم إرسال صورة','text/plain'),env,g2)).status,200,'repeats all day: no folder check');
 const g3=fake();assert.equal(await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية ~w'+t0)+'&say=1','حاضر يادكتور','text/plain'),env,g3).then(r=>r.text()),'');assert.equal(g3.saved[0].supplier,'المتحدة للأدوية');assert.equal(g3.saved[0].sender,'المتحدة للأدوية','the time is not part of the name');
 const g4=fake();assert.equal((await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية ~w%anwhentime')+'&say=1','📷 ‏تم إرسال صورة','text/plain'),env,g4)).status,202,'no time from the phone: as before');}
// items ordered today («اتطلب»): not said and not counted again when a company sends them
{const ordered=[{name_key:'FLAGYL 125MG SYP'}];
 let g=fake({orders:ordered});const t=(x,h=g)=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1',x,'text/plain'),env,h).then(r=>r.text());
 assert.equal(await t('فلاجيل شراب ١٢٥\nبروفين ٤٠٠ مجم ٣٠ قرص'),'المتحدة للأدوية: وصل بروفين ٤٠٠ مجم ٣٠ قرص','the ordered one is left out');
 const q=g.calls.map(c=>c.url).find(u=>u.includes('/rest/v1/ar_orders'));assert.match(decodeURIComponent(q),/ordered_at=gte\.\d{4}-\d\d-\d\dT/);
 g=fake({orders:ordered});assert.equal(await t('فلاجيل شراب ١٢٥\nحاجة تانية\nكمان حاجة',g),'المتحدة للأدوية: اللي وصل من النواقص اتطلب النهارده');
 g=fake({orders:ordered});assert.equal(await t('فلاجيل شراب ١٢٥',g),'','a short message with only an ordered item: silent');assert.equal(g.saved.length,1,'still kept');
 g=fake();assert.equal(await t('فلاجيل شراب ١٢٥',g),'المتحدة للأدوية: وصل فلاجيل ١٢٥ مجم شراب','nothing ordered: said');
 assert.equal(F.dayTotals([{rows:[{match:{id:'a',confidence:'high'}},{match:{id:'b',confidence:'confirmed'}}],review:0}],id=>id==='a'),'النهارده لحد دلوقتي 1 صنف من النواقص');
 assert.equal(F.dayTotals([{rows:[{match:{id:'a',confidence:'high'}}],review:1}]),'النهارده لحد دلوقتي 1 صنف من النواقص و1 محتاجين تأكيدك');}
// a photo still not come 15 minutes after its notification: WhatsApp's repeats no longer make the phone check
{const g=fake();const note=()=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1','📷 ‏تم إرسال صورة','text/plain'),env,g);
 assert.equal((await note()).status,202);g.media[0].at=new Date(Date.now()-14*60e3).toISOString();
 assert.equal((await note()).status,202,'14 minutes: still checks');
 g.media[0].at=new Date(Date.now()-16*60e3).toISOString();
 const r=await note();assert.equal(r.status,200,'16 minutes: stops');assert.equal(await r.text(),'');}
// a one-line chat whose word only looks like a shortage (needs the owner's check, nothing sure): silent, kept
{shortages.push({id:'s5',product_name:'FLAGYL 500MG 20TAB'});names.push({name_key:'FLAGYL 500MG 20TAB',arabic_name:'فلاجيل ٥٠٠ مجم اقراص',status:'approved'});
 try{const g=fake();const r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1','فلاجيل','text/plain'),env,g);
  const said=await r.text();assert.equal(g.saved.length,1);assert.equal(g.saved[0].sure,0);assert.ok(g.saved[0].review>0,'two FLAGYL items: needs the owner');assert.equal(said,'','review only, short: silent');
  const g2=fake();const r2=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1','فلاجيل\nحاجة\nحاجة تانية','text/plain'),env,g2);
  assert.match(await r2.text(),/محتاجين تأكيدك/,'a longer list still says it');}
 finally{shortages.splice(2);names.splice(2)}}
// Excel name column (same rule as the page)
assert.deepEqual(F.sheetNames([['قائمة'],['م','اسم الصنف','الكمية'],[1,'فلاجيل شراب',2],[2,'بروفين',1]]),['فلاجيل شراب','بروفين']);
console.log('PASS: inbox: key, saved companies only, text/image matched and kept, spoken summary, quota kept as error');
})().catch(e=>{console.error(e);process.exitCode=1});
