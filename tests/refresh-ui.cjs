// «حدّث النواقص دلوقتي» (ar/refresh.js): the line under the button for the newest request.
const assert=require('node:assert/strict');
const R=require('../ar/refresh.js');
const now=new Date(2026,10,9,15,0);
const at=(d,h,m)=>new Date(2026,10,d,h,m).toISOString();
assert.equal(R.when(at(9,14,5),now),'النهارده 2:05 م');assert.equal(R.when(at(8,23,30),now),'امبارح 11:30 م');assert.equal(R.when(at(5,9,0),now),'05/11 9:00 ص');assert.equal(R.when('bad',now),'');
assert.deepEqual(R.describe(null,now),{text:'',kind:'',open:false},'no request yet: nothing under the button');
const wait=R.describe({status:'new',requested_at:at(9,14,50)},now);
assert.equal(wait.text,'اتطلب التحديث النهارده 2:50 م. اللاب بياخده خلال 5 دقايق.');assert.equal(wait.open,true);assert.equal(wait.kind,'');
const run=R.describe({status:'running',requested_at:at(9,14,50),started_at:at(9,14,53)},now);
assert.match(run.text,/اللاب شغّال على التحديث من النهارده 2:53 م/);assert.equal(run.open,true);
const done=R.describe({status:'done',requested_at:at(9,14,50),finished_at:at(9,14,58)},now);
assert.equal(done.text,'آخر تحديث طلبته خلص النهارده 2:58 م.');assert.equal(done.open,false);assert.equal(done.kind,'good');
const bad=R.describe({status:'failed',requested_at:at(9,14,50),finished_at:at(9,14,58),note:'share unreachable'},now);
assert.equal(bad.text,'آخر تحديث طلبته ما خلصش (النهارده 2:58 م): share unreachable. جرّب تاني.');assert.equal(bad.kind,'bad');assert.equal(bad.open,false);
assert.equal(R.describe({status:'failed',requested_at:at(9,14,50)},now).text,'آخر تحديث طلبته ما خلصش (النهارده 2:50 م). جرّب تاني.');
assert.equal(R.isOpen({status:'new'}),true);assert.equal(R.isOpen({status:'running'}),true);assert.equal(R.isOpen({status:'done'}),false);assert.equal(R.isOpen(null),false);
assert.equal(R.POLL_MS,20000);
console.log('refresh-ui ok');
