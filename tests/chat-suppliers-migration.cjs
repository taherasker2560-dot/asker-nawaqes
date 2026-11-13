// The warehouses' link (owner 2026-11-14 «رابط للمخزن … الربط بتاعهم بالرقم»): migration 202611141400 on an in-memory Postgres,
// over the chat migrations before it. The number first: a warehouse's saved number opens its chat with no name (two names
// with one number: the one naming a person); anyone else is asked his name; a warehouse may send PDF / Excel and never waits
// in «خدمة العملاء»; «🏬 ده مندوب مخزن» (owner only) saves a new rep's number; the phone says «وصل وارد من …» once.
// Made-up names and numbers only. Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir=path.join(__dirname,'..','supabase','migrations'),mig=(f)=>fs.readFileSync(path.join(dir,f),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',KEY='e'.repeat(64),HASH=crypto.createHash('sha256').update(KEY).digest('hex');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE SCHEMA storage;
 CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(), bucket_id text, name text, created_at timestamptz DEFAULT now());
 CREATE FUNCTION public.ar_staff_can(p text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ select false $$;
 CREATE DOMAIN public."text/plain" AS text;
 CREATE TABLE public.ar_customers(id bigint PRIMARY KEY, name text);
 CREATE TABLE public.ar_customer_links(customer_id bigint PRIMARY KEY, token text);
 CREATE TABLE public.ar_customer_phones(customer_id bigint, phone text, updated_at timestamptz DEFAULT now());
 CREATE TABLE public.ar_suppliers(name text PRIMARY KEY, phone text, created_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.ar_inbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), received_at timestamptz NOT NULL DEFAULT now(), sender text NOT NULL,
  supplier text, kind text NOT NULL, body_text text, file_path text, status text NOT NULL DEFAULT 'new', error text, rows jsonb NOT NULL DEFAULT '[]',
  sure int NOT NULL DEFAULT 0, review int NOT NULL DEFAULT 0, maybe text[], hidden_at timestamptz);
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, label text, last_used_at timestamptz);
 CREATE TABLE public.ar_inbox_keys(key_hash text PRIMARY KEY);
 CREATE TABLE public.ar_sync_log(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), data_at text,
  dry_run boolean NOT NULL DEFAULT false, status text NOT NULL, announced_at timestamptz);
 CREATE TABLE public.ar_sync_alerts(kind text PRIMARY KEY, said_at timestamptz);
 CREATE TABLE public.ar_store_orders(id bigint PRIMARY KEY, announced_at timestamptz, status text, items jsonb, customer_name text, total numeric, rx_paths text[]);
 CREATE TABLE public.ar_stock(data_at text);
 CREATE TABLE public.ar_hub_watch(id int PRIMARY KEY, at timestamptz, open boolean, stuck_since timestamptz, stuck_seen timestamptz);`);
 await db.query(`INSERT INTO public.ar_inbox_keys VALUES ($1)`,[HASH]);
 for(const f of ['202611132330_ar_chat.sql','202611140130_ar_sync_news_chat.sql','202611140200_ar_chat_open_limits.sql','202611140300_ar_chat_delete.sql'])await db.exec(mig(f));
 const sql=mig('202611141400_ar_chat_suppliers.sql');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const as=async(uid)=>db.query(`select set_config('test.uid',$1,false)`,[uid||'']);
 const open=(a)=>one(`select public.ar_chat_open(p_secret=>$1,p_token=>$2,p_name=>$3,p_phone=>$4) r`,[a.secret||null,a.token||null,a.name||null,a.phone||null]).then(x=>x.r);
 const send=(secret,kind,body,media)=>one(`select public.ar_chat_send($1,$2,$3,$4,null) r`,[secret,kind,body||null,media||null]).then(x=>x.r);
 const news=async(peek=false)=>String((await one(`select public.ar_sync_news($1,$2) t`,[KEY,peek])).t);
 await db.exec(`INSERT INTO public.ar_suppliers(name,phone) VALUES ('مخزن تجربة (حسن)','201001110001'),('مخزن النور جروب','201001110002'),('مخزن النور (سعيد)','201001110002'),('شركة بلا رقم',null)`);

 // the number first: a warehouse's number opens its chat at once, no name asked
 let r=await open({phone:'0100 111 0001'});
 assert.equal(r.ok,true);assert.equal(r.supplier,'مخزن تجربة (حسن)');assert.equal(r.name,'مخزن تجربة (حسن)');
 const wsecret=r.secret;
 // the same number written with the country code; two names with one number: the one naming a person
 r=await open({phone:'201001110002',name:'أي اسم'});assert.equal(r.supplier,'مخزن النور (سعيد)');
 // anyone else: asked his name (nothing made), then a customer as before
 const before=(await one(`select count(*)::int n from public.ar_chats`)).n;
 r=await open({phone:'01099990000'});assert.deepEqual(r,{ok:false,error:'need_name'});
 assert.equal((await one(`select count(*)::int n from public.ar_chats`)).n,before);
 r=await open({phone:'01099990000',name:'س'});assert.equal(r.error,'bad_name');
 r=await open({phone:'0109',name:'سامية'});assert.equal(r.error,'bad_phone');
 r=await open({phone:'01099990000',name:'سامية'});assert.equal(r.ok,true);assert.equal(r.supplier,null);
 const csecret=r.secret;
 // its secret opens it again and says whose it is; the page reads «supplier»
 r=await open({secret:wsecret});assert.equal(r.supplier,'مخزن تجربة (حسن)');
 r=(await one(`select public.ar_chat_read($1,0) r`,[wsecret])).r;assert.equal(r.supplier,'مخزن تجربة (حسن)');
 r=(await one(`select public.ar_chat_read($1,0) r`,[csecret])).r;assert.equal(r.supplier,null);

 // files: PDF / Excel for a warehouse only; it never waits in «خدمة العملاء»
 const day=new Date().toISOString().slice(0,10),u=()=>crypto.randomUUID();
 const pdf=`c/${day}/${u()}.pdf`,xlsx=`c/${day}/${u()}.xlsx`,pdf2=`c/${day}/${u()}.pdf`;
 await db.query(`INSERT INTO storage.objects(bucket_id,name) VALUES ('ar-chat',$1),('ar-chat',$2),('ar-chat',$3)`,[pdf,xlsx,pdf2]);
 r=await send(wsecret,'file','عروض <b>النهارده</b>.pdf',pdf);assert.equal(r.ok,true);
 r=await send(wsecret,'file','list.xlsx',xlsx);assert.equal(r.ok,true);
 r=await send(wsecret,'text','متاح كونكور ٥');assert.equal(r.ok,true);
 let c=await one(`select waiting,last_text from public.ar_chats where secret=$1`,[wsecret]);
 assert.equal(c.waiting,0,'a warehouse never waits for an answer');assert.equal(c.last_text,'متاح كونكور ٥');
 assert.equal((await one(`select body from public.ar_chat_messages where media=$1`,[pdf])).body,'عروض  b النهارده /b .pdf','the file name, cleaned');
 r=await send(csecret,'file','x.pdf',pdf2);assert.equal(r.error,'bad_kind','a customer cannot send files');
 r=await send(csecret,'text','عندكم بانادول؟');assert.equal(r.ok,true);
 assert.equal((await one(`select waiting from public.ar_chats where secret=$1`,[csecret])).waiting,1);
 // the upload rule and the bucket take PDF and Excel
 assert.match(sql,/name ~ '\^c\/\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\/\[0-9a-f-\]\{36\}\\\.\(jpg\|png\|webp\|wav\|pdf\|xlsx\|xls\)\$'/);
 assert.deepEqual((await one(`select allowed_mime_types t from storage.buckets where id='ar-chat'`)).t.slice(4),['application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
 // the phone's voice: the customer waiting is said (3b); the warehouse is not a customer
 let said=await news(true);assert.match(said,/رسالة جديدة من عميل في الرسايل، من سامية/);assert.doesNotMatch(said,/مخزن تجربة/);

 // «🏬 ده مندوب مخزن»: owner only
 r=await open({phone:'01088887777',name:'محمود'});const rep=r.secret;
 const repId=(await one(`select id from public.ar_chats where secret=$1`,[rep])).id;
 await as('');await assert.rejects(()=>db.query(`select public.ar_chat_make_supplier($1,'مخزن تجربة (حسن)',null)`,[repId]),/owner only/);
 await as(OWNER);
 r=(await one(`select public.ar_chat_make_supplier($1,'مخزن تجربة (حسن)',null) r`,[repId])).r;
 assert.deepEqual(r,{ok:true,supplier:'مخزن تجربة (حسن)',secret:rep});
 assert.deepEqual((await db.query(`select phone,supplier from public.ar_supplier_phones`)).rows,[{phone:'201088887777',supplier:'مخزن تجربة (حسن)'}]);
 c=await one(`select supplier,waiting from public.ar_chats where secret=$1`,[rep]);assert.deepEqual(c,{supplier:'مخزن تجربة (حسن)',waiting:0});
 // next time his number opens the warehouse's chat at once
 r=await open({phone:'01088887777'});assert.equal(r.supplier,'مخزن تجربة (حسن)');
 // a warehouse with no number takes it as its own; a new warehouse; a name already there is refused
 r=await open({phone:'01055554444',name:'فلان'});let id=(await one(`select id from public.ar_chats where secret=$1`,[r.secret])).id;
 r=(await one(`select public.ar_chat_make_supplier($1,'شركة بلا رقم',null) r`,[id])).r;assert.equal(r.ok,true);
 assert.equal((await one(`select phone from public.ar_suppliers where name='شركة بلا رقم'`)).phone,'201055554444');
 r=await open({phone:'01066665555',name:'علان'});id=(await one(`select id from public.ar_chats where secret=$1`,[r.secret])).id;
 r=(await one(`select public.ar_chat_make_supplier($1,null,'مخزن تجربة (حسن)') r`,[id])).r;assert.deepEqual(r,{ok:false,error:'exists'});
 r=(await one(`select public.ar_chat_make_supplier($1,null,'  مخزن   جديد  (علان) ') r`,[id])).r;assert.equal(r.supplier,'مخزن جديد (علان)');
 assert.equal((await one(`select phone from public.ar_suppliers where name='مخزن جديد (علان)'`)).phone,'201066665555');
 // a credit customer's chat is never a warehouse
 await db.exec(`INSERT INTO public.ar_customers VALUES (7,'عميل آجل'); INSERT INTO public.ar_customer_links VALUES (7,'${'d'.repeat(64)}')`);
 r=await open({token:'d'.repeat(64)});id=(await one(`select id from public.ar_chats where secret=$1`,[r.secret])).id;
 r=(await one(`select public.ar_chat_make_supplier($1,'مخزن تجربة (حسن)',null) r`,[id])).r;assert.equal(r.error,'not_cash');
 await as('');

 // the phone's voice: what came from the link is said once (3c), WhatsApp's inbox rows are not (they are said by the phone)
 await news(false); // what waited before is said
 await db.exec(`INSERT INTO public.ar_inbox(sender,supplier,kind,sure,via,chat_msg) VALUES ('رابط المخزن','مخزن تجربة (حسن)','image',30,'link',1),('رابط المخزن','مخزن تجربة (حسن)','pdf',8,'link',2);
  INSERT INTO public.ar_inbox(sender,supplier,kind,sure) VALUES ('واتس','مخزن النور جروب','image',5)`);
 assert.equal(await news(true),'وصل وارد من مخزن تجربة (حسن)، فيه 38 صنف من النواقص');
 assert.equal(await news(false),'وصل وارد من مخزن تجربة (حسن)، فيه 38 صنف من النواقص');
 assert.equal(await news(false),'','said once');
 await db.exec(`INSERT INTO public.ar_inbox(sender,supplier,kind,sure,via,chat_msg) VALUES ('رابط المخزن','مخزن تجربة (حسن)','text',0,'link',3),('رابط المخزن','مخزن النور (سعيد)','image',0,'link',4)`);
 assert.match(await news(false),/^وصل وارد من 2 مخازن: مخزن (النور \(سعيد\) ومخزن تجربة \(حسن\)|تجربة \(حسن\) ومخزن النور \(سعيد\))$/);
 // one inbox row per chat message
 await assert.rejects(()=>db.exec(`INSERT INTO public.ar_inbox(sender,supplier,kind,via,chat_msg) VALUES ('x','y','text','link',1)`),/ar_inbox_one_chat_msg|duplicate/);
 // removing a warehouse: its chats become customers' again, its extra numbers go
 await db.exec(`DELETE FROM public.ar_suppliers WHERE name='مخزن تجربة (حسن)'`);
 assert.equal((await one(`select supplier from public.ar_chats where secret=$1`,[wsecret])).supplier,null);
 assert.equal((await one(`select count(*)::int n from public.ar_supplier_phones`)).n,0);
 // the rules of the house
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate|drop column/i);
 for(const f of ['ar_supplier_of','ar_chat_open','ar_chat_read','ar_chat_send','ar_chat_make_supplier'])assert.match(sql,new RegExp(`function public\\.${f}\\([\\s\\S]*?security definer\\s+set search_path to ''`,'i'),f);
 assert.match(sql,/revoke all on function public\.ar_chat_make_supplier\(uuid, text, text\) from anon;/);
 assert.match(sql,/revoke all on function public\.ar_supplier_of\(text\) from anon;/);
 assert.doesNotMatch(sql,/using \(auth\.uid\(\)/,'policies use (select auth.uid())');
 console.log('PASS: chat suppliers: the number first, a warehouse with no name, files for warehouses only, «ده مندوب مخزن» owner only, «وصل وارد من …» once');
})().catch(e=>{console.error(e);process.exit(1)});
