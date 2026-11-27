// Migration 202611272300 «his approval before a photo is shown» (owner 2026-11-27): the day's photos by users are listed for him and stay shown; a user's new photo only waits; a user's own write
// never puts a photo on an item (and never wipes the one there); his yes shows it, his no keeps it off (a shown one comes off) and sends the item back as «صوّرها تاني»; only he decides.
// In-memory Postgres, row level security on. Made-up people and items only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SHOOT='00000000-0000-4000-8000-0000000000b1',SELL='00000000-0000-4000-8000-0000000000b2',OUT='00000000-0000-4000-8000-0000000000b9';
const P=(id,x='aaaaaaaaaaaa')=>`e/${id}-${x}.jpg`;
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;
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
 for(const f of ['202611130200_ar_staff.sql','202611141600_ar_store_edits.sql','202611210200_ar_store_edits_active.sql','202611210300_ar_item_reads.sql','202611211500_ar_staff_item_edit.sql','202611271200_ar_photo_wanted.sql'])await db.exec(mig(f));
 await db.exec(`GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
 INSERT INTO public.ar_staff(user_id,name,email,perms,active) VALUES ('${SHOOT}','مصوّر','b1@staff.test','{photos}',true),('${SELL}','بائع','b2@staff.test','{tempsale}',true);
 INSERT INTO public.ar_store_items(id,name) VALUES (101,'EXAMPLE TAB'),(102,'EXAMPLE SYR'),(103,'EXAMPLE CREAM'),(104,'EXAMPLE DROPS'),(105,'EXAMPLE GEL');`);
 // the server itself (the photo function, the laptop): no signed-in user
 const svc=async(q,p=[])=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','',false);`);return (await db.query(q,p)).rows};
 const as=async(uid,q,p=[])=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SET ROLE authenticated;`);try{return (await db.query(q,p)).rows}finally{await db.exec(`RESET ROLE; SELECT set_config('test.uid','',false);`)}};
 const denied=(uid,q,p)=>assert.rejects(()=>as(uid,q,p),/row-level security|permission denied|owner only/);
 const edit=async(id)=>(await svc(`select img,img_off,updated_by,photo_ok_at,descr from public.ar_store_edits where item_id=$1`,[id]))[0];
 const waits=async()=>svc(`select item_id::int id,img,live,by_name,name,status from public.ar_photo_pending order by id`);
 const wanted=async(id)=>(await svc(`select why,removed_at,name from public.ar_photo_wanted where item_id=$1`,[id]))[0];
 // before the migration: a user's photo of that day (shown), an older one, and one of the owner's
 await svc(`insert into public.ar_store_edits(item_id,img,updated_by,updated_at) values (101,$1,'${SHOOT}','2026-11-27 22:00+02'),(104,$2,'${SHOOT}','2026-11-20 10:00+02'),(105,$3,'${OWNER}','2026-11-27 12:00+02')`,[P(101),P(104),P(105)]);
 const sql=mig('202611272300_ar_photo_pending.sql');await db.exec(sql);await db.exec(sql); // applied twice: safe
 assert.deepEqual(await waits(),[{id:101,img:P(101),live:true,by_name:'مصوّر',name:'EXAMPLE TAB',status:'pending'}],'only the users\' photos of that day wait for him');
 assert.equal((await edit(101)).img,P(101),'and stay shown');
 // a user's new photo only waits; a second one replaces the first
 await svc(`select public.ar_photo_submit(102,$1,'${SHOOT}')`,[P(102,'bbbbbbbbbbbb')]);
 await svc(`select public.ar_photo_submit(102,$1,'${SHOOT}')`,[P(102,'cccccccccccc')]);
 assert.equal(await edit(102),undefined,'nothing is shown');
 assert.deepEqual((await waits()).filter((r)=>r.id===102).map((r)=>r.img.slice(6,10)+' '+r.status),['bbbb replaced','cccc pending']);
 // users see what waits and can do nothing to it; visitors see nothing
 assert.equal((await as(SHOOT,`select id from public.ar_photo_pending where status='pending'`)).length,2);
 assert.equal((await as(OUT,`select id from public.ar_photo_pending`)).length,0,'a signed-in stranger sees nothing');
 await denied(SHOOT,`insert into public.ar_photo_pending(item_id,name,img,by_id) values (103,'x',$1,'${SHOOT}')`,[P(103)]);
 await denied(SHOOT,`update public.ar_photo_pending set status='approved'`);
 await denied(SHOOT,`select public.ar_photo_submit(103,$1,'${SHOOT}')`,[P(103)]);
 await denied(SHOOT,`select public.ar_photo_take_shown(now())`);
 const waiting=async(id)=>(await svc(`select id from public.ar_photo_pending where item_id=$1 and status='pending'`,[id]))[0].id;
 const first=await waiting(102);
 await denied(SHOOT,`select public.ar_photo_decide($1,true)`,[first]);
 await db.exec('SET ROLE anon');await assert.rejects(()=>db.query('select * from public.ar_photo_pending'),/permission denied/);await assert.rejects(()=>db.query('select public.ar_photo_decide(1,true)'),/permission denied/);await db.exec('RESET ROLE');
 // the guard: a user's own write never puts a photo on an item, and a full-row save (the words) keeps the one there
 await svc(`insert into public.ar_store_edits(item_id,img,updated_by) values (103,$1,'${OWNER}')`,[P(103,'1111111111111111'.slice(0,12))]);
 const upsert=(uid,id,img,descr)=>as(uid,`insert into public.ar_store_edits(item_id,img,img_off,descr,desc_off,updated_by) values ($1,$2,false,$3::jsonb,false,'${uid}') on conflict (item_id) do update set img=excluded.img, img_off=excluded.img_off, descr=excluded.descr, updated_by=excluded.updated_by`,[id,img,descr]);
 await upsert(SHOOT,103,P(103,'222222222222'),'{"h":"كلام"}');
 let e=await edit(103);assert.deepEqual([e.img,e.updated_by,e.descr],[P(103,'111111111111'),OWNER,{h:'كلام'}],'his photo stays, the words are saved');
 await as(SHOOT,`update public.ar_store_edits set img=$1 where item_id=103`,[P(103,'333333333333')]);
 assert.equal((await edit(103)).img,P(103,'111111111111'));
 await upsert(SHOOT,102,P(102,'cccccccccccc'),null);
 assert.equal((await edit(102)).img,null,'a new row from a user carries no photo');
 assert.equal((await waits()).find((r)=>r.id===102&&r.status==='pending').img,P(102,'cccccccccccc'),'and ends nothing that waits');
 await upsert(SHOOT,103,P(103,'111111111111'),null);assert.equal((await edit(103)).img,P(103,'111111111111'),'saving with the same photo keeps it');
 await upsert(SHOOT,103,null,null);assert.equal((await edit(103)).img,null,'the site\'s own photo can be put back');
 await as(SHOOT,`update public.ar_store_edits set img_off=true where item_id=103`);assert.equal((await edit(103)).img_off,true,'and one taken off');
 // only he decides. Yes: the photo goes on the item, under the one who took it, as accepted
 assert.deepEqual((await as(OWNER,`select public.ar_photo_decide($1,true) r`,[first]))[0].r,{ok:true});
 e=await edit(102);assert.deepEqual([e.img,e.img_off,e.updated_by,!!e.photo_ok_at],[P(102,'cccccccccccc'),false,SHOOT,true]);
 assert.deepEqual((await as(OWNER,`select public.ar_photo_decide($1,false) r`,[first]))[0].r,{ok:false,error:'gone'},'decided once');
 assert.equal((await edit(102)).img,P(102,'cccccccccccc'));
 // no, for one that was never shown: what the item shows stays, and the item is asked for again
 await svc(`select public.ar_photo_submit(102,$1,'${SHOOT}')`,[P(102,'dddddddddddd')]);
 await as(OWNER,`select public.ar_photo_decide($1,false)`,[await waiting(102)]);
 assert.equal((await edit(102)).img,P(102,'cccccccccccc'));
 assert.deepEqual([(await wanted(102)).why,(await wanted(102)).removed_at,(await wanted(102)).name],['retake',null,'EXAMPLE SYR']);
 // no, for a shown one: it comes off, and an earlier ✕ does not hide the ask
 await svc(`insert into public.ar_photo_wanted(item_id,name,why,removed_at) values (101,'EXAMPLE TAB','none',now())`);
 await as(OWNER,`select public.ar_photo_decide($1,false)`,[await waiting(101)]);
 e=await edit(101);assert.deepEqual([e.img,e.updated_by,e.photo_ok_at],[null,null,null]);
 assert.deepEqual([(await wanted(101)).why,(await wanted(101)).removed_at],['retake',null]);
 // his own photo goes on at once and ends what waited
 await svc(`select public.ar_photo_submit(104,$1,'${SHOOT}')`,[P(104,'eeeeeeeeeeee')]);
 await as(OWNER,`update public.ar_store_edits set img=$1, updated_by='${OWNER}' where item_id=104`,[P(104,'ffffffffffff')]);
 assert.equal((await waits()).find((r)=>r.img===P(104,'eeeeeeeeeeee')).status,'replaced');
 assert.equal((await edit(104)).img,P(104,'ffffffffffff'));
 // listing the shown ones again never brings back one he decided
 assert.equal((await svc(`select public.ar_photo_take_shown('2026-11-27 00:00+02') n`))[0].n,0);
 // a photo a user put on between the migration and the new function is listed by the second run
 await svc(`insert into public.ar_store_edits(item_id,img,updated_by) values (105,$1,'${SHOOT}') on conflict (item_id) do update set img=excluded.img, updated_by=excluded.updated_by, updated_at=now()`,[P(105,'abababababab')]);
 assert.equal((await svc(`select public.ar_photo_take_shown('2026-11-27 00:00+02') n`))[0].n,1);
 console.log('PASS: a user\'s photo waits for him; his yes shows it, his no keeps it off and asks again; a user\'s own write cannot put or wipe a photo; the day\'s photos are listed and stay shown');
})().catch((e)=>{console.error(e);process.exit(1)});
