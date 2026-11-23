const assert=require('node:assert/strict'),P=require('../image-prep.js');
// Synthetic page: light background with three dark text-like bars, one tall merged block, and a one-row speck.
const W=120,H=100,g=new Uint8Array(W*H).fill(235);
const bar=(y0,y1)=>{for(let y=y0;y<y1;y++)for(let x=10;x<100;x++)g[y*W+x]=30};
bar(5,17);bar(25,37);bar(45,57);bar(70,98);g[63*W+50]=30;
const {bands,median}=P.lineBands(g,W,H);
assert.equal(bands.length,4,'a single dark pixel is not a line');
assert.deepEqual(bands.slice(0,3).map(b=>[b.y0,b.y1]),[[5,17],[25,37],[45,57]]);
assert.equal(median,12);assert.equal(bands[3].multi,true);assert.equal(bands[0].multi,false,'tall blocks are flagged for page-mode reading');
assert.equal(P.scaleFor(12),3);assert.equal(P.scaleFor(40),1,'large text is never shrunk');assert.equal(P.scaleFor(3),4,'tiny text is capped at 4x');assert.equal(P.scaleFor(0),2);
// Line binarization: dark ink on a coloured highlight becomes black on white; light text on a dark row is inverted back.
const w=40,h=12,hi=new Uint8Array(w*h).fill(200);for(let y=3;y<9;y++)for(let x=5;x<35;x++)hi[y*w+x]=40;
const bin=P.binarizeLine(hi,w,h,{normalize:false});assert.equal(bin[0],255);assert.equal(bin[5*w+10],0);
const dark=new Uint8Array(w*h).fill(30);for(let y=3;y<9;y++)for(let x=5;x<35;x++)dark[y*w+x]=230;
const inv=P.binarizeLine(dark,w,h,{normalize:false});assert.equal(inv[0],255,'background must end up white');assert.equal(inv[5*w+10],0);
// Shaded page (left dark, right light) still separates the ink once the background is normalised.
const shade=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)shade[y*w+x]=x<20?120:230;for(let y=3;y<9;y++)for(let x=5;x<35;x++)shade[y*w+x]=x<20?40:90;
const sb=P.binarizeLine(shade,w,h,{normalize:true});assert.equal(sb[5*w+8],0);assert.equal(sb[5*w+30],0);assert.equal(sb[1*w+8],255);assert.equal(sb[1*w+30],255);
assert.equal(P.cleanLineText(' |  انفكتوميسين 500 مجم‏ 6 قرص _ '),'انفكتوميسين 500 مجم 6 قرص');
assert.equal(P.cleanLineText(null),'');
assert.equal(P.grayscale(new Uint8Array([255,255,255,255,0,0,0,255]),2).join(),'255,0');
console.log('PASS: line detection ignores specks and flags merged blocks, scale selection, ink/background polarity, shaded-page normalisation and text cleanup');
