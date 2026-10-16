const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const html=fs.readFileSync('asker-nawaqes-test-10.html','utf8');
const source=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];

function app({rpc,duplicate=false,readError=false}={}){
  const elements=new Map(),calls=[];
  function el(id){
    if(!elements.has(id))elements.set(id,{value:'',disabled:false,textContent:'',innerHTML:'',
      classList:{toggle(){}},handlers:{},addEventListener(type,fn){this.handlers[type]=fn}});
    return elements.get(id);
  }
  const client={
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){}},
    from(table){
      const q={};
      for(const method of ['select','eq','order','range','limit','in'])q[method]=()=>q;
      for(const method of ['insert','update','upsert','delete'])q[method]=()=>{
        throw new Error('Unexpected direct write: '+table);
      };
      q.then=(resolve,reject)=>Promise.resolve({
        data:table==='incoming_batches'&&duplicate?[{id:'existing',supplier:'',source_text:'Example | 2'}]:[],
        error:readError?{message:'read denied'}:null
      }).then(resolve,reject);
      return q;
    },
    async rpc(name,args){calls.push({name,args});return rpc?rpc(name,args):{
      data:{batch_id:'new-batch',items:args.p_items.map((x,i)=>({...x,id:String(i)}))},error:null
    }}
  };
  const document={getElementById:el,querySelectorAll:()=>[]};
  vm.runInNewContext(source,{document,window:{supabase:{createClient:()=>client}},
    crypto:webcrypto,TextEncoder,console,setTimeout});
  el('incomingText').value='Example | 2';
  el('receivedOn').value='2026-10-16';
  return {el,calls,click:()=>el('saveIncomingBtn').handlers.click()};
}

test('V10 sends a single atomic RPC with no direct writes',async()=>{
  const a=app();await a.click();
  assert.equal(a.calls.length,1);
  assert.equal(a.calls[0].name,'save_incoming_batch_atomic');
  assert.equal(a.calls[0].args.p_items[0].quantity,2);
  assert.equal(a.calls[0].args.p_items[0].batch_id,undefined);
  assert.match(a.calls[0].args.p_dedupe_key,/^[a-f0-9]{64}$/);
  assert.equal(a.el('incomingText').value,'');
  assert.match(a.el('incomingStatus').textContent,/تم حفظ 1/);
  assert.equal(a.el('saveIncomingBtn').disabled,false);
});
test('failed RPC preserves text and releases button',async()=>{
  const a=app({rpc:async()=>({error:{code:'42501',message:'denied'}})});await a.click();
  assert.equal(a.el('incomingText').value,'Example | 2');
  assert.match(a.el('incomingStatus').textContent,/تعذر تأكيد الحفظ/);
  assert.equal(a.el('saveIncomingBtn').disabled,false);
});
test('missing RPC fails closed without falling back to separate inserts',async()=>{
  const a=app({rpc:async()=>({error:{code:'PGRST202',message:'not installed'}})});await a.click();
  assert.match(a.el('incomingStatus').textContent,/Supabase/);
  assert.equal(a.calls.length,1);assert.equal(a.el('incomingText').value,'Example | 2');
});
test('connection rejection and malformed success both retain the input',async()=>{
  for(const rpc of [async()=>{throw new Error('connection lost')},async()=>({data:{batch_id:'x',items:[]}})]){
    const a=app({rpc});await a.click();
    assert.equal(a.el('incomingText').value,'Example | 2');
    assert.equal(a.el('saveIncomingBtn').disabled,false);
    assert.doesNotMatch(a.el('incomingStatus').textContent,/تم حفظ/);
  }
});
test('known duplicate and failed preflight never call RPC',async()=>{
  for(const options of [{duplicate:true},{readError:true}]){
    const a=app(options);await a.click();assert.equal(a.calls.length,0);
    assert.equal(a.el('incomingText').value,'Example | 2');
    assert.equal(a.el('saveIncomingBtn').disabled,false);
  }
});
test('rapid repeated click cannot submit another request while saving',async()=>{
  let release;
  const a=app({rpc:()=>new Promise(resolve=>{release=resolve})});
  const first=a.click();
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  await a.click();assert.equal(a.calls.length,1);
  release({error:{code:'23505',message:'duplicate'}});await first;
  assert.match(a.el('incomingStatus').textContent,/مسجلة بالفعل/);
  assert.equal(a.el('saveIncomingBtn').disabled,false);
});
