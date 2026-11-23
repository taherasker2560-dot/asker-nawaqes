// Done invoice cards leave by themselves (owner 2026-11-23: «يحذف الفواتير اللى اتدخلت بشكل تلقائى … تفضل ١٢ ساعه بس و تانى يوم تتحذف»): migration 202611231500 on an in-memory
// Postgres (a tiny cron schema stands in for pg_cron). Entered / cancelled cards older than 12 hours go; the newer ones, the ones still waiting for someone, and a card whose new item's
// box photo is not on its item card yet stay; ONE hourly job however often it is applied; nobody but the job may call it. Made-up rows only.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611231500_ar_invoice_reviews_clean.sql'),'utf8');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA cron; CREATE TABLE cron.job(jobid serial PRIMARY KEY, jobname text, schedule text, command text);
 CREATE FUNCTION cron.schedule(n text, s text, c text) RETURNS bigint LANGUAGE sql AS $$ insert into cron.job(jobname, schedule, command) values (n, s, c) returning jobid $$;
 CREATE FUNCTION cron.unschedule(j integer) RETURNS boolean LANGUAGE sql AS $$ delete from cron.job where jobid = j returning true $$;
 CREATE TABLE public.ar_invoice_reviews(id bigint PRIMARY KEY, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, done_at timestamptz);
 CREATE TABLE public.ar_item_reads(id bigserial PRIMARY KEY, review_id bigint REFERENCES public.ar_invoice_reviews(id) ON DELETE CASCADE, status text NOT NULL);`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const ago=(h)=>`now() - interval '${h} hours'`;
 await db.exec(`INSERT INTO public.ar_invoice_reviews(id, status, created_at, approved_at, done_at) VALUES
  (1, 'entered', ${ago(20)}, ${ago(14)}, ${ago(13)}),   -- entered 13 h ago: goes
  (2, 'entered', ${ago(20)}, ${ago(12)}, ${ago(11)}),   -- entered 11 h ago: stays (12 hours)
  (3, 'cancelled', ${ago(30)}, null, ${ago(13)}),       -- cancelled 13 h ago: goes
  (4, 'cancelled', ${ago(30)}, null, null),             -- cancelled with no done time, made 30 h ago: goes
  (5, 'failed', ${ago(30)}, ${ago(29)}, ${ago(28)}),    -- failed: stays (somebody must look)
  (6, 'ready', ${ago(30)}, null, null),                 -- waiting for his approval: stays
  (7, 'approved', ${ago(30)}, ${ago(29)}, null),        -- approved, not entered yet: stays
  (8, 'entering', ${ago(30)}, ${ago(29)}, null),        -- being entered: stays
  (9, 'entered', ${ago(30)}, ${ago(29)}, ${ago(28)}),   -- entered, but its new item's box photo is not on the card yet: stays
  (10, 'entered', ${ago(30)}, ${ago(29)}, ${ago(28)});  -- entered, its box photo applied: goes, with its reading
  INSERT INTO public.ar_item_reads(review_id, status) VALUES (9, 'done'), (10, 'applied');`);
 const n=(await db.query(`select public.ar_invoice_reviews_clean() n`)).rows[0].n;
 assert.equal(n,4,'four cards go');
 assert.deepEqual((await db.query(`select id from public.ar_invoice_reviews order by id`)).rows.map(r=>Number(r.id)),[2,5,6,7,8,9]);
 assert.deepEqual((await db.query(`select review_id from public.ar_item_reads order by id`)).rows.map(r=>Number(r.review_id)),[9],'the applied reading went with its card; the waiting one stays');
 assert.equal((await db.query(`select public.ar_invoice_reviews_clean() n`)).rows[0].n,0,'nothing more the second time');
 const jobs=(await db.query(`select jobname, schedule, command from cron.job`)).rows;
 assert.deepEqual(jobs.map(j=>[j.jobname,j.schedule]),[['ar-invoice-reviews-clean','7 * * * *']],'one hourly job');
 assert.match(jobs[0].command,/select public\.ar_invoice_reviews_clean\(\);/);
 // only the job (the database itself) calls it: the site's roles cannot
 for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(()=>db.query(`select public.ar_invoice_reviews_clean()`),/permission denied/,role);
  await db.exec(`reset role`);
 }
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate/i);
 console.log('PASS: done invoice cards leave 12 hours after they are done (entered / cancelled), the waiting ones and an unapplied box photo stay, one hourly job, nobody else may call it');
})().catch((e)=>{console.error(e);process.exit(1)});
