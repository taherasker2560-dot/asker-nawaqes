// Migration 202611141600: the owner's fixes on the store site. Everyone reads them; only the owner or «storeorders» writes.
// In-memory Postgres, roles anon / authenticated with row level security on. Made-up people only.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const OWNER = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c', SHOP = '00000000-0000-4000-8000-0000000000d1', SELL = '00000000-0000-4000-8000-0000000000d2';
(async () => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
  CREATE SCHEMA IF NOT EXISTS storage; CREATE TABLE storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects(bucket_id text, name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE TABLE public.ar_temp_sales(id bigint primary key, kind text, status text, customer_id bigint);`);
  await db.exec(fs.readFileSync('supabase/migrations/202611130200_ar_staff.sql', 'utf8'));
  const sql = fs.readFileSync('supabase/migrations/202611141600_ar_store_edits.sql', 'utf8');
  await db.exec(sql); await db.exec(sql); // applied twice: safe
  await db.exec(`GRANT USAGE ON SCHEMA public TO authenticated, anon;
  INSERT INTO public.ar_staff(user_id,name,email,perms) VALUES ('${SHOP}','طلبات','d1@staff.test','{storeorders}'),('${SELL}','بائع','d2@staff.test','{tempsale}');`);
  const as = async (role, uid, q) => { await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid || ''}',false); SET ROLE ${role};`); try { return (await db.query(q)).rows; } finally { await db.exec('RESET ROLE'); } };
  const fails = async (role, uid, q) => { let ok = false; try { await as(role, uid, q); } catch (e) { ok = true; } return ok; };
  // the owner fixes an item; a visitor of the site reads it
  await as('authenticated', OWNER, `INSERT INTO public.ar_store_edits(item_id,img,descr) VALUES (5,'e/5-abcdef012345.jpg','{"h":"جملة"}')`);
  assert.equal((await as('anon', null, `SELECT img FROM public.ar_store_edits WHERE item_id=5`))[0].img, 'e/5-abcdef012345.jpg');
  // a visitor cannot write; a seller without «storeorders» cannot write; «storeorders» can
  assert.ok(await fails('anon', null, `INSERT INTO public.ar_store_edits(item_id,img_off) VALUES (6,true)`));
  assert.ok(await fails('authenticated', SELL, `INSERT INTO public.ar_store_edits(item_id,img_off) VALUES (6,true)`));
  assert.equal((await as('authenticated', SELL, `UPDATE public.ar_store_edits SET img_off=true WHERE item_id=5 RETURNING item_id`)).length, 0);
  await as('authenticated', SHOP, `INSERT INTO public.ar_store_edits(item_id,img_off) VALUES (6,true)`);
  assert.equal((await db.query(`SELECT count(*)::int n FROM public.ar_activity WHERE user_id='${SHOP}' AND tbl='ar_store_edits'`)).rows[0].n, 1, 'his fix shows under his name');
  // only our own photo paths and small descriptions
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_store_edits(item_id,img) VALUES (7,'https://evil.example/x.jpg')`));
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_store_edits(item_id,descr) VALUES (7,'["x"]')`));
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_store_edits(item_id,descr) VALUES (7,jsonb_build_object('h',repeat('x',5000)))`));
  // the public photo bucket
  assert.deepEqual((await db.query(`SELECT public, file_size_limit::text AS file_size_limit FROM storage.buckets WHERE id='ar-store-img'`)).rows[0], { public: true, file_size_limit: '3145728' });
  console.log('store-edits-migration ok');
})().catch((e) => { console.error(e); process.exit(1); });
