// ar/cache.js «limited» (2026-11-13: the search waited a quarter of an hour on his phone): a server read that never
// answers is cut after its time limit and tried once more; an answer that comes is passed through as it is.
const assert=require('node:assert/strict');
require('../ar/cache.js');
const {limited}=globalThis.AskerCache;
(async()=>{
 // a query object like supabase-js: .abortSignal(signal) gives a promise of {data,error}
 const q=(behave)=>({abortSignal(sig){return new Promise((ok)=>{if(behave==='hang'){sig.addEventListener('abort',()=>ok({data:null,error:{name:'AbortError',message:'AbortError: signal is aborted without reason'}}));}else ok({data:[1,2],error:null});});}});
 let n=0;
 const r1=await limited(()=>{n++;return q(n===1?'hang':'ok');},50);
 assert.deepEqual(r1.data,[1,2],'the second try answers');assert.equal(n,2);
 let m=0;
 const r2=await limited(()=>{m++;return q('hang');},30);
 assert.ok(r2.error,'two hangs: an error, not a wait forever');assert.equal(m,2);
 const r3=await limited(()=>q('ok'),50);assert.deepEqual(r3.data,[1,2]);
 // no abortSignal (an old client): the query as it is
 const r4=await limited(()=>Promise.resolve({data:'x',error:null}),50);assert.equal(r4.data,'x');
 console.log('PASS: cache limited: a hung read is cut and tried once more');
})().catch((e)=>{console.error(e);process.exit(1);});
