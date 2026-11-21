// Migration 202611211500: every ACTIVE staff member can edit an item from the item sheet (photo / ingredient / description rows, the box-photo
// reading requests, the Arabic name and its approved row), a stranger and a stopped account cannot, and nothing else is opened.
// In-memory Postgres, row level security on. Made-up people and ids only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SELL='00000000-0000-4000-8000-0000000000f1',SHOP='00000000-0000-4000-8000-0000000000f2',STOPPED='00000000-0000-4000-8000-0000000000f3',STRANGER='00000000-0000-4000-8000-0000000000f4';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
 CREATE SCHEMA IF NOT EXISTS storage; CREATE TABLE storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
 CREATE TABLE storage.objects(bucket_id text, name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE TABLE public.ar_temp_sales(id bigint primary key, kind text, status text, customer_id bigint);
 CREATE TABLE public.ar_names(name_key text primary key, english_name text, arabic_name text, status text, updated_at timestamptz);
 ALTER TABLE public.ar_names ENABLE ROW LEVEL SECURITY;
 CREATE TABLE public.ar_store_items(id bigint primary key, name text, arabic_name text, price numeric);
 ALTER TABLE public.ar_store_items ENABLE ROW LEVEL SECURITY;
 CREATE TABLE public.ar_store_arabic(item_id bigint primary key, arabic_name text, confident boolean, source text, updated_at timestamptz);
 ALTER TABLE public.ar_store_arabic ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION public.ar_store_fill_arabic() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ update public.ar_store_items i set arabic_name = a.arabic_name from public.ar_store_arabic a where a.item_id = i.id $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);`);
 for(const f of ['202611130200_ar_staff.sql','202611141600_ar_store_edits.sql','202611210200_ar_store_edits_active.sql','202611210300_ar_item_reads.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(`GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT ALL ON public.ar_names, public.ar_store_items, public.ar_store_arabic TO authenticated;
 INSERT INTO public.ar_store_items VALUES (5,'CATAFLAM 50MG 20 TAB',null,66),(6,'VOLTAREN 50MG 20 TAB',null,70);
 INSERT INTO public.ar_staff(user_id,name,email,perms,active) VALUES ('${SELL}','بائع','f1@staff.test','{tempsale}',true),('${SHOP}','طلبات','f2@staff.test','{storeorders}',true),('${STOPPED}','موقوف','f3@staff.test','{tempsale}',false);`);
 const as=async(uid,q,p=[])=>{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${uid}',false); SET ROLE authenticated;`);try{return (await db.query(q,p)).rows}finally{await db.exec('RESET ROLE')}};
 const denied=(uid,q,p)=>assert.rejects(()=>as(uid,q,p),/row-level security|permission denied|owner or staff only/);
 // BEFORE the migration a seller (no «storeorders») could not write the fixes: the reason for it
 await denied(SELL,`INSERT INTO public.ar_store_edits(item_id,img_off) VALUES (5,true)`);
 const sql=fs.readFileSync('supabase/migrations/202611211500_ar_staff_item_edit.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 // the seller (only «البيع المؤقت») edits the photo / ingredient / description rows; it shows under his name
 await as(SELL,`INSERT INTO public.ar_store_edits(item_id,img_off,active_ar) VALUES (5,true,'باراسيتامول')`).catch(async(e)=>{throw e});
 await as(SELL,`UPDATE public.ar_store_edits SET active_en='PARACETAMOL' WHERE item_id=5`);
 assert.deepEqual((await as(SELL,`SELECT img_off,active_ar,active_en FROM public.ar_store_edits WHERE item_id=5`))[0],{img_off:true,active_ar:'باراسيتامول',active_en:'PARACETAMOL'});
 assert.ok((await db.query(`SELECT count(*)::int n FROM public.ar_activity WHERE user_id='${SELL}' AND tbl='ar_store_edits'`)).rows[0].n>=1,'his fix shows under his name');
 // a «storeorders» staff member still can, the owner too
 await as(SHOP,`INSERT INTO public.ar_store_edits(item_id,img_off) VALUES (6,false)`);await as(OWNER,`UPDATE public.ar_store_edits SET img_off=false WHERE item_id=5`);
 // a stranger and a stopped account cannot
 await denied(STRANGER,`INSERT INTO public.ar_store_edits(item_id,img_off) VALUES (7,true)`);await denied(STOPPED,`INSERT INTO public.ar_store_edits(item_id,img_off) VALUES (7,true)`);
 assert.equal((await as(STRANGER,`UPDATE public.ar_store_edits SET img_off=true WHERE item_id=5 RETURNING item_id`)).length,0);
 // the box-photo reading: the seller asks (signed with his id), reads his request, marks it used; a stranger and a stopped account cannot ask
 await as(SELL,`INSERT INTO public.ar_item_reads(item_id,item_name,img_b64) VALUES (5,'CATAFLAM 50MG 20 TAB','AAAA')`);
 const rd=(await as(SELL,`SELECT id,requested_by,status FROM public.ar_item_reads`));assert.equal(rd.length,1);assert.equal(rd[0].requested_by,SELL);assert.equal(rd[0].status,'pending');
 await as(SELL,`UPDATE public.ar_item_reads SET status='cancelled' WHERE id=$1`,[rd[0].id]);
 await denied(STRANGER,`INSERT INTO public.ar_item_reads(item_id,img_b64) VALUES (6,'AAAA')`);await denied(STOPPED,`INSERT INTO public.ar_item_reads(item_id,img_b64) VALUES (6,'AAAA')`);
 assert.equal((await as(STRANGER,`SELECT * FROM public.ar_item_reads`)).length,0,'a stranger reads none');
 // the Arabic name: the function works for the owner and any active staff member, not for a stranger or a stopped account
 assert.deepEqual((await as(SELL,`SELECT public.ar_store_owner_set_arabic(5,'  كاتافلام   ٥٠  ') r`))[0].r,{ok:true,arabic_name:'كاتافلام ٥٠'});
 assert.deepEqual((await as(OWNER,`SELECT public.ar_store_owner_set_arabic(6,'فولتارين ٥٠') r`))[0].r,{ok:true,arabic_name:'فولتارين ٥٠'});
 assert.deepEqual((await as(SELL,`SELECT public.ar_store_owner_set_arabic(5,'ا') r`))[0].r,{ok:false,error:'too_short'});
 assert.deepEqual((await as(SELL,`SELECT public.ar_store_owner_set_arabic(999,'اسم تجربة') r`))[0].r,{ok:false,error:'no_item'});
 await denied(STRANGER,`SELECT public.ar_store_owner_set_arabic(5,'اسم غريب') r`);await denied(STOPPED,`SELECT public.ar_store_owner_set_arabic(5,'اسم موقوف') r`);
 assert.equal((await db.query(`SELECT arabic_name FROM public.ar_store_items WHERE id=5`)).rows[0].arabic_name,'كاتافلام ٥٠','the name is what the seller wrote, not a stranger\'s');
 // an empty name = back to the automatic one
 assert.deepEqual((await as(SELL,`SELECT public.ar_store_owner_set_arabic(5,'') r`))[0].r.ok,true);
 // the approved row next to it: the seller adds and corrects one, cannot delete one; a stranger cannot write or read
 await as(SELL,`INSERT INTO public.ar_names(name_key,english_name,arabic_name,status,updated_at) VALUES ('cataflam 50mg 20 tab','CATAFLAM 50MG 20 TAB','كاتافلام','approved',now())
   ON CONFLICT (name_key) DO UPDATE SET arabic_name=excluded.arabic_name,status='approved'`);
 await as(SELL,`INSERT INTO public.ar_names(name_key,english_name,arabic_name,status,updated_at) VALUES ('cataflam 50mg 20 tab','CATAFLAM 50MG 20 TAB','كاتافلام ٥٠','approved',now())
   ON CONFLICT (name_key) DO UPDATE SET arabic_name=excluded.arabic_name,status='approved'`);
 assert.equal((await as(SELL,`SELECT arabic_name FROM public.ar_names WHERE name_key='cataflam 50mg 20 tab'`))[0].arabic_name,'كاتافلام ٥٠');
 assert.equal((await as(SELL,`DELETE FROM public.ar_names WHERE name_key='cataflam 50mg 20 tab' RETURNING name_key`)).length,0,'no delete for a seller');
 await denied(STRANGER,`INSERT INTO public.ar_names(name_key,english_name,arabic_name,status) VALUES ('x','X','س','approved')`);
 assert.equal((await as(STRANGER,`SELECT * FROM public.ar_names`)).length,0);
 // nothing else is opened: the seller still cannot write the items, the site's orders or the arabic table directly
 await denied(SELL,`INSERT INTO public.ar_store_items(id,name) VALUES (50,'NEW ITEM')`);
 await denied(SELL,`INSERT INTO public.ar_store_arabic(item_id,arabic_name,source) VALUES (6,'مباشر','owner')`);
 console.log('PASS: every active staff member edits an item from the sheet (rows, box-photo reading, Arabic name); a stranger and a stopped account cannot; nothing else is opened');
})().catch((e)=>{console.error(e);process.exit(1)});
