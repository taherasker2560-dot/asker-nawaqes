const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('supabase/migrations/20261016_atomic_incoming.sql','utf8');
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';

// Representative schema, NOT a dump of the production database.
async function fixture(){
  const db=new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
    CREATE TABLE public.shortage_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL DEFAULT auth.uid(),
      product_name text NOT NULL,is_active boolean NOT NULL DEFAULT true
    );
    CREATE TABLE public.incoming_batches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL DEFAULT auth.uid(),received_on date NOT NULL,
      supplier text,source_text text NOT NULL,dedupe_key text
    );
    CREATE TABLE public.incoming_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL DEFAULT auth.uid(),
      batch_id uuid NOT NULL REFERENCES incoming_batches(id),
      product_name text NOT NULL,
      quantity numeric NOT NULL CHECK(quantity > 0 AND quantity < 1000000),
      shortage_item_id uuid REFERENCES shortage_items(id),
      match_status text NOT NULL,notes text
    );
    ALTER TABLE shortage_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE incoming_batches ENABLE ROW LEVEL SECURITY;
    ALTER TABLE incoming_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_rows ON shortage_items TO authenticated
      USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
    CREATE POLICY own_rows ON incoming_batches TO authenticated
      USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
    CREATE POLICY own_rows ON incoming_items TO authenticated
      USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
    GRANT SELECT,INSERT ON shortage_items,incoming_batches,incoming_items TO authenticated;
    INSERT INTO shortage_items(id,user_id,product_name) VALUES
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${owner}','Example'),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${other}','Other account');
  `);
  await db.exec(migration);
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${owner}'`);
  return db;
}
const item=(extra={})=>({product_name:'Test product',quantity:2,shortage_item_id:null,match_status:'unmatched',notes:'test',...extra});
async function save(db,items=[item()],key='a'.repeat(64)){
  return (await db.query(`SELECT public.save_incoming_batch_atomic($1::date,$2,$3,$4,$5::jsonb) AS result`,
    ['2026-10-16','Test supplier','Test product | 2',key,JSON.stringify(items)])).rows[0].result;
}
async function counts(db){
  return (await db.query(`SELECT (SELECT count(*)::int FROM incoming_batches) AS batches,
    (SELECT count(*)::int FROM incoming_items) AS items`)).rows[0];
}

test('atomic RPC with real local PostgreSQL execution',async t=>{
  const db=await fixture();
  try{
    await t.test('saves batch and all match states, preserving ownership defaults',async()=>{
      const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const r=await save(db,[item({match_status:'matched',shortage_item_id:id}),
        item({match_status:'possible',shortage_item_id:id}),item()]);
      assert.ok(r.batch_id);assert.equal(r.items.length,3);
      assert.deepEqual(r.items.map(x=>x.match_status).sort(),['matched','possible','unmatched']);
      assert.deepEqual(await counts(db),{batches:1,items:3});
      const users=(await db.query('SELECT DISTINCT user_id FROM incoming_items')).rows;
      assert.deepEqual(users,[{user_id:owner}]);
    });
    await t.test('late item constraint failure rolls back batch and every item',async()=>{
      await assert.rejects(save(db,[item(),item({quantity:1000000})],'b'.repeat(64)),/check constraint/);
      assert.deepEqual(await counts(db),{batches:1,items:3});
    });
    await t.test('database unique index blocks duplicate without adding rows',async()=>{
      await assert.rejects(save(db),e=>e.code==='23505');
      assert.deepEqual(await counts(db),{batches:1,items:3});
    });
    await t.test('RLS denial on item insert rolls back batch',async()=>{
      await db.exec(`RESET ROLE; CREATE POLICY reject_items ON incoming_items AS RESTRICTIVE
        FOR INSERT TO authenticated WITH CHECK(false); SET ROLE authenticated;`);
      await assert.rejects(save(db,[item()],'c'.repeat(64)),/row-level security/);
      assert.deepEqual(await counts(db),{batches:1,items:3});
      await db.exec('RESET ROLE; DROP POLICY reject_items ON incoming_items; SET ROLE authenticated');
    });
    await t.test('inaccessible match target is rejected',async()=>{
      await assert.rejects(save(db,[item({match_status:'possible',shortage_item_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})],'d'.repeat(64)),/unavailable/);
      assert.deepEqual(await counts(db),{batches:1,items:3});
    });
    await t.test('invalid and empty input cannot create partial batches',async()=>{
      for(const value of [[],null,{},[item({quantity:0})],[item({match_status:'matched'})],[item({product_name:''})]])
        await assert.rejects(save(db,value,'e'.repeat(64)));
      assert.deepEqual(await counts(db),{batches:1,items:3});
    });
    await t.test('missing login and anonymous role cannot call the function',async()=>{
      await db.exec("SET request.jwt.claim.sub=''");
      await assert.rejects(save(db),/Authentication required/);
      await db.exec('RESET ROLE; SET ROLE anon');
      await assert.rejects(save(db),/permission denied/);
    });
    await t.test('migration can be reapplied without changing existing records',async()=>{
      await db.exec('RESET ROLE');await db.exec(migration);
      assert.deepEqual(await counts(db),{batches:1,items:3});
    });
  }finally{await db.close()}
});
