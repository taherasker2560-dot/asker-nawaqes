// The music on the store site (owner 2026-11-17): the player's decisions (store/music.js: who hears it, who never does, the order of the pieces, the files) and the score the files are\n// rendered from (tools/music/score.js: eight pieces, half an hour without a repeat, no held tones). The browser test (tests/e2e/store-music.spec.cjs) checks that it starts, stops, is remembered and keeps out of the way.
const assert=require('node:assert/strict');
const M=require('../store/music.js'),SC=require('../tools/music/score.js'),fs=require('node:fs'),path=require('node:path');

// the pharmacy's own phone: the bot is signed in there (sb-<project>-auth-token), never a customer's phone
assert.equal(M.isPharmacyPhone(['asker_store_music_off','sb-qwrzdjdgvanmhaicncuk-auth-token']),true);
assert.equal(M.isPharmacyPhone(['asker-night','asker_store_cart']),false);
assert.equal(M.isPharmacyPhone(['sb-qwrzdjdgvanmhaicncuk-auth-token-code-verifier']),false,'only the exact key');
assert.equal(M.isPharmacyPhone([]),false);
assert.equal(M.isPharmacyPhone(null),false,'blocked storage: not the pharmacy phone');

// who gets what
assert.equal(M.modeOf({pharmacy:false,off:false,supported:true}),'auto','a customer or a visitor: it plays by itself');
assert.equal(M.modeOf({pharmacy:false,off:true,supported:true}),'stopped','he stopped it once: only his button starts it');
assert.equal(M.modeOf({pharmacy:true,off:false,supported:true}),'none','never on the pharmacy phone');
assert.equal(M.modeOf({pharmacy:true,off:true,supported:true}),'none');
assert.equal(M.modeOf({pharmacy:false,off:false,supported:false}),'none','no Web Audio: no sound and no button');
assert.equal(M.modeOf(null),'none');

// sound wanted right now
assert.equal(M.wanted({mode:'auto',hidden:false,holds:0}),true);
assert.equal(M.wanted({mode:'auto',hidden:true,holds:0}),false,'phone locked / tab hidden');
assert.equal(M.wanted({mode:'auto',hidden:false,holds:1}),false,'a voice note plays or is recorded');
assert.equal(M.wanted({mode:'stopped',hidden:false,holds:0}),false);
assert.equal(M.wanted({mode:'none',hidden:false,holds:0}),false);

// the texts
assert.ok(M.TEXTS.stop&&M.TEXTS.start&&M.TEXTS.stop!==M.TEXTS.start);
assert.equal(M.KEY,'asker_store_music_off');
assert.ok(M.VOLUME>=0.12&&M.VOLUME<=0.22,'a quiet background («موجودة ومش موجودة»), not a racket: '+M.VOLUME);

// ---- the pieces ----
const S=SC.STYLES;
assert.equal(S.length,8,'eight pieces');
assert.equal(new Set(S.map(s=>s.name)).size,8,'each has its own name');
assert.ok(new Set(S.map(s=>s.bpm)).size>=7,'and its own tempo');
assert.ok(new Set(S.map(s=>s.tonic)).size>=7,'and its own key');
assert.ok(new Set(S.map(s=>s.keys+'/'+s.lead)).size>=4,'and the instruments differ');
for(const s of S){
 assert.ok(s.bpm>=80&&s.bpm<=115,'a relaxed shop tempo: '+s.name+' '+s.bpm);
 for(const k of ['kick','hat','snap','shk','comp','bass'])assert.match(s[k],/^[x.]{16}$/,s.name+' '+k+' is 16 steps');
 assert.equal(s.A.length,4);assert.equal(s.B.length,4);
}
const secsOf=s=>SC.barsOf(s.bpm)*4*60/s.bpm;
for(const s of S)assert.ok(secsOf(s)>=235&&secsOf(s)<=275,s.name+' lasts about 4 minutes: '+secsOf(s));
assert.ok(S.reduce((a,s)=>a+secsOf(s),0)>=1800,'the eight together last more than half an hour');

