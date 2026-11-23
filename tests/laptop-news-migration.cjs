// Migration 202611230400 (owner 2026-11-23, «الحارس»): the laptop's guard sends its lines with the laptop's sync key and the phone's voice
// (ar_sync_news, read by Tasker) says each one ONCE, right after the update warning. RUNS the real functions on an in-memory Postgres
// with just the tables ar_sync_news reads: only the laptop's key can add, at most 10 lines of 200 letters, a line that waits is not
// added twice, one line «الحارس: …», several «الحارس لقى N حاجات: …» (three, then «وكمان N»), a peek marks nothing, the guard
// stopping for 30 hours is said every 12 hours, only the owner reads the tables, and the rest of the sentence is untouched.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',OTHER='00000000-0000-4000-8000-0000000000e2';
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611230400_ar_laptop_news.sql'),'utf8');
// the live sentences of ar_sync_news are all still there, in the same order, with the guard right after the update warning
for(const s of ['تنبيه: السيستم ما اتحدثش من ','تنبيه: اللاب بطّل يبعت من ','السيستم رجع يتحدث تاني','تنبيه: اللاب ما بعتش حاجة من ','تنبيه: النواقص ماتحدّثتش من ','تحديث النواقص اترفض','طلب جديد من الموقع رقم ','طلب روشتة جديد من الموقع رقم ','رسالة جديدة من عميل في الرسايل، من ','وصل وارد من ','انت في الصيدلية، افتكر: ','السيستم اتحدث كله'])assert.ok(sql.includes(s),s);
assert.match(sql,/concat_ws\('\. ', nullif\(v_hub, ''\), nullif\(v_guard, ''\), nullif\(v_notes, ''\), nullif\(v_orders, ''\), nullif\(v_chats, ''\), nullif\(v_link, ''\), nullif\(v_warn, ''\), nullif\(v_data, ''\), nullif\(v_say, ''\)\)/);
assert.doesNotMatch(sql,/البوت/,'«السيستم», never the old word');
assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate|drop function/i);
const sha=(k)=>crypto.createHash('sha256').update(k).digest('hex');
const LAPTOP='ab'.repeat(32),PHONE='cd'.repeat(32),WRONG='ef'.repeat(32);
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
 CREATE DOMAIN "text/plain" AS text;
 CREATE TABLE public.ar_inbox_keys(key_hash text PRIMARY KEY);
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);
 CREATE TABLE public.ar_hub_watch(id int PRIMARY KEY, at timestamptz, open boolean, stuck_since timestamptz, stuck_seen timestamptz);
 CREATE TABLE public.ar_sync_alerts(kind text PRIMARY KEY, said_at timestamptz);
 CREATE TABLE public.ar_sync_log(id bigint PRIMARY KEY, at timestamptz, dry_run boolean, status text, announced_at timestamptz, data_at text);
 CREATE TABLE public.ar_store_orders(id bigint PRIMARY KEY, announced_at timestamptz, status text, items jsonb, customer_name text, total numeric, rx_paths text[]);
 CREATE TABLE public.ar_chats(id uuid PRIMARY KEY, name text, waiting int, last_from text, last_at timestamptz, announced_at timestamptz);
 CREATE TABLE public.ar_inbox(id uuid PRIMARY KEY, via text, announced_at timestamptz, received_at timestamptz, supplier text, sure int);
 CREATE TABLE public.ar_stock(data_at text);
 CREATE TABLE public.ar_presence(id int PRIMARY KEY, at_pharmacy boolean NOT NULL, since timestamptz NOT NULL, checked_at timestamptz NOT NULL);
 CREATE TABLE public.ar_notes(id bigint generated always as identity PRIMARY KEY, text text NOT NULL, place text NOT NULL DEFAULT 'pharmacy', status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now());`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public TO anon, authenticated;
 INSERT INTO public.ar_sync_keys VALUES ('${sha(LAPTOP)}', null); INSERT INTO public.ar_inbox_keys VALUES ('${sha(PHONE)}');`);
 const add=async(lines,kind='guard',key=LAPTOP)=>(await db.query(`select public.ar_laptop_news_add($1,$2,$3) r`,[key,kind,lines])).rows[0].r;
 const news=async(peek=false,key=PHONE)=>(await db.query(`select public.ar_sync_news($1,$2) r`,[key,peek])).rows[0].r;
 const waiting=async()=>(await db.query(`select count(*)::int n from public.ar_laptop_news where said_at is null`)).rows[0].n;

 // the guard's call: only the laptop's sync key (the phone's inbox key is refused), a known kind only
 await assert.rejects(()=>add(['x'],'guard','zz'),/bad key/);
 await assert.rejects(()=>add(['x'],'guard',WRONG),/bad key/);
 await assert.rejects(()=>add(['x'],'guard',PHONE),/bad key/,'the phone key cannot add');
 await assert.rejects(()=>add(['x'],'Guard;drop'),/bad kind/);
 // nothing waits: silence, and a run with no lines still says «the guard ran»
 assert.equal(await news(),'');
 assert.deepEqual(await add([]),{ok:true,added:0});
 assert.equal((await db.query(`select count(*)::int n from public.ar_laptop_beat where kind='guard' and at > now() - interval '1 minute'`)).rows[0].n,1);
 assert.ok((await db.query(`select last_used_at from public.ar_sync_keys`)).rows[0].last_used_at,'the key is marked used');
 // one line: said once with «الحارس:», a peek says it and marks nothing
 assert.deepEqual(await add(['نسخة السيرفر الاحتياطية ما اتعملتش من 30 ساعة','  ','']),{ok:true,added:1},'empty lines are skipped');
 assert.deepEqual(await add(['نسخة السيرفر الاحتياطية ما اتعملتش من 30 ساعة']),{ok:true,added:0},'a line that waits is not added twice');
 assert.equal(await news(true),'الحارس: نسخة السيرفر الاحتياطية ما اتعملتش من 30 ساعة');
 assert.equal(await news(true,LAPTOP),'الحارس: نسخة السيرفر الاحتياطية ما اتعملتش من 30 ساعة','the laptop key may peek too');
 assert.equal(await waiting(),1,'a peek marks nothing');
 assert.equal(await news(),'الحارس: نسخة السيرفر الاحتياطية ما اتعملتش من 30 ساعة');
 assert.equal(await news(),'','said once');
 // the same line the next day is said again (it is a new row once the old one was said)
 assert.deepEqual(await add(['نسخة السيرفر الاحتياطية ما اتعملتش من 30 ساعة']),{ok:true,added:1});
 assert.equal(await news(),'الحارس: نسخة السيرفر الاحتياطية ما اتعملتش من 30 ساعة');
 // several: one sentence in the order sent, three at most, then «وكمان N في تقرير الحارس»; at most 10 lines a call, 200 letters a line
 await add(['أ','ب']);
 assert.equal(await news(),'الحارس لقى 2 حاجات: أ، ب');
 const twelve=Array.from({length:12},(_,i)=>'سطر '+(i+1));
 assert.deepEqual(await add(twelve),{ok:true,added:10},'10 lines a call at most');
 assert.equal(await news(),'الحارس لقى 10 حاجات: سطر 1، سطر 2، سطر 3، وكمان 7 في تقرير الحارس');
 assert.equal(await waiting(),0);
 await add(['ل'.repeat(260)]);
 assert.equal((await db.query(`select char_length(body)::int n from public.ar_laptop_news order by id desc limit 1`)).rows[0].n,200,'a line is cut at 200 letters');
 await news();
 // the guard itself stopped: its last run over 30 hours old is said, again only after 12 hours; a peek marks nothing
 await db.query(`update public.ar_laptop_beat set at = now() - interval '31 hours' where kind='guard'`);
 assert.equal(await news(true),'الحارس ما اشتغلش من 31 ساعة، شوف اللابتوب');
 assert.equal(await news(),'الحارس ما اشتغلش من 31 ساعة، شوف اللابتوب');
 assert.equal(await news(),'','not again within 12 hours');
 await db.query(`update public.ar_sync_alerts set said_at = now() - interval '13 hours' where kind='guard_stale'`);
 await add(['الديسك C فاضي فيه 8 جيجا بس']);
 // a new run brings the beat back: only its line is said
 assert.equal(await news(),'الحارس: الديسك C فاضي فيه 8 جيجا بس');
 await db.query(`update public.ar_laptop_beat set at = now() - interval '40 hours' where kind='guard'`);
 await db.query(`insert into public.ar_laptop_news(kind,body) values ('guard','خطوة «المخزون» وقعت في آخر تحديث')`);
 assert.equal(await news(),'الحارس: خطوة «المخزون» وقعت في آخر تحديث. الحارس ما اشتغلش من 40 ساعة، شوف اللابتوب','both in one sentence');
 await add([]);
 // the rest of the sentence: the update warning first, the guard right after it, then the notes
 await add(['مهمة «دمج أرقام الموبايل» وقعت آخر مرة']);
 await db.query(`insert into public.ar_hub_watch values (1, now(), true, now() - interval '50 minutes', now() - interval '20 minutes')`);
 await db.query(`insert into public.ar_presence values (1, true, now(), now())`);
 await db.query(`insert into public.ar_notes(text) values ('كلم المحاسب')`);
 assert.equal(await news(),'تنبيه: السيستم ما اتحدثش من 50 دقيقة والصيدلية شغالة، شوف اللابتوب. الحارس: مهمة «دمج أرقام الموبايل» وقعت آخر مرة. انت في الصيدلية، افتكر: كلم المحاسب');
 // only the owner reads the tables; another signed-in user sees nothing, a visitor is refused
 await db.exec(`SET ROLE authenticated; SELECT set_config('test.uid', '${OWNER}', false);`);
 assert.ok((await db.query(`select count(*)::int n from public.ar_laptop_news`)).rows[0].n>0,'the owner reads');
 await assert.rejects(()=>db.query(`insert into public.ar_laptop_news(kind,body) values ('guard','x')`),/permission denied/);
 await db.exec(`SELECT set_config('test.uid', '${OTHER}', false);`);
 assert.equal((await db.query(`select count(*)::int n from public.ar_laptop_news`)).rows[0].n,0,'another user sees nothing');
 assert.equal((await db.query(`select count(*)::int n from public.ar_laptop_beat`)).rows[0].n,0);
 await db.exec(`RESET ROLE; SET ROLE anon;`);
 await assert.rejects(()=>db.query(`select * from public.ar_laptop_news`),/permission denied/);
 // the visitor's role (the laptop and the phone use the public key) can call both functions
 assert.deepEqual((await db.query(`select public.ar_laptop_news_add($1,'guard',$2) r`,[LAPTOP,['من الزائر']])).rows[0].r,{ok:true,added:1});
 assert.equal((await db.query(`select public.ar_sync_news($1,false) r`,[PHONE])).rows[0].r,'الحارس: من الزائر');
 await db.exec('RESET ROLE');
 console.log('PASS: laptop news (the guard): laptop key only, 10 lines of 200 letters, no double line, said once right after the update warning (three then «وكمان N»), a peek marks nothing, «الحارس ما اشتغلش» every 12 hours, owner-only tables');
})().catch((e)=>{console.error(e);process.exit(1)});
