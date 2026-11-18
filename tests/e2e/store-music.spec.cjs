// The calm music on the store site (store/music.js, owner 2026-11-17: «هو يفتح تلقائي بالصوت والإغلاق يبقى له زرار» and «زرار مخفي، أنا عاوزه يسمع»; and the same evening
// «صوت المزيكا في الصفحة مش مظبوط خالص وبيقطع والناس اشتكت»: the page now plays MP3 files instead of making the sound live).
// The browser's sound engine and the audio element are replaced by small fakes that, like Chrome, refuse to start before the person touches the page, so what is tested is OUR logic:
// it starts by itself and on the first tap, the quiet button stops it and the stop is remembered, the pharmacy's own phone hears nothing and sees no button, a hidden page / a
// voice note keep it quiet, the pieces follow each other in shuffled rounds, a file that does not load is skipped, and the button keeps out of the way of the bottom bar and the
// message box. A real Chrome also decodes every real MP3 (not silent, not clipping, the right length) and renders the score tool. Made-up data only: the repository is public.
const {run,assert}=require('./harness.cjs');
const fs=require('node:fs'),path=require('node:path');
const INDEX=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','store','music','index.json'),'utf8'));

const FAKE=()=>{
 let gesture=false;
 ['pointerdown','touchend','click','keydown'].forEach(n=>addEventListener(n,()=>{gesture=true},true)); // registered before the page's own: counts as the touch itself
 window.__audio={made:0,madeEl:0,ramps:[],suspends:0,resumes:0,ctx:null,el:null,plays:0,srcs:[],seeks:[],failNext:0,failAll:false};
 class P{constructor(v){this.value=v||0}setValueAtTime(v){this.value=v}linearRampToValueAtTime(v){window.__audio.ramps.push(v)}cancelScheduledValues(){}}
 window.AudioContext=class{
  constructor(){window.__audio.made++;window.__audio.ctx=this;this.state='suspended';this.currentTime=0;this.destination={};setInterval(()=>{if(this.state==='running')this.currentTime+=0.25},250)}
  createGain(){return {connect(){},gain:new P(1)}}
  createMediaElementSource(){return {connect(){}}}
  resume(){window.__audio.resumes++;if(!gesture)return new Promise(()=>{});if(this.state!=='running'){this.state='running';Promise.resolve().then(()=>this.onstatechange&&this.onstatechange())}return Promise.resolve()}
  suspend(){window.__audio.suspends++;this.state='suspended';Promise.resolve().then(()=>this.onstatechange&&this.onstatechange());return Promise.resolve()}
 };
 window.Audio=class extends EventTarget{
  constructor(){super();this.paused=true;this._a={};this._src='';this._t=0;window.__audio.el=this;window.__audio.madeEl++}
  setAttribute(k,v){this._a[k]=v}getAttribute(k){return this._a[k]==null?null:this._a[k]}
  set src(v){this._src=v;window.__audio.srcs.push(v);
   Promise.resolve().then(()=>{if(window.__audio.failAll||window.__audio.failNext>0){window.__audio.failNext--;this.dispatchEvent(new Event('error'));return}this.dispatchEvent(new Event('loadedmetadata'))})}
  get src(){return this._src}
  set currentTime(v){this._t=v;window.__audio.seeks.push(v)}get currentTime(){return this._t}
  play(){window.__audio.plays++;if(!gesture)return Promise.reject(new DOMException('play() needs a tap first','NotAllowedError'));
   if(this.paused){this.paused=false;Promise.resolve().then(()=>{this.dispatchEvent(new Event('play'));this.dispatchEvent(new Event('playing'))})}return Promise.resolve()}
  pause(){if(!this.paused){this.paused=true;Promise.resolve().then(()=>this.dispatchEvent(new Event('pause')))}}
 };
};
const sounding=page=>page.evaluate(()=>window.AskerStoreMusic&&window.AskerStoreMusic.sounding());
const btn=page=>page.evaluate(()=>{const b=document.querySelector('.mus-btn');return b?{on:b.getAttribute('data-on'),label:b.getAttribute('aria-label'),title:b.getAttribute('title')}:null});
const lastRamp=page=>page.evaluate(()=>window.__audio.ramps[window.__audio.ramps.length-1]);
const open=async(page,base,hash='')=>{await page.setViewportSize({width:375,height:812});await page.goto(base+'store.html'+hash);await page.waitForSelector('.tabbar');await page.waitForFunction(()=>window.AskerStoreMusic)};
const rect=(page,sel)=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return cs.display==='none'||cs.visibility==='hidden'||r.width===0?null:{l:r.left,t:r.top,r:r.right,b:r.bottom}},sel);
const hit=(a,b)=>!!a&&!!b&&a.l<b.r&&a.r>b.l&&a.t<b.b&&a.b>b.t;
const fileOf=src=>src.replace(/^.*store\/music\//,'').replace(/\?.*$/,'');

run('Store music: a visitor — the button is there, a first tap starts the music, the button stops it, the stop is remembered, only the button starts it again',async({page,base})=>{
 await page.addInitScript(FAKE);
 await open(page,base);
 // the browser refuses sound until a touch (the fakes do like Chrome): the music has tried, the button says «شغّل»
 assert.equal(await sounding(page),false);
 assert.deepEqual(await btn(page),{on:'0',label:'شغّل الموسيقى الهادية',title:'شغّل الموسيقى الهادية'});
 // the first tap anywhere (nothing music-related): it starts and fades in to a low volume
 await page.mouse.click(190,420);
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 assert.equal(await lastRamp(page),0.18,'fades in to the low volume');
 assert.deepEqual(await btn(page),{on:'1',label:'وقّف الموسيقى الهادية',title:'وقّف الموسيقى الهادية'});
 assert.equal(await page.evaluate(()=>[window.__audio.made,window.__audio.madeEl]).then(a=>a.join()),'1,1','one sound engine and one audio element for the whole site (the views switch by hash)');
 // the first piece of the visit is one of the eight files, and it starts after its quiet intro (a visit starts in the groove)
 const srcs=await page.evaluate(()=>window.__audio.srcs),seeks=await page.evaluate(()=>window.__audio.seeks);
 assert.equal(srcs.length,1);assert.match(srcs[0],/^store\/music\/0\d-[a-z-]+\.mp3\?v=files-/);
 const t=INDEX.find(x=>x.file===fileOf(srcs[0]));assert.ok(t,'a rendered file');assert.deepEqual(seeks,[t.intro],'starts after the intro');
 // moving between the views does not restart or stack anything
 for(const go of ['search','cart','home']){await page.click(`.tabbar a[data-go="${go}"]`);await page.waitForTimeout(150)}
 assert.equal(await sounding(page),true);
 assert.equal(await page.evaluate(()=>[window.__audio.made,window.__audio.madeEl,window.__audio.srcs.length]).then(a=>a.join()),'1,1,1');
 // the quiet button stops it: fades out, the file pauses, the engine sleeps, and the stop is remembered
 await page.click('.mus-btn');
 await page.waitForFunction(()=>!window.AskerStoreMusic.sounding());
 assert.equal(await lastRamp(page),0,'fades out');
 await page.waitForFunction(()=>window.__audio.ctx.state==='suspended'&&window.__audio.el.paused);
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_music_off')),'1');
 assert.equal((await btn(page)).label,'شغّل الموسيقى الهادية');
 // a visit later: it does NOT start by itself, not even on a tap; the button is still there; no file is even asked for
 await page.reload();await page.waitForFunction(()=>window.AskerStoreMusic);
 assert.equal(await page.evaluate(()=>window.AskerStoreMusic.mode()),'stopped');
 await page.mouse.click(190,420);await page.waitForTimeout(400);
 assert.equal(await sounding(page),false);
 assert.equal(await page.evaluate(()=>[window.__audio.made,window.__audio.madeEl,window.__audio.srcs.length]).then(a=>a.join()),'0,0,0','no engine, no audio element and no file on this visit');
 // only his button starts it again, and that is remembered too
 await page.click('.mus-btn');
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_music_off')),null);
},{home:true});

run('Store music: the pieces follow each other in shuffled rounds (no repeat in the first eight, a new round never starts with the piece that just ended), a file that does not load is skipped',async({page,base})=>{
 await page.addInitScript(FAKE);
 await open(page,base);
 await page.mouse.click(190,420);await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 // a piece ends: the next one starts (the intro is skipped only on the first)
 for(let i=0;i<8;i++){await page.evaluate(()=>window.__audio.el.dispatchEvent(new Event('ended')));}
 const srcs=(await page.evaluate(()=>window.__audio.srcs)).map(fileOf);
 assert.equal(srcs.length,9);
 assert.equal(new Set(srcs.slice(0,8)).size,8,'the first eight pieces are all different: '+srcs.slice(0,8));
 assert.notEqual(srcs[8],srcs[7],'the next round does not start with the piece that just ended');
 assert.equal(await page.evaluate(()=>window.__audio.seeks.length),1,'only the first piece of the visit skips its intro');
 assert.equal(await sounding(page),true,'still playing after all those');
 // a file that fails (no network, a missing file): the next piece, and the music goes on
 const before=(await page.evaluate(()=>window.__audio.srcs)).length;
 await page.evaluate(()=>{window.__audio.failNext=2;window.__audio.el.dispatchEvent(new Event('ended'))});
 await page.waitForFunction(b=>window.__audio.srcs.length>=b+3,before);
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 // every file fails (offline): quiet, the button says it is off, and nothing loops forever
 await page.evaluate(()=>{window.__audio.failAll=true;window.__audio.el.dispatchEvent(new Event('ended'))});
 await page.waitForFunction(()=>!window.AskerStoreMusic.sounding()&&document.querySelector('.mus-btn').getAttribute('data-on')==='0');
 const n1=(await page.evaluate(()=>window.__audio.srcs)).length;await page.waitForTimeout(600);
 assert.equal((await page.evaluate(()=>window.__audio.srcs)).length,n1,'it gave up (no endless retries)');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_music_off')),null,'and it is not «stopped by him»');
 // the network is back: his button tries again
 await page.evaluate(()=>{window.__audio.failAll=false});
 await page.click('.mus-btn');await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
},{home:true});

run('Store music: the pharmacy\'s own phone — no sound, no button, no sound engine',async({page,base})=>{
 await page.addInitScript(FAKE);
 await page.addInitScript(()=>{try{localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{"fake":true}')}catch(e){}});
 await open(page,base);
 assert.equal(await page.evaluate(()=>window.AskerStoreMusic.mode()),'none');
 assert.equal(await page.locator('.mus-btn').count(),0,'no button');
 await page.mouse.click(190,420);await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>[window.__audio.made,window.__audio.madeEl,window.__audio.srcs.length]).then(a=>a.join()),'0,0,0','no engine, no audio element, no file');
 assert.equal(await sounding(page),false);
});

run('Store music: a hidden page and a voice note keep it quiet, and it comes back by itself (unless he stopped it)',async({page,base})=>{
 await page.addInitScript(FAKE);
 await open(page,base);
 await page.mouse.click(190,420);await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 const hide=h=>page.evaluate(h=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>h});document.dispatchEvent(new Event('visibilitychange'))},h);
 // the phone locks / another tab: the file pauses and the engine sleeps at once; when he is back it goes on (the same file, not a new one)
 const src0=await page.evaluate(()=>window.__audio.srcs.length);
 await hide(true);
 await page.waitForFunction(()=>!window.AskerStoreMusic.sounding()&&window.__audio.ctx.state==='suspended'&&window.__audio.el.paused);
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_music_off')),null,'a locked phone is not «stopped by him»');
 await hide(false);
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 assert.equal((await page.evaluate(()=>window.__audio.srcs)).length,src0,'it goes on with the same piece');
 // a voice note from the pharmacy plays: it steps aside until the note ends
 await page.evaluate(()=>{const a=document.createElement('audio');a.id='probeAudio';document.body.appendChild(a);a.dispatchEvent(new Event('play'))});
 await page.waitForFunction(()=>!window.AskerStoreMusic.sounding());
 await page.evaluate(()=>document.getElementById('probeAudio').dispatchEvent(new Event('ended')));
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 // a muted video (a picture that moves) does not silence it
 await page.evaluate(()=>{const v=document.createElement('video');v.muted=true;v.id='probeVideo';document.body.appendChild(v);v.dispatchEvent(new Event('play'))});
 await page.waitForTimeout(300);assert.equal(await sounding(page),true);
 // the music's own file never counts as a voice note (it would silence itself)
 await page.evaluate(()=>{const m=window.__audio.el;m.dispatchEvent(new Event('play'))});
 await page.waitForTimeout(200);assert.equal(await sounding(page),true);
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

run('Store music: every real MP3 decodes in a real browser — not silent, not clipping, the right length, a sane level',async({page,base})=>{
 await open(page,base);
 const r=await page.evaluate(async(files)=>{const out=[],ctx=new (window.AudioContext||window.webkitAudioContext)();
  for(const f of files){const buf=await ctx.decodeAudioData(await (await fetch('store/music/'+f)).arrayBuffer()),d=buf.getChannelData(0);let peak=0,sum=0,n=0;
   for(let i=0;i<d.length;i++){const v=Math.abs(d[i]);if(v>peak)peak=v}
   for(let i=Math.floor(d.length*0.1);i<d.length*0.9;i++){sum+=d[i]*d[i];n++}
   // a gap: a whole second of silence in the middle would be a cut
   let quiet=0,longest=0;for(let i=Math.floor(buf.sampleRate*6);i<d.length-buf.sampleRate*6;i++){if(Math.abs(d[i])<0.0005){quiet++;if(quiet>longest)longest=quiet}else quiet=0}
   out.push({f,sec:buf.duration,rate:buf.sampleRate,ch:buf.numberOfChannels,peak,rms:Math.sqrt(sum/n),longestQuiet:longest/buf.sampleRate})}
  ctx.close();return out},INDEX.map(x=>x.file));
 assert.equal(r.length,8);
 for(const x of r){const meta=INDEX.find(i=>i.file===x.f);
  assert.ok(Math.abs(x.sec-meta.secs)<1,x.f+' lasts '+x.sec+' s (the index says '+meta.secs+')');
  assert.ok(x.peak>0.1,x.f+' is not silent: '+x.peak);assert.ok(x.peak<=1,x.f+' does not clip: '+x.peak);
  assert.ok(x.rms>0.02,x.f+' is heard: '+x.rms);
  assert.ok(x.longestQuiet<1.2,x.f+' has no cut: the longest quiet stretch is '+x.longestQuiet.toFixed(2)+' s')}
});

run('Store music: the score tool still renders in a real browser (all eight pieces, every instrument): not silent, not clipping, no wrong connection',async({page,base})=>{
 await open(page,base);
 await page.addScriptTag({url:base+'tools/music/score.js'});
 const r=await page.evaluate(async()=>{const out=[];for(let first=0;first<8;first++){
  const buf=await window.AskerMusicScore.renderBuffer(8,3,22050,{first,fromBar:8}),d=buf.getChannelData(0);let peak=0;for(let i=0;i<d.length;i++){const v=Math.abs(d[i]);if(v>peak)peak=v}
  let late=0,n=0;for(let i=Math.floor(d.length*0.5);i<d.length;i++){late+=d[i]*d[i];n++}
  out.push({first,sec:buf.duration,peak,lateRms:Math.sqrt(late/n)})}return out});
 for(const x of r){assert.equal(Math.round(x.sec),8);assert.ok(x.peak>0.05,'piece '+x.first+' is not silent: '+x.peak);assert.ok(x.peak<2.5,'piece '+x.first+' is not wildly loud (the render tool scales every file under 0.98): '+x.peak);assert.ok(x.lateRms>0.005,'piece '+x.first+' is heard: '+x.lateRms)}
});

// ---- the promo voice (owner 2026-11-18: a spoken advert over the music, voice Orus, soft; once, then not again for a few days) ----
// The function asker-dose is answered by the test (a small made-up WAV); the audio fakes are the ones above, plus a note of every gain the page makes.
const makeWav=()=>{const n=24000,pcm=Buffer.alloc(n*2);for(let i=0;i<n;i++)pcm.writeInt16LE(Math.round(3000*Math.sin(i/20)),i*2);const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(24000,24);h.writeUInt32LE(48000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm])};
const NOTE_GAINS=()=>{const o=window.AudioContext.prototype.createGain;window.__gains=[];window.AudioContext.prototype.createGain=function(){const g=o.call(this);window.__gains.push(g);return g}};
const serveAdvert=async(page,{status=200}={})=>{const asked=[],cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST, OPTIONS'},wav=makeWav();
 await page.route('**/functions/v1/asker-dose',route=>{const q=route.request();if(q.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});asked.push(JSON.parse(q.postData()));
  return status===200?route.fulfill({status:200,headers:{...cors,'content-type':'application/octet-stream'},body:wav}):route.fulfill({status,headers:cors,body:'{"error":"x"}'})});return asked};
