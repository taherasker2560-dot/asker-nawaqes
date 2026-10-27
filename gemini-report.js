/* ASKER V10: «وصل من النواقص» report for Gemini reading, with owner corrections.
   The item list (in the Supabase function) only identifies what the supplier sent; the target is the active
   shortage list. Only what the owner confirms is saved: item choices (name_aliases) and Arabic reading fixes
   (reading_fixes) and items a name is NOT (name_rejections, so a rejected item never comes back). Every save can be undone at once, and the dictionary lists everything with a delete button. */
(function(root){'use strict';
const key=s=>String(s??'').toUpperCase().replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sure=m=>m&&(m.confidence==='confirmed'||m.confidence==='high');

// rows: [{fileName,name,english,unclear,key,corrected,match,candidates}] ; shortages: active rows {id,product_name}
function buildReport(rows,shortages){
 const byName=new Map(shortages.map(s=>[key(s.product_name),s]));
 const arrived=new Map(),review=[],other=[],unknown=[];
 rows.forEach((r,index)=>{
  // a clear item match, or the line already written exactly like a shortage (works even without the item list)
  const target=(sure(r.match)&&byName.get(key(r.match.name)))||byName.get(key(r.corrected||r.name))||null;
  if(target){const a=arrived.get(target.id)||{shortage:target,sources:[]};a.sources.push({index,name:r.name,corrected:r.corrected,fileName:r.fileName,confidence:sure(r.match)&&byName.get(key(r.match.name))?r.match.confidence:'same-name'});arrived.set(target.id,a);return}
  const options=(r.candidates||[]).filter(c=>c.numbersOk&&c.formOk!==false&&byName.has(key(c.name))).slice(0,3).map(c=>({id:c.id,name:c.name,score:c.score,shortage:byName.get(key(c.name))}));
  if(options.length){review.push({index,row:r,options});return}
  if(sure(r.match))other.push({index,name:r.name,corrected:r.corrected,item:r.match.name,fileName:r.fileName});else unknown.push({index,name:r.name,corrected:r.corrected,fileName:r.fileName,unclear:!!r.unclear});
 });
 return {arrived:[...arrived.values()],review,other,unknown};
}

const fixedLine=(name,corrected)=>corrected&&corrected!==name?`<div class="hint">اتصحح لـ: <span dir="auto">${esc(corrected)}</span></div>`:'';
const editButton=i=>`<button type="button" class="secondary" data-edit="${i}">تصحيح</button>`;
const notThisButton=i=>`<button type="button" class="secondary" data-notthis="${i}">مش ده</button>`;
function editorHtml(r,ed){
 const opts=ed.results||ed.rematch||(r.candidates||[]).map(c=>({id:c.id,name:c.name,numbersOk:c.numbersOk}));
 return `<div class="file-import" data-editor><p class="hint">في الصورة: <span dir="auto">${esc(r.name)}</span>${r.english?` · Gemini فهمها: ${esc(r.english)}`:''}</p>`+
 `<label>الاسم العربي الصح (لو القراءة غلط)</label><input type="text" data-ed-text dir="auto" maxlength="250" value="${esc(ed.text)}"><button type="button" class="secondary" data-ed-rematch>دوّر بالاسم ده</button> <button type="button" data-ed-fix-save>احفظ التصحيح بس</button>`+
 `<label>دوّر على الصنف في القاعدة: اسم إنجليزي أو كود</label><input type="search" data-ed-q dir="auto" maxlength="100" value="${esc(ed.q||'')}"><button type="button" class="secondary" data-ed-search>ابحث</button>`+
 `<div data-ed-options>${opts.length?opts.slice(0,10).map((o,j)=>`<div><span dir="auto">${esc(o.name)}</span>${o.numbersOk===false?' <span class="hint">(التركيز مختلف)</span>':''}${o.formOk===false?' <span class="hint">(الشكل مختلف)</span>':''} <button type="button" data-ed-pick="${j}">اختار ده</button></div>`).join(''):'<p class="hint">مفيش أصناف مقترحة؛ دوّر بالاسم أو الكود.</p>'}</div>`+
 `<label>مش موجود في القاعدة خالص؟ اكتب اسمه الإنجليزي</label><input type="text" data-ed-manual dir="ltr" maxlength="250" value="${esc(ed.manual||'')}"><button type="button" class="secondary" data-ed-manual-save>احفظ الاسم ده</button>`+
 `<p class="hint">الاسم اليدوي مش هيتطابق مع النواقص إلا لو مكتوب زيها بالظبط.</p><button type="button" class="secondary" data-ed-cancel>إلغاء</button><p class="status" data-ed-status>${esc(ed.status||'')}</p></div>`;
}

function render(container,report,rows,view){
 const conf={confirmed:'اسم مؤكد منك',high:'مطابقة واضحة','same-name':'نفس الاسم بالظبط'};
 const ed=i=>view.editing&&view.editing.i===i?editorHtml(rows[i],view.editing):'';
 const arrived=report.arrived.map(a=>`<div class="item" data-arrived="${esc(a.shortage.id)}"><strong>${esc(a.shortage.product_name)}</strong>${a.sources.map(s=>`<div class="hint">في صورة الشركة: <span dir="auto">${esc(s.name)}</span> · ${esc(s.fileName)} · ${conf[s.confidence]||''} ${s.confidence==='same-name'?'':notThisButton(s.index)} ${editButton(s.index)}</div>${fixedLine(s.name,s.corrected)}${ed(s.index)}`).join('')}</div>`).join('');
 const review=report.review.map(r=>`<div class="item" data-review="${r.index}"><strong dir="auto">${esc(r.row.name)}</strong>${fixedLine(r.row.name,r.row.corrected)}<div class="hint">${esc(r.row.fileName)}${r.row.unclear?' · Gemini مش متأكد من القراءة':''} — هل ده واحد من النواقص دي؟ راجع التركيز والشكل مع الصورة.</div>${r.options.map((o,j)=>`<div><span dir="auto">${esc(o.shortage.product_name)}</span> <button type="button" class="secondary" data-confirm="${r.index}:${j}">أيوه، ده هو</button></div>`).join('')}<button type="button" class="secondary" data-reject="${r.index}">مش واحد منهم</button> ${editButton(r.index)}${ed(r.index)}</div>`).join('');
 const line=(x,extra)=>`<div class="item"><span dir="auto">${esc(x.name)}</span>${fixedLine(x.name,x.corrected)}<div class="hint">${extra} ${editButton(x.index)}</div>${ed(x.index)}</div>`;
 container.innerHTML=(view.undo?`<div class="status" data-undo-bar>${esc(view.undo.label)} <button type="button" class="secondary" data-undo>تراجع عن الحفظ ده</button></div>`:'')+
  `<h3>وصل من النواقص: ${report.arrived.length}</h3>${arrived||'<p>مفيش صنف من النواقص اتعرف بثقة في الصور دي.</p>'}`+
  `<section data-gemini-review><h3>محتاج تأكيدك: ${report.review.length}</h3>${review||'<p class="hint">مفيش.</p>'}</section>`+
  `<details ${view.openOther?'open':''} data-sec="other"><summary>أصناف اتعرفت ومش في النواقص: ${report.other.length}</summary>${report.other.map(o=>line(o,`${esc(o.item)} · ${esc(o.fileName)} ${notThisButton(o.index)}`)).join('')}</details>`+
  `<details ${view.openUnknown?'open':''} data-sec="unknown"><summary>أسماء مااتعرفتش: ${report.unknown.length}</summary><p class="hint">مش معناها إنها مش موجودة؛ ممكن الاسم مكتوب بشكل مختلف أو القراءة غلط. استخدم «تصحيح».</p>${report.unknown.map(u=>line(u,`${esc(u.fileName)}${u.unclear?' · قراءة مش واضحة':''}`)).join('')}</details>`;
}

// Saves an item choice for one line, replacing any earlier choice for the same name; returns what is needed to undo it.
async function saveChoice(client,invoke,r,target,text){
 const corrected=(text||'').replace(/\s+/g,' ').trim();
 const changed=corrected.length>=2&&corrected!==r.name;
 const keys=[r.key];let correctedKey=null;
 if(changed){const {data,error}=await invoke({action:'match',name:corrected,english:r.english||''});if(error||!data?.row?.key)throw Error('تعذّر تجهيز الاسم المصحح');correctedKey=data.row.key;if(!keys.includes(correctedKey))keys.push(correctedKey)}
 const undo={removedAliases:[],addedAliasIds:[],fixId:null,fixBefore:null};
 if(changed){
  const {data:old}=await client.from('reading_fixes').select('id,read_key,read_text,corrected_text').eq('read_key',r.key);
  undo.fixBefore=old?.[0]||null;
  const {data,error}=await client.from('reading_fixes').upsert({read_key:r.key,read_text:r.name,corrected_text:corrected},{onConflict:'read_key'}).select('id');
  if(error)throw Error('ماتحفظش التصحيح العربي: '+error.message);undo.fixId=data?.[0]?.id||null;
 }
 const {data:olds,error:e1}=await client.from('name_aliases').select('id,alias_text,alias_key,target_name,target_code,source').in('alias_key',keys);
 if(e1)throw Error('تعذّر قراءة الاختيارات القديمة: '+e1.message);
 if(olds?.length){const {error}=await client.from('name_aliases').delete().in('id',olds.map(o=>o.id));if(error)throw Error('تعذّر تغيير الاختيار القديم: '+error.message);undo.removedAliases=olds}
 const rowsToAdd=keys.map(k=>({alias_text:k===r.key?r.name:corrected,alias_key:k,target_name:target.name,target_code:target.id||null,source:'incoming-review'}));
 const {data:added,error:e2}=await client.from('name_aliases').insert(rowsToAdd).select('id');
 if(e2){if(undo.removedAliases.length)await client.from('name_aliases').insert(undo.removedAliases.map(({id,...x})=>x));throw Error('ماتحفظش الاختيار: '+e2.message)}
 undo.addedAliasIds=(added||[]).map(a=>a.id);
 return {undo,corrected:changed?corrected:r.corrected||null};
}
// "Not this item": removes the owner's saved choice of these items for the line and remembers the rejection.
async function rejectChoice(client,r,names){
 const undo={removedAliases:[],addedAliasIds:[],addedRejectionIds:[],fixId:null,fixBefore:null};
 const {data:olds,error:e1}=await client.from('name_aliases').select('id,alias_text,alias_key,target_name,target_code,source').in('target_name',names);
 if(e1)throw Error('تعذّر قراءة الاختيارات: '+e1.message);
 const mine=(olds||[]).filter(o=>o.alias_key===r.key||(r.corrected&&o.alias_text===r.corrected));
 if(mine.length){const {error}=await client.from('name_aliases').delete().in('id',mine.map(o=>o.id));if(error)throw Error('تعذّر مسح الاختيار: '+error.message);undo.removedAliases=mine}
 const {data:had}=await client.from('name_rejections').select('id,target_name').eq('alias_key',r.key);
 const fresh=names.filter(n=>!(had||[]).some(h=>h.target_name===n));
 if(fresh.length){const {data,error}=await client.from('name_rejections').insert(fresh.map(n=>({alias_key:r.key,alias_text:r.name,target_name:n}))).select('id');
  if(error){if(mine.length)await client.from('name_aliases').insert(mine.map(({id,...x})=>x));throw Error('ماتحفظش الرفض: '+error.message)}
  undo.addedRejectionIds=(data||[]).map(x=>x.id)}
 return undo;
}
// Saves only the Arabic reading fix (no item choice); later readings of the same text use the corrected one.
async function saveFix(client,r,text){
 const corrected=(text||'').replace(/\s+/g,' ').trim();
 if(corrected.length<2||corrected===r.name)throw Error('اكتب الاسم الصح الأول.');
 const undo={removedAliases:[],addedAliasIds:[],addedRejectionIds:[],fixId:null,fixBefore:null};
 const {data:old}=await client.from('reading_fixes').select('id,read_key,read_text,corrected_text').eq('read_key',r.key);
 undo.fixBefore=old?.[0]||null;
 const {data,error}=await client.from('reading_fixes').upsert({read_key:r.key,read_text:r.name,corrected_text:corrected},{onConflict:'read_key'}).select('id');
 if(error)throw Error('ماتحفظش التصحيح: '+error.message);undo.fixId=data?.[0]?.id||null;
 return {undo,corrected};
}
async function undoSave(client,u){
 if(u.addedRejectionIds?.length){const {error}=await client.from('name_rejections').delete().in('id',u.addedRejectionIds);if(error)throw Error(error.message)}
 if(u.addedAliasIds.length){const {error}=await client.from('name_aliases').delete().in('id',u.addedAliasIds);if(error)throw Error(error.message)}
 if(u.removedAliases.length){const {error}=await client.from('name_aliases').insert(u.removedAliases.map(({id,...x})=>x));if(error)throw Error(error.message)}
 if(u.fixId){const q=u.fixBefore?client.from('reading_fixes').update({corrected_text:u.fixBefore.corrected_text}).eq('id',u.fixId):client.from('reading_fixes').delete().eq('id',u.fixId);const {error}=await q;if(error)throw Error(error.message)}
}

// Report with corrections. deps: {client, invoke(body) -> {data,error}}.
function show(container,rows,shortages,deps,setStatus){
 const state=rows.map(r=>({...r})),view={editing:null,undo:null,openOther:false,openUnknown:false};
 const report=()=>buildReport(state,shortages);
 const draw=()=>{render(container,report(),state,view);wire()};
 const edStatus=m=>{const p=container.querySelector('[data-ed-status]');if(p)p.textContent=m;if(view.editing)view.editing.status=m};
 async function commit(i,target,text,label){
  const r=state[i],before={match:r.match,corrected:r.corrected||null};
  try{const {undo,corrected}=await saveChoice(deps.client,deps.invoke,r,target,text);
   r.match={id:target.id||'',name:target.name,score:1,confidence:'confirmed'};r.corrected=corrected;
   view.editing=null;view.undo={...undo,i,before,label};draw();setStatus(label+' المرة الجاية هيتعرف لوحده.')}
  catch(e){edStatus(e.message);setStatus(e.message)}}
 async function reject(i,names,label){
  const r=state[i],before={match:r.match,candidates:r.candidates,corrected:r.corrected||null};
  try{const undo=await rejectChoice(deps.client,r,names);
   r.match=r.match&&names.includes(r.match.name)?null:r.match;r.candidates=(r.candidates||[]).filter(c=>!names.includes(c.name));
   view.undo={...undo,i,before,label};draw();setStatus(label)}
  catch(e){setStatus(e.message);draw()}}
 function wire(){
  container.querySelectorAll('details[data-sec]').forEach(d=>d.addEventListener('toggle',()=>{view[d.dataset.sec==='other'?'openOther':'openUnknown']=d.open}));
  container.querySelectorAll('[data-confirm]').forEach(b=>b.addEventListener('click',async()=>{const [i,j]=b.dataset.confirm.split(':').map(Number);const opt=report().review.find(x=>x.index===i)?.options[j];if(!opt)return;b.disabled=true;await commit(i,{id:opt.id,name:opt.name},'',`اتحفظ: «${state[i].name}» = ${opt.name}.`)}));
  container.querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click',async()=>{const i=Number(b.dataset.reject);const opt=report().review.find(x=>x.index===i);if(!opt)return;b.disabled=true;await reject(i,opt.options.map(o=>o.name),`اتسجّل إن «${state[i].name}» مش واحد من دول، ومش هيتقترحوا تاني.`)}));
  container.querySelectorAll('[data-notthis]').forEach(b=>b.addEventListener('click',async()=>{const i=Number(b.dataset.notthis);const m=state[i].match;if(!m)return;b.disabled=true;await reject(i,[m.name],`اتسجّل إن «${state[i].name}» مش ${m.name}، ومش هيتقترح تاني. استخدم «تصحيح» لو عايز تختار الصح.`)}));
  container.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.edit),r=state[i];view.editing={i,text:r.corrected||r.name,q:'',manual:''};if(report().unknown.some(u=>u.index===i))view.openUnknown=true;if(report().other.some(o=>o.index===i))view.openOther=true;draw()}));
  container.querySelector('[data-undo]')?.addEventListener('click',async e=>{const u=view.undo;if(!u)return;e.target.disabled=true;try{await undoSave(deps.client,u);Object.assign(state[u.i],u.before);view.undo=null;draw();setStatus('اتلغى الحفظ، ورجع زي ما كان.')}catch(err){e.target.disabled=false;setStatus('تعذّر التراجع: '+err.message)}});
  const box=container.querySelector('[data-editor]');if(!box)return;const ed=view.editing,r=state[ed.i];
  const val=s=>box.querySelector(s).value;
  box.querySelector('[data-ed-cancel]').addEventListener('click',()=>{view.editing=null;draw()});
  box.querySelector('[data-ed-rematch]').addEventListener('click',async()=>{ed.text=val('[data-ed-text]');ed.q=val('[data-ed-q]');ed.manual=val('[data-ed-manual]');edStatus('بيدوّر…');const {data,error}=await deps.invoke({action:'match',name:ed.text,english:''});if(error){edStatus('تعذّر البحث');return}ed.results=null;ed.rematch=(data.row.candidates||[]);ed.status=ed.rematch.length?'دي أقرب أصناف للاسم المصحح؛ اختار الصح أو دوّر.':'مالقيتش أصناف قريبة؛ دوّر بالاسم الإنجليزي أو الكود.';draw()});
  box.querySelector('[data-ed-fix-save]').addEventListener('click',async e=>{const text=val('[data-ed-text]');e.target.disabled=true;const before={match:r.match,candidates:r.candidates,corrected:r.corrected||null};
   try{const {undo,corrected}=await saveFix(deps.client,r,text);r.corrected=corrected;
    const {data}=await deps.invoke({action:'match',name:corrected,english:''});if(data?.row){r.candidates=data.row.candidates||[];r.match=data.row.match||null}
    const label=`اتحفظ التصحيح: «${r.name}» ← «${corrected}». المرة الجاية هيتقري صح لوحده.`;view.editing=null;view.undo={...undo,i:ed.i,before,label};draw();setStatus(label)}
   catch(err){e.target.disabled=false;edStatus(err.message)}});
  box.querySelector('[data-ed-search]').addEventListener('click',async()=>{ed.text=val('[data-ed-text]');ed.q=val('[data-ed-q]').trim();ed.manual=val('[data-ed-manual]');if(ed.q.length<2){edStatus('اكتب حرفين على الأقل.');return}edStatus('بيدوّر…');const {data,error}=await deps.invoke({action:'search',q:ed.q});if(error){edStatus('تعذّر البحث');return}ed.results=data.items||[];ed.status=ed.results.length?'':'مفيش نتايج.';draw()});
  box.querySelectorAll('[data-ed-pick]').forEach(b=>b.addEventListener('click',async()=>{const opts=ed.results||ed.rematch||(r.candidates||[]);const o=opts[Number(b.dataset.edPick)];if(!o)return;b.disabled=true;await commit(ed.i,{id:o.id,name:o.name},val('[data-ed-text]'),`اتحفظ: «${r.name}» = ${o.name}.`)}));
  box.querySelector('[data-ed-manual-save]').addEventListener('click',async e=>{const name=val('[data-ed-manual]').replace(/\s+/g,' ').trim().toUpperCase();if(name.length<2){edStatus('اكتب الاسم الإنجليزي.');return}e.target.disabled=true;await commit(ed.i,{id:'',name},val('[data-ed-text]'),`اتحفظ اسم يدوي: «${r.name}» = ${name}.`)});
 }
 draw();return report();
}

