/* ASKER V10: image preparation for OCR. Pure functions on grayscale arrays so they can be unit-tested without a browser. */
(function(root){
'use strict';
function grayscale(rgba,pixels){const g=new Uint8Array(pixels);for(let i=0;i<pixels;i++){const j=i*4;g[i]=(rgba[j]*299+rgba[j+1]*587+rgba[j+2]*114+500)/1000|0}return g}
// Otsu threshold: pixels <= result are "ink".
function otsu(gray){const hist=new Array(256).fill(0);for(let i=0;i<gray.length;i++)hist[gray[i]]++;const total=gray.length;let sum=0;for(let t=0;t<256;t++)sum+=t*hist[t];let sumB=0,wB=0,best=-1,threshold=127;for(let t=0;t<256;t++){wB+=hist[t];if(!wB)continue;const wF=total-wB;if(!wF)break;sumB+=t*hist[t];const mB=sumB/wB,mF=(sum-sumB)/wF,between=wB*wF*(mB-mF)*(mB-mF);if(between>best){best=between;threshold=t}}return threshold}
// Horizontal text bands. A band is a run of rows with ink; tiny gaps are merged, specks are dropped.
function lineBands(gray,width,height,options={}){
 const minHeight=options.minHeight||6,mergeGap=options.mergeGap??2,minInk=options.minInk||2;
 const threshold=Math.max(90,Math.min(otsu(gray),190));
 const hasInk=new Uint8Array(height);
 for(let y=0;y<height;y++){let n=0;const row=y*width;for(let x=0;x<width;x++)if(gray[row+x]<=threshold&&++n>=minInk){hasInk[y]=1;break}}
 const raw=[];let start=-1;
 for(let y=0;y<=height;y++){const on=y<height&&hasInk[y];if(on&&start<0)start=y;else if(!on&&start>=0){raw.push([start,y]);start=-1}}
 const merged=[];for(const [a,b] of raw){const last=merged[merged.length-1];if(last&&a-last[1]<=mergeGap)last[1]=b;else merged.push([a,b])}
 const bands=merged.filter(([a,b])=>b-a>=minHeight).map(([y0,y1])=>({y0,y1,height:y1-y0}));
 if(!bands.length)return {bands,median:0};
 const sorted=bands.map(b=>b.height).sort((a,b)=>a-b),median=sorted[sorted.length>>1];
 for(const b of bands)b.multi=b.height>median*1.9;
 return {bands,median};
}
// Scale that brings typical text to about 34px tall (what the Arabic model reads best), never shrinking and never above 4x.
function scaleFor(medianHeight){if(!medianHeight)return 2;return Math.max(1,Math.min(4,Math.round(34/medianHeight*2)/2))}
function boxBlur(gray,width,height,radius){
 const r=Math.max(1,radius|0),tmp=new Float32Array(width*height),out=new Float32Array(width*height);
 for(let y=0;y<height;y++){let acc=0,count=0;const row=y*width;for(let x=-r;x<=r;x++){const xx=Math.min(width-1,Math.max(0,x));acc+=gray[row+xx];count++}for(let x=0;x<width;x++){tmp[row+x]=acc/count;const add=Math.min(width-1,x+r+1),sub=Math.max(0,x-r);acc+=gray[row+add]-gray[row+sub]}}
 for(let x=0;x<width;x++){let acc=0,count=0;for(let y=-r;y<=r;y++){const yy=Math.min(height-1,Math.max(0,y));acc+=tmp[yy*width+x];count++}for(let y=0;y<height;y++){out[y*width+x]=acc/count;const add=Math.min(height-1,y+r+1),sub=Math.max(0,y-r);acc+=tmp[add*width+x]-tmp[sub*width+x]}}
 return out;
}
// Removes uneven backgrounds/highlighted rows, then makes the line black-on-white. Returns 0/255 per pixel.
function binarizeLine(gray,width,height,options={}){
 const normalize=options.normalize!==false,radius=options.radius||Math.max(8,Math.round(height*0.8));
 let work=gray;
 if(normalize){const bg=boxBlur(gray,width,height,radius);work=new Uint8Array(gray.length);for(let i=0;i<gray.length;i++)work[i]=Math.max(0,Math.min(255,gray[i]/Math.max(1,bg[i])*255+0.5))|0}
 const t=otsu(work),out=new Uint8Array(gray.length);
 let ink=0;for(let i=0;i<work.length;i++){const bit=work[i]>t?255:0;out[i]=bit;if(!bit)ink++}
 // The model expects dark text on a light page; invert if the line is mostly ink (light text on dark rows).
 if(ink>out.length*0.55)for(let i=0;i<out.length;i++)out[i]=255-out[i];
 return out;
}
function cleanLineText(s){return String(s??'').replace(/[‎‏]/g,'').replace(/[|_\[\]{}\\~`]+/g,' ').replace(/\s+/g,' ').replace(/^[\s.\-:،,]+|[\s.\-:،,]+$/g,'').trim()}
const api={grayscale,otsu,lineBands,scaleFor,boxBlur,binarizeLine,cleanLineText};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AskerImagePrep=api;
})(typeof window==='undefined'?globalThis:window);
