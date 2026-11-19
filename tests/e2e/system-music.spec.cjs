// «🎵 موسيقى السيستم» (owner 2026-11-19: «عاوز خلفية موسيقى للسيستم ليا وللمستخدمين اللي على السيستم معايا، نفس نظام الأبليكيشن بتاع العملا»): the quiet music inside the system. The sound is played
// here by a stand-in for Audio / AudioContext (the real files are the store's, checked in tests/system-music.cjs): what is tested is WHEN it plays: by itself once somebody is signed in, after the
// first touch, silent on the sign-in screen, the button stops it and the phone remembers (its own switch), a voice note / the phone speaking / a recording make it step aside, and the store's switch is not touched.
const {run,assert}=require('./harness.cjs');
const FAKE=()=>{
 window.__fa={els:[],ctxs:[],gains:[]};
 class A{constructor(){this.paused=true;this.src='';this.attrs={};this.h={};this.currentTime=0;this.muted=false;this.tagName='AUDIO';__fa.els.push(this)}
  setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]}
  addEventListener(t,f){(this.h[t]=this.h[t]||[]).push(f)}removeEventListener(t,f){this.h[t]=(this.h[t]||[]).filter(x=>x!==f)}
  play(){this.paused=false;(this.h.playing||[]).forEach(f=>f());return Promise.resolve()}
  pause(){const was=this.paused;this.paused=true;if(!was)(this.h.pause||[]).forEach(f=>f())}}
 class C{constructor(){this.state='running';this.currentTime=0;this.destination={};__fa.ctxs.push(this)}
  createGain(){const p={value:0,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(v){p.value=v}};__fa.gains.push(p);return {gain:p,connect(){}}}
  createMediaElementSource(){return {connect(){}}}
  resume(){this.state='running';setTimeout(()=>this.onstatechange&&this.onstatechange(),0);return Promise.resolve()}   // a real context says so when its state changes
  suspend(){this.state='suspended';setTimeout(()=>this.onstatechange&&this.onstatechange(),0);return Promise.resolve()}}
 window.Audio=A;window.AudioContext=C;
};
const state=(page)=>page.evaluate(()=>{const e=(window.__fa.els||[])[0];return {mode:AskerMusic.mode(),sounding:AskerMusic.sounding(),paused:e?e.paused:null,src:e?e.src:null,els:window.__fa.els.length,on:document.getElementById('sysMusic')&&document.getElementById('sysMusic').dataset.on,hidden:document.getElementById('sysMusic')&&document.getElementById('sysMusic').hidden,label:document.getElementById('sysMusic')&&document.getElementById('sysMusic').getAttribute('aria-label'),off:localStorage.getItem('asker_system_music_off'),storeOff:localStorage.getItem('asker_store_music_off')}});
const until=(page,fn,ms=4000)=>page.waitForFunction(fn,null,{timeout:ms});

