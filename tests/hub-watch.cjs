// Migration 202611131800 (owner 2026-11-13 «أيوه نبّهني»): the phone says it when the bot stops updating while the pharmacy
// works (the laptop's watcher writes ar_hub_watch; ar_sync_news says it in block 0). Runs on an in-memory Postgres. Run with
// PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const KEY='c'.repeat(64),HASH=crypto.createHash('sha256').update(KEY).digest('hex');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ select null::uuid $$;
 CREATE DOMAIN public."text/plain" AS text;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, label text, last_used_at timestamptz);
 CREATE TABLE public.ar_inbox_keys(key_hash text PRIMARY KEY);
 CREATE TABLE public.ar_sync_log(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), source text, data_at text,
  dry_run boolean NOT NULL DEFAULT false, status text NOT NULL, sent int DEFAULT 0, listed int DEFAULT 0, added int DEFAULT 0, reactivated int DEFAULT 0, kept int DEFAULT 0,
  leaving int DEFAULT 0, active_before int DEFAULT 0, active_after int DEFAULT 0, without_arabic int DEFAULT 0, details jsonb, announced_at timestamptz);
 CREATE TABLE public.ar_sync_alerts(kind text PRIMARY KEY, said_at timestamptz);
 CREATE TABLE public.ar_store_orders(id bigint PRIMARY KEY, announced_at timestamptz, status text, items jsonb, customer_name text, total numeric, rx_paths text[]);
 CREATE TABLE public.ar_store_items(id bigint PRIMARY KEY, name text NOT NULL, status text NOT NULL CHECK (status IN ('available','on_order','unavailable')),
  price numeric, cat text, needs_rx boolean NOT NULL DEFAULT false, is_listed boolean NOT NULL DEFAULT true, seen_run text, data_at text,
  updated_at timestamptz NOT NULL DEFAULT now(), arabic_name text, hidden boolean NOT NULL DEFAULT false, popular_rank integer);
 CREATE FUNCTION public.ar_store_fill_arabic() RETURNS int LANGUAGE sql AS $$ select 0 $$;`);
 await db.query(`INSERT INTO public.ar_sync_keys(key_hash,label) VALUES ($1,'laptop')`,[HASH]);
 await db.exec(fs.readFileSync('supabase/migrations/202611092230_ar_stock.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/202611121400_ar_hub_every_10min.sql','utf8'));
 const sql=fs.readFileSync('supabase/migrations/202611131800_ar_hub_watch.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe

 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const ago=(min)=>min==null?null:new Date(Date.now()-min*60e3).toISOString();
 const beat=(open,stuckMin,goodMin,detail='',key=KEY)=>one(`SELECT public.ar_hub_heartbeat($1,$2,$3::timestamptz,$4::timestamptz,$5) AS r`,[key,open,ago(stuckMin),ago(goodMin),detail]).then(x=>x.r);
 const news=async(peek=false)=>String((await db.query(`SELECT public.ar_sync_news($1,$2) AS t`,[KEY,peek])).rows[0].t);
 const shift=(col,min)=>db.query(`UPDATE public.ar_hub_watch SET ${col} = ${col} - ($1 || ' minutes')::interval`,[String(min)]);
 const said=async()=>(await db.query(`SELECT kind FROM public.ar_sync_alerts WHERE kind LIKE 'hub_%' ORDER BY kind`)).rows.map(r=>r.kind);
 // a fresh store send so the old blocks stay quiet (the laptop is alive, «البوت اتحدث كله» already said)
 await db.exec(`INSERT INTO public.ar_sync_log(at,source,status,data_at,announced_at) VALUES (now(),'store delta','STORE_OK','2026-11-13 17:00:00',now());
  INSERT INTO public.ar_sync_alerts(kind,said_at) VALUES ('data', now())`);

 // no watcher row yet: nothing new
 assert.equal(await news(),'');
 // up to date
 let r=await beat(true,null,2);assert.equal(r.stuck_since,null);
 assert.equal(await news(),'','up to date: silence');
 // a copy waits 40 minutes, but the laptop says so only now (it just started): not yet
 await beat(true,40,45,'الاستعادة فشلت');
 assert.equal(await news(),'','reported stuck for less than 10 minutes: wait (a laptop that just started catches up)');
 // 10 minutes later (still behind): the warning, once, then again after 30 minutes
 await shift('stuck_seen',11);
 assert.match(await news(true),/^تنبيه: البوت ما اتحدثش من 40 دقيقة والصيدلية شغالة، شوف اللابتوب$/);
 assert.deepEqual(await said(),[],'peek does not record');
 assert.match(await news(),/البوت ما اتحدثش من 40 دقيقة/);assert.deepEqual(await said(),['hub_alert']);
 assert.equal(await news(),'','not again within 30 minutes');
 await db.query(`UPDATE public.ar_sync_alerts SET said_at = now() - interval '31 minutes' WHERE kind='hub_alert'`);
 assert.match(await news(),/البوت ما اتحدثش/,'again after 30 minutes');
 // the pharmacy closed (no copies now): no more warnings although a copy is still behind
 await beat(false,200,230);await shift('stuck_seen',60);
 await db.query(`UPDATE public.ar_sync_alerts SET said_at = now() - interval '31 minutes' WHERE kind='hub_alert'`);
 assert.equal(await news(),'','closed: quiet');
 // fixed: «البوت رجع يتحدث تاني», once
 await beat(true,null,1);
 assert.equal(await news(),'البوت رجع يتحدث تاني');assert.deepEqual(await said(),['hub_alert','hub_back']);
 assert.equal(await news(),'','said once');
 // the laptop went silent 35 minutes ago while the pharmacy was open
 await beat(true,null,3);await shift('at',35);
 assert.match(await news(),/^تنبيه: اللاب بطّل يبعت من 35 دقيقة والصيدلية شغالة، شوف اللابتوب$/);
 // it comes back
 await beat(true,null,1);assert.equal(await news(),'البوت رجع يتحدث تاني');
 // silent but the pharmacy was closed: quiet
 await beat(false,null,300);await shift('at',90);assert.equal(await news(),'');
 // long hours are said in hours; together with a store order the warning comes first
 await beat(true,185,190);await shift('stuck_seen',20);
 await db.query(`UPDATE public.ar_sync_alerts SET said_at = now() - interval '31 minutes' WHERE kind='hub_alert'`);
 await db.exec(`INSERT INTO public.ar_store_orders(id,status,items,customer_name,total,rx_paths) VALUES (7,'new','[]','أحمد',0,'{}')`);
 assert.match(await news(),/^تنبيه: البوت ما اتحدثش من 3 ساعة والصيدلية شغالة، شوف اللابتوب\. طلب روشتة جديد من الموقع رقم 7، أحمد$/);
 // last_good is kept when the laptop sends none; a wrong key is refused
 await beat(true,null,null);assert.ok((await one(`SELECT last_good FROM public.ar_hub_watch`)).last_good,'last_good kept');
 await assert.rejects(()=>beat(true,null,1,'',''+'d'.repeat(64)),/bad key/);
 await assert.rejects(()=>db.query(`SELECT public.ar_sync_news($1,false)`,['d'.repeat(64)]),/bad key/);
 // the old blocks still work: 7 hours without any send
 await db.exec(`DELETE FROM public.ar_sync_log; DELETE FROM public.ar_sync_alerts; DELETE FROM public.ar_hub_watch; DELETE FROM public.ar_store_orders;
  INSERT INTO public.ar_sync_log(at,source,status,announced_at) VALUES (now() - interval '7 hours','laptop','STORE_OK',now())`);
 assert.match(await news(),/اللاب ما بعتش حاجة من 7 ساعة/);
 console.log('hub-watch ok');
})().catch(e=>{console.error(e);process.exit(1)});
