// Migration 202611130200: the pharmacy's staff and what the server lets each one do. Runs on an in-memory Postgres as the
// role «authenticated» with row level security on, the signed-in person set by test.uid. Made-up people and data only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SELL='00000000-0000-4000-8000-0000000000a1',EXP='00000000-0000-4000-8000-0000000000a2',OFF='00000000-0000-4000-8000-0000000000a3';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
 CREATE SCHEMA IF NOT EXISTS storage; CREATE TABLE storage.objects(bucket_id text, name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE TABLE public.ar_stock(item_id bigint primary key, name text); ALTER TABLE public.ar_stock ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "Owner reads ar stock" ON public.ar_stock FOR SELECT TO authenticated USING (auth.uid() = '${OWNER}'::uuid);
 CREATE TABLE public.ar_shortages(id text primary key, product_name text); ALTER TABLE public.ar_shortages ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "Owner ar shortages" ON public.ar_shortages FOR ALL TO authenticated USING (auth.uid() = '${OWNER}'::uuid) WITH CHECK (auth.uid() = '${OWNER}'::uuid);
 CREATE TABLE public.ar_customers(id bigint primary key, name text, balance numeric); ALTER TABLE public.ar_customers ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "Owner reads ar customers" ON public.ar_customers FOR SELECT TO authenticated USING (auth.uid() = '${OWNER}'::uuid);
 CREATE TABLE public.ar_sync_log(at timestamptz default now(), status text); ALTER TABLE public.ar_sync_log ENABLE ROW LEVEL SECURITY;
 CREATE TABLE public.ar_inbox_keys(key_hash text); ALTER TABLE public.ar_inbox_keys ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "Owner ar inbox keys" ON public.ar_inbox_keys FOR ALL TO authenticated USING (auth.uid() = '${OWNER}'::uuid);`);
 for(const f of ['202611122330_ar_temp_sales.sql','202611130030_ar_temp_sales_kind.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 const sql=fs.readFileSync('supabase/migrations/202611130200_ar_staff.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, storage TO authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
 INSERT INTO public.ar_stock VALUES (1,'ITEM'); INSERT INTO public.ar_shortages VALUES ('s1','ITEM'); INSERT INTO public.ar_customers VALUES (5,'عميل تجربة',100);
 INSERT INTO public.ar_inbox_keys VALUES ('k'); INSERT INTO public.ar_sync_log(status) VALUES ('ok');
 INSERT INTO storage.objects VALUES ('asker-private','alerts/alerts.json'),('asker-private','alerts/expiry.json'),('asker-private','orders/drafts.json'),('asker-private','catalog.json');
 INSERT INTO public.ar_staff(user_id,name,email,perms) VALUES ('${SELL}','بائع تجربة','a1@staff.test','{tempsale}'),('${EXP}','صلاحيات تجربة','a2@staff.test','{expiry,stock,short}'),('${OFF}','موقوف','a3@staff.test','{tempsale,stock}');
 UPDATE public.ar_staff SET active=false WHERE user_id='${OFF}';`);
 // as one person (role authenticated, row level security on)
 const as=async(uid,q,params)=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SET ROLE authenticated;`);try{return (await db.query(q,params)).rows}finally{await db.exec('RESET ROLE')}};
 const n=async(uid,t)=>(await as(uid,`SELECT count(*)::int AS n FROM ${t}`))[0].n;
 // the owner: everything as before
 assert.equal(await n(OWNER,'public.ar_stock'),1);assert.equal(await n(OWNER,'public.ar_customers'),1);assert.equal(await n(OWNER,'public.ar_staff'),3);
 // a seller (tempsale only): the stock for selling, nothing of the shortages, the customers, the keys or the other staff
 assert.equal(await n(SELL,'public.ar_stock'),1);assert.equal(await n(SELL,'public.ar_shortages'),0);assert.equal(await n(SELL,'public.ar_customers'),0,'no «credit»: no customers');
 assert.equal(await n(SELL,'public.ar_inbox_keys'),0);assert.deepEqual((await as(SELL,`SELECT name FROM public.ar_staff`)).map(r=>r.name),['بائع تجربة'],'only his own row');
 assert.equal(await n(SELL,'public.ar_sync_log'),1,'the data-age strip');
 // his sale: added as his own, a return refused without «return», a credit customer refused without «credit»
 const sale=(id,kind,cust)=>as(SELL,`INSERT INTO public.ar_temp_sales(id,sold_at,items,total,kind,customer_id) VALUES ($1,now(),'[{"c":1,"n":"ITEM","q":1,"u":"pack","p":5}]',5,$2,$3)`,[id,kind,cust]);
 await sale('00000000-0000-4000-8000-000000000101','sale',null);
 await assert.rejects(()=>sale('00000000-0000-4000-8000-000000000102','return',null),/row-level security/);
 await assert.rejects(()=>sale('00000000-0000-4000-8000-000000000103','sale',5),/row-level security/);
 assert.equal((await as(OWNER,`SELECT created_by FROM public.ar_temp_sales`))[0].created_by,SELL,'the owner sees who sold it');
 // he cannot mark it entered (status stays pending for staff) nor see others' sales
 await as(OWNER,`INSERT INTO public.ar_temp_sales(id,sold_at,items,total) VALUES ('00000000-0000-4000-8000-000000000201',now(),'[{"c":1}]',1)`);
 assert.equal(await n(SELL,'public.ar_temp_sales'),1,'his own only');
 await assert.rejects(()=>as(SELL,`UPDATE public.ar_temp_sales SET status='entered' WHERE id='00000000-0000-4000-8000-000000000101'`),/row-level security/);
 // the same sale sent again (upsert) still works for him
 await as(SELL,`INSERT INTO public.ar_temp_sales(id,sold_at,items,total) VALUES ('00000000-0000-4000-8000-000000000101',now(),'[{"c":1,"n":"ITEM","q":2,"u":"pack","p":5}]',10) ON CONFLICT (id) DO UPDATE SET items=excluded.items,total=excluded.total`);
 // with «return» and «credit» opened, both go
 await db.exec(`UPDATE public.ar_staff SET perms='{tempsale,return,credit}' WHERE user_id='${SELL}'`);
 await sale('00000000-0000-4000-8000-000000000104','return',5);
 assert.equal(await n(SELL,'public.ar_customers'),1,'«credit» reads the customers');
 // the expiry person: the expiry file without the customers, the stock, the shortages (and may edit them: «short»)
 assert.deepEqual((await as(EXP,`SELECT name FROM storage.objects WHERE bucket_id='asker-private' ORDER BY name`)).map(r=>r.name),['alerts/expiry.json']);
 assert.equal(await n(EXP,'public.ar_stock'),1);await as(EXP,`UPDATE public.ar_shortages SET product_name='ITEM 2' WHERE id='s1'`);
 assert.equal((await as(OWNER,`SELECT product_name FROM public.ar_shortages`))[0].product_name,'ITEM 2');
 assert.equal(await n(EXP,'public.ar_temp_sales'),0);
 // stopped (active = false): nothing at all
 for(const t of ['public.ar_stock','public.ar_sync_log','public.ar_temp_sales'])assert.equal(await n(OFF,t),0,t);
 // what the staff did, under their names (written by the database); the owner's own work is not logged; staff cannot read it
 const acts=await as(OWNER,`SELECT user_id,tbl,op,info FROM public.ar_activity ORDER BY id`);
 assert.deepEqual(acts.map(a=>[a.user_id,a.tbl,a.op]),[[SELL,'ar_temp_sales','insert'],[SELL,'ar_temp_sales','update'],[SELL,'ar_temp_sales','insert'],[EXP,'ar_shortages','update']]);
 assert.equal(acts[0].info.n,1);assert.equal(acts[2].info.kind,'return');assert.equal(acts[3].info.name,'ITEM 2');
 assert.equal(await n(SELL,'public.ar_activity'),0,'staff never read the log');
 // the owner reads every private file as before
 assert.equal((await as(OWNER,`SELECT count(*)::int n FROM storage.objects`))[0].n,0,'the owner\'s own storage policies are not part of this test');
 console.log('PASS: staff: each one only the sections opened for him (server side), own sales only, return/credit by switch, stopped = nothing');
})().catch(e=>{console.error(e);process.exit(1)});
