// Migration 202611271200 «📷 صور مطلوبة»: the owner does everything; a staff member with «photos» reads the waiting items only (never the numbers, never writes); other staff, a stopped account and a
// stranger see nothing; applied twice is safe; the review's «تمام» column comes with it. In-memory Postgres, row level security on. Made-up people and ids only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SHOOT='00000000-0000-4000-8000-0000000000a1',SELL='00000000-0000-4000-8000-0000000000a2',STOPPED='00000000-0000-4000-8000-0000000000a3',STRANGER='00000000-0000-4000-8000-0000000000a4';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
 CREATE SCHEMA IF NOT EXISTS storage; CREATE TABLE storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
 CREATE TABLE storage.objects(bucket_id text, name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE TABLE public.ar_temp_sales(id bigint primary key, kind text, status text, customer_id bigint);
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);`);
 for(const f of ['202611130200_ar_staff.sql','202611141600_ar_store_edits.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(`GRANT USAGE ON SCHEMA public TO authenticated, anon;
 INSERT INTO public.ar_staff(user_id,name,email,perms,active) VALUES ('${SHOOT}','مصوّر','a1@staff.test','{photos}',true),('${SELL}','بائع','a2@staff.test','{tempsale,docs}',true),('${STOPPED}','موقوف','a3@staff.test','{photos}',false);`);
 const as=async(uid,q,p=[])=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SET ROLE authenticated;`);try{return (await db.query(q,p)).rows}finally{await db.exec('RESET ROLE')}};
 const denied=(uid,q,p)=>assert.rejects(()=>as(uid,q,p),/row-level security|permission denied/);
 const sql=fs.readFileSync('supabase/migrations/202611271200_ar_photo_wanted.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 assert.equal((await db.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='ar_store_edits' AND column_name='photo_ok_at'`)).rows[0].n,1,'the review\'s «تمام» column came with it');
 // the owner: adds (the automatic add ignores what is there), removes, keeps his numbers
 await as(OWNER,`INSERT INTO public.ar_photo_wanted(item_id,name) VALUES (7,'NO PHOTO TAB'),(8,'PICKED TAB')`);
 await as(OWNER,`INSERT INTO public.ar_photo_wanted(item_id,name,why) VALUES (7,'NO PHOTO TAB','none') ON CONFLICT (item_id) DO NOTHING`);
 await as(OWNER,`UPDATE public.ar_photo_wanted SET removed_at=now() WHERE item_id=8`);
 await as(OWNER,`INSERT INTO public.ar_photo_numbers(name,phone) VALUES ('مثال','201000000100')`);
 await as(OWNER,`UPDATE public.ar_photo_numbers SET last_sent_at=now()`);
 await assert.rejects(()=>as(OWNER,`INSERT INTO public.ar_photo_numbers(name,phone) VALUES ('غلط','0100-abc')`),/check/);
 // «صور مطلوبة»: the waiting items only; no writing; never the numbers
 assert.deepEqual((await as(SHOOT,`SELECT item_id::int i FROM public.ar_photo_wanted ORDER BY 1`)).map((r)=>r.i),[7]);
 await denied(SHOOT,`INSERT INTO public.ar_photo_wanted(item_id,name) VALUES (9,'X')`);
 assert.equal((await as(SHOOT,`UPDATE public.ar_photo_wanted SET removed_at=now() WHERE item_id=7 RETURNING item_id`)).length,0);
 assert.equal((await as(SHOOT,`DELETE FROM public.ar_photo_wanted RETURNING item_id`)).length,0);
 assert.equal((await as(SHOOT,`SELECT * FROM public.ar_photo_numbers`)).length,0,'no numbers for staff');
 await denied(SHOOT,`INSERT INTO public.ar_photo_numbers(name,phone) VALUES ('x','201000000101')`);
 // other staff (even with «الفواتير»), a stopped account and a stranger: nothing
 for(const u of [SELL,STOPPED,STRANGER]){assert.equal((await as(u,`SELECT * FROM public.ar_photo_wanted`)).length,0);assert.equal((await as(u,`SELECT * FROM public.ar_photo_numbers`)).length,0);await denied(u,`INSERT INTO public.ar_photo_wanted(item_id,name) VALUES (20,'X')`)}
 // not signed in: no access at all
 await db.exec('SET ROLE anon');await assert.rejects(()=>db.query('SELECT * FROM public.ar_photo_wanted'),/permission denied/);await assert.rejects(()=>db.query('SELECT * FROM public.ar_photo_numbers'),/permission denied/);await db.exec('RESET ROLE');
 console.log('PASS: photo list migration: the owner does all; «صور مطلوبة» reads the waiting items only; nobody else sees anything; the numbers are the owner\'s');
})().catch((e)=>{console.error(e);process.exit(1)});
