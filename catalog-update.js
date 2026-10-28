/* ASKER V10: «تحديث قاعدة الأصناف» — builds catalog.json (codes + names only) from a new ASKER_ITEMS export
   in the browser and uploads it to the owner-only Storage bucket asker-private. Same rules as
   scripts/build-catalog.py: active items only, cancelled (ملغى / لاغى) left out, Arabic alternative names
   from NameOld / DESCRIPTION. Arabic names already in the current list are kept for the same item code, so
   nothing learned is lost. The file never leaves the owner's session; prices and other columns are dropped. */
(function(root){'use strict';
const AR=/[ء-ي]/,DEAD=/مل[غع][ىي]|لا[غع][ىي]/;
const ok=s=>!!s&&s!=='NULL'&&s.trim().length>=2&&s.trim().length<=250;

// ';' separated, optional quotes ("" inside quotes), UTF-8 with or without BOM.
function parseCsv(text,sep=';'){
 const rows=[];let row=[],cell='',q=false;
 text=String(text).replace(/^﻿/,'');
 for(let i=0;i<text.length;i++){const ch=text[i];
  if(q){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=ch;continue}
  if(ch==='"')q=true;else if(ch===sep){row.push(cell);cell=''}else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=ch}
 if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}
 return rows;
}

// previous: the current catalog.json (array of [id, name, alts?]) or null
function build(text,previous){
 const rows=parseCsv(text);if(rows.length<2)throw Error('الملف فاضي.');
 const head=rows[0].map(h=>h.trim()),col=n=>head.indexOf(n);
 const iId=col('ID'),iName=col('name'),iOld=col('NameOld'),iDesc=col('DESCRIPTION'),iActive=col('IsActive');
 if(iId<0||iName<0||iActive<0)throw Error('ده مش ملف ASKER_ITEMS: لازم يكون فيه أعمدة ID و name و IsActive.');
 const prevAlts=new Map((previous||[]).map(x=>[String(x[0]),x[2]||[]]));
 const out=[];let arabic=0;
 for(const r of rows.slice(1)){
  const id=(r[iId]||'').trim(),name=(r[iName]||'').trim();
  if(!id||(r[iActive]||'').trim()!=='1'||!ok(name)||DEAD.test(name))continue;
  const alts=[];
  for(const v0 of [iOld>=0?r[iOld]:'',iDesc>=0?r[iDesc]:'',...(prevAlts.get(id)||[])]){const v=(v0||'').trim();
   if(ok(v)&&AR.test(v)&&v!==name&&!DEAD.test(v)&&!alts.includes(v))alts.push(v)}
  if(alts.length)arabic++;
  out.push(alts.length?[id,name,alts.slice(0,5)]:[id,name]);
 }
 if(out.length<1000)throw Error(`الملف فيه ${out.length} صنف شغال بس؛ ده قليل جدًا، غالبًا مش الملف الصح.`);
 return {items:out,arabic};
}

function init(host,deps){
 const box=document.createElement('details');box.className='file-import';box.id='catalogUpdate';
 box.innerHTML='<summary>تحديث قاعدة الأصناف</summary><p class="hint">طلّع ملف ASKER_ITEMS جديد من فارما فلاي (CSV)، واختاره هنا. البوت بياخد الكود والاسم والأسماء العربي بس، ومابيرفعش أسعار ولا أي بيانات تانية. الأسماء العربي اللي في القاعدة القديمة بتفضل.</p><input type="file" accept=".csv,text/csv" data-cat-file><button type="button" data-cat-upload disabled>ارفع القاعدة الجديدة</button><p class="status" data-cat-status></p>';
 host.append(box);
 const file=box.querySelector('[data-cat-file]'),btn=box.querySelector('[data-cat-upload]'),st=box.querySelector('[data-cat-status]');
 let built=null;
 file.addEventListener('change',async()=>{built=null;btn.disabled=true;const f=file.files[0];if(!f)return;st.textContent='بيقرا الملف…';
  try{let prev=null;const {data}=await deps.client.storage.from('asker-private').download('catalog.json');if(data)prev=JSON.parse(await data.text());
   built=build(await f.text(),prev);st.textContent=`جاهز: ${built.items.length} صنف شغال، منهم ${built.arabic} ليهم اسم عربي${prev?` (القاعدة الحالية فيها ${prev.length})`:''}. اضغط «ارفع».`;btn.disabled=false}
  catch(e){st.textContent='تعذّر قراءة الملف: '+e.message}});
 btn.addEventListener('click',async()=>{if(!built)return;btn.disabled=true;st.textContent='بيرفع…';
  const blob=new Blob([JSON.stringify(built.items)],{type:'application/json'});
  const {error}=await deps.client.storage.from('asker-private').upload('catalog.json',blob,{upsert:true,contentType:'application/json'});
  if(error){st.textContent='ماترفعش: '+error.message;btn.disabled=false;return}
  const {data}=await deps.invoke({action:'reload'});
  st.textContent=`اترفعت القاعدة الجديدة (${built.items.length} صنف).${data?.items?' والقراءة بقت شغالة بيها.':' القراءة هتستخدمها خلال ساعة.'}`;built=null;file.value=''});
 return box;
}

const api={parseCsv,build,init};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AskerCatalogUpdate=api;
})(typeof window==='undefined'?globalThis:window);
