// Automatic incoming (phone → function): key check, only saved companies, text/image/PDF read and matched, file kept,
// row saved in ar_inbox, spoken summary. Fake Supabase and Gemini; nothing real is called.
const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
const F=await import(path.join(__dirname,'..','supabase','functions','arabic-shortages','index.ts'));
const env={GEMINI_API_KEY:'k',ALLOWED_EMAILS:'owner@example.com',SUPABASE_URL:'https://p.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'};
const KEY='a'.repeat(64),HASH=crypto.createHash('sha256').update(KEY).digest('hex');
const shortages=[{id:'s1',product_name:'BRUFEN 400MG 30TAB'},{id:'s2',product_name:'FLAGYL 125MG SYP'}];
const names=[{name_key:'FLAGYL 125MG SYP',arabic_name:'فلاجيل ١٢٥ مجم شراب',status:'approved'},{name_key:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠ مجم ٣٠ قرص',status:'approved'}];
function fake({gem}={}){const calls=[],saved=[],files=[];const page=(u,a)=>new Response(JSON.stringify(u.includes('offset=0')?a:[]));
 const f=async(url,o={})=>{calls.push({url,o});
  if(url.includes('/rest/v1/ar_inbox_keys'))return page(url,url.includes('key_hash=eq.'+HASH)?[{key_hash:HASH}]:[]);
  if(url.includes('/rest/v1/ar_suppliers'))return page(url,[{name:'المتحدة للأدوية',phone:'201001234567'}]);
  if(url.includes('/rest/v1/ar_shortages'))return page(url,shortages);
  if(url.includes('/rest/v1/ar_names'))return page(url,names);
  if(url.includes('/rest/v1/ar_answers')||url.includes('/rest/v1/ar_fixes')||url.includes('/rest/v1/ar_ignored'))return page(url,[]);
  if(url.includes('/rest/v1/ar_inbox?select=body_text'))return page(url,saved.filter(r=>r.kind==='text').map(r=>({body_text:r.body_text})));
  if(url.includes('/rest/v1/ar_inbox?select=id&file_path=like.'))return page(url,saved.filter(r=>r.file_path&&url.includes(r.file_path.split('/')[1].split('.')[0])).map(()=>({id:'x'})));
  if(url.includes('/rest/v1/ar_inbox')&&o.method==='POST'){const row=JSON.parse(o.body);saved.push(row);return new Response(JSON.stringify([{id:'in'+saved.length}]),{status:201})}
  if(url.includes('/storage/v1/object/ar-inbox/')){files.push({url,headers:o.headers});return new Response('{}')}
  if(url.startsWith('https://generativelanguage'))return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(gem())}]}}]}));
  throw Error('unexpected '+url)};Object.assign(f,{calls,saved,files});return f}
