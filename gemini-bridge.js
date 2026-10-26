/* V10 opens the owner-private Gemini reader. No provider key or image API call exists here. */
(function(root){'use strict';
const READER_ORIGIN='https://asker-inventory-lab.purplebadge24.chatgpt.site';
function init(deps){const $=id=>document.getElementById(id),panel=$('incomingPanel');if(!panel)return;const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='تجربة قراءة الصور بـGemini';button.id='openGeminiReader';const hint=document.createElement('p');hint.className='hint';hint.textContent='قارئ تجريبي أقوى يحتاج مفتاح Gemini المجاني. يفتح في مشروعك الخاص، ثم يعيد الأسماء للمقارنة فقط. دقته لم تُعتمد بعد.';panel.querySelector('h2').after(button,hint);
let popup=null,nonce=null,originalText='',contextSent=false;const status=text=>{$('incomingStatus').textContent=text};
button.addEventListener('click',()=>{if($('incomingMode')?.value!=='availability'){status('تجربة Gemini لمقارنة إتاحة الشركة بالأسماء فقط. اختار وضع قائمة إتاحة الشركة أولًا.');return}nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');originalText=$('incomingText').value;contextSent=false;popup=root.open(READER_ORIGIN+'/gemini-reader.html#v10='+nonce,'_blank');if(!popup){status('المتصفح منع فتح تجربة Gemini. اسمح بفتح التبويب الجديد ثم حاول مجددًا.');return}status('فتحت تجربة Gemini في تبويب جديد. راجع قصاصة أسماء الأدوية هناك قبل إرسالها. لو اخترت عدة صور، تُجرّب الصورة الأولى فقط حاليًا.');});
root.addEventListener('message',async event=>{if(!popup||event.source!==popup||event.origin!==READER_ORIGIN||event.data?.nonce!==nonce)return;
 if(event.data.type==='asker-gemini-ready'){
  if(contextSent)return;contextSent=true;const activeNonce=nonce,activePopup=popup;try{const {data,error}=await deps.readAllRows('shortage_items',q=>q.eq('is_active',true));if(error)throw error;if(activeNonce!==nonce||activePopup!==popup)return;const file=$('incomingImages')?.files?.[0];activePopup.postMessage({type:'asker-gemini-context',nonce:activeNonce,context:{rows:(data||[]).map(r=>({id:String(r.id),name:r.product_name})),label:'آخر قائمة V10',asOf:new Date().toISOString()},...(file&&file.size<=8*1024*1024?{photo:file}:{})},READER_ORIGIN)}catch{status('تعذّر إرسال مرجع النواقص لتجربة Gemini. لن نستخدم قائمة جزئية؛ أعد فتح التجربة بعد تحديث النواقص.');}return;
 }
 if(event.data.type!=='asker-gemini-result')return;const names=event.data.names;
 if(!Array.isArray(names)||!names.length||names.length>1000||names.some(n=>typeof n!=='string'||n.length<2||n.length>250||/[\r\n|]/.test(n)))return;
 if($('incomingMode')?.value!=='availability'||$('incomingText').value!==originalText){status('اتغير محتوى الوارد أو وضع الإدخال أثناء تجربة Gemini. الأسماء الحالية محفوظة؛ انسخ نتيجة Gemini وقارنها بعد مراجعة المحتوى.');return}
 const unique=[...new Set(names)];$('incomingText').value=unique.join('\n');await root.AskerAvailability.compare(unique);popup=null;nonce=null;
});
}
const api={init};if(typeof module!=='undefined')module.exports=api;else root.AskerGeminiBridge=api;
})(typeof window==='undefined'?globalThis:window);
