// Migration 202611170300 (owner 2026-11-17): accounts for the people who install the site (name, mobile, password), counted by the owner.
// Runs the migration on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package). PGlite has no pgcrypto, so
// the three pgcrypto functions are small stand-ins here (same shape: crypt(password, salt-or-hash)); the real bcrypt is checked live after the migration.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE SCHEMA extensions;
 CREATE FUNCTION extensions.gen_salt(t text, n int) RETURNS text LANGUAGE sql AS $$ SELECT substr(md5(random()::text), 1, 8) $$;
 CREATE FUNCTION extensions.crypt(pw text, s text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT substr(s, 1, 8) || md5(coalesce(pw, '') || '|' || substr(s, 1, 8)) $$;
 CREATE FUNCTION extensions.gen_random_bytes(n int) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(substr(md5(random()::text), 1, n * 2), 'hex') $$;
 CREATE TABLE public.ar_customer_links(customer_id bigint PRIMARY KEY, token text NOT NULL, created_at timestamptz DEFAULT now(), last_seen_at timestamptz, seen_count int NOT NULL DEFAULT 0);`);
 const sql=fs.readFileSync('supabase/migrations/202611170300_ar_site_users.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const q=async(text,params)=>(await db.query(text,params)).rows;
 const call=async(fn,args)=>{const r=await q(`SELECT public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS r`,args);return r[0].r};
 const signup=(name,phone,pw,platform='android',standalone=true)=>call('ar_site_signup',[name,phone,pw,platform,standalone]);
 const login=(phone,pw,platform='android',standalone=false)=>call('ar_site_login',[phone,pw,platform,standalone]);

 // ---- signing up
 let r=await signup('  أحمد   محمود ','+20 10 1234 5678','secret1');
 assert.equal(r.ok,true);assert.match(r.token,/^[0-9a-f]{64}$/);
 assert.deepEqual(r.user,{id:r.user.id,name:'أحمد محمود',phone:'01012345678'},'name tidied, mobile in one form');
 const tokenA=r.token;
 const row=(await q(`SELECT * FROM public.ar_site_users WHERE phone='01012345678'`))[0];
 assert.notEqual(row.pw_hash,'secret1');assert.ok(!row.pw_hash.includes('secret1'),'only a hash is kept');
 assert.equal(row.platform,'android');assert.ok(row.installed_at,'signed up inside the installed app = installed');assert.equal(row.opens,1);
 const sess=(await q(`SELECT token_hash FROM public.ar_site_sessions`));assert.equal(sess.length,1);assert.notEqual(sess[0].token_hash,tokenA,'only the token\'s hash is kept');assert.match(sess[0].token_hash,/^[0-9a-f]{64}$/);
 assert.equal((await signup('أحمد','01012345678','another1')).error,'exists');
 assert.equal((await signup('أ','01112345678','secret1')).error,'bad_name');
 assert.equal((await signup('كريم حسن','01312345678','secret1')).error,'bad_phone');
 assert.equal((await signup('كريم حسن','0101234','secret1')).error,'bad_phone');
 assert.equal((await signup('كريم حسن','01112345678','12345')).error,'bad_password');
 assert.equal((await signup('كريم حسن','01112345678','x'.repeat(73))).error,'bad_password');
 r=await signup('كريم حسن','01112345678','secret2','ios',false);
 assert.equal(r.ok,true);assert.equal((await q(`SELECT installed_at FROM public.ar_site_users WHERE phone='01112345678'`))[0].installed_at,null,'not installed unless seen in the app');
 assert.equal((await q(`SELECT platform FROM public.ar_site_users WHERE phone='01112345678'`))[0].platform,'ios');
 r=await signup('هالة سمير','01212345678','secret3','weird',false);
 assert.equal((await q(`SELECT platform FROM public.ar_site_users WHERE phone='01212345678'`))[0].platform,null,'an unknown platform name is not kept');

 // ---- signing in: wrong password and unknown mobile look the same; 8 failures lock the mobile for a while; a success clears the count
 assert.equal((await login('01012345678','nope')).error,'bad');
 assert.equal((await login('01555555555','nope')).error,'bad','no account = the same answer');
 assert.equal((await login('123','x')).error,'bad');
 r=await login('0101 234 5678','secret1');assert.equal(r.ok,true);assert.match(r.token,/^[0-9a-f]{64}$/);assert.notEqual(r.token,tokenA,'a new phone gets its own session');
 assert.equal((await q(`SELECT count(*)::int n FROM public.ar_site_attempts WHERE phone='01012345678'`))[0].n,0,'a success clears the failures');
 for(let i=0;i<8;i++)assert.equal((await login('01112345678','wrong'+i)).error,'bad');
 assert.equal((await login('01112345678','secret2')).error,'locked','even the right password waits while locked');
 await db.exec(`UPDATE public.ar_site_attempts SET at = now() - interval '20 minutes' WHERE phone='01112345678'`);
 assert.equal((await login('01112345678','secret2','ios',true)).ok,true,'after the wait it works again');
 assert.ok((await q(`SELECT installed_at FROM public.ar_site_users WHERE phone='01112345678'`))[0].installed_at,'a sign-in inside the installed app marks it installed');

 // ---- every open: the session, the open count (once per 30 minutes), the installed mark
 r=await call('ar_site_me',[tokenA,'open','android',false]);
 assert.equal(r.ok,true);assert.equal(r.user.phone,'01012345678');
 assert.equal((await call('ar_site_me',['f'.repeat(64),'open',null,false])).error,'session');
 assert.equal((await call('ar_site_me',[null,'open',null,false])).error,'session');
 let u=(await q(`SELECT opens FROM public.ar_site_users WHERE phone='01012345678'`))[0];
 const opens0=u.opens;
 await call('ar_site_me',[tokenA,'open','android',false]);
 assert.equal((await q(`SELECT opens FROM public.ar_site_users WHERE phone='01012345678'`))[0].opens,opens0,'two opens within 30 minutes count once');
 await db.exec(`UPDATE public.ar_site_users SET last_seen_at = now() - interval '2 hours' WHERE phone='01012345678'`);
 await call('ar_site_me',[tokenA,'open','android',false]);
 assert.equal((await q(`SELECT opens FROM public.ar_site_users WHERE phone='01012345678'`))[0].opens,opens0+1);
 const tokenK=(await login('01112345678','secret2')).token;
 r=await call('ar_site_me',[tokenK,'installed','ios',false]);
 assert.equal(r.ok,true);
 const kar=(await q(`SELECT installed_at FROM public.ar_site_users WHERE phone='01112345678'`))[0];assert.ok(kar.installed_at,'the install event marks it');
 // logout
 assert.equal((await call('ar_site_logout',[tokenK])).ok,true);
 assert.equal((await call('ar_site_me',[tokenK,'open',null,false])).error,'session','signed out');

 // ---- a customer's link opened inside the installed app
 const ctok='c'.repeat(64);
 await db.exec(`INSERT INTO public.ar_customer_links(customer_id, token, last_seen_at, seen_count) VALUES (101, '${ctok}', now(), 1), (102, '${'d'.repeat(64)}', null, 0)`);
 await call('ar_site_customer_open',[ctok,false]);
 assert.equal((await q(`SELECT installed_at FROM public.ar_customer_links WHERE customer_id=101`))[0].installed_at,null,'opened in the browser: not installed');
 await call('ar_site_customer_open',['short',true]);await call('ar_site_customer_open',[null,true]);
 await call('ar_site_customer_open',[ctok,true]);
 assert.ok((await q(`SELECT installed_at FROM public.ar_customer_links WHERE customer_id=101`))[0].installed_at);
 assert.equal((await q(`SELECT installed_at FROM public.ar_customer_links WHERE customer_id=102`))[0].installed_at,null);

 // ---- the tables are closed to visitors and to the signed-in; the owner-only functions are not callable by a visitor
 for(const role of ['anon','authenticated']){
  await db.exec(`SET ROLE ${role}`);
  for(const t of ['ar_site_users','ar_site_sessions','ar_site_attempts'])await assert.rejects(()=>db.query(`SELECT * FROM public.${t}`),/permission denied/,role+' reads '+t);
  await db.exec('RESET ROLE');
 }
 const can=async(role,sig)=>(await q(`SELECT has_function_privilege('${role}','${sig}','execute') AS ok`))[0].ok;
 for(const sig of ['public.ar_site_signup(text,text,text,text,boolean)','public.ar_site_login(text,text,text,boolean)','public.ar_site_me(text,text,text,boolean)','public.ar_site_logout(text)','public.ar_site_customer_open(text,boolean)'])assert.equal(await can('anon',sig),true,sig+' for a visitor');
 for(const sig of ['public.ar_site_users_stats()','public.ar_site_user_reset(bigint)','public.ar_site_user_delete(bigint)'])assert.equal(await can('anon',sig),false,sig+' not for a visitor');
 assert.equal(await can('anon','public.ar_site_new_session(bigint)'),false);assert.equal(await can('authenticated','public.ar_site_new_session(bigint)'),false);

 // ---- the owner: the numbers and the latest users
 await assert.rejects(()=>call('ar_site_users_stats',[]),/owner only/,'a visitor');
 await db.exec(`SELECT set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000000', false)`);
 await assert.rejects(()=>call('ar_site_users_stats',[]),/owner only/,'another signed-in person');
 await db.exec(`SELECT set_config('test.uid', '${OWNER}', false)`);
 await db.exec(`UPDATE public.ar_site_users SET last_seen_at = now() - interval '40 days', created_at = now() - interval '45 days' WHERE phone='01112345678'`);
 const s=await call('ar_site_users_stats',[]);
 assert.equal(s.ok,true);
 assert.deepEqual(s.users,{total:3,today:2,last7:2,opened_today:2,opened7:2,installed:2,removed:1,android:1,ios:1});
 assert.deepEqual(s.customers,{opened:1,installed:1});
 assert.equal(s.recent.length,3);assert.deepEqual(Object.keys(s.recent[0]).sort(),['created_at','id','installed_at','last_seen_at','name','phone','platform']);
 assert.ok(!JSON.stringify(s).includes('pw_hash'),'no password hash leaves');

 // ---- «نسيت الباسورد»: a new temporary password, the old one stops, the phones are signed out
 const uid=(await q(`SELECT id FROM public.ar_site_users WHERE phone='01012345678'`))[0].id;
 const rs=await call('ar_site_user_reset',[uid]);
 assert.equal(rs.ok,true);assert.match(rs.password,/^[0-9]{6}$/);
 assert.equal((await login('01012345678','secret1')).error,'bad','the old password is dead');
 assert.equal((await login('01012345678',rs.password)).ok,true,'the new one works');
 assert.equal((await call('ar_site_me',[tokenA,'open',null,false])).error,'session','the old phone is signed out');
 assert.equal((await call('ar_site_user_reset',[999999])).error,'no_user');
 // delete removes the user and the sessions
 assert.equal((await call('ar_site_user_delete',[uid])).ok,true);
 assert.equal((await q(`SELECT count(*)::int n FROM public.ar_site_sessions WHERE user_id=${uid}`))[0].n,0);
 assert.equal((await call('ar_site_user_delete',[uid])).ok,false);
 // no more than 100 new accounts an hour
 await db.exec(`INSERT INTO public.ar_site_users(phone,name,pw_hash) SELECT '011' || lpad(g::text, 8, '0'), 'User ' || g, 'x' FROM generate_series(1,100) g`);
 assert.equal((await signup('زائر جديد','01099999999','secret9')).error,'busy','a flood is stopped');
 console.log('site-users-migration ok');
})().catch(e=>{console.error(e);process.exit(1)});