run('System music: plays by itself once signed in (after the first touch), the button stops it and the phone remembers, voice notes and a recording make it step aside, the sign-in screen is silent, the store\'s switch is untouched',async({page})=>{
 await page.addInitScript(FAKE);
 await page.reload();
 await page.waitForSelector('#sysMusic');
 await page.click('body',{position:{x:5,y:300}});            // the first touch
 await until(page,()=>AskerMusic.sounding());
 let s=await state(page);
 assert.equal(s.mode,'auto');assert.equal(s.sounding,true);assert.equal(s.paused,false);assert.match(s.src,/^store\/music\/0\d-[a-z-]+\.mp3\?v=files-/);
 assert.equal(s.on,'1');assert.equal(s.label,'وقّف الموسيقى الهادية');assert.equal(s.hidden,false);assert.equal(s.off,null);assert.equal(s.storeOff,null);
 assert.equal(s.els,1,'one audio element, not one per touch');
 // the button stops it; it is remembered on this phone and is the system\'s own switch
 await page.click('#sysMusic');
 await until(page,()=>document.getElementById('sysMusic').dataset.on==='0'&&window.__fa.els[0].paused);
 s=await state(page);
 assert.equal(s.mode,'stopped');assert.equal(s.off,'1');assert.equal(s.storeOff,null,'the store\'s music switch is not touched');assert.equal(s.label,'شغّل الموسيقى الهادية');
 // reload: it does not start by itself again, whatever he taps
 await page.reload();await page.waitForSelector('#sysMusic');
 await page.click('body',{position:{x:5,y:300}});await page.waitForTimeout(700);
 s=await state(page);
 assert.equal(s.mode,'stopped');assert.equal(s.sounding,false);assert.equal(s.els,0,'no audio was even made');assert.equal(s.off,'1');
 // his button starts it again and removes the memory
 await page.click('#sysMusic');
 await until(page,()=>AskerMusic.sounding());
 s=await state(page);assert.equal(s.mode,'auto');assert.equal(s.off,null);assert.equal(s.on,'1');
 // a recording (the rest of the page holds it) makes it step aside, and it comes back after
 await page.evaluate(()=>AskerMusic.hold('rec'));
 await until(page,()=>window.__fa.els[0].paused&&!AskerMusic.sounding());
 await page.evaluate(()=>AskerMusic.release('rec'));
 await until(page,()=>AskerMusic.sounding());
 // the phone is speaking: it steps aside while it does
 await page.evaluate(()=>{window.__speaking=true;Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{get speaking(){return window.__speaking}}})});
 await until(page,()=>!AskerMusic.sounding(),3000);
 await page.evaluate(()=>{window.__speaking=false});
 await until(page,()=>AskerMusic.sounding(),3000);
 // a voice note (any audio element that is not the music) plays: it steps aside until it ends
 await page.evaluate(()=>{const a=document.createElement('audio');a.id='vn';document.body.appendChild(a);a.dispatchEvent(new Event('play'));window.__vn=a});
 await until(page,()=>!AskerMusic.sounding());
 await page.evaluate(()=>{window.__vn.dispatchEvent(new Event('ended'))});
 await until(page,()=>AskerMusic.sounding());
 // the sign-in screen (the app hidden): silent and no button; signed in again: back
 await page.evaluate(()=>document.getElementById('app').classList.add('hidden'));
 await until(page,()=>document.getElementById('sysMusic').hidden&&!AskerMusic.sounding());
 await page.evaluate(()=>document.getElementById('app').classList.remove('hidden'));
 await until(page,()=>!document.getElementById('sysMusic').hidden&&AskerMusic.sounding());
});

run('System music in English, and a phone with no Web Audio gets no button and no error',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-lang','en'));
 await page.addInitScript(FAKE);
 await page.reload();await page.waitForSelector('#sysMusic');
 await page.click('body',{position:{x:5,y:300}});
 await until(page,()=>AskerMusic.sounding());
 assert.equal(await page.getAttribute('#sysMusic','aria-label'),'Stop the quiet music');
 await page.click('#sysMusic');
 await until(page,()=>document.getElementById('sysMusic').dataset.on==='0');
 assert.equal(await page.getAttribute('#sysMusic','aria-label'),'Play the quiet music');
 // a browser with no Web Audio
 await page.evaluate(()=>{localStorage.removeItem('asker-lang');localStorage.removeItem('asker_system_music_off')});
 await page.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined});
 const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.reload();await page.waitForSelector('#app');await page.waitForTimeout(500);
 assert.equal(await page.$('#sysMusic'),null,'no button');
 assert.equal(await page.evaluate(()=>AskerMusic.mode()),'none');
 assert.deepEqual(errs,[]);
});

