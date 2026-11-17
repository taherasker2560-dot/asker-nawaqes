// Migration 202611172300 (owner 2026-11-17: «⏰ منبه الدوا» stage 2, a notification at each dose time even when the browser is closed), run for real on an in-memory Postgres
// (PGLITE_MODULE may point to an installed @electric-sql/pglite package): the page saves only CLOCK TIMES for a push address (no medicine name, no customer), the minute timer takes
// the addresses due at one minute exactly once, and nobody but the service role can ask who is due. cron / net are stubs (their calls are only recorded).
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA cron; CREATE TABLE cron.job(jobname text, schedule text, command text);
 CREATE FUNCTION cron.schedule(n text, s text, c text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job VALUES (n, s, c); SELECT 1::bigint $$;
 CREATE FUNCTION cron.unschedule(n text) RETURNS boolean LANGUAGE sql AS $$ DELETE FROM cron.job WHERE jobname = n; SELECT true $$;`);
 const sql=fs.readFileSync('supabase/migrations/202611172300_ar_dose_push.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe (one job, not two)
 const q=async(text,p)=>(await db.query(text,p)).rows;
 const EP=(n)=>'https://push.example/send/'+String(n).padStart(20,'a');
 const save=async(ep,times)=>(await q(`SELECT public.ar_dose_save($1,$2::text[]) AS r`,[ep,times]))[0].r;
 const due=async(hhmm,key)=>(await q(`SELECT public.ar_dose_due($1,$2) AS r`,[hhmm,key]))[0].r;
 const all=async()=>q(`SELECT endpoint, times, last_key FROM public.ar_dose_push ORDER BY endpoint`);

 // the minute timer is scheduled once, every minute, to the dose function
 let jobs=await q(`SELECT jobname, schedule, command FROM cron.job`);
 assert.equal(jobs.length,1);assert.equal(jobs[0].jobname,'ar-dose-tick');assert.equal(jobs[0].schedule,'* * * * *');
 assert.match(jobs[0].command,/functions\/v1\/asker-dose/);assert.match(jobs[0].command,/"action":"tick"/);

 // save: only valid clock times, sorted, no duplicates; a bad address is refused
 assert.deepEqual(await save(EP(1),['20:00','08:00','8:00','25:00','12:60','08:00','abc']),{ok:true,times:2});
 assert.deepEqual((await all())[0].times,['08:00','20:00']);
 for(const bad of [null,'http://push.example/x'.padEnd(30,'a'),'https://x','']) assert.deepEqual(await save(bad,['08:00']),{ok:false,error:'endpoint'},String(bad));
 assert.equal((await all()).length,1);
 // there is no place for a name or a customer in the table
 assert.deepEqual((await q(`SELECT column_name FROM information_schema.columns WHERE table_name='ar_dose_push' ORDER BY 1`)).map(r=>r.column_name),['created_at','endpoint','last_key','times','updated_at']);

 // due: the address with a dose at this minute, once; another minute, another key
 await save(EP(2),['08:00','13:30']);await save(EP(3),['13:30']);
 assert.deepEqual((await due('08:00','2026-11-17 08:00')).sort(),[EP(1),EP(2)]);
 assert.deepEqual(await due('08:00','2026-11-17 08:00'),[],'the same minute again sends nothing');
 assert.deepEqual((await due('13:30','2026-11-17 13:30')).sort(),[EP(2),EP(3)]);
 assert.deepEqual(await due('09:00','2026-11-17 09:00'),[],'nobody at 09:00');
 assert.deepEqual((await due('08:00','2026-11-18 08:00')).sort(),[EP(1),EP(2)],'the next day is a new key');
 assert.deepEqual(await due('8:00','x'),[],'a bad minute gets nothing');assert.deepEqual(await due(null,'x'),[]);assert.deepEqual(await due('08:00',null),[]);
 // changing the times of a phone lets it be sent again for the new times; the same times keep the mark
 await save(EP(1),['08:00','20:00']);assert.equal((await all()).find(r=>r.endpoint===EP(1)).last_key,'2026-11-18 08:00','same times: the mark stays');
 await save(EP(1),['08:00','21:00']);assert.equal((await all()).find(r=>r.endpoint===EP(1)).last_key,null,'new times: it can be sent again');
 // an empty list removes the phone (all alarms off, or deleted)
 assert.deepEqual(await save(EP(3),[]),{ok:true,times:0});assert.deepEqual(await save(EP(2),null),{ok:true,times:0});
 assert.deepEqual((await all()).map(r=>r.endpoint),[EP(1)]);
 // at most 40 times, and the table has a ceiling
 await save(EP(4),Array.from({length:60},(_,i)=>String(Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00')));
 assert.equal((await all()).find(r=>r.endpoint===EP(4)).times.length,40);

 // grants: the page (visitors and customers) can save; only the service role can ask who is due; nobody reads the table
 const can=async(role,fn)=>(await q(`SELECT has_function_privilege('${role}','${fn}','execute') AS ok`))[0].ok;
 assert.equal(await can('anon','public.ar_dose_save(text,text[])'),true);assert.equal(await can('authenticated','public.ar_dose_save(text,text[])'),true);assert.equal(await can('public','public.ar_dose_save(text,text[])'),false);
 for(const role of ['anon','authenticated','public'])assert.equal(await can(role,'public.ar_dose_due(text,text)'),false,role+' cannot ask who is due');
 assert.equal(await can('service_role','public.ar_dose_due(text,text)'),true);
 for(const role of ['anon','authenticated'])assert.equal((await q(`SELECT has_table_privilege('${role}','public.ar_dose_push','select') AS ok`))[0].ok,false,role+' cannot read the table');
 assert.equal((await q(`SELECT relrowsecurity FROM pg_class WHERE oid='public.ar_dose_push'::regclass`))[0].relrowsecurity,true);
 assert.equal((await q(`SELECT count(*)::int n FROM pg_policies WHERE tablename='ar_dose_push'`))[0].n,0,'no policy: closed');
 console.log('dose-push-sql ok');
})().catch(e=>{console.error(e);process.exit(1)});
