// Migration 202611180030 (owner 2026-11-17: «السيستم» not «البوت»): the word is replaced in the source of the database functions that say it, whole words only (a drug name that contains the
// letters, كابوتن, stays), twice-neighbouring words both caught, the function keeps working and its grants, a second run changes nothing. Real functions on an in-memory Postgres.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;
 CREATE FUNCTION public.ar_sync_news_stub(p_key text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
 BEGIN RETURN 'البوت اتحدث كله. وللبوت رسالة، والبوت البوت، وبالبوت، (بوت) كابوتن 50 مجم'; END $f$;
 GRANT EXECUTE ON FUNCTION public.ar_sync_news_stub(text) TO anon;
 CREATE FUNCTION public.untouched() RETURNS text LANGUAGE sql AS $f$ SELECT 'كابوتن وثبوت ومبوتن'::text $f$;`);
 const sql=fs.readFileSync('supabase/migrations/202611180030_ar_system_word.sql','utf8');
 await db.exec(sql);
 const call=async()=>(await db.query(`SELECT public.ar_sync_news_stub('k') AS r`)).rows[0].r;
 assert.equal(await call(),'السيستم اتحدث كله. وللسيستم رسالة، والسيستم السيستم، وبالسيستم، (سيستم) كابوتن 50 مجم');
 assert.equal((await db.query(`SELECT public.untouched() AS r`)).rows[0].r,'كابوتن وثبوت ومبوتن','words that merely contain the letters are untouched');
 await db.exec(sql); // a second run changes nothing
 assert.equal(await call(),'السيستم اتحدث كله. وللسيستم رسالة، والسيستم السيستم، وبالسيستم، (سيستم) كابوتن 50 مجم');
 assert.equal((await db.query(`SELECT has_function_privilege('anon','public.ar_sync_news_stub(text)','execute') AS ok`)).rows[0].ok,true,'the grant stays');
 assert.equal((await db.query(`SELECT count(*)::int n FROM pg_proc WHERE pronamespace='public'::regnamespace AND prosrc LIKE '%البوت%'`)).rows[0].n,0);
 console.log('system-word-migration ok');
})().catch(e=>{console.error(e);process.exit(1)});