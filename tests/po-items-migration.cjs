// Migration 202611150600: the owner's purchase order («أمر شراء» in «الحقائب»). Owner only; an item once in the open order.
// In-memory Postgres, roles anon / authenticated with row level security on. Made-up people and items only.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const OWNER = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c', STAFF = '00000000-0000-4000-8000-0000000000e2';
(async () => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;`);
  const sql = fs.readFileSync('supabase/migrations/202611150600_ar_po_items.sql', 'utf8');
  await db.exec(sql); await db.exec(sql); // applied twice: safe
  await db.exec('GRANT USAGE ON SCHEMA public TO authenticated, anon;');
  const as = async (role, uid, q) => { await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid || ''}',false); SET ROLE ${role};`); try { return (await db.query(q)).rows; } finally { await db.exec('RESET ROLE'); } };
  const fails = async (role, uid, q) => { let ok = false; try { await as(role, uid, q); } catch (e) { ok = true; } return ok; };
  // the owner puts two items in the order, with their numbers
  const [a] = await as('authenticated', OWNER, `INSERT INTO public.ar_po_items(item_id,item_name,bag,qty,item) VALUES (11,'TEST ONE','2428',16,'{"have":1,"sold30":33,"need":16}') RETURNING id,status`);
  assert.equal(a.status, 'open');
  await as('authenticated', OWNER, `INSERT INTO public.ar_po_items(item_id,item_name,bag,qty) VALUES (12,'TEST TWO','pv',2)`);
  // once in the open order: a second line for the same item is refused until the first is closed
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_po_items(item_id,qty) VALUES (11,3)`));
  await as('authenticated', OWNER, `UPDATE public.ar_po_items SET status='cancelled', updated_at=now() WHERE id=${a.id}`);
  await as('authenticated', OWNER, `INSERT INTO public.ar_po_items(item_id,qty) VALUES (11,3)`);
  // only sane values
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_po_items(item_id,qty) VALUES (13,0)`));
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_po_items(item_id,qty,bag) VALUES (13,1,'x')`));
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_po_items(item_id,qty,status) VALUES (13,1,'sent')`));
  assert.ok(await fails('authenticated', OWNER, `INSERT INTO public.ar_po_items(item_id,qty,item) VALUES (13,1,jsonb_build_object('x',repeat('y',5000)))`));
  // nobody else
  assert.ok(await fails('anon', null, `INSERT INTO public.ar_po_items(item_id,qty) VALUES (14,1)`));
  assert.ok(await fails('authenticated', STAFF, `INSERT INTO public.ar_po_items(item_id,qty) VALUES (14,1)`));
  assert.equal((await as('authenticated', STAFF, 'SELECT id FROM public.ar_po_items')).length, 0);
  assert.equal((await as('authenticated', OWNER, `SELECT count(*)::int n FROM public.ar_po_items WHERE status='open'`))[0].n, 2);
  // 202611160000: the invoice closes the line («received») with what closed it; a new line for the same item is allowed after that
  const sql2 = fs.readFileSync('supabase/migrations/202611160000_ar_po_received.sql', 'utf8');
  await db.exec(sql2); await db.exec(sql2); // applied twice: safe
  await db.exec('GRANT SELECT, INSERT, UPDATE ON public.ar_po_items TO authenticated;');
  const [b] = await as('authenticated', OWNER, `SELECT id FROM public.ar_po_items WHERE item_id=12 AND status='open'`);
  await as('authenticated', OWNER, `UPDATE public.ar_po_items SET status='received', received_qty=2.5, received_at=now(), done_at=now(), updated_at=now(), inv_code='11/26/107075', vendor='AMG' WHERE id=${b.id}`);
  assert.deepEqual((await as('authenticated', OWNER, `SELECT status, received_qty::float q, inv_code, vendor FROM public.ar_po_items WHERE id=${b.id}`))[0], { status: 'received', q: 2.5, inv_code: '11/26/107075', vendor: 'AMG' });
  await as('authenticated', OWNER, `INSERT INTO public.ar_po_items(item_id,qty) VALUES (12,4)`); // the item can be ordered again once received
  for (const bad of [`received_qty=0`, `received_qty=100001`, `status='sent'`, `inv_code='${'x'.repeat(41)}'`, `vendor='${'x'.repeat(81)}'`]) {
    assert.ok(await fails('authenticated', OWNER, `UPDATE public.ar_po_items SET ${bad} WHERE id=${b.id}`), bad);
  }
  assert.equal((await as('authenticated', STAFF, `SELECT id FROM public.ar_po_items WHERE status='received'`)).length, 0, 'staff sees nothing');
  assert.doesNotMatch(sql2.replace(/--.*$/gm, ''), /drop table|truncate/i);
  console.log('po-items-migration ok');
})().catch((e) => { console.error(e); process.exit(1); });
