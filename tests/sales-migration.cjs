// «حركة البيع» (owner 2026-11-14): migration 202611141900 on an in-memory Postgres. The laptop's upload (key, rows checked,
// items taken from the lines, gone tickets, one year only), the period's numbers (cash / credit / returns, bars, one item),
// the invoices newest first (kind, item, customer, names joined), and the item search (every word, Arabic letters folded).
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611141900_ar_sales.sql'),'utf8');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_staff(user_id uuid PRIMARY KEY, perms text[], active boolean);
 CREATE FUNCTION public.ar_staff_can(p text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active and s.perms && p) $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);
 CREATE TABLE public.ar_store_items(id bigint PRIMARY KEY, name text, arabic_name text);
 ALTER TABLE public.ar_store_items ENABLE ROW LEVEL SECURITY;
 CREATE TABLE public.ar_customers(id bigint PRIMARY KEY, name text);
 ALTER TABLE public.ar_customers ENABLE ROW LEVEL SECURITY;`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const KEY='ab'.repeat(32);
 await db.query(`insert into public.ar_sync_keys values ($1,null)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 await db.query(`insert into public.ar_store_items values (101,'PANADOL EXTRA 24 TAB','بانادول اكسترا ٢٤ قرص'),(102,'ABIMOL 500MG 20 TAB','أبيمول ٥٠٠'),(103,'BRUFEN 400 30 TAB','بروفين ٤٠٠')`);
 await db.query(`insert into public.ar_customers values (7,'عميل تجربة')`);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const sync=(rows,gone=[],keep=null,key=KEY)=>one(`select public.ar_sales_sync($1,$2::jsonb,$3::jsonb,$4::timestamp) r`,[key,JSON.stringify(rows),JSON.stringify(gone),keep]).then(x=>x.r);
 const pad=(n)=>String(n).padStart(2,'0'),loc=(d)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
 const today=new Date();today.setHours(10,0,0,0);
 const at=(daysAgo,h)=>{const d=new Date(today);d.setDate(d.getDate()-daysAgo);d.setHours(h,15,0,0);return loc(d)};
 const L=(i,p,u,k,s,d=0)=>({i,p,u,k,s,d});
 await assert.rejects(()=>sync([],[],null,'cd'.repeat(32)),/bad key/);
 await assert.rejects(()=>sync([],[],null,'nope'),/bad key/);
 let r=await sync([
  {id:1001,at:at(0,9),customer_id:null,kind:'sale',total:145,lines:[L(101,1,0,2,116),L(103,0,1,30,78)]},
  {id:1002,at:at(0,11),customer_id:7,kind:'sale',total:232,lines:[L(101,2,0,2,116)]},
  {id:1003,at:at(0,12),customer_id:null,kind:'return',total:-116,lines:[L(101,1,0,2,116)]},
  {id:1004,at:at(1,20),customer_id:0,kind:'sale',total:24,lines:[L(102,1,0,1,24)]},                       // 0 = cash
  {id:1005,at:at(40,13),customer_id:7,kind:'sale',total:29,lines:[L(101,0,1,2,116,29)]},
  {id:1006,at:'2026-13-01',kind:'sale',total:1,lines:[]},                                                  // bad time: skipped
  {id:1007,at:at(0,9),kind:'payment',total:0,lines:[]},                                                   // not a sale: skipped
 ]);
 assert.deepEqual(r,{ok:true,rows:5,gone:0,old:0});
 assert.deepEqual((await one(`select items,customer_id from public.ar_sales where id=1001`)),{items:[101,103],customer_id:null});
 assert.equal((await one(`select customer_id from public.ar_sales where id=1004`)).customer_id,null,'customer 0 = cash');
 // the same rows again: nothing rewritten; one changed: one row
 assert.deepEqual(await sync([{id:1002,at:at(0,11),customer_id:7,kind:'sale',total:232,lines:[L(101,2,0,2,116)]}]),{ok:true,rows:0,gone:0,old:0});
 assert.deepEqual(await sync([{id:1002,at:at(0,11),customer_id:7,kind:'sale',total:230,lines:[L(101,2,0,2,116,2)]}]),{ok:true,rows:1,gone:0,old:0});
 // the period's numbers: today
 const from=at(0,0).replace('T00:15','T00:00'),to=loc(new Date(today.getTime()+864e5)).replace('T10:00','T00:00');
 let s=(await one(`select public.ar_sales_summary($1::timestamp,$2::timestamp) r`,[from,to])).r;
 assert.equal(s.unit,'hour');
 assert.deepEqual([s.sales,s.sales_n,s.cash,s.cash_n,s.credit,s.credit_n,s.returns,s.returns_n].map(Number),[375,2,145,1,230,1,-116,1]);
 assert.deepEqual(s.bars.map(b=>[b.t.slice(11),Number(b.v)]),[['09:00',145],['11:00',230],['12:00',0]]);
 assert.equal(s.item,null);
 // one item over the last 60 days (by day): packs, units and value of the sales only
 const from60=loc(new Date(today.getTime()-60*864e5));
 s=(await one(`select public.ar_sales_summary($1::timestamp,$2::timestamp,101) r`,[from60,to])).r;
 assert.equal(s.unit,'day');
 assert.deepEqual([s.sales_n,s.cash_n,s.credit_n,s.returns_n].map(Number),[3,1,2,1]);
 assert.deepEqual([s.item.packs,s.item.units,s.item.value].map(Number),[3,1,116+230+29]);
 // a customer's purchases
 s=(await one(`select public.ar_sales_summary($1::timestamp,$2::timestamp,null,7) r`,[from60,to])).r;
 assert.deepEqual([s.sales,s.sales_n,s.cash_n].map(Number),[259,2,0]);
 // the invoices newest first, names joined, 2 at a time
 const list=(k,item,cust,before,lim)=>db.query(`select * from public.ar_sales_list($1::timestamp,$2::timestamp,$3,$4,$5,$6,$7)`,[from60,to,k,item,cust,before,lim]).then(x=>x.rows);
 let rows=await list(null,null,null,null,2);
 assert.deepEqual(rows.map(x=>Number(x.id)),[1005,1004]);
 assert.equal(rows[0].customer,'عميل تجربة');
 assert.equal(rows[0].lines[0].n,'PANADOL EXTRA 24 TAB');assert.equal(rows[0].lines[0].a,'بانادول اكسترا ٢٤ قرص');
 rows=await list(null,null,null,1004,50);
 assert.deepEqual(rows.map(x=>Number(x.id)),[1003,1002,1001]);
 assert.deepEqual((await list('cash')).map(x=>Number(x.id)),[1004,1001]);
 assert.deepEqual((await list('credit')).map(x=>Number(x.id)),[1005,1002]);
 assert.deepEqual((await list('return')).map(x=>Number(x.id)),[1003]);
 assert.deepEqual((await list(null,103)).map(x=>Number(x.id)),[1001]);
 assert.deepEqual((await list(null,null,7)).map(x=>Number(x.id)),[1005,1002]);
 // the item search: every word, Arabic or English, أ = ا, most sold first
 const find=(q)=>db.query(`select id,invoices from public.ar_sales_find_items($1,10)`,[q]).then(x=>x.rows.map(y=>[Number(y.id),Number(y.invoices)]));
 assert.deepEqual(await find('ابيمول'),[[102,1]]);
 assert.deepEqual(await find('panadol extra'),[[101,4]]);
 assert.deepEqual(await find('  '),[]);
 assert.deepEqual(await find('بروفين ٤٠٠'),[[103,1]]);
 // gone tickets, and one year only: the start of the year must be about a year back
 assert.deepEqual(await sync([],[1004]),{ok:true,rows:0,gone:1,old:0});
 await db.query(`update public.ar_sales set at = at - interval '400 days' where id = 1005`);
 assert.deepEqual(await sync([],[],at(10,0)),{ok:true,rows:0,gone:0,old:0},'a start 10 days back is ignored');
 assert.deepEqual(await sync([],[],at(365,0)),{ok:true,rows:0,gone:0,old:1});
 assert.equal((await one(`select count(*)::int n from public.ar_sales`)).n,3);
 // limits and rules
 await assert.rejects(()=>sync(Array.from({length:5001},(_,i)=>({id:i+1,at:at(0,9),kind:'sale',total:1,lines:[]}))),/too big/);
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate/i);
 assert.doesNotMatch(sql,/using \(auth\.uid\(\)/,'policies use (select auth.uid())');
 assert.match(sql,/\(select public\.ar_staff_can\(array\['sales'\]::text\[\]\)\)/);
 for(const f of ['ar_sales_summary','ar_sales_list','ar_sales_find_items'])assert.match(sql,new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from anon;`),f);
 console.log('PASS: sales migration: upload with the key (rows checked, items from the lines, gone, one year), the period\'s numbers, one item, a customer, the invoices newest first with names, the item search');
})().catch((e)=>{console.error(e);process.exit(1)});
