// The phone app's server side (owner 2026-11-20, option «أ»): migration 202611201900 on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// A phone has its own key (only the hash is stored); with it the app asks what waits to be written into the phone, tells back, and sends the phone's contacts in chunks that count only when the sync is complete.
// The tables are the owner's alone. Made-up people and numbers only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const mig=(f)=>fs.readFileSync(path.join(__dirname,'..','supabase','migrations',f),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',STAFF='11111111-1111-1111-1111-111111111111';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
 await db.exec(mig('202611201300_ar_contacts_book.sql'));
 const sql=mig('202611201900_ar_phone_contacts.sql');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;`);
 const as=async(uid,role,q,p=[])=>{await db.exec(`set role ${role}; select set_config('test.uid','${uid}',false)`);try{return (await db.query(q,p)).rows}finally{await db.exec(`reset role`)}};
 const owner=(q,p)=>as(OWNER,'authenticated',q,p);
 const anon=(q,p)=>as('','anon',q,p);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const link=async()=>(await owner(`select public.ar_phone_link() k`))[0].k;

 // the owner links a phone: a 64-hex key, shown once; only its hash stays; nobody else can
 const K=await link();assert.match(K,/^[0-9a-f]{64}$/);assert.notEqual(await link(),K,'every link is a new key');
 const stored=(await one(`select key_hash from public.ar_phone_keys order by created_at limit 1`)).key_hash;
 assert.match(stored,/^[0-9a-f]{64}$/);assert.notEqual(stored,K,'the key itself is not stored');
 for(const uid of [STAFF,''])await assert.rejects(()=>as(uid,'authenticated',`select public.ar_phone_link()`),/owner only/);
 await assert.rejects(()=>anon(`select public.ar_phone_link()`),/permission denied/);

 // a wrong key does nothing, for every function
 for(const bad of [null,'','abc','AB'.repeat(32),'zz'.repeat(32),'cd'.repeat(32)]){
  await assert.rejects(()=>anon(`select public.ar_phone_pending($1)`,[bad]),/bad key/);
  await assert.rejects(()=>anon(`select public.ar_phone_ack($1,'{01012345678}')`,[bad]),/bad key/);
  await assert.rejects(()=>anon(`select public.ar_phone_push_rows($1,1,'[]')`,[bad]),/bad key/);
  await assert.rejects(()=>anon(`select public.ar_phone_finish($1,1,1)`,[bad]),/bad key/);
 }
 assert.equal((await one(`select count(*)::int c from public.ar_phone_syncs`)).c,0,'nothing was written by a wrong key');

 // system → phone: only the numbers typed in the system and not yet written, 50 at a time, oldest first
 await owner(`insert into public.ar_contacts(phone,name,kind,source) values ('01000000001','من جوجل','other','google')`);
 assert.deepEqual((await anon(`select public.ar_phone_pending($1) r`,[K]))[0].r,[],'a google number is already on the phone');
 await owner(`insert into public.ar_contacts(phone,name,source,updated_at) values ('01000000002','عميل ١٢٦','typed','2026-11-20 10:00'),('01000000003','سيد','typed','2026-11-20 09:00')`);
 assert.deepEqual((await anon(`select public.ar_phone_pending($1) r`,[K]))[0].r,[{phone:'01000000003',name:'سيد'},{phone:'01000000002',name:'عميل ١٢٦'}],'oldest first');
 assert.equal((await owner(`select (public.ar_phone_status()->>'pending')::int n`))[0].n,2);
 assert.equal((await anon(`select public.ar_phone_ack($1,'{01000000003,01000000001,99}') r`,[K]))[0].r,1,'only a typed number that was waiting counts');
 assert.deepEqual((await anon(`select public.ar_phone_pending($1) r`,[K]))[0].r,[{phone:'01000000002',name:'عميل ١٢٦'}]);
 assert.equal((await anon(`select public.ar_phone_ack($1,'{01000000003}') r`,[K]))[0].r,0,'told twice: nothing');
 assert.equal((await anon(`select public.ar_phone_ack($1,'{}') r`,[K]))[0].r,0);
 assert.equal((await anon(`select public.ar_phone_ack($1,(select array_agg('0100000'||lpad(g::text,4,'0')) from generate_series(1,201) g)) r`,[K]))[0].r,0,'more than 200 at once: refused quietly');
 await owner(`insert into public.ar_contacts(phone,name,source,updated_at) select '0155'||lpad(g::text,7,'0'),'n'||g,'typed',now()+g*interval '1 second' from generate_series(1,60) g`);
 assert.equal((await anon(`select jsonb_array_length(public.ar_phone_pending($1)) n`,[K]))[0].n,50,'50 at a time');
 assert.equal((await owner(`select (public.ar_phone_status()->>'pending')::int n`))[0].n,61);

 // phone → system: chunks, a partial sync counts for nothing, a complete one replaces the older contacts
 const S1=1000;
 assert.equal((await anon(`select public.ar_phone_push_rows($1,$2,$3::jsonb) r`,[K,S1,JSON.stringify([{id:1,name:'احمد',phones:['0100 111 2222','+20 101 000 0000']},{id:2,name:'سيد',phones:[]}])]))[0].r,2);
 assert.equal((await anon(`select public.ar_phone_push_rows($1,$2,$3::jsonb) r`,[K,S1,JSON.stringify([{id:3,name:'مها',phones:['0122 333']}])]))[0].r,1,'the second chunk of the same sync');
 assert.deepEqual((await anon(`select public.ar_phone_finish($1,$2,5) r`,[K,S1]))[0].r,{ok:false,got:3},'the count does not match: not complete');
 assert.equal((await one(`select done from public.ar_phone_syncs where sync_id=1000`)).done,false);
 assert.deepEqual((await anon(`select public.ar_phone_finish($1,$2,3) r`,[K,S1]))[0].r,{ok:true,n:3});
 assert.deepEqual((await owner(`select contact_id::int id,name,phones from public.ar_phone_contacts order by contact_id`)),[{id:1,name:'احمد',phones:['0100 111 2222','+20 101 000 0000']},{id:2,name:'سيد',phones:[]},{id:3,name:'مها',phones:['0122 333']}]);
 // the next sync: a contact gone from the phone leaves the staging table when the new sync is complete (not before)
 const S2=2000;
 await anon(`select public.ar_phone_push_rows($1,$2,$3::jsonb)`,[K,S2,JSON.stringify([{id:1,name:'احمد الكبير',phones:['0100 111 2222']},{id:4,name:'جديد',phones:['0111 444']}])]);
 assert.equal((await one(`select count(*)::int c from public.ar_phone_contacts`)).c,4,'before it is complete the old ones stay');
 assert.deepEqual((await anon(`select public.ar_phone_finish($1,$2,2) r`,[K,S2]))[0].r,{ok:true,n:2});
 assert.deepEqual((await owner(`select contact_id::int id,name from public.ar_phone_contacts order by contact_id`)),[{id:1,name:'احمد الكبير'},{id:4,name:'جديد'}],'contact 1 follows the phone; 2 and 3 are gone; 4 is new');
 // the checks: too many, not an array, bad ids, long names and numbers
 await assert.rejects(()=>anon(`select public.ar_phone_push_rows($1,$2,$3::jsonb)`,[K,3000,JSON.stringify({a:1})]),/bad rows/);
 await assert.rejects(()=>anon(`select public.ar_phone_push_rows($1,$2,$3::jsonb)`,[K,3000,JSON.stringify(Array.from({length:501},(_,i)=>({id:i+1,name:'x',phones:['1']})))]),/bad rows/);
 await assert.rejects(()=>anon(`select public.ar_phone_push_rows($1,0,'[]'::jsonb)`,[K]),/bad rows/);
 assert.equal((await anon(`select public.ar_phone_push_rows($1,$2,$3::jsonb) r`,[K,3000,JSON.stringify([{id:'abc',name:'x',phones:['1']},{id:9,name:'ن'.repeat(300),phones:Array.from({length:30},()=>'1'.repeat(60))},{id:10,name:'x',phones:'not an array'}])]))[0].r,2,'a bad id is skipped');
 const big=await one(`select char_length(name)::int nl, cardinality(phones)::int pc, char_length(phones[1])::int p1 from public.ar_phone_contacts where contact_id=9`);
 assert.deepEqual(big,{nl:200,pc:20,p1:40});
 assert.equal((await one(`select cardinality(phones)::int c from public.ar_phone_contacts where contact_id=10`)).c,0);
 assert.deepEqual((await anon(`select public.ar_phone_finish($1,$2,2) r`,[K,3000]))[0].r,{ok:true,n:2});
 assert.deepEqual((await anon(`select public.ar_phone_finish($1,$2,0) r`,[K,9999]))[0].r,{ok:false,got:0},'nothing to finish');

 // the owner's status: pending numbers, the last complete sync (not merged yet), the phones and when each talked
 const st=(await owner(`select public.ar_phone_status() s`))[0].s;
 assert.equal(st.pending,61);assert.equal(st.last_sync.n,2);assert.equal(st.last_sync.merged_at,null);
 assert.equal(st.phones.length,2);assert.ok(st.phones.some(p=>p.last_used_at),'the phone that talked has a last time');
 await db.exec(`update public.ar_phone_syncs set merged_at = now() where sync_id = 3000`);
 assert.ok((await owner(`select public.ar_phone_status() s`))[0].s.last_sync.merged_at,'the laptop marked it merged');
 for(const uid of [STAFF,''])await assert.rejects(()=>as(uid,'authenticated',`select public.ar_phone_status()`),/owner only/);
 await assert.rejects(()=>anon(`select public.ar_phone_status()`),/permission denied/);

 // nobody else reads the tables; anon has no access to them nor to the owner's functions
 for(const t of ['ar_phone_keys','ar_phone_contacts','ar_phone_syncs']){
  assert.deepEqual(await as(STAFF,'authenticated',`select * from public.${t}`),[],'staff see nothing in '+t);
  assert.deepEqual(await as('','authenticated',`select * from public.${t}`),[],'a stranger sees nothing in '+t);
  await assert.rejects(()=>anon(`select * from public.${t}`),/permission denied/);
  assert.equal((await as(STAFF,'authenticated',`update public.${t} set name=name returning 1`).catch(()=>[])).length,0);
 }
 const can=async(role,fn)=>(await one(`SELECT has_function_privilege('${role}','${fn}','execute') AS ok`)).ok;
 for(const fn of ['public.ar_phone_pending(text)','public.ar_phone_ack(text,text[])','public.ar_phone_push_rows(text,bigint,jsonb)','public.ar_phone_finish(text,bigint,int)'])assert.equal(await can('anon',fn),true,'the app (anon + its key) calls '+fn);
 for(const fn of ['public.ar_phone_link()','public.ar_phone_status()','public.ar_phone_key_ok(text)'])assert.equal(await can('anon',fn),false,'anon cannot '+fn);
 assert.equal(await can('authenticated','public.ar_phone_key_ok(text)'),false,'nobody calls the key check directly');
 // only the newest 3 keys stay valid: after three more links the first phone's key stops working
 for(let i=0;i<3;i++)await link();
 assert.equal((await one(`select count(*)::int c from public.ar_phone_keys`)).c,3);
 await assert.rejects(()=>anon(`select public.ar_phone_pending($1)`,[K]),/bad key/,'the oldest key is gone');
 console.log('phone-contacts-migration ok');
})().catch((e)=>{console.error(e);process.exit(1)});