// Dictionary of everything the owner saved, with delete (two taps).
function manager(host,client){
 const box=document.createElement('details');box.className='file-import';box.id='nameDictionary';box.innerHTML='<summary>قاموس الأسماء والتصحيحات اللي حفظتها</summary><p class="hint">كل اختيار أو تصحيح حفظته بيتطبق تلقائي في القراءات الجاية. لو فيه حاجة غلط، امسحها من هنا.</p><input type="search" data-dict-filter placeholder="دوّر في القاموس" dir="auto"><div data-dict-list><p class="hint">افتح القسم عشان يتحمّل.</p></div>';
 host.append(box);let data={aliases:[],fixes:[],rejections:[]},armed=null;
 const list=box.querySelector('[data-dict-list]'),filter=box.querySelector('[data-dict-filter]');
 const draw=()=>{const f=key(filter.value);const ok=s=>!f||key(s).includes(f);
  const a=data.aliases.filter(x=>ok(x.alias_text+' '+x.target_name)),x=data.fixes.filter(y=>ok(y.read_text+' '+y.corrected_text)),n=data.rejections.filter(y=>ok(y.alias_text+' '+y.target_name));
  list.innerHTML=`<h4>الأصناف المؤكدة: ${a.length}</h4>${a.map(r=>`<div class="item"><span dir="auto">${esc(r.alias_text)}</span> ← <strong>${esc(r.target_name)}</strong>${r.target_code?` <span class="hint">(${esc(r.target_code)})</span>`:' <span class="hint">(اسم يدوي)</span>'} <button type="button" class="secondary" data-del="a:${esc(r.id)}">${armed==='a:'+r.id?'اضغط تاني للتأكيد':'امسح'}</button></div>`).join('')||'<p class="hint">مفيش.</p>'}`+
   `<h4>تصحيحات القراءة: ${x.length}</h4>${x.map(r=>`<div class="item"><span dir="auto">${esc(r.read_text)}</span> ← <span dir="auto">${esc(r.corrected_text)}</span> <button type="button" class="secondary" data-del="f:${esc(r.id)}">${armed==='f:'+r.id?'اضغط تاني للتأكيد':'امسح'}</button></div>`).join('')||'<p class="hint">مفيش.</p>'}`+
   `<h4>أصناف قلت إنها مش هي: ${n.length}</h4>${n.map(r=>`<div class="item"><span dir="auto">${esc(r.alias_text)}</span> ≠ <strong>${esc(r.target_name)}</strong> <button type="button" class="secondary" data-del="n:${esc(r.id)}">${armed==='n:'+r.id?'اضغط تاني للتأكيد':'امسح'}</button></div>`).join('')||'<p class="hint">مفيش.</p>'}<p class="status" data-dict-status></p>`;
  list.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{const id=b.dataset.del;if(armed!==id){armed=id;draw();return}armed=null;const [t,rid]=id.split(':');
   const table={a:'name_aliases',f:'reading_fixes',n:'name_rejections'}[t];const {error}=await client.from(table).delete().eq('id',rid);
   if(error){list.querySelector('[data-dict-status]').textContent='ماتمسحش: '+error.message;return}
   const k={a:'aliases',f:'fixes',n:'rejections'}[t];data[k]=data[k].filter(r=>r.id!==rid);draw()}))};
 const load=async()=>{list.innerHTML='<p class="hint">بيحمّل…</p>';const [a,f,n]=await Promise.all([client.from('name_aliases').select('id,alias_text,target_name,target_code,created_at').order('created_at',{ascending:false}).limit(2000),client.from('reading_fixes').select('id,read_text,corrected_text,created_at').order('created_at',{ascending:false}).limit(2000),client.from('name_rejections').select('id,alias_text,target_name,created_at').order('created_at',{ascending:false}).limit(2000)]);
  if(a.error||f.error){list.innerHTML=`<p class="status bad">تعذّر تحميل القاموس: ${esc((a.error||f.error).message)}</p>`;return}data={aliases:a.data||[],fixes:f.data||[],rejections:n.error?[]:n.data||[]};draw()};
 box.addEventListener('toggle',()=>{if(box.open)load()});filter.addEventListener('input',draw);
 return {reload:()=>box.open&&load()};
}

const api={buildReport,render,show,manager,saveChoice,saveFix,rejectChoice,undoSave};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AskerGeminiReport=api;
})(typeof window==='undefined'?globalThis:window);
