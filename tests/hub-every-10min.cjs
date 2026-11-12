// Migration 202611121400 (the hub every ~10 minutes): store items and stock sent as changes only, and the voice
// «البوت اتحدث كله …» at most once an hour. Runs on an in-memory Postgres. Run with PGLITE_MODULE pointing to an installed
// @electric-sql/pglite package.
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
 -- the live ar_store_items (its columns as on the server)
 CREATE TABLE public.ar_store_items(id bigint PRIMARY KEY, name text NOT NULL, status text NOT NULL CHECK (status IN ('available','on_order','unavailable')),
  price numeric, cat text, needs_rx boolean NOT NULL DEFAULT false, is_listed boolean NOT NULL DEFAULT true, seen_run text, data_at text,
  updated_at timestamptz NOT NULL DEFAULT now(), arabic_name text, hidden boolean NOT NULL DEFAULT false, popular_rank integer);
 CREATE TABLE public.fill_calls(n int); INSERT INTO public.fill_calls VALUES (0);
 CREATE FUNCTION public.ar_store_fill_arabic() RETURNS int LANGUAGE sql AS $$ update public.fill_calls set n = n + 1 returning 0 $$;`);
 await db.query(`INSERT INTO public.ar_sync_keys(key_hash,label) VALUES ($1,'laptop')`,[HASH]);
 await db.exec(fs.readFileSync('supabase/migrations/202611092230_ar_stock.sql','utf8'));
 const sql=fs.readFileSync('supabase/migrations/202611121400_ar_hub_every_10min.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const J=(x)=>JSON.stringify(x);

 // ---- store items: changes only ----
 await db.exec(`INSERT INTO public.ar_store_items(id,name,status,price,seen_run,data_at,arabic_name) SELECT g,'ITEM '||g,'available',10,'r0','2026-11-12 12:00:00',NULL FROM generate_series(1,2000) g`);
 const storeDelta=(items,gone,total,dataAt='2026-11-12 13:08:00',key=KEY)=>one(`SELECT public.ar_store_sync_delta($1,$2::jsonb,$3::jsonb,$4,$5) AS r`,[key,J(items),J(gone),dataAt,total]).then(x=>x.r);
 let r=await storeDelta([{id:1,name:'ITEM 1',status:'available',price:12.5,cat:'med'},{id:5000,name:'NEW ITEM',status:'on_order'}],[2,'x'],1999);
 assert.deepEqual(r,{ok:true,status:'OK',batch:2,upserted:2,hidden:1,listed:2000,arabic_changed:0});
 assert.deepEqual(await one(`SELECT price::float,data_at,is_listed FROM public.ar_store_items WHERE id=1`),{price:12.5,data_at:'2026-11-12 13:08:00',is_listed:true});
 assert.equal((await one(`SELECT is_listed FROM public.ar_store_items WHERE id=2`)).is_listed,false,'gone = hidden, not deleted');
 assert.deepEqual(await one(`SELECT name,status,price FROM public.ar_store_items WHERE id=5000`),{name:'NEW ITEM',status:'on_order',price:null});
 assert.equal((await one(`SELECT data_at FROM public.ar_store_items WHERE id=3`)).data_at,'2026-11-12 12:00:00','unchanged rows are not touched');
 assert.equal((await one(`SELECT n FROM public.fill_calls`)).n,1,'Arabic names filled after a change');
 // every send is logged as STORE_OK (the laptop is alive, the voice can speak)
 let log=await one(`SELECT source,status,data_at,sent,listed,active_before,active_after,details FROM public.ar_sync_log ORDER BY id DESC LIMIT 1`);
 assert.deepEqual(log,{source:'store delta',status:'STORE_OK',data_at:'2026-11-12 13:08:00',sent:2,listed:1999,active_before:2000,active_after:2000,details:{changed:2,hidden:1,arabic_changed:0}});
 // nothing changed: still logged, nothing written, no Arabic fill
 r=await storeDelta([],[],2000,'2026-11-12 13:18:00');
 assert.equal(r.upserted,0);assert.equal((await one(`SELECT n FROM public.fill_calls`)).n,1);
 assert.equal((await one(`SELECT status,data_at FROM public.ar_sync_log ORDER BY id DESC LIMIT 1`)).data_at,'2026-11-12 13:18:00');
 // a half-restored database (far fewer items): refused, nothing changed, logged as refused
 r=await storeDelta([{id:1,name:'ITEM 1',status:'unavailable'}],[3,4],100);
 assert.equal(r.status,'REFUSED_TOO_FEW');assert.equal(r.upserted,0);
 assert.equal((await one(`SELECT status FROM public.ar_store_items WHERE id=1`)).status,'available');
 assert.equal((await one(`SELECT is_listed FROM public.ar_store_items WHERE id=3`)).is_listed,true);
 assert.equal((await one(`SELECT status FROM public.ar_sync_log ORDER BY id DESC LIMIT 1`)).status,'STORE_REFUSED_TOO_FEW');
 await assert.rejects(()=>storeDelta([],[],2000,'x','d'.repeat(64)),/bad key/);
 await assert.rejects(()=>storeDelta([],Array.from({length:1001},(_,i)=>i),2000),/too many gone/);

 // ---- stock: changes only ----
 await db.exec(`INSERT INTO public.ar_stock(item_id,name,packs,units,seen_run,data_at) SELECT g,'ITEM '||g,1,0,'r0','2026-11-12 12:00:00' FROM generate_series(1,1500) g`);
 await db.exec(`UPDATE public.ar_store_items SET arabic_name='صنف ١', price=12.5 WHERE id=1`);
 const stockDelta=(rows,gone,total,dataAt='2026-11-12 13:08:00')=>one(`SELECT public.ar_stock_sync_delta($1,$2::jsonb,$3::jsonb,$4,$5) AS r`,[KEY,J(rows),J(gone),dataAt,total]).then(x=>x.r);
 r=await stockDelta([{id:1,name:'ITEM 1',packs:3,units:1,parts:2,exp:'2027-05-01',other:[]},{id:9001,name:'NEW ITEM',packs:2,units:0}],[2],1500);
 assert.deepEqual(r,{ok:true,status:'OK',batch:2,upserted:2,removed:1,had:1500});
 assert.deepEqual(await one(`SELECT packs::float,units::float,parts,exp_near::text,arabic_name,price::float,data_at FROM public.ar_stock WHERE item_id=1`),{packs:3,units:1,parts:2,exp_near:'2027-05-01',arabic_name:'صنف ١',price:12.5,data_at:'2026-11-12 13:08:00'});
 assert.equal(await one(`SELECT count(*)::int n FROM public.ar_stock WHERE item_id=2`).then(x=>x.n),0,'gone = removed, like the full send');
 assert.deepEqual(await one(`SELECT min(data_at) a,max(data_at) b FROM public.ar_stock`),{a:'2026-11-12 13:08:00',b:'2026-11-12 13:08:00'},'every row as of this run');
 r=await stockDelta([],[5],100);
 assert.equal(r.status,'REFUSED_TOO_FEW');assert.equal(await one(`SELECT count(*)::int n FROM public.ar_stock WHERE item_id=5`).then(x=>x.n),1);

 // ---- the voice: at most once an hour ----
 await db.exec(`DELETE FROM public.ar_sync_log; DELETE FROM public.ar_sync_alerts;`);
 const news=async(peek=false)=>String((await one(`SELECT public.ar_sync_news($1,$2) AS t`,[KEY,peek])).t);
 const send=async(dataAt)=>{await storeDelta([],[],1999,dataAt);await stockDelta([],[],1500,dataAt)};
 await send('2026-11-12 13:08:00');
 assert.equal(await news(true),'البوت اتحدث كله، لحد الساعة 1 و8 دقايق','peek');
 assert.equal(await news(),'البوت اتحدث كله، لحد الساعة 1 و8 دقايق');
 // 10 minutes later: a new send, but said less than an hour ago: silent
 await send('2026-11-12 13:18:00');
 assert.equal(await news(),'','not every 10 minutes');
 await send('2026-11-12 13:58:00');
 await db.exec(`UPDATE public.ar_sync_alerts SET said_at = now() - interval '50 minutes' WHERE kind='data'`);
 assert.equal(await news(),'','50 minutes: still silent');
 await db.exec(`UPDATE public.ar_sync_alerts SET said_at = now() - interval '56 minutes' WHERE kind='data'`);
 assert.equal(await news(),'البوت اتحدث كله، لحد الساعة 1 و58 دقيقة','an hour later: said, with the newest time');
 assert.equal(await news(),'','and not again right after');
 // the stock not on the same data yet: waits (as before)
 await db.exec(`UPDATE public.ar_sync_alerts SET said_at = now() - interval '2 hours' WHERE kind='data'`);
 await storeDelta([],[],1999,'2026-11-12 15:08:00');
 assert.equal(await news(),'','stock still older');
 await stockDelta([],[],1500,'2026-11-12 15:08:00');
 assert.equal(await news(),'البوت اتحدث كله، لحد الساعة 3 و8 دقايق');
 // a store site order is still said at once, even within the hour
 await db.exec(`INSERT INTO public.ar_store_orders(id,status,items,customer_name,total,rx_paths) VALUES (7,'new','[]','منى',0,'{}')`);
 assert.equal(await news(),'طلب روشتة جديد من الموقع رقم 7، منى');
 // «the laptop stopped sending» still works with the delta sends
 await db.exec(`DELETE FROM public.ar_sync_log; DELETE FROM public.ar_sync_alerts;`);
 await db.exec(`INSERT INTO public.ar_sync_log(at,source,status,data_at,announced_at) VALUES (now() - interval '7 hours','store delta','STORE_OK','2026-11-12 06:00:00',now())`);
 assert.match(await news(),/^تنبيه: اللاب ما بعتش حاجة من 7 ساعة/);
 console.log('hub-every-10min ok');
})().catch(e=>{console.error(e);process.exit(1)});
