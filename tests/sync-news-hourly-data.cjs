// Migration 202611112100 (ar_sync_news hourly data): after every hourly hub run the phone says «الداتا اتحدثت، لحد الساعة ...»,
// once per store send, and only when the stock has caught up with the same data. The shortage sentence and the rest stay as they were.
// Runs the migrations on an in-memory Postgres. Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const KEY='c'.repeat(64),HASH=crypto.createHash('sha256').update(KEY).digest('hex');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE DOMAIN public."text/plain" AS text;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, label text, last_used_at timestamptz);
 CREATE TABLE public.ar_inbox_keys(key_hash text PRIMARY KEY);
 CREATE TABLE public.ar_sync_log(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), source text, data_at text,
  dry_run boolean NOT NULL DEFAULT false, status text NOT NULL, sent int DEFAULT 0, listed int DEFAULT 0, added int DEFAULT 0, reactivated int DEFAULT 0, kept int DEFAULT 0,
  leaving int DEFAULT 0, active_before int DEFAULT 0, active_after int DEFAULT 0, without_arabic int DEFAULT 0, details jsonb, announced_at timestamptz);
 CREATE TABLE public.ar_sync_alerts(kind text PRIMARY KEY CHECK (char_length(kind) BETWEEN 1 AND 40), said_at timestamptz);
 CREATE TABLE public.ar_shortages(name_key text, is_active boolean);
 CREATE TABLE public.ar_names(name_key text);
 CREATE TABLE public.ar_store_orders(id bigint PRIMARY KEY, announced_at timestamptz, status text, items jsonb, customer_name text, total numeric, rx_paths text[]);
 CREATE TABLE public.ar_stock(item_id bigint PRIMARY KEY, data_at text, updated_at timestamptz DEFAULT now());
 CREATE FUNCTION public.ar_spoken_name(text) RETURNS text LANGUAGE sql AS $$ select $1 $$;`);
 await db.query(`INSERT INTO public.ar_sync_keys(key_hash,label) VALUES ($1,'laptop')`,[HASH]);
 const before=fs.readFileSync('supabase/migrations/202611090700_ar_sync_news_heartbeat.sql','utf8');
 const sql=fs.readFileSync('supabase/migrations/202611112100_ar_sync_news_hourly_data.sql','utf8');
 const reset=async()=>{await db.exec(`DELETE FROM public.ar_sync_log; DELETE FROM public.ar_sync_alerts; DELETE FROM public.ar_shortages; DELETE FROM public.ar_names; DELETE FROM public.ar_store_orders; DELETE FROM public.ar_stock;`)};
 // the store send is written already «said» (that is what ar_store_sync does), so block 2) never reads it as a shortage update
 const store=(dataAt,minutesAgo=2,dry=false)=>db.query(`INSERT INTO public.ar_sync_log(at,source,data_at,status,announced_at,dry_run) VALUES (now() - ($1 || ' minutes')::interval,'store r1',$2,'STORE_OK',now(),$3)`,[String(minutesAgo),dataAt,dry]);
 const list=(hoursAgo,said,active=490)=>db.query(`INSERT INTO public.ar_sync_log(at,source,status,active_after,announced_at) VALUES (now() - ($1 || ' hours')::interval,'laptop','ok',$2,${said?'now()':'NULL'})`,[String(hoursAgo),active]);
 const stock=(dataAt,n=3)=>db.query(`INSERT INTO public.ar_stock(item_id,data_at) SELECT g,$1 FROM generate_series(1,${n}) g ON CONFLICT (item_id) DO UPDATE SET data_at=excluded.data_at`,[dataAt]);
 const news=async(peek=false)=>String((await db.query(`SELECT public.ar_sync_news($1,$2) AS t`,[KEY,peek])).rows[0].t);
 const alerts=async()=>(await db.query(`SELECT kind FROM public.ar_sync_alerts ORDER BY kind`)).rows.map(r=>r.kind);

 // BEFORE (the live function, 202611090700): an hourly store + stock send says nothing at all
 await db.exec(before);
 await reset();await store('2026-11-11 19:57:03');await stock('2026-11-11 19:57:03');
 assert.equal(await news(),'','before: the hourly update was silent, that is what this migration changes');

 // the new function (applied twice: safe)
 await db.exec(sql);await db.exec(sql);

 // an hourly run finished (store, then stock with the same data): said once, with the data time
 await reset();await store('2026-11-11 19:57:03');await stock('2026-11-11 19:57:03');
 assert.equal(await news(true),'الداتا اتحدثت، لحد الساعة 7 و57 دقيقة');assert.deepEqual(await alerts(),[],'peek does not record');
 assert.equal(await news(),'الداتا اتحدثت، لحد الساعة 7 و57 دقيقة');assert.deepEqual(await alerts(),['data']);
 assert.equal(await news(),'','said once, not again until the next run');
 // the next hourly run: said again
 await store('2026-11-11 20:27:43',0);await stock('2026-11-11 20:27:43');
 assert.equal(await news(),'الداتا اتحدثت، لحد الساعة 8 و27 دقيقة');
 assert.equal(await news(),'');

 // the store items went but the stock is not done yet (older data, or a stock batch that failed): nothing yet
 await reset();await stock('2026-11-11 18:57:03');await store('2026-11-11 19:57:03');
 assert.equal(await news(),'','stock still on the older data: wait');assert.deepEqual(await alerts(),[]);
 await db.query(`UPDATE public.ar_stock SET data_at='2026-11-11 19:57:03' WHERE item_id=1`);
 assert.equal(await news(),'','only part of the stock caught up: still wait');
 await stock('2026-11-11 19:57:03');
 assert.match(await news(),/^الداتا اتحدثت، لحد الساعة 7 و57 دقيقة$/,'the stock caught up: said now');
 // no stock at all, or no store send, or a dry run: nothing
 await reset();await store('2026-11-11 19:57:03');assert.equal(await news(),'','no stock rows');
 await reset();await stock('2026-11-11 19:57:03');assert.equal(await news(),'','no store send');
 await reset();await store('2026-11-11 19:57:03',2,true);await stock('2026-11-11 19:57:03');assert.equal(await news(),'','dry run');
 // a store send without a readable data time: the sentence without the time
 await reset();await store(null);await stock('2026-11-11 19:57:03');assert.equal(await news(),'الداتا اتحدثت');

 // the spoken time
 for(const [t,say] of [['2026-11-11 20:00:10','8'],['2026-11-11 20:01:00','8 ودقيقة'],['2026-11-11 20:02:00','8 ودقيقتين'],
  ['2026-11-11 20:05:00','8 و5 دقايق'],['2026-11-11 20:10:00','8 و10 دقايق'],['2026-11-11 20:11:00','8 و11 دقيقة'],['2026-11-11 20:15:00','8 وربع'],
  ['2026-11-11 20:30:00','8 ونص'],['2026-11-11 12:45:00','12 و45 دقيقة'],['2026-11-12 00:20:00','12 و20 دقيقة'],['2026-11-11 10:50:00','10 و50 دقيقة'],['2026-11-11T23:59:00','11 و59 دقيقة']]){
  await reset();await store(t);await stock(t);
  assert.equal(await news(),'الداتا اتحدثت، لحد الساعة '+say,t);
 }

 // with a shortage update in the same run (18:30, 20:30, 22:30, night): the data sentence first, then the shortages, as before
 await reset();await list(0,false,494);await store('2026-11-11 20:27:43');await stock('2026-11-11 20:27:43');
 assert.equal(await news(),'الداتا اتحدثت، لحد الساعة 8 و27 دقيقة. النواقص اتحدثت، 494 صنف، مفيش جديد');
 assert.equal(await news(),'');
 // a store site order is still said first
 await reset();await db.exec(`INSERT INTO public.ar_store_orders(id,status,items,customer_name,total,rx_paths) VALUES (7,'new','[{"a":1}]','أحمد',120,'{}')`);
 await store('2026-11-11 20:27:43');await stock('2026-11-11 20:27:43');
 assert.equal(await news(),'طلب جديد من الموقع رقم 7، أحمد، 1 صنف، 120 جنيه. الداتا اتحدثت، لحد الساعة 8 و27 دقيقة');

 // regression: the heartbeat warnings are unchanged
 await reset();await list(20,true);await store('2026-11-11 19:57:03',60);
 assert.equal(await news(),'','list quiet for 20 hours, laptop alive, no stock rows: silence as before');
 await reset();await list(31,true);await store('2026-11-11 19:57:03',60);
 assert.match(await news(),/^تنبيه: النواقص ماتحدّثتش من 31 ساعة، دوس حدّث النواقص دلوقتي أو شوف اللابتوب$/);
 await reset();await list(40,true);await store('2026-11-11 13:00:00',7*60);await stock('2026-11-11 13:00:00');
 const dead=await news();assert.match(dead,/^تنبيه: اللاب ما بعتش حاجة من 7 ساعة، شوف اللابتوب\. الداتا اتحدثت، لحد الساعة 1$/,'the last run is said once, after the warning');
 assert.deepEqual(await alerts(),['data','stale']);
 // a wrong key is refused
 await assert.rejects(()=>db.query(`SELECT public.ar_sync_news($1,false)`,['d'.repeat(64)]),/bad key/);
 console.log('sync-news-hourly-data ok');
})().catch(e=>{console.error(e);process.exit(1)});
