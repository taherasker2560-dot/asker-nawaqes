// «دعم من صاحب المنشأة» corrects a payment (owner 2026-11-19: «لو دفعت ١٠ جنيه لحد بدل ما ادفع ٥ فكده الخزنه بتزيد فبصلح حسابه …
// بس عشان اصلح الخزنه بضطر اعمل الدعم»): migration 202611190930 on top of the cash, the payments and the owner ones. A payment entered
// with more than the order, then op 50 in the same box for the difference (one or several back to back) → the order closes by itself
// with the «دعم» kept on it; a «دعم» of another amount, another box, too late, or already used does nothing; skip still wins.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir=path.join(__dirname,'..','supabase','migrations');
const read=(f)=>fs.readFileSync(path.join(dir,f),'utf8');
const sql=read('202611190930_ar_pay_fix.sql');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);
 CREATE TABLE public.ar_vendors(id bigint PRIMARY KEY, name text not null, short text, balance numeric(14,2) not null default 0);`);
 await db.exec(read('202611151900_ar_cash.sql'));await db.exec(read('202611190300_ar_pay_orders.sql'));await db.exec(read('202611190400_ar_pay_owner.sql'));
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated; GRANT SELECT ON public.ar_pay_orders, public.ar_cash_moves TO authenticated;`);
 const KEY='cd'.repeat(32);
 await db.query(`insert into public.ar_sync_keys values ($1,null)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 await db.exec(`insert into public.ar_vendors values (2374,'A M group','AMG',124144.88),(2513,'مخزن الدكتور','DOC',5000)`);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const sync=(m)=>one(`select public.ar_cash_sync($1,'[]'::jsonb,$2::jsonb,'[]'::jsonb,'[]'::jsonb) r`,[KEY,JSON.stringify(m)]).then(x=>x.r);
 await one(`select public.ar_cash_sync($1,$2::jsonb,'[]'::jsonb,'[]'::jsonb,$3::jsonb) r`,[KEY,JSON.stringify([{id:4,name:'احتياطى',type:1,balance:45040},{id:11,name:'محفظه انستاباى',type:0,balance:1563.65}]),JSON.stringify([{id:1,name:'مرتبات و اجور'}])]);
 const t=(min)=>new Date(Date.now()+min*6e4).toLocaleString('sv-SE',{timeZone:'Africa/Cairo',hour12:false}).replace(' ','T');
 const as=async(uid,q,p=[])=>{await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false)`);try{return await one(q,p)}finally{await db.exec(`reset role`)}};
 const save=(a)=>as(OWNER,`select public.ar_pay_order_save($1,$2,$3,$4,$5,$6,$7) r`,[null,a.kind,a.account,a.party??null,a.amount,a.memo??null,true]).then(x=>x.r);
 const act=(id,action)=>as(OWNER,`select public.ar_pay_order_act($1,$2) r`,[id,action]).then(x=>x.r);
 const order=async(id)=>{const r=await one(`select status, move_id, fix_ids, move from public.ar_pay_orders where id=$1`,[id]);return {status:r.status,move:r.move_id==null?null:Number(r.move_id),fix:(r.fix_ids||[]).map(Number),total:r.move&&r.move.fix!=null?Number(r.move.fix):null}};

 // 1) he paid 10 instead of 5, then «دعم» 5 in the same box a minute later → closed, the «دعم» kept on it
 const a=await save({kind:'vendor',account:4,party:2374,amount:5});
 await sync([{id:101,account_id:4,at:t(2),op:9,kind:'vendor',amount:-10,who:'A M group',dealer_id:2374}]);
 assert.deepEqual(await order(a.id),{status:'mismatch',move:101,fix:[],total:null},'before the «دعم» it is a difference, as before');
 await sync([{id:102,account_id:4,at:t(3),op:50,kind:'other_in',amount:5}]);
 assert.deepEqual(await order(a.id),{status:'matched',move:101,fix:[102],total:5});
 const mv=(await one(`select move from public.ar_pay_orders where id=$1`,[a.id])).move;
 assert.deepEqual([mv.id,Number(mv.amount),mv.fix_ids.map(Number)],[101,-10,[102]],'the screen gets the payment and the «دعم»');

 // 2) the payment and several «دعم» arrive together (534 for an order of 249.90: 81.53 + 162.57 + 40 = 284.10), an expense
 const b=await save({kind:'expense',account:11,party:1,amount:249.90});
 await sync([{id:201,account_id:11,at:t(5),op:1001,kind:'expense',amount:-534,who:'مرتبات و اجور'},
  {id:202,account_id:11,at:t(6),op:50,kind:'other_in',amount:81.53},{id:203,account_id:11,at:t(6),op:50,kind:'other_in',amount:162.57},
  {id:204,account_id:11,at:t(8),op:50,kind:'other_in',amount:40}]);
 assert.deepEqual(await order(b.id),{status:'matched',move:201,fix:[202,203,204],total:284.10});

 // 3) a «دعم» before the right ones (bank profits) does not stop it; the owner's own payments too (op 51)
 const c=await save({kind:'owner',account:4,amount:300,memo:'طاهر'});
 await sync([{id:301,account_id:4,at:t(10),op:51,kind:'owner',amount:-500,memo:'طاهر'},
  {id:302,account_id:4,at:t(11),op:50,kind:'other_in',amount:60.83,memo:'ارباح بنكيه'},{id:303,account_id:4,at:t(12),op:50,kind:'other_in',amount:200}]);
 assert.deepEqual(await order(c.id),{status:'matched',move:301,fix:[303],total:200});

 // 4) no match: a «دعم» of another amount, in another box, before the payment, or 4 days later → still a difference
 const d=await save({kind:'vendor',account:4,party:2513,amount:1000});
 await sync([{id:400,account_id:4,at:t(14),op:50,kind:'other_in',amount:200},
  {id:401,account_id:4,at:t(15),op:9,kind:'vendor',amount:-1200,who:'مخزن الدكتور',dealer_id:2513},
  {id:402,account_id:4,at:t(16),op:50,kind:'other_in',amount:150},{id:403,account_id:11,at:t(16),op:50,kind:'other_in',amount:200},
  {id:404,account_id:4,at:t(16+4*1440),op:50,kind:'other_in',amount:200}]);
 assert.deepEqual(await order(d.id),{status:'mismatch',move:401,fix:[],total:null},'nothing adds up to 200 in that box within 3 days after');
 // the right «دعم» comes later → it closes then
 await sync([{id:405,account_id:4,at:t(40),op:50,kind:'other_in',amount:50}]);
 assert.deepEqual(await order(d.id),{status:'matched',move:401,fix:[402,405],total:200},'150 + 50, back to back among the «دعم» of that box');

 // 5) one «دعم» corrects one order only: two orders of the same supplier, two payments of 10 for 5 each, one «دعم» of 5
 const e1=await save({kind:'vendor',account:11,party:2374,amount:5}),e2=await save({kind:'vendor',account:11,party:2374,amount:5});
 await sync([{id:501,account_id:11,at:t(50),op:9,kind:'vendor',amount:-10,who:'A M group',dealer_id:2374},
  {id:502,account_id:11,at:t(51),op:9,kind:'vendor',amount:-10,who:'A M group',dealer_id:2374},{id:503,account_id:11,at:t(52),op:50,kind:'other_in',amount:5}]);
 assert.deepEqual(await order(e1.id),{status:'matched',move:501,fix:[503],total:5});
 assert.deepEqual(await order(e2.id),{status:'mismatch',move:502,fix:[],total:null},'the «دعم» 503 is already used');
 await sync([{id:504,account_id:11,at:t(53),op:50,kind:'other_in',amount:5}]);
 assert.deepEqual(await order(e2.id),{status:'matched',move:502,fix:[504],total:5});

 // 6) a paid-less move is not «corrected» (that is another payment, not a «دعم»); «مش هي» keeps that move out
 const f=await save({kind:'vendor',account:4,party:2374,amount:700});
 await sync([{id:601,account_id:4,at:t(60),op:9,kind:'vendor',amount:-650,who:'A M group',dealer_id:2374},{id:602,account_id:4,at:t(61),op:50,kind:'other_in',amount:50}]);
 assert.equal((await order(f.id)).status,'mismatch');
 const g=await save({kind:'owner',account:11,amount:100});
 await sync([{id:701,account_id:11,at:t(70),op:51,kind:'owner',amount:-130}]);
 assert.equal((await order(g.id)).status,'mismatch');
 assert.equal((await act(g.id,'skip')).status,'approved');
 await sync([{id:702,account_id:11,at:t(71),op:50,kind:'other_in',amount:30}]);
 assert.deepEqual(await order(g.id),{status:'approved',move:null,fix:[],total:null},'he said «مش هي» to 701: its «دعم» does not bring it back');

 // 7) the exact payment still wins over a corrected one; the function is not open to anyone
 const h=await save({kind:'vendor',account:4,party:2513,amount:90});
 await sync([{id:801,account_id:4,at:t(80),op:9,kind:'vendor',amount:-100,who:'مخزن الدكتور',dealer_id:2513},{id:802,account_id:4,at:t(80),op:50,kind:'other_in',amount:10},
  {id:803,account_id:4,at:t(81),op:9,kind:'vendor',amount:-90,who:'مخزن الدكتور',dealer_id:2513}]);
 assert.deepEqual(await order(h.id),{status:'matched',move:803,fix:[],total:null});
 await db.exec(`set role authenticated`);
 await assert.rejects(()=>db.query(`select public.ar_pay_fix(4, now()::timestamp, 10, null)`),/permission denied/);
 await db.exec(`reset role`);
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate|delete from/i);
 console.log('PASS: pay fix: paid more + «دعم» for the difference closes the order (several «دعم», another kind, late «دعم»), one «دعم» per order, skip and exact win');
})().catch((e)=>{console.error(e);process.exit(1)});
