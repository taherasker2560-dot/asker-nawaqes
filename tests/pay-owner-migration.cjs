// «الدفع لصاحب المنشأة» (owner 2026-11-19: «انت ازاى ما حسبتش الدفع لصاحب المنشاه … عمر الخزن ما هتظبط معاك من غيرها»):
// migration 202611190400 on top of the cash and the payments ones. The laptop's op 51 comes in as kind 'owner'; a payment order to the
// owner (a box, an amount, a note; no supplier, no category) closes on op 51 with the same box and amount; another amount = a difference;
// the suppliers and the expenses keep working.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir=path.join(__dirname,'..','supabase','migrations');
const read=(f)=>fs.readFileSync(path.join(dir,f),'utf8');
const sql=read('202611190400_ar_pay_owner.sql');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',STAFF='11111111-1111-1111-1111-111111111111';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);
 CREATE TABLE public.ar_vendors(id bigint PRIMARY KEY, name text not null, short text, balance numeric(14,2) not null default 0);`);
 await db.exec(read('202611151900_ar_cash.sql'));await db.exec(read('202611190300_ar_pay_orders.sql'));
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated; GRANT SELECT ON public.ar_pay_orders, public.ar_cash_moves TO authenticated;`);
 const KEY='ab'.repeat(32);
 await db.query(`insert into public.ar_sync_keys values ($1,null)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 await db.exec(`insert into public.ar_vendors values (2374,'A M group','AMG',124144.88)`);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const sync=(a,m,c=[])=>one(`select public.ar_cash_sync($1,$2::jsonb,$3::jsonb,'[]'::jsonb,$4::jsonb) r`,[KEY,JSON.stringify(a),JSON.stringify(m),JSON.stringify(c)]).then(x=>x.r);
 const sync4=(a,m)=>one(`select public.ar_cash_sync(p_key=>$1,p_accounts=>$2::jsonb,p_moves=>$3::jsonb,p_gone=>'[]'::jsonb) r`,[KEY,JSON.stringify(a),JSON.stringify(m)]).then(x=>x.r);
 assert.deepEqual(await sync([{id:4,name:'احتياطى',type:1,balance:45040},{id:11,name:'محفظه انستاباى جارى',type:0,balance:1563.65}],[],[{id:1,name:'مرتبات و اجور'}]),{ok:true,accounts:2,moves:0,gone:0,cats:1});
 const t=(min)=>new Date(Date.now()+min*6e4).toLocaleString('sv-SE',{timeZone:'Africa/Cairo',hour12:false}).replace(' ','T');
 // the laptop's op 51 is the kind 'owner' now (an old 'other_out' row of op 51 is rewritten when it comes again)
 assert.deepEqual(await sync4([],[{id:1,account_id:4,at:t(-600),op:51,kind:'other_out',amount:-100000,memo:'طاهر'}]),{ok:true,accounts:0,moves:1,gone:0,cats:0});
 assert.deepEqual(await sync([],[{id:1,account_id:4,at:t(-600),op:51,kind:'owner',amount:-100000,memo:'طاهر'}]),{ok:true,accounts:0,moves:1,gone:0,cats:0});
 assert.equal((await one(`select kind from public.ar_cash_moves where id=1`)).kind,'owner');
 // a payment order to the owner: the box, the amount, a note; nobody else can make one
 const as=async(uid,q,p=[])=>{await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false)`);try{return await one(q,p)}finally{await db.exec(`reset role`)}};
 const save=(uid,a)=>as(uid,`select public.ar_pay_order_save($1,$2,$3,$4,$5,$6,$7) r`,[a.id??null,a.kind,a.account,a.party??null,a.amount,a.memo??null,!!a.approve]).then(x=>x.r);
 const act=(uid,id,action)=>as(uid,`select public.ar_pay_order_act($1,$2) r`,[id,action]).then(x=>x.r);
 const order=(id)=>one(`select status, move_id, who, vendor_id, cat_id, memo from public.ar_pay_orders where id=$1`,[id]);
 await assert.rejects(()=>save(STAFF,{kind:'owner',account:4,amount:500}),/owner only/);
 const o=await save(OWNER,{kind:'owner',account:4,amount:20000,memo:'طاهر',approve:true});
 assert.equal(o.status,'approved');
 assert.deepEqual(await order(o.id),{status:'approved',move_id:null,who:'صاحب المنشأة',vendor_id:null,cat_id:null,memo:'طاهر'},'no supplier, no category');
 // the old op 51 before the order is not taken; a supplier payment of the same amount is not taken either
 await sync([],[{id:2,account_id:4,at:t(2),op:9,kind:'vendor',amount:-20000,who:'A M group',dealer_id:2374}]);
 assert.equal((await order(o.id)).status,'approved');
 await sync([],[{id:3,account_id:4,at:t(3),op:51,kind:'owner',amount:-20000,memo:'طاهر'}]);
 assert.deepEqual([(await order(o.id)).status,Number((await order(o.id)).move_id)],['matched',3]);
 // another amount from another box = a difference; «هي دي» closes it
 const d=await save(OWNER,{kind:'owner',account:4,amount:5000,memo:'ام طاهر',approve:true});
 await sync([],[{id:4,account_id:11,at:t(4),op:51,kind:'owner',amount:-4800,memo:'ام طاهر'}]);
 assert.deepEqual([(await order(d.id)).status,Number((await order(d.id)).move_id)],['mismatch',4]);
 assert.deepEqual(await act(OWNER,d.id,'accept'),{ok:true,id:d.id,status:'matched'});
 // a waiting one saved without a party, edited, approved; the suppliers and the expenses still work
 const w=await save(OWNER,{kind:'owner',account:11,amount:300});
 assert.equal(w.status,'waiting');
 assert.deepEqual(await save(OWNER,{id:w.id,kind:'owner',account:11,amount:350,memo:'تامر'}),{ok:true,id:w.id,status:'waiting'});
 const v=await save(OWNER,{kind:'vendor',account:4,party:2374,amount:777,approve:true});
 const e=await save(OWNER,{kind:'expense',account:4,party:1,amount:88,approve:true});
 await sync([],[{id:5,account_id:4,at:t(5),op:9,kind:'vendor',amount:-777,who:'A M group',dealer_id:2374},{id:6,account_id:4,at:t(5),op:1001,kind:'expense',amount:-88,who:'مرتبات و اجور'}]);
 assert.deepEqual([(await order(v.id)).status,(await order(e.id)).status],['matched','matched']);
 assert.deepEqual(await save(OWNER,{kind:'vendor',account:4,amount:10}),{ok:false,error:'party'},'a supplier order still needs its supplier');
 assert.deepEqual(await save(OWNER,{kind:'boss',account:4,amount:10}),{ok:false,error:'kind'});
 // the table checks: an owner order cannot carry a supplier; an unknown kind of move is refused by the table
 await assert.rejects(()=>db.query(`insert into public.ar_pay_orders (kind,account_id,vendor_id,amount) values ('owner',4,2374,1)`),/check/);
 await assert.rejects(()=>db.query(`insert into public.ar_cash_moves (id,account_id,at,kind) values (99,4,now(),'boss')`),/check/);
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate/i);
 console.log('PASS: owner payments: op 51 = owner, an order to the owner closes on op 51, difference / accept, suppliers and expenses unchanged');
})().catch((e)=>{console.error(e);process.exit(1)});
