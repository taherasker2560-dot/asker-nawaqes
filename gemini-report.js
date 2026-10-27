/* ASKER V10: «وصل من النواقص» report for Gemini reading.
   The item list (in the Supabase function) only identifies what the supplier sent; the target is the active
   shortage list. Only names the owner confirms are saved (table name_aliases). Nothing else is written. */
(function(root){'use strict';
const key=s=>String(s??'').toUpperCase().replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sure=m=>m&&(m.confidence==='confirmed'||m.confidence==='high');

// rows: [{fileName,name,english,unclear,key,match,candidates}] ; shortages: active shortage rows {id,product_name}
function buildReport(rows,shortages){
 const byName=new Map(shortages.map(s=>[key(s.product_name),s]));
 const arrived=new Map(),review=[],other=[],unknown=[];
 rows.forEach((r,index)=>{
  // a clear item match, or the line already written exactly like a shortage (works even without the item list)
  const target=(sure(r.match)&&byName.get(key(r.match.name)))||byName.get(key(r.name))||null;
  if(target){const a=arrived.get(target.id)||{shortage:target,sources:[]};a.sources.push({index,name:r.name,fileName:r.fileName,confidence:sure(r.match)&&byName.get(key(r.match.name))?r.match.confidence:'same-name'});arrived.set(target.id,a);return}
  const options=(r.candidates||[]).filter(c=>c.numbersOk&&byName.has(key(c.name))).slice(0,3).map(c=>({id:c.id,name:c.name,score:c.score,shortage:byName.get(key(c.name))}));
  if(options.length){review.push({index,row:r,options});return}
  if(sure(r.match))other.push({index,name:r.name,item:r.match.name,fileName:r.fileName});else unknown.push({index,name:r.name,fileName:r.fileName,unclear:!!r.unclear});
 });
 return {arrived:[...arrived.values()],review,other,unknown};
}

function render(container,report,{onConfirm,onReject}){
 const conf={confirmed:'اسم مؤكد منك',high:'مطابقة واضحة','same-name':'نفس الاسم بالظبط'};
 const arrived=report.arrived.map(a=>`<div class="item" data-arrived="${esc(a.shortage.id)}"><strong>${esc(a.shortage.product_name)}</strong>${a.sources.map(s=>`<div class="hint">في صورة الشركة: <span dir="auto">${esc(s.name)}</span> · ${esc(s.fileName)} · ${conf[s.confidence]||''}</div>`).join('')}</div>`).join('');
 const review=report.review.map(r=>`<div class="item" data-review="${r.index}"><strong dir="auto">${esc(r.row.name)}</strong><div class="hint">${esc(r.row.fileName)}${r.row.unclear?' · Gemini مش متأكد من القراءة':''} — هل ده واحد من النواقص دي؟ راجع التركيز والشكل مع الصورة.</div>${r.options.map((o,j)=>`<div><span dir="auto">${esc(o.shortage.product_name)}</span> <button type="button" class="secondary" data-confirm="${r.index}:${j}">أيوه، ده هو</button></div>`).join('')}<button type="button" class="secondary" data-reject="${r.index}">مش واحد منهم</button><p class="hint" data-review-status></p></div>`).join('');
 container.innerHTML=`<h3>وصل من النواقص: ${report.arrived.length}</h3>${arrived||'<p>مفيش صنف من النواقص اتعرف بثقة في الصور دي.</p>'}`+
  `<section data-gemini-review><h3>محتاج تأكيدك: ${report.review.length}</h3>${review||'<p class="hint">مفيش.</p>'}</section>`+
  `<details><summary>أصناف اتعرفت ومش في النواقص: ${report.other.length}</summary>${report.other.map(o=>`<div class="item"><span dir="auto">${esc(o.name)}</span><div class="hint">${esc(o.item)} · ${esc(o.fileName)}</div></div>`).join('')}</details>`+
  `<details><summary>أسماء مااتعرفتش: ${report.unknown.length}</summary><p class="hint">مش معناها إنها مش موجودة؛ ممكن الاسم مكتوب بشكل مختلف أو القراءة غلط.</p>${report.unknown.map(u=>`<div class="item"><span dir="auto">${esc(u.name)}</span><div class="hint">${esc(u.fileName)}${u.unclear?' · قراءة مش واضحة':''}</div></div>`).join('')}</details>`;
 container.querySelectorAll('[data-confirm]').forEach(b=>b.addEventListener('click',()=>{const [i,j]=b.dataset.confirm.split(':').map(Number);onConfirm(i,j,b)}));
 container.querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click',()=>onReject(Number(b.dataset.reject))));
}

// Keeps the report state; a confirmation saves the name and moves the line to «وصل من النواقص».
function show(container,rows,shortages,client,setStatus){
 const state=rows.map(r=>({...r}));
 const draw=()=>render(container,buildReport(state,shortages),{
  async onConfirm(i,j,button){const r=state[i],opt=buildReport(state,shortages).review.find(x=>x.index===i)?.options[j];if(!opt)return;button.disabled=true;
   const {error}=await client.from('name_aliases').insert({alias_text:r.name,alias_key:r.key,target_name:opt.name,target_code:opt.id||null,source:'incoming-review'});
   if(error&&!/duplicate|unique/i.test(error.message||'')){button.disabled=false;const p=button.closest('[data-review]')?.querySelector('[data-review-status]');if(p)p.textContent='ماتحفظش: '+error.message;return}
   r.match={id:opt.id,name:opt.name,score:1,confidence:'confirmed'};draw();setStatus(`اتحفظ: «${r.name}» = ${opt.name}. المرة الجاية هيتعرف لوحده.`)},
  onReject(i){state[i]={...state[i],candidates:[],match:null};draw()}});
 draw();return buildReport(state,shortages);
}

const api={buildReport,render,show};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AskerGeminiReport=api;
})(typeof window==='undefined'?globalThis:window);
