// Migration 202611151100: a bag change chosen item by item (into ar_bag_moves, the table of the «الحقائب» page), a purchase order
// (ar_ops items), and the 30-minute window for answering a reply that walks a list. Runs on an in-memory Postgres. Made-up keys and items.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c';
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
 INSERT INTO public.ar_customers VALUES (7,'عميل تجربة',100); INSERT INTO public.ar_vendors VALUES (50,'مخزن تجربة','TST',10);`);
 for(const f of ['202611122330_ar_temp_sales','202611130030_ar_temp_sales_kind','202611130600_ar_temp_sales_adjust','202611150100_ar_adam','202611150400_ar_adam_ops','202611150500_ar_bag_moves','202611151100_ar_adam_walk']){
  const sql=fs.readFileSync('supabase/migrations/'+f+'.sql','utf8');await db.exec(sql);
  if(f.endsWith('walk')) await db.exec(sql); // applied twice: safe
 }
 await db.exec(`GRANT USAGE ON SCHEMA public TO anon, authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON public.ar_ops TO authenticated;
 INSERT INTO public.ar_adam_keys(key_hash,role,label) VALUES ('${sha(PHONE)}','phone','p'),('${sha(LAPTOP)}','laptop','l');`);
 const as=async(role,uid,q,params)=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid||''}',false); SET ROLE ${role};`);try{return (await db.query(q,params)).rows}finally{await db.exec('RESET ROLE')}};
 const rpc=async(name,args)=>{const ph=args.map((_,i)=>'$'+(i+1)).join(',');const r=await as('anon','',`SELECT public.${name}(${ph}) AS r`,args);return r[0].r};
 const J=JSON.stringify;
 let n=0;
 async function proposal(walk){
  const convo='w'+(++n);
  await rpc('ar_adam_ask',[PHONE,convo,'حوّل',null,null]);const c=await rpc('ar_adam_claim',[LAPTOP]);
  const reply={speak:'x',confirm:{say:'x',do:[{type:'record_bag_move'}]}};if(walk)reply.walk={mode:'pick',items:[]};
  await rpc('ar_adam_answer',[LAPTOP,c.id,true,J(reply)]);
  return {convo,id:c.id};
 }
 const age=(id,min)=>db.exec(`UPDATE public.ar_adam_requests SET done_at = now() - interval '${min} minutes' WHERE id = ${id}`);
 async function yes(p,body='أيوه'){const y=await rpc('ar_adam_ask',[PHONE,p.convo,body,p.id,'yes']);if(!y.ok)return y;const t=await rpc('ar_adam_claim',[LAPTOP]);assert.equal(t.id,y.id);return t;}
 const doit=(req,action,args)=>rpc('ar_adam_do',[LAPTOP,req,action,J(args)]);
 const moves=()=>as('authenticated',OWNER,`SELECT item_id,item_name,from_bag,to_bag,status FROM public.ar_bag_moves ORDER BY id`);

 // the window: a plain proposal must be answered within 5 minutes; a walk within 30
 let p=await proposal(false);await age(p.id,6);
 assert.equal((await rpc('ar_adam_ask',[PHONE,p.convo,'أيوه',p.id,'yes'])).error,'no_pending','a plain proposal: 6 minutes is too late');
 p=await proposal(true);await age(p.id,20);
 let t=await yes(p,'pick:11,12');assert.ok(t.id,'a walk: 20 minutes later still works');assert.equal(t.body,'pick:11,12');
 // a bag change: the chosen items go into ar_bag_moves, like the «الحقائب» page writes them
 let r=await doit(t.id,'record_bag_move',{from:'2428',to:'2434',to_name:'محمد احمد سرحان',items:[{i:11,n:'PANADOL'},{i:12,n:'FLAGYL',x:{have:1,need:3}}]});
 assert.equal(r.ok,true,J(r));assert.equal(r.n,2);assert.equal(r.name,'محمد احمد سرحان');
 assert.deepEqual(await moves(),[{item_id:11,item_name:'PANADOL',from_bag:'2428',to_bag:'2434',status:'pending'},{item_id:12,item_name:'FLAGYL',from_bag:'2428',to_bag:'2434',status:'pending'}]);
 // moving an item again closes its older open move (one open move per item), and «النواقص العامة» is a place too
 r=await doit(t.id,'record_bag_move',{from:'2434',to:'gs',items:[{i:11,n:'PANADOL'}],seq:2});
 assert.equal(r.ok,true,J(r));
 const m=await moves();assert.deepEqual(m.map(x=>[x.item_id,x.to_bag,x.status]),[[11,'2434','cancelled'],[12,'2434','pending'],[11,'gs','pending']]);
 for(const [args,err] of [[{from:'2428',to:'2428',items:[{i:1}],seq:3},'args'],[{from:'2428',to:'x',items:[{i:1}],seq:4},'args'],[{to:'2434',items:[{i:1}],seq:5},'args'],
   [{from:'2428',to:'2434',items:[],seq:6},'args'],[{from:'2428',to:'2434',items:[{i:0}],seq:7},'items'],[{from:'2428',to:'2434',items:[{i:'a'}],seq:8},'items']])
  assert.equal((await doit(t.id,'record_bag_move',args)).error,err,J(args));
 await rpc('ar_adam_answer',[LAPTOP,t.id,true,'{}']);
 p=await proposal(true);await age(p.id,31);
 assert.equal((await rpc('ar_adam_ask',[PHONE,p.convo,'pick:1',p.id,'yes'])).error,'no_pending','a walk: 31 minutes is too late');
 // a purchase order: every item needs a whole quantity; once per confirmation
 p=await proposal(true);t=await yes(p,'pick:5');
 r=await doit(t.id,'record_purchase_order',{to:50,to_name:'مخزن تجربة',items:[{i:5,n:'X',q:3},{i:6,n:'Y',q:1}]});
 assert.equal(r.ok,true,J(r));
 const po=(await as('authenticated',OWNER,`SELECT kind,party_id,party_name,amount,items FROM public.ar_ops WHERE kind='purchase_order'`))[0];
 assert.deepEqual([po.kind,po.party_id,po.party_name,po.amount],['purchase_order',50,'مخزن تجربة',null]);
 assert.deepEqual(po.items,[{i:5,n:'X',q:3},{i:6,n:'Y',q:1}]);
 assert.equal((await doit(t.id,'record_purchase_order',{to:50,items:[{i:5,q:1}]})).error,'duplicate');
 for(const [args,err] of [[{to:50,items:[{i:5,n:'X'}],seq:2},'items'],[{to:50,items:[{i:5,q:0}],seq:3},'items'],[{to:50,items:[{i:5,q:1.5}],seq:4},'items'],[{to:50,items:[{i:5,q:10000}],seq:5},'items'],
   [{to:50,items:[],seq:6},'args'],[{items:[{i:5,q:1}],seq:7},'args'],[{to:-1,items:[{i:5,q:1}],seq:8},'args'],[{to:50,items:[{i:0,q:1}],seq:9},'items']])
  assert.equal((await doit(t.id,'record_purchase_order',args)).error,err,J(args));
 await rpc('ar_adam_answer',[LAPTOP,t.id,true,'{}']);
 // payments still need an amount; a bag move is not an ar_ops kind; nothing is recorded before the spoken yes
 await assert.rejects(()=>db.exec(`INSERT INTO public.ar_ops(kind,party_id) VALUES ('customer_payment',7)`),/ar_ops_money_has_amount/);
 await assert.rejects(()=>db.exec(`INSERT INTO public.ar_ops(kind,party_id) VALUES ('bag_move',7)`),/ar_ops_kind_check/);
 await rpc('ar_adam_ask',[PHONE,'z','x',null,null]);const w=await rpc('ar_adam_claim',[LAPTOP]);
 assert.equal((await doit(w.id,'record_bag_move',{from:'2428',to:'2434',items:[{i:1}]})).error,'not_confirmed');
 assert.equal((await doit(w.id,'record_purchase_order',{to:50,items:[{i:1,q:1}]})).error,'not_confirmed');
 console.log('PASS: adam walk: bag changes (into ar_bag_moves) and purchase orders chosen item by item are recorded after the yes; a walk may be answered within 30 minutes');
 process.exit(0);
})().catch((e)=>{console.error(e);process.exit(1)});
