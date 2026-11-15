// Migration 202611150700: his answers to «⚠️ ممكن نفس الصنف». Owner only; one standing answer per card; only 'same' / 'different'.
// In-memory Postgres, roles anon / authenticated with row level security on. Made-up people and items only.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const OWNER = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c', STAFF = '00000000-0000-4000-8000-0000000000e3';
(async () => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;`);
  const sql = fs.readFileSync('supabase/migrations/202611150700_ar_item_dups.sql', 'utf8');
  await db.exec(sql); await db.exec(sql); // applied twice: safe
  await db.exec('GRANT USAGE ON SCHEMA public TO authenticated, anon;');
  const as = async (role, uid, q) => { await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid || ''}',false); SET ROLE ${role};`); try { return (await db.query(q)).rows; } finally { await db.exec('RESET ROLE'); } };
  const fails = async (role, uid, q) => { let ok = false; try { await as(role, uid, q); } catch (e) { ok = true; } return ok; };
  const [d] = await as('authenticated', OWNER, `INSERT INTO public.ar_item_dups(item_id,item_name,other_id,other_name,bag,decision) VALUES (16306,'TEST A',21936,'TEST A 2','2434','same') RETURNING id,status`);
  assert.equal(d.status, 'open');
  // one standing answer per card: a second one waits until the first is undone
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_item_dups(item_id,other_id,decision) VALUES (16306,21936,'different')`));
  await as('authenticated', OWNER, `UPDATE public.ar_item_dups SET status='cancelled', updated_at=now() WHERE id=${d.id}`);
  await as('authenticated', OWNER, `INSERT INTO public.ar_item_dups(item_id,other_id,decision) VALUES (16306,21936,'different')`);
  // only the two answers, two different cards, known statuses
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_item_dups(item_id,other_id,decision) VALUES (1,2,'maybe')`));
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_item_dups(item_id,other_id,decision) VALUES (5,5,'same')`));
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_item_dups(item_id,other_id,decision,status) VALUES (6,7,'same','sent')`));
  // nobody else
  assert.ok(await fails('anon', null, `INSERT INTO public.ar_item_dups(item_id,other_id,decision) VALUES (8,9,'same')`));
  assert.ok(await fails('authenticated', STAFF, `INSERT INTO public.ar_item_dups(item_id,other_id,decision) VALUES (8,9,'same')`));
  assert.equal((await as('authenticated', STAFF, 'SELECT id FROM public.ar_item_dups')).length, 0);
  console.log('item-dups-migration ok');
})().catch((e) => { console.error(e); process.exit(1); });
