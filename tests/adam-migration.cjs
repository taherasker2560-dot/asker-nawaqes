// Migration 202611150100: «آدم», the voice assistant's queue. Runs on an in-memory Postgres as the anonymous role (the phone and
// the laptop call the functions with the public key + their own device key). Made-up keys, customers and words only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',OTHER='00000000-0000-4000-8000-0000000000e1';
const sha=(k)=>crypto.createHash('sha256').update(k).digest('hex');
const PHONE='a'.repeat(64),LAPTOP='b'.repeat(64),WRONG='c'.repeat(64);
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
 CREATE TABLE public.ar_customers(id bigint primary key, name text);
 CREATE TABLE public.ar_customer_stops(customer_id bigint primary key, stopped_at timestamptz not null default now(), stopped_by uuid default auth.uid());
 INSERT INTO public.ar_customers VALUES (7,'عميل تجربة'),(8,'عميل تاني');`);
 const sql=fs.readFileSync('supabase/migrations/202611150100_ar_adam.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public TO anon, authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
 INSERT INTO public.ar_adam_keys(key_hash,role,label) VALUES ('${sha(PHONE)}','phone','test phone'),('${sha(LAPTOP)}','laptop','test laptop');`);
 const as=async(role,uid,q,params)=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid||''}',false); SET ROLE ${role};`);try{return (await db.query(q,params)).rows}finally{await db.exec('RESET ROLE')}};
 const rpc=async(name,args)=>{const ph=args.map((_,i)=>'$'+(i+1)).join(',');const r=await as('anon','',`SELECT public.${name}(${ph}) AS r`,args);return r[0].r};
 const askP=(body,convo='c1',confirmOf=null,answer=null)=>rpc('ar_adam_ask',[PHONE,convo,body,confirmOf,answer]);

 // keys: the phone key asks, the laptop key works; a wrong key, or the other role's key, gets nothing
 assert.equal((await rpc('ar_adam_ask',[WRONG,'c1','x',null,null])).error,'key');
 assert.equal((await rpc('ar_adam_ask',[LAPTOP,'c1','x',null,null])).error,'key','the laptop key cannot ask');
 assert.equal((await rpc('ar_adam_claim',[PHONE])).error,'key','the phone key cannot take requests');
 assert.equal((await rpc('ar_adam_claim',[WRONG])).error,'key');
 assert.equal((await rpc('ar_adam_get',[LAPTOP,1])).error,'key');
 assert.equal((await rpc('ar_adam_ask',['short','c1','x',null,null])).error,'key');
 assert.equal((await askP('   ')).error,'empty');
 // nobody can read the tables or the key list as anon; only the owner reads them
 await assert.rejects(()=>as('anon','',`SELECT * FROM public.ar_adam_keys`),/permission denied/);
 await assert.rejects(()=>as('anon','',`SELECT * FROM public.ar_adam_requests`),/permission denied/);
 await assert.rejects(()=>as('anon','',`SELECT public.ar_adam_role('${PHONE}')`),/permission denied/);

 // the laptop never asked yet: the phone is told (it says «اللاب مقفول»)
 const a1=await askP('هات سعر البانادول');
 assert.equal(a1.ok,true);assert.equal(a1.laptop_ok,false);
 assert.equal((await rpc('ar_adam_get',[PHONE,a1.id])).status,'new');
 // the laptop takes it (and shows it is awake), once
 const c1=await rpc('ar_adam_claim',[LAPTOP]);
 assert.equal(c1.id,a1.id);assert.equal(c1.body,'هات سعر البانادول');assert.deepEqual(c1.history,[]);
 assert.equal(await rpc('ar_adam_claim',[LAPTOP]),null,'nothing else waiting');
 assert.equal((await askP('تاني')).laptop_ok,true,'the laptop asked a moment ago');
 assert.equal((await rpc('ar_adam_get',[PHONE,a1.id])).status,'working');
 // a reply for a request it does not hold is refused; the right one is stored
 assert.equal((await rpc('ar_adam_answer',[PHONE,a1.id,true,'{}'])).error,'key');
 const reply1={speak:'بانادول بـ 75',show:'سعر 75',do_now:[],open:null,confirm:null};
 assert.equal((await rpc('ar_adam_answer',[LAPTOP,a1.id,true,JSON.stringify(reply1)])).ok,true);
 assert.equal((await rpc('ar_adam_answer',[LAPTOP,a1.id,true,JSON.stringify(reply1)])).ok,false,'only once');
 const g1=await rpc('ar_adam_get',[PHONE,a1.id]);
 assert.equal(g1.status,'done');assert.equal(g1.reply.speak,'بانادول بـ 75');

 // the conversation: the next request of the same conversation carries what was said before (follow-ups work); another one does not
 const c2=await rpc('ar_adam_claim',[LAPTOP]);assert.equal(c2.body,'تاني');
 assert.deepEqual(c2.history,[{q:'هات سعر البانادول',speak:'بانادول بـ 75',show:'سعر 75'}]);
 await rpc('ar_adam_answer',[LAPTOP,c2.id,true,JSON.stringify({speak:'ok',show:'ok'})]);
 const other=await askP('سؤال تاني خالص','c2');const co=await rpc('ar_adam_claim',[LAPTOP]);
 assert.equal(co.id,other.id);assert.deepEqual(co.history,[]);
 await rpc('ar_adam_answer',[LAPTOP,co.id,true,JSON.stringify({speak:'ok2'})]);

 // THE GATE. The brain proposes a change; nothing changes until the owner's spoken yes creates a confirm request.
 const s1=await askP('وقّف الآجل عن عميل تجربة');const k1=await rpc('ar_adam_claim',[LAPTOP]);
 const proposal={speak:'هوقّف الآجل عن عميل تجربة. أوقّف؟',show:'وقف الآجل',confirm:{say:'هوقّف الآجل عن عميل تجربة. أوقّف؟',do:[{type:'stop_credit',customer_id:7}],done_say:'اتوقّف'}};
 // asking the server to do it now, before any confirmation, is refused
 assert.equal((await rpc('ar_adam_do',[LAPTOP,k1.id,'stop_credit',JSON.stringify({customer_id:7})])).error,'not_confirmed');
 await rpc('ar_adam_answer',[LAPTOP,k1.id,true,JSON.stringify(proposal)]);
 assert.equal((await as('authenticated',OWNER,`SELECT count(*)::int n FROM public.ar_customer_stops`))[0].n,0);
 // a confirmation of a request that never asked, of another conversation, or with a bad answer is refused
 assert.equal((await askP('أيوه','c1',a1.id,'yes')).error,'no_pending','that request asked nothing');
 assert.equal((await askP('أيوه','c9',k1.id,'yes')).error,'no_pending','other conversation');
 assert.equal((await askP('أيوه','c1',k1.id,'maybe')).error,'answer');
 assert.equal((await askP('أيوه','c1',99999,'yes')).error,'no_pending');
 // «أيوه»: a confirm request, taken by the laptop with the proposal attached; ar_adam_do works only inside it, only for its customer rows
 const y=await askP('أيوه','c1',k1.id,'yes');assert.equal(y.ok,true);
 assert.equal((await askP('أيوه تاني','c1',k1.id,'yes')).error,'no_pending','a proposal is confirmed once');
 assert.equal((await rpc('ar_adam_do',[LAPTOP,y.id,'stop_credit',JSON.stringify({customer_id:7})])).error,'not_confirmed','not taken yet: still waiting');
 const cy=await rpc('ar_adam_claim',[LAPTOP]);
 assert.equal(cy.id,y.id);assert.equal(cy.answer,'yes');assert.deepEqual(cy.confirm.do,[{type:'stop_credit',customer_id:7}]);
 assert.equal((await rpc('ar_adam_do',[PHONE,y.id,'stop_credit',JSON.stringify({customer_id:7})])).error,'key');
 assert.equal((await rpc('ar_adam_do',[LAPTOP,y.id,'stop_credit',JSON.stringify({customer_id:999})])).error,'no_customer');
 assert.equal((await rpc('ar_adam_do',[LAPTOP,y.id,'stop_credit',JSON.stringify({customer_id:'x'})])).error,'customer');
 assert.equal((await rpc('ar_adam_do',[LAPTOP,y.id,'drop_table',JSON.stringify({})])).error,'unknown_action');
 assert.equal((await rpc('ar_adam_do',[LAPTOP,y.id,'stop_credit',JSON.stringify({customer_id:7})])).ok,true);
 assert.deepEqual((await as('authenticated',OWNER,`SELECT customer_id::int c FROM public.ar_customer_stops`)).map(r=>r.c),[7]);
 // a plain request (not a confirmation) can never run it
 assert.equal((await rpc('ar_adam_do',[LAPTOP,k1.id,'allow_credit',JSON.stringify({customer_id:7})])).error,'not_confirmed');
 await rpc('ar_adam_answer',[LAPTOP,y.id,true,JSON.stringify({speak:'اتوقّف',show:'اتوقّف'})]);
 // the owner can undo it the same way (and a done confirm request is no longer «working»: no second change from it)
 assert.equal((await rpc('ar_adam_do',[LAPTOP,y.id,'allow_credit',JSON.stringify({customer_id:7})])).error,'not_confirmed');
 // «لا»: answered by the server itself, nothing is queued for the brain, nothing changes
 const s2=await askP('وقّف الآجل عن عميل تاني');const k2=await rpc('ar_adam_claim',[LAPTOP]);
 await rpc('ar_adam_answer',[LAPTOP,k2.id,true,JSON.stringify({speak:'أوقّف؟',confirm:{say:'أوقّف؟',do:[{type:'stop_credit',customer_id:8}]}})]);
 const n=await askP('لا','c1',k2.id,'no');assert.equal(n.ok,true);
 const gn=await rpc('ar_adam_get',[PHONE,n.id]);assert.equal(gn.status,'done');assert.equal(gn.reply.speak,'تمام، ماعملتش حاجة');
 assert.equal(await rpc('ar_adam_claim',[LAPTOP]),null);
 assert.deepEqual((await as('authenticated',OWNER,`SELECT customer_id::int c FROM public.ar_customer_stops`)).map(r=>r.c),[7],'the second customer was not stopped');
 // a proposal older than 5 minutes is gone
 await db.exec(`UPDATE public.ar_adam_requests SET done_at = now() - interval '6 minutes' WHERE id = ${k2.id}`);
 assert.equal((await askP('أيوه','c1',k2.id,'yes')).error,'no_pending');

 // a request stuck «working» comes back once, then ends with an apology; one that waited 3 hours ends quietly
 const w=await askP('بطيء');await rpc('ar_adam_claim',[LAPTOP]);
 await db.exec(`UPDATE public.ar_adam_requests SET picked_at = now() - interval '5 minutes' WHERE id = ${w.id}`);
 const again=await rpc('ar_adam_claim',[LAPTOP]);assert.equal(again.id,w.id,'back in the queue');
 await db.exec(`UPDATE public.ar_adam_requests SET picked_at = now() - interval '5 minutes' WHERE id = ${w.id}`);
 assert.equal(await rpc('ar_adam_claim',[LAPTOP]),null);
 const gw=await rpc('ar_adam_get',[PHONE,w.id]);assert.equal(gw.status,'error');assert.match(gw.reply.speak,/مشكلة/);
 const old=await askP('قديم');await db.exec(`UPDATE public.ar_adam_requests SET created_at = now() - interval '4 hours' WHERE id = ${old.id}`);
 assert.equal(await rpc('ar_adam_claim',[LAPTOP]),null);assert.equal((await rpc('ar_adam_get',[PHONE,old.id])).status,'error');
 // week-old rows are removed by the laptop's next call
 await db.exec(`UPDATE public.ar_adam_requests SET created_at = now() - interval '8 days' WHERE id = ${a1.id}`);
 await rpc('ar_adam_claim',[LAPTOP]);
 assert.equal((await as('authenticated',OWNER,`SELECT count(*)::int n FROM public.ar_adam_requests WHERE id = ${a1.id}`))[0].n,0);

 // only the owner reads the requests and the keys; another signed-in person sees nothing
 assert.ok((await as('authenticated',OWNER,`SELECT count(*)::int n FROM public.ar_adam_requests`))[0].n>0);
 assert.equal((await as('authenticated',OWNER,`SELECT count(*)::int n FROM public.ar_adam_keys`))[0].n,2);
 assert.equal((await as('authenticated',OTHER,`SELECT count(*)::int n FROM public.ar_adam_requests`))[0].n,0);
 assert.equal((await as('authenticated',OTHER,`SELECT count(*)::int n FROM public.ar_adam_keys`))[0].n,0);
 // the rate limit: 20 requests in a minute, then it says so
 let last;for(let i=0;i<25;i++)last=await askP('زحمة '+i,'c5');
 assert.equal(last.error,'rate');
 console.log('PASS: adam: device keys by role, the queue, history per conversation, the confirmation gate (nothing changes before a spoken yes), timeouts, owner-only tables');
})().catch(e=>{console.error(e);process.exit(1)});
