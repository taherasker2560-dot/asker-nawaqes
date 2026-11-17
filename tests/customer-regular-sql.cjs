// Migration 202611171900 (owner 2026-11-17: «اللي باخده دايمًا» + «أدويتي المزمنة» on the customer's page), run for real on an in-memory Postgres
// (PGLITE_MODULE may point to an installed @electric-sql/pglite package) over a small copy of the tables it reads: the laptop's sync with its key, the
// customer's own view by his link secret, and the rule that one customer never gets another's rows. Made-up customers and items only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 const KEY='a'.repeat(64),T1='1'.repeat(64),T2='2'.repeat(64);
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);
 CREATE TABLE public.ar_customer_links(customer_id bigint PRIMARY KEY, token text NOT NULL UNIQUE);
 CREATE TABLE public.ar_store_items(id bigint PRIMARY KEY, name text, arabic_name text, status text);
 INSERT INTO public.ar_sync_keys(key_hash) VALUES (encode(sha256(convert_to('${KEY}','UTF8')),'hex'));
 INSERT INTO public.ar_customer_links VALUES (101,'${T1}'),(102,'${T2}');
 INSERT INTO public.ar_store_items VALUES (11,'LACTEVENOR 35TAB','لاكتيفينور ٣٥ قرص','available'),(12,'XANPRAZAN 20 TAB',NULL,'on_order'),(13,'EZAPRIL-CO 72 TAB','  ','available');`);
 const sql=fs.readFileSync('supabase/migrations/202611171900_ar_customer_regular.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const q=async(text,p)=>(await db.query(text,p)).rows;
 const sync=async(rows,key=KEY)=>(await q(`SELECT public.ar_customer_regular_sync($1, $2::jsonb) AS r`,[key,JSON.stringify(rows)]))[0].r;
 const view=async(t)=>(await q(`SELECT public.ar_customer_regular_view($1) AS r`,[t]))[0].r;
 const R=(c,i,n,o={})=>({c,i,n,gap:30,times:4,q:1,last:'2026-11-01',...o});

 // the laptop's key is checked: a wrong, a malformed and a missing key get nothing (28000), and nothing is written
 for(const bad of ['b'.repeat(64),'short',null]){
  await assert.rejects(()=>sync([R(101,11,'LACTEVENOR 35TAB')],bad),/bad key/);
 }
 assert.equal((await q(`SELECT count(*)::int n FROM public.ar_customer_regular`))[0].n,0);

 // the first send: two customers
 let r=await sync([R(101,11,'LACTEVENOR 35TAB',{gap:33,times:4,q:1,last:'2026-10-02'}),R(101,12,'XANPRAZAN 20 TAB',{gap:28,q:0.5,last:'2026-10-12'}),R(101,13,'EZAPRIL-CO 72 TAB'),R(102,11,'LACTEVENOR 35TAB',{gap:40})]);
 assert.deepEqual(r,{ok:true,rows:4,gone:0});
 assert.ok((await q(`SELECT last_used_at FROM public.ar_sync_keys`))[0].last_used_at,'the key use is stamped');

 // the customer's own view: only his rows, newest refill first, the store's Arabic name and «available»
 let v=await view(T1);
 assert.equal(v.ok,true);assert.equal(v.rows.length,3);
 assert.deepEqual(v.rows.map(x=>x.i),[13,12,11],'newest refill first');
 const lact=v.rows.find(x=>x.i===11);
 assert.deepEqual(lact,{i:11,n:'LACTEVENOR 35TAB',ar:'لاكتيفينور ٣٥ قرص',gap:33,times:4,q:1,last:'2026-10-02',avail:true});
 assert.equal(v.rows.find(x=>x.i===12).ar,null,'no Arabic name');assert.equal(v.rows.find(x=>x.i===12).avail,false,'on order is not available');
 assert.equal(v.rows.find(x=>x.i===13).ar,null,'a blank Arabic name is none');
 assert.ok(v.at,'when the laptop last sent');
 // never another customer's rows, and no other field (no balance, no phone, no customer id)
 assert.equal(JSON.stringify(v).includes('"c"'),false);assert.deepEqual(Object.keys(v).sort(),['at','ok','rows']);
 v=await view(T2);assert.equal(v.rows.length,1);assert.equal(v.rows[0].gap,40);
 // a wrong / missing secret gets nothing
 assert.equal((await view('f'.repeat(64))).error,'link');assert.equal((await view(null)).error,'link');assert.equal((await view('not-a-secret')).error,'link');

 // the next send replaces the list: a row that is gone from it is deleted, a changed one is updated, nothing is doubled
 r=await sync([R(101,11,'LACTEVENOR 35TAB',{gap:33,times:5,last:'2026-11-16'}),R(102,11,'LACTEVENOR 35TAB',{gap:40})]);
 assert.deepEqual(r,{ok:true,rows:2,gone:2});
 v=await view(T1);assert.deepEqual(v.rows.map(x=>[x.i,x.times,x.last]),[[11,5,'2026-11-16']]);
 assert.equal((await q(`SELECT count(*)::int n FROM public.ar_customer_regular`))[0].n,2);

 // an empty list never wipes the table (a failed read on the laptop)
 r=await sync([]);assert.deepEqual(r,{ok:true,rows:0,gone:0,skipped:true});
 assert.equal((await q(`SELECT count(*)::int n FROM public.ar_customer_regular`))[0].n,2);
 // the same row twice in one send is one row; bad rows (no name, a bad date, a zero gap, a text id) are skipped, the good ones still go in
 r=await sync([R(101,11,'A'),R(101,11,'A again'),R(101,14,'  '),R(101,15,'BAD DATE',{last:'11/16/2026'}),R(101,16,'ZERO GAP',{gap:0}),{c:'x',i:1,n:'TEXT ID',gap:30,times:3,q:1,last:'2026-11-01'},R(102,17,'GOOD',{q:'2.5'})]);
 assert.deepEqual(r,{ok:true,rows:2,gone:1},'(101,11) stays (updated), (102,17) comes in, (102,11) is gone');
 assert.deepEqual((await q(`SELECT customer_id::int c, item_id::int i, name, q::float q FROM public.ar_customer_regular ORDER BY 1,2`)),[{c:101,i:11,name:'A',q:1},{c:102,i:17,name:'GOOD',q:2.5}]);
 // too many rows is refused
 await assert.rejects(()=>sync(Array.from({length:3001},(_,k)=>R(1,k+1,'X'))),/too many rows/);

 // grants: the laptop's key and the customer's secret work for visitors and the signed-in; nothing is public; the table itself is closed
 const can=async(role,fn)=>(await q(`SELECT has_function_privilege('${role}','${fn}','execute') AS ok`))[0].ok;
 for(const fn of ['public.ar_customer_regular_sync(text,jsonb)','public.ar_customer_regular_view(text)']){
  assert.equal(await can('anon',fn),true);assert.equal(await can('authenticated',fn),true);assert.equal(await can('public',fn),false);
 }
 for(const role of ['anon','authenticated'])assert.equal((await q(`SELECT has_table_privilege('${role}','public.ar_customer_regular','select') AS ok`))[0].ok,false,role+' cannot read the table directly');
 console.log('customer-regular-sql ok');
})().catch(e=>{console.error(e);process.exit(1)});
