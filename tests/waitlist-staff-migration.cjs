// The private numbers and the staff's «الانتظار» section (owner 2026-11-20): migration 202611201500 on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// The number book stays whole; a number marked «private» is the owner's alone; a staff member with the `wait` switch adds requests, sees who is waiting / who to call, marks called / delivered / cancelled,
// and never sees the returns decisions, the suppliers, nor a private number. Made-up people and numbers only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const mig=(f)=>fs.readFileSync(path.join(__dirname,'..','supabase','migrations',f),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',WAIT='11111111-1111-1111-1111-111111111111',NOWAIT='22222222-2222-2222-2222-222222222222',OFF='33333333-3333-3333-3333-333333333333',STRANGER='44444444-4444-4444-4444-444444444444';
(async()=>{
 const db=new PGlite();
 const staffSql=mig('202611130200_ar_staff.sql');
 const logFn=staffSql.slice(staffSql.indexOf('create table if not exists public.ar_activity'),staffSql.indexOf('revoke all on function public.ar_log_staff() from public;'));
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_store_items(id bigint PRIMARY KEY, name text not null, price numeric);
 CREATE TABLE public.ar_stock(item_id bigint PRIMARY KEY, packs numeric default 0, units numeric default 0, parts int, exp_near date, price numeric);
 CREATE TABLE public.ar_vendors(id bigint PRIMARY KEY, name text not null, short text, active boolean not null default true, last_invoice_at timestamp);
 CREATE TABLE public.ar_sales(id bigint PRIMARY KEY, at timestamp not null, kind text not null, items int[] not null default '{}', lines jsonb not null default '[]'::jsonb);
 CREATE TABLE public.ar_customers(id bigint PRIMARY KEY, name text);
 CREATE TABLE public.ar_customer_phones(customer_id bigint, phone text);
 CREATE TABLE public.ar_staff(user_id uuid primary key, name text not null, perms text[] not null default '{}', active boolean not null default true);
 CREATE FUNCTION public.ar_staff_can(ps text[]) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active and s.perms && ps); $$;
 CREATE FUNCTION public.ar_is_staff() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active); $$;
 ${logFn}`);
 await db.exec(mig('202611190500_ar_waitlist.sql'));
 await db.exec(mig('202611201300_ar_contacts_book.sql'));
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated; GRANT SELECT ON public.ar_waitlist, public.ar_vendor_kinds TO authenticated;`);
 await db.exec(`insert into public.ar_store_items values (1,'AUGMENTIN 1GM 14 TAB',160),(2,'CATAFLAM 50MG 20 TAB',85);
  insert into public.ar_stock values (1,0,0,1,null,160);
  insert into public.ar_vendors values (10,'المتحدة للأدوية','UNIT',true,'2026-11-18 10:00');
  insert into public.ar_staff values ('${WAIT}','موظف الانتظار','{wait}',true),('${NOWAIT}','موظف تاني','{tempsale}',true),('${OFF}','موقوف','{wait}',false);
  insert into public.ar_contacts(phone,name,kind,source) values
   ('01000000001','عميل ١٢١','cash','google'),('01000000002','احمد الطنطاوى','account','google'),('01000000003','اخويا','other','google'),('01000000004','صاحبي','other','google'),
   ('01000000005','عميل كتبته','other','typed'),('447710173736','رقم برة','other','google');`);
 const sql=mig('202611201500_ar_contacts_private.sql');
 await db.exec(sql);
 const as=async(uid,role,q,p=[])=>{await db.exec(`set role ${role}; select set_config('test.uid','${uid}',false)`);try{return (await db.query(q,p)).rows}finally{await db.exec(`reset role`)}};
 const A=(uid,q,p)=>as(uid,'authenticated',q,p);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const phones=async(uid)=>(await A(uid,`select phone from public.ar_contacts order by phone`)).map(r=>r.phone);

 // the first run marks the «غيرهم» of the import private, nothing else; a second run does not close what the owner opened
 assert.deepEqual((await one(`select array_agg(phone order by phone) p from public.ar_contacts where private`)).p,['01000000003','01000000004','447710173736'],'other + google = private; cash, account and typed stay open');
 await A(OWNER,`update public.ar_contacts set private=false where phone='01000000003'`);
 await db.exec(sql);
 assert.deepEqual((await one(`select array_agg(phone order by phone) p from public.ar_contacts where private`)).p,['01000000004','447710173736'],'applied again: the one he opened stays open');
 await A(OWNER,`update public.ar_contacts set private=true where phone='01000000003'`);

 // who sees what in the book
 assert.equal((await phones(OWNER)).length,6,'the owner sees all of it');
 assert.deepEqual(await phones(WAIT),['01000000001','01000000002','01000000005'],'staff with `wait`: only the open ones');
 for(const uid of [NOWAIT,OFF,STRANGER])assert.deepEqual(await phones(uid),[],'no `wait` / stopped / a stranger: nothing');
 await assert.rejects(()=>as('','anon','select * from public.ar_contacts'),/permission denied/);

 // staff add a number typed in the form: open, typed; never private, never over a number the book has, never a changed or removed one
 await A(WAIT,`insert into public.ar_contacts(phone,name,kind,source) values ('01000000006','عميل جديد','other','typed') on conflict (phone) do nothing`);
 assert.equal((await one(`select private, source from public.ar_contacts where phone='01000000006'`)).private,false);
 assert.deepEqual(await phones(WAIT),['01000000001','01000000002','01000000005','01000000006'],'what he typed is open at once');
 await assert.rejects(()=>A(WAIT,`insert into public.ar_contacts(phone,name,private,source) values ('01000000007','x',true,'typed')`),/row-level security/);
 await assert.rejects(()=>A(WAIT,`insert into public.ar_contacts(phone,name,source) values ('01000000008','x','google')`),/row-level security/);
 await assert.rejects(()=>A(NOWAIT,`insert into public.ar_contacts(phone,name,source) values ('01000000009','x','typed')`),/row-level security/);
 await A(WAIT,`insert into public.ar_contacts(phone,name,source) values ('01000000003','اسم تاني','typed') on conflict (phone) do nothing`);
 assert.equal((await one(`select name from public.ar_contacts where phone='01000000003'`)).name,'اخويا','a private number is not touched by a typed one, and nothing tells him it is there');
 assert.equal((await A(WAIT,`update public.ar_contacts set name='x' returning phone`)).length,0,'staff change nothing');
 assert.equal((await A(WAIT,`update public.ar_contacts set private=true where phone='01000000001' returning phone`)).length,0,'staff cannot mark a number private either');
 assert.equal((await A(WAIT,`delete from public.ar_contacts returning phone`)).length,0,'staff remove nothing');

 // the owner marks many at once; staff cannot
 const mark=(uid,ph,f)=>A(uid,`select public.ar_contacts_private($1::text[],$2) n`,[ph,f]).then(r=>r[0].n);
 assert.equal(await mark(OWNER,['01000000001','01000000002','nothing'],true),2);
 assert.deepEqual(await phones(WAIT),['01000000005','01000000006'],'marked: gone from staff at once');
 assert.equal(await mark(OWNER,['01000000001','01000000002'],true),0,'already private: nothing changes');
 assert.equal(await mark(OWNER,['01000000001'],false),1);assert.equal(await mark(OWNER,[],true),0);assert.equal(await mark(OWNER,null,true),0);
 await assert.rejects(()=>mark(WAIT,['01000000005'],true),/owner only/);await assert.rejects(()=>mark(STRANGER,['01000000005'],true),/owner only/);
 await assert.rejects(()=>as('','anon',`select public.ar_contacts_private('{01000000005}'::text[],true)`),/permission denied/);

 // the waiting list: the owner as before, a staff member for the calling
 const add=(uid,a)=>A(uid,`select public.ar_waitlist_add($1,$2,$3,$4,$5,$6) r`,[a.item??null,a.name??null,a.phone,a.cname??null,a.qty??1,a.vendor??null]).then(x=>x[0].r);
 const set=(uid,id,action,vendor=null)=>A(uid,`select public.ar_waitlist_set($1,$2,$3) r`,[id,action,vendor]).then(x=>x[0].r);
 const view=(uid)=>A(uid,`select public.ar_waitlist_overview() r`).then(x=>x[0].r);
 const row=(id)=>one(`select status,vendor_id,customer_name,called_at is not null called from public.ar_waitlist where id=$1`,[id]);
 for(const uid of [NOWAIT,OFF,STRANGER]){
  await assert.rejects(()=>add(uid,{item:1,phone:'01012345678'}),/owner only/);await assert.rejects(()=>view(uid),/owner only/);await assert.rejects(()=>set(uid,1,'called'),/owner only/);}
 const o=await add(OWNER,{item:1,phone:'01011112222',cname:'من المالك',vendor:10});assert.equal(o.ok,true);assert.equal((await row(o.id)).vendor_id,10);
 const s=await add(WAIT,{item:2,phone:'01033334444',cname:'من الموظف',vendor:10});assert.equal(s.ok,true);
 assert.equal((await row(s.id)).vendor_id,null,'choosing the supplier is the owner\'s: a staff add comes with none');
 assert.equal((await add(WAIT,{item:2,phone:'1033334444'})).dup,true,'the same customer and item is one row for staff too');
 assert.deepEqual(await add(WAIT,{item:2,phone:'0103333'}),{ok:false,error:'phone'});
 // an arrival (stock shows more than at the request) → «call these»
 await db.exec(`update public.ar_stock set packs=2 where item_id=1`);
 let v=await view(WAIT);
 assert.equal(v.ok,true);assert.deepEqual(v.call.map(x=>x.id),[o.id],'staff see who to call');assert.deepEqual(v.waiting.map(x=>x.id),[s.id],'and who is waiting');
 assert.deepEqual(v.leftover,[]);assert.deepEqual(v.vendors,[],'no returns decisions and no suppliers for staff');
 v=await view(OWNER);assert.equal(v.vendors.length,1,'the owner gets the suppliers as before');assert.equal(v.call.length,1);
 // what a staff member may do to a request
 for(const [id,action] of [[s.id,'arrived'],[o.id,'reopen'],[o.id,'returned'],[o.id,'kept']])await assert.rejects(()=>set(WAIT,id,action),/owner only/,'staff cannot '+action);
 await assert.rejects(()=>set(WAIT,o.id,'vendor',10),/owner only/);
 await assert.rejects(()=>A(WAIT,`select public.ar_waitlist_vendor_kind(10,'warehouse')`),/owner only/);
 assert.deepEqual(await set(WAIT,o.id,'called'),{ok:true,id:o.id,action:'called'});assert.equal((await row(o.id)).called,true);
 v=await view(WAIT);assert.deepEqual(v.call,[],'called: off the list');assert.deepEqual(v.leftover,[],'and it does not appear as a leftover to staff');
 assert.equal((await view(OWNER)).leftover.length,1,'the owner sees it under the returns decisions');
 assert.deepEqual(await set(WAIT,o.id,'delivered'),{ok:true,id:o.id,action:'delivered'});assert.equal((await row(o.id)).status,'delivered');
 assert.deepEqual(await set(WAIT,s.id,'cancelled'),{ok:true,id:s.id,action:'cancelled'});
 assert.deepEqual(await set(WAIT,s.id,'delivered'),{ok:false,error:'state'},'a closed one stays closed');
 // the history by number: staff with `wait` read the requests, the others none
 assert.equal((await A(WAIT,`select count(*)::int c from public.ar_waitlist`))[0].c,2);
 for(const uid of [NOWAIT,OFF,STRANGER])assert.equal((await A(uid,`select count(*)::int c from public.ar_waitlist`))[0].c,0);
 // what a staff member did is written under his name; the owner's own work is not
 const act=await one(`select count(*)::int c from public.ar_activity where user_id='${WAIT}' and tbl in ('ar_waitlist','ar_contacts')`);
 assert.equal(act.c>=5,true,'his adds and changes are in the activity list');
 assert.equal((await one(`select count(*)::int c from public.ar_activity where user_id='${OWNER}'`)).c,0);
 // anon has nothing
 for(const fn of ['public.ar_waitlist_who()','public.ar_contacts_private(text[],boolean)','public.ar_waitlist_add(bigint,text,text,text,numeric,bigint)','public.ar_waitlist_set(bigint,text,bigint)','public.ar_waitlist_overview()'])
  assert.equal((await one(`SELECT has_function_privilege('anon','${fn}','execute') AS ok`)).ok,false,'anon cannot '+fn);
 console.log('PASS: waitlist-staff migration: private numbers hidden from staff, the `wait` section for staff, what staff may and may not do, the owner unchanged');
})().catch(e=>{console.error(e);process.exit(1)});
