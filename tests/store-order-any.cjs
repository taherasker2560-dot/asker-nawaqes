// Migration 202611120600: «صعب طلبه» items and typed lines are ordered without a price; the site's default color/night look.
// Runs the migration on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
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
 INSERT INTO public.ar_store_items VALUES (1,'PANADOL','available',50,true,false,false),(2,'CONGESTAL','on_order',null,true,false,false),
   (3,'CETAL COLD & FLU 20CAP','unavailable',null,true,false,false),(4,'HIDDEN','available',10,true,true,false),(5,'RX','unavailable',null,true,false,true);
 CREATE TABLE public.ar_store_orders(id bigserial PRIMARY KEY, customer_name text, phone text, address text, notes text, items jsonb, total numeric, rx_paths text[], created_at timestamptz DEFAULT now());`);
 const sql=fs.readFileSync('supabase/migrations/202611120600_ar_store_any_item_theme.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 let phone=10;
 const order=async(items)=>(await db.query(`SELECT public.ar_store_place_order('Ahmed',$1,'12 street, Cairo',null,$2::jsonb) AS r`,['010000000'+(phone++),JSON.stringify(items)])).rows[0].r;
 // available + on_order + «صعب طلبه» + typed: one order, the total counts the priced item only
 let r=await order([{id:1,qty:2},{id:2,qty:1},{id:3,qty:1},{text:'  ابيمول   شراب ',qty:3}]);
 assert.equal(r.ok,true);assert.equal(Number(r.total),100);
 assert.deepEqual(r.items.map(x=>[x.name,x.qty,x.price,!!x.on_order,!!x.free_text]),[['PANADOL',2,50,false,false],['CONGESTAL',1,null,true,false],['CETAL COLD & FLU 20CAP',1,null,true,false],['ابيمول شراب',3,null,true,true]]);
 // only typed lines
 r=await order([{text:'دوا مش موجود'}]);assert.equal(r.ok,true);assert.equal(Number(r.total),0);assert.equal(r.items[0].qty,1);
 // refused: hidden item, Rx item, too short / long text, a line with neither id nor text, more than 10 typed lines
 assert.equal((await order([{id:4}])).error,'item_not_available');
 assert.equal((await order([{id:5}])).error,'item_not_available');
 assert.equal((await order([{text:'x'}])).error,'bad_text');
 assert.equal((await order([{text:'a'.repeat(121)}])).error,'bad_text');
 assert.equal((await order([{qty:2}])).error,'bad_items');
 assert.equal((await order(Array.from({length:11},(_,i)=>({text:'صنف '+i})))).error,'bad_items');
 // the site's colors: a ready color id or c:#rrggbb, night on/off
 await db.exec(`UPDATE public.ar_store_settings SET theme_color='teal', theme_night=true`);
 await db.exec(`UPDATE public.ar_store_settings SET theme_color='c:#0a4aa6'`);
 await assert.rejects(()=>db.exec(`UPDATE public.ar_store_settings SET theme_color='red; drop'`),/theme_color_chk/);
 console.log('store-order-any ok');
})().catch(e=>{console.error(e);process.exit(1)});
