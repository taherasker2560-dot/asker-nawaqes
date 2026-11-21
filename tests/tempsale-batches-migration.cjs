// Migration 202611211400: a staff member with «البيع المؤقت» (tempsale) reads the count's file of expiry batches, and only that file.
// Runs on an in-memory Postgres as «authenticated» with row level security on. Made-up people only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const COUNTER='00000000-0000-4000-8000-0000000000e1',SELLER='00000000-0000-4000-8000-0000000000e2',STOCKER='00000000-0000-4000-8000-0000000000e3',BOTH='00000000-0000-4000-8000-0000000000e4';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
 CREATE SCHEMA IF NOT EXISTS storage; CREATE TABLE storage.objects(bucket_id text, name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
 for(const f of ['202611122330_ar_temp_sales.sql','202611130030_ar_temp_sales_kind.sql','202611130200_ar_staff.sql','202611130400_ar_count.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 const sql=fs.readFileSync('supabase/migrations/202611211400_ar_staff_tempsale_batches.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, storage TO authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
 INSERT INTO storage.objects VALUES ('asker-private','count/stock.json'),('asker-private','alerts/alerts.json'),('asker-private','orders/drafts.json'),('asker-private','alerts/expiry.json'),('other-bucket','count/stock.json');
 INSERT INTO public.ar_staff(user_id,name,email,perms) VALUES ('${COUNTER}','جارد تجربة','e1@staff.test','{count}'),('${SELLER}','بائع تجربة','e2@staff.test','{tempsale}'),
  ('${STOCKER}','مخزني تجربة','e3@staff.test','{stock,return}'),('${BOTH}','بتاع الاتنين','e4@staff.test','{count,tempsale}');`);
 const files=async(uid)=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SET ROLE authenticated;`);try{return (await db.query(`SELECT bucket_id||'/'||name f FROM storage.objects ORDER BY 1`)).rows.map(r=>r.f)}finally{await db.exec('RESET ROLE')}};
 // the seller reads the batches file and nothing else of the private bucket
 assert.deepEqual(await files(SELLER),['asker-private/count/stock.json'],'«البيع المؤقت» opens the batches file only');
 // the counter still reads it (as before), and nothing else
 assert.deepEqual(await files(COUNTER),['asker-private/count/stock.json']);
 // both permissions: the same one file
 assert.deepEqual(await files(BOTH),['asker-private/count/stock.json']);
 // a staff member with neither («المخزون» and «المرتجع» do not open it) reads none of them
 assert.deepEqual(await files(STOCKER),[],'other sections do not open the file');
 // a stranger reads nothing
 assert.deepEqual(await files('00000000-0000-4000-8000-0000000000ff'),[]);
 // a stopped seller reads nothing
 await db.exec(`UPDATE public.ar_staff SET active=false WHERE user_id='${SELLER}'`);
 assert.deepEqual(await files(SELLER),[],'a stopped account reads nothing');
 // the other staff sections keep their files: «المسودات» opens its own file, «العملاء» the alerts, «الصلاحيات» the expiry one
 await db.exec(`INSERT INTO public.ar_staff(user_id,name,email,perms) VALUES ('00000000-0000-4000-8000-0000000000e5','متعدد','e5@staff.test','{drafts,customers,expiry}')`);
 assert.deepEqual(await files('00000000-0000-4000-8000-0000000000e5'),['asker-private/alerts/alerts.json','asker-private/alerts/expiry.json','asker-private/orders/drafts.json']);
 console.log('PASS: staff with «البيع المؤقت» read the count\'s batches file and only that file; the other sections keep theirs');
})().catch((e)=>{console.error(e);process.exit(1)});
