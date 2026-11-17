// The calm music on the store site (store/music.js, owner 2026-11-17: «هو يفتح تلقائي بالصوت والإغلاق يبقى له زرار» and «زرار مخفي، أنا عاوزه يسمع»).
// The browser's sound engine is replaced by a small fake that, like Chrome, refuses to start before the person touches the page, so what is tested is OUR logic:
// it starts by itself and on the first tap, the quiet button stops it and the stop is remembered, the pharmacy's own phone hears nothing and sees no button,
// a hidden page / a voice note keep it quiet, and the button keeps out of the way of the bottom bar and the message box. A real Chrome also renders 10 s of the
// real music graph (no wrong connection, not silent, no clipping). Made-up data only: the repository is public.
const {run,assert}=require('./harness.cjs');

const FAKE=()=>{
 let gesture=false;
 ['pointerdown','touchend','click','keydown'].forEach(n=>addEventListener(n,()=>{gesture=true},true)); // registered before the page's own: counts as the touch itself
 window.__audio={made:0,ramps:[],suspends:0,resumes:0,ctx:null};
 class P{constructor(v){this.value=v||0}setValueAtTime(v){this.value=v}linearRampToValueAtTime(v,t){window.__audio.ramps.push(v)}exponentialRampToValueAtTime(){}cancelScheduledValues(){}}
 const node=()=>({connect(){},disconnect(){},start(){},stop(){},gain:new P(1),frequency:new P(0),detune:new P(0),Q:new P(1),delayTime:new P(0),threshold:new P(0),knee:new P(0),ratio:new P(0),attack:new P(0),release:new P(0)});
 window.AudioContext=class{
  constructor(){window.__audio.made++;window.__audio.ctx=this;this.state='suspended';this.currentTime=0;this.sampleRate=44100;this.destination={};setInterval(()=>{if(this.state==='running')this.currentTime+=0.25},250)}
  createGain(){return node()}createOscillator(){return node()}createBiquadFilter(){return node()}createDelay(){return node()}createDynamicsCompressor(){return node()}createConvolver(){return node()}createBufferSource(){return node()}
  createBuffer(ch,len){return {getChannelData:()=>new Float32Array(len)}}
  resume(){window.__audio.resumes++;if(!gesture)return new Promise(()=>{});if(this.state!=='running'){this.state='running';Promise.resolve().then(()=>this.onstatechange&&this.onstatechange())}return Promise.resolve()}
  suspend(){window.__audio.suspends++;this.state='suspended';Promise.resolve().then(()=>this.onstatechange&&this.onstatechange());return Promise.resolve()}
 };
};
const sounding=page=>page.evaluate(()=>window.AskerStoreMusic&&window.AskerStoreMusic.sounding());
const btn=page=>page.evaluate(()=>{const b=document.querySelector('.mus-btn');return b?{on:b.getAttribute('data-on'),label:b.getAttribute('aria-label'),title:b.getAttribute('title')}:null});
const lastRamp=page=>page.evaluate(()=>window.__audio.ramps[window.__audio.ramps.length-1]);
const open=async(page,base,hash='')=>{await page.setViewportSize({width:375,height:812});await page.goto(base+'store.html'+hash);await page.waitForSelector('.tabbar');await page.waitForFunction(()=>window.AskerStoreMusic)};
const rect=(page,sel)=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return cs.display==='none'||cs.visibility==='hidden'||r.width===0?null:{l:r.left,t:r.top,r:r.right,b:r.bottom}},sel);
const hit=(a,b)=>!!a&&!!b&&a.l<b.r&&a.r>b.l&&a.t<b.b&&a.b>b.t;

