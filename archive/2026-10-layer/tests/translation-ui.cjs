/* DOM interaction test. Run with jsdom on NODE_PATH. No real service requests. */
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'asker-nawaqes-test-10.html'),'utf8');
const dom=new JSDOM(html,{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
let writes=0,requests=0;const rows=[{id:'one',product_name:'GLUCOPHAGE 500MG 30TAB',quantity_needed:1,is_active:true},{id:'two',product_name:'GLUCOPHAGE 1000MG 30TAB',quantity_needed:1,is_active:true}];
w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{}}}),onAuthStateChange:()=>{}},from:table=>{requests++;let active;const q=new Proxy({},{get:(t,k)=>k==='then'?resolve=>resolve({data:table==='shortage_items'?rows:[],error:null}):(...a)=>{if(['insert','update','delete','upsert'].includes(k)){writes++;throw Error('Unexpected write')}return q}});return q},rpc:()=>{writes++;throw Error('Unexpected RPC')}})};
w.confirm=()=>true;w.alert=()=>{};w.URL.createObjectURL=()=> 'blob:local';w.URL.revokeObjectURL=()=>{};
for(const f of ['file-import.js','incoming-images.js','name-translation.js','availability.js','gemini-bridge.js'])w.eval(fs.readFileSync(path.join(root,f),'utf8'));
w.eval(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
const $=id=>w.document.getElementById(id),tick=()=>new Promise(r=>setTimeout(r,0));
(async()=>{await tick();$('incomingText').value='جلوكوفاج ٥٠٠ اقراص';$('saveIncomingBtn').click();await tick();
assert.match($('availabilityResults').textContent,/GLUCOPHAGE 500MG 30TAB/);assert.doesNotMatch($('availabilityResults').textContent,/GLUCOPHAGE 1000MG 30TAB/);
assert.match($('availabilityResults').textContent,/تحتاج اختيارك: 1/);assert.match($('availabilityResults').textContent,/بالنواقص: 0/);
const choose=w.document.querySelector('[data-translation-choice]');choose.click();assert.match(w.document.querySelector('[data-translation-selection]').textContent,/اخترت لهذه المقارنة/);assert.equal(choose.disabled,true);
w.document.querySelector('[data-translation-undo]').click();assert.equal(choose.disabled,false);assert.equal(w.document.querySelector('[data-translation-selection]').textContent,'');
choose.click();$('incomingText').value='جلوكوفاج 1000 اقراص';$('incomingText').dispatchEvent(new w.Event('input'));assert.equal($('availabilityResults').textContent,'');assert.equal(writes,0);
$('saveIncomingBtn').click();await tick();assert.match($('availabilityResults').textContent,/GLUCOPHAGE 1000MG 30TAB/);
$('incomingMode').value='receipt';$('incomingMode').dispatchEvent(new w.Event('change'));assert.equal($('availabilityResults').textContent,'');
assert.equal(writes,0);console.log('PASS: actual V10 DOM scripts, translation suggestions separate from exact matches, choice/undo/edit/mode invalidation, default OCR unchanged, zero writes');dom.window.close();})().catch(e=>{dom.window.close();console.error(e);process.exitCode=1});
