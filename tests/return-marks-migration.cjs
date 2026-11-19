// «↩️ إرجاع» in the expiry list (owner 2026-11-19): migration 202611191200 on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// The owner marks a lot of a purchase invoice «return it»; a staff member with the switch «returns» ticks it prepared; a return invoice «~<number>» of the same supplier closes it.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611191200_ar_return_marks.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',STAFF='11111111-1111-1111-1111-111111111111',OTHER='22222222-2222-2222-2222-222222222222';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_store_items(id bigint PRIMARY KEY, name text not null, arabic_name text);
 CREATE TABLE public.ar_vendors(id bigint PRIMARY KEY, name text not null, short text);
 CREATE TABLE public.ar_vendor_moves(id bigint PRIMARY KEY, vendor_id bigint not null, at timestamp not null, kind text not null, code text, lines jsonb);
 CREATE TABLE public.ar_staff(user_id uuid PRIMARY KEY, name text not null, perms text[] not null default '{}', active boolean not null default true);
 CREATE FUNCTION public.ar_staff_can(ps text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active and s.perms && ps) $$;`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated; GRANT SELECT ON public.ar_return_marks TO authenticated; GRANT SELECT ON public.ar_staff TO authenticated;`);
 await db.exec(`insert into public.ar_store_items values (101,'FLAGYL 125MG SYRUP','فلاجيل ١٢٥ شراب'),(102,'PANADOL EXTRA 24 TAB',null),(103,'CALMARE PLUS 20 TAB','كالمير بلس');
  insert into public.ar_vendors values (5,'فتح الله','ELFT'),(6,'المتحدة للأدوية',null);
  insert into public.ar_staff values ('${STAFF}','أحمد','{returns}',true),('${OTHER}','سارة','{expiry}',true);
  insert into public.ar_vendor_moves values
   (1,5,'2026-11-18 16:43','purchase','11/26/474411','[{"i":101,"p":2,"u":0,"k":1,"b":0,"x":"2027-02-28"},{"i":102,"p":10,"u":0,"k":1,"b":1,"x":"2027-06-30"},{"i":103,"p":1,"u":6,"k":12,"b":0,"x":null},{"i":102,"p":2,"u":0,"k":1,"b":0,"x":"2027-06-30"}]'),
   (2,6,'2026-11-18 17:00','purchase','11/26/9','[{"i":101,"p":4,"u":0,"k":1,"b":0,"x":"2027-02-28"}]'),
   (3,5,'2026-11-18 16:44','sale','11/26/474411','[]')`);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const as=async(uid,q,p=[])=>{await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false)`);try{return await one(q,p)}finally{await db.exec(`reset role`)}};
 const mark=(move,item,x,units,uid=OWNER)=>as(uid,`select public.ar_return_mark($1,$2,$3::date,$4) r`,[move,item,x,units]).then(r=>r.r);
 const unmark=(id,uid=OWNER)=>as(uid,`select public.ar_return_unmark($1) r`,[id]).then(r=>r.r);
 const prep=(id,done,uid=OWNER)=>as(uid,`select public.ar_return_prepare($1,$2) r`,[id,done]).then(r=>r.r);
 const sync=(uid=OWNER)=>as(uid,`select public.ar_return_sync() r`).then(r=>r.r);
 const row=(id)=>one(`select status,vendor_id,vendor_name,code,item_id,item_name,item_ar,expiry::text x,k,units::float u,returned_units::float ru,prepared_by,prepared_at is not null pa,returned_at is not null ra,cancelled_at is not null ca from public.ar_return_marks where id=$1`,[id]);

 // who may do what
 for(const uid of [STAFF,OTHER,''])await assert.rejects(()=>mark(1,101,'2027-02-28',1,uid),/owner only/);
 for(const uid of [STAFF,OTHER,''])await assert.rejects(()=>unmark(1,uid),/owner only/);
 for(const uid of [STAFF,OTHER,''])await assert.rejects(()=>sync(uid),/owner only/);
 await assert.rejects(()=>prep(1,true,OTHER),/not allowed/,'a staff member without the switch');await assert.rejects(()=>prep(1,true,''),/not allowed/);
 const can=async(role,fn)=>(await one(`SELECT has_function_privilege('${role}','${fn}','execute') AS ok`)).ok;
 for(const fn of ['public.ar_return_mark(bigint,bigint,date,numeric)','public.ar_return_unmark(bigint)','public.ar_return_prepare(bigint,boolean)','public.ar_return_sync()','public.ar_return_who()','public.ar_return_owner()'])assert.equal(await can('anon',fn),false,'anon cannot '+fn);

 // marking: the lot must be on that purchase invoice, the units not more than bought
 assert.deepEqual(await mark(99,101,'2027-02-28',1),{ok:false,error:'move'},'no such invoice');
 assert.deepEqual(await mark(3,101,'2027-02-28',1),{ok:false,error:'move'},'not a purchase');
 assert.deepEqual(await mark(1,101,'2027-03-31',1),{ok:false,error:'line'},'that expiry is not on the invoice');
 assert.deepEqual(await mark(1,555,'2027-02-28',1),{ok:false,error:'line'},'that item is not on the invoice');
 assert.deepEqual(await mark(1,101,'2027-02-28',0),{ok:false,error:'units'});assert.deepEqual(await mark(1,101,'2027-02-28',3),{ok:false,error:'units'},'2 boxes bought');
 const a=await mark(1,101,'2027-02-28',2);assert.equal(a.ok,true);assert.equal(a.dup,undefined);
 assert.deepEqual(await row(a.id),{status:'marked',vendor_id:5,vendor_name:'ELFT',code:'11/26/474411',item_id:101,item_name:'FLAGYL 125MG SYRUP',item_ar:'فلاجيل ١٢٥ شراب',x:'2027-02-28',k:1,u:2,ru:0,prepared_by:null,pa:false,ra:false,ca:false},'the names are copied so the row stands alone');
 // a second tap changes the quantity, it is not a second mark
 const a2=await mark(1,101,'2027-02-28',1);assert.deepEqual(a2,{ok:true,id:a.id,dup:true});assert.equal((await row(a.id)).u,1);
 assert.equal((await one(`select count(*)::int c from public.ar_return_marks`)).c,1);
 // the same item on two lines with one expiry adds up (10 + 1 bonus + 2 = 13 boxes); a bonus counts as bought
 const p=await mark(1,102,'2027-06-30',13);assert.equal(p.ok,true);assert.equal((await row(p.id)).item_ar,null);assert.deepEqual(await mark(1,102,'2027-06-30',14),{ok:false,error:'units'});
 // loose units: 1 box of 12 + 6 units = 18 units, no expiry on the line
 const c=await mark(1,103,null,18);assert.equal(c.ok,true);assert.equal((await row(c.id)).k,12);assert.equal((await row(c.id)).x,null);assert.deepEqual(await mark(1,103,null,19),{ok:false,error:'units'});
 // the same lot on another supplier's invoice is another mark
 const other=await mark(2,101,'2027-02-28',4);assert.notEqual(other.id,a.id);assert.equal((await row(other.id)).vendor_name,'المتحدة للأدوية','no short name: the full name');

 // preparing: the owner, or a staff member with the switch; who and when are written; back again clears them
 assert.deepEqual(await prep(a.id,true,STAFF),{ok:true,id:a.id,status:'prepared',by:'أحمد'});
 let r=await row(a.id);assert.equal(r.status,'prepared');assert.equal(r.prepared_by,'أحمد');assert.equal(r.pa,true);
 assert.deepEqual(await prep(a.id,false,STAFF),{ok:true,id:a.id,status:'marked',by:'أحمد'});r=await row(a.id);assert.equal(r.status,'marked');assert.equal(r.prepared_by,null);assert.equal(r.pa,false);
 assert.deepEqual(await prep(p.id,true),{ok:true,id:p.id,status:'prepared',by:'المالك'});
 assert.deepEqual(await prep(999,true),{ok:false,error:'missing'});
 // staff cannot mark or cancel, only tick; and the unique rule still holds
 await db.exec(`update public.ar_staff set active=false where user_id='${STAFF}'`);await assert.rejects(()=>prep(a.id,true,STAFF),/not allowed/,'a stopped staff member');await db.exec(`update public.ar_staff set active=true where user_id='${STAFF}'`);

 // reading: the owner all, a staff member with the switch the open ones, a staff member without it nothing
 assert.equal((await as(OWNER,`select count(*)::int c from public.ar_return_marks`)).c,4);
 assert.equal((await as(STAFF,`select count(*)::int c from public.ar_return_marks`)).c,4,'all four are open');
 assert.equal((await as(OTHER,`select count(*)::int c from public.ar_return_marks`)).c,0);assert.equal((await as('',`select count(*)::int c from public.ar_return_marks`)).c,0);

 // cancel
 assert.deepEqual(await unmark(c.id),{ok:true,id:c.id});assert.equal((await row(c.id)).status,'cancelled');assert.equal((await row(c.id)).ca,true);
 assert.deepEqual(await unmark(c.id),{ok:false,error:'state'},'already cancelled');assert.deepEqual(await unmark(999),{ok:false,error:'missing'});
 assert.deepEqual(await prep(c.id,true),{ok:false,error:'state'},'a cancelled one cannot be prepared');
 assert.equal((await as(STAFF,`select count(*)::int c from public.ar_return_marks`)).c,3,'the staff member no longer sees the cancelled one');
 // a cancelled lot can be marked again
 const c2=await mark(1,103,null,6);assert.notEqual(c2.id,c.id);assert.equal(c2.dup,undefined);

 // sync: a return «~<number>» of the same supplier, entered AFTER the mark, with the item on a line
 assert.deepEqual(await sync(),{ok:true,closed:0,touched:0},'no return invoice yet');
 await db.exec(`update public.ar_return_marks set marked_at = '2026-11-18 20:00:00+02'`); // marked at 20:00 Cairo
 await db.exec(`insert into public.ar_vendor_moves values
   (10,5,'2026-11-18 19:00','return','~11/26/474411','[{"i":101,"p":2,"u":0,"k":1,"b":0}]'),            -- BEFORE the mark: does not count
   (11,6,'2026-11-18 21:00','return','~11/26/474411','[{"i":101,"p":2,"u":0,"k":1,"b":0}]'),            -- another supplier: does not count
   (12,5,'2026-11-18 21:00','return','~11/26/9','[{"i":101,"p":2,"u":0,"k":1,"b":0}]'),                  -- another invoice number: does not count
   (13,5,'2026-11-18 21:05','return','~11/26/474411','[{"i":102,"p":-5,"u":0,"k":1,"b":0}]')`);          // minus signs are fine: 5 of 13 boxes
 assert.deepEqual(await sync(),{ok:true,closed:0,touched:1},'only the partial one moved');
 r=await row(p.id);assert.equal(r.status,'prepared');assert.equal(r.ru,5,'5 of 13 came back: still open');assert.equal(r.ra,false);
 assert.equal((await row(a.id)).ru,0);
 await db.exec(`insert into public.ar_vendor_moves values
   (14,5,'2026-11-18 21:10','return','~11/26/474411','[{"i":102,"p":8,"u":0,"k":1,"b":0},{"i":101,"u":0,"p":1,"k":1,"b":0}]')`); // 8 more of 102 = 13 all; 1 of 101 = the whole mark (1)
 assert.deepEqual(await sync(),{ok:true,closed:2,touched:2});
 r=await row(p.id);assert.equal(r.status,'returned');assert.equal(r.ru,13);assert.equal(r.ra,true);
 r=await row(a.id);assert.equal(r.status,'returned');assert.equal(r.ru,1);
 assert.equal((await row(other.id)).status,'marked','the other supplier\'s mark is still open');
 assert.deepEqual(await sync(),{ok:true,closed:0,touched:0},'running it again changes nothing');
 assert.deepEqual(await prep(a.id,true),{ok:false,error:'state'},'a returned one is closed');assert.deepEqual(await unmark(a.id),{ok:false,error:'state'});
 assert.equal((await as(STAFF,`select count(*)::int c from public.ar_return_marks`)).c,2,'staff see only the open ones: the other supplier\'s and the re-marked loose lot');
 // two marks of one invoice + item (two expiries): one return line is shared in marking order, never counted twice
 await db.exec(`insert into public.ar_vendor_moves values (20,5,'2026-11-19 09:00','purchase','11/26/500','[{"i":102,"p":3,"u":0,"k":1,"b":0,"x":"2027-08-31"},{"i":102,"p":3,"u":0,"k":1,"b":0,"x":"2027-09-30"}]')`);
 const m1=await mark(20,102,'2027-08-31',3),m2=await mark(20,102,'2027-09-30',3);
 await db.exec(`update public.ar_return_marks set marked_at='2026-11-19 10:00:00+02' where id in (${m1.id},${m2.id})`);
 await db.exec(`update public.ar_return_marks set marked_at='2026-11-19 10:01:00+02' where id=${m2.id}`);
 await db.exec(`insert into public.ar_vendor_moves values (21,5,'2026-11-19 11:00','return','~11/26/500','[{"i":102,"p":4,"u":0,"k":1,"b":0}]')`);
 await sync();
 assert.deepEqual([(await row(m1.id)).ru,(await row(m1.id)).status,(await row(m2.id)).ru,(await row(m2.id)).status],[3,'returned',1,'marked'],'4 boxes came back: 3 close the first mark, 1 goes to the second');
 await sync();assert.equal((await row(m2.id)).ru,1,'and the same return is not counted again');
 console.log('PASS: return marks migration: owner marks / cancels / syncs, staff with the switch prepare, others refused, the return «~number» closes the mark');
})().catch(e=>{console.error(e);process.exit(1)});
