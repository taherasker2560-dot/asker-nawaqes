/* Offline experiment only. Never loaded by V10. Does not update stock or aliases. */
const fs=require('node:fs'),path=require('node:path');
const {createWorker}=require('tesseract.js'),{createCanvas,loadImage}=require('@napi-rs/canvas');
const {tableLayout,rowCanvas}=require('./ocr-layout-trial.cjs'),I=require('../incoming-images.js');
const [input,models,output]=process.argv.slice(2);
if(!input||!models||!output)throw Error('Usage: node scripts/benchmark-image-rows.cjs EXTRACTED_ARCHIVE MODEL_DIRECTORY OUTPUT_JSON');
if(require('tesseract.js/package.json').version!=='6.0.1'||require('tesseract.js-core/package.json').version!=='6.0.0')throw Error('Use tesseract.js 6.0.1 and tesseract.js-core 6.0.0 to match V10.');
const refs=JSON.parse(fs.readFileSync(path.join(input,'holdout/references.json')));
const norm=s=>s.toLowerCase().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}]/gu,'');
function distance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old}}return row[b.length]}
const nums=s=>(s.match(/[0-9٠-٩]+/g)||[]).map(norm).join('|');
// Row renderer uses the same pixel operations as the explored browser prototype.
global.document={createElement:()=>createCanvas(1,1)};
(async()=>{
 const worker=await createWorker('ara',1,{langPath:path.resolve(models),gzip:false,cacheMethod:'none'}),rows=[];
 try{for(const file of new Set(refs.map(r=>r.file))){
  const img=await loadImage(path.join(input,'images',file)),original=createCanvas(img.width,img.height);original.getContext('2d').drawImage(img,0,0);
  const plan=tableLayout(original.getContext('2d').getImageData(0,0,img.width,img.height));
  if(!plan)throw Error('No ruled names column found: '+file);
  const scale=Math.min(2,4000/Math.max(img.width,img.height)),base=createCanvas(Math.round(img.width*scale),Math.round(img.height*scale));base.getContext('2d').drawImage(img,0,0,base.width,base.height);
  await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
  const {data}=await worker.recognize(base.toBuffer('image/png'),{},{text:true,blocks:true});
  const flat=(data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]);
  for(const ref of refs.filter(r=>r.file===file)){
   const cy=(ref.source_box[1]+ref.source_box[3])/2;
   const line=flat.filter(l=>l.bbox.y0<=cy*scale&&l.bbox.y1>=cy*scale).sort((a,b)=>a.bbox.x0-b.bbox.x0)[0];
   const headers=flat.filter(l=>l.bbox.y0<scale*40),lines=[...new Set([...headers,...(line?[line]:[])])];
   const baseline=I.extractNames({text:data.text,blocks:[{paragraphs:[{lines}]}]}).names.at(-1)||'';
   const box=plan.rows.find(r=>cy>=r.top&&cy<r.top+r.height);if(!box)throw Error('Reference row not detected: '+file);
   const crop=rowCanvas(original,box);await worker.setParameters({tessedit_pageseg_mode:'13'});
   const {data:d}=await worker.recognize(crop.toBuffer('image/png'),{},{text:true});
   const candidate=d.text.trim();rows.push({file,reference:ref.reference,baseline,candidate,baselineEdit:distance(norm(ref.reference),norm(baseline)),candidateEdit:distance(norm(ref.reference),norm(candidate)),length:norm(ref.reference).length,baselineNumbers:nums(baseline),candidateNumbers:nums(candidate),expected:ref.expected_numbers.join('|')});
  }
 }
 const summary={lines:rows.length,improved:rows.filter(r=>r.candidateEdit<r.baselineEdit).length,worsened:rows.filter(r=>r.candidateEdit>r.baselineEdit).length,unchanged:rows.filter(r=>r.candidateEdit===r.baselineEdit).length,baselineNumeric:rows.filter(r=>r.baselineNumbers===r.expected).length,candidateNumeric:rows.filter(r=>r.candidateNumbers===r.expected).length};
 fs.writeFileSync(output,JSON.stringify({engine:'Tesseract.js 6.0.1; core 6.0.0; pinned Arabic best',summary,rows},null,2));console.log(summary);
 }finally{await worker.terminate();delete global.document}
})().catch(e=>{console.error(e.message);process.exitCode=1});