// ---------- the advert voice (owner 2026-11-19: «عايز صوت الإعلان على السيستم، برضو على المستخدمين بتوع السيستم») ----------
// the function's answer is played here by a fetch stand-in (a 15000-sample WAV: the page measures its level), the sound by the same Audio / AudioContext stand-ins
const WAVMOCK=()=>{
 const n=15000,buf=new ArrayBuffer(44+n*2),v=new DataView(buf);for(let i=0;i<n;i++)v.setInt16(44+2*i,Math.round(Math.sin(i/9)*0.1*32767),true);
 window.__wav=buf;window.__fetches=[];window.__promoStatus=200;
 const rn=Date.now.bind(Date);window.__skew=0;Date.now=()=>rn()+window.__skew;   // the half hour is proven by moving this clock, not by waiting
 const orig=window.fetch.bind(window);
 window.fetch=async(u,o)=>{if(/functions\/v1\/asker-dose/.test(String(u))){window.__fetches.push({u:String(u),body:o&&o.body});return window.__promoStatus===200?new Response(window.__wav.slice(0),{status:200,headers:{'Content-Type':'audio/wav'}}):new Response('x',{status:500})}return orig(u,o)};
};
const visit=async(page,base,q)=>{await page.goto(base+'asker-nawaqes-arabic.html'+q);await page.waitForSelector('#sysMusic');await page.evaluate(()=>{AskerApp.client.supabaseUrl='https://test.supabase.co';AskerApp.client.supabaseKey='anon-key'})};
const promoEl=(page)=>page.evaluate(()=>{const e=window.__fa.els.find(x=>x.attrs['data-music']==='promo');return e?{paused:e.paused,gain:window.__fa.gains[window.__fa.gains.length-1].value}:null});
run('System music advert: the store\'s advert plays over the music a few seconds after it sounds and then EVERY HALF HOUR, from the function once then from the phone\'s copy, at the music\'s own level, never when the music is stopped (it waits), tried again after a failed ask',async({page,base})=>{
 await page.addInitScript(FAKE);await page.addInitScript(WAVMOCK);
 const promos=(p)=>p.evaluate(()=>window.__fa.els.filter(x=>x.attrs['data-music']==='promo').length);
 // 1) a first open (the test link: 3 s): the music, then the advert asked from the function with the voice, played at the store's level over the music
 await visit(page,base,'?promo=1');
 await page.click('body',{position:{x:5,y:300}});
 await until(page,()=>AskerMusic.sounding());
 assert.equal(await promoEl(page),null,'not at once: after a few seconds');
 await until(page,()=>window.__fa.els.some(e=>e.attrs['data-music']==='promo'&&!e.paused),9000);
 const f=await page.evaluate(()=>window.__fetches.map(x=>({u:x.u,body:JSON.parse(x.body)})));
 assert.equal(f.length,1);assert.equal(f[0].u,'https://test.supabase.co/functions/v1/asker-dose');assert.deepEqual(f[0].body,{action:'promo',voice:'Orus'});
 const g1=await page.evaluate(()=>({advert:window.__fa.gains[window.__fa.gains.length-1].value,expect:AskerMusic.advertGain(AskerMusic.wavRms(window.__wav),0.18)}));
 assert.ok(Math.abs(g1.advert-g1.expect)<1e-9,'at the store\'s level: '+JSON.stringify(g1));
 assert.equal(await page.evaluate(()=>AskerMusic.sounding()),true,'the music goes on under it');
 assert.equal((await page.evaluate(()=>AskerMusic.promoState())).playing,true);
 // it ends: the next one is due in half an hour (30 minutes from now), not before
 await page.evaluate(()=>{const e=window.__fa.els.find(x=>x.attrs['data-music']==='promo');(e.h.ended||[]).forEach(fn=>fn())});
 const st=await page.evaluate(()=>({s:AskerMusic.promoState(),now:Date.now()}));
 assert.equal(st.s.playing,false);assert.equal(st.s.armed,false);
 assert.ok(Math.abs(st.s.next-st.now-30*60000)<20000,'due again in 30 minutes: '+(st.s.next-st.now));
 await page.evaluate(()=>AskerMusic.promoTick());await page.waitForTimeout(4500);
 assert.equal(await promos(page),1,'not again before the half hour');
 // 2) the half hour comes (the clock moves 31 minutes; a look is taken): it is said again, over the music, from the phone's copy (the function is not asked again)
 await page.evaluate(()=>{window.__skew+=31*60000;AskerMusic.promoTick()});
 await until(page,()=>{const a=window.__fa.els.filter(e=>e.attrs['data-music']==='promo');return a.length===2&&!a[1].paused},9000);
 assert.equal(await page.evaluate(()=>window.__fetches.length),1,'the second one comes from the phone\'s copy');
 assert.equal(await page.evaluate(async()=>{const c=await caches.open('asker-store-promo-v1');return !!(await c.match('https://asker-store-promo.invalid/v3-orus'))}),true,'kept in the store\'s own cache under its own name');
 await page.evaluate(()=>{const e=window.__fa.els.filter(x=>x.attrs['data-music']==='promo')[1];(e.h.ended||[]).forEach(fn=>fn())});
 const st2=await page.evaluate(()=>({s:AskerMusic.promoState(),now:Date.now()}));
 assert.ok(Math.abs(st2.s.next-st2.now-30*60000)<20000,'and the next one is half an hour after that');
 // 3) the half hour falls due while the music is stopped: nothing is said; when his button starts the music again it is said 3 s later
 await page.evaluate(()=>{window.__skew+=31*60000});
 await page.click('#sysMusic');await until(page,()=>!AskerMusic.sounding());
 await page.evaluate(()=>AskerMusic.promoTick());await page.waitForTimeout(4500);
 assert.equal(await promos(page),2,'no advert over a stopped music');
 assert.equal((await page.evaluate(()=>AskerMusic.promoState())).armed,false);
 await page.click('#sysMusic');await until(page,()=>AskerMusic.sounding());
 await until(page,()=>window.__fa.els.filter(e=>e.attrs['data-music']==='promo').length===3,9000);
 // 4) the button stops the music inside the waiting seconds of a due advert: it is cancelled with it
 await page.evaluate(()=>{const e=window.__fa.els.filter(x=>x.attrs['data-music']==='promo')[2];(e.h.ended||[]).forEach(fn=>fn());window.__skew+=31*60000;AskerMusic.promoTick()});
 assert.equal((await page.evaluate(()=>AskerMusic.promoState())).armed,true,'due: waiting its seconds');
 await page.click('#sysMusic');await until(page,()=>!AskerMusic.sounding());
 await page.waitForTimeout(4500);
 assert.equal(await promos(page),3,'cancelled with the music');
 assert.equal((await page.evaluate(()=>AskerMusic.promoState())).armed,false);
 await page.click('#sysMusic');await until(page,()=>AskerMusic.sounding());
 // 5) a visit with the music turned down: the advert comes down with it
 await page.evaluate(async()=>{await caches.delete('asker-store-promo-v1')});
 await visit(page,base,'?promo=1');
 await page.evaluate(()=>AskerMusic.setLevel(20));
 await page.click('body',{position:{x:5,y:300}});
 await until(page,()=>window.__fa.els.some(e=>e.attrs['data-music']==='promo'&&!e.paused),9000);
 const low=await page.evaluate(()=>({advert:window.__fa.gains[window.__fa.gains.length-1].value,expect:AskerMusic.advertGain(AskerMusic.wavRms(window.__wav),0.02)}));
 assert.ok(Math.abs(low.advert-low.expect)<1e-9,'follows the music level: '+JSON.stringify(low));
 assert.ok(low.advert<g1.advert*0.5,'quieter than at the store\'s level: '+low.advert+' vs '+g1.advert);
 await page.evaluate(()=>localStorage.removeItem('asker_system_music_vol'));
 // 6) the function does not answer: the music plays, nothing is said, nothing breaks; it is tried again after 10 minutes, and said once the function answers
 await page.evaluate(async()=>{await caches.delete('asker-store-promo-v1')});
 await visit(page,base,'?promo=1');
 await page.evaluate(()=>{window.__promoStatus=500});
 await page.click('body',{position:{x:5,y:300}});
 await until(page,()=>AskerMusic.sounding());
 await page.waitForTimeout(5500);
 assert.equal(await promos(page),0,'no advert, no error');
 assert.equal(await page.evaluate(()=>AskerMusic.sounding()),true,'the music plays on');
 const rt=await page.evaluate(()=>({s:AskerMusic.promoState(),now:Date.now()}));
 assert.ok(Math.abs(rt.s.next-rt.now-10*60000)<20000,'tried again in 10 minutes: '+(rt.s.next-rt.now));
 await page.evaluate(()=>{window.__promoStatus=200;window.__skew+=11*60000;AskerMusic.promoTick()});
 await until(page,()=>window.__fa.els.some(e=>e.attrs['data-music']==='promo'&&!e.paused),9000);
});

