/* Local-only OCR correction review. No network calls. */
(function(){
'use strict';
const KEY='asker-ocr-corrections-v1';
const $=id=>document.getElementById(id);
const normalize=s=>String(s||'').normalize('NFKC').replace(/[\u064b-\u065f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}}
function render(){
 const target=$('reviewRows');if(!target)return;target.replaceChildren();
 const dict=read();
 for(const line of $('output').value.split(/\r?\n/)){
  const raw=line.trim();
  if(!raw||raw.startsWith('---')||raw.startsWith('فشلت القراءة'))continue;
  const wrapper=document.createElement('div');wrapper.className='review-row';
  const original=document.createElement('p');original.textContent='قراءة OCR: '+raw;
  const field=document.createElement('input');field.type='text';field.value=dict[normalize(raw)]||raw;field.setAttribute('aria-label','الاسم الصحيح');
  const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';label.append(check,document.createTextNode(' اعتمد التصحيح واحفظه'));
  wrapper.append(original,field,label);wrapper._ocr={raw,field,check};target.append(wrapper);
 }
}
document.addEventListener('DOMContentLoaded',()=>{
 const out=$('output');if(!out)return;
 const section=document.createElement('section');section.className='card';
 section.innerHTML='<h2>مراجعة أسماء الأدوية</h2><p class="hint">الاقتراحات هنا من تصحيحاتك السابقة على نفس الجهاز فقط. راجع الأسماء والتركيزات قبل الاعتماد. لا يتم إرسال أي شيء لقاعدة البيانات.</p><div id="reviewRows"></div><button id="reviewSave" type="button">حفظ التصحيحات المحددة</button> <button id="reviewExport" type="button">تصدير قاموس التصحيحات</button>';
 out.before(section);
 const feedback=document.createElement('p');feedback.id='reviewFeedback';feedback.setAttribute('role','status');feedback.style.fontWeight='bold';section.append(feedback);
 const observer=new MutationObserver(render);observer.observe(out,{attributes:true,attributeFilter:['data-ocr-ready']});
 $('reviewSave').onclick=()=>{
  const dict=read();let count=0;
  for(const row of $('reviewRows').children){const {raw,field,check}=row._ocr;if(check.checked&&field.value.trim()){dict[normalize(raw)]=field.value.trim();count++}}
  if(!count){feedback.textContent='لم يتم تحديد أي تصحيح للحفظ. فعّل علامة الصح أسفل الاسم الذي عدّلته.';return}
  try{localStorage.setItem(KEY,JSON.stringify(dict));feedback.textContent='تم حفظ '+count+' تصحيح على هذا الجهاز بنجاح.';render()}
  catch(e){feedback.textContent='تعذر الحفظ على الجهاز: '+e.message}
 };
 $('reviewExport').onclick=()=>{
  const blob=new Blob([JSON.stringify(read(),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='asker-ocr-corrections.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 render();
});
})();