// «الملغى» in the search (owner 2026-11-20/21): migration 202611210100 on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// The laptop's upload (key, the three lists checked, the first day an item was seen stays, the heartbeat time), and who reads and writes: the owner and «search» staff read, only the owner
// puts an item back (and takes it back out), a stranger and anon nothing, nobody reads the first-seen days. Made-up ids only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611210100_ar_item_cancel.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SEARCH='22222222-2222-2222-2222-222222222222',OTHER='33333333-3333-3333-3333-333333333333';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_staff(user_id uuid PRIMARY KEY, perms text[], active boolean);
 CREATE FUNCTION public.ar_staff_can(p text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active and s.perms && p) $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);
 INSERT INTO public.ar_staff VALUES ('${SEARCH}', array['search'], true), ('${OTHER}', array['count'], true);`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;`);
 const KEY='ab'.repeat(32);
 await db.query(`insert into public.ar_sync_keys values ($1,null)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 const as=async(uid,role,q,p=[])=>{await db.exec(`set role ${role}; select set_config('test.uid','${uid}',false)`);try{return (await db.query(q,p)).rows}finally{await db.exec(`reset role`)}};
 const sync=(w,d,i,key=KEY)=>db.query(`select public.ar_item_cancel_sync($1,$2,$3,$4) r`,[key,w,d,i]).then(x=>x.rows[0].r);
 const owner=(q,p)=>as(OWNER,'authenticated',q,p);
 const today=(await db.query(`select to_char(current_date,'YYYYMMDD') d`)).rows[0].d;
 const sets=async()=>Object.fromEntries((await owner(`select kind, ids, n from public.ar_item_cancel_sets order by kind`)).map(r=>[r.kind,[r.ids,r.n]]));

 // the key
 await assert.rejects(()=>sync('','','',  'cd'.repeat(32)),/bad key/);
 await assert.rejects(()=>sync('','','','nope'),/bad key/);
 // the lists are checked (only digits, colons, commas, points) and not too long
 await assert.rejects(()=>sync('1,x','','' ),/bad list/);
 await assert.rejects(()=>sync('','1;drop table x','' ),/bad list/);
 await assert.rejects(()=>sync('','','1:2021 03'),/bad list/);
 await assert.rejects(()=>sync('','','1:'+'2'.repeat(1500001)),/list too long/);
 assert.deepEqual(await owner(`select * from public.ar_item_cancel_sets`),[],'a refused upload left nothing');

 // a good upload: word ids, dup «id:price of the card that stays», idle «id:last month» (000000 = never moved)
 let r=await sync('101,102','201:85.5,202:20','301:202103,302:000000');
 assert.deepEqual(r,{ok:true,word:2,dup:2,idle:2});
 assert.deepEqual(await sets(),{word:[`101:${today},102:${today}`,2],dup:[`201:${today}:85.5,202:${today}:20`,2],idle:['301:202103,302:000000',2]});
 // the same again: the first day each item was seen stays (an older day is not replaced by today)
 await db.query(`update public.ar_item_cancel_seen set first_at = date '2026-11-01' where item_id = 101`);
 await sync('101,102','201:85.5','301:202103');
 assert.deepEqual(await sets(),{word:[`101:20261101,102:${today}`,2],dup:[`201:${today}:85.5`,1],idle:['301:202103',1]},'101 keeps its first day; 202 left the dup list; idle is replaced');
 // an item that is both word and dup is a word one (it stays word)
 await sync('101,201','201:85.5','');
 const s2=await sets();assert.equal(s2.word[0],`101:20261101,201:${today}`);assert.equal(s2.dup[1],0,'a word item is not also a dup item');
 assert.deepEqual(s2.idle,['',0],'an empty list is stored as nothing');
 // an item that left the lists and came back keeps its first day (so a purchase in between still counts)
 await sync('102','','');await sync('101,102','','');
 assert.equal((await sets()).word[0],`101:20261101,102:${today}`);
 // nothing in a list at all
 assert.deepEqual(await sync('','',''),{ok:true,word:0,dup:0,idle:0});

 // who reads: the owner and «search» staff; nobody else
 await sync('101','201:85.5','301:202103');
 assert.equal((await as(SEARCH,'authenticated',`select count(*)::int c from public.ar_item_cancel_sets`))[0].c,3,'search staff read');
 assert.deepEqual(await as(OTHER,'authenticated',`select * from public.ar_item_cancel_sets`),[],'other staff see nothing');
 assert.deepEqual(await as('','authenticated',`select * from public.ar_item_cancel_sets`),[],'a stranger sees nothing');
 await assert.rejects(()=>as('','anon',`select * from public.ar_item_cancel_sets`),/permission denied/);
 // the lists are written by the upload only; the first-seen days are nobody's to read
 for(const q of [`insert into public.ar_item_cancel_sets(kind) values ('word')`,`update public.ar_item_cancel_sets set ids=''`,`delete from public.ar_item_cancel_sets`])
  await assert.rejects(()=>owner(q),/permission denied/,'even the owner writes the lists through the upload only: '+q);
 await assert.rejects(()=>owner(`select * from public.ar_item_cancel_seen`),/permission denied/);
 await assert.rejects(()=>as(SEARCH,'authenticated',`select * from public.ar_item_cancel_seen`),/permission denied/);

 // «ارجعه»: only the owner writes (insert; a second «ارجعه» on the same item changes nothing), search staff read, nobody else
 await owner(`insert into public.ar_item_cancel_restored(item_id) values (101)`);
 await owner(`insert into public.ar_item_cancel_restored(item_id) values (101) on conflict (item_id) do nothing`);
 assert.deepEqual((await owner(`select item_id::int i from public.ar_item_cancel_restored`)).map(x=>x.i),[101]);
 assert.deepEqual((await as(SEARCH,'authenticated',`select item_id::int i from public.ar_item_cancel_restored`)).map(x=>x.i),[101],'search staff read what was put back');
 await assert.rejects(()=>as(SEARCH,'authenticated',`insert into public.ar_item_cancel_restored(item_id) values (5)`),/row-level security|permission denied/,'staff cannot put an item back');
 await assert.rejects(()=>as(OTHER,'authenticated',`insert into public.ar_item_cancel_restored(item_id) values (5)`),/row-level security|permission denied/);
 await assert.rejects(()=>as('','anon',`select * from public.ar_item_cancel_restored`),/permission denied/);
 await assert.rejects(()=>owner(`update public.ar_item_cancel_restored set item_id = 9`),/permission denied/,'no update');
 assert.equal((await as(SEARCH,'authenticated',`delete from public.ar_item_cancel_restored returning 1`)).length,0,'staff delete nothing');
 assert.equal((await owner(`delete from public.ar_item_cancel_restored where item_id = 101 returning 1`)).length,1,'the owner can take it back out');
 console.log('item-cancel-migration ok');
})().catch((e)=>{console.error(e);process.exit(1)});
