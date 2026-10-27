/* V10 opens the owner-private Gemini reader. No provider key or image API call exists here.
   Message contract with the reader is unchanged: asker-gemini-ready -> asker-gemini-context -> asker-gemini-result. */
(function(root){'use strict';
const READER_ORIGIN='https://asker-inventory-lab.purplebadge24.chatgpt.site';
const MAX_PHOTOS=20,MAX_PHOTO_BYTES=8*1024*1024,MAX_NAMES=1600;
const validName=n=>typeof n==='string'&&n.trim().length>=2&&n.length<=250&&!/[\r\n|]/.test(n);
function init(deps){const $=id=>document.getElementById(id),panel=$('incomingPanel');if(!panel)return;
 const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='تجربة قراءة الصور بـGemini';button.id='openGeminiReader';
 const hint=document.createElement('p');hint.className='hint';hint.textContent='قارئ صور يحتاج مفتاح Gemini المجاني. يفتح في مشروعك الخاص، ثم يعيد الأسماء للمقارنة فقط. دقته لم تُعتمد بعد.';
 // Gemini names replace the textarea; this button brings back what was there before.
 const restore=document.createElement('button');restore.type='button';restore.className='secondary';restore.id='restoreBeforeGemini';restore.textContent='رجّع النص اللي كان قبل Gemini';restore.hidden=true;
 panel.querySelector('h2').after(button,hint,restore);
 let popup=null,nonce=null,originalText='',contextSent=false,beforeGemini=null;
 const status=text=>{$('incomingStatus').textContent=text};
 const close=()=>{popup=null;nonce=null;contextSent=false};
 restore.onclick=()=>{if(beforeGemini===null)return;$('incomingText').value=beforeGemini;beforeGemini=null;restore.hidden=true;$('incomingText').dispatchEvent?.(new Event('input',{bubbles:true}));status('رجع النص اللي كان قبل نتيجة Gemini.')};
 button.addEventListener('click',()=>{if($('incomingMode')?.value!=='availability'){status('تجربة Gemini لمقارنة إتاحة الشركة بالأسماء فقط. اختار وضع قائمة إتاحة الشركة أولًا.');return}
  nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');originalText=$('incomingText').value;contextSent=false;
  popup=root.open(READER_ORIGIN+'/gemini-reader.html#v10='+nonce,'_blank');
  if(!popup){close();status('المتصفح منع فتح تجربة Gemini. اسمح بفتح التبويب الجديد ثم حاول مجددًا.');return}
  status('فتحت تجربة Gemini في تبويب جديد. راجع قصاصة أسماء الأدوية هناك قبل إرسالها. يمكنك مراجعة وإرسال لحد ٢٠ صورة في التجربة.');});
 root.addEventListener('message',async event=>{if(!popup||event.source!==popup||event.origin!==READER_ORIGIN||event.data?.nonce!==nonce)return;
  if(event.data.type==='asker-gemini-ready'){
   if(contextSent)return;contextSent=true;const activeNonce=nonce,activePopup=popup;
   // Photos are checked before reading the shortages so an oversized image gets its own message.
   const all=Array.from($('incomingImages')?.files||[]),tooBig=all.filter(f=>f.size>MAX_PHOTO_BYTES),usable=all.filter(f=>f.size<=MAX_PHOTO_BYTES),files=usable.slice(0,MAX_PHOTOS),dropped=usable.length-files.length;
   let rows;try{const {data,error}=await deps.readAllRows('shortage_items',q=>q.eq('is_active',true));if(error)throw error;rows=data||[]}
   catch{if(activeNonce===nonce)contextSent=false;status('تعذّر قراءة النواقص من قاعدة البيانات لتجربة Gemini. لن نستخدم قائمة جزئية؛ اتأكد من الاتصال وأعد فتح التجربة.');return}
   if(activeNonce!==nonce||activePopup!==popup)return;
   activePopup.postMessage({type:'asker-gemini-context',nonce:activeNonce,context:{rows:rows.map(r=>({id:String(r.id),name:r.product_name})),label:'آخر قائمة V10',asOf:new Date().toISOString()},...(files.length?{photos:files}:{})},READER_ORIGIN);
   const notes=[];if(tooBig.length)notes.push('اتشالت '+tooBig.length+' صورة أكبر من ٨ ميجا: '+tooBig.map(f=>f.name).join('، ')+'. صغّرها وابعتها تاني لو محتاجها.');if(dropped)notes.push('اتبعت أول '+MAX_PHOTOS+' صورة بس، و'+dropped+' صورة زيادة ماتبعتتش.');
   status('اتبعتت قائمة النواقص'+(files.length?' و'+files.length+' صورة':'')+' لتجربة Gemini.'+(notes.length?' '+notes.join(' '):''));
   return;
  }
  if(event.data.type!=='asker-gemini-result')return;
  if(!contextSent){status('وصلت نتيجة من Gemini قبل ما قائمة النواقص تتبعت له؛ اتجاهلت. أعد فتح التجربة.');return}
  const names=event.data.names;
  if(!Array.isArray(names)||!names.length){status('Gemini رجّع نتيجة فاضية. مفيش حاجة اتغيرت.');return}
  if(names.length>MAX_NAMES){status('Gemini رجّع أكتر من '+MAX_NAMES+' اسم؛ النتيجة اترفضت. جرّب صور أقل.');return}
  const valid=names.filter(validName).map(n=>n.trim()),rejected=names.length-valid.length;
  if(!valid.length){status('كل الأسماء اللي رجعت من Gemini مش صالحة ('+rejected+'). مفيش حاجة اتغيرت.');return}
  if($('incomingMode')?.value!=='availability'||$('incomingText').value!==originalText){close();status('اتغير محتوى الوارد أو وضع الإدخال أثناء تجربة Gemini، فالنتيجة اتجاهلت والتجربة اتقفلت. الأسماء الحالية محفوظة؛ أعد فتح التجربة لو محتاجها.');return}
  const unique=[...new Set(valid)];close();
  beforeGemini=originalText;restore.hidden=!originalText.trim();
  $('incomingText').value=unique.join('\n');
  try{await root.AskerAvailability.compare(unique);if(rejected)status($('incomingStatus').textContent+' اتجاهل '+rejected+' اسم مش صالح من نتيجة Gemini.')}
  catch(e){status('الأسماء وصلت من Gemini واتحطت في الخانة، بس المقارنة فشلت: '+(e?.message||e)+'. اضغط «قارن الأسماء بالنواقص» تاني.')}
 });
}
const api={init};if(typeof module!=='undefined')module.exports=api;else root.AskerGeminiBridge=api;
})(typeof window==='undefined'?globalThis:window);