// ---- the score ----
const run=(seed,seconds,opts)=>{const c=SC.composer(seed,opts),all=[];let t=8;while(t<=seconds+8){all.push(...c.until(t));t+=8}return {c,all}};
const order=(x,y)=>x.t-y.t||(x.type<y.type?-1:x.type>y.type?1:x.note-y.note);
const a=run(7,3600,null),b=run(7,3600,null);
assert.deepEqual(a.all,b.all,'same seed, same music');
assert.notDeepEqual(a.c.pieces().map(p=>p.style),run(8,3600,null).c.pieces().map(p=>p.style),'another seed, another order of pieces');
// asking ahead in small steps gives exactly what one big ask gives (the player asks a few seconds ahead, again and again)
assert.deepEqual(SC.composer(7).until(1208).sort(order),run(7,1200,null).all.sort(order),'asking ahead in small steps = asking once');

// half an hour of browsing never hears a piece twice; the next round is another shuffle and never starts with the piece that just ended
const pieces=a.c.pieces().filter(p=>p.t1!==null);
assert.ok(pieces.length>=14,'an hour = two rounds: '+pieces.length);
const first8=pieces.slice(0,8).map(p=>p.style);
assert.equal(new Set(first8).size,8,'the first eight pieces are all different: '+first8);
const within30=pieces.filter(p=>p.t0<1800).map(p=>p.style);
assert.equal(new Set(within30).size,within30.length,'no repeat in the first 30 minutes: '+within30);
assert.ok(pieces[7].t1>=1800,'and the eight last 30 minutes at least');
const second8=pieces.slice(8,16).map(p=>p.style);
assert.equal(new Set(second8).size,second8.length,'the next round has no repeat either');
for(let i=1;i<pieces.length;i++)assert.notEqual(pieces[i].style,pieces[i-1].style,'never the same piece twice in a row');
for(let i=1;i<pieces.length;i++)assert.ok(Math.abs(pieces[i].t0-pieces[i-1].t1)<1e-6,'pieces follow each other with no gap');
// a different seed shuffles differently: the order of a customer's visits is not the same every time
assert.notDeepEqual(first8,run(11,2400,null).c.pieces().slice(0,8).map(p=>p.style));

