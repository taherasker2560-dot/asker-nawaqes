// «الطلبيات»: what the owner typed as an item's quantity is remembered (migration 202611152300 on an in-memory Postgres): one row per
// item (the last number), a number of 1 or more, the owner only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611152300_ar_order_qty.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',OTHER='11111111-1111-1111-1111-111111111111';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated; GRANT SELECT, INSERT, UPDATE ON public.ar_order_qty TO authenticated;`);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const as=async(uid,fn)=>{await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false)`);try{return await fn()}finally{await db.exec(`reset role`)}};
 // the owner upserts the way the page does: the last number wins
 const up=(id,q,sug)=>as(OWNER,()=>db.query(`insert into public.ar_order_qty(item_id,item_name,qty,suggested,supplier) values ($1,'ITEM',$2,$3,'NEWCITY') on conflict (item_id) do update set qty=excluded.qty, suggested=excluded.suggested, supplier=excluded.supplier, updated_at=now()`,[id,q,sug]));
 await up(11,5,23);await up(11,9,23);await up(12,2,3);
 assert.deepEqual((await one(`select qty, suggested from public.ar_order_qty where item_id=11`)),{qty:9,suggested:23});
 assert.equal((await one(`select count(*)::int c from public.ar_order_qty`)).c,2,'one row per item');
 // 0, negative and huge numbers are refused
 for(const bad of [0,-3,100001])await assert.rejects(()=>up(13,bad,1),/check|violates/i);
 await assert.rejects(()=>as(OWNER,()=>db.query(`insert into public.ar_order_qty(item_id,qty) values (0,1)`)),/check|violates/i);
 // nobody else reads, adds or changes
 assert.deepEqual((await as(OTHER,()=>db.query(`select count(*)::int c from public.ar_order_qty`))).rows[0],{c:0});
 assert.deepEqual((await as('',()=>db.query(`select count(*)::int c from public.ar_order_qty`))).rows[0],{c:0});
 await assert.rejects(()=>as(OTHER,()=>db.query(`insert into public.ar_order_qty(item_id,qty) values (99,1)`)),/row-level security/i);
 await as(OTHER,()=>db.query(`update public.ar_order_qty set qty=77`));
 assert.equal((await one(`select count(*)::int c from public.ar_order_qty where qty=77`)).c,0,'a stranger changes nothing');
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate/i);
 assert.doesNotMatch(sql,/using \(auth\.uid\(\)/,'policies use (select auth.uid())');
 console.log('PASS: order qty migration: the last number per item, 1 or more, owner only');
})().catch((e)=>{console.error(e);process.exit(1)});
