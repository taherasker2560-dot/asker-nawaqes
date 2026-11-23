// The number book of the waiting-list form (owner 2026-11-20): migration 202611201300 on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// His phone's contacts as a book: OWNER ONLY (nobody else reads, searches or writes it), anon has nothing; the checks on the number, the name and the kind.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611201300_ar_contacts_book.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',STAFF='11111111-1111-1111-1111-111111111111';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;`);
 const as=async(uid,role,q,p=[])=>{await db.exec(`set role ${role}; select set_config('test.uid','${uid}',false)`);try{return (await db.query(q,p)).rows}finally{await db.exec(`reset role`)}};
 const owner=(q,p)=>as(OWNER,'authenticated',q,p);

 // the owner: add, read, change, remove
 await owner(`insert into public.ar_contacts(phone,name,kind,last_item) values ('01001234567','عميل ١٢١','cash','Entresto'),('01050009007','احمد الفرماوى','account',null),('447710173736','خارجي','other',null)`);
 await owner(`insert into public.ar_contacts(phone,name,source) values ('01099998888','عميل جديد','typed')`);
 assert.deepEqual((await owner(`select phone,name,kind,last_item,source from public.ar_contacts order by phone`)),[
  {phone:'01001234567',name:'عميل ١٢١',kind:'cash',last_item:'Entresto',source:'google'},
  {phone:'01050009007',name:'احمد الفرماوى',kind:'account',last_item:null,source:'google'},
  {phone:'01099998888',name:'عميل جديد',kind:'other',last_item:null,source:'typed'},
  {phone:'447710173736',name:'خارجي',kind:'other',last_item:null,source:'google'}],'the default kind is «other», the default source «google»');
 await owner(`update public.ar_contacts set name='عميل ١٢١ (محمد)' where phone='01001234567'`);
 assert.equal((await owner(`select name from public.ar_contacts where phone='01001234567'`))[0].name,'عميل ١٢١ (محمد)');
 // the form saves a new number without touching one the book already has
 await owner(`insert into public.ar_contacts(phone,name,source) values ('01001234567','اسم تاني','typed') on conflict (phone) do nothing`);
 assert.equal((await owner(`select name from public.ar_contacts where phone='01001234567'`))[0].name,'عميل ١٢١ (محمد)','a number that is there keeps its name');
 await owner(`delete from public.ar_contacts where phone='447710173736'`);
 assert.equal((await owner(`select count(*)::int c from public.ar_contacts`))[0].c,3);

 // the checks
 for(const [q,why] of [
  [`insert into public.ar_contacts(phone,name) values ('123','x')`,'a number under 8 digits'],
  [`insert into public.ar_contacts(phone,name) values ('0100123456789012','x')`,'a number over 15 digits'],
  [`insert into public.ar_contacts(phone,name) values ('01000000000a','x')`,'letters in a number'],
  [`insert into public.ar_contacts(phone,name) values ('01000000001','')`,'an empty name'],
  [`insert into public.ar_contacts(phone,name) values ('01000000002','${'ن'.repeat(121)}')`,'a name over 120 characters'],
  [`insert into public.ar_contacts(phone,name,kind) values ('01000000003','x','vip')`,'an unknown kind'],
  [`insert into public.ar_contacts(phone,name,source) values ('01000000004','x','other')`,'an unknown source'],
  [`insert into public.ar_contacts(phone,name) values ('01001234567','duplicate')`,'the same number twice']])
  await assert.rejects(()=>owner(q),/violates|duplicate/,why);

 // nobody else: a staff member and a stranger read nothing and write nothing; anon has no access to the table at all
 assert.deepEqual(await as(STAFF,'authenticated',`select * from public.ar_contacts`),[],'a staff member sees nothing');
 assert.deepEqual(await as('','authenticated',`select * from public.ar_contacts`),[],'a signed-in stranger sees nothing');
 await assert.rejects(()=>as(STAFF,'authenticated',`insert into public.ar_contacts(phone,name) values ('01000000005','x')`),/row-level security/);
 assert.equal((await as(STAFF,'authenticated',`update public.ar_contacts set name='x' returning phone`)).length,0,'staff changes nothing');
 assert.equal((await as(STAFF,'authenticated',`delete from public.ar_contacts returning phone`)).length,0,'staff removes nothing');
 await assert.rejects(()=>as('','anon',`select * from public.ar_contacts`),/permission denied/);
 await assert.rejects(()=>as('','anon',`insert into public.ar_contacts(phone,name) values ('01000000006','x')`),/permission denied/);
 assert.equal((await owner(`select count(*)::int c from public.ar_contacts`))[0].c,3,'nothing changed by the others');
 console.log('contacts-book-migration ok');
})().catch((e)=>{console.error(e);process.exit(1)});