run('Store music: a visitor — the button is there, a first tap starts the music, the button stops it, the stop is remembered, only the button starts it again',async({page,base})=>{
 await page.addInitScript(FAKE);
 await open(page,base);
 // the browser refuses sound until a touch (the fake does like Chrome): the music has tried, the button says «شغّل»
 assert.equal(await sounding(page),false);
 assert.deepEqual(await btn(page),{on:'0',label:'شغّل الموسيقى الهادية',title:'شغّل الموسيقى الهادية'});
 // the first tap anywhere (nothing music-related): it starts and fades in to a low volume
 await page.mouse.click(190,420);
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 assert.equal(await lastRamp(page),0.25,'fades in to the low volume');
 assert.deepEqual(await btn(page),{on:'1',label:'وقّف الموسيقى الهادية',title:'وقّف الموسيقى الهادية'});
 assert.equal(await page.evaluate(()=>window.__audio.made),1,'one sound engine for the whole site (the views switch by hash)');
 // moving between the views does not restart or stack anything
 for(const go of ['search','cart','home']){await page.click(`.tabbar a[data-go="${go}"]`);await page.waitForTimeout(150)}
 assert.equal(await sounding(page),true);
 assert.equal(await page.evaluate(()=>window.__audio.made),1);
 // the quiet button stops it: fades out, the engine sleeps, and the stop is remembered
 await page.click('.mus-btn');
 await page.waitForFunction(()=>!window.AskerStoreMusic.sounding());
 assert.equal(await lastRamp(page),0,'fades out');
 await page.waitForFunction(()=>window.__audio.ctx.state==='suspended');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_music_off')),'1');
 assert.equal((await btn(page)).label,'شغّل الموسيقى الهادية');
 // a visit later: it does NOT start by itself, not even on a tap; the button is still there
 await page.reload();await page.waitForFunction(()=>window.AskerStoreMusic);
 assert.equal(await page.evaluate(()=>window.AskerStoreMusic.mode()),'stopped');
 await page.mouse.click(190,420);await page.waitForTimeout(400);
 assert.equal(await sounding(page),false);
 assert.equal(await page.evaluate(()=>window.__audio.made),0,'no sound engine was even made on this visit');
 // only his button starts it again, and that is remembered too
 await page.click('.mus-btn');
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_music_off')),null);
},{home:true});

run('Store music: the pharmacy\'s own phone — no sound, no button, no sound engine',async({page,base})=>{
 await page.addInitScript(FAKE);
 await page.addInitScript(()=>{try{localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{"fake":true}')}catch(e){}});
 await open(page,base);
 assert.equal(await page.evaluate(()=>window.AskerStoreMusic.mode()),'none');
 assert.equal(await page.locator('.mus-btn').count(),0,'no button');
 await page.mouse.click(190,420);await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>window.__audio.made),0,'the sound engine is never made');
 assert.equal(await sounding(page),false);
});

run('Store music: a hidden page and a voice note keep it quiet, and it comes back by itself (unless he stopped it)',async({page,base})=>{
 await page.addInitScript(FAKE);
 await open(page,base);
 await page.mouse.click(190,420);await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 const hide=h=>page.evaluate(h=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>h});document.dispatchEvent(new Event('visibilitychange'))},h);
 // the phone locks / another tab: it sleeps at once
 await hide(true);
 await page.waitForFunction(()=>!window.AskerStoreMusic.sounding()&&window.__audio.ctx.state==='suspended');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_music_off')),null,'a locked phone is not «stopped by him»');
 await hide(false);
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 // a voice note from the pharmacy plays: it steps aside until the note ends
 await page.evaluate(()=>{const a=document.createElement('audio');a.id='probeAudio';document.body.appendChild(a);a.dispatchEvent(new Event('play'))});
 await page.waitForFunction(()=>!window.AskerStoreMusic.sounding());
 await page.evaluate(()=>document.getElementById('probeAudio').dispatchEvent(new Event('ended')));
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 // a muted video (a picture that moves) does not silence it
 await page.evaluate(()=>{const v=document.createElement('video');v.muted=true;v.id='probeVideo';document.body.appendChild(v);v.dispatchEvent(new Event('play'))});
 await page.waitForTimeout(300);assert.equal(await sounding(page),true);
 // recording his own voice (store/chat.js asks): quiet until he sends or drops it
 await page.evaluate(()=>window.AskerStoreMusic.hold('rec'));
 await page.waitForFunction(()=>!window.AskerStoreMusic.sounding());
 await page.evaluate(()=>window.AskerStoreMusic.release('rec'));
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 // stopped by him: a hold that ends does not bring it back
 await page.click('.mus-btn');await page.waitForFunction(()=>!window.AskerStoreMusic.sounding());
 await page.evaluate(()=>{window.AskerStoreMusic.hold('rec');window.AskerStoreMusic.release('rec')});
 await page.waitForTimeout(400);assert.equal(await sounding(page),false);
});

