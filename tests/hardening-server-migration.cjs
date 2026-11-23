// Migration 202611231500 (the 2026-11-23 hardening review, the server half). RUNS the real functions on an in-memory Postgres:
//  1) ar_sync_news: «الحارس:» only in front of the guard's own lines; the invoice photos' line (another kind) is said as it is;
//  2) security-3: a renewed link cuts the old holder off (his chat gets a new secret, his pushes go), the customer's own new link still opens
//     his chat; a removed house member's chat gets a new secret too;
//  3) security-4: 60 anonymous messages / 10 minutes together (linked, warehouse and house chats are not counted), an hourly size budget on
//     uploads, and the list of uploads nobody refers to;
//  4) security-5: only the real push services' hosts are saved;
//  5) pages-4: the customer's «آخر تحديث» is the customers' own sync time, not the newest row of ar_sync_log.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const MIG=path.join(__dirname,'..','supabase','migrations');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',OTHER='00000000-0000-4000-8000-0000000000e2';
const oldNews=fs.readFileSync(path.join(MIG,'202611230400_ar_laptop_news.sql'),'utf8');
const sql=fs.readFileSync(path.join(MIG,'202611231500_hardening_server.sql'),'utf8');
const code=sql.replace(/--.*$/gm,'');
assert.doesNotMatch(code,/drop table|truncate|drop function|drop column|البوت/i,'nothing is dropped; «السيستم», never the old word');
assert.doesNotMatch(code,/security definer[\s\S]{0,80}search_path to 'public'/i);
// ar_chat_open / ar_chat_read are the live ones (their migration file), loaded to prove the customer's own new link still works
function fn(file,name){const t=fs.readFileSync(path.join(MIG,file),'utf8');const re=new RegExp('create\\s+or\\s+replace\\s+function\\s+public\\.'+name+'\\s*\\(','ig');let m,last;while((m=re.exec(t)))last=m.index;
 const rest=t.slice(last);const tag=/\bas\s+(\$[a-z_]*\$)/i.exec(rest);const end=rest.indexOf(tag[1],tag.index+tag[0].length);return rest.slice(0,end+tag[1].length)+';';}
