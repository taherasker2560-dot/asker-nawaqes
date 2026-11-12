// Migration 202611121000 (ar_customers + ar_customer_moves): customers' accounts sent by the laptop with its sync key.
// Runs the migration on an in-memory Postgres. Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
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
 const sql=fs.readFileSync('supabase/migrations/202611121000_ar_customer_accounts.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const sync=async(c,m,g,key=KEY)=>(await db.query(`SELECT public.ar_customers_sync($1,$2::jsonb,$3::jsonb,$4::jsonb) AS r`,[key,JSON.stringify(c||[]),JSON.stringify(m||[]),JSON.stringify(g||[])])).rows[0].r;
 const custs=async()=>(await db.query(`SELECT id::int,name,credit_limit::float,balance::float,last_at::text,last_kind,moves FROM public.ar_customers ORDER BY id`)).rows;
 const moves=async()=>(await db.query(`SELECT id::int,customer_id::int,at::text,kind,total::float,paid::float,balance::float,items FROM public.ar_customer_moves ORDER BY id`)).rows;
 // first upload: two customers, a sale with its lines, a payment, an old payment from CashFlow (negative id)
 let r=await sync(
  [{id:9001,name:'عميل تجربة',credit_limit:5000,balance:1250.5,last_at:'2026-11-11T22:33:10',last_kind:'sale',moves:3},{id:9002,name:'TEST CUSTOMER',credit_limit:null,balance:-200,last_at:'2026-11-01T10:00:00',last_kind:'payment',moves:1}],
  [{id:500,customer_id:9001,at:'2026-11-10T10:00:00',kind:'payment',total:0,paid:1000,balance:-50},
   {id:501,customer_id:9001,at:'2026-11-11T22:33:10',kind:'sale',total:1300.5,paid:0,balance:1250.5,items:[{n:'ITEM A',p:1,u:0,k:1,s:1000,d:0},{n:'ITEM B',p:0,u:1,k:2,s:601,d:0}]},
   {id:-77,customer_id:9001,at:'2020-03-01T12:00:00',kind:'payment',total:0,paid:300,balance:0},
   {id:600,customer_id:9002,at:'2026-11-01T10:00:00',kind:'payment',total:0,paid:200,balance:-200}]);
 assert.deepEqual(r,{ok:true,customers:2,moves:4,gone:0});
 assert.deepEqual(await custs(),[{id:9001,name:'عميل تجربة',credit_limit:5000,balance:1250.5,last_at:'2026-11-11 22:33:10',last_kind:'sale',moves:3},{id:9002,name:'TEST CUSTOMER',credit_limit:null,balance:-200,last_at:'2026-11-01 10:00:00',last_kind:'payment',moves:1}]);
 const m=await moves();
 assert.equal(m.length,4);
 assert.deepEqual(m.find(x=>x.id===501).items,[{n:'ITEM A',p:1,u:0,k:1,s:1000,d:0},{n:'ITEM B',p:0,u:1,k:2,s:601,d:0}]);
 assert.equal(m.find(x=>x.id===-77).at,'2020-03-01 12:00:00','an old CashFlow payment keeps its negative id');
 // the same rows again change nothing; a changed balance changes only that row
 r=await sync([{id:9001,name:'عميل تجربة',credit_limit:5000,balance:1250.5,last_at:'2026-11-11T22:33:10',last_kind:'sale',moves:3}],[{id:500,customer_id:9001,at:'2026-11-10T10:00:00',kind:'payment',total:0,paid:1000,balance:-50}]);
 assert.deepEqual(r,{ok:true,customers:0,moves:0,gone:0});
 r=await sync([{id:9001,name:'عميل تجربة',credit_limit:5000,balance:1500,last_at:'2026-11-12T09:00:00',last_kind:'sale',moves:4}],[{id:502,customer_id:9001,at:'2026-11-12T09:00:00',kind:'sale',total:249.5,paid:0,balance:1500,items:[]}]);
 assert.deepEqual(r,{ok:true,customers:1,moves:1,gone:0});
 assert.equal((await custs())[0].balance,1500);
 // a ticket deleted in PharmaFly goes away after the laptop's full check
 r=await sync([],[],[502,'x']);
 assert.equal(r.gone,1);assert.equal((await moves()).some(x=>x.id===502),false);
 // bad rows are skipped, not stored
 r=await sync([{id:'x',name:'A'},{id:9003,name:''}],[{id:700,customer_id:9001,at:'11/11/2026',kind:'sale'},{id:701,customer_id:9001,at:'2026-11-11T10:00:00',kind:'gift'},{id:702,customer_id:9001,at:'2026-11-11T10:00:00',kind:'sale',total:'abc',items:'no'}]);
 assert.deepEqual(r,{ok:true,customers:0,moves:1,gone:0});
 const bad=(await moves()).find(x=>x.id===702);assert.equal(bad.total,0);assert.equal(bad.items,null);
 // a wrong key and a too big batch are refused
 await assert.rejects(()=>sync([],[],[],'d'.repeat(64)),/bad key/);
 await assert.rejects(()=>sync([],Array.from({length:5001},(_,i)=>({id:i,customer_id:1,at:'2026-11-12T00:00:00',kind:'sale'}))),/batch too big/);
 await assert.rejects(()=>sync([],[],Array.from({length:2001},(_,i)=>i)),/too many gone/);
 // nobody but the owner reads the tables (row level security on, a select policy for the owner only)
 const pol=(await db.query(`SELECT tablename,cmd,qual FROM pg_policies WHERE tablename IN ('ar_customers','ar_customer_moves') ORDER BY tablename`)).rows;
 assert.equal(pol.length,2);pol.forEach(p=>{assert.equal(p.cmd,'SELECT');assert.match(p.qual,/ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c/)});
 const rls=(await db.query(`SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('ar_customers','ar_customer_moves')`)).rows;
 assert.ok(rls.length===2&&rls.every(x=>x.relrowsecurity));
 console.log('customers-sync ok');
})().catch(e=>{console.error(e);process.exit(1)});
