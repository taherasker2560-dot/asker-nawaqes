/* Pixel-only table layout. No drug names or guessed numbers enter OCR. */
(function(root){
'use strict';
function tableLayout(image){
 const {width:w,height:h,data}=image;
 if(w<80||h<60||data.length!==w*h*4)return null;
 const gray=new Uint8Array(w*h),projection=new Float64Array(w);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,p=i*4;gray[i]=Math.round((data[p]+data[p+1]+data[p+2])/3);projection[x]+=255-gray[i]}
 for(let x=0;x<w;x++)projection[x]/=h;
 const ridges=[];
 for(let x=4;x<w-4;x++){
  if(projection[x]-(projection[x-4]+projection[x+4])/2<5)continue;
  let hits=0;for(let y=0;y<h;y++)if((gray[y*w+x-4]+gray[y*w+x+4])/2-gray[y*w+x]>5)hits++;
  if(hits/h>.4)ridges.push(x);
 }
 const groups=[];for(const x of ridges){if(groups.length&&x-groups[groups.length-1].at(-1)<4)groups.at(-1).push(x);else groups.push([x])}
 const rules=groups.map(g=>({start:g[0],end:g.at(-1)}));
 // Only crop when a broad, ruled text column is detected. Never assume a fixed side for prices.
 const columns=[];for(let i=1;i<rules.length;i++){const left=rules[i-1].end+3,right=rules[i].start-2;if(right-left>w*.5)columns.push({left,right})}
 if(columns.length!==1)return null;
 const {left,right}=columns[0],ink=new Uint32Array(h),span=right-left;
 for(let y=0;y<h;y++){for(let x=left;x<right;x++)if(gray[y*w+x]<140)ink[y]++;if(ink[y]>span*.8)ink[y]=0}
 const bands=[];let start=-1,last=-1;
 for(let y=0;y<=h+3;y++){
  if(y<h&&ink[y]>=Math.max(2,span*.001)){if(start<0)start=y;last=y}
  else if(start>=0&&y-last>3){if(last-start>=5)bands.push({top:start,bottom:last+1});start=-1}
 }
 const rows=[];
 for(const b of bands){let x0=right,x1=left,total=0;for(let y=b.top;y<b.bottom;y++)for(let x=left;x<right;x++)if(gray[y*w+x]<140){x0=Math.min(x0,x);x1=Math.max(x1,x);total++}
  if(total>=20&&x1-x0>=12)rows.push({left:Math.max(left,x0-2),top:Math.max(0,b.top-2),width:Math.min(right,x1+3)-Math.max(left,x0-2),height:Math.min(h,b.bottom+2)-Math.max(0,b.top-2)});
 }
 if(rows.length<3||rows.length>200)return null;
 return {rows,column:{left,right},rules:rules.length};
}
function rowCanvas(source,row){
 const canvas=document.createElement('canvas');canvas.width=row.width*2+20;canvas.height=row.height*2+20;
 const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,row.left,row.top,row.width,row.height,10,10,row.width*2,row.height*2);
 const image=ctx.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<image.data.length;i+=4){const v=(image.data[i]+image.data[i+1]+image.data[i+2])/3>150?255:0;image.data[i]=image.data[i+1]=image.data[i+2]=v}ctx.putImageData(image,0,0);return canvas;
}
async function recognizeRows(source,worker,{cancelled=()=>false,progress=()=>{}}={}){
 const ctx=source.getContext('2d'),layout=tableLayout(ctx.getImageData(0,0,source.width,source.height));if(!layout)return null;
 const names=[];await worker.setParameters({tessedit_pageseg_mode:'13'});
 try{for(let i=0;i<layout.rows.length;i++){
  if(cancelled())return null;progress(i+1,layout.rows.length);const canvas=rowCanvas(source,layout.rows[i]);let data;
  try{({data}=await worker.recognize(canvas,{}, {text:true}))}finally{canvas.width=canvas.height=1}
  if(cancelled())return null;const name=String(data.text||'').replace(/[\u200e\u200f]/g,'').trim();
  if(/[\p{L}]/u.test(name)&&!['الصنف','الاسم','اسم الصنف','السعر','price','name','item'].includes(name.toLowerCase()))names.push(name);
 }}finally{if(!cancelled())await worker.setParameters({tessedit_pageseg_mode:'6'})}
 return names.length?{names,priceSeparated:true,method:'table_rows'}:null;
}
const api={tableLayout,rowCanvas,recognizeRows};if(typeof module!=='undefined')module.exports=api;else root.AskerOCRLayout=api;
})(typeof window==='undefined'?globalThis:window);
