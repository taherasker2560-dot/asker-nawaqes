/* Trade-name search hints, not clinical translations or approved SKU matches. */
(function(root){
'use strict';
const hints={
 'بروفين':'brufen','بروفن':'brufen','بارافين':'paraffin','باروفين':'parofen',
 'جلوكوفاج':'glucophage','جلوكوفاش':'glucophage','كابوتن':'capoten','كابوتين':'capoten',
 'تيجريتول':'tegretol','زيبركسا':'zyprexa','ليبانتيل':'lipanthyl','مينيرين':'minirin',
 'اندرال':'inderal','كونترولوك':'controloc','كونترلوك':'controloc','كريستور':'crestor',
 'ستربتوكين':'streptoquin','ميجابيو':'megabio','دونازيل':'donazil','زابيميرت':'zapimert',
 'فالساتنس':'valsatens','سبازموبينافير':'spasmopinaver','سيتال':'cetal','بانادول':'panadol',
 'بنادول':'panadol','اوجمنتين':'augmentin','كونكور':'concor','فولتارين':'voltaren',
 'كتافلام':'cataflam','انتينال':'antinal','فلاجيل':'flagyl','زيرتك':'zyrtec',
 'تلفاست':'telfast','نيكسيوم':'nexium','دافلون':'daflon','فيوسيدين':'fucidin'
};
const terms={
 'اقراص':'tab','قرص':'tab','تابلت':'tab','تاب':'tab','tablets':'tab','tablet':'tab','tabs':'tab','tabl':'tab',
 'كبسول':'cap','كبسولات':'cap','كبسوله':'cap','كبسولة':'cap','capsules':'cap','capsule':'cap','caps':'cap',
 'شراب':'syr','syrup':'syr','syp':'syr','معلق':'susp','suspension':'susp',
 'نقط':'drops','قطرات':'drops','قطره':'drops','drop':'drops',
 'كريم':'cream','cr':'cream','crm':'cream','مرهم':'oint','ointment':'oint','جل':'gel',
 'لبوس':'supp','suppository':'supp','suppositories':'supp','فوار':'sachet','اكياس':'sachet','كيس':'sachet','sachets':'sachet',
 'امبول':'amp','امبولات':'amp','ampoule':'amp','ampoules':'amp','فيال':'vial','حقن':'inj','injection':'inj',
 'بخاخ':'spray','لوشن':'lotion','غسول':'wash','زيت':'oil','مجم':'mg','ملجم':'mg','ملغ':'mg','مليجرام':'mg',
 'ميكروجرام':'mcg','ميكروغرام':'mcg','مل':'ml','جرام':'gm','جم':'gm','g':'gm',
 'بلس':'plus','ممتد':'sr','مضغ':'chew','ذوبان':'melt','ملت':'melt','ميلت':'melt','mg':'mg','mcg':'mcg','ml':'ml'
};
const forms=new Set(['tab','cap','syr','susp','drops','cream','oint','gel','supp','sachet','amp','vial','inj','spray','lotion','wash','oil']);
const units=new Set(['mg','mcg','ml','gm','iu','%']);
const modifiers=new Set(['plus','sr','cr','xr','xl','retard','melt','chew','forte','extra']);
function normalize(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/٫/g,'.').replace(/٪/g,'%').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\u064B-\u065F\u0670ـ\u200e\u200f]/g,'').replace(/([\p{L}])([0-9])/gu,'$1 $2').replace(/([0-9])([\p{L}])/gu,'$1 $2').replace(/[^\p{L}\p{N}.%/]+/gu,' ').replace(/\.(?!\d)|(?<!\d)\./g,' ').replace(/%/g,' % ').replace(/\s*\/\s*/g,'/').replace(/\s+/g,' ').trim()}
const termMap=new Map(Object.entries(terms).map(([a,b])=>[normalize(a),b]));
function describe(value){
 const tokens=normalize(value).split(/\s+/).filter(Boolean).map(t=>termMap.get(t)||t),packs=[],numbers=[],unitList=[],brand=[],mods=[];
 let form='';
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i];if(forms.has(t)){form=form||t;continue}if(units.has(t)){unitList.push(t);continue}if(modifiers.has(t)){mods.push(t);continue}
  if(/^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*$/.test(t)){
   if(['tab','cap','supp','sachet','amp','vial'].includes(tokens[i+1]))packs.push(t);else numbers.push(t);continue;
  }
  if(/[\p{L}]/u.test(t))brand.push(t);
 }
 // Arabic lists often write strength immediately before the dosage form, e.g. كابوتن 50 اقراص.
 // Keep that numeric ambiguity visible; never silently classify it as a pack count.
 return {raw:value,brand:brand.join(' '),form,numbers,packs,units:unitList,modifiers:mods.sort(),tokens};
}
function skeleton(value){
 const ar={ب:'b',پ:'b',ت:'t',ط:'t',ث:'th',ج:'j',ح:'h',خ:'kh',د:'d',ض:'d',ذ:'z',ر:'r',ز:'z',س:'s',ص:'s',ش:'sh',ع:'',غ:'gh',ف:'f',ڤ:'f',ق:'k',ك:'k',ل:'l',م:'m',ن:'n',ه:'h',و:'',ي:'',ء:'',ئ:'',ؤ:'',ا:''};
 return normalize(value).replace(/[\u0621-\u064aپڤ]/g,c=>ar[c]??c).replace(/ph/g,'f').replace(/ch|sh/g,'sh').replace(/c(?=[eiy])/g,'s').replace(/[cq]/g,'k').replace(/g/g,'j').replace(/v/g,'f').replace(/p/g,'b').replace(/[aeiouyw\s]/g,'').replace(/(.)\1+/g,'$1');
}
function distance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old}}return row[b.length]}
function numericValues(d){return [...d.numbers,...d.packs].flatMap(t=>t.split('/'))}
function compatible(a,b){
 if(a.form&&b.form&&a.form!==b.form)return false;
 if(a.modifiers.join('|')!==b.modifiers.join('|'))return false;
 const an=numericValues(a),bn=numericValues(b);
 const queryStrength=a.numbers.length?a.numbers:(a.packs.length===1?a.packs:[]);
 if(queryStrength.length&&b.numbers.length&&queryStrength.flatMap(t=>t.split('/')).join('|')!==b.numbers.flatMap(t=>t.split('/')).join('|'))return false;
 // All input numbers must be present in the same order. A missing strength is never manufactured.
 let j=0;for(const n of an){while(j<bn.length&&bn[j]!==n)j++;if(j===bn.length)return false;j++}
 // Do not match a missing/different unit by converting mg/mcg or ignoring a volume.
 for(const u of new Set(a.units))if(!b.units.includes(u))return false;
 return true;
}
const prepared=new WeakMap();
function candidates(name,shortages,limit=3){
 if(!Array.isArray(shortages))return [];
 let index=prepared.get(shortages);if(!index){index=shortages.filter(s=>s.is_active!==false).map(item=>({item,desc:describe(item.product_name)}));prepared.set(shortages,index)}
 const q=describe(name);if(!q.brand||q.brand.length>120||!/[\p{L}]/u.test(q.brand))return [];
 const words=q.brand.split(' '),mapped=words.map(t=>hints[t]||t).join(' '),hasHint=mapped!==q.brand,qs=skeleton(mapped),results=[];
 if(qs.length<3)return [];
 for(const {item,desc:d} of index){
  if(!compatible(q,d)||!d.brand)continue;
  const target=d.brand,ts=skeleton(target);let score=0;
  if(mapped===target)score=1;
  else if(hasHint){if(mapped!==target)continue}
  else if(qs===ts)score=.9;
  else if(qs.length>=5&&ts.length>=5&&qs[0]===ts[0]){const edit=distance(qs,ts);if(edit<=1)score=.8}
  if(!score)continue;
  const complete=q.form&&d.form&&q.form===d.form&&numericValues(q).join('|')===numericValues(d).join('|')&&q.units.join('|')===d.units.join('|');
  results.push({item,score,kind:'translation_candidate',complete:!!complete,reason:complete?'اسم عربي/إنجليزي مقترح؛ راجع العبوة قبل الاختيار.':'اسم محتمل؛ راجع التركيز والشكل وحجم العبوة من الصورة.'});
 }
 return results.sort((a,b)=>b.score-a.score||String(a.item.product_name).localeCompare(String(b.item.product_name))).slice(0,limit);
}
const api={normalize,describe,skeleton,candidates};if(typeof module!=='undefined')module.exports=api;else root.AskerNameTranslation=api;
})(typeof window==='undefined'?globalThis:window);
