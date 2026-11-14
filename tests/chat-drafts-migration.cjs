// «الرسايل», part 2 (owner 2026-11-14): migration 202611141800 on an in-memory Postgres. The pharmacy's decision on the bot's
// suggestion (owner or staff with «خدمة العملاء»; only a waiting one changes; edited keeps the text that went), the owner's
// auto switches (known kinds only), one suggestion per customer message. Run with PGLITE_MODULE pointing to @electric-sql/pglite.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.join(__dirname,'..','supabase','migrations'),mig=(f)=>fs.readFileSync(path.join(dir,f),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE SCHEMA storage;
 CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(), bucket_id text, name text, created_at timestamptz DEFAULT now());
 CREATE TABLE public.ar_staff(user_id uuid PRIMARY KEY, perms text[], active boolean);
 CREATE FUNCTION public.ar_staff_can(p text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active and s.perms && p) $$;
 CREATE DOMAIN public."text/plain" AS text;
 CREATE TABLE public.ar_suppliers(name text PRIMARY KEY, phone text, created_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.ar_inbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), received_at timestamptz NOT NULL DEFAULT now(), sender text NOT NULL, supplier text, kind text NOT NULL, sure int NOT NULL DEFAULT 0);
 CREATE TABLE public.ar_hub_watch(id int PRIMARY KEY, at timestamptz, open boolean, stuck_since timestamptz, stuck_seen timestamptz);
 CREATE TABLE public.ar_sync_log(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), data_at text, dry_run boolean NOT NULL DEFAULT false, status text NOT NULL, announced_at timestamptz);`);
 for(const f of ['202611132330_ar_chat.sql','202611140130_ar_sync_news_chat.sql','202611140200_ar_chat_open_limits.sql','202611140300_ar_chat_delete.sql','202611141400_ar_chat_suppliers.sql'])await db.exec(mig(f));
 const sql=mig('202611141800_ar_chat_drafts.sql');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const as=(uid)=>db.query(`select set_config('test.uid',$1,false)`,[uid||'']);
 const chat=(await one(`insert into public.ar_chats(secret,name,phone) values ($1,'سامية','01012345678') returning id`,['a'.repeat(64)])).id;
 const mk=async(forMsg,kind='availability')=>(await one(`insert into public.ar_chat_drafts(chat_id,for_msg,kind,body,facts) values ($1,$2,$3,'أيوه متوفر','["x"]') returning id`,[chat,forMsg,kind])).id;
 const done=(id,o,f)=>one(`select public.ar_chat_draft_done($1,$2,$3) r`,[id,o,f||null]).then(x=>x.r);
 const d1=await mk(1),d2=await mk(2),d3=await mk(3,'rx');
 await assert.rejects(()=>mk(1),/ar_chat_drafts_one|duplicate/,'one suggestion per customer message');
 await assert.rejects(()=>db.query(`insert into public.ar_chat_drafts(chat_id,for_msg,kind,body) values ($1,9,'weather','x')`,[chat]),/check/);
 // nobody signed in, or staff without «خدمة العملاء»: refused
 await as('');await assert.rejects(()=>done(d1,'sent'),/not allowed/);
 const STAFF='00000000-0000-4000-8000-0000000000c1';
 await db.query(`insert into public.ar_staff values ($1,'{tempsale}',true)`,[STAFF]);await as(STAFF);await assert.rejects(()=>done(d1,'sent'),/not allowed/);
 // staff with «خدمة العملاء» and the owner decide
 await db.query(`update public.ar_staff set perms='{care}'`);
 assert.deepEqual(await done(d1,'sent'),{ok:true});
 assert.deepEqual(await done(d1,'skipped'),{ok:false},'only a waiting one changes');
 await as(OWNER);
 assert.deepEqual(await done(d2,'edited','  أيوه متوفر بـ 59 ج  '),{ok:true});
 assert.deepEqual(await done(d3,'maybe'),{ok:false,error:'outcome'});
 assert.deepEqual(await done(d3,'skipped','ignored'),{ok:true});
 const rows=(await db.query(`select id,status,final_body,decided_by is not null decided from public.ar_chat_drafts order by id`)).rows;
 assert.deepEqual(rows.map(r=>[r.status,r.final_body,r.decided]),[['sent',null,true],['edited','أيوه متوفر بـ 59 ج',true],['skipped',null,true]]);
 // the auto switches: the owner only, known kinds only, kept sorted and once
 assert.deepEqual((await one(`select auto_kinds from public.ar_chat_settings where id=1`)).auto_kinds,[]);
 await as(STAFF);await assert.rejects(()=>db.query(`select public.ar_chat_auto_set(array['availability'])`),/owner only/);
 await as(OWNER);
 assert.deepEqual((await one(`select public.ar_chat_auto_set(array['weather']) r`)).r,{ok:false,error:'kind'});
 assert.deepEqual((await one(`select public.ar_chat_auto_set(array['order','availability','order']) r`)).r,{ok:true,auto_kinds:['availability','order']});
 assert.deepEqual((await one(`select auto_kinds from public.ar_chat_settings where id=1`)).auto_kinds,['availability','order']);
 assert.deepEqual((await one(`select public.ar_chat_auto_set('{}'::text[]) r`)).r,{ok:true,auto_kinds:[]});
 // a chat deleted: its suggestions go with it
 await db.query(`delete from public.ar_chats where id=$1`,[chat]);
 assert.equal((await one(`select count(*)::int n from public.ar_chat_drafts`)).n,0);
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate/i);
 assert.doesNotMatch(sql,/using \(auth\.uid\(\)/,'policies use (select auth.uid())');
 for(const f of ['ar_chat_draft_done','ar_chat_auto_set'])assert.match(sql,new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from anon;`),f);
 console.log('PASS: chat drafts migration: decisions by owner / staff with care (waiting ones only), auto switches owner only, one suggestion per message');
})().catch(e=>{console.error(e);process.exit(1)});
