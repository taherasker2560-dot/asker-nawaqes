// Migration 202611170400 (owner 2026-11-17): the owner's «👁 شوف صفحته» look at a customer's page must not count as the customer opening his link.
// Runs the migration on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package) over a small copy of the tables the
// function reads; the old four-argument function is there first, as on the server.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE public.ar_customers(id bigint PRIMARY KEY, name text, balance numeric);
 CREATE TABLE public.ar_customer_links(customer_id bigint PRIMARY KEY, token text NOT NULL UNIQUE, created_at timestamptz DEFAULT now(), last_seen_at timestamptz, seen_count int NOT NULL DEFAULT 0);
 CREATE TABLE public.ar_customer_moves(id bigint, customer_id bigint, at timestamp, kind text, total numeric, paid numeric, balance numeric, items jsonb);
 CREATE TABLE public.ar_customer_stops(customer_id bigint PRIMARY KEY);
 CREATE TABLE public.ar_customer_phones(customer_id bigint, phone text, updated_at timestamptz DEFAULT now());
 CREATE TABLE public.ar_sync_log(id bigserial PRIMARY KEY, at timestamptz DEFAULT now());
 INSERT INTO public.ar_sync_log DEFAULT VALUES;
 INSERT INTO public.ar_customers VALUES (101,'أحمد محمود',1250);
 INSERT INTO public.ar_customer_links(customer_id, token) VALUES (101, '${'c'.repeat(64)}');
 INSERT INTO public.ar_customer_moves VALUES (11,101,now()::timestamp,'sale',450,0,1250,null);
 -- the function as it was before (four arguments)
 CREATE FUNCTION public.ar_customer_view(p_token text, p_before_at timestamp DEFAULT NULL, p_before_id bigint DEFAULT NULL, p_limit integer DEFAULT 100) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"old":true}'::jsonb $$;`);
 const sql=fs.readFileSync('supabase/migrations/202611170400_ar_customer_view_preview.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const tok='c'.repeat(64);
 const q=async(text,p)=>(await db.query(text,p)).rows;
 const seen=async()=>(await q(`SELECT last_seen_at, seen_count FROM public.ar_customer_links WHERE customer_id=101`))[0];
 // only one function is left (no overload that would make a named call ambiguous)
 assert.equal((await q(`SELECT count(*)::int n FROM pg_proc WHERE proname='ar_customer_view' AND pronamespace='public'::regnamespace`))[0].n,1);
 // the owner's look: the answer is the customer's own page, and nothing is stamped
 let r=(await q(`SELECT public.ar_customer_view($1, null, null, 100, true) AS r`,[tok]))[0].r;
 assert.equal(r.ok,true);assert.equal(r.customer.name,'أحمد محمود');assert.equal(Number(r.customer.balance),1250);assert.equal(r.moves.length,1);
 assert.deepEqual(await seen(),{last_seen_at:null,seen_count:0},'a look is not «فتح رابطه»');
 // the customer himself (no preview argument at all, as before the change): stamped once, then not again within 5 minutes
 r=(await q(`SELECT public.ar_customer_view($1) AS r`,[tok]))[0].r;assert.equal(r.ok,true);
 let s=await seen();assert.ok(s.last_seen_at);assert.equal(s.seen_count,1);
 await q(`SELECT public.ar_customer_view($1) AS r`,[tok]);assert.equal((await seen()).seen_count,1,'within 5 minutes: counted once');
 // preview false said out loud = the customer
 await db.exec(`UPDATE public.ar_customer_links SET last_seen_at = now() - interval '10 minutes' WHERE customer_id=101`);
 await q(`SELECT public.ar_customer_view($1, null, null, 100, false) AS r`,[tok]);assert.equal((await seen()).seen_count,2);
 // a look after that does not move it
 const before=(await seen()).last_seen_at;
 await db.exec(`UPDATE public.ar_customer_links SET last_seen_at = now() - interval '10 minutes' WHERE customer_id=101`);
 const mid=(await seen());
 await q(`SELECT public.ar_customer_view($1, null, null, 100, true) AS r`,[tok]);
 assert.deepEqual(await seen(),mid,'a look leaves the last time he really opened it as it was');
 // the checks stay: a wrong or missing secret gets nothing, the page after the first one is never stamped
 assert.equal((await q(`SELECT public.ar_customer_view($1, null, null, 100, true) AS r`,['f'.repeat(64)]))[0].r.error,'link');
 assert.equal((await q(`SELECT public.ar_customer_view($1) AS r`,[null]))[0].r.error,'link');
 assert.equal((await q(`SELECT public.ar_customer_view($1, null, null, 100, null) AS r`,[tok]))[0].r.ok,true,'a null flag is a customer, not a crash');
 // grants: visitors and the signed-in can call it, nothing is public
 const can=async(role)=>(await q(`SELECT has_function_privilege('${role}','public.ar_customer_view(text,timestamp,bigint,integer,boolean)','execute') AS ok`))[0].ok;
 assert.equal(await can('anon'),true);assert.equal(await can('authenticated'),true);
 assert.equal((await q(`SELECT has_function_privilege('public','public.ar_customer_view(text,timestamp,bigint,integer,boolean)','execute') AS ok`))[0].ok,false);
 void before;
 console.log('customer-view-preview-migration ok');
})().catch(e=>{console.error(e);process.exit(1)});
