// Migration 202611120500 (ar_supplier_rematch): the laptop links list lines to items made after the list was uploaded.
// Runs the migration on an in-memory Postgres. Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const KEY='c'.repeat(64),HASH=crypto.createHash('sha256').update(KEY).digest('hex');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, label text, last_used_at timestamptz);
 CREATE TABLE public.ar_store_items(id bigint PRIMARY KEY, name text NOT NULL);
 CREATE TABLE public.ar_supplier_items(id bigserial PRIMARY KEY, supplier text NOT NULL, supplier_name text NOT NULL, item_id bigint, pharmafly_name text,
   match_status text NOT NULL CHECK (match_status = ANY (ARRAY['strong','good','weak','none'])),
   review text NOT NULL DEFAULT 'pending' CHECK (review = ANY (ARRAY['pending','accepted','rejected','not_stocked'])));`);
 await db.query(`INSERT INTO public.ar_sync_keys(key_hash,label) VALUES ($1,'laptop')`,[HASH]);
 await db.exec(`INSERT INTO public.ar_store_items VALUES (70592,'IMMUONCOSTRA 20 TAB'),(70595,'JOILASK 20 TAB'),(28526,'GALVUS MET 50MG/850MG 30TAB'),(1,'OLD ITEM');
 INSERT INTO public.ar_supplier_items(id,supplier,supplier_name,item_id,pharmafly_name,match_status,review) VALUES
  (1,'NEWCITY','اميونكوسترا ٢٠ قرص',null,null,'none','pending'),
  (2,'REDA','جويلاسك اقراص',28526,'GALVUS MET 50MG/850MG 30TAB','weak','pending'),
  (3,'AMG','اميونكوسترا',1,'OLD ITEM','none','accepted'),
  (4,'AMG','حاجة غلط',null,null,'none','rejected'),
  (5,'ELFATH','صنف كويس',1,'OLD ITEM','good','pending'),
  (6,'ELFATH','مش عندنا',null,null,'none','not_stocked');`);
 const sql=fs.readFileSync('supabase/migrations/202611120500_ar_supplier_rematch.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const send=async(rows,key=KEY)=>(await db.query(`SELECT public.ar_supplier_rematch($1,$2::jsonb) AS r`,[key,JSON.stringify(rows)])).rows[0].r;
 const line=async(id)=>(await db.query(`SELECT item_id::int,pharmafly_name,match_status,review FROM public.ar_supplier_items WHERE id=$1`,[id])).rows[0];
 // an unlinked line and a «ضعيف» one get the new item
 let r=await send([{id:1,item_id:70592,pharmafly_name:'IMMUONCOSTRA 20 TAB',match_status:'strong'},{id:2,item_id:70595,pharmafly_name:'JOILASK 20 TAB',match_status:'strong'}]);
 assert.deepEqual(r,{ok:true,sent:2,changed:2});
 assert.deepEqual(await line(1),{item_id:70592,pharmafly_name:'IMMUONCOSTRA 20 TAB',match_status:'strong',review:'pending'},'still waits for the owner\'s «اقبل القوي»');
 assert.deepEqual(await line(2),{item_id:70595,pharmafly_name:'JOILASK 20 TAB',match_status:'strong',review:'pending'},'GALVUS MET replaced');
 // the same again changes nothing
 assert.equal((await send([{id:1,item_id:70592,pharmafly_name:'IMMUONCOSTRA 20 TAB',match_status:'strong'}])).changed,0);
 // never: an accepted, rejected or «مش عندنا» line, a line already «كويس» on another item, an unknown item, a bad status
 r=await send([{id:3,item_id:70592,match_status:'strong'},{id:4,item_id:70592,match_status:'strong'},{id:6,item_id:70592,match_status:'strong'},
  {id:5,item_id:70592,match_status:'strong'},{id:1,item_id:99999,match_status:'strong'},{id:1,item_id:70595,match_status:'weak'},{id:'x',item_id:70592,match_status:'strong'}]);
 assert.equal(r.changed,0);
 assert.deepEqual(await line(3),{item_id:1,pharmafly_name:'OLD ITEM',match_status:'none',review:'accepted'});
 assert.equal((await line(4)).item_id,null);assert.equal((await line(6)).item_id,null);assert.equal((await line(5)).item_id,1);
 // no name sent: the item's own name
 await db.exec(`UPDATE public.ar_supplier_items SET item_id=null, pharmafly_name=null, match_status='none' WHERE id=1`);
 assert.equal((await send([{id:1,item_id:70592,match_status:'good'}])).changed,1);assert.equal((await line(1)).pharmafly_name,'IMMUONCOSTRA 20 TAB');
 // a wrong key and a too big batch are refused; the key's last use is written
 await assert.rejects(()=>send([],'d'.repeat(64)),/bad key/);
 await assert.rejects(()=>send(Array.from({length:1001},(_,i)=>({id:i+1,item_id:70592,match_status:'strong'}))),/batch too big/);
 assert.ok((await db.query(`SELECT last_used_at FROM public.ar_sync_keys`)).rows[0].last_used_at);
 console.log('supplier-rematch ok');
})().catch(e=>{console.error(e);process.exit(1)});
