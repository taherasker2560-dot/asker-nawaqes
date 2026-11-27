// Migration 202611271700 «the new item goes into صور مطلوبة by itself» (owner 2026-11-27): the server lists every NEW line of a prepared invoice; rejected and cancelled ones leave; his ✕ stays;
// a user with «photos» reads the waiting lines and may send the box photo of a listed line only; others see nothing; the cleaning of finished cards keeps a card while its box is wanted.
// The invoice is never stopped by the list. In-memory Postgres, row level security on. Made-up people, suppliers and items only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SHOOT='00000000-0000-4000-8000-0000000000b1',SELL='00000000-0000-4000-8000-0000000000b2';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
 CREATE SCHEMA IF NOT EXISTS storage; CREATE TABLE storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
 CREATE TABLE storage.objects(bucket_id text, name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE SCHEMA cron; CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ select 1::bigint $$; CREATE FUNCTION cron.unschedule(bigint) RETURNS boolean LANGUAGE sql AS $$ select true $$; CREATE TABLE cron.job(jobid bigint, jobname text);
 CREATE TABLE public.ar_temp_sales(id bigint primary key, kind text, status text, customer_id bigint);
 CREATE TABLE public.ar_names(name_key text primary key, english_name text, arabic_name text, status text, updated_at timestamptz); ALTER TABLE public.ar_names ENABLE ROW LEVEL SECURITY;
 CREATE TABLE public.ar_store_items(id bigint primary key, name text, arabic_name text, price numeric); ALTER TABLE public.ar_store_items ENABLE ROW LEVEL SECURITY;
 CREATE TABLE public.ar_store_arabic(item_id bigint primary key, arabic_name text, confident boolean, source text, updated_at timestamptz); ALTER TABLE public.ar_store_arabic ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION public.ar_store_fill_arabic() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ select 1 $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);`);
 const mig=(f)=>fs.readFileSync('supabase/migrations/'+f,'utf8');
 for(const f of ['202611130200_ar_staff.sql','202611141600_ar_store_edits.sql','202611210200_ar_store_edits_active.sql','202611210300_ar_item_reads.sql','202611211500_ar_staff_item_edit.sql','202611212000_ar_invoice_reviews.sql','202611221800_ar_item_reads_new_item.sql','202611231500_ar_invoice_reviews_clean.sql'])await db.exec(mig(f));
 await db.exec(`GRANT USAGE ON SCHEMA public TO authenticated, anon;
 INSERT INTO public.ar_staff(user_id,name,email,perms,active) VALUES ('${SHOOT}','مصوّر','b1@staff.test','{photos}',true),('${SELL}','بائع','b2@staff.test','{tempsale,docs}',true);`);
 const as=async(uid,q,p=[])=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SET ROLE authenticated;`);try{return (await db.query(q,p)).rows}finally{await db.exec('RESET ROLE')}};
 const denied=(uid,q,p)=>assert.rejects(()=>as(uid,q,p),/row-level security|permission denied/);
 const put=async(id,lines,status='ready')=>(await db.query(`insert into public.ar_invoice_reviews(batch,supplier,doc_no,total,lines,status) values ('2026-11-27','مورد مثال',$1,100,$2::jsonb,$3) returning id`,[String(id),JSON.stringify(lines),status])).rows[0].id;
 const listed=async(rev)=>(await db.query(`select line_n,name,gone,removed_at is not null as removed from public.ar_photo_new where review_id=$1 order by line_n`,[rev])).rows;
 // an invoice already on the server before the migration
 const OLD=await put(1,[{n:1,id:101,name:'EXAMPLE TAB',paper:'قديم'},{n:2,id:0,name:'',paper:'صنف جديد قديم'}]);
 const sql=mig('202611271700_ar_photo_new.sql');await db.exec(sql);await db.exec(sql); // applied twice: safe
 assert.deepEqual(await listed(OLD),[{line_n:'2',name:'صنف جديد قديم',gone:false,removed:false}],'the invoices already there are listed');
 // a prepared invoice: its new lines appear by themselves; a line with a card does not
 const A=await put(2,[{n:1,id:101,name:'EXAMPLE TAB'},{n:2,paper:'شامبو مثال'},{n:3,id:0,name:'',paper:'كريم مثال'},{n:4,id:'abc',paper:'غسول مثال'},{paper:'من غير رقم'},{n:6,id:0,name:'',paper:'  '}]);
 assert.deepEqual((await listed(A)).map((r)=>r.line_n+' '+r.name),['2 شامبو مثال','3 كريم مثال','4 غسول مثال']);
 // he rejects a line (it goes back to the supplier): off the list; taken back: on again
 await as(OWNER,`update public.ar_invoice_reviews set answers='{"R3":{"v":"reject"}}' where id=$1`,[A]);
 assert.equal((await listed(A)).find((r)=>r.line_n==='3').gone,true);
 await as(OWNER,`update public.ar_invoice_reviews set answers='{}' where id=$1`,[A]);
 assert.equal((await listed(A)).find((r)=>r.line_n==='3').gone,false);
 // his ✕ stays, also when the invoice is prepared again
 await as(OWNER,`update public.ar_photo_new set removed_at=now() where review_id=$1 and line_n='4'`,[A]);
 await db.query(`update public.ar_invoice_reviews set lines=lines where id=$1`,[A]);
 assert.equal((await listed(A)).find((r)=>r.line_n==='4').removed,true);
 // the user with «صور مطلوبة»: the waiting lines only; the box of a listed line; nothing else
 assert.deepEqual((await as(SHOOT,`select line_n from public.ar_photo_new where review_id=$1 order by 1`,[A])).map((r)=>r.line_n),['2','3']);
 const ask=(uid,rev,n,kind='new_item')=>as(uid,`insert into public.ar_item_reads(kind,review_id,line_n,item_name,img_b64) values ($1,$2,$3,'x','AAAA') returning id`,[kind,rev,n]);
 await denied(SHOOT,`insert into public.ar_item_reads(kind,review_id,line_n,item_name,img_b64) values ('new_item',$1,'1','x','AAAA')`,[A]);   // a line with a card
 await denied(SHOOT,`insert into public.ar_item_reads(kind,review_id,line_n,item_name,img_b64) values ('new_item',$1,'4','x','AAAA')`,[A]);   // the one he took off
 assert.equal((await as(SHOOT,`select * from public.ar_invoice_reviews`)).length,0,'the invoices stay his');
 await denied(SHOOT,`update public.ar_photo_new set removed_at=now() where review_id=${Number(A)} and line_n='2'`).catch(async()=>{});
 assert.equal((await db.query(`select count(*)::int n from public.ar_photo_new where review_id=$1 and removed_at is not null`,[A])).rows[0].n,1,'a user takes nothing off');
 // another user: nothing, and no new-item photo
 assert.equal((await as(SELL,`select * from public.ar_photo_new`)).length,0);
 await denied(SELL,`insert into public.ar_item_reads(kind,review_id,line_n,item_name,img_b64) values ('new_item',$1,'2','x','AAAA')`,[A]);
 await db.exec('SET ROLE anon');await assert.rejects(()=>db.query('select * from public.ar_photo_new'),/permission denied/);await db.exec('RESET ROLE');
 // the cleaning: an entered invoice stays while a new item's box is wanted
 await db.query(`update public.ar_invoice_reviews set status='entered', done_at=now()-interval '2 days' where id in ($1,$2)`,[A,OLD]);
 const clean=async()=>(await db.query('select public.ar_invoice_reviews_clean() n')).rows[0].n;
 assert.equal(await clean(),0,'kept: boxes are still wanted');
 const r2=(await ask(SHOOT,A,'2'))[0].id;
 await db.query(`update public.ar_item_reads set status='applied' where id=$1`,[r2]);
 assert.equal(await clean(),0,'line 3 still waits');
 const r3=(await ask(OWNER,A,'3'))[0].id;await db.query(`update public.ar_item_reads set status='done' where id=$1`,[r3]);
 assert.equal(await clean(),0,'read but not on its card yet');
 await db.query(`update public.ar_item_reads set status='applied' where id=$1`,[r3]);
 assert.equal(await clean(),1,'both on their cards: the card goes');
 assert.equal((await listed(A)).length,0,'and its lines with it');
 await db.query(`update public.ar_photo_new set added_at=now()-interval '31 days' where review_id=$1`,[OLD]);
 assert.equal(await clean(),1,'after 30 days a box nobody sent lets its card go');
 // cancelled: off the list
 const C=await put(3,[{n:1,paper:'صنف ملغي'}]);await db.query(`update public.ar_invoice_reviews set status='cancelled' where id=$1`,[C]);
 assert.equal((await listed(C))[0].gone,true);
 console.log('PASS: new items list themselves; rejected / cancelled / his ✕ leave; «صور مطلوبة» sends a listed box only; the cleaning waits for the boxes');
})().catch((e)=>{console.error(e);process.exit(1)});
