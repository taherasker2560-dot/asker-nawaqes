// «الموردين» (owner 2026-11-14): migration 202611142000 on an in-memory Postgres. The laptop's upload (key, a header change
// keeps the lines the server has, gone moves), a supplier's period (purchases / returns / payments, opening and closing
// balance), an item's purchases newest first with only its line, its last year (packs, suppliers, best buy), the item search.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611142000_ar_vendors.sql'),'utf8');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_staff(user_id uuid PRIMARY KEY, perms text[], active boolean);
 CREATE FUNCTION public.ar_staff_can(p text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active and s.perms && p) $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);
 CREATE TABLE public.ar_store_items(id bigint PRIMARY KEY, name text, arabic_name text);`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const KEY='cd'.repeat(32);
 await db.query(`insert into public.ar_sync_keys values ($1,null)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 await db.query(`insert into public.ar_store_items values (101,'PANADOL EXTRA 24 TAB','بانادول اكسترا'),(102,'LICID 60CC LOTION',null)`);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const sync=(v,m,g=[],key=KEY)=>one(`select public.ar_vendors_sync($1,$2::jsonb,$3::jsonb,$4::jsonb) r`,[key,JSON.stringify(v),JSON.stringify(m),JSON.stringify(g)]).then(x=>x.r);
 const pad=(n)=>String(n).padStart(2,'0'),loc=(d)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
 const ago=(days,h=12)=>{const d=new Date();d.setDate(d.getDate()-days);d.setHours(h,0,0,0);return loc(d)};
 const L=(i,p,c,t,x,b=0,u=0)=>({i,p,u,k:1,b,c,t,x});
 await assert.rejects(()=>sync([],[],[],'ef'.repeat(32)),/bad key/);
 const V=[{id:2374,name:'A M group',short:'AMG',active:true,balance:3100,invoices:2,last_invoice_at:ago(2),last_payment_at:ago(1),last_payment:2000},{id:2278,name:'رضا عطية',short:'SKY',active:true,balance:900,invoices:1,last_invoice_at:ago(30),last_payment_at:null,last_payment:null}];
 const M=[
  {id:10,vendor_id:2374,at:ago(400),kind:'purchase',code:'10/25/100',inv_date:ago(400).slice(0,10),amount:5000,total:5000,balance:5000,lines:[L(101,50,90,18,'2027-06-28')]},
  {id:11,vendor_id:2374,at:ago(5),kind:'purchase',code:'11/26/200',inv_date:ago(5).slice(0,10),amount:1200,total:1200,balance:6200,lines:[L(101,10,86,16,'2028-08-28',1),L(102,5,36,10,'2029-03-28')]},
  {id:12,vendor_id:2374,at:ago(4),kind:'return',code:'~11/26/200',inv_date:null,amount:-180,total:-180,balance:6020,lines:[L(102,5,36,10,'2029-03-28')]},
  {id:-500,vendor_id:2374,at:ago(3),kind:'payment',code:null,amount:-2000,balance:4020},
  {id:13,vendor_id:2374,at:ago(2),kind:'purchase',code:'11/26/300',inv_date:ago(2).slice(0,10),amount:-920+0,total:-920,balance:3100,lines:[]},
  {id:20,vendor_id:2278,at:ago(30),kind:'purchase',code:'10/26/900',inv_date:ago(30).slice(0,10),amount:900,total:900,balance:900,lines:[L(101,12,84,18,'2028-06-28')]},
  {id:21,vendor_id:2278,at:ago(1),kind:'refund',amount:1},                                  // unknown kind: skipped
 ];
 assert.deepEqual(await sync(V,M),{ok:true,vendors:2,moves:6,gone:0});
 assert.deepEqual((await one(`select items,lines is null n from public.ar_vendor_moves where id=11`)),{items:[101,102],n:false});
 assert.equal((await one(`select lines from public.ar_vendor_moves where id=-500`)).lines,null,'a payment has no lines');
 // a header change without «lines» keeps the lines; unchanged rows are not rewritten
 assert.deepEqual(await sync([],[{id:11,vendor_id:2374,at:ago(5),kind:'purchase',code:'11/26/200',inv_date:ago(5).slice(0,10),amount:1210,total:1200,balance:6210}]),{ok:true,vendors:0,moves:1,gone:0});
 const r11=await one(`select amount,items,jsonb_array_length(lines) n from public.ar_vendor_moves where id=11`);
 assert.deepEqual([Number(r11.amount),r11.items,r11.n],[1210,[101,102],2]);
 assert.deepEqual(await sync(V,[{id:11,vendor_id:2374,at:ago(5),kind:'purchase',code:'11/26/200',inv_date:ago(5).slice(0,10),amount:1210,total:1200,balance:6210}]),{ok:true,vendors:0,moves:0,gone:0});
 // a supplier's period: the last 10 days of AMG
 const p=(await one(`select public.ar_vendor_period(2374,$1::timestamp,$2::timestamp) r`,[ago(10,0),ago(-1,0)])).r;
 assert.deepEqual([p.purchases,p.purchases_n,p.returns,p.returns_n,p.payments,p.payments_n,p.opening,p.closing].map(Number),[1210-920,2,-180,1,-2000,1,5000,3100]);
 // an item's purchases newest first, only its own line; the returns apart
 const im=(k,b,l)=>db.query(`select id,vendor_id,kind,code,line from public.ar_vendor_item_moves(101,$1,$2,$3)`,[k,b,l]).then(x=>x.rows);
 let rows=await im(null,null,null);
 assert.deepEqual(rows.map(x=>Number(x.id)),[20,11,10]);
 assert.deepEqual(rows[1].line,{i:101,p:10,u:0,k:1,b:1,c:86,t:16,x:'2028-08-28'});
 assert.deepEqual((await im(null,20,1)).map(x=>Number(x.id)),[11],'paged by id');
 assert.deepEqual((await db.query(`select id from public.ar_vendor_item_moves(102,'return',null,null)`)).rows.map(x=>Number(x.id)),[12]);
 // the item's last year: 22 packs + 1 bonus in 2 buys from 2 suppliers; best = the 18% one (SKY)
 const s=(await one(`select public.ar_vendor_item_summary(101) r`)).r;
 assert.deepEqual([s.packs,s.bonus,s.buys,s.vendors].map(Number),[22,1,2,2]);
 assert.deepEqual([Number(s.best.vendor_id),Number(s.best.t)],[2278,18]);
 // the item search
 assert.deepEqual((await db.query(`select id,buys from public.ar_vendor_find_items('بانادول',5)`)).rows.map(x=>[Number(x.id),Number(x.buys)]),[[101,3]]);
 assert.deepEqual((await db.query(`select id from public.ar_vendor_find_items('',5)`)).rows,[]);
 // gone
 assert.deepEqual(await sync([],[],[13]),{ok:true,vendors:0,moves:0,gone:1});
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate/i);
 assert.doesNotMatch(sql,/using \(auth\.uid\(\)/,'policies use (select auth.uid())');
 for(const f of ['ar_vendor_period','ar_vendor_item_moves','ar_vendor_item_summary','ar_vendor_find_items'])assert.match(sql,new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from anon;`),f);
 console.log('PASS: vendors migration: upload with the key (header changes keep lines, gone), a supplier\'s period, an item\'s purchases and last year, the item search');
})().catch((e)=>{console.error(e);process.exit(1)});
