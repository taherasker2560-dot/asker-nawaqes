// Migration 202611230100 (owner 2026-11-22/23, «ا، الدفعات»): a customer's payment waits in ar_temp_sales as kind 'payment' (a customer, paid > 0, total 0, one
// «أصناف متنوعة» line), as he records it in PharmaFly. On an in-memory Postgres, on top of the table's own migrations. Made-up rows only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ select null::uuid $$;`);
 for (const f of ['202611122330_ar_temp_sales.sql','202611130030_ar_temp_sales_kind.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(`alter table public.ar_temp_sales add column if not exists adjust numeric(12,2)`);
 const mig=fs.readFileSync('supabase/migrations/202611230100_ar_temp_sales_payment.sql','utf8');
 await db.exec(mig);await db.exec(mig); // applied twice: safe
 const MISC=JSON.stringify([{c:1,n:'أصناف متنوعة',q:1,u:'pack',p:0}]);
 const add=(id,kind,cust,total,paid,items)=>db.query(`INSERT INTO public.ar_temp_sales(id,sold_at,kind,customer_id,items,total,paid) VALUES ($1,now(),$2,$3,$4,$5,$6)`,[id,kind,cust,items||MISC,total,paid]);
 const id=(n)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 // a payment: a customer, the amount, total 0
 await add(id(1),'payment',2177,0,500);
 const r=(await db.query(`SELECT kind, customer_id, total, paid, status FROM public.ar_temp_sales WHERE id=$1`,[id(1)])).rows[0];
 assert.deepEqual([r.kind,Number(r.customer_id),Number(r.total),Number(r.paid),r.status],['payment',2177,0,500,'pending']);
 // a payment needs its customer and an amount, and carries no bill total
 await assert.rejects(()=>add(id(2),'payment',null,0,500),/check/,'no customer');
 await assert.rejects(()=>add(id(3),'payment',2177,0,0),/check/,'no amount');
 await assert.rejects(()=>add(id(4),'payment',2177,0,null),/check/,'no amount');
 await assert.rejects(()=>add(id(5),'payment',2177,50,500),/check/,'a payment is not a bill');
 // sales and returns as before; any other kind refused
 await add(id(6),'sale',null,10,null,JSON.stringify([{c:1060,n:'ITEM ONE',q:1,u:'pack',p:10}]));
 await add(id(7),'return',2177,10,null,JSON.stringify([{c:1060,n:'ITEM ONE',q:1,u:'pack',p:10}]));
 await assert.rejects(()=>add(id(8),'gift',null,0,null),/check/);
 console.log('temp-sales-payment-migration ok');
})().catch((e)=>{console.error(e);process.exit(1)});
