// «المفكرة» (owner 2026-11-15): migration 202611152000 on an in-memory Postgres. The owner adds / ticks his notes; nobody else
// reads or changes them; the laptop's word about the pharmacy network (key, one row, «since» moves only when it flips).
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611152000_ar_notes.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',OTHER='11111111-1111-1111-1111-111111111111';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated; GRANT SELECT, INSERT, UPDATE ON public.ar_notes TO authenticated; GRANT SELECT ON public.ar_presence TO authenticated;`);
 const KEY='ef'.repeat(32);
 await db.query(`insert into public.ar_sync_keys values ($1,null)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const as=async(uid,fn)=>{await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false)`);try{return await fn()}finally{await db.exec(`reset role`)}};
 // the owner: add (default = remind in the pharmacy, open), tick, cancel
 await as(OWNER,()=>db.query(`insert into public.ar_notes(text) values ('اسأل على فاتورة الفتح'),('  ')`).then(()=>assert.fail('a blank note must be refused')).catch((e)=>assert.match(String(e.message),/check|violates/i)));
 await as(OWNER,()=>db.query(`insert into public.ar_notes(text) values ('اسأل على فاتورة الفتح'),('كلم المهندس'),('اتصل بالمحاسب')`));
 assert.deepEqual(await one(`select place,status from public.ar_notes where text='كلم المهندس'`),{place:'pharmacy',status:'open'});
 await as(OWNER,()=>db.query(`update public.ar_notes set status='done', done_at=now() where text='كلم المهندس'`));
 await as(OWNER,()=>db.query(`update public.ar_notes set place='any' where text='اتصل بالمحاسب'`));
 await assert.rejects(()=>as(OWNER,()=>db.query(`update public.ar_notes set status='deleted' where text='اتصل بالمحاسب'`)),/check|violates/i);
 await assert.rejects(()=>as(OWNER,()=>db.query(`insert into public.ar_notes(text,place) values ('x','mars')`)),/check|violates/i);
 assert.deepEqual((await as(OWNER,()=>db.query(`select count(*)::int c from public.ar_notes where status='open'`))).rows[0],{c:2});
 // nobody else reads, adds or changes
 assert.deepEqual((await as(OTHER,()=>db.query(`select count(*)::int c from public.ar_notes`))).rows[0],{c:0},'a stranger reads nothing');
 assert.deepEqual((await as('',()=>db.query(`select count(*)::int c from public.ar_notes`))).rows[0],{c:0});
 await assert.rejects(()=>as(OTHER,()=>db.query(`insert into public.ar_notes(text) values ('x')`)),/row-level security/i);
 await as(OTHER,()=>db.query(`update public.ar_notes set status='cancelled'`));
 assert.equal((await one(`select count(*)::int c from public.ar_notes where status='cancelled'`)).c,0,'a stranger changes nothing');
 // the laptop's word: key needed, one row, «since» moves only when it flips
 await assert.rejects(()=>one(`select public.ar_presence_set($1,true)`,['00'.repeat(32)]),/bad key/);
 await assert.rejects(()=>one(`select public.ar_presence_set($1,true)`,['short']),/bad key/);
 await assert.rejects(()=>one(`select public.ar_presence_set($1,null)`,[KEY]),/required/);
 assert.deepEqual((await one(`select public.ar_presence_set($1,true) r`,[KEY])).r,{ok:true,at_pharmacy:true});
 const s1=await one(`select since, at_pharmacy from public.ar_presence`);
 await db.query(`update public.ar_presence set since = now() - interval '2 hours', checked_at = now() - interval '2 hours'`);
 await one(`select public.ar_presence_set($1,true)`,[KEY]);
 const s2=await one(`select (now()-since) > interval '1 hour' as kept, (now()-checked_at) < interval '1 minute' as fresh from public.ar_presence`);
 assert.deepEqual(s2,{kept:true,fresh:true},'the same word keeps «since» and renews «checked_at»');
 await one(`select public.ar_presence_set($1,false)`,[KEY]);
 assert.deepEqual(await one(`select at_pharmacy, (now()-since) < interval '1 minute' as moved from public.ar_presence`),{at_pharmacy:false,moved:true},'a flip moves «since»');
 assert.equal((await one(`select count(*)::int c from public.ar_presence`)).c,1);
 await assert.rejects(()=>db.query(`insert into public.ar_presence(id,at_pharmacy) values (2,true)`),/check|violates/i);
 assert.deepEqual((await as(OWNER,()=>db.query(`select at_pharmacy from public.ar_presence`))).rows,[{at_pharmacy:false}]);
 assert.deepEqual((await as(OTHER,()=>db.query(`select at_pharmacy from public.ar_presence`))).rows,[],'a stranger does not read the presence');
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate/i);
 assert.doesNotMatch(sql,/using \(auth\.uid\(\)/,'policies use (select auth.uid())');
 assert.doesNotMatch(sql,/ar_staff_can/,'owner only');
 console.log('PASS: notes migration: owner adds / ticks, nobody else reads or changes, the laptop\'s presence word (key, one row, since moves on a flip)');
})().catch((e)=>{console.error(e);process.exit(1)});
