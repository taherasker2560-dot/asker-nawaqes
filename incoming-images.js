/* ASKER V10: local incoming image OCR. Names are drafts; quantities stay blank. */
(function(root){
'use strict';
const MAX_FILES=10,MAX_FILE_BYTES=8*1024*1024,MAX_TOTAL_BYTES=30*1024*1024;
function clean(s){return String(s??'').replace(/[\u200e\u200f]/g,'').trim()}
function normalized(s){return clean(s).replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
function validFiles(files){if(!files.length)throw Error('اختار صورة واحدة على الأقل.');if(files.length>MAX_FILES)throw Error('اختار بحد أقصى ١٠ صور في المرة.');let total=0;for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('الصور المدعومة JPG وPNG وWebP.');if(file.size>MAX_FILE_BYTES)throw Error('حجم كل صورة لازم يكون أقل من ٨ ميجابايت.');total+=file.size}if(total>MAX_TOTAL_BYTES)throw Error('إجمالي الصور أكبر من ٣٠ ميجابايت.')}
function extractNames(data){
 const words=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[]))).filter(w=>clean(w.text)&&w.bbox&&Number.isFinite(w.bbox.x0)&&Number.isFinite(w.bbox.y0));
 let names=[],priceSeparated=false;
 if(words.length){
  const maxY=Math.max(...words.map(w=>w.bbox.y1));
  const price=words.find(w=>['السعر','سعر','price'].includes(normalized(w.text).toLowerCase())&&w.bbox.y0<maxY*0.25);
  const title=words.find(w=>['الصنف','الاسم','name','item'].includes(normalized(w.text).toLowerCase())&&w.bbox.y0<maxY*0.25);
  const maxX=Math.max(...words.map(w=>w.bbox.x1));const priceRight=price&&(title?price.bbox.x0>title.bbox.x1:price.bbox.x0>maxX*0.6);
  const priceLeft=price&&(title?price.bbox.x1<title.bbox.x0:price.bbox.x1<maxX*0.3);
  priceSeparated=!!(priceRight||priceLeft);
  const selected=words.filter(w=>!(priceSeparated&&Math.abs((w.bbox.y0+w.bbox.y1-price.bbox.y0-price.bbox.y1)/2)<(price.bbox.y1-price.bbox.y0)*0.8)&&!(priceRight&&w.bbox.x0>=price.bbox.x0-4)&&!(priceLeft&&w.bbox.x1<=price.bbox.x1+4));
  const groups=[];
  for(const word of selected.sort((a,b)=>(a.bbox.y0+a.bbox.y1)-(b.bbox.y0+b.bbox.y1))){const mid=(word.bbox.y0+word.bbox.y1)/2,h=word.bbox.y1-word.bbox.y0;let group=groups.find(g=>Math.abs(g.y-mid)<=Math.min(g.h,h)*0.55);if(!group){group={y:mid,h,words:[]};groups.push(group)}group.words.push(word)}
  names=groups.map(g=>{const arabic=g.words.some(w=>/[ء-ي]/.test(w.text));return g.words.sort((a,b)=>arabic?b.bbox.x0-a.bbox.x0:a.bbox.x0-b.bbox.x0).map(w=>clean(w.text)).join(' ')});
 }else names=String(data.text||'').split(/\r?\n/).map(clean);
 names=names.filter(s=>/[\p{L}]/u.test(s)&&!['الصنف','الاسم','اسم الصنف','السعر','name','item','price'].includes(normalized(s).toLowerCase()));
 return {names,priceSeparated};
}
function draftRows(results){const rows=[],seen=new Set();for(const result of results)for(let i=0;i<result.names.length;i++){const name=clean(result.names[i]),signature=normalized(name),duplicate=seen.has(signature);seen.add(signature);rows.push({sourceRow:i+1,sourceLabel:result.fileName,name,rawQuantity:'',include:!duplicate,duplicate})}return rows}
let loader;
function loadOCR(){if(root.Tesseract)return Promise.resolve(root.Tesseract);if(!loader)loader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/tesseract-6.0.1.min.js';script.onload=()=>root.Tesseract?resolve(root.Tesseract):reject(Error('تعذر تجهيز قارئ الصور.'));script.onerror=()=>reject(Error('تعذر تحميل قارئ الصور؛ حدّث الصفحة وحاول مرة أخرى.'));document.head.append(script)}).catch(e=>{loader=null;throw e});return loader}
function detectPriceDivider(ctx,width,height){
 // Detect a persistent darker vertical separator relative to both neighbors.
 // Supplier screenshots have yellow-tinted backgrounds, so neutral-gray detection fails.
 const pixels=ctx.getImageData(0,0,width,height).data;
 const start=Math.floor(width*0.62),end=Math.floor(width*0.9);
 let bestX=-1,bestScore=0;
 const brightness=(x,y)=>{const i=(y*width+x)*4;return (pixels[i]+pixels[i+1]+pixels[i+2])/3};
 for(let x=Math.max(3,start);x<Math.min(width-3,end);x++){
  let hits=0,total=0;
  for(let y=Math.floor(height*0.1);y<Math.floor(height*0.9);y+=6){
   const center=brightness(x,y);
   if(center>190&&brightness(x-3,y)-center>3&&brightness(x+3,y)-center>3)hits++;
   total++;
  }
  const score=hits/Math.max(1,total);
  if(score>bestScore){bestScore=score;bestX=x}
 }
 return bestScore>=0.85?bestX:-1;
}
async function imageCanvas(file,removeRightPriceColumn=false){
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width*bitmap.height>24000000)throw Error('دقة الصورة كبيرة جدًا؛ صدّر نسخة أصغر.');
  let sourceWidth=bitmap.width;
  if(removeRightPriceColumn){
   const probe=document.createElement('canvas');
   probe.width=bitmap.width;probe.height=bitmap.height;
   const ctx=probe.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(bitmap,0,0);
   const divider=detectPriceDivider(ctx,probe.width,probe.height);
   if(divider>0)sourceWidth=divider;
  }
  const scale=Math.min(2,4000/Math.max(sourceWidth,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(sourceWidth*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,sourceWidth,bitmap.height,0,0,canvas.width,canvas.height);
  return canvas;
 }finally{bitmap.close()}
}
function init(){const panel=document.getElementById('incomingPanel');if(!panel)return;const host=document.createElement('details');host.className='file-import incoming-images';host.open=true;host.innerHTML=`<summary>إضافة صور الوارد</summary><p class="hint">اختار صور الأصناف أو الفاتورة، ثم استخرج الأسماء وراجعها. القراءة قد تخطئ؛ مقارنة قائمة الشركة تعمل بالأسماء فقط، دون كميات أو مراجعة إجبارية لكل سطر. الأسعار لا تتحول لكميات. الصور للقراءة والمراجعة، ولا تُرفق بالسجل بعد الحفظ.</p><label for="incomingImages">صور الوارد — حتى ١٠ صور</label><input id="incomingImages" type="file" accept="image/jpeg,image/png,image/webp" multiple><label for="incomingImageLanguage">لغة الأسماء في الصور</label><select id="incomingImageLanguage"><option value="ara">عربي</option><option value="ara+eng">عربي وإنجليزي</option><option value="eng">إنجليزي</option></select><label for="incomingImageQuality">دقة القراءة</label><select id="incomingImageQuality"><option value="best">دقة أعلى — تنزيل أكبر أول مرة</option><option value="fast">أسرع للصور الواضحة</option></select><label><input type="checkbox" data-image-role="crop-prices"> الصورة فيها عمود أسعار على اليمين (محاولة تحديد الفاصل تلقائيًا)</label><p class="hint">لو الفاصل مش واضح، البوت هيقرأ الصورة كاملة بدل القص بنسبة ثابتة.</p><div class="incoming-thumbnails" data-image-role="thumbnails"></div><div class="row"><button type="button" data-image-role="extract" disabled>استخراج الأسماء من الصور</button><button type="button" class="secondary" data-image-role="cancel" disabled>إلغاء قراءة الصور</button></div><div class="status" role="status" aria-live="polite" data-image-role="status">لم يتم اختيار صور.</div><p class="hint">أول استخدام يحتاج اتصالًا لتنزيل قارئ العربي والإنجليزي، وقد يأخذ وقتًا. الصور تُقرأ على جهازك. PDF في خطوة لاحقة.</p>`;
 panel.querySelector('h2').after(host);const el=r=>host.querySelector('[data-image-role="'+r+'"]'),input=host.querySelector('input');let files=[],urls=[],worker=null,run=0,token=null,busy=false,completed=new Map(),pending=[];
 const status=(message,bad=false)=>{el('status').textContent=message;el('status').className='status'+(bad?' bad':'')};
 const release=()=>{for(const url of urls)URL.revokeObjectURL(url);urls=[];el('thumbnails').replaceChildren()};
 function stop(clear){run++;completed.clear();pending=[];if(worker){worker.terminate().catch(()=>{});worker=null}if(token!==null)root.AskerFileImport.cancelIncomingImages(token);token=null;busy=false;el('extract').disabled=!files.length;el('cancel').disabled=!files.length;if(clear){files=[];input.value='';release();el('extract').disabled=true;el('cancel').disabled=true}input.disabled=false;host.querySelectorAll('select').forEach(s=>s.disabled=false)}
 input.addEventListener('change',()=>{stop(false);release();try{files=Array.from(input.files);validFiles(files);for(const file of files){const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');const url=URL.createObjectURL(file);urls.push(url);img.src=url;img.alt=file.name;caption.textContent=file.name;const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.title='افتح الصورة بحجمها الكامل للمراجعة';link.append(img);figure.append(link,caption);el('thumbnails').append(figure)}token=root.AskerFileImport.beginIncomingImages();el('extract').disabled=false;el('cancel').disabled=false;status(`تم اختيار ${files.length} صور. اضغط استخراج الأسماء؛ لم يتم حفظ أي وارد.`)}catch(e){files=[];el('extract').disabled=true;status(e.message,true)}});
 el('cancel').addEventListener('click',()=>{stop(true);status('تم إلغاء قراءة الصور. لم يتم تغيير النص أو حفظ بيانات.')});
 el('extract').addEventListener('click',async()=>{if(busy)return;try{validFiles(files)}catch(e){status(e.message,true);return}const ticket=++run;busy=true;let failed=false;input.disabled=true;host.querySelectorAll('select').forEach(s=>s.disabled=true);el('extract').disabled=true;el('cancel').disabled=false;token=root.AskerFileImport.beginIncomingImages();const importToken=token;let ownedWorker=null;const toProcess=pending.length?pending:[...files.keys()];pending=[];const errors=[];
 try{status('جارٍ تجهيز قارئ الصور…');const Tesseract=await loadOCR();if(ticket!==run)return;
 const quality=host.querySelector('#incomingImageQuality').value;const modelOptions=quality==='best'?{langPath:'https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e12c65a915945e4c28e237a9b52bc4a8f39a0cec',gzip:false,cachePath:'asker-ocr-best-e12c65'}:{cachePath:'asker-ocr-fast-v1'};ownedWorker=await Tesseract.createWorker(host.querySelector('select').value.split('+'),1,{workerPath:new URL('vendor/tesseract-6.0.1.worker.min.js',document.baseURI).href,corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',...modelOptions,logger:m=>{if(ticket===run&&m.status==='recognizing text')status(`جارٍ قراءة الصور… ${Math.round((m.progress||0)*100)}٪ للصورة الحالية`)},errorHandler:()=>{failed=true;if(ticket===run){status('تعذرت قراءة الصور. ألغِ العملية ثم حاول مجددًا؛ النص السابق محفوظ.',true);root.AskerFileImport.cancelIncomingImages(importToken);el('cancel').disabled=false}}});
 if(ticket!==run){await ownedWorker.terminate();return}worker=ownedWorker;await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
 for(let j=0;j<toProcess.length;j++){const i=toProcess[j];if(ticket!==run)return;if(failed){errors.push(...toProcess.slice(j));break}
 status(`جارٍ قراءة الصورة ${i+1} من ${files.length}… تم إنهاء ${completed.size} صورة، ${[...completed.values()].reduce((n,r)=>n+r.names.length,0)} اسم.`);
 let canvas=null;
 try{canvas=await imageCanvas(files[i],host.querySelector('[data-image-role="crop-prices"]').checked);const {data}=await ownedWorker.recognize(canvas,{}, {text:true,blocks:true});if(ticket!==run)return;const extracted=extractNames(data);if(!extracted.names.length)throw Error('لم تظهر أسماء واضحة');completed.set(i,{...extracted,fileName:files[i].name})}
 catch(e){if(ticket!==run)return;errors.push(i);status(`تعذرت قراءة الصورة ${i+1}: ${e.message}. جارٍ متابعة باقي الصور…`,true)}
 finally{if(canvas)canvas.width=canvas.height=1}
 }
 if(ticket!==run)return;
 pending=errors;
 const results=[...completed.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]),rows=draftRows(results);
 if(rows.length>10000)throw Error('عدد السطور المستخرجة أكبر من ١٠٠٠٠.');
 if(rows.length&&root.AskerFileImport.reviewIncomingImages(importToken,rows,`قراءة ${completed.size} من ${files.length} صور`)){
 const uncertain=results.filter(r=>!r.priceSeparated).length;
 status(`تم استخراج ${rows.length} اسم من ${completed.size} صورة. ${pending.length?'فشلت '+pending.length+' صورة؛ اضغط «إعادة محاولة الصور الفاشلة» للاحتفاظ بالنتائج الحالية.':'اكتملت القراءة.'} ${uncertain?'راجع أي أسعار لم يتم فصلها.':''} لم يتم حفظ أي وارد.`,!!pending.length);
 }else if(!rows.length){root.AskerFileImport.cancelIncomingImages(importToken);status('لم تنجح قراءة أي صورة. اضغط إعادة المحاولة؛ لم تتغير البيانات.',true)}
 else status('تم تجاهل نتيجة الصور لأنك بدأت استيرادًا آخر. النص السابق محفوظ.');
 el('extract').textContent=pending.length?'إعادة محاولة الصور الفاشلة':'استخراج الأسماء من الصور';
 }catch(e){if(ticket===run){root.AskerFileImport.cancelIncomingImages(importToken);status('تعذر إتمام قراءة الصور: '+e.message+' — لم يتم تغيير النص أو حفظ بيانات.',true)}}finally{if(ownedWorker)await ownedWorker.terminate().catch(()=>{});if(worker===ownedWorker)worker=null;if(ticket===run){busy=false;input.disabled=false;host.querySelectorAll('select').forEach(s=>s.disabled=false);el('extract').disabled=false;el('cancel').disabled=false}}});
 // Cancel an OCR task if a different import starts, preventing stale results and unnecessary work.
 root.addEventListener('asker-import-reset',event=>{if(busy&&event.detail?.prefix==='incoming'&&event.detail.epoch!==token){stop(false);status('توقفت قراءة الصور لأنك بدأت استيرادًا آخر.')}});
}
const api={extractNames,draftRows,validFiles,init};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AskerIncomingImages=api;
})(typeof window==='undefined'?globalThis:window);