run('System music volume option: a second quiet button opens a slider, moving it changes the sound at once, the level is remembered on the phone, and the store\'s music is untouched',async({page})=>{
 await page.addInitScript(FAKE);
 await page.reload();await page.waitForSelector('#sysMusicVol');
 await page.click('body',{position:{x:5,y:300}});
 await until(page,()=>AskerMusic.sounding()&&window.__fa.gains[0].value>0);
 const info=()=>page.evaluate(()=>({gain:window.__fa.gains[0]&&window.__fa.gains[0].value,level:AskerMusic.level(),stored:localStorage.getItem('asker_system_music_vol'),storeVol:localStorage.getItem('asker_store_music_vol'),popHidden:document.getElementById('sysMusicPop').hidden,volHidden:document.getElementById('sysMusicVol').hidden,label:document.getElementById('sysMusicVol').getAttribute('aria-label'),expanded:document.getElementById('sysMusicVol').getAttribute('aria-expanded'),range:document.getElementById('sysMusicRange').value}));
 // the default is the store's own quiet level
 let s=await info();
 assert.equal(s.gain,0.18);assert.equal(s.level,60);assert.equal(s.stored,null);assert.equal(s.popHidden,true);assert.equal(s.volHidden,false);assert.equal(s.label,'صوت الموسيقى');assert.equal(s.expanded,'false');
 // the second button opens the slider (showing the current level)
 await page.click('#sysMusicVol');
 s=await info();assert.equal(s.popHidden,false);assert.equal(s.expanded,'true');assert.equal(s.range,'60');
 // the slider and the two buttons are on screen, not on top of each other
 const box=await page.evaluate(()=>{const r=(id)=>{const b=document.getElementById(id).getBoundingClientRect();return {l:b.left,t:b.top,r:b.right,b:b.bottom}};return {music:r('sysMusic'),vol:r('sysMusicVol'),pop:r('sysMusicPop'),w:innerWidth,h:innerHeight}});
 assert.ok(box.vol.b<=box.music.t+1,'the volume button sits above the music button');
 assert.ok(box.pop.l>=0&&box.pop.r<=box.w&&box.pop.t>=0&&box.pop.b<=box.h,'the slider is fully on screen');
 assert.ok(box.pop.r<=box.vol.l+1||box.pop.l>=box.vol.r-1||box.pop.b<=box.vol.t+1,'the slider does not cover its own button');
 // lowering it: heard at once (the gain follows the slider) and remembered
 await page.fill('#sysMusicRange','20');
 await until(page,()=>window.__fa.gains[0].value===0.02);
 s=await info();assert.equal(s.level,20);assert.equal(s.stored,'20');assert.equal(s.gain,0.02);assert.equal(s.storeVol,null,'the store\'s music is not touched');
 assert.equal(await page.evaluate(()=>AskerMusic.sounding()),true,'lowering does not stop it');
 // a tap elsewhere folds the slider away
 await page.click('body',{position:{x:5,y:300}});
 await until(page,()=>document.getElementById('sysMusicPop').hidden);
 // after a reload the phone remembers: it starts at the lowered level, never at the store\'s
 await page.reload();await page.waitForSelector('#sysMusicVol');
 await page.click('body',{position:{x:5,y:300}});
 await until(page,()=>AskerMusic.sounding()&&window.__fa.gains[0].value>0);
 s=await info();assert.equal(s.level,20);assert.equal(s.gain,0.02);
 await page.click('#sysMusicVol');assert.equal((await info()).range,'20');
 // raising it again goes above the store\'s level, up to the end
 await page.fill('#sysMusicRange','100');
 await until(page,()=>window.__fa.gains[0].value===0.5);
 // while the music is stopped there is nothing to lower: the second button is not shown, and the level is kept
 await page.click('#sysMusic');
 await until(page,()=>document.getElementById('sysMusic').dataset.on==='0'&&document.getElementById('sysMusicVol').hidden&&document.getElementById('sysMusicPop').hidden);
 assert.equal((await info()).stored,'100');
 // his button starts it again at the remembered level
 await page.click('#sysMusic');
 await until(page,()=>AskerMusic.sounding()&&!document.getElementById('sysMusicVol').hidden);
 await until(page,()=>window.__fa.gains[0].value===0.5);
 // the sign-in screen has no button
 await page.evaluate(()=>document.getElementById('app').classList.add('hidden'));
 await until(page,()=>document.getElementById('sysMusicVol').hidden);
 // rubbish stored on the phone is the store\'s own level, with no error
 await page.evaluate(()=>{localStorage.setItem('asker_system_music_vol','loud')});
 const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.reload();await page.waitForSelector('#sysMusicVol');
 assert.equal(await page.evaluate(()=>AskerMusic.level()),60);
 assert.deepEqual(errs,[]);
});

