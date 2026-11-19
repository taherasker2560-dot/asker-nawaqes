// Migration 202611190200 (owner 2026-11-19: «أقصى كمية من أصناف معينة» he sets per item, on top of «not more than the pharmacy has» from 202611172330). Runs the real functions on an in-memory Postgres
// (PGLITE_MODULE may point to an installed @electric-sql/pglite package): the column and its range, the cart's limits for the page (max + which ones are the OWNER's number), and the order check.
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
   (4,'HIDDEN','available',10,true,true,false),(5,'NO STOCK ROW','available',20,true,false,false),(6,'PLENTY','available',9,true,false,false),(7,'GONE','unavailable',null,true,false,false),
   (8,'EXACT','available',5,true,false,false),(9,'NO CAP','available',7,true,false,false);
 CREATE TABLE public.ar_stock(item_id bigint PRIMARY KEY, packs numeric DEFAULT 0, units numeric DEFAULT 0, parts int);
 INSERT INTO public.ar_stock VALUES (1,3.4,0,1),(2,5,0,1),(3,0,4,10),(4,9,0,1),(6,400,0,1),(7,2,0,1),(8,4,0,1),(9,6,0,1);
 CREATE TABLE public.ar_store_orders(id bigserial PRIMARY KEY, customer_name text, phone text, address text, notes text, items jsonb, total numeric, rx_paths text[], created_at timestamptz DEFAULT now());`);
 for(const f of ['202611120600_ar_store_any_item_theme.sql','202611120700_ar_store_unavailable_not_ordered.sql','202611172330_ar_store_order_qty_limit.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 const sql=fs.readFileSync('supabase/migrations/202611190200_ar_store_item_max.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const q=async(text,p)=>(await db.query(text,p)).rows;
 let phone=10;
 const order=async(items)=>(await q(`SELECT public.ar_store_place_order('Ahmed',$1,'12 street, Cairo',null,$2::jsonb) AS r`,['010000000'+(phone++),JSON.stringify(items)]))[0].r;
 const lim=async(ids)=>(await q(`SELECT public.ar_store_item_qty($1::bigint[]) AS r`,[ids]))[0].r;
 const setCap=(id,n)=>db.query(`UPDATE public.ar_store_items SET max_per_order=$2 WHERE id=$1`,[id,n]);

 // the column: empty by default, 1..20 only
 assert.equal((await q(`SELECT count(*)::int n FROM public.ar_store_items WHERE max_per_order IS NOT NULL`))[0].n,0,'nobody has a cap until he sets one');
 for(const bad of [0,21,-1])await assert.rejects(()=>setCap(1,bad),/check/i,'only 1..20: '+bad);
 for(const good of [1,20,null])await setCap(1,good);

 // with no cap anywhere the answer is the old one plus an empty «cap»: nothing changes for the customer
 let r=await lim([1,2,3,4,5,6,7,8,9,99]);
 assert.deepEqual(r,{ok:true,max:{1:3,3:1,6:20,8:4,9:6},cap:{}});

 // the owner's caps: 1 (3 boxes, cap 2), 6 (plenty, cap 5), 3 (one box, cap 5), 5 (no stock row, cap 4), 2 (on order, cap 3), 8 (4 boxes, cap 4 = exactly the stock), 4 (hidden), 7 (unavailable)
 for(const [id,n] of [[1,2],[6,5],[3,5],[5,4],[2,3],[8,4],[4,2],[7,2]])await setCap(id,n);
 r=await lim([1,2,3,4,5,6,7,8,9,99]);
 assert.deepEqual(r.max,{1:2,2:3,3:1,5:4,6:5,8:4,9:6},'the smaller of the cap and the boxes; no stock row or on order = the cap alone; hidden and unavailable items are not listed');
 assert.deepEqual(r.cap,{1:true,2:true,5:true,6:true},'«cap» = the owner\'s number is the one that binds: not when the stock is the smaller (3), not when they are equal (8), not for an item with no cap (9)');
 assert.equal(r.ok,true);
 assert.equal((await lim([])).ok,false);assert.equal((await lim(null)).ok,false);assert.equal((await lim(Array.from({length:51},(_,i)=>i+1))).error,'bad_items');
 assert.doesNotMatch(JSON.stringify(await lim([6])),/400/,'still no stock above 20 leaves the building');

 // the order: up to the smaller number is fine, one more is refused with the maximum and who set it
 r=await order([{id:1,qty:2}]);assert.equal(r.ok,true);assert.equal(Number(r.total),100);
 r=await order([{id:1,qty:3}]);assert.deepEqual([r.ok,r.error],[false,'qty']);assert.deepEqual(r.items,[{id:1,name:'PANADOL',max:2,cap:true}],'3 boxes in stock but the owner said 2');
 r=await order([{id:6,qty:6}]);assert.deepEqual(r.items,[{id:6,name:'PLENTY',max:5,cap:true}],'plenty in stock, the owner said 5');
 assert.equal((await order([{id:6,qty:5}])).ok,true);
 r=await order([{id:5,qty:5}]);assert.deepEqual(r.items,[{id:5,name:'NO STOCK ROW',max:4,cap:true}],'no stock row: only the owner\'s cap applies');
 assert.equal((await order([{id:5,qty:4}])).ok,true);
 r=await order([{id:2,qty:4}]);assert.deepEqual(r.items,[{id:2,name:'CONGESTAL',max:3,cap:true}],'on order: only the cap');
 assert.equal((await order([{id:2,qty:3}])).ok,true);
 r=await order([{id:3,qty:2}]);assert.deepEqual(r.items,[{id:3,name:'LOOSE STRIPS',max:1,cap:false}],'the stock (1) is smaller than the cap (5): the old message');
 r=await order([{id:8,qty:5}]);assert.deepEqual(r.items,[{id:8,name:'EXACT',max:4,cap:false}],'cap = stock: told as stock');
 r=await order([{id:1,qty:1},{id:1,qty:2}]);assert.equal(r.error,'qty','the same item twice counts together against the cap');
 r=await order([{id:1,qty:9},{id:6,qty:9},{id:9,qty:6}]);assert.deepEqual(r.items.map(x=>[x.id,x.max,x.cap]),[[1,2,true],[6,5,true]],'every item that is too many is named; an item with no cap and enough stock is not');
 assert.equal((await order([{id:9,qty:6}])).ok,true);assert.equal((await order([{id:9,qty:7}])).error,'qty','an item with no cap keeps the stock rule');
 // clearing the cap puts the item back to the stock rule
 await setCap(1,null);assert.equal((await order([{id:1,qty:3}])).ok,true,'cap removed: back to 3 boxes');assert.equal((await order([{id:1,qty:4}])).error,'qty');
 // the old refusals are untouched, and a refused order is not saved
 assert.equal((await order([{id:4,qty:1}])).error,'item_not_available');assert.equal((await order([{id:7,qty:1}])).error,'item_not_available');
 const before=(await q(`SELECT count(*)::int n FROM public.ar_store_orders`))[0].n;
 assert.equal((await order([{id:6,qty:9},{text:'دوا تاني',qty:1}])).error,'qty');
 assert.equal((await q(`SELECT count(*)::int n FROM public.ar_store_orders`))[0].n,before,'a refused order is not saved');
 // grants: the site may ask the limits, nobody else gets more
 const can=async(role,fn)=>(await q(`SELECT has_function_privilege('${role}','${fn}','execute') AS ok`))[0].ok;
 assert.equal(await can('anon','public.ar_store_item_qty(bigint[])'),true);assert.equal(await can('authenticated','public.ar_store_item_qty(bigint[])'),true);assert.equal(await can('public','public.ar_store_item_qty(bigint[])'),false);
 console.log('store-item-max ok');
})().catch(e=>{console.error(e);process.exit(1)});