const promo=page=>page.evaluate(()=>window.AskerStoreMusic.promoState());
const fast=(page,s)=>page.evaluate(s=>{window.AskerStoreMusic.PROMO.delay=s},s);

run('Store music: the promo voice — a few seconds after the music, soft, once; the same phone does not hear it again for days; it comes back from the phone\'s own copy when due',async({page,base})=>{
 await page.addInitScript(FAKE);await page.addInitScript(NOTE_GAINS);const asked=await serveAdvert(page);
 await open(page,base);await fast(page,0.4);
 assert.deepEqual(await promo(page),{armed:false,playing:false,done:false},'nothing before the music is sounding');
 await page.mouse.click(190,420);await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 await page.waitForFunction(()=>window.AskerStoreMusic.promoState().playing);
 assert.deepEqual(asked,[{action:'promo',voice:'Orus'}],'it asks the function for the Orus advert and sends nothing else');
 assert.equal(await sounding(page),true,'the music goes on under it');
 const gains=await page.evaluate(()=>window.__gains.map(g=>g.gain.value));assert.ok(gains.includes(0.21),'the voice is played through its own soft gain: '+gains);
 const pe=await page.evaluate(()=>({el:window.__audio.madeEl,attr:window.__audio.el.getAttribute('data-music'),src:window.__audio.el.src.slice(0,5),paused:window.__audio.el.paused}));
 assert.deepEqual(pe,{el:2,attr:'promo',src:'blob:',paused:false},'a second audio element, marked as ours (the music does not step aside for it)');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_promo_day')),await page.evaluate(()=>window.AskerStoreMusic.dayKey()),'counted for today once it really started');
 // it ends: the music goes on alone
 await page.evaluate(()=>window.__audio.el.dispatchEvent(new Event('ended')));
 assert.equal((await promo(page)).playing,false);assert.equal(await sounding(page),true);
 // the next visit, the same day: no advert (nothing asked, no second element)
 await page.reload();await page.waitForFunction(()=>window.AskerStoreMusic);await fast(page,0.4);
 await page.mouse.click(190,420);await page.waitForFunction(()=>window.AskerStoreMusic.sounding());await page.waitForTimeout(1200);
 assert.equal((await promo(page)).playing,false,'not again the same day');assert.equal(await page.evaluate(()=>window.__audio.madeEl),1);assert.equal(asked.length,1);
 // four days later: due again, and the phone has its own copy: the function is not asked a second time
 await page.evaluate(()=>{const d=new Date();d.setDate(d.getDate()-4);localStorage.setItem('asker_store_promo_day',window.AskerStoreMusic.dayKey(d))});
 await page.reload();await page.waitForFunction(()=>window.AskerStoreMusic);await fast(page,0.4);
 await page.mouse.click(190,420);await page.waitForFunction(()=>window.AskerStoreMusic.promoState().playing);
 assert.equal(asked.length,1,'the second hearing comes from the phone\'s copy');
},{home:true});

