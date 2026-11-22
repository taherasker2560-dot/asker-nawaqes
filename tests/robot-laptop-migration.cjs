// Migration 202611220300 (owner 2026-11-22): the laptop's sales robot reads the waiting bills with its sync key, marks the one it saved in PharmaFly
// «اتدخلت» (then its ticket number), and asks the owner in «🤖 الروبوت محتاج رأيك». A wrong key does nothing; nothing here changes a bill's items or money.
// In-memory Postgres. Made-up people, keys and ids only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SELL='00000000-0000-4000-8000-0000000000f1';
const KEY='a'.repeat(64),BAD='b'.repeat(64);
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
 GRANT USAGE ON SCHEMA public TO authenticated, anon;
 CREATE TABLE public.ar_sync_keys(key_hash text primary key, last_used_at timestamptz);
 INSERT INTO public.ar_sync_keys(key_hash) VALUES ('${crypto.createHash('sha256').update(KEY).digest('hex')}');
 CREATE OR REPLACE FUNCTION public.ar_invoice_review_auth(p_key text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
 DECLARE v_hash text; BEGIN
   IF p_key IS NULL OR p_key !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'bad key' USING errcode = '28000'; END IF;
   v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
   UPDATE public.ar_sync_keys SET last_used_at = now() WHERE key_hash = v_hash;
   IF NOT FOUND THEN RAISE EXCEPTION 'bad key' USING errcode = '28000'; END IF;
 END $f$;
 REVOKE ALL ON FUNCTION public.ar_invoice_review_auth(text) FROM public, anon, authenticated;
 CREATE TABLE public.ar_customers(id bigint primary key, name text, credit_limit numeric(14,2), balance numeric(14,2) default 0);
 CREATE TABLE public.ar_temp_sales(id uuid primary key, no bigint, sold_at timestamptz default now(), kind text default 'sale', status text default 'pending',
   customer_id bigint, customer_name text, items jsonb, total numeric, paid numeric, adjust numeric, note text, entered_ticket bigint, entered_at timestamptz,
   created_by uuid, updated_at timestamptz, limit_ok_by uuid, limit_ok_at timestamptz, limit_over numeric);
 CREATE TABLE public.ar_robot_reports(id bigint generated always as identity primary key, created_at timestamptz not null default now(), job text not null default 'sales',
   ref_id text, title text not null, details text, options jsonb not null default '[]'::jsonb, status text not null default 'open', answer_key text, answer_text text,
   answered_by uuid, answered_at timestamptz, done_at timestamptz);
 INSERT INTO public.ar_customers VALUES (1945,'عميل تجربة',1000000,21600.43);
 INSERT INTO public.ar_temp_sales(id,no,status,customer_id,items,total,created_by,limit_ok_by,limit_ok_at,limit_over) VALUES
  ('00000000-0000-4000-8000-00000000b001',13,'pending',null,'[{"c":66906,"n":"CONGESTAL 20T","q":1,"u":"pack","p":45}]',45,'${OWNER}',null,null,null),
  ('00000000-0000-4000-8000-00000000b002',14,'pending',1945,'[{"c":66906,"n":"CONGESTAL 20T","q":2,"u":"pack","p":45}]',90,'${SELL}','${SELL}',now(),10),
  ('00000000-0000-4000-8000-00000000b003',15,'cancelled',null,'[{"c":1,"n":"x","q":1,"u":"pack","p":1}]',1,'${OWNER}',null,null,null),
  ('00000000-0000-4000-8000-00000000b004',16,'pending',1945,'[{"c":66906,"n":"CONGESTAL 20T","q":1,"u":"pack","p":45}]',45,'${OWNER}','${OWNER}',now(),45);`);
 const sql=fs.readFileSync('supabase/migrations/202611220300_ar_robot_laptop.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 // the laptop calls as anon with its key (like every laptop function)
 const call=async(q,p=[])=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','',false); SET ROLE anon;`);try{return (await db.query(q,p)).rows[0].r}finally{await db.exec('RESET ROLE')}};

 // ---------- a wrong key or no key: refused, nothing read or changed ----------
 await assert.rejects(()=>call(`SELECT public.ar_robot_sales_poll($1) r`,[BAD]),/bad key/);
 await assert.rejects(()=>call(`SELECT public.ar_robot_sales_poll($1) r`,['x']),/bad key/);
 await assert.rejects(()=>call(`SELECT public.ar_robot_sale_mark($1,$2) r`,[BAD,'00000000-0000-4000-8000-00000000b001']),/bad key/);
 await assert.rejects(()=>call(`SELECT public.ar_robot_report_add($1,'sales','x','t') r`,[BAD]),/bad key/);
 await assert.rejects(()=>call(`SELECT public.ar_robot_sales_poll($1,'everything') r`,[KEY]),/bad what/);

 // ---------- 1) the waiting bills, with the customer and whose approval ----------
 const p=await call(`SELECT public.ar_robot_sales_poll($1) r`,[KEY]);
 assert.equal(p.ok,true);
 assert.deepEqual(p.rows.map((r)=>r.no),[13,14,16],'waiting only, in number order');
 const b14=p.rows.find((r)=>r.no===14),b16=p.rows.find((r)=>r.no===16),b13=p.rows.find((r)=>r.no===13);
 assert.equal(b13.by_owner,true);assert.equal(b14.by_owner,false);
 assert.equal(b14.limit_ok,false,'a seller\'s «approval» is not his');
 assert.equal(b16.limit_ok,true);assert.equal(Number(b16.limit_over),45);
 assert.equal(Number(b16.credit_limit),1000000);assert.equal(Number(b16.balance),21600.43);
 assert.equal(b13.items[0].c,66906);
 const one=await call(`SELECT public.ar_robot_sales_poll($1,'no',15) r`,[KEY]);
 assert.deepEqual(one.rows.map((r)=>[r.no,r.status]),[[15,'cancelled']],'one bill by its number, any state');

 // ---------- 2) marking: waiting -> entered, then the ticket; nothing else ----------
 const mark=(id,t)=>call(`SELECT public.ar_robot_sale_mark($1,$2,$3) r`,[KEY,id,t]);
 assert.deepEqual(await mark('00000000-0000-4000-8000-00000000b001',null),{ok:true});
 let r=(await db.query(`SELECT status,entered_ticket,entered_at IS NOT NULL e FROM public.ar_temp_sales WHERE no=13`)).rows[0];
 assert.deepEqual(r,{status:'entered',entered_ticket:null,e:true});
 const un=await call(`SELECT public.ar_robot_sales_poll($1,'unticketed') r`,[KEY]);
 assert.deepEqual(un.rows.map((x)=>x.no),[13],'entered with no ticket yet');
 assert.deepEqual(await mark('00000000-0000-4000-8000-00000000b001',385900),{ok:true});
 r=(await db.query(`SELECT status,entered_ticket FROM public.ar_temp_sales WHERE no=13`)).rows[0];
 assert.deepEqual({...r,entered_ticket:Number(r.entered_ticket)},{status:'entered',entered_ticket:385900});
 assert.deepEqual(await mark('00000000-0000-4000-8000-00000000b001',385999),{ok:false},'a ticket is never replaced');
 assert.deepEqual(await mark('00000000-0000-4000-8000-00000000b003',null),{ok:false},'a cancelled bill stays cancelled');
 await assert.rejects(()=>mark('00000000-0000-4000-8000-00000000b002',-1),/bad ticket/);
 assert.equal((await call(`SELECT public.ar_robot_sales_poll($1,'unticketed') r`,[KEY])).rows.length,0);

 // ---------- 3) the robot's question: one per stop, his answer, done ----------
 const opts='[{"key":"yes","label":"كمّل وسجّلها"},{"key":"wait","label":"خليها مستنية"}]';
 const a1=await call(`SELECT public.ar_robot_report_add($1,'sales','b002','بيعة 14 متجاوزة الحد','العميل عليه 21,600 + 90',$2::jsonb) r`,[KEY,opts]);
 assert.equal(a1.created,true);
 const a2=await call(`SELECT public.ar_robot_report_add($1,'sales','b002','بيعة 14 متجاوزة الحد (تاني)',null,$2::jsonb) r`,[KEY,opts]);
 assert.deepEqual([a2.created,a2.id],[false,a1.id],'the same stop again: the same question, no second ring');
 assert.equal((await db.query(`SELECT count(*)::int n FROM public.ar_robot_reports`)).rows[0].n,1);
 // the owner answers (as in the page: ar_robot_answer of 202611220100); here written directly
 await db.exec(`UPDATE public.ar_robot_reports SET status='answered', answer_key='yes', answered_by='${OWNER}', answered_at=now() WHERE id=${a1.id}`);
 const pl=await call(`SELECT public.ar_robot_report_poll($1) r`,[KEY]);
 assert.deepEqual(pl.rows.map((x)=>[x.id,x.status,x.answer_key]),[[a1.id,'answered','yes']]);
 assert.deepEqual(await call(`SELECT public.ar_robot_report_done($1,$2) r`,[KEY,a1.id]),{ok:true});
 assert.deepEqual(await call(`SELECT public.ar_robot_report_done($1,$2) r`,[KEY,a1.id]),{ok:false},'done once');
 assert.equal((await call(`SELECT public.ar_robot_report_poll($1) r`,[KEY])).rows.length,0,'nothing left to do');
 assert.equal((await call(`SELECT public.ar_robot_report_poll($1,$2::bigint[]) r`,[KEY,`{${a1.id}}`])).rows[0].status,'done','asked by its number: still readable');
 // a new stop on the same bill after the old one is done: a new question
 assert.equal((await call(`SELECT public.ar_robot_report_add($1,'sales','b002','تاني') r`,[KEY])).created,true);
 console.log('PASS: robot-laptop migration: the laptop reads the waiting bills with its key, marks entered then the ticket, asks once per stop');
})().catch((e)=>{console.error(e);process.exit(1)});
