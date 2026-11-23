const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const html=fs.readFileSync('asker-nawaqes-test-10.html','utf8');new Function(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
const functions=html.slice(html.indexOf('async function readAllRows('),html.indexOf("$('backupBtn').addEventListener"));
function setup(count,{failAt=-1,throwAt=-1}={}){
 const calls=[];const source=Array.from({length:count},(_,i)=>({id:i,is_active:true}));
 const client={from(table){const call={table};calls.push(call);return {select(value){call.select=value;return this},eq(key,value){call.filter=[key,value];return this},order(key,options){call.order=[key,options];return this},async range(from,to){call.range=[from,to];if(from===throwAt)throw Error('network');if(from===failAt)return {data:null,error:{message:'page failed'}};return {data:source.slice(from,to+1),error:null}}}}};
 const ctx=vm.createContext({client});vm.runInContext(functions+';globalThis.read=readAllRows;globalThis.backup=fetchAll;',ctx);return {ctx,calls};
}
(async()=>{
 for(const count of [0,999,1000,2000,2126]){const {ctx,calls}=setup(count);const r=await ctx.read('shortage_items',q=>q.eq('is_active',true));assert.equal(r.error,null);assert.equal(r.data.length,count);assert.equal(new Set(r.data.map(x=>x.id)).size,count);assert.equal(calls.length,Math.floor(count/1000)+1);for(const c of calls){assert.equal(c.order[0],'id');assert.equal(c.filter[0],'is_active')}}
 for(const opts of [{failAt:1000},{throwAt:1000}]){const {ctx}=setup(2126,opts);const r=await ctx.read('shortage_items');assert.equal(r.data,null);assert.ok(r.error);await assert.rejects(ctx.backup('shortage_items'))}
 const {ctx}=setup(2126);assert.equal((await ctx.backup('shortage_items')).length,2126);
 assert.ok(html.includes("if(await renderShortages()===false)return null"));
 console.log('PASS: reads of 0/999/1000/2000/2126 rows, stable pagination, active filter, no partial result on later page or network failure, complete backup and JS syntax');
})().catch(e=>{console.error(e);process.exitCode=1});
