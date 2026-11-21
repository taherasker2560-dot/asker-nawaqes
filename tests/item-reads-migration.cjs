// The active ingredient by photo (owner 2026-11-21): migration 202611210300 on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// Who asks and reads (the owner and «storeorders» staff), what they can and cannot write, the laptop's two calls (the key, the oldest waiting request, a stuck one goes back, the answer
// empties the photo, only a request being read can be answered, old finished rows go), and that a stranger and anon see nothing. Made-up ids and a tiny fake photo only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611210300_ar_item_reads.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SHOP='22222222-2222-2222-2222-222222222222',OTHER='33333333-3333-3333-3333-333333333333';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_staff(user_id uuid PRIMARY KEY, perms text[], active boolean);
 CREATE FUNCTION public.ar_staff_can(p text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active and s.perms && p) $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);
 INSERT INTO public.ar_staff VALUES ('${SHOP}', array['storeorders'], true), ('${OTHER}', array['count'], true);`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;`);
 const KEY='ab'.repeat(32);
 await db.query(`insert into public.ar_sync_keys values ($1,null)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 const as=async(uid,role,q,p=[])=>{await db.exec(`set role ${role}; select set_config('test.uid','${uid}',false)`);try{return (await db.query(q,p)).rows}finally{await db.exec(`reset role`)}};
 const owner=(q,p)=>as(OWNER,'authenticated',q,p), shop=(q,p)=>as(SHOP,'authenticated',q,p);
 const next=(key=KEY)=>db.query(`select public.ar_item_read_next($1) r`,[key]).then(x=>x.rows[0].r);
 const done=(id,ok,result,error,key=KEY)=>db.query(`select public.ar_item_read_done($1,$2,$3,$4::jsonb,$5) r`,[key,id,ok,result==null?null:JSON.stringify(result),error]).then(x=>x.rows[0].r);
 const IMG=Buffer.from('fake photo bytes').toString('base64');

 // who asks: the owner and «storeorders» staff; the request starts waiting, signed by who asked; nobody else
 await owner(`insert into public.ar_item_reads(item_id,item_name,img_b64) values (101,'CATAFLAM 50MG 20 TAB',$1)`,[IMG]);
 await shop(`insert into public.ar_item_reads(item_id,item_name,img_b64) values (102,'VOLTAREN 50MG 20 TAB',$1)`,[IMG]);
 await assert.rejects(()=>as(OTHER,'authenticated',`insert into public.ar_item_reads(item_id,img_b64) values (103,$1)`,[IMG]),/row-level security|permission denied/,'other staff cannot ask');
 await assert.rejects(()=>as('','authenticated',`insert into public.ar_item_reads(item_id,img_b64) values (103,$1)`,[IMG]),/row-level security|permission denied/,'a stranger cannot ask');
 await assert.rejects(()=>as('','anon',`insert into public.ar_item_reads(item_id,img_b64) values (103,$1)`,[IMG]),/permission denied/);
 // a request cannot say what it is: no status, no result, no other person, no bad photo text
 await assert.rejects(()=>owner(`insert into public.ar_item_reads(item_id,status) values (104,'done')`),/permission denied/,'status is not his to set');
 await assert.rejects(()=>owner(`insert into public.ar_item_reads(item_id,result) values (104,'{}')`),/permission denied/);
 await assert.rejects(()=>owner(`insert into public.ar_item_reads(item_id,img_b64) values (104,'not base64!')`),/check constraint/);
 await assert.rejects(()=>owner(`insert into public.ar_item_reads(item_id,img_b64) values (104,$1)`,['A'.repeat(1200001)]),/check constraint/);
 const rows=await owner(`select item_id::int i, status, requested_by from public.ar_item_reads order by id`);
 assert.deepEqual(rows.map(r=>[r.i,r.status,r.requested_by]),[[101,'pending',OWNER],[102,'pending',SHOP]]);
 // who reads: the owner and «storeorders» staff; nobody else
 assert.equal((await shop(`select count(*)::int c from public.ar_item_reads`))[0].c,2,'staff read');
 assert.deepEqual(await as(OTHER,'authenticated',`select * from public.ar_item_reads`),[],'other staff see nothing');
 await assert.rejects(()=>as('','anon',`select * from public.ar_item_reads`),/permission denied/);

 // the laptop: the key, then the oldest waiting request (marked «reading»), then nothing waiting
 await assert.rejects(()=>next('cd'.repeat(32)),/bad key/);await assert.rejects(()=>next('nope'),/bad key/);
 let r=await next();assert.deepEqual([r.ok,r.item_id,r.item_name,r.img_b64],[true,101,'CATAFLAM 50MG 20 TAB',IMG]);const id1=r.id;
 r=await next();assert.equal(r.item_id,102,'the next one');const id2=r.id;
 assert.deepEqual(await next(),{ok:true,id:null},'nothing waiting');
 assert.deepEqual((await owner(`select status from public.ar_item_reads order by id`)).map(x=>x.status),['reading','reading']);
 // an answer: done with a result (the photo is emptied), failed with a reason; only a request being read can be answered, once
 assert.deepEqual(await done(id1,true,{found:true,en:'Diclofenac potassium 50 mg',ar:'ديكلوفيناك بوتاسيوم ٥٠ مجم',printed:'en',confidence:'high',note:''}),{ok:true});
 assert.deepEqual(await done(id2,false,null,'could not read'),{ok:true});
 assert.deepEqual(await done(id1,true,{found:false}),{ok:false},'already answered: nothing changes');
 await assert.rejects(()=>done(id1,true,null),/result must be an object/);await assert.rejects(()=>done(id1,true,{a:1},null,'cd'.repeat(32)),/bad key/);
 const a=await owner(`select status, result, error, img_b64, done_at is not null as finished from public.ar_item_reads order by id`);
 assert.deepEqual([a[0].status,a[0].result.en,a[0].error,a[0].img_b64,a[0].finished],['done','Diclofenac potassium 50 mg',null,null,true]);
 assert.deepEqual([a[1].status,a[1].result,a[1].error,a[1].img_b64],['failed',null,'could not read',null]);
 // a request stuck in «reading» for ten minutes goes back to waiting (when its photo is still there)
 await owner(`insert into public.ar_item_reads(item_id,img_b64) values (105,$1)`,[IMG]);
 r=await next();assert.equal(r.item_id,105);
 await db.query(`update public.ar_item_reads set started_at = now() - interval '11 minutes' where id=$1`,[r.id]);
 assert.equal((await next()).item_id,105,'it came back and is read again');
 // the owner / staff mark a finished request «applied» (he saved it) or «cancelled"; nothing else
 await owner(`update public.ar_item_reads set status='applied' where id=$1`,[id1]);
 await shop(`update public.ar_item_reads set status='cancelled' where id=$1`,[id2]);
 await assert.rejects(()=>owner(`update public.ar_item_reads set status='done' where id=$1`,[id1]),/row-level security|permission denied/,'the page cannot say «done»');
 await assert.rejects(()=>owner(`update public.ar_item_reads set result='{}' where id=$1`,[id1]),/permission denied/,'the page cannot write a result');
 assert.equal((await as(OTHER,'authenticated',`update public.ar_item_reads set status='applied' returning 1`)).length,0,'other staff change nothing');
 await assert.rejects(()=>owner(`delete from public.ar_item_reads`),/permission denied/,'nobody deletes from the page');
 // old finished rows go with the next answer; a waiting one stays however old
 await db.query(`update public.ar_item_reads set created_at = now() - interval '31 days' where id in ($1,$2)`,[id1,id2]);
 await owner(`insert into public.ar_item_reads(item_id,img_b64) values (106,$1)`,[IMG]);
 r=await next();assert.equal((await done(r.id,true,{found:false,en:'',ar:'',printed:'none',confidence:'low',note:''})).ok,true);
 assert.deepEqual((await owner(`select item_id::int i from public.ar_item_reads order by id`)).map(x=>x.i),[105,106],'the two old finished rows went');
 console.log('item-reads-migration ok');
})().catch((e)=>{console.error(e);process.exit(1)});
