// The operations chosen on an item from the search card (owner 2026-11-20): migration 202611202100 on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// A barcode print waits here as «pending» (1 to 500 labels) until the laptop carries it out; OWNER ONLY, anon has nothing. Made-up items only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611202100_ar_item_ops.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',STAFF='11111111-1111-1111-1111-111111111111';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;`);
 const as=async(uid,role,q,p=[])=>{await db.exec(`set role ${role}; select set_config('test.uid','${uid}',false)`);try{return (await db.query(q,p)).rows}finally{await db.exec(`reset role`)}};
 const owner=(q,p)=>as(OWNER,'authenticated',q,p);

 // the owner records a barcode print: pending by default, one label by default
 await owner(`insert into public.ar_item_ops(kind,item_id,item_name,qty) values ('barcode',7,'CATAFLAM 50MG 20 TAB',10)`);
 await owner(`insert into public.ar_item_ops(kind,item_id) values ('barcode',8)`);
 assert.deepEqual(await owner(`select kind,item_id::int i,item_name,qty,status from public.ar_item_ops order by id`),[{kind:'barcode',i:7,item_name:'CATAFLAM 50MG 20 TAB',qty:10,status:'pending'},{kind:'barcode',i:8,item_name:null,qty:1,status:'pending'}]);
 // a pending one is cancelled by an update; the laptop's later states are allowed
 assert.equal((await owner(`update public.ar_item_ops set status='cancelled',updated_at=now() where id=1 and status='pending' returning id`)).length,1);
 assert.equal((await owner(`update public.ar_item_ops set status='cancelled' where id=1 and status='pending' returning id`)).length,0,'a cancelled one is not pending any more');
 for(const s of ['running','done','failed'])await owner(`update public.ar_item_ops set status='${s}' where id=2`);
 // the checks
 for(const [q,why] of [
  [`insert into public.ar_item_ops(kind,item_id) values ('count',1)`,'a kind that is not built yet'],
  [`insert into public.ar_item_ops(kind,item_id,qty) values ('barcode',1,0)`,'no labels'],
  [`insert into public.ar_item_ops(kind,item_id,qty) values ('barcode',1,501)`,'more than 500 labels'],
  [`insert into public.ar_item_ops(kind,item_id) values ('barcode',null)`,'no item'],
  [`insert into public.ar_item_ops(kind,item_id,item_name) values ('barcode',1,'${'x'.repeat(201)}')`,'a name over 200 characters'],
  [`insert into public.ar_item_ops(kind,item_id,status) values ('barcode',1,'maybe')`,'an unknown status']])
  await assert.rejects(()=>owner(q),/violates|null value/,why);
 // nobody else
 assert.deepEqual(await as(STAFF,'authenticated',`select * from public.ar_item_ops`),[],'staff see nothing');
 assert.deepEqual(await as('','authenticated',`select * from public.ar_item_ops`),[],'a stranger sees nothing');
 await assert.rejects(()=>as(STAFF,'authenticated',`insert into public.ar_item_ops(kind,item_id) values ('barcode',9)`),/row-level security/);
 assert.equal((await as(STAFF,'authenticated',`update public.ar_item_ops set status='cancelled' returning id`)).length,0);
 assert.equal((await as(STAFF,'authenticated',`delete from public.ar_item_ops returning id`)).length,0);
 await assert.rejects(()=>as('','anon',`select * from public.ar_item_ops`),/permission denied/);
 await assert.rejects(()=>as('','anon',`insert into public.ar_item_ops(kind,item_id) values ('barcode',9)`),/permission denied/);
 assert.equal((await owner(`select count(*)::int c from public.ar_item_ops`))[0].c,2,'nothing changed by the others');
 console.log('item-ops-migration ok');
})().catch((e)=>{console.error(e);process.exit(1)});
