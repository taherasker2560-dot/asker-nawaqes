// Migration 202611190100 (owner 2026-11-19: «عملاء التوصيل» in PharmaFly = cards with the delivery-customer flag; they phone, someone of theirs collects the order; kept APART from
// the credit customers): ar_customers.kind and ar_customer_kinds_sync, run for real on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// Made-up customers only: the repository is public.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const KEY='c'.repeat(64),HASH=crypto.createHash('sha256').update(KEY).digest('hex');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ select null::uuid $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, label text, last_used_at timestamptz);`);
 await db.query(`INSERT INTO public.ar_sync_keys(key_hash,label) VALUES ($1,'laptop')`,[HASH]);
 await db.exec(fs.readFileSync('supabase/migrations/202611121000_ar_customer_accounts.sql','utf8'));
 const sql=fs.readFileSync('supabase/migrations/202611190100_ar_customer_kind.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const sync=async(c)=>(await db.query(`SELECT public.ar_customers_sync($1,$2::jsonb,'[]'::jsonb,'[]'::jsonb) AS r`,[KEY,JSON.stringify(c)])).rows[0].r;
 const kinds=async(ids,key=KEY)=>(await db.query(`SELECT public.ar_customer_kinds_sync($1,$2::jsonb) AS r`,[key,JSON.stringify(ids)])).rows[0].r;
 const kindOf=async()=>Object.fromEntries((await db.query(`SELECT id::int, kind FROM public.ar_customers ORDER BY id`)).rows.map(r=>[r.id,r.kind]));
 // a customer is a credit customer until the laptop says otherwise; the ordinary sync (which does not know kinds) never changes it
 await sync([{id:9001,name:'عميل أجل',credit_limit:5000,balance:100},{id:9002,name:'عميل توصيل',credit_limit:0,balance:0},{id:9003,name:'عميل أجل تاني',credit_limit:null,balance:-5}]);
 assert.deepEqual(await kindOf(),{9001:'credit',9002:'credit',9003:'credit'});
 assert.deepEqual(await kinds([9002]),{ok:true,pickup:1,to_pickup:1,to_credit:0});
 assert.deepEqual(await kindOf(),{9001:'credit',9002:'pickup',9003:'credit'});
 await sync([{id:9002,name:'عميل توصيل',credit_limit:0,balance:350,last_at:'2026-11-19T10:00:00',last_kind:'sale',moves:1}]);
 assert.equal((await kindOf())[9002],'pickup','a later ordinary sync keeps the kind');
 // the whole list each time: the same list changes nothing; a customer who leaves the list is a credit customer again; ids that are not customers are ignored
 assert.deepEqual(await kinds([9002]),{ok:true,pickup:1,to_pickup:0,to_credit:0});
 assert.deepEqual(await kinds([9003,777,'abc',null]),{ok:true,pickup:2,to_pickup:1,to_credit:1});
 assert.deepEqual(await kindOf(),{9001:'credit',9002:'credit',9003:'pickup'});
 assert.deepEqual(await kinds([]),{ok:true,pickup:0,to_pickup:0,to_credit:1});
 assert.deepEqual(await kindOf(),{9001:'credit',9002:'credit',9003:'credit'});
 // a wrong key, a bad shape and a too long list are refused; nothing changes
 await assert.rejects(()=>kinds([9001],'d'.repeat(64)),/bad key/);
 await assert.rejects(()=>kinds([9001],'short'),/bad key/);
 await assert.rejects(()=>db.query(`SELECT public.ar_customer_kinds_sync($1,'{"a":1}'::jsonb)`,[KEY]),/must be an array/);
 await assert.rejects(()=>kinds(Array.from({length:2001},(_,i)=>i+1)),/too many/);
 assert.deepEqual(await kindOf(),{9001:'credit',9002:'credit',9003:'credit'});
 // only the two kinds exist
 await assert.rejects(()=>db.query(`UPDATE public.ar_customers SET kind='vip' WHERE id=9001`),/check/);
 // still readable by the owner only (the policy of the table is unchanged)
 const pol=(await db.query(`SELECT cmd,qual FROM pg_policies WHERE tablename='ar_customers'`)).rows;
 assert.equal(pol.length,1);assert.equal(pol[0].cmd,'SELECT');assert.match(pol[0].qual,/ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c/);
 console.log('customer-kind-migration ok');
})().catch(e=>{console.error(e);process.exit(1)});
