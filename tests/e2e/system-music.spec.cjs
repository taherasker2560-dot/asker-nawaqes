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
