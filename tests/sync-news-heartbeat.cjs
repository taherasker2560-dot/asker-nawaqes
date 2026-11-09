// Migration 202611090700 (ar_sync_news heartbeat): the shortage list is sent twice a day only, so the phone's «stopped updating»
// warning must count any laptop send (store / stock items every 2 hours too), and the list has its own 30-hour limit.
// Runs the migration on an in-memory Postgres. Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
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
 CREATE TABLE public.ar_sync_alerts(kind text PRIMARY KEY, said_at timestamptz);
 CREATE TABLE public.ar_shortages(name_key text, is_active boolean);
 CREATE TABLE public.ar_names(name_key text);
 CREATE TABLE public.ar_store_orders(id bigint PRIMARY KEY, announced_at timestamptz, status text, items jsonb, customer_name text, total numeric, rx_paths text[]);
 CREATE FUNCTION public.ar_spoken_name(text) RETURNS text LANGUAGE sql AS $$ select $1 $$;`);
 await db.query(`INSERT INTO public.ar_sync_keys(key_hash,label) VALUES ($1,'laptop')`,[HASH]);
 const oldSql=fs.readFileSync('supabase/migrations/202611090700_ar_sync_news_heartbeat.sql','utf8');
 const sql=oldSql;
 const reset=async()=>{await db.exec(`DELETE FROM public.ar_sync_log; DELETE FROM public.ar_sync_alerts; DELETE FROM public.ar_shortages; DELETE FROM public.ar_names; DELETE FROM public.ar_store_orders;`)};
 const log=(status,hoursAgo,said=true,extra={})=>db.query(`INSERT INTO public.ar_sync_log(at,source,status,active_after,announced_at,dry_run) VALUES (now() - ($1 || ' hours')::interval,'laptop',$2,$3,${said?`now() - ($1 || ' hours')::interval`:'NULL'},$4)`,[String(hoursAgo),status,extra.active??490,!!extra.dry]);
 const news=async(peek=false)=>String((await db.query(`SELECT public.ar_sync_news($1,$2) AS t`,[KEY,peek])).rows[0].t);
 const alerts=async()=>(await db.query(`SELECT kind FROM public.ar_sync_alerts ORDER BY kind`)).rows.map(r=>r.kind);

 // the BEFORE state (the function that was live until now; only when OLD_FUNCTION points to its saved text, not in CI):
 // the list is quiet for 20 hours although the laptop sent store items an hour ago, and the old function warned for nothing
 if(process.env.OLD_FUNCTION&&fs.existsSync(process.env.OLD_FUNCTION)){
  await db.exec(fs.readFileSync(process.env.OLD_FUNCTION,'utf8').replace(/^[\s\S]*?(?=CREATE OR REPLACE FUNCTION)/,''));
  await reset();await log('ok',20);await log('STORE_OK',1);
  assert.match(await news(true),/ماتحدّثتش من 20 ساعة/,'the old function warned for nothing: that is what this migration fixes');
 }

 // the new function (applied twice: safe)
 await db.exec(sql);await db.exec(sql);
 await reset();await log('ok',20);await log('STORE_OK',1);
 assert.equal(await news(),'','list quiet for 20 hours but the laptop is alive and said nothing new: silence');
 assert.deepEqual(await alerts(),[]);
 // the list is 31 hours old (the night run did not send): its own warning, once, and only the list
 await reset();await log('ok',31);await log('STORE_OK',1);
 assert.match(await news(true),/النواقص ماتحدّثتش من 31 ساعة، دوس حدّث النواقص دلوقتي/);assert.deepEqual(await alerts(),[],'peek does not record');
 const w=await news();assert.match(w,/ماتحدّثتش من 31 ساعة/);assert.deepEqual(await alerts(),['stale_list']);
 assert.equal(await news(),'','said once, not again within 6 hours');
 await db.query(`UPDATE public.ar_sync_alerts SET said_at = now() - interval '7 hours'`);assert.match(await news(),/31 ساعة/,'again after 6 hours');
 // the laptop sent nothing at all for 7 hours: the «alive» warning; the list warning is not said on top of it
 await reset();await log('ok',40);await log('STORE_OK',7);
 const dead=await news();assert.match(dead,/اللاب ما بعتش حاجة من 7 ساعة، شوف اللابتوب/);assert.doesNotMatch(dead,/النواقص ماتحدّثتش/);assert.deepEqual(await alerts(),['stale']);
 // dry runs and refused/other statuses do not count as sends
 await reset();await log('ok',2,true,{dry:true});await log('refused_empty',1);
 assert.equal(await news(true),'','nothing real sent yet: no warning (no first send to measure from)');
 // an update not said yet is still said as before
 await reset();await log('ok',3,false,{active:494});await log('STORE_OK',1);
 assert.match(await news(),/النواقص اتحدثت، 494 صنف، مفيش جديد/);
 assert.equal(await news(),'','said once');
 // a wrong key is refused
 await assert.rejects(()=>db.query(`SELECT public.ar_sync_news($1,false)`,['d'.repeat(64)]),/bad key/);
 console.log('sync-news-heartbeat ok');
})().catch(e=>{console.error(e);process.exit(1)});
