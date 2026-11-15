// Migration 202611150400: what «آدم» may RECORD after the owner's spoken yes: a customer's / a supplier's payment (ar_ops), a sale or
// a return (ar_temp_sales, priced from ar_stock inside the database), a cancel. Runs on an in-memory Postgres. Made-up keys, people, items.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',OTHER='00000000-0000-4000-8000-0000000000e1';
const sha=(k)=>crypto.createHash('sha256').update(k).digest('hex');
const PHONE='a'.repeat(64),LAPTOP='b'.repeat(64);
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
 CREATE TABLE public.ar_customers(id bigint primary key, name text, balance numeric(14,2));
 CREATE TABLE public.ar_vendors(id bigint primary key, name text, short text, balance numeric(14,2));
 CREATE TABLE public.ar_customer_stops(customer_id bigint primary key, stopped_at timestamptz not null default now(), stopped_by uuid default auth.uid());
 CREATE TABLE public.ar_stock(item_id bigint primary key, name text not null, price numeric(12,2), packs numeric(12,2) not null default 0, units numeric(12,2) not null default 0, parts integer);
 INSERT INTO public.ar_customers VALUES (7,'عميل تجربة',120.50),(8,'عميل تاني',0);
 INSERT INTO public.ar_vendors VALUES (50,'مخزن تجربة','TST',45000.25);
 INSERT INTO public.ar_stock VALUES (1,'PANADOL TEST 24TAB',50,10,0,2),(2,'FLAGYL TEST',30,5,0,1),(3,'EMPTY TEST',20,0,0,1),(4,'NOPRICE TEST',null,5,0,1);`);
 for(const f of ['202611122330_ar_temp_sales','202611130030_ar_temp_sales_kind','202611130600_ar_temp_sales_adjust','202611150100_ar_adam','202611150400_ar_adam_ops']){
  const sql=fs.readFileSync('supabase/migrations/'+f+'.sql','utf8');await db.exec(sql);
  if(f.endsWith('ops')) await db.exec(sql); // applied twice: safe
 }
 await db.exec(`GRANT USAGE ON SCHEMA public TO anon, authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON public.ar_ops, public.ar_temp_sales TO authenticated;
 INSERT INTO public.ar_adam_keys(key_hash,role,label) VALUES ('${sha(PHONE)}','phone','p'),('${sha(LAPTOP)}','laptop','l');`);
 const as=async(role,uid,q,params)=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid||''}',false); SET ROLE ${role};`);try{return (await db.query(q,params)).rows}finally{await db.exec('RESET ROLE')}};
 const rpc=async(name,args)=>{const ph=args.map((_,i)=>'$'+(i+1)).join(',');const r=await as('anon','',`SELECT public.${name}(${ph}) AS r`,args);return r[0].r};
 const J=JSON.stringify;
 // a confirmed request: the phone asked, the laptop answered with a proposal, the owner said yes, the laptop took the yes
 let n=0;
 async function confirmed(){
  const convo='c'+(++n);
  const a=await rpc('ar_adam_ask',[PHONE,convo,'سجّل',null,null]);const c=await rpc('ar_adam_claim',[LAPTOP]);
  await rpc('ar_adam_answer',[LAPTOP,c.id,true,J({speak:'x',confirm:{say:'x',do:[{type:'record_payment'}],done_say:'تمام'}})]);
  const y=await rpc('ar_adam_ask',[PHONE,convo,'أيوه',c.id,'yes']);const t=await rpc('ar_adam_claim',[LAPTOP]);
  assert.equal(t.id,y.id);return t.id;
 }
 const doit=(req,action,args)=>rpc('ar_adam_do',[LAPTOP,req,action,J(args)]);

 // nothing is recorded before the spoken yes, whatever the brain says
 const k0=await rpc('ar_adam_ask',[PHONE,'z','x',null,null]);const w0=await rpc('ar_adam_claim',[LAPTOP]);
 for(const [a,args] of [['record_payment',{party:'customer',id:7,amount:100}],['record_sale',{lines:[{item_id:1,qty:1}]}],['cancel_op',{target:'op',id:1}]])
  assert.equal((await doit(w0.id,a,args)).error,'not_confirmed',a+' before the yes');
 assert.equal((await rpc('ar_adam_do',[PHONE,w0.id,'record_payment',J({party:'customer',id:7,amount:1})])).error,'key','the phone key cannot do it');
 await rpc('ar_adam_answer',[LAPTOP,w0.id,true,'{}']);

 // a customer's payment: recorded once, with the balance as it was said
 let q=await confirmed();
 let r=await doit(q,'record_payment',{party:'customer',id:7,amount:'500.456',note:'نقدي'});
 assert.equal(r.ok,true);assert.equal(r.name,'عميل تجربة');assert.equal(r.amount,500.46);
 const op=(await as('authenticated',OWNER,`SELECT * FROM public.ar_ops ORDER BY id`))[0];
 assert.equal(op.kind,'customer_payment');assert.equal(op.party_id,7);assert.equal(Number(op.amount),500.46);assert.equal(Number(op.balance_before),120.5);assert.equal(op.status,'pending');assert.equal(op.source,'adam');assert.equal(op.note,'نقدي');
 // the same confirmation, the same action number: refused (once per confirmation); another number is another payment
 assert.equal((await doit(q,'record_payment',{party:'customer',id:7,amount:500.46})).error,'duplicate');
 assert.equal((await doit(q,'record_payment',{party:'vendor',id:50,amount:1000,seq:2})).ok,true);
 const ops=await as('authenticated',OWNER,`SELECT kind,party_name,amount,balance_before FROM public.ar_ops ORDER BY id`);
 assert.equal(ops.length,2);assert.equal(ops[1].kind,'vendor_payment');assert.equal(ops[1].party_name,'مخزن تجربة');assert.equal(Number(ops[1].balance_before),45000.25);
 await rpc('ar_adam_answer',[LAPTOP,q,true,'{}']);
 // bad payments are refused
 q=await confirmed();
 for(const [args,err] of [[{party:'customer',id:999,amount:5},'no_customer'],[{party:'vendor',id:999,amount:5},'no_vendor'],[{party:'customer',id:7,amount:0},'args'],[{party:'customer',id:7,amount:-5},'args'],
   [{party:'customer',id:7,amount:5000001},'args'],[{party:'customer',id:7,amount:'abc'},'args'],[{party:'bank',id:7,amount:5},'args'],[{party:'customer',amount:5},'args'],[{party:'customer',id:7,amount:5,seq:0},'seq'],[{party:'customer',id:7,amount:5,seq:'x'},'seq']])
  assert.equal((await doit(q,'record_payment',args)).error,err,J(args));
 assert.equal((await as('authenticated',OWNER,`SELECT count(*)::int n FROM public.ar_ops`))[0].n,2,'nothing else was recorded');
 await rpc('ar_adam_answer',[LAPTOP,q,true,'{}']);

 // a sale: priced inside the database from ar_stock (a box, or one unit = price / parts), never from the brain's words
 q=await confirmed();
 r=await doit(q,'record_sale',{kind:'sale',lines:[{item_id:1,qty:2,unit:'pack'},{item_id:1,qty:3,unit:'unit'},{item_id:2,qty:1}],expect_total:'205',paid:50,note:'تجربة'});
 assert.equal(r.ok,true,J(r));assert.equal(r.total,205);assert.ok(r.no>0);
 const s=(await as('authenticated',OWNER,`SELECT * FROM public.ar_temp_sales`))[0];
 assert.equal(s.kind,'sale');assert.equal(s.status,'pending');assert.equal(s.customer_id,null);assert.equal(Number(s.total),205);assert.equal(s.paid,null,'a cash sale has no paid');assert.equal(s.note,'آدم تجربة');
 assert.deepEqual(s.items,[{c:1,n:'PANADOL TEST 24TAB',q:2,u:'pack',p:50},{c:1,n:'PANADOL TEST 24TAB',q:3,u:'unit',p:25},{c:2,n:'FLAGYL TEST',q:1,u:'pack',p:30}]);
 assert.equal((await doit(q,'record_sale',{lines:[{item_id:2,qty:1}]})).error,'duplicate','once per confirmation');
 await rpc('ar_adam_answer',[LAPTOP,q,true,'{}']);
 // a credit sale and a return for a customer; the total the owner heard must match (within a pound)
 q=await confirmed();
 r=await doit(q,'record_sale',{kind:'sale',customer_id:7,lines:[{item_id:2,qty:2}],paid:20,expect_total:60.4});
 assert.equal(r.ok,true,J(r));
 assert.equal((await doit(q,'record_sale',{kind:'return',customer_id:8,lines:[{item_id:2,qty:1}],paid:10,seq:2})).ok,true);
 assert.equal((await doit(q,'record_sale',{kind:'sale',lines:[{item_id:2,qty:1}],expect_total:50,seq:3})).error,'price_changed');
 const rows=await as('authenticated',OWNER,`SELECT kind,customer_id,customer_name,total,paid FROM public.ar_temp_sales ORDER BY no`);
 assert.equal(rows.length,3);assert.deepEqual([rows[1].kind,rows[1].customer_id,rows[1].customer_name,Number(rows[1].total),Number(rows[1].paid)],['sale',7,'عميل تجربة',60,20]);
 assert.deepEqual([rows[2].kind,rows[2].customer_id,Number(rows[2].total),Number(rows[2].paid)],['return',8,30,10]);
 await rpc('ar_adam_answer',[LAPTOP,q,true,'{}']);
 // bad sales are refused and leave nothing
 q=await confirmed();
 for(const [args,err] of [[{lines:[]},'lines'],[{},'lines'],[{lines:[{item_id:99,qty:1}]},'no_item'],[{lines:[{item_id:4,qty:1}]},'no_item'],[{lines:[{item_id:3,qty:1}]},'no_stock'],
   [{lines:[{item_id:1,qty:0}]},'lines'],[{lines:[{item_id:1,qty:1.5}]},'lines'],[{lines:[{item_id:1,qty:1000}]},'lines'],[{lines:[{item_id:2,qty:1,unit:'unit'}]},'lines'],[{lines:[{item_id:1,qty:1,unit:'box'}]},'lines'],
   [{kind:'gift',lines:[{item_id:1,qty:1}]},'args'],[{customer_id:999,lines:[{item_id:1,qty:1}]},'no_customer'],[{lines:[{item_id:1,qty:1}],paid:-1},'args']])
  assert.equal((await doit(q,'record_sale',args)).error,err,J(args));
 assert.equal((await doit(q,'record_sale',{kind:'return',lines:[{item_id:3,qty:1}]})).ok,true,'a return of an item with no stock is fine');
 assert.equal((await as('authenticated',OWNER,`SELECT count(*)::int n FROM public.ar_temp_sales`))[0].n,4);
 await rpc('ar_adam_answer',[LAPTOP,q,true,'{}']);

 // cancel: only Adam's own pending ones
 q=await confirmed();
 assert.equal((await doit(q,'cancel_op',{target:'op',id:1})).ok,true);
 assert.equal((await doit(q,'cancel_op',{target:'op',id:1,seq:2})).error,'not_pending','already cancelled');
 const sale=(await as('authenticated',OWNER,`SELECT no FROM public.ar_temp_sales ORDER BY no LIMIT 1`))[0].no;
 assert.equal((await doit(q,'cancel_op',{target:'sale',id:sale,seq:3})).ok,true);
 await as('authenticated',OWNER,`INSERT INTO public.ar_temp_sales(id,sold_at,items,total) VALUES (gen_random_uuid(),now(),'[{"c":1,"q":1,"u":"pack","p":5}]'::jsonb,5)`);
 const hand=(await as('authenticated',OWNER,`SELECT no FROM public.ar_temp_sales WHERE adam_request IS NULL`))[0].no;
 assert.equal((await doit(q,'cancel_op',{target:'sale',id:hand,seq:4})).error,'not_pending','a sale he made by hand is not touched');
 assert.equal((await doit(q,'cancel_op',{target:'thing',id:1,seq:5})).error,'args');
 assert.deepEqual((await as('authenticated',OWNER,`SELECT status FROM public.ar_ops ORDER BY id`)).map(x=>x.status),['cancelled','pending']);
 await rpc('ar_adam_answer',[LAPTOP,q,true,'{}']);

 // the old actions still work, and an unknown one does nothing
 q=await confirmed();
 assert.equal((await doit(q,'stop_credit',{customer_id:7})).ok,true);
 assert.equal((await doit(q,'drop_everything',{seq:2})).error,'unknown_action');
 await rpc('ar_adam_answer',[LAPTOP,q,true,'{}']);

 // who can read or change the operations: only the owner; nobody with a public key
 await assert.rejects(()=>as('anon','',`SELECT * FROM public.ar_ops`),/permission denied/);
 assert.equal((await as('authenticated',OTHER,`SELECT * FROM public.ar_ops`)).length,0,'another user sees none');
 assert.equal((await as('authenticated',OWNER,`UPDATE public.ar_ops SET status='cancelled' WHERE status='pending' RETURNING id`)).length,1,'the owner can cancel in the page');
 console.log('PASS: adam ops: payments, sales and cancels are recorded only after the spoken yes, priced in the database, once per confirmation');
 process.exit(0);
})().catch((e)=>{console.error(e);process.exit(1)});
