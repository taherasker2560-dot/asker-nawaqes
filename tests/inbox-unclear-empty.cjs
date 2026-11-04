// Stage 3 (4 Nov audit): a line Gemini marks unclear is never a sure match by guess, and a photo with no product
// lines is kept but not spoken. Same fakes as tests/inbox.cjs; nothing real is called.
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
  if(url.includes('/rest/v1/ar_inbox?select=body_text')){const gte=decodeURIComponent((url.match(/received_at=gte\.([^&]+)/)||[])[1]||'');return page(url,saved.filter(r=>r.kind==='text'&&(!gte||r.received_at>=gte)).map(r=>({body_text:r.body_text})))}
  if(url.includes('/rest/v1/ar_inbox?select=id,received_at&file_path=like.'))return page(url,saved.filter(r=>r.file_path&&url.includes(r.file_path.split('/')[1].split('.')[0])).map(()=>({id:'x'})));
  if(url.includes('/rest/v1/ar_inbox?id=eq.')&&o.method==='PATCH'){const id=decodeURIComponent(url.match(/id=eq\.([^&]+)/)[1]);const r=saved.find(x=>x.id===id&&x.status==='error');if(r)Object.assign(r,JSON.parse(o.body));return new Response('',{status:204})}
  if(url.includes('/rest/v1/ar_inbox')&&o.method==='POST'){const row=JSON.parse(o.body);row.received_at=new Date(Date.now()+saved.length).toISOString();row.id='in'+(saved.length+1);saved.push(row);return new Response(JSON.stringify([{id:'in'+saved.length,received_at:row.received_at}]),{status:201})}
  if(url.includes('/rest/v1/rpc/ar_inbox_file_at'))return new Response(JSON.stringify(fileAt));
  if(url.includes('/storage/v1/object/ar-inbox/')){files.push({url,headers:o.headers});return new Response('{}')}
  if(url.startsWith('https://generativelanguage'))return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(gem())}]}}]}));
  throw Error('unexpected '+url)};Object.assign(f,{calls,saved,files,media});return f}
const post=(q,body,type,key=KEY)=>new Request('https://p.supabase.co/functions/v1/arabic-shortages?'+q,{method:'POST',headers:{'x-inbox-key':key,'content-type':type},body});
const CO='from='+encodeURIComponent('المتحدة للأدوية')+'&say=1';
// a clear line: sure, said by name (unchanged behaviour)
let f=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB'}]})});
let r=await F.handle(post(CO,new Uint8Array([255,216,255,1]),'image/jpeg'),env,f);
assert.equal(await r.text(),'المتحدة للأدوية: وصل بروفين ٤٠٠ مجم ٣٠ قرص');assert.equal(f.saved[0].sure,1);
// the same line read unclearly: not sure, the owner is asked to confirm
f=fake({gem:()=>({supplier:'',rows:[{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'BRUFEN 400MG 30TAB',unclear:true}]})});
r=await F.handle(post(CO,new Uint8Array([255,216,255,2]),'image/jpeg'),env,f);
assert.equal(f.saved[0].sure,0,'unclear line not counted');assert.equal(f.saved[0].rows[0].match.confidence,'review');assert.equal(f.saved[0].review,1);
assert.match(await r.text(),/محتاجين تأكيدك/);
// an exact «أيوه» before for this text still counts it sure, even read unclearly
{const k=F.matchRows([{name:'بروفين ٤٠٠ مجم ٣٠ قرص',english:'',unclear:true}],F.shortageCatalog(shortages,names,[]),{names,answers:[{alias_key:'بروفين 400 مجم 30 قرص',read_text:'بروفين ٤٠٠ مجم ٣٠ قرص',name_key:'BRUFEN 400MG 30TAB',decision:'yes'}],fixes:[],ignored:new Set()},shortages);
 assert.equal(k[0].match.confidence,'confirmed');}
// a photo with no product lines (another chat's photo, a logo): kept, nothing said
f=fake({gem:()=>({supplier:'',rows:[]})});
r=await F.handle(post(CO,new Uint8Array([255,216,255,3]),'image/jpeg'),env,f);
assert.equal(r.status,200);assert.equal(await r.text(),'','silent');assert.equal(f.saved.length,1,'kept for the page');assert.equal(f.saved[0].sure,0);
// a text with no lines is unchanged (short chat lines are already silent)
console.log('PASS: unclear lines go to review (an exact yes still confirms); a photo with no product lines is kept and silent');
})().catch(e=>{console.error(e);process.exit(1)});
