// Migration 202611092230 (ar_stock + ar_stock_sync): the laptop sends the pharmacy's stock in batches with its sync key;
// the last batch removes items no longer in stock, copies the Arabic name and price from ar_store_items, and a run that
// suddenly sees far fewer items is refused. Runs the migration on an in-memory Postgres (PGLITE_MODULE may point to it).
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const KEY='d'.repeat(64),HASH=crypto.createHash('sha256').update(KEY).digest('hex');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ select null::uuid $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, label text, last_used_at timestamptz);
 CREATE TABLE public.ar_store_items(id bigint PRIMARY KEY, name text, arabic_name text, price numeric);`);
 await db.query(`INSERT INTO public.ar_sync_keys(key_hash,label) VALUES ($1,'laptop')`,[HASH]);
 await db.exec(`INSERT INTO public.ar_store_items VALUES (1,'SELOKENZOC 50MG','سيلوكين زوك ٥٠',61.5),(2,'DUSPATALIN 200MG','دوسباتالين',90),(3,'FAWAR FRUIT',null,12)`);
 const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611092230_ar_stock.sql'),'utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const sync=async(rows,run,final,key=KEY)=>(await db.query(`SELECT public.ar_stock_sync($1,$2::jsonb,$3,'2026-11-09 20:00:00',$4) AS r`,[key,JSON.stringify(rows),run,final])).rows[0].r;
 const all=async()=>(await db.query(`SELECT item_id::int AS item_id,name,arabic_name,price::float AS price,packs::float AS packs,units::float AS units,parts,to_char(exp_near,'YYYY-MM-DD') AS exp,other FROM public.ar_stock ORDER BY item_id`)).rows;

 // wrong key: refused, nothing written
 await assert.rejects(sync([{id:1,name:'X',packs:1,units:0}],'r20261109a',true,'e'.repeat(64)),/bad key/);
 await assert.rejects(sync([],'bad run!',true),/bad run/);
 // first run, two batches: rows kept with their numbers, Arabic name and price copied on the last batch
 let r=await sync([{id:1,name:'SELOKENZOC 50MG',packs:5,units:1,parts:2,exp:'2028-08-01',other:[]},{id:2,name:'DUSPATALIN 200MG',packs:1,units:1,parts:2,exp:'2028-08-01'}],'r20261109a',false);
 assert.equal(r.ok,true);assert.equal(r.upserted,2);
 r=await sync([{id:3,name:'FAWAR FRUIT',packs:11,units:4,parts:6,exp:null,other:[{store:'مخزن انتظار ابن سينا',packs:2,units:0}]}],'r20261109a',true);
 assert.equal(r.ok,true);assert.equal(r.seen_in_run,3);assert.equal(r.removed,0);
 let rows=await all();
 assert.equal(rows.length,3);
 assert.deepEqual(rows[0],{item_id:1,name:'SELOKENZOC 50MG',arabic_name:'سيلوكين زوك ٥٠',price:61.5,packs:5,units:1,parts:2,exp:'2028-08-01',other:[]});
 assert.equal(rows[2].arabic_name,null);assert.equal(rows[2].exp,null);assert.deepEqual(rows[2].other,[{store:'مخزن انتظار ابن سينا',packs:2,units:0}]);
 // laptop key was marked used
 assert.ok((await db.query(`SELECT last_used_at FROM public.ar_sync_keys`)).rows[0].last_used_at);
 // next run: item 2 sold out (not sent) -> removed on the last batch; item 1 changed
 r=await sync([{id:1,name:'SELOKENZOC 50MG',packs:4,units:0,parts:2,exp:'2028-08-01'},{id:3,name:'FAWAR FRUIT',packs:11,units:4,parts:6}],'r20261109b',true);
 assert.equal(r.ok,true);assert.equal(r.removed,1);
 rows=await all();assert.deepEqual(rows.map(x=>x.item_id),[1,3]);assert.equal(rows[0].packs,4);assert.equal(rows[0].units,0);
 // bad rows are skipped, not saved: no name, negative or missing numbers, junk id
 r=await sync([{id:'x',name:'BAD',packs:1,units:0},{id:9,name:'',packs:1,units:0},{id:10,name:'NEG',packs:-1,units:0},{id:11,name:'NO NUMBERS'}],'r20261109c',false);
 assert.equal(r.upserted,0);
 // a run that sees far fewer items than before is refused and removes nothing (big list only)
 await db.exec(`DELETE FROM public.ar_stock`);
 const many=Array.from({length:1200},(_,i)=>({id:100+i,name:'ITEM '+i,packs:1,units:0,parts:1}));
 r=await sync(many,'r20261109d',true);assert.equal(r.ok,true);
 r=await sync(many.slice(0,100),'r20261109e',true);
 assert.equal(r.ok,false);assert.equal(r.status,'REFUSED_TOO_FEW');assert.equal(r.removed,0);
 assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.ar_stock`)).rows[0].n,1200,'nothing removed by a refused run');
 // too big a batch is refused
 await assert.rejects(sync(Array.from({length:6001},(_,i)=>({id:i+1,name:'N'+i,packs:1,units:0})),'r20261109f',false),/batch too big/);
 // the owner-only rule exists and visitors cannot run the sync without the key; nobody but the owner reads the table
 const pol=(await db.query(`SELECT polname, polroles::regrole[]::text AS roles FROM pg_policy WHERE polrelid='public.ar_stock'::regclass`)).rows;
 assert.deepEqual(pol,[{polname:'Owner reads ar stock',roles:'{authenticated}'}]);
 assert.equal((await db.query(`SELECT relrowsecurity FROM pg_class WHERE oid='public.ar_stock'::regclass`)).rows[0].relrowsecurity,true);
 console.log('stock-sync ok');
})().catch(e=>{console.error(e);process.exit(1)});
