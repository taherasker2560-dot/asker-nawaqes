// «الانتظار» (owner 2026-11-19, from his own routine): migration 202611190500 on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// A request = a medicine a customer asked for and the pharmacy did not have; it arrives when the stock list shows more of it than at the request (or by hand); then «call these»,
// then the customer takes it or it is a leftover to return (30 days to a warehouse, 7 to a distribution center) or keep. Owner only. Nothing here writes to PharmaFly.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611190500_ar_waitlist.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',STAFF='11111111-1111-1111-1111-111111111111';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_store_items(id bigint PRIMARY KEY, name text not null, price numeric);
 CREATE TABLE public.ar_stock(item_id bigint PRIMARY KEY, packs numeric default 0, units numeric default 0, parts int, exp_near date, price numeric);
 CREATE TABLE public.ar_vendors(id bigint PRIMARY KEY, name text not null, short text, active boolean not null default true, last_invoice_at timestamp);
 CREATE TABLE public.ar_sales(id bigint PRIMARY KEY, at timestamp not null, kind text not null, items int[] not null default '{}', lines jsonb not null default '[]'::jsonb);
 CREATE TABLE public.ar_customers(id bigint PRIMARY KEY, name text);
 CREATE TABLE public.ar_customer_phones(customer_id bigint, phone text);`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated; GRANT SELECT ON public.ar_waitlist, public.ar_vendor_kinds TO authenticated;`);
 await db.exec(`insert into public.ar_store_items values (1,'AUGMENTIN 1GM 14 TAB',160),(2,'CATAFLAM 50MG 20 TAB',85),(3,'XYZ CREAM 30G',62),(4,'LOOSE STRIPS',30),(5,'ELSEWHERE 10 TAB',20);
  insert into public.ar_stock values (3,3,0,1,current_date + interval '6 months',62),(4,0,5,10,null,30),(5,2,0,1,current_date + interval '40 months',20);
  insert into public.ar_vendors values (10,'المتحدة للأدوية','UNIT',true,'2026-11-18 10:00'),(11,'مركز توزيع النور','NOOR',true,'2026-11-17 10:00'),(12,'قديم','OLD',false,'2025-01-01 10:00'),(13,'مورد من غير نوع','NONE',true,'2026-11-10 10:00');
  insert into public.ar_customers values (500,'عميل معروف_01011112222'); insert into public.ar_customer_phones values (500,'201011112222');`);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const as=async(uid,q,p=[])=>{await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false)`);try{return await one(q,p)}finally{await db.exec(`reset role`)}};
 const add=(a,uid=OWNER)=>as(uid,`select public.ar_waitlist_add($1,$2,$3,$4,$5,$6) r`,[a.item??null,a.name??null,a.phone,a.cname??null,a.qty??1,a.vendor??null]).then(x=>x.r);
 const set=(id,action,vendor=null,uid=OWNER)=>as(uid,`select public.ar_waitlist_set($1,$2,$3) r`,[id,action,vendor]).then(x=>x.r);
 const kind=(v,k,uid=OWNER)=>as(uid,`select public.ar_waitlist_vendor_kind($1,$2) r`,[v,k]).then(x=>x.r);
 const view=(uid=OWNER)=>as(uid,`select public.ar_waitlist_overview() r`).then(x=>x.r);
 const row=(id)=>one(`select status,item_id,item_name,phone,customer_name,qty::float q,vendor_id,vendor_name,stock_at_request::float s,arrived_by,return_days,called_at is not null called,closed_at is not null closed,arrived_at is not null arr from public.ar_waitlist where id=$1`,[id]);

 // nobody but the owner
 for(const uid of [STAFF,''])await assert.rejects(()=>add({item:1,phone:'01012345678'},uid),/owner only/);
 await assert.rejects(()=>set(1,'arrived',null,STAFF),/owner only/);await assert.rejects(()=>kind(10,'warehouse',STAFF),/owner only/);await assert.rejects(()=>view(STAFF),/owner only/);await assert.rejects(()=>view(''),/owner only/);
 const can=async(role,fn)=>(await one(`SELECT has_function_privilege('${role}','${fn}','execute') AS ok`)).ok;
 for(const fn of ['public.ar_waitlist_add(bigint,text,text,text,numeric,bigint)','public.ar_waitlist_set(bigint,text,bigint)','public.ar_waitlist_vendor_kind(bigint,text)','public.ar_waitlist_overview()'])assert.equal(await can('anon',fn),false,'anon cannot '+fn);

 // the checks, and what is tidied
 assert.deepEqual(await add({item:99,phone:'01012345678'}),{ok:false,error:'item'},'an item the system does not know');
 assert.deepEqual(await add({name:'x',phone:'01012345678'}),{ok:false,error:'name'});
 assert.deepEqual(await add({item:1,phone:'0101234'}),{ok:false,error:'phone'});
 assert.deepEqual(await add({item:1,phone:'01012345678',qty:0}),{ok:false,error:'qty'});assert.deepEqual(await add({item:1,phone:'01012345678',qty:1000}),{ok:false,error:'qty'});
 assert.deepEqual(await add({item:1,phone:'01012345678',vendor:99}),{ok:false,error:'vendor'});
 let a=await add({item:1,name:'ignored typed name',phone:'+20 101 234 5678',cname:'  فلان  ',qty:2,vendor:10});
 assert.equal(a.ok,true);assert.equal(a.status,'waiting');
 assert.deepEqual(await row(a.id),{status:'waiting',item_id:1,item_name:'AUGMENTIN 1GM 14 TAB',phone:'01012345678',customer_name:'فلان',q:2,vendor_id:10,vendor_name:'المتحدة للأدوية',s:0,arrived_by:null,return_days:null,called:false,closed:false,arr:false},'the item\'s own name wins, the phone is 01xxxxxxxxx, the stock at the request is 0');
 assert.equal((await add({item:1,phone:'1012345678'})).dup,true,'the same customer and item: not a second row (a phone without the 0 is read too)');
 assert.equal((await one(`select count(*)::int c from public.ar_waitlist`)).c,1);
 const b=await add({item:2,phone:'01012345678'});assert.notEqual(b.id,a.id,'another item for the same customer is a new row');
 const typed=await add({name:'  PHARMABILAST   ORAL  ',phone:'01099998888',vendor:11});assert.equal((await row(typed.id)).item_name,'PHARMABILAST ORAL');assert.equal((await row(typed.id)).item_id,null);
 assert.equal((await add({name:'pharmabilast oral',phone:'01099998888'})).dup,true,'a typed item is the same by its name');
 // an item that has stock now (3 boxes): the request remembers it
 const c=await add({item:3,phone:'01055556666',vendor:13});assert.equal((await row(c.id)).s,3);
 const loose=await add({item:4,phone:'01077778888'});assert.equal((await row(loose.id)).s,0.5,'5 loose units of a 10-unit pack = half a box');

 // the supplier's kind: set once, 30 or 7 days
 assert.deepEqual(await kind(10,'shop'),{ok:false,error:'kind'});assert.deepEqual(await kind(99,'warehouse'),{ok:false,error:'vendor'});
 assert.deepEqual(await kind(10,'warehouse'),{ok:true,vendor_id:10,kind:'warehouse'});assert.deepEqual(await kind(11,'center'),{ok:true,vendor_id:11,kind:'center'});
 assert.deepEqual(await kind(10,'warehouse'),{ok:true,vendor_id:10,kind:'warehouse'});assert.equal((await one(`select count(*)::int c from public.ar_vendor_kinds`)).c,2);

 // overview: nothing has arrived; the waiting ones, in the order they were asked
 let v=await view();
 assert.equal(v.ok,true);assert.deepEqual(v.call,[]);assert.deepEqual(v.leftover,[]);
 assert.deepEqual(v.waiting.map(x=>x.id),[a.id,b.id,typed.id,c.id,loose.id]);
 assert.equal(v.waiting[0].who,'فلان');assert.equal(v.waiting[0].vkind,'warehouse');assert.equal(v.waiting[2].vkind,'center');
 // the suppliers: active only, newest invoice first, with their kind
 assert.deepEqual(v.vendors.map(x=>[x.id,x.kind]),[[10,'warehouse'],[11,'center'],[13,null]]);

 // arrival by the stock list: more than at the request
 await db.exec(`insert into public.ar_stock values (1,2,0,1,current_date + interval '14 months',160)`); // item 1: 0 -> 2 boxes
 await db.exec(`update public.ar_stock set packs=3 where item_id=3`);            // item 3: 3 -> 3: not more
 await db.exec(`update public.ar_stock set units=6 where item_id=4`);            // item 4: 0.5 -> 0.6 boxes: more
 v=await view();
 assert.deepEqual(v.call.map(x=>[x.id,x.by,x.return_days]),[[a.id,'stock',30],[loose.id,'stock',null]],'item 1 (warehouse: 30 days) and the loose one (no supplier: no countdown)');
 assert.deepEqual(v.waiting.map(x=>x.id),[b.id,typed.id,c.id],'item 3 did not get more, the typed one has no stock to look at');
 assert.equal((await row(a.id)).arr,true);
 await db.exec(`update public.ar_stock set packs=4 where item_id=3`);
 assert.deepEqual((await view()).call.map(x=>x.id),[a.id,loose.id,c.id],'item 3 now has more than at the request; the order is by arrival');
 // the customer's name from the card by his number when he did not type one
 const known=await add({item:5,phone:'01011112222'});await db.exec(`update public.ar_waitlist set stock_at_request=0 where id=${known.id}`);
 v=await view();assert.equal(v.call.find(x=>x.id===known.id).who,'عميل معروف_01011112222');

 // the actions
 assert.deepEqual(await set(a.id,'called'),{ok:true,id:a.id,action:'called'});assert.equal((await row(a.id)).called,true);
 let w=await view();assert.equal(w.call.some(x=>x.id===a.id),false,'called: off the «call these» list');assert.equal(w.leftover.find(x=>x.id===a.id).called,true,'but still a leftover until he decides');
 assert.deepEqual(await set(b.id,'called'),{ok:false,error:'state'},'a waiting one cannot be called');
 assert.deepEqual(await set(b.id,'delivered'),{ok:false,error:'state'});assert.deepEqual(await set(a.id,'arrived'),{ok:false,error:'state'});
 assert.deepEqual(await set(999,'arrived'),{ok:false,error:'missing'});assert.deepEqual(await set(a.id,'fly'),{ok:false,error:'action'});
 assert.deepEqual(await set(b.id,'arrived'),{ok:true,id:b.id,action:'arrived'});assert.equal((await row(b.id)).arrived_by,'manual');
 assert.deepEqual(await set(typed.id,'arrived'),{ok:true,id:typed.id,action:'arrived'});assert.equal((await row(typed.id)).return_days,7,'the typed item\'s supplier is a distribution center');
 assert.deepEqual(await set(typed.id,'reopen'),{ok:true,id:typed.id,action:'reopen'});assert.equal((await row(typed.id)).status,'waiting');assert.equal((await row(typed.id)).arr,false);
 // a supplier chosen or changed later: the countdown follows
 assert.equal((await row(loose.id)).return_days,null);
 assert.deepEqual(await set(loose.id,'vendor',99),{ok:false,error:'vendor'});
 assert.deepEqual(await set(loose.id,'vendor',11),{ok:true,id:loose.id,action:'vendor'});assert.equal((await row(loose.id)).return_days,7);assert.equal((await row(loose.id)).vendor_name,'مركز توزيع النور');
 assert.deepEqual(await set(c.id,'vendor',13),{ok:true,id:c.id,action:'vendor'});assert.equal((await row(c.id)).return_days,null,'a supplier with no kind: no countdown yet');
 await kind(13,'warehouse');assert.equal((await row(c.id)).return_days,30,'setting the kind later gives the ones already here their countdown');
 assert.equal((await row(a.id)).return_days,30,'an old one is not changed by another supplier\'s kind');

 // the leftovers with what he needs to decide: sold in the last year, price, nearest expiry, days left
 await db.exec(`insert into public.ar_sales values
   (1,'2026-10-01 10:00','sale','{3}','[{"i":3,"p":2,"u":0,"k":1,"s":62,"d":0}]'),
   (2,'2026-10-05 10:00','sale','{3,4}','[{"i":3,"p":1,"u":5,"k":10,"s":62,"d":0},{"i":4,"p":0,"u":3,"k":10,"s":30,"d":0}]'),
   (3,'2026-10-06 10:00','return','{3}','[{"i":3,"p":-1,"u":0,"k":1,"s":62,"d":0}]'),
   (4,'2026-10-07 10:00','sale','{5}','[{"i":5,"p":9,"u":0,"k":1,"s":20,"d":0}]')`);
 await db.exec(`update public.ar_waitlist set arrived_at = now() - interval '5 days' where id=${c.id}`);     // 30 days, here 5: 25 left
 await db.exec(`update public.ar_waitlist set arrived_at = now() - interval '6 days' where id=${loose.id}`);  // 7 days, here 6: 1 left
 await db.exec(`update public.ar_waitlist set arrived_at = now() - interval '2 days' where id=${a.id}`);      // 30 days, here 2: 28 left
 w=await view();
 const left=Object.fromEntries(w.leftover.map(x=>[x.id,x]));
  const order=w.leftover.map(x=>[x.id,x.left_days]);
 assert.deepEqual(order.slice(0,3),[[loose.id,1],[c.id,25],[a.id,28]],'the nearest deadline first');
 assert.equal(left[c.id].sold_year,3.5,'sold last year in boxes: 2 + 1 + 5/10, the return ticket is not counted');
 assert.equal(left[loose.id].sold_year,0.3,'loose item: 3 units of 10');
 assert.equal(left[a.id].sold_year,0,'never sold');
 const day=async(m)=>(await one("select (current_date + interval '"+m+" months')::date::text d")).d;
 assert.equal(Number(left[c.id].price),62);assert.equal(left[c.id].exp_near,await day(6));assert.equal(left[c.id].exp_short,true,'expiry under 18 months from today');
 assert.equal(left[known.id].exp_short,false,'40 months is far');assert.equal(left[a.id].exp_near,await day(14));assert.equal(left[a.id].exp_short,true,'14 months is under 18');
 assert.equal(left[c.id].days_here,5);assert.equal(left[c.id].vkind,'warehouse');assert.equal(left[loose.id].vkind,'center');
 assert.equal(left[b.id].left_days,null,'no supplier: no countdown');
 assert.equal(order[order.length-1][1],null,'the ones with no countdown come last');

 // decisions close the row
 assert.deepEqual(await set(c.id,'returned'),{ok:true,id:c.id,action:'returned'});assert.equal((await row(c.id)).closed,true);
 assert.deepEqual(await set(loose.id,'kept'),{ok:true,id:loose.id,action:'kept'});
 assert.deepEqual(await set(a.id,'delivered'),{ok:true,id:a.id,action:'delivered'});
 assert.deepEqual(await set(c.id,'delivered'),{ok:false,error:'state'},'a closed one stays closed');
 assert.deepEqual(await set(c.id,'cancelled'),{ok:false,error:'state'});
 assert.deepEqual(await set(b.id,'cancelled'),{ok:true,id:b.id,action:'cancelled'});
 w=await view();assert.deepEqual(w.leftover.map(x=>x.id),[known.id],'only what is still here');
 // closed ones free the customer to ask for the same item again
 const again=await add({item:1,phone:'01012345678',qty:1});assert.notEqual(again.id,a.id);assert.equal(again.dup,undefined);
 // the owner reads the tables, a staff member none
 assert.equal((await as(OWNER,`select count(*)::int c from public.ar_waitlist`)).c>0,true);
 assert.equal((await as(STAFF,`select count(*)::int c from public.ar_waitlist`)).c,0);assert.equal((await as(STAFF,`select count(*)::int c from public.ar_vendor_kinds`)).c,0);
 console.log('PASS: waitlist migration: owner only, requests, the supplier\'s kind, arrival by the stock list or by hand, call these, leftovers with the numbers and the days left');
})().catch(e=>{console.error(e);process.exit(1)});
