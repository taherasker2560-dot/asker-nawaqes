// Migration 202611172330 (owner 2026-11-17: an order for more than the pharmacy has must be stopped with a warning, not placed and then found short). Runs the real functions on an in-memory
// Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package): the boxes a customer can be promised, the cart's limits for the page, and the order check.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA IF NOT EXISTS storage; CREATE TABLE storage.objects(bucket_id text, name text, created_at timestamptz default now());
 CREATE TABLE public.ar_store_settings(id int PRIMARY KEY DEFAULT 1, is_open boolean DEFAULT true, closed_message text, hero_title text, hero_text text, whatsapp text, updated_at timestamptz DEFAULT now());
 INSERT INTO public.ar_store_settings(id) VALUES (1);
 CREATE TABLE public.ar_store_items(id bigint PRIMARY KEY, name text, status text, price numeric, is_listed boolean DEFAULT true, hidden boolean DEFAULT false, needs_rx boolean DEFAULT false);
 INSERT INTO public.ar_store_items VALUES (1,'PANADOL','available',50,true,false,false),(2,'CONGESTAL','on_order',null,true,false,false),(3,'LOOSE STRIPS','available',30,true,false,false),
   (4,'HIDDEN','available',10,true,true,false),(5,'NO STOCK ROW','available',20,true,false,false),(6,'PLENTY','available',9,true,false,false),(7,'GONE','unavailable',null,true,false,false);
 CREATE TABLE public.ar_stock(item_id bigint PRIMARY KEY, packs numeric DEFAULT 0, units numeric DEFAULT 0, parts int);
 INSERT INTO public.ar_stock VALUES (1,3.4,0,1),(2,5,0,1),(3,0,4,10),(4,9,0,1),(6,400,0,1),(7,2,0,1);
 CREATE TABLE public.ar_store_orders(id bigserial PRIMARY KEY, customer_name text, phone text, address text, notes text, items jsonb, total numeric, rx_paths text[], created_at timestamptz DEFAULT now());`);
 for(const f of ['202611120600_ar_store_any_item_theme.sql','202611120700_ar_store_unavailable_not_ordered.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 const sql=fs.readFileSync('supabase/migrations/202611172330_ar_store_order_qty_limit.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const q=async(text,p)=>(await db.query(text,p)).rows;
 let phone=10;
 const order=async(items)=>(await q(`SELECT public.ar_store_place_order('Ahmed',$1,'12 street, Cairo',null,$2::jsonb) AS r`,['010000000'+(phone++),JSON.stringify(items)]))[0].r;
 const lim=async(ids)=>(await q(`SELECT public.ar_store_item_qty($1::bigint[]) AS r`,[ids]))[0].r;
 const boxes=async(p,u)=>(await q(`SELECT public.ar_store_boxes($1::numeric,$2::numeric) AS b`,[p,u]))[0].b;

 // the boxes a customer can be promised: whole packs, 1 when only loose units are left, never more than the site's own limit of 20
 assert.equal(await boxes(3.4,0),3);assert.equal(await boxes(1,0),1);assert.equal(await boxes(0.9,0),0);assert.equal(await boxes(0,4),1,'only loose units: one box can be talked about');
 assert.equal(await boxes(0.9,2),1);assert.equal(await boxes(400,0),20,'at most 20: no bigger stock leaves the building');assert.equal(await boxes(0,0),0);assert.equal(await boxes(null,null),0);

 // the cart's limits: only on-the-site «available» items with a stock row; no row, hidden, on order, unavailable = no limit given
 let r=await lim([1,2,3,4,5,6,7,99]);
 assert.deepEqual(r,{ok:true,max:{1:3,3:1,6:20}});
 assert.deepEqual(await lim([5]),{ok:true,max:{}},'no stock row: no limit');
 assert.equal((await lim([])).ok,false);assert.equal((await lim(null)).ok,false);assert.equal((await lim(Array.from({length:51},(_,i)=>i+1))).error,'bad_items','at most 50 ids');
 // nothing but the allowed numbers: no stock above 20, no other column
 assert.doesNotMatch(JSON.stringify(await lim([6])),/400/);

 // the order: up to the boxes is fine, one more is refused with the maximum, a repeated id counts together
 r=await order([{id:1,qty:3}]);assert.equal(r.ok,true);assert.equal(Number(r.total),150);
 r=await order([{id:1,qty:4}]);assert.deepEqual([r.ok,r.error],[false,'qty']);assert.deepEqual(r.items,[{id:1,name:'PANADOL',max:3}]);
 r=await order([{id:1,qty:2},{id:1,qty:2}]);assert.equal(r.error,'qty','the same item twice counts together');
 r=await order([{id:3,qty:1}]);assert.equal(r.ok,true,'loose units: one box');
 r=await order([{id:3,qty:2},{id:1,qty:9},{id:6,qty:20}]);assert.equal(r.error,'qty');assert.deepEqual(r.items.map(x=>[x.id,x.max]),[[1,3],[3,1]],'every item that is too many is named, with its own maximum');
 assert.equal((await order([{id:6,qty:20}])).ok,true,'plenty in stock: the site\'s own 20 per line');
 assert.equal((await order([{id:6,qty:99}])).ok,true,'a request above 20 is cut to 20 as before, and 20 is available');
 assert.equal((await order([{id:5,qty:12}])).ok,true,'no stock row: not refused here');
 assert.equal((await order([{id:2,qty:5}])).ok,true,'on order: no limit');
 // the old refusals are untouched
 assert.equal((await order([{id:4,qty:1}])).error,'item_not_available');assert.equal((await order([{id:7,qty:1}])).error,'item_not_available');
 // a typed line and a refused item together: still the refusal; nothing was placed by a refused order
 const before=(await q(`SELECT count(*)::int n FROM public.ar_store_orders`))[0].n;
 assert.equal((await order([{id:1,qty:9},{text:'دوا تاني',qty:1}])).error,'qty');
 assert.equal((await q(`SELECT count(*)::int n FROM public.ar_store_orders`))[0].n,before,'a refused order is not saved');
 // grants: the site (visitors and the signed-in) may ask the limits; nobody else gets more
 const can=async(role,fn)=>(await q(`SELECT has_function_privilege('${role}','${fn}','execute') AS ok`))[0].ok;
 assert.equal(await can('anon','public.ar_store_item_qty(bigint[])'),true);assert.equal(await can('authenticated','public.ar_store_item_qty(bigint[])'),true);assert.equal(await can('public','public.ar_store_item_qty(bigint[])'),false);
 console.log('store-order-qty ok');
})().catch(e=>{console.error(e);process.exit(1)});
