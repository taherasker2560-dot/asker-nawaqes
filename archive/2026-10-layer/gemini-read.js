/* ASKER V10: optional Gemini reading of incoming images through the Supabase function read-supplier-image.
   No API key here: the browser sends each image with the signed-in session; the key stays in Supabase secrets.
   Availability mode: a «وصل من النواقص» report (gemini-report.js). Receipt mode: the same review step as the local
   OCR, with the matched item name when the match is clear. Nothing is saved automatically. */
(function(root){'use strict';
const FUNCTION_NAME='read-supplier-image';
function base64(buffer){const bytes=new Uint8Array(buffer);let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s)}
// supabase-js puts the HTTP response of a failed call in error.context.
async function errorMessage(error){try{const body=await error?.context?.json?.();if(body?.message)return body.message}catch{}return error?.message||'خطأ غير معروف'}
function summarize(results){const unclear=results.flatMap(r=>r.unclear.map(n=>r.fileName+': '+n));return {count:results.reduce((n,r)=>n+r.names.length,0),unclear}}
function init(deps){const host=document.querySelector('#incomingPanel .incoming-images');if(!host||!deps?.client?.functions)return;
 const el=r=>host.querySelector('[data-image-role="'+r+'"]'),input=host.querySelector('#incomingImages');
 const button=document.createElement('button');button.type='button';button.className='secondary';button.id='geminiReadImages';button.textContent='قراءة الصور بـ Gemini — أدق في الأرقام';button.disabled=true;
 const hint=document.createElement('p');hint.className='hint';hint.textContent='الصور بتتبعت لـ Google Gemini عن طريق Supabase، والمفتاح مش موجود في الصفحة. في الخطة المجانية Google ممكن تستخدم الصور لتحسين خدماتها، فماتبعتش صور فيها بيانات مرضى. النتيجة بتنزل للمراجعة زي القراءة المحلية، ومفيش حاجة بتتحفظ أوتوماتيك.';
 el('extract').parentElement.after(button,hint);
 const invoke=body=>deps.client.functions.invoke(FUNCTION_NAME,{body});
 const dictionary=root.AskerGeminiReport?.manager?root.AskerGeminiReport.manager(hint.parentElement,deps.client):null;
 if(root.AskerCatalogUpdate)root.AskerCatalogUpdate.init(hint.parentElement,{client:deps.client,invoke});
 const reviewList=root.AskerGeminiReport?.reviewList?root.AskerGeminiReport.reviewList(hint.parentElement,{client:deps.client,invoke},m=>{el('status').textContent=m;dictionary?.reload()}):null;
 let run=0,busy=false;const status=(m,bad=false)=>{el('status').textContent=m;el('status').className='status'+(bad?' bad':'')};
 input.addEventListener('change',()=>{run++;busy=false;button.disabled=!input.files.length});
 root.addEventListener('asker-import-reset',()=>{if(busy){run++;busy=false;button.disabled=!input.files.length}});
 button.addEventListener('click',async()=>{if(busy)return;const files=Array.from(input.files||[]);try{root.AskerIncomingImages.validFiles(files)}catch(e){status(e.message,true);return}
  const token=root.AskerFileImport.beginIncomingImages(),ticket=++run;busy=true;button.disabled=true;const results=[],allRows=[];let catalogSize=0;
  try{for(let i=0;i<files.length;i++){if(ticket!==run)return;status(`جارٍ قراءة الصورة ${i+1} من ${files.length} بـ Gemini…`);
    const image=base64(await files[i].arrayBuffer());const {data,error}=await deps.client.functions.invoke(FUNCTION_NAME,{body:{image,mimeType:files[i].type}});if(ticket!==run)return;
    if(error)throw Error(`الصورة ${i+1}: ${await errorMessage(error)}`);
    const rows=Array.isArray(data?.rows)?data.rows.filter(r=>typeof r?.name==='string'&&r.name.trim().length>=2):[];
    if(!rows.length)throw Error(`Gemini ماطلّعش أسماء من الصورة ${i+1}. جرّب صورة أوضح أو القراءة المحلية.`);
    const sure=r=>r.match&&(r.match.confidence==='confirmed'||r.match.confidence==='high');catalogSize=Number(data.catalog)||0;
    allRows.push(...rows.map(r=>({...r,name:r.name.trim(),fileName:files[i].name})));
    results.push({fileName:files[i].name,names:rows.map(r=>sure(r)?r.match.name:r.name.trim()),unclear:rows.filter(r=>r.unclear).map(r=>r.name.trim()),truncated:!!data.truncated,priceSeparated:true})}
   const {count,unclear}=summarize(results),cut=results.filter(r=>r.truncated).length,noCatalog=catalogSize?'':' قاعدة الأصناف لسه مش مرفوعة على Supabase، فالتقريب للأصناف مش شغال.';
   if(document.getElementById('incomingMode')?.value==='availability'&&root.AskerGeminiReport&&deps.readAllRows){
    root.AskerFileImport.cancelIncomingImages(token);status('جارٍ مقارنة الأصناف بالنواقص…');
    const {data:shortages,error}=await deps.readAllRows('shortage_items',q=>q.eq('is_active',true));if(ticket!==run)return;if(error)throw Error('تعذّر قراءة النواقص: '+(error.message||error));
    const {data:ign}=await deps.client.from('name_review_queue').select('alias_key').eq('ignored',true).limit(5000);if(ticket!==run)return;
    const rep=root.AskerGeminiReport.show(document.getElementById('availabilityResults'),allRows,shortages||[],{client:deps.client,invoke,ignored:new Set((ign||[]).map(x=>x.alias_key)),
     getContext:()=>({supplier:(document.getElementById('supplier')?.value||'').replace(/\s+/g,' ').trim().slice(0,120),date:document.getElementById('receivedOn')?.value||new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)}),
     focusSupplier:()=>document.getElementById('supplier')?.focus(),onArrivals:()=>{try{root.AskerReloadShortages?.()}catch(e){}},onQueued:()=>reviewList?.reload(),onChange:()=>reviewList?.reload()},m=>{status(m);dictionary?.reload()});
    status(`اتقرى ${count} سطر من ${files.length} صور. وصل من النواقص: ${rep.arrived.length}، محتاج تأكيدك: ${rep.review.length}.${noCatalog} ${cut?`في ${cut} صورة النتيجة ممكن تكون ناقصة؛ قسّمها.`:''} مفيش حاجة اتحفظت غير الأسماء اللي هتأكدها.`.replace(/\s+/g,' '));return}
   const rows=root.AskerIncomingImages.draftRows(results);
   if(!root.AskerFileImport.reviewIncomingImages(token,rows,`قراءة Gemini لـ ${files.length} صور`)){status('تم تجاهل نتيجة Gemini لأنك بدأت استيرادًا آخر. النص السابق محفوظ.');return}
   status(`تم استخراج ${count} اسم بـ Gemini. ${unclear.length?`Gemini مش متأكد من ${unclear.length} سطر، راجعهم كويس: ${unclear.slice(0,10).join('، ')}${unclear.length>10?'…':''}.`:''} ${cut?`في ${cut} صورة النتيجة ممكن تكون ناقصة؛ قسّمها.`:''} ${noCatalog} راجع الأسماء والتركيزات مع الصورة. لم يتم الحفظ.`.replace(/\s+/g,' '))}
  catch(e){if(ticket===run){root.AskerFileImport.cancelIncomingImages(token);status('تعذّرت قراءة Gemini: '+e.message+' — لم يتم تغيير النص أو حفظ بيانات.',true)}}
  finally{if(ticket===run){busy=false;button.disabled=!input.files.length}}});
}
// Puts the Gemini button first and folds the older readers (Tesseract on the phone, the Sites reader) into
// «طرق قراءة قديمة». Nothing is removed; they work as before when opened.
function tidy(){const host=document.querySelector('#incomingPanel .incoming-images'),gem=document.getElementById('geminiReadImages');if(!host||!gem||document.getElementById('oldReaders'))return;
 const old=document.createElement('details');old.className='file-import';old.id='oldReaders';old.innerHTML='<summary>طرق قراءة قديمة (Tesseract على الموبايل وقارئ Sites)</summary>';
 const extractRow=host.querySelector('[data-image-role="extract"]')?.parentElement;
 extractRow?.before(gem,gem.nextElementSibling&&gem.nextElementSibling.tagName==='P'?gem.nextElementSibling:document.createTextNode(''));
 const move=[document.querySelector('label[for="incomingImageLanguage"]'),document.getElementById('incomingImageLanguage'),document.querySelector('label[for="incomingImageQuality"]'),document.getElementById('incomingImageQuality'),extractRow,extractRow?.parentElement===host?host.querySelector('[data-image-role="status"]')?.nextElementSibling:null,document.getElementById('openGeminiReader'),document.getElementById('openGeminiReader')?.nextElementSibling,document.getElementById('restoreBeforeGemini')].filter(x=>x&&x.tagName);
 const status=host.querySelector('[data-image-role="status"]');move.forEach(x=>old.append(x));const q=document.getElementById('reviewQueue');if(status&&q)status.after(q);host.append(old)}
const api={tidy,init,base64,summarize,errorMessage};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AskerGeminiRead=api;
})(typeof window==='undefined'?globalThis:window);
