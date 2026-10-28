/* ASKER V10: «وصل من النواقص» report for Gemini reading, with owner corrections.
   The item list (in the Supabase function) only identifies what the supplier sent; the target is the active
   shortage list. Only what the owner confirms is saved: item choices (name_aliases) and Arabic reading fixes
   (reading_fixes) and items a name is NOT (name_rejections, so a rejected item never comes back). Every save can be undone at once, and the dictionary lists everything with a delete button. */
(function(root){'use strict';
const key=s=>String(s??'').toUpperCase().replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sure=m=>m&&(m.confidence==='confirmed'||m.confidence==='high');

// rows: [{fileName,name,english,unclear,key,corrected,match,candidates}] ; shortages: active rows {id,product_name}
const OFFER_MIN=0.45; // same as match.ts: weaker items are never offered as "this one?"
// ignored: keys the owner marked «مش عندنا / مش مهم»; they are left out of the unsure list.
function buildReport(rows,shortages,ignored){
 const byName=new Map(shortages.map(s=>[key(s.product_name),s]));
 const arrived=new Map(),review=[],other=[],unknown=[];let hidden=0;
 rows.forEach((r,index)=>{
  // a clear item match, or the line already written exactly like a shortage (works even without the item list)
  const target=(sure(r.match)&&byName.get(key(r.match.name)))||byName.get(key(r.corrected||r.name))||null;
  if(target){const a=arrived.get(target.id)||{shortage:target,sources:[]};a.sources.push({index,name:r.name,corrected:r.corrected,fileName:r.fileName,confidence:sure(r.match)&&byName.get(key(r.match.name))?r.match.confidence:'same-name'});arrived.set(target.id,a);return}
  const options=(r.candidates||[]).filter((c,i,a)=>c.numbersOk&&c.formOk!==false&&(c.score??1)>=OFFER_MIN&&byName.has(key(c.name))&&a.findIndex(x=>key(x.name)===key(c.name))===i).slice(0,3).map(c=>({id:c.id,name:c.name,score:c.score,shortage:byName.get(key(c.name))}));
  if(options.length){review.push({index,row:r,options});return}
  if(sure(r.match))other.push({index,name:r.name,corrected:r.corrected,item:r.match.name,fileName:r.fileName});else if(r.ignored||ignored?.has(r.key))hidden++;else unknown.push({index,name:r.name,corrected:r.corrected,fileName:r.fileName,unclear:!!r.unclear});
 });
 return {arrived:[...arrived.values()],review,other,unknown,hidden};
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

// One line per name with its closest item: used by the review list («أسماء محتاجة مراجعة»).
const flatTop=r=>r.match||(r.candidates||[]).find(c=>c.numbersOk!==false&&c.formOk!==false&&(c.score??1)>=OFFER_MIN)||null;
function renderFlat(container,rows,view){
 const ed=i=>view.editing&&view.editing.i===i?editorHtml(rows[i],view.editing):'';
 container.innerHTML=(view.undo?`<div class="status" data-undo-bar>${esc(view.undo.label)} <button type="button" class="secondary" data-undo>تراجع عن الحفظ ده</button></div>`:'')+
  rows.map((r,i)=>{if(r.done)return `<div class="item"><span dir="auto">${esc(r.name)}</span> <span class="pill good">اتحفظ</span></div>`;const top=flatTop(r);
   return `<div class="item" data-flat="${i}"><strong dir="auto">${esc(r.name)}</strong>${fixedLine(r.name,r.corrected)}${r.english?`<div class="hint">Gemini فهمها: ${esc(r.english)}</div>`:''}`+
   (top?`<div>الأقرب: <strong dir="auto">${esc(top.name)}</strong> <button type="button" data-flat-yes="${i}">أيوه، ده هو</button> <button type="button" class="secondary" data-flat-no="${i}">مش ده</button></div>`:'<p class="hint">مفيش صنف قريب؛ استخدم «تصحيح».</p>')+
   ` ${editButton(i)}${ed(i)}</div>`}).join('');
}
function render(container,report,rows,view){
 if(view.flat)return renderFlat(container,rows,view);
 const conf={confirmed:'اسم مؤكد منك',high:'مطابقة واضحة','same-name':'نفس الاسم بالظبط'};
 const ed=i=>view.editing&&view.editing.i===i?editorHtml(rows[i],view.editing):'';
 const arrived=report.arrived.map(a=>`<div class="item" data-arrived="${esc(a.shortage.id)}"><strong>${esc(a.shortage.product_name)}</strong>${a.sources.map(s=>`<div class="hint">في صورة الشركة: <span dir="auto">${esc(s.name)}</span> · ${esc(s.fileName)} · ${conf[s.confidence]||''} ${s.confidence==='same-name'?'':notThisButton(s.index)} ${editButton(s.index)}</div>${fixedLine(s.name,s.corrected)}${ed(s.index)}`).join('')}</div>`).join('');
 const review=report.review.map(r=>`<div class="item" data-review="${r.index}"><strong dir="auto">${esc(r.row.name)}</strong>${fixedLine(r.row.name,r.row.corrected)}<div class="hint">${esc(r.row.fileName)}${r.row.unclear?' · Gemini مش متأكد من القراءة':''} — هل ده واحد من النواقص دي؟ راجع التركيز والشكل مع الصورة.</div>${r.options.map((o,j)=>`<div><span dir="auto">${esc(o.shortage.product_name)}</span> <button type="button" class="secondary" data-confirm="${r.index}:${j}">أيوه، ده هو</button></div>`).join('')}<button type="button" class="secondary" data-reject="${r.index}">مش واحد منهم</button> ${editButton(r.index)}${ed(r.index)}</div>`).join('');
 const line=(x,extra)=>`<div class="item"><span dir="auto">${esc(x.name)}</span>${fixedLine(x.name,x.corrected)}<div class="hint">${extra} ${editButton(x.index)}</div>${ed(x.index)}</div>`;
 container.innerHTML=(view.undo?`<div class="status" data-undo-bar>${esc(view.undo.label)} <button type="button" class="secondary" data-undo>تراجع عن الحفظ ده</button></div>`:'')+
  `<h3>وصل من النواقص: ${report.arrived.length}</h3>${report.arrived.length&&view.canSave?`<div class="row"><button type="button" data-save-arrivals>سجّل اللي وصل (${report.arrived.length})</button></div><p class="hint">بيتسجّل إن الأصناف دي متاحة عند الشركة اللي مكتوبة فوق، بتاريخ الوارد، وبتظهر في قايمة النواقص «متاح عند شركة». راجع اللي فوق الأول.</p>`:''}${arrived||'<p>مفيش صنف من النواقص اتعرف بثقة في الصور دي.</p>'}`+
  `<section data-gemini-review><h3>محتاج تأكيدك: ${report.review.length}</h3>${review||'<p class="hint">مفيش.</p>'}</section>`+
  `<details ${view.openOther?'open':''} data-sec="other"><summary>أصناف اتعرفت ومش في النواقص: ${report.other.length}</summary>${report.other.map(o=>line(o,`${esc(o.item)} · ${esc(o.fileName)} ${notThisButton(o.index)}`)).join('')}</details>`+
  `<details ${view.openUnknown?'open':''} data-sec="unknown"><summary>اتقرت ومش متأكد من صنفها: ${report.unknown.length}</summary><p class="hint">الأسماء دي اتقرت من الصورة، بس البوت مش متأكد هي أنهي صنف عندك، ومفيش واحد منها شبه النواقص. لو شايف فيها صنف من النواقص، استخدم «تصحيح». ولو صنف مش عندك أو مش مهم، اضغط «مش مهم» ومش هيظهر تاني.</p>${report.unknown.map(u=>line(u,`${esc(u.fileName)}${u.unclear?' · قراءة مش واضحة':''} <button type="button" class="secondary" data-ignore="${u.index}">مش مهم</button>`)).join('')}${report.hidden?`<p class="hint">واتخبّى ${report.hidden} اسم قلت قبل كده إنهم مش مهمين.</p>`:''}</details>`;
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
 // the name is settled: take it off the review list
 const {data:queued}=await client.from('name_review_queue').select('id,alias_key,read_text,english,file_name,last_seen').in('alias_key',keys);
 if(queued?.length){const {error}=await client.from('name_review_queue').delete().in('id',queued.map(q=>q.id));if(!error)undo.queueRows=queued}
 return {undo,corrected:changed?corrected:r.corrected||null};
}
// "Not this item": removes the owner's saved choice of these items for the line and remembers the rejection.
async function rejectChoice(client,r,names){
 names=[...new Set(names)];
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
 if(u.availabilityIds?.length){const {error}=await client.from('shortage_availability').delete().in('id',u.availabilityIds);if(error)throw Error(error.message)}
 if(u.ignoredKey){const {error}=await client.from('name_review_queue').update({ignored:false}).eq('alias_key',u.ignoredKey);if(error)throw Error(error.message)}
 if(u.queueRows?.length)await client.from('name_review_queue').upsert(u.queueRows.map(({id,...x})=>x),{onConflict:'alias_key'});
 if(u.addedRejectionIds?.length){const {error}=await client.from('name_rejections').delete().in('id',u.addedRejectionIds);if(error)throw Error(error.message)}
 if(u.addedAliasIds.length){const {error}=await client.from('name_aliases').delete().in('id',u.addedAliasIds);if(error)throw Error(error.message)}
 if(u.removedAliases.length){const {error}=await client.from('name_aliases').insert(u.removedAliases.map(({id,...x})=>x));if(error)throw Error(error.message)}
 if(u.fixId){const q=u.fixBefore?client.from('reading_fixes').update({corrected_text:u.fixBefore.corrected_text}).eq('id',u.fixId):client.from('reading_fixes').delete().eq('id',u.fixId);const {error}=await q;if(error)throw Error(error.message)}
}

// Report with corrections. deps: {client, invoke(body) -> {data,error}}.
// «سجّل اللي وصل»: one row per shortage for this supplier and day; rows that already exist are kept as they are.
async function saveArrivals(client,arrived,ctx){
 const ids=arrived.map(a=>a.shortage.id);
 const {data:had,error:e1}=await client.from('shortage_availability').select('shortage_item_id').in('shortage_item_id',ids).eq('supplier',ctx.supplier).eq('seen_on',ctx.date);
 if(e1)throw Error('تعذّر الحفظ: '+e1.message);
 const old=new Set((had||[]).map(x=>x.shortage_item_id));
 const rows=arrived.filter(a=>!old.has(a.shortage.id)).map(a=>({shortage_item_id:a.shortage.id,supplier:ctx.supplier,seen_on:ctx.date,source_text:[...new Set(a.sources.map(s=>s.corrected||s.name))].join(' | ').slice(0,500)}));
 if(!rows.length)return {removedAliases:[],addedAliasIds:[],addedRejectionIds:[],fixId:null,fixBefore:null,availabilityIds:[],count:0,already:old.size};
 const {data,error}=await client.from('shortage_availability').insert(rows).select('id');
 if(error)throw Error('تعذّر الحفظ: '+error.message);
 return {removedAliases:[],addedAliasIds:[],addedRejectionIds:[],fixId:null,fixBefore:null,availabilityIds:(data||[]).map(x=>x.id),count:rows.length,already:old.size};
}
// marks a name «مش عندنا / مش مهم»: kept in name_review_queue with ignored = true
async function ignoreName(client,r){
 const {error}=await client.from('name_review_queue').upsert({alias_key:r.key.slice(0,250),read_text:String(r.name).slice(0,250),english:r.english||null,file_name:r.fileName||null,ignored:true},{onConflict:'alias_key'});
 if(error)throw Error('ماتحفظش: '+error.message);
 return {removedAliases:[],addedAliasIds:[],addedRejectionIds:[],fixId:null,fixBefore:null,ignoredKey:r.key};
}
function show(container,rows,shortages,deps,setStatus){
 const state=rows.map(r=>({...r})),view={editing:null,undo:null,openOther:false,openUnknown:false,flat:!!deps.flat,canSave:!deps.flat&&!!deps.getContext};
 const report=()=>buildReport(state,shortages,deps.ignored);
 const draw=()=>{render(container,report(),state,view);wire()};
 const edStatus=m=>{const p=container.querySelector('[data-ed-status]');if(p)p.textContent=m;if(view.editing)view.editing.status=m};
 async function commit(i,target,text,label){
  const r=state[i],before={match:r.match,corrected:r.corrected||null,done:!!r.done};
  try{const {undo,corrected}=await saveChoice(deps.client,deps.invoke,r,target,text);
   r.match={id:target.id||'',name:target.name,score:1,confidence:'confirmed'};r.corrected=corrected;if(view.flat)r.done=true;deps.onChange?.();
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
  container.querySelectorAll('[data-flat-yes]').forEach(b=>b.addEventListener('click',async()=>{const i=Number(b.dataset.flatYes),t=flatTop(state[i]);if(!t)return;b.disabled=true;await commit(i,{id:t.id||'',name:t.name},'',`اتحفظ: «${state[i].name}» = ${t.name}.`)}));
  container.querySelectorAll('[data-flat-no]').forEach(b=>b.addEventListener('click',async()=>{const i=Number(b.dataset.flatNo),t=flatTop(state[i]);if(!t)return;b.disabled=true;await reject(i,[t.name],`اتسجّل إن «${state[i].name}» مش ${t.name}، ومش هيتقترح تاني.`)}));
  container.querySelector('[data-save-arrivals]')?.addEventListener('click',async e=>{const ctx=deps.getContext();if(!ctx.supplier){setStatus('اكتب اسم الشركة في خانة «اسم الشركة / المورد» فوق، وبعدين اضغط «سجّل اللي وصل».');deps.focusSupplier?.();return}
   e.target.disabled=true;try{const undo=await saveArrivals(deps.client,report().arrived,ctx);const label=undo.count?`اتسجّل ${undo.count} صنف متاح عند ${ctx.supplier} يوم ${ctx.date}.${undo.already?` و${undo.already} كانوا متسجلين قبل كده.`:''}`:`كل الأصناف دي متسجلة قبل كده لـ ${ctx.supplier} يوم ${ctx.date}.`;
    view.undo={...undo,i:0,before:{},label};draw();setStatus(label);deps.onArrivals?.()}catch(err){e.target.disabled=false;setStatus(err.message)}});
  container.querySelectorAll('[data-ignore]').forEach(b=>b.addEventListener('click',async()=>{const i=Number(b.dataset.ignore),r=state[i];b.disabled=true;
   try{const undo=await ignoreName(deps.client,r);const label=`«${r.name}» مش هيظهر تاني.`;view.undo={...undo,i,before:{ignored:false},label};r.ignored=true;draw();setStatus(label);deps.onChange?.()}catch(e){b.disabled=false;setStatus(e.message)}}));
  container.querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click',async()=>{const i=Number(b.dataset.reject);const opt=report().review.find(x=>x.index===i);if(!opt)return;b.disabled=true;await reject(i,opt.options.map(o=>o.name),`اتسجّل إن «${state[i].name}» مش واحد من دول، ومش هيتقترحوا تاني.`)}));
  container.querySelectorAll('[data-notthis]').forEach(b=>b.addEventListener('click',async()=>{const i=Number(b.dataset.notthis);const m=state[i].match;if(!m)return;b.disabled=true;await reject(i,[m.name],`اتسجّل إن «${state[i].name}» مش ${m.name}، ومش هيتقترح تاني. استخدم «تصحيح» لو عايز تختار الصح.`)}));
  container.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.edit),r=state[i];view.editing={i,text:r.corrected||r.name,q:'',manual:''};if(report().unknown.some(u=>u.index===i))view.openUnknown=true;if(report().other.some(o=>o.index===i))view.openOther=true;draw()}));
  container.querySelector('[data-undo]')?.addEventListener('click',async e=>{const u=view.undo;if(!u)return;e.target.disabled=true;try{await undoSave(deps.client,u);Object.assign(state[u.i],u.before);view.undo=null;draw();deps.onChange?.();if(u.availabilityIds?.length)deps.onArrivals?.();setStatus('اتلغى الحفظ، ورجع زي ما كان.')}catch(err){e.target.disabled=false;setStatus('تعذّر التراجع: '+err.message)}});
  const box=container.querySelector('[data-editor]');if(!box)return;const ed=view.editing,r=state[ed.i];
  const val=s=>box.querySelector(s).value;
  box.querySelector('[data-ed-cancel]').addEventListener('click',()=>{view.editing=null;draw()});
  box.querySelector('[data-ed-rematch]').addEventListener('click',async()=>{ed.text=val('[data-ed-text]');ed.q=val('[data-ed-q]');ed.manual=val('[data-ed-manual]');edStatus('بيدوّر…');const {data,error}=await deps.invoke({action:'match',name:ed.text,english:'',read:r.name});if(error){edStatus('تعذّر البحث');return}ed.results=null;ed.rematch=(data.row.candidates||[]);ed.status=ed.rematch.length?'دي أقرب أصناف للاسم المصحح؛ اختار الصح أو دوّر.':'مالقيتش أصناف قريبة؛ دوّر بالاسم الإنجليزي أو الكود.';draw()});
  box.querySelector('[data-ed-fix-save]').addEventListener('click',async e=>{const text=val('[data-ed-text]');e.target.disabled=true;const before={match:r.match,candidates:r.candidates,corrected:r.corrected||null};
   try{const {undo,corrected}=await saveFix(deps.client,r,text);r.corrected=corrected;
    const {data}=await deps.invoke({action:'match',name:corrected,english:'',read:r.name});if(data?.row){r.candidates=data.row.candidates||[];r.match=data.row.match||null}
    const label=`اتحفظ التصحيح: «${r.name}» ← «${corrected}». المرة الجاية هيتقري صح لوحده.`;view.editing=null;view.undo={...undo,i:ed.i,before,label};draw();setStatus(label)}
   catch(err){e.target.disabled=false;edStatus(err.message)}});
  box.querySelector('[data-ed-search]').addEventListener('click',async()=>{ed.text=val('[data-ed-text]');ed.q=val('[data-ed-q]').trim();ed.manual=val('[data-ed-manual]');if(ed.q.length<2){edStatus('اكتب حرفين على الأقل.');return}edStatus('بيدوّر…');const {data,error}=await deps.invoke({action:'search',q:ed.q});if(error){edStatus('تعذّر البحث');return}ed.results=data.items||[];ed.status=ed.results.length?'':'مفيش نتايج.';draw()});
  box.querySelectorAll('[data-ed-pick]').forEach(b=>b.addEventListener('click',async()=>{const opts=ed.results||ed.rematch||(r.candidates||[]);const o=opts[Number(b.dataset.edPick)];if(!o)return;b.disabled=true;await commit(ed.i,{id:o.id,name:o.name},val('[data-ed-text]'),`اتحفظ: «${r.name}» = ${o.name}.`)}));
  box.querySelector('[data-ed-manual-save]').addEventListener('click',async e=>{const name=val('[data-ed-manual]').replace(/\s+/g,' ').trim().toUpperCase();if(name.length<2){edStatus('اكتب الاسم الإنجليزي.');return}e.target.disabled=true;await commit(ed.i,{id:'',name},val('[data-ed-text]'),`اتحفظ اسم يدوي: «${r.name}» = ${name}.`)});
 }
 draw();const rep=report();
 // Names read but not tied to an item go to the review list, to correct and confirm later.
 if(!view.flat&&deps.client){const now=new Date().toISOString(),seen=new Set(deps.ignored||[]);
  const todo=[...rep.review.map(x=>x.row),...rep.unknown.map(u=>state[u.index])].filter(r=>r.key&&r.key.length>=2&&!seen.has(r.key)&&seen.add(r.key))
   .map(r=>({alias_key:r.key.slice(0,250),read_text:String(r.name).slice(0,250),english:r.english||null,file_name:r.fileName||null,last_seen:now}));
  if(todo.length)Promise.resolve(deps.client.from('name_review_queue').upsert(todo,{onConflict:'alias_key'})).then(()=>deps.onQueued?.(todo.length)).catch(()=>{})}
 return rep;
}

