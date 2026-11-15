// «الخزن» (owner 2026-11-15): migration 202611151900 on an in-memory Postgres. The laptop's upload (key, unchanged rows are not
// rewritten, a changed row is, gone moves), and the reading rule: the OWNER only (a staff member with every section, and a
// stranger, read nothing).
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611151900_ar_cash.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',STAFF='11111111-1111-1111-1111-111111111111';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated; GRANT SELECT ON public.ar_cash_accounts, public.ar_cash_moves TO authenticated;`);
 const KEY='ab'.repeat(32);
 await db.query(`insert into public.ar_sync_keys values ($1,null)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const sync=(a,m,g=[],key=KEY)=>one(`select public.ar_cash_sync($1,$2::jsonb,$3::jsonb,$4::jsonb) r`,[key,JSON.stringify(a),JSON.stringify(m),JSON.stringify(g)]).then(x=>x.r);
 await assert.rejects(()=>sync([],[],[],'cd'.repeat(32)),/bad key/);
 await assert.rejects(()=>sync([],[],[],'short'),/bad key/);
 const A=[{id:1,name:'درج خزينة النقدية',type:0,balance:2150,last_at:'2026-11-15T14:07:29'},{id:2,name:'الخزينة الرئيسية',type:0,balance:580.5,last_at:'2026-11-14T23:40:31'},{id:3,name:'',type:0,balance:1}];
 const M=[
  {id:-2026111501,account_id:1,at:'2026-11-15T14:07:29',op:1,kind:'sales',amount:5230.5,n:312},
  {id:900,account_id:1,at:'2026-11-15T11:19:07',op:2,kind:'customer',amount:150,who:'أحمد مسعود'},
  {id:901,account_id:1,at:'2026-11-14T23:40:04',op:5,kind:'drawer_out',amount:-8910.35},
  {id:902,account_id:2,at:'2026-11-14T23:40:04',op:6,kind:'drawer_in',amount:8920},
  {id:903,account_id:2,at:'2026-11-14T23:40:31',op:52,kind:'transfer_out',amount:-8800,who:'احتياطى 2'},
  {id:904,account_id:2,at:'2026-11-12T20:00:00',op:1002,kind:'expense',amount:-300,who:'فواتير كهرباة',memo:'كهربا'},
  {id:905,account_id:2,at:'2026-11-11T20:00:00',op:50,kind:'other_in',amount:25},
  {id:906,account_id:2,at:'2026-11-11T20:00:00',op:9,kind:'refund',amount:1},          // unknown kind: skipped
  {id:907,account_id:2,at:'not a time',op:9,kind:'vendor',amount:1},                   // bad time: skipped
 ];
 assert.deepEqual(await sync(A,M),{ok:true,accounts:2,moves:7,gone:0},'a box without a name is skipped, so are the two bad moves');
 // unchanged rows are not rewritten; a changed one is
 assert.deepEqual(await sync(A,M),{ok:true,accounts:0,moves:0,gone:0});
 assert.deepEqual(await sync([{...A[0],balance:2160}],[{...M[0],amount:5240.5,n:313}]),{ok:true,accounts:1,moves:1,gone:0});
 assert.deepEqual(await one(`select balance::float b from public.ar_cash_accounts where id=1`),{b:2160});
 assert.deepEqual(await one(`select amount::float a, n from public.ar_cash_moves where id=-2026111501`),{a:5240.5,n:313});
 // gone moves
 assert.deepEqual(await sync([],[],[904,905]),{ok:true,accounts:0,moves:0,gone:2});
 assert.equal(Number((await one(`select count(*) c from public.ar_cash_moves`)).c),5);
 // the reading rule: the owner reads, nobody else
 const as=async(uid)=>{await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false)`);const r=[Number((await one(`select count(*) c from public.ar_cash_accounts`)).c),Number((await one(`select count(*) c from public.ar_cash_moves`)).c)];await db.exec(`reset role`);return r};
 assert.deepEqual(await as(OWNER),[2,5]);
 assert.deepEqual(await as(STAFF),[0,0],'a staff member reads no cash, whatever his sections');
 assert.deepEqual(await as(''),[0,0]);
 // a stranger cannot upload
 await assert.rejects(()=>db.query(`select public.ar_cash_sync($1,'[]','[]','[]')`,['00'.repeat(32)]),/bad key/);
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate/i);
 assert.doesNotMatch(sql,/using \(auth\.uid\(\)/,'policies use (select auth.uid())');
 assert.doesNotMatch(sql,/ar_staff_can/,'owner only');
 console.log('PASS: cash migration: upload with the key (unchanged rows kept, changes, gone), read by the owner only');
})().catch((e)=>{console.error(e);process.exit(1)});
