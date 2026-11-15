// «طلب الجهاز × طلب البوت» card helpers (ar/order-compare.js): reading the laptop's file, the reason texts, the week's rate, the 7 slots.
const assert=require('node:assert/strict');
const C=require('../ar/order-compare.js');
assert.equal(C.PATH,'orders/compare.json','same place Hub\\orders\\ORDER_COMPARE.ps1 uploads to');
assert.equal(C.SLOTS,7);
// dates and clock
assert.equal(C.dm('2026-11-16'),'16/11');assert.equal(C.dm('bad'),'');assert.equal(C.dm(null),'');
assert.equal(C.clock('2026-11-16 00:46'),'12:46 ص');assert.equal(C.clock('2026-11-16 13:05'),'1:05 م');assert.equal(C.clock('2026-11-16 12:30'),'12:30 م');assert.equal(C.clock('2026-11-16 01:34'),'1:34 ص');
assert.equal(C.clock('bad'),'');assert.equal(C.clock(undefined),'');
// percent
assert.equal(C.pctOf(55,70),79);assert.equal(C.pctOf(1,3),33);assert.equal(C.pctOf(0,10),0);assert.equal(C.pctOf(5,0),null,'nothing to compare = no number');assert.equal(C.pctOf('x','y'),null);
// every reason code the laptop writes has its text and its tone (red = the bot got it wrong)
const R=(why,extra={})=>C.reason({why,...extra});
assert.deepEqual(R('postponed'),['إنت أجّلته (نقلته لكل الشركات)','own']);
assert.deepEqual(R('cancelled_me'),['إنت لغيته من أمر الشرا','own']);
assert.deepEqual(R('closed_auto'),['البوت قفل سطره قبل طلبك (الرصيد رجع أو خرج من الحقيبة)','gray']);
assert.equal(R('unknown')[1],'gray');assert.deepEqual(R('gs'),['في النواقص العامة','gray']);
assert.deepEqual(R('had_stock',{have:3}),['عنده رصيد 3 (البوت بيطلب الصفر بس)','warn']);
assert.deepEqual(R('had_stock',{have:2.5}),['عنده رصيد 2.5 (البوت بيطلب الصفر بس)','warn']);
assert.deepEqual(R('dup'),['ممكن نفس الصنف: مستني قرارك','gray']);
assert.deepEqual(R('missed',{bag:'نواقص يوميه'}),['رصيده صفر في نواقص يوميه والبوت ما دخلهوش: محتاج نبص','red']);
assert.deepEqual(R('missed'),['رصيده صفر والبوت ما دخلهوش: محتاج نبص','red'],'no bag name = still readable');
assert.deepEqual(R('other_bag',{bag:'مالك'}),['في حقيبة تانية (مالك)','gray']);assert.deepEqual(R('other_bag'),['في حقيبة تانية','gray']);
assert.equal(R('no_bag')[0],'مش في أي حقيبة');assert.equal(R('not_short')[0],'مش ظاهر ناقص عند البوت');
assert.deepEqual(R('manual'),['إنت حطيته بإيدك في أمر الشرا','own']);
assert.equal(R('ordered_before')[0],'اتطلب في طلب الليلة اللي فاتت ولسه ما وصلش');
assert.deepEqual(R('carried',{days:3}),['سطر قديم من 3 يوم ولسه مفتوح','gray']);assert.equal(R('carried',{days:0})[0],'سطر قديم من 1 يوم ولسه مفتوح','at least one day');
assert.deepEqual(R('skipped'),['البوت طلبه وإنت ما طلبتوش من الجهاز','warn']);
assert.deepEqual(C.reason({why:'new_code_later',txt:'نص من اللاب'}),['نص من اللاب','gray'],'a code this page does not know shows the laptop\'s own text');
assert.deepEqual(C.reason(null),['','gray']);assert.equal(C.reasonText({why:'skipped'}),'البوت طلبه وإنت ما طلبتوش من الجهاز');
// the file
const night=(key,both,om,ob,extra={})=>({night:key,at:key+' 00:46',comparable:true,late:false,machine:both+om,bot:both+ob,both:both,only_machine:om,only_bot:ob,outside:0,both_scope:both,
 both_items:Array.from({length:both},(_,k)=>({id:k+1,name:'B'+k,qty:1})),only_machine_items:Array.from({length:om},(_,k)=>({id:100+k,name:'M'+k,why:'had_stock',have:1})),
 only_bot_items:Array.from({length:ob},(_,k)=>({id:200+k,name:'T'+k,qty:2,why:'skipped'})),...extra});