// every sound is struck and dies away: no held tone anywhere (a held tone hums)
const ev=a.all,TYPES=['ep','pluck','marimba','vibes','bass','kick','hat','shk','snap'];
assert.ok(ev.every(e=>TYPES.includes(e.type)),'only known sounds: '+[...new Set(ev.map(e=>e.type))]);
assert.ok(ev.every(e=>e.dur>0&&e.dur<=1.9),'no sound lasts longer than 1.9 s');
assert.ok(ev.every(e=>e.vel>0&&e.vel<=1&&Number.isFinite(e.t)&&e.t>=0));
assert.ok(ev.every(e=>(e.type==='kick'||e.type==='hat'||e.type==='shk'||e.type==='snap')===(e.note==null)),'drums have no note, the rest do');
for(const s of ['ep','bass'])assert.ok(ev.some(e=>e.type===s),s+' is played');
// never crowded: a few dozen events a second at most
const perSec={};for(const e of ev){const k=Math.floor(e.t);perSec[k]=(perSec[k]||0)+1}
assert.ok(Math.max(...Object.values(perSec))<=40,'not crowded: '+Math.max(...Object.values(perSec))+' events in one second');
// ranges that a phone speaker can play, and the melody stays on the pentatonic scale of its key
const pc=(n)=>((n%12)+12)%12;
for(const e of ev.filter(e=>e.type==='ep'||e.type==='pluck'&&e.ch==='keys'||e.type==='marimba'&&e.ch==='keys')){assert.ok(e.note>=57&&e.note<=85,'keys '+e.note)}
for(const e of ev.filter(e=>e.type==='bass'))assert.ok(e.note>=43&&e.note<=55,'bass '+e.note);
for(const e of ev.filter(e=>e.ch==='lead')){
 const st=S[e.p];assert.ok(e.note>=72&&e.note<=88,'melody '+e.note);
 assert.ok([0,2,4,7,9].includes(pc(e.note-st.tonic)),'melody note on the pentatonic scale of '+st.name+': '+e.note);
}
// the harmony: the first chord of the first bar of a piece is the first chord of its loop (bossa: C major 7)
const bossa=SC.composer(3,{first:0,fromBar:8}).until(2);
const keys0=bossa.filter(e=>e.ch==='keys'&&e.t<0.3);
assert.ok(keys0.length>=3&&keys0.every(e=>[0,4,7,11].includes(pc(e.note-60))),'bossa opens on Cmaj7: '+keys0.map(e=>e.note));
// the groove: the kick lands where the pattern says (the first beat of a groove bar), the intro has no kick and no bass, the last bar no drums
const intro=SC.composer(3,{first:0}).until(19);assert.ok(!intro.some(e=>e.type==='kick'||e.type==='bass'),'the intro is only keys and a little shaker');
assert.ok(intro.some(e=>e.type==='ep'),'but it has keys');
const groove=SC.composer(3,{first:0,fromBar:8}).until(2.5);assert.ok(groove.some(e=>e.type==='kick'&&e.t<0.05),'a kick on the first beat of a groove bar');
// the melody comes in blocks B (and sometimes A2 / break): blocks A have none
const lead=run(5,4000,{first:1}).all.filter(e=>e.ch==='lead');assert.ok(lead.length>50,'melodies are played: '+lead.length);
const aBlock=SC.composer(5,{first:1,fromBar:8}).until(17); // 8 bars of 108 bpm = 17.8 s: only block A\nassert.ok(!aBlock.some(e=>e.ch==='lead'),'block A (groove) has no melody');
// the very first piece and the first seconds: a soft start (the first bar is quieter)
const start=SC.composer(9,{first:2}).until(1);assert.ok(Math.max(...start.map(e=>e.vel))<=0.56,'the first bar is soft');
// a visit starts in the groove (the player skips the 8-bar intro of the first piece): the first seconds after the intro already have a kick, a bass and keys
for(let p=0;p<SC.STYLES.length;p++){const live=SC.composer(123,{first:p,fromBar:8}).until(6);for(const t of ['kick','bass'])assert.ok(live.some(e=>e.type===t),SC.STYLES[p].name+': the first seconds of a visit have a '+t);assert.ok(live.some(e=>e.ch==='keys'))}

// ---- the files the player plays (store/music/, made by tools/music/render.cjs) ----
assert.equal(M.TRACKS.length,SC.STYLES.length,'one file per piece');
assert.equal(new Set(M.TRACKS.map(t=>t.file)).size,M.TRACKS.length);
M.TRACKS.forEach((t,p)=>{
 assert.match(t.file,/^\d\d-[a-z0-9-]+\.mp3$/);
 assert.equal(t.file,String(p+1).padStart(2,'0')+'-'+SC.STYLES[p].name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.mp3','the files follow the order of the score');
 assert.equal(t.intro,+SC.introOf(p).toFixed(1),SC.STYLES[p].name+': the skipped intro is the 8 bars of the score');
});
const dir=path.join(__dirname,'..','store','music');
const index=JSON.parse(fs.readFileSync(path.join(dir,'index.json'),'utf8'));
assert.equal(index.length,M.TRACKS.length,'every piece is rendered');
index.forEach(x=>{
 const t=M.TRACKS[x.piece];assert.equal(x.file,t.file);assert.equal(x.intro,t.intro);
 const bytes=fs.statSync(path.join(dir,x.file)).size;assert.equal(bytes,x.bytes,x.file+' is the file the index describes');
 assert.ok(bytes>1.5e6&&bytes<3.5e6,x.file+' is about 2.4 MB (a phone loads one at a time): '+bytes);
 assert.ok(x.secs>=235&&x.secs<=262,x.file+' lasts about 4 minutes: '+x.secs);
 assert.ok(x.peakDb<=-0.1,x.file+' does not clip: '+x.peakDb);
 assert.ok(x.rmsDb<=-6&&x.rmsDb>=-30,x.file+' has a sane level: '+x.rmsDb);
 const head=fs.readFileSync(path.join(dir,x.file)).subarray(0,3);assert.ok((head[0]===0xFF&&(head[1]&0xE0)===0xE0)||head.toString()==='ID3',x.file+' is an MP3');
});
assert.ok(index.reduce((a,x)=>a+x.secs,0)>=1800,'the files last more than half an hour in all');

// ---- the order of the pieces: rounds of all of them, shuffled; a round never starts with the piece that just ended ----
const rng=(seed)=>{let s=seed;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}};
for(let seed=1;seed<=200;seed++){
 const r=rng(seed);let last=-1;const seen=[];
 for(let round=0;round<6;round++){const a=M.nextRound(r,last,8);
  assert.deepEqual([...a].sort((x,y)=>x-y),[0,1,2,3,4,5,6,7],'a round has every piece once');
  assert.notEqual(a[0],last,'a round never starts with the piece that just ended');
  last=a[7];seen.push(a.join(''))}
 if(seed===1)assert.ok(new Set(seen).size>=5,'the rounds are shuffled differently');
}
assert.deepEqual(M.nextRound(()=>0.5,-1,1),[0],'one piece: just that one');

