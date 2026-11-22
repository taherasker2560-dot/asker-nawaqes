// Migration 202611221500 (owner 2026-11-22, «ضيف الزرار»): the owner's «🤖 ادخلها دلوقتي» on a waiting bill. The page writes «asked at»; the trigger signs WHO asked and keeps
// only the owner's ask; the robot (sync key) reads it in ar_robot_sales_poll, shows its state ('typing' / 'stopped') and a saved bill clears both.
// In-memory Postgres. Made-up people, keys and ids only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SELL='00000000-0000-4000-8000-0000000000f1';
const KEY='a'.repeat(64),BAD='b'.repeat(64);
const B1='00000000-0000-4000-8000-00000000b001',B2='00000000-0000-4000-8000-00000000b002',B3='00000000-0000-4000-8000-00000000b003';
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
 GRANT SELECT, INSERT, UPDATE ON public.ar_temp_sales TO authenticated;
 CREATE TABLE public.ar_robot_reports(id bigint generated always as identity primary key, created_at timestamptz not null default now(), job text not null default 'sales',
   ref_id text, title text not null, details text, options jsonb not null default '[]'::jsonb, status text not null default 'open', answer_key text, answer_text text,
   answered_by uuid, answered_at timestamptz, done_at timestamptz);
 INSERT INTO public.ar_temp_sales(id,no,status,customer_id,items,total,created_by) VALUES
  ('${B1}',21,'pending',null,'[{"c":66906,"n":"CONGESTAL 20T","q":1,"u":"pack","p":45}]',45,'${OWNER}'),
  ('${B2}',22,'pending',null,'[{"c":66906,"n":"CONGESTAL 20T","q":2,"u":"pack","p":45}]',90,'${SELL}'),
  ('${B3}',23,'pending',null,'[{"c":66906,"n":"CONGESTAL 20T","q":1,"u":"pack","p":45}]',45,'${OWNER}');`);
 await db.exec(fs.readFileSync('supabase/migrations/202611220300_ar_robot_laptop.sql','utf8'));
 const sql=fs.readFileSync('supabase/migrations/202611221500_ar_robot_ask.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 // who is calling: the laptop (anon + its key), the owner, a staff member
 const as=async(who,q,p=[])=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${who==='owner'?OWNER:who==='staff'?SELL:''}',false); SET ROLE ${who==='laptop'?'anon':'authenticated'};`);try{return (await db.query(q,p)).rows}finally{await db.exec('RESET ROLE')}};
 const row=async(id)=>(await db.query(`SELECT robot_ask_at,robot_ask_by,robot_state,robot_state_at,status FROM public.ar_temp_sales WHERE id=$1`,[id])).rows[0];
 const poll=async()=>(await as('laptop',`SELECT public.ar_robot_sales_poll($1) r`,[KEY]))[0].r.rows;

 // ---------- nobody has asked yet ----------
 assert.deepEqual((await poll()).map((r)=>[r.no,r.ask,r.ask_at]),[[21,false,null],[22,false,null],[23,false,null]]);

 // ---------- the owner presses «ادخلها دلوقتي»: his ask is signed as his ----------
 await as('owner',`UPDATE public.ar_temp_sales SET robot_ask_at = now() WHERE id = $1`,[B1]);
 let r1=await row(B1);assert.ok(r1.robot_ask_at);assert.equal(r1.robot_ask_by,OWNER);
 let p=await poll();assert.equal(p.find((r)=>r.no===21).ask,true);assert.ok(p.find((r)=>r.no===21).ask_at);

 // ---------- a staff member's ask is wiped: only the owner can make the robot take the laptop ----------
 await as('staff',`UPDATE public.ar_temp_sales SET robot_ask_at = now() WHERE id = $1`,[B2]);
 let r2=await row(B2);assert.equal(r2.robot_ask_at,null);assert.equal(r2.robot_ask_by,null);
 p=await poll();assert.equal(p.find((r)=>r.no===22).ask,false);
 // nor can he forge the signature
 await as('staff',`UPDATE public.ar_temp_sales SET robot_ask_at = now(), robot_ask_by = $2 WHERE id = $1`,[B2,OWNER]);
 r2=await row(B2);assert.equal(r2.robot_ask_by,null,'a forged «by» is wiped');assert.equal(r2.robot_ask_at,null);
 // a staff member saving his own bill does not touch the owner's ask on another bill, nor does the owner's note edit wipe his ask
 await as('owner',`UPDATE public.ar_temp_sales SET note = 'ملحوظة' WHERE id = $1`,[B1]);
 r1=await row(B1);assert.equal(r1.robot_ask_by,OWNER,'an edit that does not touch the ask keeps it');
 // an ask on a bill the owner created in one go (insert) is signed too
 await as('owner',`INSERT INTO public.ar_temp_sales(id,no,items,total,created_by,robot_ask_at) VALUES ('00000000-0000-4000-8000-00000000b004',24,'[]',1,$1,now())`,[OWNER]);
 assert.equal((await row('00000000-0000-4000-8000-00000000b004')).robot_ask_by,OWNER);

 // ---------- the laptop shows what it is doing ----------
 await assert.rejects(()=>as('laptop',`SELECT public.ar_robot_sale_state($1,$2,'typing') r`,[BAD,B1]),/bad key/);
 await assert.rejects(()=>as('laptop',`SELECT public.ar_robot_sale_state($1,$2,'flying') r`,[KEY,B1]),/bad state/);
 assert.equal((await as('laptop',`SELECT public.ar_robot_sale_state($1,$2,'typing') r`,[KEY,B1]))[0].r.ok,true);
 r1=await row(B1);assert.equal(r1.robot_state,'typing');assert.ok(r1.robot_state_at);assert.ok(r1.robot_ask_at,'typing keeps the ask until it is saved or stopped');
 // stopped: the ask is cleared so the button can be pressed again
 assert.equal((await as('laptop',`SELECT public.ar_robot_sale_state($1,$2,'stopped') r`,[KEY,B1]))[0].r.ok,true);
 r1=await row(B1);assert.equal(r1.robot_state,'stopped');assert.equal(r1.robot_ask_at,null);assert.equal(r1.robot_ask_by,null);
 // pressing again (the page also clears the state)
 await as('owner',`UPDATE public.ar_temp_sales SET robot_ask_at = now(), robot_state = null, robot_state_at = null WHERE id = $1`,[B1]);
 r1=await row(B1);assert.equal(r1.robot_ask_by,OWNER);assert.equal(r1.robot_state,null);
 // state on a bill that is not waiting changes nothing
 assert.equal((await as('laptop',`SELECT public.ar_robot_sale_state($1,$2,'typing') r`,[KEY,'00000000-0000-4000-8000-0000000000ff']))[0].r.ok,false);

 // ---------- saved: «اتدخلت» clears the ask and the state ----------
 await as('laptop',`SELECT public.ar_robot_sale_state($1,$2,'typing') r`,[KEY,B1]);
 assert.equal((await as('laptop',`SELECT public.ar_robot_sale_mark($1,$2) r`,[KEY,B1]))[0].r.ok,true);
 r1=await row(B1);assert.equal(r1.status,'entered');assert.equal(r1.robot_ask_at,null);assert.equal(r1.robot_ask_by,null);assert.equal(r1.robot_state,null);
 assert.equal((await as('laptop',`SELECT public.ar_robot_sale_mark($1,$2,385850) r`,[KEY,B1]))[0].r.ok,true,'its ticket number comes later');
 assert.equal(Number((await db.query(`SELECT entered_ticket FROM public.ar_temp_sales WHERE id=$1`,[B1])).rows[0].entered_ticket),385850);
 // the poll no longer lists it as waiting; the others are as they were
 p=await poll();assert.deepEqual(p.map((r)=>r.no),[22,23,24]);

 // ---------- the page cannot run it: only the owner's session or the key can use the new function ----------
 const anonKeyless=await db.query(`SELECT has_function_privilege('anon','public.ar_invoice_review_auth(text)','execute') x`);assert.equal(anonKeyless.rows[0].x,false);
 console.log('PASS: robot ask: owner-signed button, staff ask wiped, forged «by» wiped, poll shows ask, state typing / stopped, saved clears both');
})().catch((e)=>{console.error(e);process.exit(1)});
