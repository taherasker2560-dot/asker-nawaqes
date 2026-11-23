// Runs without npm (no jsdom): stubs only the DOM pieces gemini-bridge.js touches.
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const ORIGIN='https://asker-inventory-lab.purplebadge24.chatgpt.site';
function setup(opts={}){
 const handlers={},st={opened:'',popup:null,posts:[],compares:[],reads:0},created=[];
 const el={incomingPanel:{querySelector:q=>q==='h2'?{after:(...n)=>created.push(...n)}:null},incomingMode:{value:'availability'},
  incomingImages:{files:opts.files||[]},incomingText:{value:opts.text??'نص المورد الأصلي'},incomingStatus:{textContent:''}};
 global.document={getElementById:id=>el[id],createElement:()=>({addEventListener:(e,f)=>handlers.click=f})};
 global.addEventListener=(t,cb)=>handlers[t]=cb;
 global.open=u=>{st.opened=u;st.popup={postMessage:(m,o)=>st.posts.push({m,o})};return st.popup};
 global.AskerAvailability={compare:opts.compare||(async n=>st.compares.push(n))};
 const file=path.join(__dirname,'..','gemini-bridge.js');delete require.cache[require.resolve(file)];
 require(file).init({readAllRows:opts.readAllRows||(async()=>{st.reads++;return{data:[{id:7,product_name:'BRUFEN 400',quantity_needed:30}],error:null}})});
 const nonce=()=>st.opened.split('#v10=')[1];
 const send=(type,extra={},o={})=>handlers.message({source:o.source??st.popup,origin:o.origin??ORIGIN,data:{type,nonce:o.nonce??nonce(),...extra}});
 return {handlers,st,el,send,restore:created.find(b=>b.id==='restoreBeforeGemini')};
}
const img=(name,size=10)=>({name,size,type:'image/jpeg'});
(async()=>{
 // contract: origin/source/nonce, ids+names only, photos as File objects
 let t=setup({files:Array.from({length:3},(_,i)=>img(i+'.jpg'))});t.handlers.click();assert.match(t.st.opened,/#v10=[a-f0-9]{32}$/);
 await t.send('asker-gemini-ready',{},{origin:'https://evil.example'});await t.send('asker-gemini-ready',{},{source:{}});await t.send('asker-gemini-ready',{},{nonce:'x'});assert.equal(t.st.reads,0);
 await t.send('asker-gemini-ready');assert.equal(t.st.posts.length,1);assert.equal(t.st.posts[0].o,ORIGIN);assert.deepEqual(t.st.posts[0].m.context.rows,[{id:'7',name:'BRUFEN 400'}]);assert.equal(t.st.posts[0].m.photos.length,3);
 await t.send('asker-gemini-ready');assert.equal(t.st.posts.length,1,'context is sent once');
 // 1) oversized image: skipped with its own message, context still sent
 t=setup({files:[img('ok.jpg'),img('big.jpg',9*1024*1024)]});t.handlers.click();await t.send('asker-gemini-ready');
 assert.equal(t.st.posts[0].m.photos.length,1);assert.match(t.el.incomingStatus.textContent,/big\.jpg/);assert.doesNotMatch(t.el.incomingStatus.textContent,/تحديث النواقص/);
 // 7) more than 20 photos: user is told
 t=setup({files:Array.from({length:25},(_,i)=>img(i+'.jpg'))});t.handlers.click();await t.send('asker-gemini-ready');assert.equal(t.st.posts[0].m.photos.length,20);assert.match(t.el.incomingStatus.textContent,/5 صورة زيادة/);
 // database failure: clear message, reader may retry
 let fail=true;t=setup({readAllRows:async()=>fail?{data:null,error:Error('down')}:{data:[{id:1,product_name:'X'}],error:null}});t.handlers.click();await t.send('asker-gemini-ready');assert.equal(t.st.posts.length,0);assert.match(t.el.incomingStatus.textContent,/قاعدة البيانات/);fail=false;await t.send('asker-gemini-ready');assert.equal(t.st.posts.length,1);
 // 5) result before context is ignored
 t=setup();t.handlers.click();await t.send('asker-gemini-result',{names:['PANADOL']});assert.equal(t.st.compares.length,0);assert.match(t.el.incomingStatus.textContent,/قبل ما قائمة النواقص/);
 // 2) one bad name no longer sinks the batch; 3) original text can be restored
 t=setup();t.handlers.click();await t.send('asker-gemini-ready');
 await t.send('asker-gemini-result',{names:[...Array(49)].map((_,i)=>'DRUG '+i).concat(['A','DRUG 1'])});
 assert.equal(t.st.compares.length,1);assert.equal(t.st.compares[0].length,49,'invalid dropped, duplicates merged');assert.match(t.el.incomingStatus.textContent,/اتجاهل 1 اسم/);
 assert.equal(t.restore.hidden,false);t.restore.onclick();assert.equal(t.el.incomingText.value,'نص المورد الأصلي');assert.equal(t.restore.hidden,true);
 // replay after a result is ignored
 await t.send('asker-gemini-result',{names:['LATE']});assert.equal(t.st.compares.length,1);
 // all names invalid / empty: user is told, nothing changes
 t=setup();t.handlers.click();await t.send('asker-gemini-ready');await t.send('asker-gemini-result',{names:['A','x|y']});assert.equal(t.st.compares.length,0);assert.equal(t.el.incomingText.value,'نص المورد الأصلي');assert.match(t.el.incomingStatus.textContent,/مش صالحة/);
 await t.send('asker-gemini-result',{names:[]});assert.match(t.el.incomingStatus.textContent,/فاضية/);
 // 4) text edited then restored: the session is closed, an old result cannot slip in
 t=setup();t.handlers.click();await t.send('asker-gemini-ready');t.el.incomingText.value='edit';await t.send('asker-gemini-result',{names:['OLD1']});
 t.el.incomingText.value='نص المورد الأصلي';await t.send('asker-gemini-result',{names:['OLD2']});assert.equal(t.st.compares.length,0);
 // 6) comparison error is reported, not swallowed
 t=setup({compare:async()=>{throw Error('boom')}});t.handlers.click();await t.send('asker-gemini-ready');await t.send('asker-gemini-result',{names:['PANADOL']});assert.match(t.el.incomingStatus.textContent,/المقارنة فشلت: boom/);
 // receipt mode never opens the reader
 t=setup();t.el.incomingMode.value='receipt';t.handlers.click();assert.equal(t.st.opened,'');
 console.log('PASS: gemini bridge without npm: origin/source/nonce, ids+names only, oversized/extra photos reported, DB failure retry, result-before-context, partial invalid names, restore original text, replay/stale guards, comparison errors reported');
})().catch(e=>{console.error(e);process.exitCode=1});
