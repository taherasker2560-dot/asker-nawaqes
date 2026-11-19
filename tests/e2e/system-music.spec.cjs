// «🎵 موسيقى السيستم» (owner 2026-11-19: «عاوز خلفية موسيقى للسيستم ليا وللمستخدمين اللي على السيستم معايا، نفس نظام الأبليكيشن بتاع العملا»): the quiet music inside the system. The sound is played
// here by a stand-in for Audio / AudioContext (the real files are the store's, checked in tests/system-music.cjs): what is tested is WHEN it plays: by itself once somebody is signed in, after the
// first touch, silent on the sign-in screen, the button stops it and the phone remembers (its own switch), a voice note / the phone speaking / a recording make it step aside, and the store's switch is not touched.
const {run,assert}=require('./harness.cjs');
const FAKE=()=>{
 window.__fa={els:[],ctxs:[]};
 class A{constructor(){this.paused=true;this.src='';this.attrs={};this.h={};this.currentTime=0;this.muted=false;this.tagName='AUDIO';__fa.els.push(this)}
  setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]}
  addEventListener(t,f){(this.h[t]=this.h[t]||[]).push(f)}removeEventListener(t,f){this.h[t]=(this.h[t]||[]).filter(x=>x!==f)}
  play(){this.paused=false;(this.h.playing||[]).forEach(f=>f());return Promise.resolve()}
  pause(){const was=this.paused;this.paused=true;if(!was)(this.h.pause||[]).forEach(f=>f())}}
 class C{constructor(){this.state='running';this.currentTime=0;this.destination={};__fa.ctxs.push(this)}
  createGain(){const p={value:0,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(v){p.value=v}};return {gain:p,connect(){}}}
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
