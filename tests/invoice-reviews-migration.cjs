// «🧾 مراجعة الفواتير» (owner 2026-11-21): migration 202611212000 on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package).
// Who reads and answers (the owner only), what he can and cannot write (answers, a note, ready/approved/held; never a result or the laptop's states), an approval needs an answer for every note,
// the laptop's three calls (the key, publish = new / refresh keeping the answers still valid / left alone when approved, poll in entry order, mark with its allowed steps), and that a stranger,
// staff and anon see nothing. Made-up suppliers and invoice numbers only: the repository is public.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611212000_ar_invoice_reviews.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',SHOP='22222222-2222-2222-2222-222222222222';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE TABLE public.ar_sync_keys(key_hash text PRIMARY KEY, last_used_at timestamptz);`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;`);
 const KEY='ab'.repeat(32);
 await db.query(`insert into public.ar_sync_keys values ($1,null)`,[crypto.createHash('sha256').update(KEY).digest('hex')]);
 const as=async(uid,role,q,p=[])=>{await db.exec(`set role ${role}; select set_config('test.uid','${uid}',false)`);try{return (await db.query(q,p)).rows}finally{await db.exec(`reset role`)}};
 const owner=(q,p)=>as(OWNER,'authenticated',q,p), shop=(q,p)=>as(SHOP,'authenticated',q,p);
 const pub=(row,key=KEY)=>db.query(`select public.ar_invoice_review_publish($1,$2::jsonb) r`,[key,JSON.stringify(row)]).then(x=>x.rows[0].r);
 const poll=(st,key=KEY)=>db.query(st?`select public.ar_invoice_review_poll($1,$2::text[]) r`:`select public.ar_invoice_review_poll($1) r`,st?[key,st]:[key]).then(x=>x.rows[0].r);
 const mark=(id,st,res,key=KEY)=>db.query(`select public.ar_invoice_review_mark($1,$2,$3,$4::jsonb) r`,[key,id,st,res==null?null:JSON.stringify(res)]).then(x=>x.rows[0].r);
 const LINES=[{n:1,paper:'دوا مثال',qty:2,disc:25,exp:'082029',id:101,name:'EXAMPLE 10MG 20 TAB',total:150}];
 const NOTES=[{id:'n1',line:1,text:'مالوش كارت',mine:'هعمله من الصورة',alts:[{k:'a',t:'اسم تاني'}]},{id:'n2',line:null,text:'ورقة مقلوبة',mine:'لفّيتها',alts:[]}];
 const A={batch:'2026-11-21',ord:2,supplier:'مورد مثال',doc_no:'900002',paper_date:'2026-11-20',total:150,photos:[{p:'docs/2026-11-21/x.jpg',rot:180}],lines:LINES,notes:NOTES};
 const B={batch:'2026-11-21',ord:1,supplier:'مورد تاني',doc_no:'900001',paper_date:'2026-11-20',total:75.5,photos:[],lines:LINES,notes:[]};

 // the laptop publishes: the key first, then a new row is «ready»; the same invoice again is a refresh (same id)
 await assert.rejects(()=>pub(A,'cd'.repeat(32)),/bad key/);await assert.rejects(()=>pub(A,'nope'),/bad key/);
 let r=await pub(A);assert.deepEqual([r.ok,r.status,r.created],[true,'ready',true]);const idA=r.id;
 r=await pub(B);assert.equal(r.created,true);const idB=r.id;
 await assert.rejects(()=>pub({...A,batch:'bad'}),/check constraint/);await assert.rejects(()=>pub({...A,doc_no:'900003',lines:'x'}),/violates|null value|check constraint/);
 r=await pub({...A,total:151});assert.deepEqual([r.ok,r.id,r.created],[true,idA,false],'the same invoice is refreshed, not doubled');
 assert.equal((await owner(`select count(*)::int c from public.ar_invoice_reviews`))[0].c,2);

 // who reads: the owner only
 assert.deepEqual((await owner(`select doc_no, ord, status, total::float t from public.ar_invoice_reviews order by ord`)).map(x=>[x.doc_no,x.ord,x.status,x.t]),[['900001',1,'ready',75.5],['900002',2,'ready',151]]);
 assert.deepEqual(await shop(`select * from public.ar_invoice_reviews`),[],'staff see nothing');
 assert.deepEqual(await as('','authenticated',`select * from public.ar_invoice_reviews`),[],'a stranger sees nothing');
 await assert.rejects(()=>as('','anon',`select * from public.ar_invoice_reviews`),/permission denied/);

 // what he can write: answers, a note, and the three states; not the content, not the laptop's states, not the result
 await assert.rejects(()=>owner(`update public.ar_invoice_reviews set total = 1 where id = $1`,[idA]),/permission denied/,'the lines and total are the laptop\'s');
 await assert.rejects(()=>owner(`update public.ar_invoice_reviews set notes = '[]' where id = $1`,[idA]),/permission denied/);
 await assert.rejects(()=>owner(`update public.ar_invoice_reviews set result = '{}' where id = $1`,[idA]),/permission denied/);
 await assert.rejects(()=>owner(`update public.ar_invoice_reviews set status = 'entered' where id = $1`,[idA]),/row-level security|violates/,'he cannot say it was entered');
 await assert.rejects(()=>owner(`update public.ar_invoice_reviews set status = 'entering' where id = $1`,[idA]),/row-level security|violates/);
 await assert.rejects(()=>shop(`update public.ar_invoice_reviews set status = 'approved' where id = $1`,[idA]).then(x=>{if(!x.length)throw new Error('row-level security: nothing updated')}),/row-level security/,'staff cannot approve');
 await assert.rejects(()=>as('','anon',`update public.ar_invoice_reviews set status = 'approved'`),/permission denied/);
 // an approval needs an answer for every note (B has none: approved at once; A has two)
 await owner(`update public.ar_invoice_reviews set status = 'approved' where id = $1`,[idB]);
 await assert.rejects(()=>owner(`update public.ar_invoice_reviews set status = 'approved' where id = $1`,[idA]),/unanswered note n1/);
 await owner(`update public.ar_invoice_reviews set answers = $1::jsonb, owner_note = 'اكتب الاسم بالإنجليزي' where id = $2`,[JSON.stringify({n1:{v:'alt',k:'a',t:'اسم تاني'}}),idA]);
 await assert.rejects(()=>owner(`update public.ar_invoice_reviews set status = 'approved' where id = $1`,[idA]),/unanswered note n2/,'one note still open');
 await owner(`update public.ar_invoice_reviews set answers = answers || $1::jsonb where id = $2`,[JSON.stringify({n2:{v:'ok'}}),idA]);
 await assert.rejects(()=>owner(`update public.ar_invoice_reviews set answers = $1::jsonb where id = $2`,['"text"',idA]),/check constraint/,'answers stay an object');
 await owner(`update public.ar_invoice_reviews set status = 'approved' where id = $1`,[idA]);
 const ap=await owner(`select status, approved_at is not null as stamped, owner_note from public.ar_invoice_reviews where id = $1`,[idA]);
 assert.deepEqual([ap[0].status,ap[0].stamped,ap[0].owner_note],['approved',true,'اكتب الاسم بالإنجليزي']);
 // he can take an approval back before the laptop starts, and hold one
 await owner(`update public.ar_invoice_reviews set status = 'ready' where id = $1`,[idB]);
 await owner(`update public.ar_invoice_reviews set status = 'held' where id = $1`,[idB]);
 await owner(`update public.ar_invoice_reviews set status = 'approved' where id = $1`,[idB]);

 // the laptop polls: approved ones in entry order (B = 1, A = 2), with the answers; another state on request; nothing changes by asking
 let p=await poll();assert.equal(p.ok,true);
 assert.deepEqual(p.rows.map(x=>[x.ord,x.doc_no,x.status]),[[1,'900001','approved'],[2,'900002','approved']]);
 assert.deepEqual(p.rows[1].answers,{n1:{v:'alt',k:'a',t:'اسم تاني'},n2:{v:'ok'}});assert.equal(p.rows[1].owner_note,'اكتب الاسم بالإنجليزي');assert.equal(p.rows[1].lines[0].id,101);
 assert.deepEqual((await poll(['ready','held'])).rows,[],'none waiting');
 await assert.rejects(()=>poll(null,'cd'.repeat(32)),/bad key/);
 // an approved invoice is not touched by a new publish; a ready one is refreshed keeping the answers of notes that still exist
 r=await pub({...A,total:999});assert.deepEqual([r.ok,r.status],[false,'approved'],'approved: left alone');
 assert.equal((await owner(`select total::float t from public.ar_invoice_reviews where id = $1`,[idA]))[0].t,151);
 await owner(`update public.ar_invoice_reviews set status = 'held' where id = $1`,[idA]);
 r=await pub({...A,total:152,notes:[NOTES[0],{id:'n3',line:2,text:'سعر مختلف',mine:'هغيّره',alts:[]}]});assert.deepEqual([r.ok,r.status],[true,'ready'],'held goes back to ready with the new content');
 const re=await owner(`select total::float t, answers, jsonb_array_length(notes) n from public.ar_invoice_reviews where id = $1`,[idA]);
 assert.deepEqual([re[0].t,re[0].n,re[0].answers],[152,2,{n1:{v:'alt',k:'a',t:'اسم تاني'}}],'the answer to n1 stays, n2 (gone) is dropped');

 // the laptop marks: approved -> entering -> entered (with its check); only the allowed steps
 await assert.rejects(()=>mark(idB,'approved'),/bad status/);await assert.rejects(()=>mark(idB,'entered',[1]),/result must be an object/);await assert.rejects(()=>mark(idB,'entering',null,'cd'.repeat(32)),/bad key/);
 assert.deepEqual(await mark(idA,'entering'),{ok:false},'A is ready again: it cannot start');
 assert.deepEqual(await mark(idB,'entering'),{ok:true});
 assert.deepEqual(await mark(idB,'entering'),{ok:false},'already started');
 assert.deepEqual(await mark(idB,'entered',{msg:'اتدخلت',total:75.5,checked:'صفر فروق'}),{ok:true});
 const en=await owner(`select status, result, started_at is not null as s, done_at is not null as d from public.ar_invoice_reviews where id = $1`,[idB]);
 assert.deepEqual([en[0].status,en[0].result.checked,en[0].s,en[0].d],['entered','صفر فروق',true,true]);
 assert.deepEqual(await mark(idB,'cancelled'),{ok:false},'a finished one is not cancelled');
 assert.deepEqual(await mark(idA,'cancelled'),{ok:true},'a waiting one can be');
 // after the laptop took it, he cannot change it any more
 await assert.rejects(()=>owner(`update public.ar_invoice_reviews set status = 'ready' where id = $1`,[idB]).then(x=>{if(!x.length)throw new Error('row-level security: nothing updated')}),/row-level security/);
 const fin=await owner(`update public.ar_invoice_reviews set owner_note = 'x' where id = $1 returning id`,[idB]);assert.deepEqual(fin,[],'a finished row is not his to edit');
 // old finished rows go
 await db.exec(`update public.ar_invoice_reviews set created_at = now() - interval '61 days' where id = ${idB}`);
 await mark(idA,'failed',{msg:'x'});
 assert.deepEqual((await owner(`select id::int i from public.ar_invoice_reviews order by id`)).map(x=>x.i),[Number(idA)],'the 61-day-old finished row went');

 // anon cannot call the key check directly
 await assert.rejects(()=>as('','anon',`select public.ar_invoice_review_auth($1)`,[KEY]),/permission denied/);
 console.log('PASS: invoice reviews migration');
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
