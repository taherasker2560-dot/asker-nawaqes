// Migration 202611130400: the stock count (differences per expiry batch). Runs on an in-memory Postgres as «authenticated»
// with row level security on. Made-up items and people only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',CNT='00000000-0000-4000-8000-0000000000d1',OTHER='00000000-0000-4000-8000-0000000000d2',SELL='00000000-0000-4000-8000-0000000000d3';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
 CREATE SCHEMA IF NOT EXISTS storage; CREATE TABLE storage.objects(bucket_id text, name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
 for(const f of ['202611122330_ar_temp_sales.sql','202611130030_ar_temp_sales_kind.sql','202611130200_ar_staff.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 const sql=fs.readFileSync('supabase/migrations/202611130400_ar_count.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, storage TO authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
 INSERT INTO storage.objects VALUES ('asker-private','count/stock.json'),('asker-private','alerts/alerts.json');
 INSERT INTO public.ar_staff(user_id,name,email,perms) VALUES ('${CNT}','جارد تجربة','c1@staff.test','{count}'),('${OTHER}','جارد تاني','c2@staff.test','{count}'),('${SELL}','بائع','c3@staff.test','{tempsale}');`);
 const as=async(uid,q,params)=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SET ROLE authenticated;`);try{return (await db.query(q,params)).rows}finally{await db.exec('RESET ROLE')}};
 const add=(uid,id,result,diffs,extra='')=>as(uid,`INSERT INTO public.ar_count_entries(id,item_id,item_name,counted_at,result,diffs,parts${extra?','+extra.split('=')[0]:''}) VALUES ($1,63476,'ITEM ONE',now(),$2,$3,1${extra?','+extra.split('=')[1]:''})`,[id,result,JSON.stringify(diffs)]);
 const A='00000000-0000-4000-8000-000000000301',B='00000000-0000-4000-8000-000000000302';
 // a counter adds what he found: one box less of 2029-07; the owner sees it with his name on it
 await add(CNT,A,'diff',[{x:'2029-07',d:-1}]);
 const row=(await as(OWNER,`SELECT created_by,status,diffs FROM public.ar_count_entries WHERE id=$1`,[A]))[0];
 assert.equal(row.created_by,CNT);assert.equal(row.status,'pending');assert.deepEqual(row.diffs,[{x:'2029-07',d:-1}]);
 // another counter sees it (no counting twice) but cannot change it; its own author can correct it while pending
 assert.equal((await as(OTHER,`SELECT count(*)::int n FROM public.ar_count_entries`))[0].n,1);
 await as(OTHER,`UPDATE public.ar_count_entries SET result='ok' WHERE id=$1`,[A]);
 assert.equal((await as(OWNER,`SELECT result FROM public.ar_count_entries WHERE id=$1`,[A]))[0].result,'diff','not his: untouched');
 await as(CNT,`UPDATE public.ar_count_entries SET diffs='[{"x":"2029-07","d":-2}]' WHERE id=$1`,[A]);
 // never «applied» by staff; the owner marks it
 await assert.rejects(()=>as(CNT,`UPDATE public.ar_count_entries SET status='applied' WHERE id=$1`,[A]),/row-level security/);
 await as(OWNER,`UPDATE public.ar_count_entries SET status='applied',applied_at=now() WHERE id=$1`,[A]);
 await as(CNT,`UPDATE public.ar_count_entries SET diffs='[]' WHERE id=$1`,[A]);
 assert.deepEqual((await as(OWNER,`SELECT diffs FROM public.ar_count_entries WHERE id=$1`,[A]))[0].diffs,[{x:'2029-07',d:-2}],'applied: no more changes by staff');
 // someone without «جرد المخزون» sees nothing and adds nothing
 assert.equal((await as(SELL,`SELECT count(*)::int n FROM public.ar_count_entries`))[0].n,0);
 await assert.rejects(()=>add(SELL,B,'ok',[]),/row-level security/);
 // checks: result ok/diff only, at most 12 lines, a counter cannot write as someone else
 await assert.rejects(()=>add(OWNER,B,'maybe',[]),/check/);
 await assert.rejects(()=>add(OWNER,B,'diff',Array.from({length:13},()=>({x:null,d:1}))),/check/);
 await assert.rejects(()=>as(CNT,`INSERT INTO public.ar_count_entries(id,item_id,counted_at,result,created_by) VALUES ('${B}',1,now(),'ok','${OTHER}')`),/row-level security/);
 // the count data file: readable with «جرد المخزون», the customers' file still not
 assert.deepEqual((await as(CNT,`SELECT name FROM storage.objects WHERE bucket_id='asker-private'`)).map(r=>r.name),['count/stock.json']);
 // logged under his name, with the item's name
 const acts=await as(OWNER,`SELECT user_id,tbl,op,info FROM public.ar_activity WHERE tbl='ar_count_entries' ORDER BY id`);
 assert.equal(acts[0].user_id,CNT);assert.equal(acts[0].info.name,'ITEM ONE');assert.equal(acts[0].info.result,'diff');
 console.log('PASS: count: differences per batch, everyone counting sees all, own entries corrected until applied, owner applies, logged by name');
})().catch(e=>{console.error(e);process.exit(1)});