// «أسماء محتاجة مراجعة»: every name a reading could not tie to an item, kept until the owner settles it.
function reviewList(host,deps,setStatus){
 const box=document.createElement('details');box.className='file-import';box.id='reviewQueue';
 box.innerHTML='<summary>أسماء محتاجة مراجعة</summary><p class="hint">أسماء البوت قراها ومش متأكد هي أنهي صنف. اضغط «راجع»: أكّد الصنف، أو قول «مش ده»، أو صحّح الاسم. اللي تأكده بيتحفظ ويتعرف لوحده بعد كده ويخرج من القايمة. واللي مش عندك أو مش مهم اضغط عليه «مش عندنا / مش مهم» ومش هيرجع تاني (وتقدر ترجّعه من القاموس).</p><input type="search" data-q-filter placeholder="دوّر في الأسماء" dir="auto"><div data-q-list><p class="hint">افتح القسم عشان يتحمّل.</p></div>';
 host.append(box);let items=[],shown=30;const list=box.querySelector('[data-q-list]'),filter=box.querySelector('[data-q-filter]'),summary=box.querySelector('summary');
 const count=()=>{summary.textContent=`أسماء محتاجة مراجعة: ${items.length}`};
 const draw=()=>{const f=key(filter.value),vis=items.filter(q=>!f||key(q.read_text+' '+(q.english||'')).includes(f));count();
  list.innerHTML=vis.slice(0,shown).map(q=>`<div class="item" data-q="${esc(q.id)}"><span dir="auto">${esc(q.read_text)}</span>${q.file_name?` <span class="hint">${esc(q.file_name)}</span>`:''} <button type="button" class="secondary" data-q-open="${esc(q.id)}">راجع</button> <button type="button" class="secondary" data-q-drop="${esc(q.id)}">مش عندنا / مش مهم</button><div data-q-body></div></div>`).join('')+(vis.length>shown?`<button type="button" class="secondary" data-q-more>اعرض أكتر (${vis.length-shown})</button>`:'')+(vis.length?'':'<p class="hint">مفيش أسماء محتاجة مراجعة.</p>');
  list.querySelector('[data-q-more]')?.addEventListener('click',()=>{shown+=30;draw()});
  list.querySelectorAll('[data-q-drop]').forEach(b=>b.addEventListener('click',async()=>{const id=b.dataset.qDrop;b.disabled=true;const {error}=await deps.client.from('name_review_queue').update({ignored:true}).eq('id',id);if(error){setStatus('ماتحفظش: '+error.message);b.disabled=false;return}items=items.filter(q=>q.id!==id);draw()}));
  list.querySelectorAll('[data-q-open]').forEach(b=>b.addEventListener('click',async()=>{const q=items.find(x=>x.id===b.dataset.qOpen);if(!q)return;const body=b.parentElement.querySelector('[data-q-body]');b.disabled=true;body.innerHTML='<p class="hint">بيدوّر…</p>';
   const {data,error}=await deps.invoke({action:'match',name:q.read_text,english:q.english||''});if(error||!data?.row){body.innerHTML='<p class="status bad">تعذّر البحث؛ جرّب تاني.</p>';b.disabled=false;return}
   show(body,[{...data.row,name:q.read_text,english:q.english||'',key:q.alias_key,fileName:q.file_name||''}],[],{...deps,flat:true,onChange:()=>load(true)},setStatus)}))};
 // keepOpen: refresh the count after a save without closing the line being reviewed
 const load=async(keepOpen)=>{const {data,error}=await deps.client.from('name_review_queue').select('id,alias_key,read_text,english,file_name,last_seen').eq('ignored',false).order('last_seen',{ascending:false}).limit(2000);
  if(error){if(box.open)list.innerHTML=`<p class="status bad">تعذّر تحميل القايمة: ${esc(error.message)}</p>`;return}items=data||[];if(keepOpen===true||!box.open)count();else draw()};
 box.addEventListener('toggle',()=>{if(box.open)load()});filter.addEventListener('input',draw);load();
 return {reload:()=>load()};
}

