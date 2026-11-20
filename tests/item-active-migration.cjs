// The active ingredient (owner 2026-11-21): migration 202611210200 on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// It runs on a copy of ar_store_edits' columns (the real table's policies, trigger and storage bucket come from migration 202611141600): applied twice is safe, the two columns are
// optional text, 200 characters at most each, and what was already in a row (photo, description) is left as it is.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611210200_ar_store_edits_active.sql'),'utf8');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE TABLE public.ar_store_edits (item_id bigint primary key, img text, img_off boolean not null default false, descr jsonb, desc_off boolean not null default false, updated_at timestamptz not null default now(), updated_by uuid);
  INSERT INTO public.ar_store_edits (item_id, img, descr) VALUES (101, 'e/101-abcdef012345.jpg', '{"h":"جملة"}');`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const row=(await db.query(`select item_id::int i, img, descr, active_ar, active_en from public.ar_store_edits where item_id=101`)).rows[0];
 assert.deepEqual([row.i,row.img,row.descr,row.active_ar,row.active_en],[101,'e/101-abcdef012345.jpg',{h:'جملة'},null,null],'an old row keeps its photo and description; the new columns are empty');
 await db.query(`update public.ar_store_edits set active_ar=$1, active_en=$2 where item_id=101`,['ديكلوفيناك بوتاسيوم ٥٠ مجم','Diclofenac potassium 50 mg']);
 assert.equal((await db.query(`select active_en from public.ar_store_edits where item_id=101`)).rows[0].active_en,'Diclofenac potassium 50 mg');
 // a new row with only one of them, and the limits
 await db.query(`insert into public.ar_store_edits (item_id, active_en) values (102, 'Paracetamol')`);
 assert.equal((await db.query(`select active_ar from public.ar_store_edits where item_id=102`)).rows[0].active_ar,null);
 await assert.rejects(()=>db.query(`update public.ar_store_edits set active_ar=$1 where item_id=101`,['ا'.repeat(201)]),/check constraint/);
 await assert.rejects(()=>db.query(`update public.ar_store_edits set active_en=$1 where item_id=101`,['x'.repeat(201)]),/check constraint/);
 await db.query(`update public.ar_store_edits set active_ar=$1, active_en=$2 where item_id=101`,['ا'.repeat(200),'x'.repeat(200)]);
 console.log('item-active-migration ok');
})().catch((e)=>{console.error(e);process.exit(1)});