const post=(q,body,type,key=KEY)=>new Request('https://p.supabase.co/functions/v1/arabic-shortages?'+q,{method:'POST',headers:{'x-inbox-key':key,'content-type':type},body});
// wrong key: refused, nothing read
let f=fake();let r=await F.handle(post('from=x','hi','text/plain','b'.repeat(64)),env,f);assert.equal(r.status,401);
// unknown sender (not a saved company): ignored before reading or storing
f=fake({gem:()=>{throw Error('no')}});r=await F.handle(post('from='+encodeURIComponent('زبون'),'فلاجيل','text/plain'),env,f);
assert.equal(r.status,200);assert.equal((await r.json()).ignored,true);assert.equal(f.saved.length,0);assert.ok(!f.calls.some(c=>c.url.includes('generativelanguage')));
// text from a saved company (name written a little differently): matched, saved, spoken summary
f=fake();r=await F.handle(post('from='+encodeURIComponent('المتحده للادويه')+'&say=1','فلاجيل شراب ١٢٥ | 3\nحاجة تانية','text/plain; charset=utf-8'),env,f);
assert.equal(r.status,200);assert.equal(await r.text(),'المتحدة للأدوية: وصل 1 صنف من النواقص');
assert.equal(f.saved[0].kind,'text');assert.equal(f.saved[0].supplier,'المتحدة للأدوية');assert.equal(f.saved[0].sure,1);assert.equal(f.saved[0].rows.length,2);
assert.ok(f.calls.filter(c=>c.url.includes('/rest/v1/')).every(c=>c.o.headers.Authorization==='Bearer service'&&c.o.headers.apikey==='service'),'service role (as apikey too), no login');
// WhatsApp count in the chat title is dropped: "(2 رسائل)" / "(3 messages)"
assert.equal(F.inboxSender('الفتح shreif (2 رسائل)'),'الفتح shreif');assert.equal(F.inboxSender('Al Fath (12 messages)'),'Al Fath');assert.equal(F.inboxSender('شركة (الفرع)'),'شركة (الفرع)');
f=fake();r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية (٣ رسائل)')+'&say=1','فلاجيل شراب ١٢٥','text/plain'),env,f);assert.match(await r.text(),/^المتحدة للأدوية: وصل 1/);
// mixed Arabic/English name: word order ignored, other names still refused
assert.equal(F.sameCompany('Shreif الفتح','الفتح shreif'),true);assert.equal(F.sameCompany('Shreif الفتح','الفتح'),false);assert.equal(F.sameCompany('Shreif الفتح',''),false);assert.equal(F.sameCompany('','الفتح'),false);
// a group message: the title holds the group's name and the sender
assert.equal(F.sameCompany('Shreif الفتح','وارد مخزن النور كفر الشيخ: Shreif الفتح'),true);assert.equal(F.sameCompany('Shreif الفتح','وارد مخزن النور: احمد'),false);
// the same text notification twice: kept once
{const g=fake();const t='فلاجيل شراب ١٢٥\nبروفين';await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية'),t,'text/plain'),env,g);
 const r2=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية'),t,'text/plain'),env,g);assert.equal((await r2.json()).duplicate,true);assert.equal(g.saved.length,1);}
// new-style secret key (sb_secret_…) is not a JWT: sent only as apikey
f=fake();r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية'),'فلاجيل شراب ١٢٥','text/plain'),{...env,SUPABASE_SERVICE_ROLE_KEY:'sb_secret_x'},f);assert.equal(r.status,200);
assert.ok(f.calls.filter(c=>c.url.includes('/rest/v1/')).every(c=>c.o.headers.apikey==='sb_secret_x'&&!c.o.headers.Authorization));
// image: read by Gemini, file kept in the private bucket
f=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})});
r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&name=IMG-1.jpg',new Uint8Array([255,216,255,0]),'image/jpeg'),env,f);
const b=await r.json();assert.equal(b.ok,true);assert.equal(b.sure,1);assert.match(b.say,/وصل 1 صنف/);
assert.equal(f.files.length,1);assert.match(f.files[0].url,/ar-inbox\/\d{4}-\d\d-\d\d\/[0-9a-f-]+\.jpg$/);assert.equal(f.saved[0].kind,'image');assert.ok(f.saved[0].file_path);
// the photo's notification text is ignored (the photo comes by itself); the same photo sent again is kept once
f=fake();r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&say=1','📷 صورة','text/plain'),env,f);assert.equal(await r.text(),'');assert.equal(f.saved.length,0);
{const g=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})});const seen=[];
 const h=async(u,o)=>{if(u.includes('/rest/v1/ar_inbox?select=id&file_path=like.')){return new Response(JSON.stringify(seen.some(p=>u.includes(p.split('/')[1].split('.')[0]))?[{id:'x'}]:[]))}const res=await g(u,o);if(u.includes('/rest/v1/ar_inbox')&&o.method==='POST')seen.push(g.saved.at(-1).file_path);return res};
 const path='/storage/emulated/0/Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Business Images/IMG-20261029-WA0001.jpg';
 const send=()=>F.handle(post('from='+encodeURIComponent('المتحدة للأدوية')+'&name='+encodeURIComponent(path),new Uint8Array([255,216,255,9]),'application/octet-stream'),env,h);
 assert.equal((await (await send()).json()).ok,true);assert.equal((await (await send()).json()).duplicate,true);assert.equal(g.saved.length,1);
 assert.match(g.saved[0].file_path,/^\d{4}-\d\d-\d\d\/[0-9a-f]{32}\.jpg$/);assert.equal(g.files[0].headers['Content-Type'],'image/jpeg');}
// a PDF or Excel file by its (long) path name
assert.equal(F.inboxKind('application/octet-stream','x'.repeat(200)+'.pdf'.slice(-120)),'pdf');
// PDF and unknown type
assert.equal(F.inboxKind('application/pdf',''),'pdf');assert.equal(F.inboxKind('application/octet-stream','list.xlsx'),'sheet');assert.equal(F.inboxKind('application/zip','a.zip'),'');
// Gemini quota: the message is still kept (status error) so nothing is lost
f=fake({gem:()=>{throw Error('x')}});const q=async(u,o)=>u.startsWith('https://generativelanguage')?new Response('',{status:429}):f(u,o);
r=await F.handle(post('from='+encodeURIComponent('المتحدة للأدوية'),new Uint8Array([1,2,3]),'image/png'),env,q);
assert.equal(r.status,200);assert.equal(f.saved[0].status,'error');assert.match(f.saved[0].error,/حصة/);
// Excel name column (same rule as the page)
assert.deepEqual(F.sheetNames([['قائمة'],['م','اسم الصنف','الكمية'],[1,'فلاجيل شراب',2],[2,'بروفين',1]]),['فلاجيل شراب','بروفين']);
console.log('PASS: inbox: key, saved companies only, text/image matched and kept, spoken summary, quota kept as error');
})().catch(e=>{console.error(e);process.exitCode=1});
