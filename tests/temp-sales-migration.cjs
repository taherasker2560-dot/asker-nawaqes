// Migration 202611122330: «البيع المؤقت» (owner only). Runs on an in-memory Postgres. Made-up sales only: the repository is public.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ select null::uuid $$;`);
 const sql=fs.readFileSync('supabase/migrations/202611122330_ar_temp_sales.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const add=(id,items,extra='')=>db.query(`INSERT INTO public.ar_temp_sales(id,sold_at,items,total${extra?','+extra.split('=')[0]:''}) VALUES ($1,now(),$2,10${extra?','+extra.split('=')[1]:''})`,[id,JSON.stringify(items)]);
 const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
 await add(A,[{c:1060,n:'ITEM ONE',q:1,u:'pack',p:10}]);
 await add(B,[{c:4875,n:'ITEM TWO',q:2,u:'unit',p:5}]);
 // the number shown grows by itself; the phone's id keeps a sale once
 const rows=(await db.query(`SELECT id,no,status FROM public.ar_temp_sales ORDER BY no`)).rows;
 assert.deepEqual(rows.map(r=>[r.id,Number(r.no),r.status]),[[A,1,'pending'],[B,2,'pending']]);
 await assert.rejects(()=>add(A,[{c:1,n:'X',q:1,u:'pack',p:1}]),/duplicate|unique/);
 // the same sale sent again (upsert by id) keeps its number
 await db.query(`INSERT INTO public.ar_temp_sales(id,sold_at,items,total) VALUES ($1,now(),'[{"c":1060,"n":"ITEM ONE","q":3,"u":"pack","p":10}]',30) ON CONFLICT (id) DO UPDATE SET items=excluded.items,total=excluded.total`,[A]);
 assert.equal(Number((await db.query(`SELECT no FROM public.ar_temp_sales WHERE id=$1`,[A])).rows[0].no),1);
 // the number cannot be set from outside
 await assert.rejects(()=>db.query(`INSERT INTO public.ar_temp_sales(id,no,sold_at,items) VALUES ('00000000-0000-4000-8000-000000000009',99,now(),'[{"c":1}]')`),/generated|cannot insert/i);
 // items: a list of 1 to 60; no empty sale
 await assert.rejects(()=>add('00000000-0000-4000-8000-000000000003',[]),/check/);
 await assert.rejects(()=>db.query(`INSERT INTO public.ar_temp_sales(id,sold_at,items) VALUES ('00000000-0000-4000-8000-000000000004',now(),'{"c":1}')`),/check/);
 // status only pending / entered / cancelled; money never negative
 await assert.rejects(()=>db.query(`UPDATE public.ar_temp_sales SET status='done' WHERE id=$1`,[A]),/check/);
 await db.query(`UPDATE public.ar_temp_sales SET status='entered',entered_ticket=384301,entered_at=now() WHERE id=$1`,[A]);
 await assert.rejects(()=>db.query(`UPDATE public.ar_temp_sales SET paid=-1 WHERE id=$1`,[B]),/check/);
 await assert.rejects(()=>db.query(`UPDATE public.ar_temp_sales SET total=-5 WHERE id=$1`,[B]),/check/);
 // owner only: row level security on, one policy for the owner (read and write)
 const pol=(await db.query(`SELECT cmd,qual,with_check FROM pg_policies WHERE tablename='ar_temp_sales'`)).rows;
 assert.equal(pol.length,1);assert.equal(pol[0].cmd,'ALL');assert.match(pol[0].qual,/ff6c33dc/);assert.match(pol[0].with_check,/ff6c33dc/);
 assert.ok((await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname='ar_temp_sales'`)).rows[0].relrowsecurity);
 console.log('PASS: temp sales table: phone id keeps a sale once, number by itself, items 1-60, status/money checks, owner only');
})().catch(e=>{console.error(e);process.exit(1)});
