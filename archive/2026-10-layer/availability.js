/* Supplier availability is a read-only comparison, never a stock receipt. */
(function(root){
'use strict';
const SYMBOLS=/[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️‎‏]/gu;
const GREETING=/السلام عليكم|وعليكم السلام|رحمه الله|رحمة الله|صباح|مساء|تحياتي|وارد اليوم|الوارد|جزاكم|شكرا|عروض اليوم|ارجو|برجاء/;
const SIZE=new Set(['كبير','صغير','كبار','صغار']);
const SECTION=new Set(['الالبان','الثلاجه','الثلاجة','اللبان','البان']);
const norm=s=>String(s).replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[ًٌٍَُِّْـ]/g,'');
const FLAGS=/(?:^|\s)(?:اخر|آخر)\s*كمي[هة]|كمي[هة]\s*(?:بسيط[هة]|محدود[هة])|كميات\s*محدود[هة]|للى\s*ماخدش|للي\s*ماخدش|(?:^|\s)العرض\s*$/g;
// Splits supplier messages (WhatsApp style) into product names. Strength digits stay in the name; quota/offer/discount remarks move to notes.
function parseIncomingLines(text){
 const entries=[],skipped=[];
 for(const original of String(text||'').split(/\r?\n/)){
  let line=original.replace(SYMBOLS,' ').replace(/^[\s*•·\-#>_~]+/,'').replace(/\s+/g,' ').trim();
  if(!line)continue;
  const plain=norm(line);
  if(!/\p{L}/u.test(line)){skipped.push({line:original.trim(),reason:'فاصل'});continue}
  if(GREETING.test(plain)){skipped.push({line:original.trim(),reason:'تحية أو عنوان'});continue}
  if(SECTION.has(plain.replace(/[^\p{L}]/gu,''))){skipped.push({line:original.trim(),reason:'عنوان قسم'});continue}
  const notes=[];
  // discount remark: cut from the word to the end (or closing parenthesis)
  line=line.replace(/\(?\s*خصم[^)]*\)?/,m=>{notes.push(m.replace(/[()]/g,'').trim());return ' '});
  // quota: optional half/quarter, the word (any elongation), then an optional quota count
  line=line.replace(/(?:(نصف|نص|ربع)\s*)?كو+ت[هة](?:\s*(\d+)(?:\s*(?:علبه|علب|عبوه|عبوات))?)?/g,(m,part,n)=>{notes.push(((part?part+' ':'')+'كوته'+(n?' '+n:'')));return ' '});
  // buy+bonus offers like 10+1 (never a strength: first number up to 100 and bonus smaller than it)
  line=line.replace(/(?<!\d)(?<!\d\.)(\d{1,3})\s*\+\s*(\d{1,3})(?!\d)(?!\.\d)/g,(m,a,b)=>{if(+a<=100&&+b<+a){notes.push('عرض '+a+'+'+b);return ' '}return m});
  line=line.replace(/العرض\s*(\d+)\s*ج?/g,(m,n)=>{notes.push('سعر العرض '+n);return ' '});
  line=line.replace(FLAGS,m=>{notes.push(m.trim());return ' '});
  // glue between an Arabic word and its digits: سليسبت500 -> سليسبت 500
  line=line.replace(/([ء-ي])(?=[0-9٠-٩])/g,'$1 ').replace(/\s+/g,' ').trim();
  const pieces=line.split(/\s*(?:\.{2,}|…+)\s*/).map(x=>x.replace(/^[\s.:،,\-]+|[\s.:،,\-]+$/g,'')).filter(Boolean);
  if(!pieces.length){skipped.push({line:original.trim(),reason:'بدون اسم'});continue}
  const base=pieces[0].split(' ').filter(t=>!/^[0-9٠-٩]/.test(t));const firstDigit=pieces[0].split(' ').findIndex(t=>/^[0-9٠-٩]/.test(t));const prefix=(firstDigit>0?pieces[0].split(' ').slice(0,firstDigit):base).join(' ');
  pieces.forEach((piece,i)=>{
   let name=piece;
   if(i>0&&/^[0-9٠-٩]/.test(piece)&&prefix)name=prefix+' '+piece;
   else if(i>0&&SIZE.has(piece)){const t=pieces[0].split(' ');if(SIZE.has(t[t.length-1]))name=t.slice(0,-1).concat(piece).join(' ')}
   if(/\p{L}/u.test(name))entries.push({name,notes:[...notes],original:original.trim()});
   else skipped.push({line:original.trim(),reason:'بدون اسم'});
  });
 }
 return {entries,skipped};
}
function names(text){return [...new Set(parseIncomingLines(text).entries.map(e=>e.name))]}
function classify(input,shortages,deps){const lookup=new Map();for(const item of shortages){const key=deps.norm(deps.asciiDigits(item.product_name));const group=lookup.get(key)||[];group.push(item);lookup.set(key,group)}return input.map(name=>{const exact=lookup.get(deps.norm(deps.asciiDigits(name)))||[];if(exact.length===1)return {name,target:exact[0],kind:'exact'};const alias=deps.approvedAliasSuggestion(name,shortages);if(!exact.length&&alias)return {name,target:alias.item,kind:'alias'};return {name,kind:'unresolved',candidates:(deps.translationCandidates||root.AskerNameTranslation?.candidates)?.(name,shortages)||[]}})}
let compare=async()=>{};
function init(deps){const $=id=>document.getElementById(id),panel=$('incomingPanel'),button=$('saveIncomingBtn'),text=$('incomingText');if(!panel)return;
const control=document.createElement('div');control.innerHTML='<label for="incomingMode">نوع القائمة</label><select id="incomingMode"><option value="availability">قائمة إتاحة الشركة — أسماء فقط</option><option value="receipt">استلام فعلي للصيدلية — بكميات</option></select><p class="hint">قارن أصناف الشركة بالنواقص بدون إدخال كميات. المقارنة لا تسجل استلامًا ولا تخصم من النواقص. النتيجة مؤقتة وتختفي عند تحديث الصفحة.</p>';panel.querySelector('h2').after(control);
const results=document.createElement('div');results.id='availabilityResults';results.setAttribute('aria-live','polite');$('incomingStatus').after(results);
const hint=text.nextElementSibling,original={hint:hint.innerHTML,placeholder:text.placeholder,button:button.textContent};let epoch=0;
const availability=()=>$('incomingMode').value==='availability';
function refresh(){epoch++;results.replaceChildren();control.querySelector('.hint').textContent=availability()?'قارن أصناف الشركة بالنواقص بدون إدخال كميات. المقارنة لا تسجل استلامًا ولا تخصم من النواقص. النتيجة مؤقتة وتختفي عند تحديث الصفحة.':'سجّل الأصناف المستلمة فعليًا مع الكميات. راجع الأسماء والكميات قبل الحفظ؛ تُحسب التغطية من الوارد المرتبط بالنواقص بعد تأكيد المطابقة.';panel.querySelector('h2').textContent=availability()?'مقارنة قائمة الشركة بالنواقص':'تسجيل الوارد اليومي';button.textContent=availability()?'قارن الأسماء بالنواقص':original.button;text.placeholder=availability()?'اسم صنف في كل سطر، بدون كمية\nكونجستال أقراص\nدونازيل 5 مجم أقراص':original.placeholder;hint.innerHTML=availability()?'الأسماء والتركيزات تُحفظ كما هي؛ الرقم داخل الاسم لا يُعامل ككمية. تُعرض الأسماء المطابقة مباشرة، وباقي الأسماء منفصلة للمراجعة عند الحاجة. قراءة الصور قد تخطئ؛ عدم العثور على مطابقة لا يثبت أن الصنف غير موجود.':original.hint;$('receivedOn').parentElement.hidden=availability();$('matchList').hidden=availability();}
compare=async supplied=>{if(!availability())return;const parsed=parseIncomingLines(Array.isArray(supplied)?supplied.map(s=>String(s).trim()).filter(Boolean).join('\n'):text.value);const input=[...new Set(parsed.entries.map(e=>e.name))];const notesBy=new Map();for(const e of parsed.entries)if(e.notes.length&&!notesBy.has(e.name))notesBy.set(e.name,[...new Set(e.notes)]);if(!input.length){$('incomingStatus').textContent='اختار صورًا أو أدخل أسماء الأصناف أولًا.';return}const ticket=++epoch;button.disabled=true;results.replaceChildren();$('incomingStatus').textContent='جارٍ مقارنة الأسماء بكل النواقص…';try{const {data,error}=await deps.readAllRows('shortage_items',q=>q.eq('is_active',true));if(ticket!==epoch)return;if(error)throw error;const rows=classify(input,data||[],deps),matched=rows.filter(r=>r.target),suggested=rows.filter(r=>!r.target&&r.candidates?.length),unresolved=rows.filter(r=>!r.target&&!r.candidates?.length);const escape=deps.esc;const noteLine=r=>notesBy.has(r.name)?`<div class="hint">ملاحظة المورد: ${escape(notesBy.get(r.name).join(' · '))}</div>`:'';const cards=items=>items.map(r=>`<div class="item"><strong>${escape(r.target?.product_name||r.name)}</strong>${noteLine(r)}${r.target?`<div class="hint">ورد في قائمة الشركة: ${escape(r.name)} · ${r.kind==='alias'?'قاموس معتمد':'نفس الاسم'}</div>`:''}</div>`).join('');results.innerHTML=`<h3>أصناف في قائمة الشركة ولها مطابقة بالنواقص: ${matched.length}</h3>${cards(matched)||'<p>لا توجد مطابقات بالاسم أو القاموس المعتمد.</p>'}<section data-translation-results><h3>اقتراحات عربي / إنجليزي تحتاج اختيارك: ${suggested.length}</h3><p class="hint">دي أسماء محتملة من النواقص الحالية، وليست ترجمات أو مطابقات مؤكدة. راجع التركيز والشكل والعبوة من الصورة. الاختيار لهذه المقارنة فقط، من غير حفظ أو خصم.</p>${suggested.map((r,i)=>`<div class="item" data-translation-row="${i}"><strong>${escape(r.name)}</strong>${noteLine(r)}${r.candidates.map((c,j)=>`<div><span dir="auto">${escape(c.item.product_name)}</span><p class="hint">${escape(c.reason)}</p><button type="button" class="secondary" data-translation-choice="${i}:${j}">اختيار للمقارنة فقط</button></div>`).join('')}<p class="hint" data-translation-selection></p><button type="button" class="secondary" data-translation-undo="${i}" hidden>إلغاء الاختيار</button></div>`).join('')||'<p class="hint">لا توجد اقتراحات إضافية.</p>'}</section><details><summary>أسماء لم تتضح مطابقتها: ${unresolved.length}</summary><p class="hint">قد تكون خارج النواقص أو مكتوبة بطريقة مختلفة أو بها خطأ قراءة. لم تُعتبر غير متاحة، ولم تُؤكد أسماء متشابهة تلقائيًا.</p>${cards(unresolved)}</details>`;results.querySelectorAll('[data-translation-choice]').forEach(button=>button.addEventListener('click',()=>{if(ticket!==epoch)return;const [i,j]=button.dataset.translationChoice.split(':').map(Number),row=results.querySelector('[data-translation-row="'+i+'"]'),candidate=suggested[i].candidates[j];row.querySelector('[data-translation-selection]').textContent='اخترت لهذه المقارنة: '+candidate.item.product_name+' — لم يُسجل استلام أو تصحيح دائم.';row.querySelector('[data-translation-undo]').hidden=false;row.querySelectorAll('[data-translation-choice]').forEach(b=>b.disabled=b===button);}));results.querySelectorAll('[data-translation-undo]').forEach(button=>button.addEventListener('click',()=>{if(ticket!==epoch)return;const row=button.closest('[data-translation-row]');row.querySelector('[data-translation-selection]').textContent='';row.querySelectorAll('[data-translation-choice]').forEach(b=>b.disabled=false);button.hidden=true}));$('incomingStatus').textContent=`تمت مقارنة ${input.length} اسم دون كميات.${parsed.skipped.length?` تم تجاهل ${parsed.skipped.length} سطر (تحية أو عنوان أو فاصل).`:''} اقتراحات الترجمة: ${suggested.length} — ليست مطابقات مؤكدة. لم يتم تسجيل استلام أو تغيير النواقص.`;}catch(e){if(ticket===epoch)$('incomingStatus').textContent='تعذرت المقارنة: '+(e.message||e)}finally{if(ticket===epoch)button.disabled=false}};
root.AskerAvailability.compare=(...args)=>compare(...args);
button.addEventListener('click',event=>{if(availability()){event.preventDefault();event.stopImmediatePropagation();compare()}},true);
text.addEventListener('input',()=>{if(!availability())return;epoch++;button.disabled=false;results.replaceChildren();$('incomingStatus').textContent='اتغيرت الأسماء؛ اضغط المقارنة لتحديث النتائج.'});$('incomingMode').addEventListener('change',refresh);refresh();
}
const api={names,parseIncomingLines,classify,init,compare:(...args)=>compare(...args)};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AskerAvailability=api;
})(typeof window==='undefined'?globalThis:window);