// ---- the promo voice (owner 2026-11-18): once, then not again for a few days ----
assert.equal(M.PROMO.voice,'Orus','the owner picked Orus');
assert.ok(M.PROMO.delay>=5&&M.PROMO.delay<=30,'it comes a few seconds after the music is sounding: '+M.PROMO.delay);
assert.ok(M.PROMO.everyDays>=0&&M.PROMO.everyDays<=7,'0 = every visit (testing), else a few days: '+M.PROMO.everyDays);
assert.equal(M.promoDue('2026-11-18','2026-11-18',0),true,'every visit (0): due even if heard today');assert.equal(M.promoDue('2026-11-18','2026-11-18',3),false,'the 3-day rule still works when it is set');
assert.ok(M.PROMO.gain>0.1&&M.PROMO.gain<0.35,'soft on purpose («أوطى شوية، ما يبقاش مزعج»): '+M.PROMO.gain);
assert.equal(M.dayKey(new Date(2026,10,5)),'2026-11-05','a day is the phone\'s own date');
assert.equal(M.promoDue(null,'2026-11-18',3),true,'never heard here: due');
assert.equal(M.promoDue('garbage','2026-11-18',3),true);
assert.equal(M.promoDue('2026-11-18','2026-11-18',3),false,'heard today');
assert.equal(M.promoDue('2026-11-16','2026-11-18',3),false,'two days ago: not yet');
assert.equal(M.promoDue('2026-11-15','2026-11-18',3),true,'three days ago: due again');
assert.equal(M.promoDue('2026-10-31','2026-11-02',3),false,'across a month end');
assert.equal(M.promoDue('2026-10-29','2026-11-02',3),true);
assert.equal(M.promoDue('2026-11-20','2026-11-18',3),true,'a clock set back: due, never stuck');
// the advert's own loudness decides its gain (a new render comes out louder or quieter): speech at -27 dBFS, never louder than the file, never nearly silent
const wav16=(amp,n=24000)=>{const b=Buffer.alloc(44+n*2);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(amp*Math.sin(i/20)),44+i*2);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
const r1=M.wavRms(wav16(3000));assert.ok(r1>0.06&&r1<0.075,'a sine of 3000 has an RMS near 0.065: '+r1);
assert.ok(M.wavRms(wav16(9000))>2.5*r1,'louder speech measures louder');
assert.equal(M.wavRms(null),0);assert.equal(M.wavRms(new ArrayBuffer(100)),0,'too short to be a WAV');assert.equal(M.wavRms(wav16(0)),0,'silence');
assert.ok(Math.abs(M.promoGain(Math.pow(10,-27/20),-27,0.3)-1)<1e-9,'speech already at the target: gain 1');
assert.ok(Math.abs(M.promoGain(0.1,-27,0.3)-0.4467)<0.001,'speech at -20 dBFS: down by 7 dB');
assert.equal(M.promoGain(0,-27,0.3),0.3,'the level is unknown: the fallback');
assert.equal(M.promoGain(0.001,-27,0.3),1,'a very quiet file is never boosted past the file itself');
assert.equal(M.promoGain(5,-27,0.3),0.05,'and never made nearly silent');
assert.equal(M.PROMO.targetDb,-27);
console.log('store-music ok');