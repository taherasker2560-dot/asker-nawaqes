// A new item's box photo in «مراجعة الفواتير» (owner 2026-11-22): migration 202611221800 on top of 202611210300, on an in-memory Postgres (PGLITE_MODULE may point to an installed
// @electric-sql/pglite package). Who may ask for a new-item reading (the owner only; staff keep the item sheet's), what a request must carry, the laptop's calls (kind / review / line / supplier,
// the photo KEPT for a new item and emptied for the sheet's, a review's readings listed with their photo), and that the old item-sheet requests still work. Made-up ids and a tiny fake photo only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const mig=(f)=>fs.readFileSync(path.join(__dirname,'..','supabase','migrations',f),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SHOP='22222222-2222-2222-2222-222222222222';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_staff(user_id uuid PRIMARY KEY, perms text[], active boolean);
 CREATE FUNCTION public.ar_staff_can(p text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active and s.perms && p) $$;
 CREATE FUNCTION public.ar_is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active) $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);
 CREATE TABLE public.ar_invoice_reviews(id bigint PRIMARY KEY, supplier text not null);
 INSERT INTO public.ar_invoice_reviews VALUES (7,'رضا'), (8,'ابن سينا');
 INSERT INTO public.ar_staff VALUES ('${SHOP}', array['storeorders'], true);`);
 await db.exec(mig('202611210300_ar_item_reads.sql'));
 await db.exec(mig('202611221800_ar_item_reads_new_item.sql'));await db.exec(mig('202611221800_ar_item_reads_new_item.sql')); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;`);
 const KEY='ab'.repeat(32);
 await db.query(`insert into public.ar_sync_keys values ($1,null)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 const as=async(uid,role,q,p=[])=>{await db.exec(`set role ${role}; select set_config('test.uid','${uid}',false)`);try{return (await db.query(q,p)).rows}finally{await db.exec(`reset role`)}};
 const owner=(q,p)=>as(OWNER,'authenticated',q,p), shop=(q,p)=>as(SHOP,'authenticated',q,p);
 const next=(key=KEY)=>db.query(`select public.ar_item_read_next($1) r`,[key]).then(x=>x.rows[0].r);
 const done=(id,ok,result,error,key=KEY)=>db.query(`select public.ar_item_read_done($1,$2,$3,$4::jsonb,$5) r`,[key,id,ok,result==null?null:JSON.stringify(result),error]).then(x=>x.rows[0].r);
 const list=(rev,key=KEY)=>db.query(`select public.ar_item_read_list($1,$2) r`,[key,rev]).then(x=>x.rows[0].r);
 const IMG=Buffer.from('fake box photo').toString('base64');

 // the owner asks for a new item's reading on a review line (no item code yet); staff cannot (the review page is his), but still ask the item sheet's
 await owner(`insert into public.ar_item_reads(kind,review_id,line_n,item_name,img_b64) values ('new_item',7,'2','ليفز شامبو',$1)`,[IMG]);
 await assert.rejects(()=>shop(`insert into public.ar_item_reads(kind,review_id,line_n,img_b64) values ('new_item',7,'3',$1)`,[IMG]),/row-level security/,'staff cannot ask a new-item reading');
 await shop(`insert into public.ar_item_reads(item_id,item_name,img_b64) values (101,'CATAFLAM 50MG 20 TAB',$1)`,[IMG]);
 // what a request must carry: a sheet request its item, a new-item one its review and line; nothing else
 await assert.rejects(()=>owner(`insert into public.ar_item_reads(kind,review_id,img_b64) values ('new_item',7,$1)`,[IMG]),/check constraint/,'a new item needs its line');
 await assert.rejects(()=>owner(`insert into public.ar_item_reads(kind,line_n,img_b64) values ('new_item','2',$1)`,[IMG]),/check constraint/,'a new item needs its review');
 await assert.rejects(()=>owner(`insert into public.ar_item_reads(img_b64) values ($1)`,[IMG]),/check constraint/,'a sheet request needs its item');
 await assert.rejects(()=>owner(`insert into public.ar_item_reads(kind,item_id,img_b64) values ('other',5,$1)`,[IMG]),/check constraint/);
 await assert.rejects(()=>owner(`insert into public.ar_item_reads(kind,review_id,line_n,img_b64) values ('new_item',99,'1',$1)`,[IMG]),/foreign key/,'only a real review');
 await assert.rejects(()=>as('','anon',`insert into public.ar_item_reads(kind,review_id,line_n,img_b64) values ('new_item',7,'2',$1)`,[IMG]),/permission denied/);

 // the laptop: the oldest first, with its kind, review, line and the invoice's supplier
 let r=await next();
 assert.deepEqual([r.kind,r.review_id,r.line_n,r.supplier,r.item_id,r.item_name,r.img_b64],['new_item',7,'2','رضا',null,'ليفز شامبو',IMG]);const nid=r.id;
 r=await next();assert.deepEqual([r.kind,r.item_id,r.review_id,r.supplier],['active',101,null,null],'a sheet request as before');const aid=r.id;
 // the answers: a new item keeps its photo (it becomes the item's photo later), a sheet request's photo is emptied as before
 const READ={found:true,name_en:'LEAVES ANTI HAIR LOSS SHAMPOO 200ML',form:'شامبو',count:1,company:'Leaves',price:309,active:'',confidence:'high',note:''};
 assert.deepEqual(await done(nid,true,READ),{ok:true});
 assert.deepEqual(await done(aid,true,{found:true,en:'Diclofenac potassium 50 mg',ar:'ديكلوفيناك',printed:'en',confidence:'high',note:''}),{ok:true});
 const a=await owner(`select kind, status, img_b64 from public.ar_item_reads order by id`);
 assert.deepEqual(a.map(x=>[x.kind,x.status,x.img_b64]),[['new_item','done',IMG],['active','done',null]]);

 // a review's readings for the invoices conversation: newest per line first, cancelled ones left out, the photo included; other reviews' not
 await owner(`insert into public.ar_item_reads(kind,review_id,line_n,img_b64) values ('new_item',7,'4',$1)`,[IMG]);
 await owner(`insert into public.ar_item_reads(kind,review_id,line_n,img_b64) values ('new_item',8,'1',$1)`,[IMG]);
 const id4=(await owner(`select id from public.ar_item_reads where review_id=7 and line_n='4'`))[0].id;
 await owner(`update public.ar_item_reads set status='cancelled' where id=$1`,[id4]);
 let L=await list(7);
 assert.equal(L.ok,true);assert.deepEqual(L.rows.map(x=>[x.line_n,x.status,x.result&&x.result.name_en,x.img_b64]),[['2','done','LEAVES ANTI HAIR LOSS SHAMPOO 200ML',IMG]]);
 await assert.rejects(()=>list(7,'cd'.repeat(32)),/bad key/);
 // the page marks it «applied» once the photo became the item's; it cannot write a result
 await owner(`update public.ar_item_reads set status='applied' where id=$1`,[nid]);
 await assert.rejects(()=>owner(`update public.ar_item_reads set result='{}' where id=$1`,[nid]),/permission denied/);
 // a review that goes takes its readings with it
 await db.exec(`delete from public.ar_invoice_reviews where id = 8`);
 assert.equal((await owner(`select count(*)::int c from public.ar_item_reads where review_id=8`))[0].c,0);
 console.log('item-reads-new-item-migration ok');
})().catch((e)=>{console.error(e);process.exit(1)});
