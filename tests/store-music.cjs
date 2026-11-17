// The music on the store site (store/music.js, owner 2026-11-17): the decisions (who hears it, who never does) and the score (eight pieces, half an hour without a repeat, no held tones).
// The sound itself is Web Audio: the browser test (tests/e2e/store-music.spec.cjs) checks that it starts, stops, is remembered and keeps out of the way.
const assert=require('node:assert/strict');
const M=require('../store/music.js');

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
const S=M.STYLES;
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
const secsOf=s=>M.barsOf(s.bpm)*4*60/s.bpm;
for(const s of S)assert.ok(secsOf(s)>=235&&secsOf(s)<=275,s.name+' lasts about 4 minutes: '+secsOf(s));
assert.ok(S.reduce((a,s)=>a+secsOf(s),0)>=1800,'the eight together last more than half an hour');

// ---- the score ----
const run=(seed,seconds,opts)=>{const c=M.composer(seed,opts),all=[];let t=8;while(t<=seconds+8){all.push(...c.until(t));t+=8}return {c,all}};
const order=(x,y)=>x.t-y.t||(x.type<y.type?-1:x.type>y.type?1:x.note-y.note);
const a=run(7,3600,null),b=run(7,3600,null);
assert.deepEqual(a.all,b.all,'same seed, same music');
assert.notDeepEqual(a.c.pieces().map(p=>p.style),run(8,3600,null).c.pieces().map(p=>p.style),'another seed, another order of pieces');
// asking ahead in small steps gives exactly what one big ask gives (the player asks a few seconds ahead, again and again)
assert.deepEqual(M.composer(7).until(1208).sort(order),run(7,1200,null).all.sort(order),'asking ahead in small steps = asking once');

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
const bossa=M.composer(3,{first:0,fromBar:8}).until(2);
const keys0=bossa.filter(e=>e.ch==='keys'&&e.t<0.3);
assert.ok(keys0.length>=3&&keys0.every(e=>[0,4,7,11].includes(pc(e.note-60))),'bossa opens on Cmaj7: '+keys0.map(e=>e.note));
// the groove: the kick lands where the pattern says (the first beat of a groove bar), the intro has no kick and no bass, the last bar no drums
const intro=M.composer(3,{first:0}).until(19);assert.ok(!intro.some(e=>e.type==='kick'||e.type==='bass'),'the intro is only keys and a little shaker');
assert.ok(intro.some(e=>e.type==='ep'),'but it has keys');
const groove=M.composer(3,{first:0,fromBar:8}).until(2.5);assert.ok(groove.some(e=>e.type==='kick'&&e.t<0.05),'a kick on the first beat of a groove bar');
// the melody comes in blocks B (and sometimes A2 / break): blocks A have none
const lead=run(5,4000,{first:1}).all.filter(e=>e.ch==='lead');assert.ok(lead.length>50,'melodies are played: '+lead.length);
const aBlock=M.composer(5,{first:1,fromBar:8}).until(17); // 8 bars of 108 bpm = 17.8 s: only block Aassert.ok(!aBlock.some(e=>e.ch==='lead'),'block A (groove) has no melody');
// the very first piece and the first seconds: a soft start (the first bar is quieter)
const start=M.composer(9,{first:2}).until(1);assert.ok(Math.max(...start.map(e=>e.vel))<=0.56,'the first bar is soft');
// a visit starts in the groove, not in 20 quiet seconds of intro (the page asks for START_BAR): the first seconds already have a kick, a bass and keys
assert.equal(M.START_BAR,8);
const live=M.composer(123,{fromBar:M.START_BAR}).until(6);
for(const t of ['kick','bass'])assert.ok(live.some(e=>e.type===t),'the first seconds of a visit have a '+t);
assert.ok(live.some(e=>e.ch==='keys'));
console.log('store-music ok');