assert.equal(C.parseCompare(null),null);assert.equal(C.parseCompare({}),null);assert.equal(C.parseCompare({nights:'x'}),null);
const empty=C.parseCompare({generated_at:'2026-11-16T00:00:00Z',nights:[],week:{nights:0}});
assert.deepEqual(empty.nights,[]);assert.equal(empty.week.nights,0);assert.equal(empty.week.cover,null,'no nights = no rate');assert.equal(empty.generatedAt,'2026-11-16T00:00:00Z');
const f=C.parseCompare({generated_at:'x',nights:[night('2026-11-14',50,10,5),night('2026-11-16',55,15,9,{outside:12,late:true}),{night:'2026-11-13',comparable:false,machine:40},null,{night:'bad'},night('2026-11-15',60,5,2)]});
assert.deepEqual(f.nights.map(n=>n.night),['2026-11-16','2026-11-15','2026-11-14'],'newest first; a night that could not be compared and broken rows are dropped');
const n0=f.nights[0];
assert.equal(n0.machine,70);assert.equal(n0.both,55);assert.equal(n0.onlyMachine,15);assert.equal(n0.onlyBot,9);assert.equal(n0.outside,12);assert.equal(n0.late,true);
assert.equal(n0.cover,79,'55 of the 70 he ordered');assert.equal(n0.prec,86,'55 of the bot\'s 64 lines');
assert.equal(n0.bothItems.length,55);assert.equal(n0.onlyMachineItems[0].why,'had_stock');
// the numbers follow the lists, so they can never disagree with what is shown
const fx=C.parseCompare({nights:[night('2026-11-16',2,1,0,{machine:99,both:99,only_machine:99})]});assert.equal(fx.nights[0].machine,3);assert.equal(fx.nights[0].both,2);assert.equal(fx.nights[0].onlyMachine,1);
// the week = all the nights together, not an average of percentages
const w=f.week;assert.equal(w.nights,3);
assert.equal(w.cover,C.pctOf(55+60+50,70+65+60),'165 of 195');
assert.equal(C.weekOf([]).cover,null);assert.equal(C.weekOf(null).nights,0);
// at most 7 nights
const many=C.parseCompare({nights:Array.from({length:10},(_,k)=>night('2026-11-'+String(20-k).padStart(2,'0'),5,1,1))});
assert.equal(many.nights.length,7);assert.equal(many.nights[0].night,'2026-11-20');assert.equal(many.nights[6].night,'2026-11-14');
// the little chart: 7 slots, oldest first, the free ones at the end
const s=C.slots(f.nights);assert.equal(s.length,7);assert.deepEqual(s.map(x=>x&&x.night),['2026-11-14','2026-11-15','2026-11-16',null,null,null,null]);
assert.equal(C.slots([]).filter(Boolean).length,0);
// is the file old (the laptop stopped updating)
const now=new Date('2026-11-16T12:00:00Z');
assert.equal(C.isOld('2026-11-16T09:00:00Z',now),false);assert.equal(C.isOld('2026-11-14T09:00:00Z',now),true);assert.equal(C.isOld('bad',now),true);assert.equal(C.isOld('',now),true);
console.log('PASS: order-compare helpers');
