// «🎤» voice typing (owner 2026-11-22: «زرار لمايك، بحيث ان انا اقول له على الحاجه بدل ما اكتبها وهو يكتبها … وشوف ايه اللي محتاج الحاجات ديت واعمله منك لنفسك»; ar/voice.js).
// The phone's speech recognition is played here: it hears words while he speaks (the box shows them), then the final sentence; the words are ADDED to the box, the button shows it is
// listening, and the box's own send / save does the rest: the robot's answer box (+ its «ابعت»), the bill's note, and an invoice note's own words (saved when the box changes).
// Made-up reports, bills and words only.
const {run,assert}=require('./harness.cjs');
// a fake recognizer: start() says the words given in window.__say (interim first, then final), then ends
const fakeMic=(page)=>page.evaluate(()=>{
 window.__started=0;
 window.SpeechRecognition=window.webkitSpeechRecognition=function(){const me=this;this.start=()=>{window.__started++;const w=(window.__say||'').split(' ');setTimeout(()=>{me.onresult&&me.onresult({results:[Object.assign([{transcript:w.slice(0,1).join(' ')}],{isFinal:false})]})},60);
  setTimeout(()=>{window.__listening=document.querySelector('.vo-mic.rec')?.dataset.voice||'';me.onresult&&me.onresult({results:[Object.assign([{transcript:w.join(' ')}],{isFinal:true})]})},160);setTimeout(()=>{me.onend&&me.onend()},260)};this.stop=()=>{}};
});

run('Voice: the robot\'s answer box, the bill note and an invoice note take spoken words',async({page})=>{
 await page.evaluate(()=>{
  window.__tables.ar_stock=[];window.__tables.ar_customers=[];window.__tables.ar_temp_sales=[];
  window.__tables.ar_robot_reports=[{id:8,created_at:new Date().toISOString(),job:'sales',ref_id:'x2',title:'صنف مش لاقيه: كود 99999',details:null,options:[],status:'open'}];
  window.__answers=[];
  window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{ar_robot_answer:(a)=>{window.__answers.push(a);const r=window.__tables.ar_robot_reports.find(x=>x.id===a.p_id);r.status='answered';return {ok:true}}});
 });
 await fakeMic(page);
 // the robot's question: «🎤» between his words and «ابعت»; the spoken words land in the box, then «ابعت» sends them
 await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');
 await page.waitForSelector('#rbBox:not(.hidden) [data-rb="8"] .vo-mic');
 await page.fill('#rbBox [data-rb="8"] [data-rb-text]','سيبها');
 await page.evaluate(()=>{window.__say='كمل ودخلها بسعر الورقة'});
 await page.click('#rbBox [data-rb="8"] .vo-mic');
 await page.waitForFunction(()=>document.querySelector('#rbBox [data-rb="8"] [data-rb-text]').value==='سيبها كمل ودخلها بسعر الورقة');
 assert.equal(await page.evaluate(()=>window.__listening),'[data-rb="8"] [data-rb-text]','the button showed it was listening to that box');
 await page.waitForFunction(()=>!document.querySelector('.vo-mic.rec'));
 assert.equal(await page.evaluate(()=>window.__answers.length),0,'nothing is sent by the microphone itself');
 await page.click('#rbBox [data-rb="8"] [data-rb-send]');
 await page.waitForFunction(()=>window.__answers.length===1);
 assert.equal(await page.evaluate(()=>window.__answers[0].p_text),'سيبها كمل ودخلها بسعر الورقة');
 // the bill's note
 assert.ok(await page.$('#tsNote + .vo-mic'),'the note has its microphone');
 await page.evaluate(()=>{window.__say='العميل هيرجع بكره'});
 await page.click('#tsNote + .vo-mic');
 await page.waitForFunction(()=>document.getElementById('tsNote').value==='العميل هيرجع بكره');
 // no speech recognition in the browser: said, nothing breaks
 await page.evaluate(()=>{delete window.webkitSpeechRecognition;delete window.SpeechRecognition});
 await page.click('#tsNote + .vo-mic');
 await page.waitForFunction(()=>/الميكروفون مش متاح/.test(document.getElementById('voToast')?.textContent||''));
});

run('Voice: an invoice note\'s own words, said, are saved like typed ones',async({page})=>{
 await page.evaluate(()=>{
  window.__tables.ar_invoice_reviews=[{id:31,batch:'2026-11-22',ord:1,supplier:'مورد مثال',doc_no:'888001',paper_date:'2026-11-22',total:100,photos:[],
   lines:[{n:1,paper:'دوا مثال',qty:1,disc:20,exp:'082029',id:101,name:'EXAMPLE 10MG 20 TAB',total:100}],
   notes:[{id:'n1',line:1,text:'السعر اتغيّر',mine:'هغيّره',alts:[]}],answers:{},owner_note:null,status:'ready',result:null,created_at:new Date().toISOString(),done_at:null}];
 });
 await fakeMic(page);
 await page.click('[data-pgroup="orders"]');await page.click('[data-tab="docs"]');await page.waitForSelector('#rvMain .rv-card');
 if(!(await page.isVisible('#rvMain [data-rv-chg="31|n1"]')))await page.click('#rvMain [data-rv-toggle="31"]');
 await page.click('#rvMain [data-rv-chg="31|n1"]');
 await page.evaluate(()=>{window.__say='سيب السعر القديم'});
 await page.click('#rvMain [data-rv-box="31|n1"] .vo-mic');
 await page.waitForFunction(()=>{const a=window.__tables.ar_invoice_reviews[0].answers.n1;return a&&a.v==='text'&&a.t==='سيب السعر القديم'},null,{timeout:6000});
 // the note on the invoice: said, then saved when the box changes
 await page.evaluate(()=>{window.__say='دخلها بعد رضا'});
 await page.click('#rvMain .vo-row:has(#rvNote31) .vo-mic');
 await page.waitForFunction(()=>window.__tables.ar_invoice_reviews[0].owner_note==='دخلها بعد رضا',null,{timeout:6000});
});
