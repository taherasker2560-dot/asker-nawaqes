// «💸 المدفوعات» (owner 2026-11-19, «ب» for now): migration 202611190300 on an in-memory Postgres, after the cash one it builds on.
// The laptop's upload keeps working with the old call (4 arguments) and now takes the supplier's card and the expense categories;
// the owner saves / approves / cancels orders (nobody else can, nobody else reads them); an approved order closes by itself when the
// move with the same box, party and amount comes in from PharmaFly; another amount or box = «فيه فرق», then «هي دي» or «مش هي».
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir=path.join(__dirname,'..','supabase','migrations');
const cash=fs.readFileSync(path.join(dir,'202611151900_ar_cash.sql'),'utf8');
const sql=fs.readFileSync(path.join(dir,'202611190300_ar_pay_orders.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',STAFF='11111111-1111-1111-1111-111111111111';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);
 CREATE TABLE public.ar_vendors(id bigint PRIMARY KEY, name text not null, short text, balance numeric(14,2) not null default 0);`);
 await db.exec(cash);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
  GRANT SELECT ON public.ar_cash_accounts, public.ar_cash_moves, public.ar_cash_cats, public.ar_pay_orders, public.ar_vendors TO authenticated;`);
 const KEY='ab'.repeat(32);
 await db.query(`insert into public.ar_sync_keys values ($1,null)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 await db.exec(`insert into public.ar_vendors values (2374,'A M group','AMG',124144.88),(2495,'IBN SINA 1','IBN',3471.51),(188,'IBN SINA 2','IBN',0)`);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const sync4=(a,m,g=[])=>one(`select public.ar_cash_sync(p_key=>$1,p_accounts=>$2::jsonb,p_moves=>$3::jsonb,p_gone=>$4::jsonb) r`,[KEY,JSON.stringify(a),JSON.stringify(m),JSON.stringify(g)]).then(x=>x.r);
 const sync=(a,m,c=[])=>one(`select public.ar_cash_sync($1,$2::jsonb,$3::jsonb,'[]'::jsonb,$4::jsonb) r`,[KEY,JSON.stringify(a),JSON.stringify(m),JSON.stringify(c)]).then(x=>x.r);
 // the old call (the laptop before its update) still works
 const A=[{id:4,name:'احتياطى',type:1,balance:45040},{id:3,name:'محفظه فودافون',type:0,balance:7415.35}];
 assert.deepEqual(await sync4(A,[{id:100,account_id:4,at:'2026-11-18T20:00:46',op:9,kind:'vendor',amount:-27100,who:'IBN SINA 1'}]),{ok:true,accounts:2,moves:1,gone:0,cats:0});
 // the new call: the categories and the supplier's card
 const C=[{id:1,name:'مرتبات و اجور'},{id:5,name:'فواتير الموبايل'},{id:9,name:''}];
 assert.deepEqual(await sync([],[{id:100,account_id:4,at:'2026-11-18T20:00:46',op:9,kind:'vendor',amount:-27100,who:'IBN SINA 1',dealer_id:2495}],C),{ok:true,accounts:0,moves:1,gone:0,cats:2},'an empty category name is skipped');
 assert.deepEqual(await sync([],[],C),{ok:true,accounts:0,moves:0,gone:0,cats:0},'unchanged categories are not rewritten');
 assert.equal(Number((await one(`select dealer_id from public.ar_cash_moves where id=100`)).dealer_id),2495);
 await assert.rejects(()=>one(`select public.ar_cash_sync($1,'[]','[]','[]','[]') r`,['cd'.repeat(32)]),/bad key/);

 // ---- the owner's orders ----
 const as=async(uid,q,p=[])=>{await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false)`);try{return await one(q,p)}finally{await db.exec(`reset role`)}};
 const save=(uid,a)=>as(uid,`select public.ar_pay_order_save($1,$2,$3,$4,$5,$6,$7) r`,[a.id??null,a.kind,a.account,a.party,a.amount,a.memo??null,!!a.approve]).then(x=>x.r);
 const act=(uid,id,action)=>as(uid,`select public.ar_pay_order_act($1,$2) r`,[id,action]).then(x=>x.r);
 const order=(id)=>one(`select status, move_id, who, account_name, amount::float a, skip from public.ar_pay_orders where id=$1`,[id]);
 // nobody but the owner can save, act or read
 await assert.rejects(()=>save(STAFF,{kind:'vendor',account:4,party:2374,amount:100}),/owner only/);
 await assert.rejects(()=>save('',{kind:'vendor',account:4,party:2374,amount:100}),/owner only/);
 // the checks
 assert.deepEqual(await save(OWNER,{kind:'rent',account:4,party:2374,amount:100}),{ok:false,error:'kind'});
 assert.deepEqual(await save(OWNER,{kind:'vendor',account:4,party:2374,amount:0}),{ok:false,error:'amount'});
 assert.deepEqual(await save(OWNER,{kind:'vendor',account:99,party:2374,amount:10}),{ok:false,error:'account'});
 assert.deepEqual(await save(OWNER,{kind:'vendor',account:4,party:1,amount:10}),{ok:false,error:'party'});
 assert.deepEqual(await save(OWNER,{kind:'expense',account:4,party:7,amount:10}),{ok:false,error:'party'},'a category that is not in PharmaFly');
 // a waiting order: saved, edited, then approved
 const w=await save(OWNER,{kind:'vendor',account:4,party:2374,amount:20000,memo:' دفعة تحت الحساب '});
 assert.equal(w.ok,true);assert.equal(w.status,'waiting');
 assert.deepEqual(await save(OWNER,{id:w.id,kind:'vendor',account:3,party:2374,amount:2000}),{ok:true,id:w.id,status:'waiting'});
 assert.deepEqual(await order(w.id),{status:'waiting',move_id:null,who:'A M group',account_name:'محفظه فودافون',a:2000,skip:[]});
 assert.equal((await as(OWNER,`select count(*)::int c from public.ar_pay_orders`)).c,1,'the owner reads the orders');
 assert.equal((await as(STAFF,`select count(*)::int c from public.ar_pay_orders`)).c,0,'a staff member reads none');
 assert.equal((await as(STAFF,`select count(*)::int c from public.ar_cash_cats`)).c,0);
 await assert.rejects(()=>act(STAFF,w.id,'approve'),/owner only/);
 assert.deepEqual(await act(OWNER,w.id,'approve'),{ok:true,id:w.id,status:'approved'});
 assert.deepEqual(await save(OWNER,{id:w.id,kind:'vendor',account:3,party:2374,amount:5}),{ok:false,error:'not_waiting'},'an approved order is not edited');
 assert.deepEqual(await act(OWNER,w.id,'approve'),{ok:false,error:'not_waiting'});
 // the order was made «now»: the move before it (100) is never taken; the move after it with the same box, card and amount closes it
 const t=(min)=>new Date(Date.now()+min*6e4).toLocaleString('sv-SE',{timeZone:'Africa/Cairo',hour12:false}).replace(' ','T'); // the laptop sends PharmaFly's local time (Cairo)
 await sync([],[{id:200,account_id:3,at:t(5),op:9,kind:'vendor',amount:-2000,who:'A M group',dealer_id:2374}]);
 assert.equal((await order(w.id)).status,'matched','closed by itself by the upload');
 assert.equal(Number((await order(w.id)).move_id),200);
 assert.deepEqual(await act(OWNER,w.id,'cancel'),{ok:false,error:'closed'});
 // an expense approved at once, closed by the same category (op 1000 + id), box and amount
 const e=await save(OWNER,{kind:'expense',account:4,party:1,amount:1300,memo:'سارة',approve:true});
 assert.equal(e.status,'approved');
 await sync([],[{id:201,account_id:4,at:t(6),op:1005,kind:'expense',amount:-1300,who:'فواتير الموبايل'}]);
 assert.deepEqual(await order(e.id),{status:'approved',move_id:null,who:'مرتبات و اجور',account_name:'احتياطى',a:1300,skip:[]},'another category (op 1005, not 1001) is neither this order nor a difference: it waits');
 await sync([],[{id:202,account_id:4,at:t(7),op:1001,kind:'expense',amount:-1300,who:'مرتبات و اجور',memo:'سارة'}]);
 assert.equal((await order(e.id)).status,'matched');
 // a difference: the same supplier, another amount → «فيه فرق»; «مش هي» puts it aside and waits; the right one closes it
 const d=await save(OWNER,{kind:'vendor',account:4,party:2495,amount:50000,approve:true});
 await sync([],[{id:203,account_id:4,at:t(8),op:9,kind:'vendor',amount:-5000,who:'IBN SINA 1',dealer_id:2495}]);
 let o=await order(d.id);assert.equal(o.status,'mismatch');assert.equal(Number(o.move_id),203);
 assert.equal((await one(`select move->>'amount' a from public.ar_pay_orders where id=$1`,[d.id])).a,'-5000.00','the screen shows the two side by side');
 // the other card with the same short name is not this supplier
 const d2=await save(OWNER,{kind:'vendor',account:4,party:188,amount:300,approve:true});
 assert.equal((await order(d2.id)).status,'approved','IBN SINA 2 does not take IBN SINA 1\'s move');
 assert.deepEqual(await act(OWNER,d.id,'skip'),{ok:true,id:d.id,status:'approved'});
 assert.deepEqual((await order(d.id)).skip.map(Number),[203]);
 await sync([],[{id:204,account_id:4,at:t(9),op:9,kind:'vendor',amount:-50000,who:'IBN SINA 1',dealer_id:2495}]);
 assert.equal((await order(d.id)).status,'matched');
 // «هي دي»: he entered another amount on purpose → the order closes on that move
 const f=await save(OWNER,{kind:'vendor',account:4,party:2374,amount:10000,approve:true});
 await sync([],[{id:205,account_id:3,at:t(10),op:9,kind:'vendor',amount:-9500,who:'A M group',dealer_id:2374}]);
 assert.equal((await order(f.id)).status,'mismatch','another box and amount');
 assert.deepEqual(await act(OWNER,f.id,'accept'),{ok:true,id:f.id,status:'matched'});
 assert.equal(Number((await order(f.id)).move_id),205);
 // a move closes one order only: two equal orders, one move → one matched, one waiting
 const g1=await save(OWNER,{kind:'expense',account:3,party:5,amount:100,approve:true});
 const g2=await save(OWNER,{kind:'expense',account:3,party:5,amount:100,approve:true});
 await sync([],[{id:206,account_id:3,at:t(11),op:1005,kind:'expense',amount:-100,who:'فواتير الموبايل'}]);
 assert.deepEqual([(await order(g1.id)).status,Number((await order(g1.id)).move_id)],['matched',206],'the older order takes it');
 // the other one points at the only free phone bill since it was made (201: 1,300 from another box) until he says «مش هي»
 assert.deepEqual([(await order(g2.id)).status,Number((await order(g2.id)).move_id)],['mismatch',201]);
 assert.deepEqual(await act(OWNER,g2.id,'skip'),{ok:true,id:g2.id,status:'approved'});
 assert.deepEqual(await act(OWNER,g2.id,'accept'),{ok:false,error:'not_mismatch'});
 assert.deepEqual(await act(OWNER,g2.id,'cancel'),{ok:true,id:g2.id,status:'cancelled'});
 assert.deepEqual(await act(OWNER,g2.id,'fly'),{ok:false,error:'action'});
 // an old move without the card still matches by the supplier's name (rows sent before the laptop's update)
 const h=await save(OWNER,{kind:'vendor',account:4,party:2374,amount:777,approve:true});
 await sync4([],[{id:207,account_id:4,at:t(12),op:9,kind:'vendor',amount:-777,who:'A M group'}]);
 assert.equal((await order(h.id)).status,'matched');
 // already entered in PharmaFly before he approved: approving closes it at once
 const k=await save(OWNER,{kind:'expense',account:4,party:1,amount:4600});
 await sync([],[{id:208,account_id:4,at:t(13),op:1001,kind:'expense',amount:-4600,who:'مرتبات و اجور'}]);
 assert.equal((await order(k.id)).status,'waiting','a waiting order is not matched');
 assert.deepEqual(await act(OWNER,k.id,'approve'),{ok:true,id:k.id,status:'matched'});
 // nothing can write the table directly, not even the owner
 await assert.rejects(()=>as(OWNER,`insert into public.ar_pay_orders (kind,account_id,vendor_id,amount) values ('vendor',4,2374,1)`),/permission denied|row-level security/);
 await assert.rejects(()=>as(OWNER,`select public.ar_pay_match()`),/permission denied/);
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate|delete from public\.ar_pay/i);
 assert.doesNotMatch(sql,/using \(auth\.uid\(\)/,'policies use (select auth.uid())');
 assert.doesNotMatch(sql,/ar_staff_can/,'owner only');
 console.log('PASS: pay orders migration: upload (old and new call), owner-only orders, matching, difference, accept / skip, one move per order');
})().catch((e)=>{console.error(e);process.exit(1)});
