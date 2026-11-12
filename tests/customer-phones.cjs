// Migration 202611121200: customers' WhatsApp numbers (owner only) and the private bucket for statement PDFs.
// Runs the migration on an in-memory Postgres (a stand-in storage schema). Made-up numbers only: the repository is public.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ select null::uuid $$;
 CREATE SCHEMA IF NOT EXISTS storage;
 CREATE TABLE storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
 CREATE TABLE storage.objects(bucket_id text, name text, created_at timestamptz default now());
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
 const sql=fs.readFileSync('supabase/migrations/202611121200_ar_customer_phones_statements.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 // a number: digits only, 8 to 15
 await db.query(`INSERT INTO public.ar_customer_phones(customer_id,phone,contact_name) VALUES (9001,'201012345678','عميل تجربة')`);
 await assert.rejects(()=>db.query(`INSERT INTO public.ar_customer_phones(customer_id,phone) VALUES (9002,'01012-345')`),/check/);
 await assert.rejects(()=>db.query(`INSERT INTO public.ar_customer_phones(customer_id,phone) VALUES (9003,'123')`),/check/);
 // the same number may serve two accounts (a family), one number per customer
 await db.query(`INSERT INTO public.ar_customer_phones(customer_id,phone) VALUES (9004,'201012345678')`);
 await assert.rejects(()=>db.query(`INSERT INTO public.ar_customer_phones(customer_id,phone) VALUES (9001,'201099999999')`),/duplicate|unique/);
 // owner only: row level security on, one policy for the owner (read and write)
 const pol=(await db.query(`SELECT cmd,qual,with_check FROM pg_policies WHERE tablename='ar_customer_phones'`)).rows;
 assert.equal(pol.length,1);assert.equal(pol[0].cmd,'ALL');assert.match(pol[0].qual,/ff6c33dc/);assert.match(pol[0].with_check,/ff6c33dc/);
 assert.ok((await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname='ar_customer_phones'`)).rows[0].relrowsecurity);
 // the PDFs' bucket: private, PDFs only, 10 MB
 assert.deepEqual((await db.query(`SELECT id,public,file_size_limit::int AS lim,allowed_mime_types FROM storage.buckets`)).rows,[{id:'ar-statements',public:false,lim:10485760,allowed_mime_types:['application/pdf']}]);
 // the owner uploads only under s/<year>-<month>/<random>.pdf, reads and deletes there; nobody else
 const sp=(await db.query(`SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='storage' ORDER BY policyname`)).rows;
 assert.deepEqual(sp.map(p=>p.policyname+':'+p.cmd),['Owner deletes statements:DELETE','Owner reads statements:SELECT','Owner uploads statements:INSERT']);
 sp.forEach(p=>assert.match((p.qual||'')+(p.with_check||''),/ar-statements[\s\S]*ff6c33dc/));
 const re=new RegExp(/\^s\/\[0-9\]\{4\}-\[0-9\]\{2\}\/\[0-9a-f-\]\{20,40\}\\\.pdf\$/.source);
 assert.match(sp.find(p=>p.cmd==='INSERT').with_check,re);
 // 202611121500: several numbers for one customer (up to 5); the saved ones stay
 const many=fs.readFileSync('supabase/migrations/202611121500_ar_customer_phones_many.sql','utf8');
 await db.exec(`DELETE FROM public.ar_customer_phones; INSERT INTO public.ar_customer_phones(customer_id,phone) VALUES (9001,'201012345678')`);
 await db.exec(many);await db.exec(many); // applied twice: safe
 assert.equal((await db.query(`SELECT count(*)::int n FROM public.ar_customer_phones`)).rows[0].n,1,'the saved number stays');
 for(const p of ['201000000002','201000000003','201000000004','201000000005'])await db.query(`INSERT INTO public.ar_customer_phones(customer_id,phone) VALUES (9001,$1)`,[p]);
 await assert.rejects(()=>db.query(`INSERT INTO public.ar_customer_phones(customer_id,phone) VALUES (9001,'201000000006')`),/max 5/);
 await assert.rejects(()=>db.query(`INSERT INTO public.ar_customer_phones(customer_id,phone) VALUES (9001,'201000000002')`),/duplicate|unique/,'the same number twice');
 // saving a known number again (its name) still works at 5
 await db.query(`INSERT INTO public.ar_customer_phones(customer_id,phone,contact_name) VALUES (9001,'201000000002','جار') ON CONFLICT (customer_id,phone) DO UPDATE SET contact_name=excluded.contact_name`);
 assert.equal((await db.query(`SELECT contact_name FROM public.ar_customer_phones WHERE phone='201000000002'`)).rows[0].contact_name,'جار');
 // another customer can have the same number (a family)
 await db.query(`INSERT INTO public.ar_customer_phones(customer_id,phone) VALUES (9002,'201012345678')`);
 console.log('customer-phones ok');
})().catch(e=>{console.error(e);process.exit(1)});