run('Store music: the button is quiet and keeps out of the way — day and night, at 375 px, in every view, with the message box and the bottom bar',async({page,base})=>{
 await page.addInitScript(FAKE);
 await open(page,base);
 await page.mouse.click(190,420);await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 for(const night of [false,true]){
  await page.evaluate(n=>{document.documentElement.classList.toggle('night',n)},night);
  const st=await page.evaluate(()=>{const b=document.querySelector('.mus-btn'),cs=getComputedStyle(b),r=b.getBoundingClientRect(),bf=getComputedStyle(b,'::before');
   return {opacity:cs.opacity,pos:cs.position,w:r.width,h:r.height,dot:bf.width,dotR:bf.borderRadius,dotBg:bf.backgroundColor,vw:innerWidth,right:r.right,left:r.left,rtl:getComputedStyle(document.documentElement).direction}});
  assert.equal(st.pos,'fixed');
  assert.ok(+st.opacity>=0.3&&+st.opacity<=0.5,'about 40 % see-through, not a loud button: '+st.opacity);
  assert.equal(st.dot,'28px','a small round');assert.equal(st.dotR,'50%');
  assert.ok(st.w>=40&&st.h>=40,'but 40 px to touch');
  assert.ok(st.left>=0&&st.right<=st.vw,'inside the screen');
  assert.notEqual(st.dotBg,'rgba(0, 0, 0, 0)','the round has a surface (the page\'s card color, day and night)');
 }
 await page.evaluate(()=>document.documentElement.classList.remove('night'));
 // no view puts the button on the bottom bar, the cart, the WhatsApp round or the message box
 for(const go of ['home','search','orders','cart','chat']){
  await page.click(`.tabbar a[data-go="${go}"]`);await page.waitForTimeout(250);
  const b=await rect(page,'.mus-btn');assert.ok(b,'the button shows in '+go);
  for(const sel of ['.tabbar','.wa-fab','.ch-bar','.ch-notify','.ch-err']){const o=await rect(page,sel);assert.ok(!hit(b,o),`in «${go}» the button must not cover ${sel}: ${JSON.stringify(b)} vs ${JSON.stringify(o)}`)}
 }
});

run('Store music: the real sound graph renders (a real browser): not silent, not clipping, no wrong connection',async({page,base})=>{
 await open(page,base);
 // every one of the eight pieces (so every instrument: electric piano, plucks, marimba, vibes, bass, kick, hats, shaker, rim) in its groove, 8 s each
 const r=await page.evaluate(async()=>{const out=[];for(let first=0;first<8;first++){
  const buf=await window.AskerStoreMusic.renderBuffer(8,3,22050,{first,fromBar:8}),d=buf.getChannelData(0);let peak=0;for(let i=0;i<d.length;i++){const v=Math.abs(d[i]);if(v>peak)peak=v}
  let late=0,n=0;for(let i=Math.floor(d.length*0.5);i<d.length;i++){late+=d[i]*d[i];n++}
  out.push({first,sec:buf.duration,peak,lateRms:Math.sqrt(late/n)})}return out});
 for(const x of r){assert.equal(Math.round(x.sec),8);assert.ok(x.peak>0.05,'piece '+x.first+' is not silent: '+x.peak);assert.ok(x.peak<0.8,'piece '+x.first+' does not clip: '+x.peak);assert.ok(x.lateRms>0.01,'piece '+x.first+' is heard: '+x.lateRms)}
});
