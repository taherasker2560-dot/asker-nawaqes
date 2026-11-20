// The monthly sales per item (owner 2026-11-20, «أ»: a line a month per item from 2018): migration 202611202300 on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// The laptop's upload (key, rows checked, only what changed, gone items, the heartbeat row), and who reads: the owner and «sales» staff; a stranger and anon nothing; nobody writes but the upload. Made-up items only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611202300_ar_item_sales_monthly.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SALES='22222222-2222-2222-2222-222222222222',OTHER='33333333-3333-3333-3333-333333333333';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_staff(user_id uuid PRIMARY KEY, perms text[], active boolean);
 CREATE FUNCTION public.ar_staff_can(p text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active and s.perms && p) $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);
 INSERT INTO public.ar_staff VALUES ('${SALES}', array['sales'], true), ('${OTHER}', array['count'], true);`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;`);
 const KEY='ab'.repeat(32);
 await db.query(`insert into public.ar_sync_keys values ($1,null)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 const as=async(uid,role,q,p=[])=>{await db.exec(`set role ${role}; select set_config('test.uid','${uid}',false)`);try{return (await db.query(q,p)).rows}finally{await db.exec(`reset role`)}};
 const sync=(rows,gone=[],key=KEY)=>db.query(`select public.ar_item_sales_sync($1,$2::jsonb,$3::jsonb) r`,[key,JSON.stringify(rows),JSON.stringify(gone)]).then(x=>x.rows[0].r);
 const owner=(q,p)=>as(OWNER,'authenticated',q,p);

 // the key
 await assert.rejects(()=>sync([],[],'cd'.repeat(32)),/bad key/);
 await assert.rejects(()=>sync([],[],'nope'),/bad key/);
 // the upload: a good row, and rows that are skipped (bad month, bad shape, not four numbers, a text instead of a number, no item)
 let r=await sync([
  {i:101,m:{'2018-03':[10,0,850.5,4],'2026-11':[3,1,200,2]}},
  {i:102,m:{'2019-12':[1.5,0,90,1]}},
  {i:103,m:{'2019-13':[1,0,1,1]}},            // month 13
  {i:104,m:{'2019-1':[1,0,1,1]}},             // month not padded
  {i:105,m:{'2019-01':[1,0,1]}},              // three numbers
  {i:106,m:{'2019-01':[1,0,'x',1]}},          // a text
  {i:107,m:[1,2]},                            // not an object
  {i:'abc',m:{'2019-01':[1,0,1,1]}},          // no item
  {i:108,m:{}},                               // an item with no months is kept as it is (the laptop sends none)
 ]);
 assert.deepEqual(r,{ok:true,rows:3,gone:0});
 assert.deepEqual((await owner(`select item_id::int i from public.ar_item_sales_monthly where item_id > 0 order by 1`)).map(x=>x.i),[101,102,108]);
 assert.deepEqual((await owner(`select months from public.ar_item_sales_monthly where item_id=101`))[0].months,{'2018-03':[10,0,850.5,4],'2026-11':[3,1,200,2]});
 // the same rows again: nothing rewritten; one changed month: one row
 assert.deepEqual(await sync([{i:101,m:{'2018-03':[10,0,850.5,4],'2026-11':[3,1,200,2]}}]),{ok:true,rows:0,gone:0});
 const before=(await owner(`select updated_at from public.ar_item_sales_monthly where item_id=101`))[0].updated_at;
 await new Promise(ok=>setTimeout(ok,20));
 assert.deepEqual(await sync([{i:101,m:{'2018-03':[10,0,850.5,4],'2026-11':[5,1,300,3]}}]),{ok:true,rows:1,gone:0});
 assert.ok((await owner(`select updated_at from public.ar_item_sales_monthly where item_id=101`))[0].updated_at>before,'a changed row has a new time');
 // too many months for one item, and a batch that is too big
 const many={};for(let y=2000;y<2020;y++)for(let m=1;m<=12;m++)many[`${y}-${String(m).padStart(2,'0')}`]=[1,0,1,1];   // 240 months
 assert.equal((await sync([{i:109,m:many}])).rows,0,'more than 200 months is not an item\'s history');
 await assert.rejects(()=>sync(Array.from({length:3001},(_,i)=>({i:1000+i,m:{'2019-01':[1,0,1,1]}}))),/batch too big/);
 await assert.rejects(()=>db.query(`select public.ar_item_sales_sync($1,'{}'::jsonb)`,[KEY]),/arrays/);
 // gone items go; the heartbeat row stays (and cannot be removed by a gone list)
 assert.deepEqual(await sync([],[102,-1,999]),{ok:true,rows:0,gone:1});
 assert.deepEqual((await owner(`select item_id::int i from public.ar_item_sales_monthly order by 1`)).map(x=>x.i),[-1,101,108]);
 // the heartbeat: the time the laptop last sent
 const hb=(await owner(`select updated_at from public.ar_item_sales_monthly where item_id=-1`))[0].updated_at;
 await new Promise(ok=>setTimeout(ok,20));
 await sync([]);
 assert.ok((await owner(`select updated_at from public.ar_item_sales_monthly where item_id=-1`))[0].updated_at>hb,'the heartbeat moves on every send');

 // who reads: the owner and «sales» staff; nobody else; nobody writes but the upload
 assert.equal((await as(SALES,'authenticated',`select count(*)::int c from public.ar_item_sales_monthly`))[0].c,3,'sales staff read');
 assert.deepEqual(await as(OTHER,'authenticated',`select * from public.ar_item_sales_monthly`),[],'other staff see nothing');
 assert.deepEqual(await as('','authenticated',`select * from public.ar_item_sales_monthly`),[],'a stranger sees nothing');
 await assert.rejects(()=>as('','anon',`select * from public.ar_item_sales_monthly`),/permission denied/);
 for(const q of [`insert into public.ar_item_sales_monthly(item_id) values (5)`,`update public.ar_item_sales_monthly set months='{}'`,`delete from public.ar_item_sales_monthly`])
  await assert.rejects(()=>owner(q),/permission denied/,'even the owner writes through the upload only: '+q);
 assert.equal((await owner(`select count(*)::int c from public.ar_item_sales_monthly`))[0].c,3,'nothing changed by the others');
 console.log('item-sales-monthly-migration ok');
})().catch((e)=>{console.error(e);process.exit(1)});