run('System music volume in English',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-lang','en'));
 await page.addInitScript(FAKE);
 await page.reload();await page.waitForSelector('#sysMusicVol');
 await page.click('body',{position:{x:5,y:300}});
 await until(page,()=>AskerMusic.sounding());
 assert.equal(await page.getAttribute('#sysMusicVol','aria-label'),'Music volume');
 assert.equal(await page.getAttribute('#sysMusicVol','title'),'Music volume');
 await page.click('#sysMusicVol');
 assert.equal(await page.getAttribute('#sysMusicRange','aria-label'),'Music volume');
 await page.evaluate(()=>localStorage.removeItem('asker-lang'));
});

run('System music: the voice notepad\'s microphone makes it step aside while he dictates, and it comes back when the dictation ends',async({page})=>{
 await page.addInitScript(FAKE);
 await page.addInitScript(()=>{window.__rec=null;window.webkitSpeechRecognition=class{constructor(){window.__rec=this}start(){}stop(){if(this.onend)this.onend()}};window.SpeechRecognition=undefined});
 await page.reload();await page.waitForSelector('#sysMusic');
 await page.click('[data-group="home"]');await page.waitForSelector('#ntMic');
 await page.click('body',{position:{x:5,y:300}});
 await until(page,()=>AskerMusic.sounding());
 await page.click('#ntMic');
 await until(page,()=>!AskerMusic.sounding()&&window.__fa.els[0].paused);
 await page.evaluate(()=>window.__rec.stop());
 await until(page,()=>AskerMusic.sounding());
});
