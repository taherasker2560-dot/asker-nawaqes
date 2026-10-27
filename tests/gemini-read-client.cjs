// Client helpers of gemini-read.js without a browser.
const assert=require('node:assert/strict'),G=require('../gemini-read.js'),crypto=require('node:crypto');
for(const n of [0,1,2,3,0x8000,0x8000*3+7]){const b=crypto.randomBytes(n);assert.equal(G.base64(b.buffer.slice(b.byteOffset,b.byteOffset+b.length)),b.toString('base64'),'base64 of '+n+' bytes')}
assert.deepEqual(G.summarize([{fileName:'a.jpg',names:['x1','x2'],unclear:['x2']},{fileName:'b.jpg',names:['y1'],unclear:[]}]),{count:3,unclear:['a.jpg: x2']});
(async()=>{assert.equal(await G.errorMessage({context:{json:async()=>({message:'خلصت الحصة'})}}),'خلصت الحصة');assert.equal(await G.errorMessage({message:'net'}),'net');assert.equal(await G.errorMessage(null),'خطأ غير معروف');
console.log('PASS: gemini-read client: base64 matches Node for chunk boundaries, unclear summary, server error messages surfaced')})().catch(e=>{console.error(e);process.exitCode=1});
