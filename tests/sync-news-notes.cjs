// The phone's voice reminds him of his notes when he reaches the pharmacy (owner 2026-11-15): migration 202611152200 = the live
// ar_sync_news + block 3d. RUNS the function on an in-memory Postgres with just the tables it reads: said ONCE per arrival, three
// notes at most then «وكمان N», only the notes that wait for the pharmacy, nothing when the laptop's word is old or he is out,
// a peek says nothing and marks nothing, an arrival with no notes is used up, the rest of the sentence is untouched.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir=path.join(__dirname,'..','supabase','migrations');
const notes=fs.readFileSync(path.join(dir,'202611152200_ar_sync_news_notes.sql'),'utf8');
const prev=fs.readFileSync(path.join(dir,'202611141400_ar_chat_suppliers.sql'),'utf8');
// the old sentences are all still there
for(const s of ['تنبيه: البوت ما اتحدثش من ','تنبيه: اللاب بطّل يبعت من ','البوت رجع يتحدث تاني','طلب جديد من الموقع رقم ','البوت اتحدث كله','تحديث النواقص اترفض','رسالة جديدة من عميل في الرسايل، من ','وصل وارد من '])assert.ok(notes.includes(s),s);
assert.match(notes,/security definer/i);assert.match(notes,/set search_path to ''/i);
assert.match(notes,/nullif\(v_hub, ''\), nullif\(v_notes, ''\), nullif\(v_orders, ''\), nullif\(v_chats, ''\), nullif\(v_link, ''\)/,'after the hub warning, before the orders');
assert.doesNotMatch(notes.replace(/--.*$/gm,''),/drop table|truncate/i);
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE DOMAIN "text/plain" AS text;
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
 await db.exec(notes);await db.exec(notes); // applied twice: safe
 const KEY='ab'.repeat(16);
 await db.query(`insert into public.ar_inbox_keys values ($1)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 const news=async(peek=false)=>(await db.query(`select public.ar_sync_news($1,$2) r`,[KEY,peek])).rows[0].r;
 const setPres=(inn,sinceMin,checkedMin)=>db.query(`insert into public.ar_presence values (1,$1, now() - make_interval(mins => $2), now() - make_interval(mins => $3)) on conflict (id) do update set at_pharmacy=excluded.at_pharmacy, since=excluded.since, checked_at=excluded.checked_at`,[inn,sinceMin,checkedMin]);
 const note=(t,place='pharmacy',status='open',ageMin=0)=>db.query(`insert into public.ar_notes(text,place,status,created_at) values ($1,$2,$3, now() - make_interval(mins => $4))`,[t,place,status,ageMin]);
 await assert.rejects(()=>db.query(`select public.ar_sync_news('zz')`),/bad key/);
 // nothing known: silence (the function works with no presence row at all)
 assert.equal(await news(),'');
 // he is NOT in the pharmacy: silence even with notes
 await note('اسأل على فاتورة الفتح','pharmacy','open',300);
 await setPres(false,5,1);assert.equal(await news(),'');
 // an old word (older than 25 minutes) is not a position
 await setPres(true,60,40);assert.equal(await news(),'');
 // he arrives: one note, said as «افتكر»; a peek says it but marks nothing
 await setPres(true,2,1);
 assert.equal(await news(true),'انت في الصيدلية، افتكر: اسأل على فاتورة الفتح');
 assert.equal(await news(true),'انت في الصيدلية، افتكر: اسأل على فاتورة الفتح','a peek leaves it to say');
 assert.equal(await news(),'انت في الصيدلية، افتكر: اسأل على فاتورة الفتح');
 assert.equal(await news(),'','said once for this arrival');
 assert.equal(await news(true),'');
 // the same arrival, a new note: not said (he is there, he wrote it)
 await note('كلم المحاسب');assert.equal(await news(),'');
 // he leaves and comes back: a new arrival says what waits, in the order written, only the ones for the pharmacy
 await setPres(false,0,0);assert.equal(await news(),'');
 await note('فكرة بس','any');await note('خلصت دي','pharmacy','done');await note('ملغية','pharmacy','cancelled');
 await setPres(true,0,0);
 assert.equal(await news(),'انت في الصيدلية، عندك 2 حاجة تفتكرها: اسأل على فاتورة الفتح، كلم المحاسب');
 assert.equal(await news(),'');
 // many notes: three, then «وكمان N»; a long note is cut at 80 letters
 await note('تلات');await note('أربعة');await note('ا'.repeat(120));
 await setPres(false,0,0);await news();await setPres(true,0,0);
 const many=await news();
 assert.match(many,/^انت في الصيدلية، عندك 5 حاجة تفتكرها: اسأل على فاتورة الفتح، كلم المحاسب، تلات، وكمان 2$/);
 await note('ب'.repeat(120),'pharmacy','open',-5);
 await setPres(false,0,0);await news();await setPres(true,0,0);
 assert.ok(!/ب{81}/.test(await news()),'a note is cut at 80 letters');
 // an arrival with no notes waiting is used up: a note written later is not read back
 await db.query(`update public.ar_notes set status='done'`);
 await setPres(false,0,0);await news();await setPres(true,0,0);
 assert.equal(await news(),'');
 await note('جديدة بعد الوصول');assert.equal(await news(),'');
 // the rest of the sentence is still joined with it: an update warning comes first
 await setPres(false,0,0);await news();await setPres(true,0,0);
 await db.query(`insert into public.ar_hub_watch values (1, now(), true, now() - interval '50 minutes', now() - interval '20 minutes')`);
 const both=await news();
 assert.match(both,/^تنبيه: البوت ما اتحدثش من 50 دقيقة والصيدلية شغالة، شوف اللابتوب\. انت في الصيدلية، افتكر: جديدة بعد الوصول$/);
 console.log('PASS: sync news notes: said once per arrival (three at most, then «وكمان N»), only the pharmacy notes, silent when out or the word is old, a peek marks nothing, after the hub warning');
})().catch((e)=>{console.error(e);process.exit(1)});