// Dictionary of everything the owner saved, with delete (two taps).
function manager(host,client){
 const box=document.createElement('details');box.className='file-import';box.id='nameDictionary';box.innerHTML='<summary>قاموس الأسماء والتصحيحات اللي حفظتها</summary><p class="hint">كل اختيار أو تصحيح حفظته بيتطبق تلقائي في القراءات الجاية. لو فيه حاجة غلط، امسحها من هنا.</p><input type="search" data-dict-filter placeholder="دوّر في القاموس" dir="auto"><div data-dict-list><p class="hint">افتح القسم عشان يتحمّل.</p></div>';
 host.append(box);let data={aliases:[],fixes:[],rejections:[],ignored:[]},armed=null;
 const list=box.querySelector('[data-dict-list]'),filter=box.querySelector('[data-dict-filter]');
 const draw=()=>{const f=key(filter.value);const ok=s=>!f||key(s).includes(f);
  const a=data.aliases.filter(x=>ok(x.alias_text+' '+x.target_name)),x=data.fixes.filter(y=>ok(y.read_text+' '+y.corrected_text)),n=data.rejections.filter(y=>ok(y.alias_text+' '+y.target_name));
  list.innerHTML=`<h4>الأصناف المؤكدة: ${a.length}</h4>${a.map(r=>`<div class="item"><span dir="auto">${esc(r.alias_text)}</span> ← <strong>${esc(r.target_name)}</strong>${r.target_code?` <span class="hint">(${esc(r.target_code)})</span>`:' <span class="hint">(اسم يدوي)</span>'} <button type="button" class="secondary" data-del="a:${esc(r.id)}">${armed==='a:'+r.id?'اضغط تاني للتأكيد':'امسح'}</button></div>`).join('')||'<p class="hint">مفيش.</p>'}`+
   `<h4>تصحيحات القراءة: ${x.length}</h4>${x.map(r=>`<div class="item"><span dir="auto">${esc(r.read_text)}</span> ← <span dir="auto">${esc(r.corrected_text)}</span> <button type="button" class="secondary" data-del="f:${esc(r.id)}">${armed==='f:'+r.id?'اضغط تاني للتأكيد':'امسح'}</button></div>`).join('')||'<p class="hint">مفيش.</p>'}`+
   `<h4>أصناف قلت إنها مش هي: ${n.length}</h4>${n.map(r=>`<div class="item"><span dir="auto">${esc(r.alias_text)}</span> ≠ <strong>${esc(r.target_name)}</strong> <button type="button" class="secondary" data-del="n:${esc(r.id)}">${armed==='n:'+r.id?'اضغط تاني للتأكيد':'امسح'}</button></div>`).join('')||'<p class="hint">مفيش.</p>'}`+
   `<h4>أسماء قلت إنها مش مهمة: ${data.ignored.filter(y=>ok(y.read_text)).length}</h4>${data.ignored.filter(y=>ok(y.read_text)).map(r=>`<div class="item"><span dir="auto">${esc(r.read_text)}</span> <button type="button" class="secondary" data-unignore="${esc(r.id)}">رجّعها للمراجعة</button></div>`).join('')||'<p class="hint">مفيش.</p>'}<p class="status" data-dict-status></p>`;
  list.querySelectorAll('[data-unignore]').forEach(b=>b.addEventListener('click',async()=>{const id=b.dataset.unignore;b.disabled=true;const {error}=await client.from('name_review_queue').update({ignored:false}).eq('id',id);if(error){list.querySelector('[data-dict-status]').textContent='ماترجعتش: '+error.message;b.disabled=false;return}data.ignored=data.ignored.filter(r=>r.id!==id);draw()}));
  list.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{const id=b.dataset.del;if(armed!==id){armed=id;draw();return}armed=null;const [t,rid]=id.split(':');
   const table={a:'name_aliases',f:'reading_fixes',n:'name_rejections'}[t];const {error}=await client.from(table).delete().eq('id',rid);
   if(error){list.querySelector('[data-dict-status]').textContent='ماتمسحش: '+error.message;return}
   const k={a:'aliases',f:'fixes',n:'rejections'}[t];data[k]=data[k].filter(r=>r.id!==rid);draw()}))};
 const load=async()=>{list.innerHTML='<p class="hint">بيحمّل…</p>';const [a,f,n,g]=await Promise.all([client.from('name_aliases').select('id,alias_text,target_name,target_code,created_at').order('created_at',{ascending:false}).limit(2000),client.from('reading_fixes').select('id,read_text,corrected_text,created_at').order('created_at',{ascending:false}).limit(2000),client.from('name_rejections').select('id,alias_text,target_name,created_at').order('created_at',{ascending:false}).limit(2000),client.from('name_review_queue').select('id,read_text').eq('ignored',true).limit(2000)]);
  if(a.error||f.error){list.innerHTML=`<p class="status bad">تعذّر تحميل القاموس: ${esc((a.error||f.error).message)}</p>`;return}data={aliases:a.data||[],fixes:f.data||[],rejections:n.error?[]:n.data||[],ignored:g.error?[]:g.data||[]};draw()};
 box.addEventListener('toggle',()=>{if(box.open)load()});filter.addEventListener('input',draw);
 return {reload:()=>box.open&&load()};
}

const api={buildReport,render,show,manager,reviewList,saveChoice,saveFix,rejectChoice,saveArrivals,undoSave};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AskerGeminiReport=api;
})(typeof window==='undefined'?globalThis:window);
