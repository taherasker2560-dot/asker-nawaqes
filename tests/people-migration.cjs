// Migration 202611190030 (owner 2026-11-18: «ليه مش مخليني أشوف الناس اللي بتسجل في الموقع … واللي بتنزل الأبليكيشن … وأبقى شايف لما يشيلوه»), run for real on an
// in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package): the owner's list of every person (credit customers by link, the people
// of their houses, the site accounts) with installs, «منبه الدوا» and the hard sign of a removal; the app's anonymous «I am here»; nothing readable by strangers.
// The tables it reads are small stand-ins with the live columns (and ar_member_resolve as it is live). Made-up people only: the repository is public.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 const T1='1'.repeat(64),T2='2'.repeat(64),TM='3'.repeat(64),TS='4'.repeat(64),OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',STRANGER='00000000-0000-4000-8000-0000000000ff';
 const sha=(s)=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_customers(id bigint PRIMARY KEY, name text, balance numeric);
 CREATE TABLE public.ar_customer_links(customer_id bigint PRIMARY KEY, token text NOT NULL UNIQUE, created_at timestamptz DEFAULT now(), last_seen_at timestamptz, seen_count int NOT NULL DEFAULT 0, installed_at timestamptz);
 CREATE TABLE public.ar_customer_phones(customer_id bigint, phone text, updated_at timestamptz DEFAULT now());
 CREATE TABLE public.ar_customer_members(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_id bigint NOT NULL, token text NOT NULL UNIQUE, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz, seen_count int NOT NULL DEFAULT 0);
 CREATE TABLE public.ar_chats(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id bigint, member_id bigint);
 CREATE TABLE public.ar_site_users(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, phone text NOT NULL UNIQUE, name text NOT NULL, platform text, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz, opens int NOT NULL DEFAULT 0, installed_at timestamptz);
 CREATE TABLE public.ar_site_sessions(token_hash text PRIMARY KEY, user_id bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz);
 CREATE FUNCTION public.ar_member_resolve(p_token text) RETURNS TABLE (customer_id bigint, member_id bigint, member_name text, show_balance boolean, on_account boolean) LANGUAGE sql STABLE AS $$
  SELECT l.customer_id, NULL::bigint, NULL::text, true, true FROM public.ar_customer_links l WHERE p_token ~ '^[0-9a-f]{64}$' AND l.token = p_token
  UNION ALL SELECT m.customer_id, m.id, m.name, false, true FROM public.ar_customer_members m WHERE p_token ~ '^[0-9a-f]{64}$' AND m.token = p_token LIMIT 1 $$;
 INSERT INTO public.ar_customers VALUES (101,'أحمد محمود_01001112223',1250),(102,'منى سالم',-40);
 INSERT INTO public.ar_customer_links(customer_id, token, created_at, last_seen_at, seen_count, installed_at) VALUES
  (101,'${T1}',now()-interval '5 days',now()-interval '1 hour',12,now()-interval '4 days'),(102,'${T2}',now()-interval '40 days',now()-interval '35 days',2,now()-interval '39 days');
 INSERT INTO public.ar_customer_phones(customer_id, phone, updated_at) VALUES (101,'01001110000',now()-interval '9 days'),(101,'01001112223',now());
 INSERT INTO public.ar_customer_members(customer_id, token, name, last_seen_at, seen_count) VALUES (101,'${TM}','سارة أحمد',now()-interval '2 days',3);
 INSERT INTO public.ar_site_users(phone, name, platform, last_seen_at, opens, installed_at) VALUES ('01112345678','كريم حسن','android',now()-interval '10 days',4,now()-interval '12 days');
 INSERT INTO public.ar_site_sessions(token_hash, user_id) VALUES ('${sha(TS)}',1);`);
 const sql=fs.readFileSync('supabase/migrations/202611190030_ar_people.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const as=async(uid)=>db.exec(`SELECT set_config('app.uid','${uid||''}',false)`);
 const q=async(text,p)=>(await db.query(text,p)).rows;
 const one=async(fn,args)=>(await q(`SELECT public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS r`,args))[0].r;

 // ---- the app's «I am here»: a random id only; at most one update per 30 minutes; at most 300 new phones an hour
 assert.deepEqual(await one('ar_app_ping',['nope','1.4']),{ok:false,error:'id'});
 assert.deepEqual(await one('ar_app_ping',[null,null]),{ok:false,error:'id'});
 const A='a'.repeat(32);
 assert.deepEqual(await one('ar_app_ping',[A,' 1.4 ']),{ok:true});
 let row=(await q(`SELECT * FROM public.ar_app_installs WHERE id=$1`,[A]))[0];
 assert.equal(row.pings,1);assert.equal(row.version,'1.4','the version, tidied');
 await one('ar_app_ping',[A,'1.5']);
 assert.equal((await q(`SELECT pings FROM public.ar_app_installs WHERE id=$1`,[A]))[0].pings,1,'twice in 30 minutes = once');
 await db.exec(`UPDATE public.ar_app_installs SET last_at = now() - interval '2 days' WHERE id='${A}'`);
 await one('ar_app_ping',[A,'1.5']);
 row=(await q(`SELECT * FROM public.ar_app_installs WHERE id=$1`,[A]))[0];
 assert.equal(row.pings,2);assert.equal(row.version,'1.5');assert.ok(Date.now()-new Date(row.last_at).getTime()<60e3,'last seen now');
 await one('ar_app_ping',['b'.repeat(32),'x'.repeat(40)]);
 assert.equal((await q(`SELECT version FROM public.ar_app_installs WHERE id=$1`,['b'.repeat(32)]))[0].version.length,20,'a long version is cut, never refused');
 await db.exec(`INSERT INTO public.ar_app_installs(id) SELECT lpad(to_hex(g), 32, '0') FROM generate_series(1, 298) g`);
 assert.deepEqual(await one('ar_app_ping',['d'.repeat(32),null]),{ok:false,error:'busy'},'a stranger cannot fill the table');
 assert.deepEqual(await one('ar_app_ping',[A,null]),{ok:true},'a known phone still says it is here');
 await db.exec(`DELETE FROM public.ar_app_installs WHERE id LIKE '000%'`);
 await db.exec(`UPDATE public.ar_app_installs SET last_at = now() - interval '5 days' WHERE id='${'b'.repeat(32)}'`);

 // ---- the site: «this person's phone has منبه الدوا», by his own secret only, at most once per 12 hours
 assert.deepEqual(await one('ar_app_seen',[T1,null]),{ok:true});
 const at1=(await q(`SELECT app_at FROM public.ar_customer_links WHERE customer_id=101`))[0].app_at;assert.ok(at1,'the customer by his link');
 await db.exec(`UPDATE public.ar_customer_links SET app_at = now() - interval '1 hour' WHERE customer_id=101`);
 await one('ar_app_seen',[T1,null]);
 assert.ok(Date.now()-new Date((await q(`SELECT app_at FROM public.ar_customer_links WHERE customer_id=101`))[0].app_at).getTime()>50*60e3,'not again within 12 hours');
 assert.deepEqual(await one('ar_app_seen',[TM,null]),{ok:true});
 assert.ok((await q(`SELECT app_at FROM public.ar_customer_members WHERE token=$1`,[TM]))[0].app_at,'a person of the house: his own row');
 assert.equal((await q(`SELECT app_at FROM public.ar_customer_links WHERE customer_id=101`))[0].app_at instanceof Date,true);
 assert.deepEqual(await one('ar_app_seen',[null,TS]),{ok:true});
 assert.ok((await q(`SELECT app_at FROM public.ar_site_users WHERE id=1`))[0].app_at,'a site account by its session');
 assert.deepEqual(await one('ar_app_seen',['9'.repeat(64),null]),{ok:false,error:'who'});
 assert.deepEqual(await one('ar_app_seen',[null,'9'.repeat(64)]),{ok:false,error:'who'});
 assert.deepEqual(await one('ar_app_seen',['<script>',"' or 1=1 --"]),{ok:false,error:'who'});
 assert.equal((await q(`SELECT app_at FROM public.ar_customer_links WHERE customer_id=102`))[0].app_at,null,'nobody else is touched');

 // ---- a push address that died for a person's chat (asker-chat writes it)
 const chat=(await q(`INSERT INTO public.ar_chats(customer_id) VALUES (102) RETURNING id`))[0].id;
 await q(`INSERT INTO public.ar_chats(customer_id, member_id) VALUES (101, 1)`);
 await q(`INSERT INTO public.ar_push_gone(chat_id, at) VALUES ($1, now() - interval '3 days'), ($1, now() - interval '1 day')`,[chat]);

 // ---- the owner's list: every person, newest open first; strangers and staff are refused
 await as(STRANGER);
 await assert.rejects(()=>one('ar_people_list',[]),/owner only/);
 await as('');
 await assert.rejects(()=>one('ar_people_list',[]),/owner only/,'no sign-in either');
 await as(OWNER);
 const r=await one('ar_people_list',[]);
 assert.equal(r.ok,true);
 assert.deepEqual(r.people.map(p=>[p.kind,p.id]),[['customer',101],['member',1],['site',1],['customer',102]],'newest open first, every kind');
 const c1=r.people[0],m1=r.people[1],s1=r.people[2],c2=r.people[3];
 assert.equal(c1.name,'أحمد محمود_01001112223');assert.equal(c1.phone,'01001112223','the newest phone of the customer');assert.equal(c1.opens,12);
 assert.ok(c1.installed_at&&c1.app_at&&c1.since_at);assert.equal(c1.push_gone_at,null);
 assert.equal(m1.name,'سارة أحمد');assert.equal(m1.of_name,'أحمد محمود_01001112223','whose house');assert.ok(m1.app_at);assert.equal(m1.installed_at,null);
 assert.equal(s1.name,'كريم حسن');assert.equal(s1.phone,'01112345678');assert.equal(s1.platform,'android');assert.equal(s1.opens,4);assert.ok(s1.app_at&&s1.installed_at);
 assert.equal(c2.name,'منى سالم');assert.ok(c2.push_gone_at,'the hard sign: his push address died');
 assert.ok(Date.now()-new Date(c2.push_gone_at).getTime()<1.1*864e5,'the latest one');
 assert.deepEqual(r.apps,{total:2,active7:2,silent3:1},'the app phones: 2 said it this week, one has been quiet for 5 days');
 assert.ok(!JSON.stringify(r).includes(T1)&&!JSON.stringify(r).includes(TM)&&!JSON.stringify(r).includes(sha(TS)),'no secret, no session in the list');

 // ---- nothing readable by a stranger: the new tables have no grants; the list is for signed-in users (and refuses all but the owner)
 const priv=async(role,obj,kind,what)=>(await q(`SELECT has_${kind}_privilege('${role}', '${obj}', '${what}') AS ok`))[0].ok;
 for(const t of ['public.ar_app_installs','public.ar_push_gone'])for(const role of ['anon','authenticated'])assert.equal(await priv(role,t,'table','select'),false,role+' reads '+t);
 assert.equal(await priv('anon','public.ar_people_list()','function','execute'),false);
 assert.equal(await priv('authenticated','public.ar_people_list()','function','execute'),true);
 assert.equal(await priv('anon','public.ar_app_ping(text, text)','function','execute'),true);
 assert.equal(await priv('anon','public.ar_app_seen(text, text)','function','execute'),true);
 console.log('people migration ok');
})().catch(e=>{console.error(e);process.exit(1)});
