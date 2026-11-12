// Function asker-staff: the owner makes a staff account and its personal link; the link signs the person in; a stopped account
// or an old link is refused. Fake Supabase (auth admin, sign-in, ar_staff); nothing real is called. Made-up people only.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
const F=await import(pathToFileURL(path.join(__dirname,'..','supabase','functions','asker-staff','index.ts')).href);
const ORIGIN='https://taherasker2560-dot.github.io',OWNER=F.OWNER_ID,STAFF='00000000-0000-4000-8000-0000000000b1';
const env={SUPABASE_URL:'https://p.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'};
function fake({me=OWNER}={}){const staff=[],users={},calls=[];
 const f=async(url,o={})=>{calls.push({url,o});const u=new URL(url),body=o.body?JSON.parse(o.body):null;
  if(u.pathname==='/auth/v1/user')return new Response(JSON.stringify(me?{id:me}:{}),{status:me?200:401});
  if(u.pathname==='/auth/v1/admin/users'&&o.method==='POST'){const id=STAFF;users[id]={...body};return new Response(JSON.stringify({id}))}
  if(u.pathname.startsWith('/auth/v1/admin/users/')&&o.method==='PUT'){const id=u.pathname.split('/').pop();users[id]={...users[id],...body};return new Response('{}')}
  if(u.pathname==='/auth/v1/token'){const x=Object.values(users).find(v=>v.email===body.email&&v.password===body.password);return x?new Response(JSON.stringify({access_token:'at',refresh_token:'rt'})):new Response('{}',{status:400})}
  if(u.pathname==='/rest/v1/ar_staff'&&o.method==='POST'){staff.push({active:true,...body});return new Response(null,{status:201})}
  if(u.pathname==='/rest/v1/ar_staff'&&o.method==='PATCH'){const id=u.searchParams.get('user_id').replace('eq.','');Object.assign(staff.find(s=>s.user_id===id)||{},body);return new Response(null,{status:204})}
  if(u.pathname==='/rest/v1/ar_staff'){const [k,v]=[...u.searchParams].find(([k])=>k==='link_hash'||k==='user_id');const hit=staff.filter(s=>String(s[k])===v.replace('eq.',''));return new Response(JSON.stringify(hit))}
  throw Error('unexpected '+url)};f.staff=staff;f.users=users;f.calls=calls;return f}
const req=(body,auth='Bearer owner-jwt')=>new Request('https://p.supabase.co/functions/v1/asker-staff',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json',...(auth?{authorization:auth}:{})},body:JSON.stringify(body)});
// the owner adds a person: an account nobody can guess, his switches (unknown ones dropped), a personal link
let f=fake(),r=await F.handle(req({action:'create',name:'  موظف   تجربة ',perms:['tempsale','return','admin','tempsale']}),env,f),b=await r.json();
assert.equal(r.status,200);assert.equal(b.user_id,STAFF);assert.match(b.link,/^https:\/\/taherasker2560-dot\.github\.io\/asker-nawaqes\/asker-nawaqes-arabic\.html#staff=[0-9a-f]{64}$/);
assert.equal(f.staff[0].name,'موظف تجربة');assert.deepEqual(f.staff[0].perms,['tempsale','return']);
assert.equal(f.staff[0].link_hash,await F.sha256Hex(b.link.split('#staff=')[1]),'only the link\'s hash is kept');
assert.equal(f.users[STAFF].email_confirm,true);assert.match(f.users[STAFF].email,/^staff-[0-9a-f]{12}@/);
assert.ok(f.calls.filter(c=>c.url.includes('/admin/')).every(c=>c.o.headers.apikey==='service'),'admin calls with the service key');
// the link signs him in (no session needed) and returns a session the phone keeps
const token=b.link.split('#staff=')[1];
r=await F.handle(req({action:'login',token},null),env,f);b=await r.json();
assert.equal(r.status,200);assert.deepEqual([b.access_token,b.refresh_token,b.name],['at','rt','موظف تجربة']);assert.ok(f.staff[0].last_seen_at);
// a new link: the old one stops working
r=await F.handle(req({action:'link',user_id:STAFF}),env,f);const link2=(await r.json()).link;
assert.equal((await F.handle(req({action:'login',token},null),env,f)).status,401);
assert.equal((await F.handle(req({action:'login',token:link2.split('#staff=')[1]},null),env,f)).status,200);
// stopped: refused at once, his phone cannot renew its session (banned)
r=await F.handle(req({action:'stop',user_id:STAFF}),env,f);assert.equal(r.status,200);assert.equal(f.staff[0].active,false);assert.equal(f.users[STAFF].ban_duration,'876000h');
r=await F.handle(req({action:'login',token:link2.split('#staff=')[1]},null),env,f);assert.equal(r.status,401);assert.match((await r.json()).message,/مبقاش شغال/);
// switched on again with a new link
r=await F.handle(req({action:'link',user_id:STAFF}),env,f);assert.equal(f.staff[0].active,true);assert.equal(f.users[STAFF].ban_duration,'none');
// only the owner manages staff; a broken link; another site
assert.equal((await F.handle(req({action:'create',name:'x'}),env,fake({me:STAFF}))).status,403,'a staff member cannot make accounts');
assert.equal((await F.handle(req({action:'create',name:'x'},null),env,fake())).status,401);
assert.equal((await F.handle(req({action:'login',token:'abc'},null),env,fake())).status,400);
assert.equal((await F.handle(new Request('https://p.supabase.co/functions/v1/asker-staff',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{"action":"login"}'}),env,fake())).status,403);
assert.equal((await F.handle(req({action:'stop',user_id:'not-an-id'}),env,fake())).status,400);
console.log('PASS: asker-staff: owner makes the account and its link, the link signs in, a new link kills the old one, stop = refused');
})().catch(e=>{console.error(e);process.exit(1)});
