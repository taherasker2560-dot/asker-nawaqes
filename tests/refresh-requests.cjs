// «حدّث النواقص دلوقتي» (migration 202611090600): the owner asks, the laptop (its own key) claims and reports.
// Runs the migration on an in-memory Postgres. Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',OTHER='11111111-1111-1111-1111-111111111111';
const KEY='a'.repeat(64),HASH=crypto.createHash('sha256').update(KEY).digest('hex');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, label text, created_by uuid, created_at timestamptz DEFAULT now(), last_used_at timestamptz);
 GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;`);
 await db.query(`INSERT INTO public.ar_sync_keys(key_hash,label) VALUES ($1,'laptop')`,[HASH]);
 const sql=fs.readFileSync('supabase/migrations/202611090600_ar_refresh_requests.sql','utf8');
 await db.exec(sql);
 await db.exec(sql); // safe to apply twice
 await db.exec(`GRANT SELECT, INSERT ON public.ar_refresh_requests TO authenticated; GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;`);
 const as=async(role,uid,q,p)=>{await db.exec(`SET ROLE ${role}; SET test.uid='${uid||''}'`);try{return await db.query(q,p)}finally{await db.exec('RESET ROLE')}};
 const rows=async()=>(await db.query('SELECT id,status,reason,note,started_at,finished_at FROM public.ar_refresh_requests ORDER BY id')).rows;
 const refused=async(fn,re)=>{let e=null;try{await fn()}catch(x){e=x}assert.ok(e,'should have been refused');if(re)assert.match(String(e.message),re)};

 // only the owner reads and adds requests; a request is added «new» and nothing else
 await refused(()=>as('authenticated',OTHER,`INSERT INTO public.ar_refresh_requests(reason) VALUES ('manual')`),/row-level security/);
 assert.equal((await as('authenticated',OTHER,'SELECT * FROM public.ar_refresh_requests')).rows.length,0);
 await refused(()=>as('authenticated',OWNER,`INSERT INTO public.ar_refresh_requests(status) VALUES ('done')`),/row-level security/);
 await refused(()=>as('authenticated',OWNER,`INSERT INTO public.ar_refresh_requests(reason) VALUES ('hack')`),/check/);
 await as('authenticated',OWNER,`INSERT INTO public.ar_refresh_requests(reason) VALUES ('after_purchases')`);
 let r=await rows();assert.equal(r.length,1);assert.equal(r[0].status,'new');assert.equal(r[0].reason,'after_purchases');
 assert.equal((await as('authenticated',OWNER,'SELECT * FROM public.ar_refresh_requests')).rows.length,1,'the owner reads it');
 assert.equal((await as('authenticated',OTHER,'SELECT * FROM public.ar_refresh_requests')).rows.length,0,'nobody else does');
 await refused(()=>as('anon','',`SELECT * FROM public.ar_refresh_requests`),/permission denied/);
 // one open request at a time: a second tap does not queue a second hub run
 await refused(()=>as('authenticated',OWNER,`INSERT INTO public.ar_refresh_requests(reason) VALUES ('manual')`),/duplicate key|unique/);
 // the owner cannot move a request along (no update / delete rights): only the laptop's key can
 await refused(()=>as('authenticated',OWNER,`UPDATE public.ar_refresh_requests SET status='done'`),/permission denied/);

 // the laptop: a wrong key is refused; the right key takes the waiting request once
 await refused(()=>as('anon','',`SELECT public.ar_refresh_claim($1)`,['b'.repeat(64)]),/bad key/);
 await refused(()=>as('anon','',`SELECT public.ar_refresh_claim($1)`,['short']),/bad key/);
 await refused(()=>as('anon','',`SELECT public.ar_refresh_claim(NULL)`),/bad key/);
 const first=(await as('anon','',`SELECT public.ar_refresh_claim($1) AS id`,[KEY])).rows[0].id;
 r=await rows();assert.equal(Number(first),Number(r[0].id));assert.equal(r[0].status,'running');assert.ok(r[0].started_at);
 assert.equal((await as('anon','',`SELECT public.ar_refresh_claim($1) AS id`,[KEY])).rows[0].id,null,'nothing new is waiting');
 assert.ok((await db.query('SELECT last_used_at FROM public.ar_sync_keys')).rows[0].last_used_at,'the key use is noted');
 // a running request still blocks a new one
 await refused(()=>as('authenticated',OWNER,`INSERT INTO public.ar_refresh_requests(reason) VALUES ('manual')`),/duplicate key|unique/);

 // done: wrong key refused, a long note is cut, a request that is not running is left alone
 await refused(()=>as('anon','',`SELECT public.ar_refresh_done($1,$2,true,'x')`,['b'.repeat(64),first]),/bad key/);
 await as('anon','',`SELECT public.ar_refresh_done($1,$2,true,$3)`,[KEY,first,'ok '+'x'.repeat(600)]);
 r=await rows();assert.equal(r[0].status,'done');assert.ok(r[0].finished_at);assert.equal(r[0].note.length,500);
 await as('anon','',`SELECT public.ar_refresh_done($1,$2,false,'later')`,[KEY,first]);
 assert.equal((await rows())[0].status,'done','a finished request does not change again');
 await as('anon','',`SELECT public.ar_refresh_done($1,$2,true,NULL)`,[KEY,99999]);

 // a failed run is recorded as failed, and a new request can be added right after
 await as('authenticated',OWNER,`INSERT INTO public.ar_refresh_requests(reason) VALUES ('manual')`);
 const second=(await as('anon','',`SELECT public.ar_refresh_claim($1) AS id`,[KEY])).rows[0].id;
 await as('anon','',`SELECT public.ar_refresh_done($1,$2,false,$3)`,[KEY,second,'  share unreachable  ']);
 r=await rows();assert.equal(r[1].status,'failed');assert.equal(r[1].note,'share unreachable');

 // the laptop died while running: after 60 minutes the next call marks it failed and the owner can ask again
 await as('authenticated',OWNER,`INSERT INTO public.ar_refresh_requests(reason) VALUES ('after_order')`);
 const third=(await as('anon','',`SELECT public.ar_refresh_claim($1) AS id`,[KEY])).rows[0].id;
 await db.query(`UPDATE public.ar_refresh_requests SET started_at = now() - interval '61 minutes' WHERE id=$1`,[third]);
 assert.equal((await as('anon','',`SELECT public.ar_refresh_claim($1) AS id`,[KEY])).rows[0].id,null);
 r=await rows();assert.equal(r[2].status,'failed');assert.match(r[2].note,/timeout/);
 await as('authenticated',OWNER,`INSERT INTO public.ar_refresh_requests(reason) VALUES ('manual')`);
 assert.equal((await rows()).length,4);
 console.log('refresh-requests ok');
})().catch(e=>{console.error(e);process.exit(1)});
