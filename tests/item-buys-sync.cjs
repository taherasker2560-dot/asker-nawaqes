// Migration 202611120300 (ar_item_buys): the last real purchase per item per supplier, sent by the laptop with its sync key.
// Runs the migration on an in-memory Postgres. Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
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
 const sql=fs.readFileSync('supabase/migrations/202611120300_ar_item_buys.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const sync=async(rows,key=KEY)=>(await db.query(`SELECT public.ar_item_buys_sync($1,$2::jsonb) AS r`,[key,JSON.stringify(rows)])).rows[0].r;
 const all=async()=>(await db.query(`SELECT item_id::int,supplier,last_date::text,discount_pct::float,bonus::float,packs::float FROM public.ar_item_buys ORDER BY item_id,supplier`)).rows;
 // first upload
 let r=await sync([{item_id:70592,supplier:'AMG',last_date:'2026-11-11',discount_pct:26.4,bonus:0,packs:3},{item_id:70592,supplier:'REDA',last_date:'2026-10-05',discount_pct:22,bonus:1,packs:5},{item_id:101,supplier:'RAMA',last_date:'2026-11-10',discount_pct:14,packs:10}]);
 assert.deepEqual(r,{ok:true,batch:3,upserted:3});
 assert.deepEqual(await all(),[{item_id:101,supplier:'RAMA',last_date:'2026-11-10',discount_pct:14,bonus:0,packs:10},{item_id:70592,supplier:'AMG',last_date:'2026-11-11',discount_pct:26.4,bonus:0,packs:3},{item_id:70592,supplier:'REDA',last_date:'2026-10-05',discount_pct:22,bonus:1,packs:5}]);
 // a newer purchase replaces the row; the same row again changes nothing
 r=await sync([{item_id:70592,supplier:'AMG',last_date:'2026-11-12',discount_pct:27,bonus:0,packs:2},{item_id:70592,supplier:'REDA',last_date:'2026-10-05',discount_pct:22,bonus:1,packs:5}]);
 assert.equal(r.upserted,1,'only the changed row counts');
 assert.equal((await all()).find(x=>x.supplier==='AMG').last_date,'2026-11-12');
 // bad rows are skipped, not stored; a discount out of range is kept empty
 r=await sync([{item_id:'x',supplier:'AMG',last_date:'2026-11-12'},{item_id:5,supplier:'',last_date:'2026-11-12'},{item_id:6,supplier:'AMG',last_date:'12/11/2026'},{item_id:7,supplier:'AMG',last_date:'2026-11-12',discount_pct:500}]);
 assert.equal(r.upserted,1);assert.equal((await all()).find(x=>x.item_id===7).discount_pct,null);
 // a wrong key and a too big batch are refused
 await assert.rejects(()=>sync([],'d'.repeat(64)),/bad key/);
 await assert.rejects(()=>sync(Array.from({length:5001},(_,i)=>({item_id:i,supplier:'AMG',last_date:'2026-11-12'}))),/batch too big/);
 // the key's last use is written
 assert.ok((await db.query(`SELECT last_used_at FROM public.ar_sync_keys`)).rows[0].last_used_at);
 console.log('item-buys-sync ok');
})().catch(e=>{console.error(e);process.exit(1)});
