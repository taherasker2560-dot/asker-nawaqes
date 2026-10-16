// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
 $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE shortage_items(id uuid PRIMARY KEY);
 CREATE TABLE incoming_batches(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 received_on date, supplier text, source_text text, dedupe_key text);
 CREATE TABLE incoming_items(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 batch_id bigint REFERENCES incoming_batches, product_name text, quantity numeric CHECK(quantity>0),
 shortage_item_id uuid REFERENCES shortage_items, match_status text, notes text);
 GRANT USAGE ON SCHEMA public, auth TO authenticated;
 GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO authenticated;
 GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;`);
 await db.exec(fs.readFileSync('supabase/migrations/202610170001_atomic_incoming.sql','utf8'));
 // The migration must also be safe to apply twice.
 await db.exec(fs.readFileSync('supabase/migrations/202610170001_atomic_incoming.sql','utf8'));
 const item={product_name:'صنف اختبار',quantity:2,shortage_item_id:null,match_status:'unmatched',notes:''};
 const save=(key,items=[item])=>db.query(`SELECT save_incoming_batch_atomic($1::date,$2,$3,$4,$5::jsonb) AS receipt`,['2026-10-17',null,'صنف اختبار | 2',key.repeat(64),JSON.stringify(items)]);
 const count=async table=>(await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
 await db.exec('SET ROLE authenticated');
 await assert.rejects(save('a'),/Authentication required/);
 await db.exec(`SET test.uid='11111111-1111-1111-1111-111111111111'`);
 const r=await save('a'); assert.equal(r.rows[0].receipt.items.length,1);
 assert.equal(await count('incoming_batches'),1); assert.equal(await count('incoming_items'),1);
 await assert.rejects(save('a'),/duplicate key/);
 // A later item fails its FK after the batch insert; both new items and the batch must roll back.
 await assert.rejects(save('b',[item,{...item,match_status:'possible',shortage_item_id:'22222222-2222-2222-2222-222222222222'}]),/foreign key/);
 assert.equal(await count('incoming_batches'),1); assert.equal(await count('incoming_items'),1);
 await assert.rejects(save('c',[{...item,quantity:0}]),/Invalid incoming item/);
 await assert.rejects(save('c',[]),/must not be empty/);
 await db.exec(`RESET ROLE; ALTER TABLE incoming_items ENABLE ROW LEVEL SECURITY; SET ROLE authenticated;`);
 await assert.rejects(save('d'),/row-level security/);
 assert.equal(await count('incoming_batches'),1);
 await db.close(); console.log('PASS: success, duplicate rejection, FK rollback, invalid input, RLS rollback, authenticated-only and repeatable migration');
})().catch(e=>{console.error(e);process.exitCode=1});
