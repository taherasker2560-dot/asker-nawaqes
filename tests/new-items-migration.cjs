// «أصناف جديدة» (owner 2026-11-15): migration 202611152100 on an in-memory Postgres. The owner adds / changes; one row per English
// name key; a price is optional but never negative; nobody else reads or changes.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611152100_ar_new_items.sql'),'utf8');
const sql2=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611152400_ar_new_items_approved.sql'),'utf8');
const OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',OTHER='11111111-1111-1111-1111-111111111111';
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 await db.exec(sql2);await db.exec(sql2);
 await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated; GRANT SELECT, INSERT, UPDATE ON public.ar_new_items TO authenticated;`);
 const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const as=async(uid,fn)=>{await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false)`);try{return await fn()}finally{await db.exec(`reset role`)}};
 await as(OWNER,()=>db.query(`insert into public.ar_new_items(name_key,name_en,price) values ('ZETAPRO 5MG SYRUP','Zetapro 5mg syrup',85.5),('NEWDRUG 10MG','Newdrug 10mg',null)`));
 assert.deepEqual(await one(`select status, price::float p, arrived_at from public.ar_new_items where name_key='ZETAPRO 5MG SYRUP'`),{status:'new',p:85.5,arrived_at:null});
 assert.equal((await one(`select price from public.ar_new_items where name_key='NEWDRUG 10MG'`)).price,null,'a price is optional');
 // one row per English name; bad rows are refused
 await assert.rejects(()=>as(OWNER,()=>db.query(`insert into public.ar_new_items(name_key,name_en) values ('ZETAPRO 5MG SYRUP','again')`)),/duplicate|unique/i);
 await assert.rejects(()=>as(OWNER,()=>db.query(`insert into public.ar_new_items(name_key,name_en,price) values ('X1','x1',-5)`)),/check|violates/i);
 await assert.rejects(()=>as(OWNER,()=>db.query(`insert into public.ar_new_items(name_key,name_en) values ('A','A')`)),/check|violates/i);
 await assert.rejects(()=>as(OWNER,()=>db.query(`insert into public.ar_new_items(name_key,name_en,status) values ('X2','x2','lost')`)),/check|violates/i);
 // it moves new -> ordered -> arrived
 await as(OWNER,()=>db.query(`update public.ar_new_items set status='ordered', updated_at=now() where name_key='NEWDRUG 10MG'`));
 await as(OWNER,()=>db.query(`update public.ar_new_items set status='arrived', arrived_at=now() where name_key='NEWDRUG 10MG'`));
 assert.equal((await one(`select count(*)::int c from public.ar_new_items where status='arrived' and arrived_at is not null`)).c,1);
 // nobody else reads, adds or changes
 assert.deepEqual((await as(OTHER,()=>db.query(`select count(*)::int c from public.ar_new_items`))).rows[0],{c:0});
 assert.deepEqual((await as('',()=>db.query(`select count(*)::int c from public.ar_new_items`))).rows[0],{c:0});
 await assert.rejects(()=>as(OTHER,()=>db.query(`insert into public.ar_new_items(name_key,name_en) values ('HACK','hack')`)),/row-level security/i);
 await as(OTHER,()=>db.query(`update public.ar_new_items set status='cancelled'`));
 assert.equal((await one(`select count(*)::int c from public.ar_new_items where status='cancelled'`)).c,0,'a stranger changes nothing');
 // «موافق» (2026-11-15, migration 202611152400): approved, a quantity, the form worked out from the name, the PharmaFly item once the invoice made it real
 await as(OWNER,()=>db.query(`update public.ar_new_items set status='approved', approved_at=now(), qty=3, form='كريم' where name_key='ZETAPRO 5MG SYRUP'`));
 assert.deepEqual(await one(`select status, qty, form from public.ar_new_items where name_key='ZETAPRO 5MG SYRUP'`),{status:'approved',qty:3,form:'كريم'});
 await as(OWNER,()=>db.query(`update public.ar_new_items set status='arrived', item_id=70455, arrived_at=now() where name_key='ZETAPRO 5MG SYRUP'`));
 assert.equal(Number((await one(`select item_id from public.ar_new_items where name_key='ZETAPRO 5MG SYRUP'`)).item_id),70455);
 for(const bad of [`qty=0`,`qty=100001`,`item_id=0`,`status='lost'`,`form='${'x'.repeat(31)}'`])await assert.rejects(()=>as(OWNER,()=>db.query(`update public.ar_new_items set ${bad} where name_key='NEWDRUG 10MG'`)),/check|violates/i);
 await as(OTHER,()=>db.query(`update public.ar_new_items set status='approved'`));
 assert.equal((await one(`select count(*)::int c from public.ar_new_items where status='approved'`)).c,0,'a stranger approves nothing');
 assert.doesNotMatch(sql2.replace(/--.*$/gm,''),/drop table|truncate/i);
 assert.doesNotMatch(sql.replace(/--.*$/gm,''),/drop table|truncate/i);
 assert.doesNotMatch(sql,/using \(auth\.uid\(\)/,'policies use (select auth.uid())');
 console.log('PASS: new items migration: owner adds / moves, one row per English name, optional non-negative price, nobody else');
})().catch((e)=>{console.error(e);process.exit(1)});
