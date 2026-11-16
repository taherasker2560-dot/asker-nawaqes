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
assert.deepEqual(R('skipped'),['البوت طلبه ومش معلّم عليه على الجهاز','warn']);
assert.deepEqual(C.reason({why:'new_code_later',txt:'نص من اللاب'}),['نص من اللاب','gray'],'a code this page does not know shows the laptop\'s own text');
assert.deepEqual(C.reason(null),['','gray']);assert.equal(C.reasonText({why:'skipped'}),'البوت طلبه ومش معلّم عليه على الجهاز');
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
// what arrived (owner 2026-11-16: some items he orders from ANOTHER warehouse without ticking them on the machine): the second chip of a line
const A=(why,arr,final)=>C.arrival({why,arr},final);
assert.deepEqual(A('skipped',{vendor:'الفتح',code:'1',h:14.9}),['وصل من الفتح بعد 15 ساعة: اتطلب من مخزن تاني','ok'],'a bot line he did not tick that arrived = ordered elsewhere');
assert.deepEqual(A('manual',{vendor:'AMG',h:20}),['وصل من AMG بعد 20 ساعة: اتطلب من مخزن تاني','ok']);
assert.deepEqual(A('skipped',{vendor:'',h:0.2}),['وصل بعد 1 ساعة: اتطلب من مخزن تاني','ok'],'no vendor name, under an hour = 1');
assert.deepEqual(A('had_stock',{vendor:'الفتح',h:16.2}),['وصل من الفتح بعد 16 ساعة','ok'],'a machine-only item that arrived: just the fact');
assert.deepEqual(A('carried',{vendor:'AMG',h:15.4}),['وصل من AMG بعد 15 ساعة','ok'],'an old line that arrived is NOT counted as ordered elsewhere');
assert.deepEqual(A('skipped',null,false),['لسه ما وصلش: بنستنى الفواتير','gray'],'inside the 48 hours: still waiting');
assert.deepEqual(A('manual',null,true),['ما وصلش خلال يومين: غالبًا ما اتطلبش','warn'],'after the 48 hours: probably not ordered');
assert.equal(A('had_stock',null,true),null);assert.equal(A('carried',null,false),null);assert.equal(C.arrival(null,true),null);
assert.equal(C.isElsewhere({why:'skipped',arr:{h:1}}),true);assert.equal(C.isElsewhere({why:'manual',arr:{h:1}}),true);assert.equal(C.isElsewhere({why:'carried',arr:{h:1}}),false);assert.equal(C.isElsewhere({why:'skipped'}),false);
// the night's rate counts the ones that arrived as his order too (50 of his 60 + 2 elsewhere → 52 of 62), the strict counts stay as they were
const ob6=[{id:1,name:'S1',why:'skipped',arr:{vendor:'X',h:15}},{id:2,name:'S2',why:'skipped'},{id:3,name:'M1',why:'manual',arr:{vendor:'Y',h:30}},{id:4,name:'C1',why:'carried',arr:{vendor:'Z',h:10}}];
const nE=C.normNight({...night('2026-11-16',50,10,0),bot:54,only_bot_items:ob6,final:false,window_end:'2026-11-18 00:42'});
assert.equal(nE.machine,60);assert.equal(nE.both,50);assert.equal(nE.onlyBot,4,'the list is not changed');assert.equal(nE.elsewhere,2,'S1 and M1; the old line and the one that did not arrive are not counted');
assert.equal(nE.cover,C.pctOf(52,62),'84');assert.equal(nE.prec,C.pctOf(52,54),'96');assert.equal(nE.final,false);assert.equal(nE.until,'2026-11-18 00:42');
const nF=C.normNight({...night('2026-11-16',50,10,0),bot:50,only_bot_items:[],final:true});assert.equal(nF.final,true);assert.equal(nF.elsewhere,0);assert.equal(nF.cover,C.pctOf(50,60));
// the week uses the adjusted numbers of every night
const wk=C.weekOf([nE,nF]);assert.equal(wk.cover,C.pctOf(52+50,62+60));assert.equal(wk.nights,2);
console.log('PASS: order-compare arrivals');
// the QUANTITY: the bot's quantity against what arrived on the invoice (PharmaFly does not keep the quantity he orders)
const Q=(r)=>C.qtyChip(r);
assert.deepEqual(Q({qty:3,arr:{q:3}}),['وصل 3: نفس كمية البوت','ok'],'a line in both, same quantity');
assert.deepEqual(Q({qty:2,arr:{q:3}}),['البوت 2 ووصل 3','warn'],'a different quantity');
assert.deepEqual(Q({qty:2,arr:{q:2.4}}),['وصل 2.4: نفس كمية البوت','ok'],'rounded to whole packs');
assert.deepEqual(Q({qty:2,arr:{q:1.5}}),['وصل 1.5: نفس كمية البوت','ok']);
assert.equal(Q({qty:2,arr:{q:3.6}})[0],'البوت 2 ووصل 3.6');
assert.deepEqual(Q({qty:1,why:'skipped',arr:{q:1}}),['وصل 1: نفس كمية البوت','ok'],'the bot line that arrived from another warehouse counts');
assert.equal(Q({qty:1,why:'carried',arr:{q:1}}),null,'an old line is not tonight\'s order');
assert.equal(Q({why:'had_stock',arr:{q:1}}),null,'a machine-only item has no bot quantity');
assert.equal(Q({qty:2}),null,'nothing arrived yet');assert.equal(Q({qty:2,arr:{vendor:'X',h:3}}),null,'an older file without the quantity');assert.equal(Q(null),null);
const nQ=C.normNight({...night('2026-11-16',3,0,2),bot:5,both_items:[{id:1,name:'B1',qty:3,arr:{q:3}},{id:2,name:'B2',qty:2,arr:{q:3}},{id:3,name:'B3',qty:1}],only_bot_items:[{id:4,name:'E1',qty:2,why:'skipped',arr:{q:2}},{id:5,name:'C1',qty:1,why:'carried',arr:{q:1}}]});
assert.equal(nQ.qtyN,3,'B1, B2 and E1 count; B3 has not arrived, C1 is an old line');assert.equal(nQ.qtySame,2,'B1 and E1 are the same quantity');
console.log('PASS: order-compare quantity');