const sha=(k)=>crypto.createHash('sha256').update(k).digest('hex');
const hex=(c)=>c.repeat(64);
const LAPTOP='ab'.repeat(32),PHONE='cd'.repeat(32),WRONG='ef'.repeat(32);
const T1=hex('1'),S1=hex('a'),SM=hex('b'),T9=hex('9'),S9=hex('c'),TM=hex('d');
const FCM='https://fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuvwxyz0123456789';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
 CREATE SCHEMA storage; GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, created_at timestamptz DEFAULT now(), metadata jsonb);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT INSERT ON storage.objects TO anon, authenticated;
 CREATE DOMAIN "text/plain" AS text;
 CREATE TABLE public.ar_inbox_keys(key_hash text PRIMARY KEY);
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);
 CREATE TABLE public.ar_hub_watch(id int PRIMARY KEY, at timestamptz, open boolean, stuck_since timestamptz, stuck_seen timestamptz);
 CREATE TABLE public.ar_sync_alerts(kind text PRIMARY KEY, said_at timestamptz);
 CREATE TABLE public.ar_sync_log(id bigint generated always as identity PRIMARY KEY, at timestamptz, dry_run boolean, status text, announced_at timestamptz, data_at text);
 CREATE TABLE public.ar_store_orders(id bigint PRIMARY KEY, announced_at timestamptz, status text, items jsonb, customer_name text, total numeric, rx_paths text[]);
 CREATE TABLE public.ar_chats(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), secret text UNIQUE, customer_id bigint, member_id bigint, supplier text, name text, phone text, waiting int NOT NULL DEFAULT 0, last_from text, last_at timestamptz, last_text text, announced_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.ar_chat_messages(id bigint generated always as identity PRIMARY KEY, chat_id uuid, sender text, kind text, body text, media text, seconds int, at timestamptz NOT NULL DEFAULT now(), inbox_at timestamptz);
 CREATE TABLE public.ar_chat_push(endpoint text PRIMARY KEY, chat_id uuid, created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.ar_account_push(endpoint text PRIMARY KEY, customer_id bigint, last_at timestamp, updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.ar_dose_push(endpoint text PRIMARY KEY, times text[], last_key text, updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.ar_inbox(id uuid PRIMARY KEY, via text, announced_at timestamptz, received_at timestamptz, supplier text, sure int);
 CREATE TABLE public.ar_stock(data_at text);
 CREATE TABLE public.ar_presence(id int PRIMARY KEY, at_pharmacy boolean NOT NULL, since timestamptz NOT NULL, checked_at timestamptz NOT NULL);
 CREATE TABLE public.ar_notes(id bigint generated always as identity PRIMARY KEY, text text NOT NULL, place text NOT NULL DEFAULT 'pharmacy', status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.ar_customers(id bigint PRIMARY KEY, name text, credit_limit numeric, balance numeric, last_at timestamp, last_kind text, moves int, updated_at timestamptz NOT NULL DEFAULT now(), kind text);
 CREATE TABLE public.ar_customer_moves(id bigint PRIMARY KEY, customer_id bigint, at timestamp, kind text, total numeric, paid numeric, balance numeric, items jsonb, updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.ar_customer_links(customer_id bigint PRIMARY KEY, token text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz, seen_count int NOT NULL DEFAULT 0);
 CREATE TABLE public.ar_customer_members(id bigint generated always as identity PRIMARY KEY, customer_id bigint, token text UNIQUE, name text, show_balance boolean, on_account boolean, last_seen_at timestamptz, seen_count int NOT NULL DEFAULT 0);
 CREATE TABLE public.ar_customer_phones(customer_id bigint, phone text, updated_at timestamptz DEFAULT now());
 CREATE TABLE public.ar_customer_stops(customer_id bigint);
 CREATE FUNCTION public.ar_supplier_of(p text) RETURNS text LANGUAGE sql AS $$ select null::text $$;
 CREATE FUNCTION public.ar_member_resolve(p_token text) RETURNS TABLE(customer_id bigint, member_id bigint, member_name text, show_balance boolean, on_account boolean) LANGUAGE sql STABLE AS $$
   select l.customer_id, null::bigint, null::text, true, true from public.ar_customer_links l where l.token = p_token
   union all select m.customer_id, m.id, m.name, m.show_balance, m.on_account from public.ar_customer_members m where m.token = p_token $$;
 CREATE FUNCTION public.ar_recent_uploads(p_bucket text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$ select count(*)::int from storage.objects o where o.bucket_id = p_bucket and o.created_at > now() - interval '10 minutes' $$;
 GRANT EXECUTE ON FUNCTION public.ar_recent_uploads(text) TO anon, authenticated;`);
 await db.exec(oldNews);
 await db.exec(fn('202611141400_ar_chat_suppliers.sql','ar_chat_open'));await db.exec(fn('202611141400_ar_chat_suppliers.sql','ar_chat_read'));
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
 INSERT INTO public.ar_sync_keys VALUES ('${sha(LAPTOP)}', null); INSERT INTO public.ar_inbox_keys VALUES ('${sha(PHONE)}');`);
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const one=async(s,a=[])=>(await q(s,a))[0];
 const asOwner=async()=>db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('test.uid', '${OWNER}', false);`);
 const asOther=async()=>db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('test.uid', '${OTHER}', false);`);
 const asAnon=async()=>db.exec(`RESET ROLE; SET ROLE anon;`);
 const asRoot=async()=>db.exec(`RESET ROLE;`);

 // ---------- 1) ar_sync_news: «الحارس:» only for the guard's own lines ----------
 const add=async(lines,kind='guard')=>(await one(`select public.ar_laptop_news_add($1,$2,$3) r`,[LAPTOP,kind,lines])).r;
 const news=async(peek=false)=>(await one(`select public.ar_sync_news($1,$2) r`,[PHONE,peek])).r;
 assert.equal(await news(),'');
 await add(['وصلت 3 صور فواتير جديدة'],'invoice_photos');
 assert.equal(await news(true),'وصلت 3 صور فواتير جديدة','another sender\'s line has no «الحارس:» in front');
 assert.equal(await news(),'وصلت 3 صور فواتير جديدة');
 assert.equal(await news(),'','said once');
 await add(['نسخة السيرفر وقعت']);
 assert.equal(await news(),'الحارس: نسخة السيرفر وقعت','the guard\'s own line keeps its prefix');
 await add(['وصلت صورتين فواتير'],'invoice_photos');await add(['الديسك فاضي']);
 assert.equal(await news(),'الحارس: الديسك فاضي. وصلت صورتين فواتير','the guard first, the other sender after it');
 await add(['أ','ب']);await add(['وصلت صورة فاتورة'],'invoice_photos');
 assert.equal(await news(),'الحارس لقى 2 حاجات: أ، ب. وصلت صورة فاتورة','only the guard\'s lines are counted');
 await add(['خط 1','خط 2','خط 3','خط 4','خط 5'],'guard');
 assert.equal(await news(),'الحارس لقى 5 حاجات: خط 1، خط 2، خط 3، وكمان 2 في تقرير الحارس');
 await add(['فاتورة 1','فاتورة 2'],'invoice_photos');
 assert.equal(await news(),'فاتورة 1. فاتورة 2','two lines of the other sender: both said, no guard words');
 assert.equal((await one(`select count(*)::int n from public.ar_laptop_news where said_at is null`)).n,0);

 // ---------- 2) security-3: «🔄 رابط جديد» cuts the old holder off ----------
 await q(`insert into public.ar_customers(id,name,balance) values (7,'عميل سبعة',0),(8,'عميل تمانية',0),(9,'عميل تسعة',0)`);
 await q(`insert into public.ar_customer_links(customer_id,token) values (7,$1)`,[T1]);
 await q(`insert into public.ar_chats(id,secret,customer_id,name) values ('00000000-0000-4000-8000-000000000007',$1,7,'عميل سبعة'),('00000000-0000-4000-8000-000000000008',$2,8,'عميل تمانية'),('00000000-0000-4000-8000-000000000009',$3,9,'عميل تسعة')`,[S1,hex('e'),S9]);
 await q(`insert into public.ar_customer_members(customer_id,token,name,show_balance,on_account) values (7,$1,'ابن العميل',true,false)`,[TM]);
 const mid=(await one(`select id from public.ar_customer_members`)).id;
 await q(`insert into public.ar_chats(secret,member_id,name) values ($1,$2,'ابن العميل (أهل عميل سبعة)')`,[SM,mid]);
 await q(`insert into public.ar_chat_push(endpoint,chat_id) values ($1,'00000000-0000-4000-8000-000000000007'),($2,'00000000-0000-4000-8000-000000000008')`,[FCM+'a',FCM+'b']);
 await q(`insert into public.ar_account_push(endpoint,customer_id) values ($1,7),($2,8)`,[FCM+'c',FCM+'d']);
 const link=async(c,n)=>{await asOwner();try{return (await one(`select public.ar_customer_link($1,$2) r`,[c,n])).r;}finally{await asRoot();}};
 await asOther();
 await assert.rejects(()=>q(`select public.ar_customer_link(7,true)`),/owner only/);
 await asRoot();
 let r=await link(7,false);
 assert.deepEqual(r,{ok:true,token:T1},'no renewal: the same token');
 assert.equal((await one(`select secret from public.ar_chats where customer_id=7`)).secret,S1,'no renewal: the chat is untouched');
 assert.equal((await one(`select count(*)::int n from public.ar_account_push where customer_id=7`)).n,1);
 // a customer who had no link: the first link changes nothing else
 r=await link(9,false);
 assert.equal(r.ok,true);assert.equal((await one(`select secret from public.ar_chats where customer_id=9`)).secret,S9,'the first link is no renewal');
 r=await link(7,true);
 assert.equal(r.ok,true);assert.notEqual(r.token,T1,'a new token');
 const S1new=(await one(`select secret from public.ar_chats where customer_id=7`)).secret;
 assert.match(S1new,/^[0-9a-f]{64}$/);assert.notEqual(S1new,S1,'his chat has a new secret');
 assert.equal((await one(`select count(*)::int n from public.ar_chats where secret=$1`,[S1])).n,0,'the old secret is gone');
 assert.equal((await one(`select count(*)::int n from public.ar_account_push where customer_id=7`)).n,0,'his account pushes are dropped');
 assert.equal((await one(`select count(*)::int n from public.ar_chat_push where chat_id='00000000-0000-4000-8000-000000000007'`)).n,0,'his chat pushes are dropped');
 assert.equal((await one(`select count(*)::int n from public.ar_account_push where customer_id=8`)).n,1,'another customer is untouched');
 assert.equal((await one(`select count(*)::int n from public.ar_chat_push`)).n,1);
 assert.equal((await one(`select secret from public.ar_chats where customer_id=8`)).secret,hex('e'));
 // the old chat secret is refused, the customer's own new link opens the same chat again
 assert.equal((await one(`select public.ar_chat_read($1,0) r`,[S1])).r.ok,false,'the old secret is refused');
 assert.equal((await one(`select public.ar_chat_read($1,0) r`,[S1])).r.error,'chat');
 assert.equal((await one(`select public.ar_chat_read($1,0) r`,[S1new])).r.ok,true);
 const newLink=(await one(`select token from public.ar_customer_links where customer_id=7`)).token;
 const o=(await one(`select public.ar_chat_open(null,$1) r`,[newLink])).r;
 assert.deepEqual([o.ok,o.secret,o.linked],[true,S1new,true],'the new link opens the same chat with its new secret');
 assert.equal((await one(`select public.ar_chat_open($1,$2) r`,[S1,newLink])).r.secret,S1new,'a phone still holding the old secret, with the new link: the new secret');
 assert.equal((await one(`select public.ar_chat_open($1) r`,[S1])).r.ok,false,'the old secret alone opens nothing');
 // a removed house member: his chat is no longer reachable by its old secret, and he is out of the house
 assert.equal((await one(`select public.ar_member_remove($1,$2) r`,[newLink,mid])).r.ok,true);
 assert.equal((await one(`select count(*)::int n from public.ar_chats where secret=$1`,[SM])).n,0,'the removed member\'s old chat secret is gone');
 assert.equal((await one(`select count(*)::int n from public.ar_chats where member_id is null and customer_id is null and name like 'ابن%'`)).n,1,'the chat stays for the pharmacy, with no member');
 assert.equal((await one(`select count(*)::int n from public.ar_customer_members`)).n,0);

 // ---------- 3) security-4: the global cap, the size budget, the unreferenced uploads ----------
 const anon=(n)=>`00000000-0000-4000-8000-0000000001${String(n).padStart(2,'0')}`;
 for(let i=1;i<=4;i++)await q(`insert into public.ar_chats(id,secret,name,phone) values ($1,$2,'زائر','01000000000')`,[anon(i),hex(String(i))+'']);
 // chats 1..3 sent 20 messages each, 6 minutes ago: the 60 of the last 10 minutes
 for(let i=1;i<=3;i++)await q(`insert into public.ar_chat_messages(chat_id,sender,kind,body,at) select $1,'customer','text','x',now()-interval '6 minutes' from generate_series(1,20)`,[anon(i)]);
 const send=async(secret)=>(await one(`select public.ar_chat_send($1,'text','مرحبا') r`,[secret])).r;
 assert.deepEqual(await send(hex('4')),{ok:false,error:'too_many'},'the 61st anonymous message in 10 minutes is refused');
 // linked, warehouse and house chats are not part of it
 assert.equal((await send(S1new)).ok,true,'a linked customer still writes');
 await q(`insert into public.ar_chats(id,secret,supplier,name,phone) values ($1,$2,'مخزن','مخزن','01000000001')`,[anon(5),hex('5')]);
 assert.equal((await send(hex('5'))).ok,true,'a warehouse still writes');
 await q(`insert into public.ar_chats(secret,member_id,name) values ($1,99,'عضو')`,[hex('6')]);
 assert.equal((await send(hex('6'))).ok,true,'a house member still writes');
 // the linked / warehouse / house messages are not counted against the strangers
 assert.deepEqual(await send(hex('4')),{ok:false,error:'too_many'});
 await q(`update public.ar_chat_messages set at = now() - interval '11 minutes' where chat_id in ($1,$2,$3)`,[anon(1),anon(2),anon(3)]);
 assert.equal((await send(hex('4'))).ok,true,'after the window it writes again');
 // the size budget: 15 MB an hour for chat files, 20 MB for prescriptions
 const day=new Date().toISOString().slice(0,10);
 const uuid=()=>crypto.randomUUID();
 const upChat=async(mb)=>q(`insert into storage.objects(bucket_id,name,metadata) values ('ar-chat',$1,$2)`,[`c/${day}/${uuid()}.jpg`,JSON.stringify({size:mb*1048576})]);
 const upRx=async(mb)=>q(`insert into storage.objects(bucket_id,name,metadata) values ('ar-store-rx',$1,$2)`,[`rx/${day}/${uuid()}.jpg`,JSON.stringify({size:mb*1048576})]);
 await asAnon();
 await upChat(8);await upChat(6);          // 14 MB so far: still under
 await upChat(1);                          // 15 MB reached by this one: allowed (the budget is checked before)
 await assert.rejects(()=>upChat(1),/row-level security/,'over 15 MB an hour: refused');
 await upRx(8);await upRx(8);await upRx(2); // 18 MB so far
 await upRx(8);                             // checked before: 18 < 20, allowed (26 MB now)
 await assert.rejects(()=>upRx(1),/row-level security/,'over 20 MB an hour: refused');
 await asRoot();
 assert.equal(Number((await one(`select public.ar_recent_upload_bytes('ar-chat') b`)).b),15*1048576,'the helper sums the sizes of the last hour');
 await q(`update storage.objects set created_at = now() - interval '2 hours' where bucket_id='ar-chat'`);
 await asAnon();await upChat(8);await asRoot();   // an hour later the budget is free again
 // a wrong path is still refused, the count rule is still there
 await asAnon();await assert.rejects(()=>q(`insert into storage.objects(bucket_id,name,metadata) values ('ar-chat','other/x.jpg','{}')`),/row-level security/);await asRoot();
 // the uploads nobody refers to
 await q(`delete from storage.objects`);await q(`delete from public.ar_chat_messages`);await q(`delete from public.ar_store_orders`);
 const nm=(d,e='jpg')=>`c/${day}/${uuid()}.${e}`,rx=()=>`rx/${day}/${uuid()}.jpg`;
 const oldChatOrphan=nm(),oldChatUsed=nm('wav'),youngChatOrphan=nm(),oddName='notes/readme.txt',oldRxOrphan=rx(),oldRxUsed=rx();
 const ins=async(b,n,ago)=>q(`insert into storage.objects(bucket_id,name,created_at) values ($1,$2,now()-($3||' days')::interval)`,[b,n,String(ago)]);
 await ins('ar-chat',oldChatOrphan,3);await ins('ar-chat',oldChatUsed,3);await ins('ar-chat',youngChatOrphan,1);await ins('ar-chat',oddName,9);
 await ins('ar-store-rx',oldRxOrphan,3);await ins('ar-store-rx',oldRxUsed,3);
 await q(`insert into public.ar_chat_messages(chat_id,sender,kind,media) values ($1,'customer','voice',$2)`,[anon(1),oldChatUsed]);
 await q(`insert into public.ar_store_orders(id,rx_paths) values (1,$1)`,[[oldRxUsed]]);
 const list=(await one(`select public.ar_orphan_uploads() r`)).r;
 assert.deepEqual(list.map((x)=>x.bucket+':'+x.name).sort(),['ar-chat:'+oldChatOrphan,'ar-store-rx:'+oldRxOrphan].sort(),'only old, unreferenced uploads of the anonymous shape');
 assert.equal((await one(`select jsonb_array_length(public.ar_orphan_uploads(1)) n`)).n,1,'the limit is honoured');
 await asAnon();await assert.rejects(()=>q(`select public.ar_orphan_uploads()`),/permission denied/);await asRoot();
 await asOwner();await assert.rejects(()=>q(`select public.ar_orphan_uploads()`),/permission denied/);await asRoot();
 await db.exec(`SET ROLE service_role`);assert.equal((await one(`select jsonb_array_length(public.ar_orphan_uploads()) n`)).n,2,'the nightly cleanup (service role) can list them');await asRoot();

 // ---------- 4) security-5: only the real push services' hosts ----------
 const ok=async(u)=>(await one(`select public.ar_push_host_ok($1) r`,[u])).r;
 for(const u of [FCM,'https://updates.push.services.mozilla.com/wpush/v2/'+'x'.repeat(30),'https://web.push.apple.com/'+'x'.repeat(30),'https://wns2-par02p.notify.windows.com/w/?token='+'x'.repeat(30)])assert.equal(await ok(u),true,u);
 for(const u of ['https://evil.example/fcm.googleapis.com/x','https://fcm.googleapis.com@evil.example/x','https://fcm.googleapis.com.evil.example/x','http://fcm.googleapis.com/fcm/send/x','https://slow.example/push','https://notify.windows.com/x','https://evilpush.apple.com.example/x','',null])assert.equal(await ok(u),false,String(u));
 await asAnon();
 await assert.rejects(()=>q(`select public.ar_push_host_ok('x')`),/permission denied/,'the helper is not an API endpoint');
 assert.deepEqual((await one(`select public.ar_dose_save($1,$2) r`,['https://slow.example/'+'x'.repeat(30),['08:00']])).r,{ok:false,error:'endpoint'});
 assert.deepEqual((await one(`select public.ar_dose_save($1,$2) r`,[FCM,['08:00','14:00']])).r,{ok:true,times:2});
 assert.deepEqual((await one(`select public.ar_chat_push_save($1,$2) r`,[S1new,'https://slow.example/x'])).r,{ok:false,error:'bad_endpoint'});
 assert.deepEqual((await one(`select public.ar_chat_push_save($1,$2) r`,[S1new,FCM+'chat'])).r,{ok:true});
 assert.deepEqual((await one(`select public.ar_account_push_save($1,$2,true) r`,[newLink,'https://slow.example/'+'x'.repeat(30)])).r,{ok:false,error:'endpoint'});
 assert.deepEqual((await one(`select public.ar_account_push_save($1,$2,true) r`,[newLink,FCM+'acct'])).r,{ok:true,on:true});
 await asRoot();
 assert.equal((await one(`select count(*)::int n from public.ar_dose_push where endpoint not like 'https://fcm.googleapis.com/%'`)).n,0);

 // ---------- 5) pages-4: the customers' own sync time ----------
 const view=async()=>(await one(`select public.ar_customer_view($1) r`,[newLink])).r;
 await q(`insert into public.ar_sync_log(at,dry_run,status,data_at) values (now(),false,'STORE_OK','x')`);
 assert.equal((await view()).data_at,null,'a sync log row of the store step is not the customers\' sync');
 await q(`insert into public.ar_customers_sync_state(id,synced_at) values (1, now() - interval '5 hours')`);
 await q(`insert into public.ar_sync_log(at,dry_run,status,data_at) values (now(),false,'STORE_OK','y')`);
 let v=await view();
 const age=(x)=>(Date.now()-new Date(x).getTime())/36e5;
 assert.ok(age(v.data_at)>4.9&&age(v.data_at)<5.1,'the page shows the customers\' sync (5 hours ago), however fresh the other steps are');
 await assert.rejects(()=>q(`select public.ar_customers_sync($1,'[]','[]','[]')`,[WRONG]),/bad key/);
 assert.ok(age((await view()).data_at)>4.9,'a refused call stamps nothing');
 await asAnon();
 assert.deepEqual((await one(`select public.ar_customers_sync($1,'[]','[]','[]') r`,[LAPTOP])).r,{ok:true,customers:0,moves:0,gone:0},'an empty call (nothing new) is fine');
 await asRoot();
 assert.ok(age((await view()).data_at)<0.01,'an empty call stamps the time: the data is current');
 // a real change goes through as before
 await q(`select public.ar_customers_sync($1,$2,'[]','[]')`,[LAPTOP,JSON.stringify([{id:'7',name:'عميل سبعة',balance:'125.50',credit_limit:'1000',last_at:'2026-11-23T10:00:00',last_kind:'sale',moves:'3'}])]);
 assert.equal(String((await one(`select balance from public.ar_customers where id=7`)).balance),'125.50');
 assert.equal((await view()).customer.balance,125.5);
 // only the owner reads the stamp table; a visitor is refused
 await asOwner();assert.equal((await one(`select count(*)::int n from public.ar_customers_sync_state`)).n,1);
 await asOther();assert.equal((await one(`select count(*)::int n from public.ar_customers_sync_state`)).n,0);
 await asAnon();await assert.rejects(()=>q(`select * from public.ar_customers_sync_state`),/permission denied/);await asRoot();
 console.log('PASS: hardening server migration: guard prefix only for the guard, renewed link cuts the old holder off, anonymous chat cap + upload size budget + orphan list, push hosts, customers\' own sync time');
})().catch((e)=>{console.error(e);process.exit(1)});
