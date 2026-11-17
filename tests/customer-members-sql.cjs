// Migration 202611180200 (owner 2026-11-18: «عميل الأجل يقدر يبعت الأبلكيشن لأهل بيته، ويقدر يتحكم فيه، يعني يخلي الحساب الإجمالي يظهر لهم أو يحذفه … هم توابع ليه»), run for real on an in-memory Postgres
// (PGLITE_MODULE may point to an installed @electric-sql/pglite package): the owner of the account adds the people of his house; each gets his own secret; only the owner controls it;
// a member with «الحساب الإجمالي» off gets no balance, no month sums, no payments, no running balance from the server; orders and the messages page work for a member; made-up customers only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 const T1='1'.repeat(64),T2='2'.repeat(64),OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',STRANGER='00000000-0000-4000-8000-0000000000ff';
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_customers(id bigint PRIMARY KEY, name text, balance numeric);
 CREATE TABLE public.ar_customer_links(customer_id bigint PRIMARY KEY, token text NOT NULL UNIQUE, created_at timestamptz DEFAULT now(), last_seen_at timestamptz, seen_count int NOT NULL DEFAULT 0);
 CREATE TABLE public.ar_customer_moves(id bigint, customer_id bigint, at timestamp, kind text, total numeric, paid numeric, balance numeric, items jsonb);
 CREATE TABLE public.ar_customer_stops(customer_id bigint PRIMARY KEY);
 CREATE TABLE public.ar_customer_phones(customer_id bigint, phone text, updated_at timestamptz DEFAULT now());
 CREATE TABLE public.ar_sync_log(id bigserial PRIMARY KEY, at timestamptz DEFAULT now());
 CREATE TABLE public.ar_store_items(id bigint PRIMARY KEY, arabic_name text, status text);
 CREATE TABLE public.ar_customer_regular(customer_id bigint, item_id bigint, name text, gap int, times int, q numeric, last date, updated_at timestamptz DEFAULT now());
 CREATE TABLE public.ar_store_orders(id bigserial PRIMARY KEY, customer_name text, customer_id bigint, pay text);
 CREATE TABLE public.ar_chats (
  id uuid primary key default gen_random_uuid(), secret text not null unique check (secret ~ '^[0-9a-f]{64}$'), customer_id bigint, name text not null check (char_length(name) between 1 and 120),
  phone text check (phone is null or phone ~ '^01[0-9]{9}$'), created_at timestamptz not null default now(), last_at timestamptz not null default now(), supplier text);
 CREATE UNIQUE INDEX ar_chats_customer ON public.ar_chats (customer_id) WHERE customer_id IS NOT NULL;
 CREATE FUNCTION public.ar_supplier_of(p text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
 CREATE FUNCTION public.ar_store_place_order(p_name text, p_phone text, p_address text, p_notes text, p_items jsonb, p_rx text[] DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
  DECLARE v bigint; BEGIN INSERT INTO public.ar_store_orders(customer_name) VALUES (p_name) RETURNING id INTO v; RETURN jsonb_build_object('ok', true, 'order_id', v); END $$;
 INSERT INTO public.ar_sync_log DEFAULT VALUES;
 INSERT INTO public.ar_customers VALUES (101,'أحمد محمود',1250),(102,'منى سالم',-40);
 INSERT INTO public.ar_customer_links(customer_id, token) VALUES (101,'${T1}'),(102,'${T2}');
 INSERT INTO public.ar_customer_phones(customer_id, phone) VALUES (101,'201001112223');
 INSERT INTO public.ar_customer_moves VALUES (11,101,now()::timestamp - interval '2 hours','sale',450,0,1250,'[{"n":"PANADOL"}]'),(12,101,now()::timestamp - interval '1 hour','payment',0,200,1050,null),(13,101,now()::timestamp,'return',-50,0,1000,null),(21,102,now()::timestamp,'sale',10,0,-30,null);
 INSERT INTO public.ar_store_items VALUES (7,'بنادول','available');
 INSERT INTO public.ar_customer_regular(customer_id, item_id, name, gap, times, q, last) VALUES (101,7,'PANADOL',30,4,1,current_date);`);
 const sql=fs.readFileSync('supabase/migrations/202611180200_ar_customer_members.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const as=async(uid)=>db.exec(`SELECT set_config('app.uid','${uid||''}',false)`);
 const q=async(text,p)=>(await db.query(text,p)).rows;
 const one=async(fn,args)=>(await q(`SELECT public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS r`,args))[0].r;
 const add=(tok,name,show,acc)=>one('ar_member_add',[tok,name,show??false,acc??true]);
 const view=(tok,...rest)=>one('ar_customer_view',[tok,...rest]);

 // the owner of the account adds the people of his house: each gets his own secret, the total is hidden by default, the account is open to his orders by default
 let a=await add(T1,'  عمر   أحمد ');assert.equal(a.ok,true);assert.equal(a.name,'عمر أحمد','trimmed, one space');assert.match(a.token,/^[0-9a-f]{64}$/);assert.notEqual(a.token,T1);
 const MT=a.token;
 let list=await one('ar_members_list',[T1]);assert.equal(list.ok,true);assert.equal(list.max,10);assert.equal(list.members.length,1);
 assert.deepEqual([list.members[0].show_balance,list.members[0].on_account,list.members[0].seen_count],[false,true,0]);
 assert.equal(list.members[0].token,MT,'he can share the link again');
 assert.equal((await add(T1,'   ')).error,'bad_name');assert.equal((await add(T1,null)).error,'bad_name');
 assert.equal((await add('short','x')).error,'link');assert.equal((await add(null,'x')).error,'link');assert.equal((await add('f'.repeat(64),'x')).error,'link');
 // the owner's page: the same answer as always, plus who is looking
 let v=await view(T1);assert.equal(v.ok,true);assert.equal(v.me.role,'owner');assert.equal(Number(v.customer.balance),1250);assert.equal(v.moves.length,3);assert.equal(v.phone,'201001112223');assert.equal(Number(v.month.bought),400);assert.equal(Number(v.month.paid),200);
 assert.equal((await q(`SELECT seen_count FROM public.ar_customer_links WHERE customer_id=101`))[0].seen_count,1);

 // the member's page, total OFF: no balance, no month sums, no payments, no running balance, no paid amounts, not the owner's phone; counted on HIS row
 v=await view(MT);assert.equal(v.ok,true);
 assert.deepEqual(v.me,{role:'member',id:Number(a.id),name:'عمر أحمد',show_balance:false,on_account:true});
 assert.equal(v.customer.name,'أحمد محمود');assert.equal(v.customer.balance,null);assert.equal(v.month,null);assert.equal(v.phone,null);
 assert.deepEqual(v.moves.map(m=>m.kind).sort(),['return','sale'],'only the invoices and returns');
 for(const m of v.moves){assert.equal(m.paid,null);assert.equal(m.balance,null)}
 assert.equal(JSON.stringify(v).includes('1250'),false,'the balance is nowhere in the answer');assert.equal(JSON.stringify(v).includes('1050'),false);
 assert.deepEqual(v.moves.find(m=>m.kind==='sale').items,[{n:'PANADOL'}],'the items are his to see');
 assert.equal((await q(`SELECT seen_count FROM public.ar_customer_links WHERE customer_id=101`))[0].seen_count,1,'his opening is not the owner\'s');
 assert.equal((await one('ar_members_list',[T1])).members[0].seen_count,1);
 await view(MT);assert.equal((await one('ar_members_list',[T1])).members[0].seen_count,1,'within 5 minutes: once');
 // older pages (the second call) carry no balance either, and the pharmacy's own look is never counted
 v=await view(MT,'2999-01-01T00:00:00',null,100,true);assert.equal(v.moves.length,2);assert.equal(v.moves[0].balance,null);

 // the owner turns the total ON for him: balance, month, payments and the running balance appear
 assert.equal((await one('ar_member_update',[T1,Number(a.id),null,true,null])).ok,true);
 v=await view(MT);assert.equal(Number(v.customer.balance),1250);assert.equal(Number(v.month.paid),200);assert.equal(v.moves.length,3);assert.equal(Number(v.moves.find(m=>m.kind==='payment').paid),200);assert.equal(Number(v.moves.find(m=>m.id===11).balance),1250);assert.equal(v.me.show_balance,true);
 await one('ar_member_update',[T1,Number(a.id),null,false,null]);assert.equal((await view(MT)).customer.balance,null,'and OFF again');
 // a name change; nothing else touched
 assert.equal((await one('ar_member_update',[T1,Number(a.id),'عمر',null,null])).ok,true);list=await one('ar_members_list',[T1]);assert.deepEqual([list.members[0].name,list.members[0].show_balance,list.members[0].on_account],['عمر',false,true]);
 assert.equal((await one('ar_member_update',[T1,Number(a.id),'  ',null,null])).error,'bad_name');

 // only the owner of the account controls it: a member's secret, a stranger's secret and another customer's owner get nothing
 for(const [fn,args] of [['ar_members_list',[MT]],['ar_member_add',[MT,'x',false,true]],['ar_member_update',[MT,Number(a.id),'x',true,true]],['ar_member_remove',[MT,Number(a.id)]]]){assert.equal((await one(fn,args)).error,'not_owner',fn)}
 assert.equal((await one('ar_member_update',[T2,Number(a.id),null,true,null])).error,'no_member','another customer\'s owner cannot touch his member');
 assert.equal((await one('ar_member_remove',[T2,Number(a.id)])).error,'no_member');
 assert.equal((await view(MT)).customer.balance,null,'nothing changed by the refused calls');
 assert.equal((await one('ar_members_list',['f'.repeat(64)])).error,'link');

 // at most 10 a customer
 for(let i=2;i<=10;i++)assert.equal((await add(T1,'فرد '+i)).ok,true);
 assert.equal((await add(T1,'الحادي عشر')).error,'max');assert.equal((await one('ar_members_list',[T1])).members.length,10);
 assert.equal((await add(T2,'ابنة منى',true,false)).ok,true,'another customer has his own ten');

 // orders: a member's goes on the account under his name; cash only when the owner switched «على حسابي» off; the owner's stop still applies
 let o=await one('ar_customer_place_order',[MT,'01001112223','العنوان هنا','',JSON.stringify([{id:7,qty:1}]),null,'account']);
 assert.equal(o.ok,true);assert.equal(o.pay,'account');
 let ord=(await q(`SELECT * FROM public.ar_store_orders WHERE id=$1`,[o.order_id]))[0];assert.equal(ord.customer_name,'عمر (أهل أحمد محمود)');assert.equal(Number(ord.customer_id),101);assert.equal(ord.pay,'account');
 await one('ar_member_update',[T1,Number(a.id),null,null,false]);
 o=await one('ar_customer_place_order',[MT,'01001112223','العنوان هنا','',JSON.stringify([{id:7,qty:1}]),null,'account']);assert.equal(o.error,'member_cash');
 o=await one('ar_customer_place_order',[MT,'01001112223','العنوان هنا','',JSON.stringify([{id:7,qty:1}]),null,'cash']);assert.equal(o.ok,true);assert.equal(o.pay,'cash');
 await one('ar_member_update',[T1,Number(a.id),null,null,true]);
 await db.exec(`INSERT INTO public.ar_customer_stops VALUES (101)`);
 assert.equal((await one('ar_customer_place_order',[MT,'01001112223','العنوان هنا','',JSON.stringify([{id:7,qty:1}]),null,'account'])).error,'stopped','a stopped account stops its house too');
 assert.equal((await one('ar_customer_place_order',[T1,'01001112223','العنوان هنا','',JSON.stringify([{id:7,qty:1}]),null,'cash'])).ok,true);
 assert.equal((await q(`SELECT customer_name FROM public.ar_store_orders ORDER BY id DESC LIMIT 1`))[0].customer_name,'أحمد محمود','the owner\'s own orders are as before');
 assert.equal((await view(MT)).stopped,true);
 await db.exec(`DELETE FROM public.ar_customer_stops`);
 assert.equal((await one('ar_customer_place_order',['f'.repeat(64),'01001112223','العنوان هنا','',JSON.stringify([{id:7,qty:1}]),null,'cash'])).error,'link');
 assert.equal((await one('ar_customer_place_order',[MT,'01001112223','العنوان هنا','','[]',null,'nonsense'])).error,'bad_pay');

 // the regular items: the account's, for the house too
 let rr=await one('ar_customer_regular_view',[MT]);assert.equal(rr.ok,true);assert.equal(rr.rows.length,1);assert.equal(rr.rows[0].n,'PANADOL');assert.equal(rr.rows[0].ar,'بنادول');
 assert.equal((await one('ar_customer_regular_view',['f'.repeat(64)])).error,'link');

 // the messages page: a member gets HIS OWN chat (never the owner's), named for the pharmacy; the owner's stays the account's
 let c1=await one('ar_chat_open',[null,T1,null,null]);assert.equal(c1.ok,true);assert.equal(c1.linked,true);assert.equal(c1.name,'أحمد محمود');
 let c2=await one('ar_chat_open',[null,MT,null,null]);assert.equal(c2.ok,true);assert.equal(c2.linked,false);assert.equal(c2.name,'عمر (أهل أحمد محمود)');assert.notEqual(c2.secret,c1.secret);
 assert.equal((await one('ar_chat_open',[null,MT,null,null])).secret,c2.secret,'the same chat the next time');
 assert.equal((await one('ar_chat_open',[c2.secret,null,null,null])).name,'عمر (أهل أحمد محمود)','by its own secret as before');
 assert.equal((await one('ar_chat_open',[null,T1,null,null])).secret,c1.secret);
 assert.equal((await one('ar_chat_open',[null,'f'.repeat(64),null,null])).error,'link');
 assert.equal((await one('ar_chat_open',[null,null,'زائر','01223334445'])).linked,false,'a plain visitor still works');

 // removing a member: his secret stops at once; his chat stays as a plain chat
 assert.equal((await one('ar_member_remove',[T1,Number(a.id)])).ok,true);
 assert.equal((await view(MT)).error,'link');assert.equal((await one('ar_customer_place_order',[MT,'01001112223','العنوان هنا','',JSON.stringify([{id:7,qty:1}]),null,'cash'])).error,'link');
 assert.equal((await one('ar_chat_open',[null,MT,null,null])).error,'link');assert.equal((await one('ar_customer_regular_view',[MT])).error,'link');
 assert.equal((await q(`SELECT member_id FROM public.ar_chats WHERE secret=$1`,[c2.secret]))[0].member_id,null);
 assert.equal((await one('ar_members_list',[T1])).members.length,9);
 assert.equal((await one('ar_member_remove',[T1,Number(a.id)])).error,'no_member');

 // the pharmacy's numbers: the owner only
 await as(OWNER);let n=await one('ar_members_count',[]);assert.deepEqual([n.members,n.customers],[10,2]);assert.ok(n.opened>=0);
 await as(STRANGER);await assert.rejects(()=>one('ar_members_count',[]),/owner only/);
 await as(null);await assert.rejects(()=>one('ar_members_count',[]),/owner only/);

 // grants: the customer's page (visitors and the signed-in) uses them; nothing is public; the internal resolver is not callable; the table is closed (the pharmacy's owner reads it by a policy)
 const can=async(role,fn)=>(await q(`SELECT has_function_privilege('${role}','${fn}','execute') AS ok`))[0].ok;
 for(const fn of ['public.ar_members_list(text)','public.ar_member_add(text,text,boolean,boolean)','public.ar_member_update(text,bigint,text,boolean,boolean)','public.ar_member_remove(text,bigint)','public.ar_customer_view(text,timestamp,bigint,integer,boolean)','public.ar_customer_place_order(text,text,text,text,jsonb,text[],text)','public.ar_customer_regular_view(text)','public.ar_chat_open(text,text,text,text)']){
  assert.equal(await can('anon',fn),true,fn);assert.equal(await can('authenticated',fn),true,fn);assert.equal(await can('public',fn),false,fn)}
 for(const role of ['anon','authenticated','public'])assert.equal(await can(role,'public.ar_member_resolve(text)'),false,'the resolver is internal: '+role);
 assert.equal(await can('anon','public.ar_members_count()'),false);assert.equal(await can('authenticated','public.ar_members_count()'),true);
 assert.equal((await q(`SELECT has_table_privilege('anon','public.ar_customer_members','select') AS ok`))[0].ok,false);
 assert.equal((await q(`SELECT relrowsecurity FROM pg_class WHERE oid='public.ar_customer_members'::regclass`))[0].relrowsecurity,true);
 // one function of each name (no overload that would make a named call ambiguous)
 for(const name of ['ar_customer_view','ar_customer_place_order','ar_customer_regular_view','ar_chat_open'])assert.equal((await q(`SELECT count(*)::int n FROM pg_proc WHERE proname='${name}' AND pronamespace='public'::regnamespace`))[0].n,1,name);
 console.log('customer-members-sql ok');
})().catch(e=>{console.error(e);process.exit(1)});
