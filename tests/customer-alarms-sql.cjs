// Migration 202611180100 (owner 2026-11-18: «لو هو مش عارف يظبط المنبه هظبطه له أنا من عندي»), run for real on an in-memory Postgres (PGLITE_MODULE may point to an installed @electric-sql/pglite package):
// the owner (and staff with «العملاء») set a customer's alarms by his link secret, the customer's page reads only HIS, the list is cleaned in one place, nobody else can write.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 const T1='1'.repeat(64),T2='2'.repeat(64),OWNER='ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c',STAFF='00000000-0000-4000-8000-0000000000c1',STRANGER='00000000-0000-4000-8000-0000000000ff';
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
 CREATE FUNCTION public.ar_staff_can(p text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('app.uid', true) = '${STAFF}' AND 'customers' = ANY (p) $$;
 CREATE TABLE public.ar_customer_links(customer_id bigint PRIMARY KEY, token text NOT NULL UNIQUE);
 INSERT INTO public.ar_customer_links VALUES (101,'${T1}'),(102,'${T2}');`);
 const sql=fs.readFileSync('supabase/migrations/202611180100_ar_customer_alarms.sql','utf8');
 await db.exec(sql);await db.exec(sql); // applied twice: safe
 const as=async(uid)=>db.exec(`SELECT set_config('app.uid','${uid||''}',false)`);
 const q=async(text,p)=>(await db.query(text,p)).rows;
 const set=async(tok,items)=>(await q(`SELECT public.ar_customer_alarms_admin_set($1,$2::jsonb) AS r`,[tok,JSON.stringify(items)]))[0].r;
 const get=async(tok)=>(await q(`SELECT public.ar_customer_alarms_admin_get($1) AS r`,[tok]))[0].r;
 const view=async(tok)=>(await q(`SELECT public.ar_customer_alarms_view($1) AS r`,[tok]))[0].r;
 const A=(id,name,times,o={})=>({id,name,say:'',times,on:true,...o});

 // the owner sets alarms; a messy list is cleaned in one place
 await as(OWNER);
 let r=await set(T1,[A('p1','زانبرازان ٢٠ قرص',['20:00','08:00','8:00','25:00','08:00'],{say:'زانبرازان'}),A('p2','  ايزابريل  ',['09:00'],{on:false}),A('bad id!','x',['08:00']),A('p3','',['08:00']),A('p4','بدون ميعاد',['xx']),'not an object',null]);
 assert.equal(r.ok,true);
 assert.deepEqual(r.items,[{id:'p1',name:'زانبرازان ٢٠ قرص',say:'زانبرازان',times:['08:00','20:00'],on:true},{id:'p2',name:'ايزابريل',say:'',times:['09:00'],on:false}],'valid ones only, sorted times, no duplicates, trimmed');
 assert.deepEqual((await get(T1)).items,r.items);
 // at most 20 alarms, names cut at 80
 r=await set(T1,Array.from({length:30},(_,i)=>A('q'+i,'n'+i+'x'.repeat(100),['08:00'])));
 assert.equal(r.items.length,20);assert.equal(r.items[0].name.length,80);
 await set(T1,[A('p1','زانبرازان ٢٠ قرص',['20:00','08:00'])]);

 // the customer's page: only his own rows, by his secret; a stranger's secret or no secret gets nothing
 await as(null);
 let v=await view(T1);assert.equal(v.ok,true);assert.deepEqual(v.items.map(x=>x.id),['p1']);assert.ok(v.at);
 v=await view(T2);assert.deepEqual(v,{ok:true,items:[],at:null},'another customer has none: never the first one\'s');
 assert.equal((await view('f'.repeat(64))).error,'link');assert.equal((await view(null)).error,'link');assert.equal((await view('short')).error,'link');
 assert.deepEqual(Object.keys(v).sort(),['at','items','ok']);

 // who may write: the owner and staff with «العملاء»; a stranger, a visitor and a customer cannot even read the admin function
 await as(STAFF);assert.equal((await set(T2,[A('s1','دوا',['10:00'])])).ok,true);assert.equal((await get(T2)).items[0].id,'s1');
 await as(STRANGER);
 await assert.rejects(()=>set(T1,[A('x','x',['08:00'])]),/owner or staff only/);await assert.rejects(()=>get(T1),/owner or staff only/);
 await as(null);
 await assert.rejects(()=>set(T1,[A('x','x',['08:00'])]),/owner or staff only/,'a visitor has no uid');
 assert.deepEqual((await view(T1)).items.map(x=>x.id),['p1'],'nothing changed by the refused calls');
 // a wrong secret gets a clean answer for the owner; an empty list removes the row
 await as(OWNER);
 assert.equal((await set('f'.repeat(64),[A('a','a',['08:00'])])).error,'link');assert.equal((await get(null)).error,'link');
 assert.deepEqual(await set(T1,[]),{ok:true,items:[]});assert.equal((await q(`SELECT count(*)::int n FROM public.ar_customer_alarms WHERE customer_id=101`))[0].n,0);
 assert.deepEqual((await set(T1,'nonsense')).items,[],'a list that is not a list is an empty one');

 // grants: the customer's page (visitors and the signed-in) reads; only the signed-in may call the admin ones; nothing is public; the table is closed
 const can=async(role,fn)=>(await q(`SELECT has_function_privilege('${role}','${fn}','execute') AS ok`))[0].ok;
 assert.equal(await can('anon','public.ar_customer_alarms_view(text)'),true);assert.equal(await can('public','public.ar_customer_alarms_view(text)'),false);
 for(const fn of ['public.ar_customer_alarms_admin_get(text)','public.ar_customer_alarms_admin_set(text,jsonb)']){assert.equal(await can('authenticated',fn),true);assert.equal(await can('anon',fn),false);assert.equal(await can('public',fn),false)}
 for(const role of ['anon','authenticated'])assert.equal((await q(`SELECT has_table_privilege('${role}','public.ar_customer_alarms','select') AS ok`))[0].ok,false,role+' cannot read the table');
 assert.equal((await q(`SELECT relrowsecurity FROM pg_class WHERE oid='public.ar_customer_alarms'::regclass`))[0].relrowsecurity,true);
 console.log('customer-alarms-sql ok');
})().catch(e=>{console.error(e);process.exit(1)});
