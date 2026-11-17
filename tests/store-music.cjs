// The calm music on the store site (store/music.js, owner 2026-11-17): the decisions (who hears it, who never does) and the score. The sound itself is Web Audio: the browser test
// (tests/e2e/store-music.spec.cjs) checks that it starts, stops, is remembered and keeps out of the way.
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
assert.ok(M.VOLUME<=0.3,'low volume');

// the score: calm and in tune; the same seed gives the same music, another seed another order of notes
const events=(seed,secs)=>{const c=M.composer(seed),a=[];let t=8;while(t<=secs+8){a.push(...c.until(t));t+=8}return a};
const a=events(7,300),b=events(7,300),c=events(8,300);
assert.deepEqual(a,b,'same seed, same music');
assert.notDeepEqual(a.filter(e=>e.type==='bell'),c.filter(e=>e.type==='bell'),'another seed, another notes');
// asking in small steps gives exactly what one big ask gives (the player asks a few seconds ahead, again and again)
const order=(x,y)=>x.t-y.t||(x.type<y.type?-1:1);
const whole=M.composer(7).until(304);assert.deepEqual([...a].sort(order),[...whole].sort(order),'asking ahead in small steps = asking once');
const pads=a.filter(e=>e.type==='pad'),bells=a.filter(e=>e.type==='bell');
assert.ok(pads.length>=30&&pads.length<=40,'a chord every 9 s: '+pads.length);
for(let i=1;i<pads.length;i++)assert.equal(pads[i].t-pads[i-1].t,9,'chords 9 s apart');
assert.ok(pads.every(p=>p.dur>9),'each pad overlaps the next: no gap, no click');
for(const p of pads)assert.ok(M.CHORDS.some(ch=>JSON.stringify(ch)===JSON.stringify(p.notes)),'only the four chords of the progression');
assert.deepEqual(pads.slice(0,5).map(p=>p.notes[0]),[60,57,53,55,60],'C - Am - F - G, then again');
assert.ok(bells.length>=60,'a bell note every few seconds: '+bells.length);
assert.ok(bells.every(e=>M.BELLS.includes(e.note)),'bells only on the pentatonic scale');
assert.ok(bells.every(e=>e.vel>=0.5&&e.vel<=1),'soft and even');
assert.ok(bells.every(e=>e.t>=3),'the first note waits a few seconds');
for(let i=1;i<bells.length;i++)assert.ok(bells[i].t>bells[i-1].t,'bell notes in time order');
// never a rush of notes: at least half a second between two, and quiet gaps between phrases
const gaps=bells.slice(1).map((e,i)=>e.t-bells[i].t);
assert.ok(Math.min(...gaps)>=0.5,'no two notes closer than half a second');
assert.ok(gaps.filter(g=>g>=2.2).length>=bells.length/4,'long quiet gaps between phrases');
console.log('store-music ok');
