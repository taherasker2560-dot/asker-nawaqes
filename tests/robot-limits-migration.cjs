// Migration 202611220100 (owner 2026-11-22): the customer's limit typed in the system waits for the robot and closes by itself when PharmaFly says it;
// the robot's reports (written by the laptop) are read and answered by the owner only; a bill over the limit keeps the approval of the OWNER only.
// In-memory Postgres, row level security on. Made-up people and ids only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SELL='00000000-0000-4000-8000-0000000000f1',STRANGER='00000000-0000-4000-8000-0000000000f4';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
 GRANT USAGE ON SCHEMA public TO authenticated, anon;
 CREATE TABLE public.ar_customers(id bigint primary key, name text, credit_limit numeric(14,2), balance numeric(14,2) default 0, updated_at timestamptz default now());
 CREATE TABLE public.ar_temp_sales(id uuid primary key, kind text default 'sale', status text default 'pending', customer_id bigint, total numeric, created_by uuid default auth.uid());
 GRANT ALL ON public.ar_temp_sales TO authenticated;
 INSERT INTO public.ar_customers(id,name,credit_limit) VALUES (101,'عميل تجربة',5000),(102,'عميل تاني',3000);`);
 const sql=fs.readFileSync('supabase/migrations/202611220100_ar_robot_limits.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const as=async(uid,q,p=[])=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SET ROLE authenticated;`);try{return (await db.query(q,p)).rows}finally{await db.exec('RESET ROLE')}};
 const denied=(uid,q,p)=>assert.rejects(()=>as(uid,q,p),/row-level security|permission denied/);
 const sys=async(q,p=[])=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','',false);`);return (await db.query(q,p)).rows};   // the laptop (service role: no row rules)

 // ---------- 1) the limit: the owner asks, one waiting per customer, a stranger and a seller cannot ----------
 await as(OWNER,`INSERT INTO public.ar_limit_requests(customer_id,old_limit,new_limit) VALUES (101,5000,8000)`);
 const req=(await as(OWNER,`SELECT customer_id,old_limit::float8 o,new_limit::float8 n,status,requested_by FROM public.ar_limit_requests`))[0];
 assert.deepEqual(req,{customer_id:101,o:5000,n:8000,status:'pending',requested_by:OWNER});
 await assert.rejects(()=>as(OWNER,`INSERT INTO public.ar_limit_requests(customer_id,new_limit) VALUES (101,9000)`),/duplicate key|unique/,'one waiting request per customer');
 await as(OWNER,`UPDATE public.ar_limit_requests SET new_limit=9000 WHERE customer_id=101 AND status='pending'`);   // he changes his mind: the same row
 await denied(SELL,`INSERT INTO public.ar_limit_requests(customer_id,new_limit) VALUES (102,1)`);await denied(STRANGER,`INSERT INTO public.ar_limit_requests(customer_id,new_limit) VALUES (102,1)`);
 assert.equal((await as(STRANGER,`SELECT * FROM public.ar_limit_requests`)).length,0,'a stranger reads none');
 await assert.rejects(()=>as(OWNER,`INSERT INTO public.ar_limit_requests(customer_id,new_limit) VALUES (102,-5)`),/check/);
 // the sync writes PharmaFly's limit: another value leaves it waiting, the same value closes it
 await sys(`UPDATE public.ar_customers SET credit_limit=7000, updated_at=now() WHERE id=101`);
 assert.equal((await sys(`SELECT status FROM public.ar_limit_requests WHERE customer_id=101`))[0].status,'pending');
 await sys(`UPDATE public.ar_customers SET credit_limit=9000, balance=balance WHERE id=101`);
 const done=(await sys(`SELECT status, applied_at IS NOT NULL a FROM public.ar_limit_requests WHERE customer_id=101`))[0];
 assert.deepEqual(done,{status:'applied',a:true},'PharmaFly says 9000: the request is done by itself');
 // a new one can wait again after that
 await as(OWNER,`INSERT INTO public.ar_limit_requests(customer_id,new_limit) VALUES (101,10000)`);
 // a sync that rewrites every column (an upsert) closes it too when the value matches
 await sys(`INSERT INTO public.ar_customers(id,name,credit_limit) VALUES (101,'عميل تجربة',10000) ON CONFLICT (id) DO UPDATE SET credit_limit=excluded.credit_limit, name=excluded.name`);
 assert.equal((await sys(`SELECT count(*)::int n FROM public.ar_limit_requests WHERE customer_id=101 AND status='applied'`))[0].n,2);

 // ---------- 2) the robot's reports ----------
 await sys(`INSERT INTO public.ar_robot_reports(job,ref_id,title,details,options) VALUES ('sales','abc','بيعة 14 متجاوزة الحد','العميل عليه 4,650 + 581 والحد 5,000','[{"key":"yes","label":"كمّل وسجّلها"},{"key":"wait","label":"خليها مستنية"}]')`);
 const rid=(await as(OWNER,`SELECT id,status FROM public.ar_robot_reports`))[0];assert.equal(rid.status,'open');
 assert.equal((await as(STRANGER,`SELECT * FROM public.ar_robot_reports`)).length,0);assert.equal((await as(SELL,`SELECT * FROM public.ar_robot_reports`)).length,0,'staff read none');
 await denied(OWNER,`INSERT INTO public.ar_robot_reports(title) VALUES ('من الصفحة')`);   // only the laptop writes reports
 await denied(OWNER,`UPDATE public.ar_robot_reports SET status='done' WHERE id=${rid.id}`);
 const ans=async(uid,k,t)=>(await as(uid,`SELECT public.ar_robot_answer($1,$2,$3) r`,[rid.id,k,t]))[0].r;
 assert.deepEqual(await ans(STRANGER,'yes',null),{ok:false,error:'owner-only'});
 assert.deepEqual(await ans(SELL,'yes',null),{ok:false,error:'owner-only'});
 assert.deepEqual(await ans(OWNER,'',' '),{ok:false,error:'empty'});
 assert.deepEqual(await ans(OWNER,'cash',null),{ok:false,error:'option'},'only an answer the robot understands');
 assert.deepEqual(await ans(OWNER,'yes','بس المرة دي'),{ok:true});
 const a=(await sys(`SELECT status,answer_key,answer_text,answered_by FROM public.ar_robot_reports WHERE id=${rid.id}`))[0];
 assert.deepEqual(a,{status:'answered',answer_key:'yes',answer_text:'بس المرة دي',answered_by:OWNER});
 assert.deepEqual(await ans(OWNER,'wait',null),{ok:false,error:'state'},'answered once');
 // his own words alone are an answer too
 await sys(`INSERT INTO public.ar_robot_reports(title) VALUES ('صنف مش لاقيه')`);
 const r2=(await as(OWNER,`SELECT id FROM public.ar_robot_reports WHERE status='open'`))[0].id;
 assert.deepEqual((await as(OWNER,`SELECT public.ar_robot_answer($1,null,$2) r`,[r2,'سيبها']))[0].r,{ok:true});
 // anon cannot run it
 await assert.rejects(()=>db.exec(`RESET ROLE; SET ROLE anon; SELECT public.ar_robot_answer(1,'yes',null)`).finally(()=>db.exec('RESET ROLE')),/permission denied/);

 // ---------- 3) the approval of a bill over the limit ----------
 const ID=['00000000-0000-4000-8000-00000000aa01','00000000-0000-4000-8000-00000000aa02','00000000-0000-4000-8000-00000000aa03'];
 await as(OWNER,`INSERT INTO public.ar_temp_sales(id,customer_id,total,limit_ok_at,limit_over) VALUES ('${ID[0]}',101,581,now(),231)`);
 assert.deepEqual((await sys(`SELECT limit_ok_by, limit_over::float8 o FROM public.ar_temp_sales WHERE id='${ID[0]}'`))[0],{limit_ok_by:OWNER,o:231},'his approval, signed by the server');
 // a seller cannot approve (nor sign it as the owner)
 await as(SELL,`INSERT INTO public.ar_temp_sales(id,customer_id,total,limit_ok_at,limit_ok_by,limit_over) VALUES ('${ID[1]}',101,581,now(),'${OWNER}',231)`);
 assert.deepEqual((await sys(`SELECT limit_ok_by,limit_ok_at,limit_over FROM public.ar_temp_sales WHERE id='${ID[1]}'`))[0],{limit_ok_by:null,limit_ok_at:null,limit_over:null});
 // the laptop marks the owner's bill entered: the approval stays
 await sys(`UPDATE public.ar_temp_sales SET status='entered' WHERE id='${ID[0]}'`);
 assert.equal((await sys(`SELECT limit_ok_by FROM public.ar_temp_sales WHERE id='${ID[0]}'`))[0].limit_ok_by,OWNER);
 // a page resend of the same bill (an upsert by the owner) keeps it; a bill with no approval stays without one
 await as(OWNER,`INSERT INTO public.ar_temp_sales(id,customer_id,total,limit_ok_at,limit_over) VALUES ('${ID[0]}',101,581,now(),231) ON CONFLICT (id) DO UPDATE SET total=excluded.total, limit_ok_at=excluded.limit_ok_at, limit_over=excluded.limit_over`);
 assert.equal((await sys(`SELECT limit_ok_by FROM public.ar_temp_sales WHERE id='${ID[0]}'`))[0].limit_ok_by,OWNER);
 await as(OWNER,`INSERT INTO public.ar_temp_sales(id,customer_id,total) VALUES ('${ID[2]}',102,100)`);
 assert.equal((await sys(`SELECT limit_ok_by FROM public.ar_temp_sales WHERE id='${ID[2]}'`))[0].limit_ok_by,null);
 console.log('PASS: robot-limits migration: the limit request waits and closes by itself, the reports are the owner\'s to answer, only the owner approves a bill over the limit');
})().catch((e)=>{console.error(e);process.exit(1)});
