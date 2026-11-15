// Migration 202611150500: the owner's moves between bags («الحقائب ← حوّل»). Owner only; one open move per item; nothing else.
// In-memory Postgres, roles anon / authenticated with row level security on. Made-up people and items only.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const OWNER = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c', STAFF = '00000000-0000-4000-8000-0000000000e1';
(async () => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;`);
  const sql = fs.readFileSync('supabase/migrations/202611150500_ar_bag_moves.sql', 'utf8');
  await db.exec(sql); await db.exec(sql); // applied twice: safe
  await db.exec('GRANT USAGE ON SCHEMA public TO authenticated, anon;');
  const as = async (role, uid, q) => { await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid || ''}',false); SET ROLE ${role};`); try { return (await db.query(q)).rows; } finally { await db.exec('RESET ROLE'); } };
  const fails = async (role, uid, q) => { let ok = false; try { await as(role, uid, q); } catch (e) { ok = true; } return ok; };
  // the owner moves an item from the daily bag to «نواقص كل الشركات», with its numbers
  const [m] = await as('authenticated', OWNER, `INSERT INTO public.ar_bag_moves(item_id,item_name,from_bag,to_bag,item) VALUES (11,'TEST ITEM','2428','pv','{"have":1,"sold30":33,"need":16}') RETURNING id,status`);
  assert.equal(m.status, 'pending');
  // one open move per item: a second one is refused until the first is closed
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_bag_moves(item_id,from_bag,to_bag) VALUES (11,'2428','2434')`));
  await as('authenticated', OWNER, `UPDATE public.ar_bag_moves SET status='cancelled', updated_at=now() WHERE id=${m.id}`);
  await as('authenticated', OWNER, `INSERT INTO public.ar_bag_moves(item_id,from_bag,to_bag) VALUES (11,'2428','2434')`);
  // only real bags: a Cards id or 'pv'; never to the same bag; only the known statuses; small item numbers
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_bag_moves(item_id,from_bag,to_bag) VALUES (12,'2428','2428')`));
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_bag_moves(item_id,from_bag,to_bag) VALUES (12,'2428','x; drop')`));
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_bag_moves(item_id,from_bag,to_bag,status) VALUES (12,'2428','pv','sent')`));
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_bag_moves(item_id,from_bag,to_bag,item) VALUES (12,'2428','pv',jsonb_build_object('x',repeat('y',5000)))`));
  // nobody else: a visitor or a staff member cannot read or write
  assert.ok(await fails('anon', null, `INSERT INTO public.ar_bag_moves(item_id,from_bag,to_bag) VALUES (13,'2428','pv')`));
  assert.ok(await fails('authenticated', STAFF, `INSERT INTO public.ar_bag_moves(item_id,from_bag,to_bag) VALUES (13,'2428','pv')`));
  assert.equal((await as('authenticated', STAFF, 'SELECT id FROM public.ar_bag_moves')).length, 0);
  assert.equal((await as('authenticated', OWNER, `SELECT count(*)::int n FROM public.ar_bag_moves WHERE item_id=11`))[0].n, 2);
  console.log('bag-moves-migration ok');
})().catch((e) => { console.error(e); process.exit(1); });
