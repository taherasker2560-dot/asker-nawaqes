// The supplier companies' numbers (owner 2026-11-20): migration 202611201700 on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// Up to three numbers per company (telesales, distributor, accountant): OWNER ONLY, anon has nothing; one number per role per company; the checks on the role and the number. Made-up numbers only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611201700_ar_vendor_contacts.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',STAFF='11111111-1111-1111-1111-111111111111';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;`);
 const as=async(uid,role,q,p=[])=>{await db.exec(`set role ${role}; select set_config('test.uid','${uid}',false)`);try{return (await db.query(q,p)).rows}finally{await db.exec(`reset role`)}};
 const owner=(q,p)=>as(OWNER,'authenticated',q,p);

 // the owner: one number per role per company, changed by an upsert, removed by a delete
 await owner(`insert into public.ar_vendor_contacts(vendor_id,role,phone,name) values (2278,'telesales','01011112222','تليسيلز مثال'),(2278,'distributor','01122223333','موزع مثال'),(2278,'accountant','01233334444','محاسب مثال'),(2272,'accountant','447710173736',null)`);
 assert.deepEqual(await owner(`select vendor_id::int v,role,phone,name from public.ar_vendor_contacts order by vendor_id,role`),[
  {v:2272,role:'accountant',phone:'447710173736',name:null},
  {v:2278,role:'accountant',phone:'01233334444',name:'محاسب مثال'},{v:2278,role:'distributor',phone:'01122223333',name:'موزع مثال'},{v:2278,role:'telesales',phone:'01011112222',name:'تليسيلز مثال'}]);
 await owner(`insert into public.ar_vendor_contacts(vendor_id,role,phone,name) values (2278,'telesales','01099998888','تليسيلز جديد') on conflict (vendor_id,role) do update set phone=excluded.phone,name=excluded.name,updated_at=now()`);
 assert.equal((await owner(`select phone from public.ar_vendor_contacts where vendor_id=2278 and role='telesales'`))[0].phone,'01099998888','the same role again replaces the number');
 assert.equal((await owner(`select count(*)::int c from public.ar_vendor_contacts where vendor_id=2278`))[0].c,3,'still three');
 await owner(`delete from public.ar_vendor_contacts where vendor_id=2278 and role='distributor'`);
 assert.equal((await owner(`select count(*)::int c from public.ar_vendor_contacts where vendor_id=2278`))[0].c,2);

 // the checks
 for(const [q,why] of [
  [`insert into public.ar_vendor_contacts(vendor_id,role,phone) values (1,'rep','01011112222')`,'an unknown role'],
  [`insert into public.ar_vendor_contacts(vendor_id,role,phone) values (1,'telesales','123')`,'a number under 8 digits'],
  [`insert into public.ar_vendor_contacts(vendor_id,role,phone) values (1,'telesales','0101111222233334')`,'a number over 15 digits'],
  [`insert into public.ar_vendor_contacts(vendor_id,role,phone) values (1,'telesales','0101111222a')`,'letters in a number'],
  [`insert into public.ar_vendor_contacts(vendor_id,role,phone,name) values (1,'telesales','01011112222','${'ن'.repeat(121)}')`,'a name over 120 characters'],
  [`insert into public.ar_vendor_contacts(vendor_id,role,phone) values (2278,'telesales','01011112222')`,'the same role twice for one company'],
  [`insert into public.ar_vendor_contacts(role,phone) values ('telesales','01011112222')`,'no company']])
  await assert.rejects(()=>owner(q),/violates|duplicate|null value/,why);

 // nobody else: a staff member and a stranger read nothing and write nothing; anon has no access at all
 assert.deepEqual(await as(STAFF,'authenticated',`select * from public.ar_vendor_contacts`),[],'a staff member sees nothing');
 assert.deepEqual(await as('','authenticated',`select * from public.ar_vendor_contacts`),[],'a signed-in stranger sees nothing');
 await assert.rejects(()=>as(STAFF,'authenticated',`insert into public.ar_vendor_contacts(vendor_id,role,phone) values (5,'telesales','01011112222')`),/row-level security/);
 assert.equal((await as(STAFF,'authenticated',`update public.ar_vendor_contacts set phone='01000000000' returning vendor_id`)).length,0,'staff change nothing');
 assert.equal((await as(STAFF,'authenticated',`delete from public.ar_vendor_contacts returning vendor_id`)).length,0,'staff remove nothing');
 await assert.rejects(()=>as('','anon',`select * from public.ar_vendor_contacts`),/permission denied/);
 await assert.rejects(()=>as('','anon',`insert into public.ar_vendor_contacts(vendor_id,role,phone) values (6,'telesales','01011112222')`),/permission denied/);
 assert.equal((await owner(`select count(*)::int c from public.ar_vendor_contacts`))[0].c,3,'nothing changed by the others');
 console.log('vendor-contacts-migration ok');
})().catch((e)=>{console.error(e);process.exit(1)});