run('Store music: the promo voice — the button stops it with the music; a locked phone cancels it before it starts; no network: no advert and no retry, the music goes on',async({page,base})=>{
 await page.addInitScript(FAKE);const asked=await serveAdvert(page);
 await open(page,base);await fast(page,0.4);
 await page.mouse.click(190,420);await page.waitForFunction(()=>window.AskerStoreMusic.promoState().playing);
 await page.click('.mus-btn');await page.waitForFunction(()=>!window.AskerStoreMusic.sounding());
 assert.equal((await promo(page)).playing,false,'the stop button silences the advert too');
 assert.equal(await page.evaluate(()=>window.__audio.el.paused),true);
 // another visit (not yet heard: the first one never counted?) it did count: clear it, and lock the phone before the advert is due
 await page.evaluate(()=>{localStorage.removeItem('asker_store_promo_day');localStorage.removeItem('asker_store_music_off')});
 await page.reload();await page.waitForFunction(()=>window.AskerStoreMusic);await fast(page,1.2);
 const before=asked.length;
 await page.mouse.click(190,420);await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForTimeout(1900);
 assert.equal(asked.length,before,'a locked phone never even asks for the advert');assert.deepEqual(await promo(page),{armed:false,playing:false,done:false});
},{home:true});

run('Store music: the promo voice — the function is down: no advert, no retry in the visit, the music is not touched',async({page,base})=>{
 await page.addInitScript(FAKE);const asked=await serveAdvert(page,{status:500});
 await open(page,base);await fast(page,0.3);
 await page.mouse.click(190,420);await page.waitForFunction(()=>window.AskerStoreMusic.promoState().done);
 assert.equal(await sounding(page),true);assert.equal(await page.evaluate(()=>window.__audio.madeEl),1,'no second element was made');
 await page.waitForTimeout(900);assert.equal(asked.length,1,'asked once, no retry');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_promo_day')),null,'not counted as heard: tried again on a later visit');
});

run('Store music: the promo voice — never on the pharmacy\'s own phone',async({page,base})=>{
 await page.addInitScript(FAKE);await page.addInitScript(()=>{try{localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{"fake":true}')}catch(e){}});
 const asked=await serveAdvert(page);await open(page,base);await fast(page,0.2);
 await page.mouse.click(190,420);await page.waitForTimeout(900);
 assert.equal(asked.length,0,'the function is never asked');assert.equal(await page.evaluate(()=>window.__audio.madeEl),0);
});