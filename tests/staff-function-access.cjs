// arabic-shortages and the staff (migration 202611130200): a staff member the owner opened «الوارد» for may read and match,
// «الترجمة» may translate; anyone else signed in is refused. Fake Supabase; nothing real is called. Made-up data only.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
const F=await import(pathToFileURL(path.join(__dirname,'..','supabase','functions','arabic-shortages','index.ts')).href);
const ORIGIN='https://taherasker2560-dot.github.io',ID='00000000-0000-4000-8000-0000000000c1';
const env={GEMINI_API_KEY:'k',ALLOWED_EMAILS:'owner@example.com',SUPABASE_URL:'https://p.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'};
const fake=(perms,active=true)=>async(url,o={})=>{
 if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:ID,email:'staff-1@staff.asker-pharmacy.app'}));
 if(url.includes('/rest/v1/ar_staff?')){assert.equal(o.headers.apikey,'service');return new Response(JSON.stringify(active&&perms?[{perms}]:[]))}
 if(url.includes('/rest/v1/ar_shortages'))return new Response(JSON.stringify(url.includes('offset=0')?[{id:'s1',product_name:'FLAGYL 125MG SYP'}]:[]));
 if(url.includes('/rest/v1/'))return new Response('[]');
 throw Error('unexpected '+url)};
const req=body=>new Request('https://p.supabase.co/functions/v1/arabic-shortages',{method:'POST',headers:{origin:ORIGIN,authorization:'Bearer jwt','content-type':'application/json'},body:JSON.stringify(body)});
const lines={action:'lines',lines:['فلاجيل شراب']};
assert.equal((await F.handle(req(lines),env,fake(['read']))).status,200,'«الوارد» opened: reads');
assert.equal((await F.handle(req(lines),env,fake(['tempsale']))).status,403,'another section only: refused');
assert.equal((await F.handle(req(lines),env,fake(null))).status,403,'not a staff member (or stopped): refused');
assert.equal((await F.handle(req({action:'translate',limit:1}),env,fake(['read']))).status,403,'«الترجمة» not opened');
assert.equal((await F.handle(req(lines),{...env,SUPABASE_SERVICE_ROLE_KEY:''},fake(['read']))).status,403,'no service key: nobody but the owner');
console.log('PASS: arabic-shortages: staff only in the sections opened for them');
})().catch(e=>{console.error(e);process.exit(1)});
