// «طلب السيستم × مشتريات تاني يوم» card helpers (ar/order-compare.js): reading the laptop's file (v2), the reason texts, the arrival chips, the quantity,
// the week's rate, the 7 slots. The reference is what ARRIVED on the supplier invoices after the bot's order (owner 2026-11-16), not the order stamped on PharmaFly.
const assert=require('node:assert/strict');
const C=require('../ar/order-compare.js');
assert.equal(C.PATH,'orders/compare2.json','same place Hub\\orders\\ORDER_COMPARE.ps1 uploads to');
assert.equal(C.SLOTS,7);
// dates and clock
assert.equal(C.dm('2026-11-16'),'16/11');assert.equal(C.dm('bad'),'');assert.equal(C.dm(null),'');
assert.equal(C.clock('2026-11-16 00:46'),'12:46 ص');assert.equal(C.clock('2026-11-16 13:05'),'1:05 م');assert.equal(C.clock('2026-11-16 12:30'),'12:30 م');assert.equal(C.clock('2026-11-16 01:34'),'1:34 ص');
assert.equal(C.clock('bad'),'');assert.equal(C.clock(undefined),'');
// percent
assert.equal(C.pctOf(55,70),79);assert.equal(C.pctOf(1,3),33);assert.equal(C.pctOf(0,10),0);assert.equal(C.pctOf(5,0),null,'nothing to compare = no number');assert.equal(C.pctOf('x','y'),null);
// every reason code the laptop writes has its text and its tone (red = the bot got it wrong)
const R=(why,extra={})=>C.reason({why,...extra});
assert.deepEqual(R('manual'),['إنت حطيته بإيدك في أمر الشرا','own']);
assert.deepEqual(R('postponed'),['إنت أجّلته (نقلته لكل الشركات)','own']);
assert.deepEqual(R('cancelled_me'),['إنت لغيته من أمر الشرا','own']);
// what the order builder kept out itself (owner 2026-11-28): the cap is said as the cap, never «missed»
assert.deepEqual(R('cap'),['السقف مسكه: ميزانية الأمر كانت كملت','warn']);assert.deepEqual(R('got_today'),['كان وصل في نفس اليوم: السيستم مش بيطلبه مرتين في اليوم','warn']);
assert.deepEqual(R('asked'),['صنف جديد أو «بالطلب»: مش بيدخل الأمر غير لما تضيفه','gray']);assert.deepEqual(R('not_now'),['إنت دوست عليه «مش دلوقتي»','own']);assert.deepEqual(R('dup_same'),['إنت قلت إنه نفس صنف تاني','own']);
assert.deepEqual(R('closed_auto'),['السيستم قفل سطره قبل الطلب (الرصيد رجع أو خرج من الحقيبة)','gray']);
assert.equal(R('unknown')[1],'gray');assert.deepEqual(R('gs'),['في النواقص العامة','gray']);
assert.deepEqual(R('had_stock',{have:12,cover:9.4}),['رصيده 12 يكفي 9.4 يوم','warn'],'the stock and for how many days it lasts');
assert.deepEqual(R('had_stock',{have:2.5}),['عنده رصيد 2.5','warn'],'no sales = no days');
assert.deepEqual(R('dup'),['ممكن نفس الصنف: مستني قرارك','gray']);
assert.deepEqual(R('missed',{bag:'نواقص يوميه'}),['رصيده قليل في نواقص يوميه والسيستم ما دخلهوش: محتاج نبص','red']);
assert.deepEqual(R('missed'),['رصيده قليل والسيستم ما دخلهوش: محتاج نبص','red'],'no bag name = still readable');
assert.deepEqual(R('other_bag',{bag:'مالك'}),['في حقيبة تانية (مالك)','gray']);assert.deepEqual(R('other_bag'),['في حقيبة تانية','gray']);
assert.equal(R('no_bag')[0],'مش في أي حقيبة');assert.equal(R('not_short')[0],'مش ظاهر ناقص عند السيستم وقتها');
assert.deepEqual(R('carried',{days:3}),['سطر قديم من 3 يوم ولسه مفتوح','gray']);assert.equal(R('carried',{days:0})[0],'سطر قديم من 1 يوم ولسه مفتوح','at least one day');
assert.deepEqual(R('new'),['','gray'],'a new line has no reason, only its status');
assert.deepEqual(C.reason({why:'new_code_later',txt:'نص من اللاب'}),['نص من اللاب','gray'],'a code this page does not know shows the laptop\'s own text');
assert.deepEqual(C.reason(null),['','gray']);assert.equal(C.reasonText({why:'dup'}),'ممكن نفس الصنف: مستني قرارك');
// the second chip: what arrived, or for a bot line that did not arrive: waiting (inside the 30 h) / probably not ordered (after)
const A=(r,final)=>C.arrival(r,final);
assert.deepEqual(A({why:'had_stock',arr:{vendor:'الفتح',code:'1',h:14.9}}),['وصل من الفتح بعد 15 ساعة','ok']);
assert.deepEqual(A({qty:2,arr:{vendor:'',h:0.2}}),['وصل بعد 1 ساعة','ok'],'no vendor name, under an hour = 1');
assert.deepEqual(A({why:'new'},false),['لسه ما وصلش: بنستنى الفواتير','gray']);
assert.deepEqual(A({why:'carried',days:2},false),['لسه ما وصلش: بنستنى الفواتير','gray']);
assert.deepEqual(A({why:'new'},true),['ما وصلش لحد دلوقتي: غالبًا ما اتطلبش','warn']);
assert.equal(A({why:'had_stock'},true),null,'an arrived-only line that has no arrival data shows nothing');assert.equal(A(null,true),null);
// the QUANTITY: the bot's quantity against the packs on the invoice; it counts the bot's lines that arrived (no `why`)
const Q=(r)=>C.qtyChip(r);
assert.deepEqual(Q({qty:3,arr:{q:3}}),['وصل 3: نفس كمية السيستم','ok'],'same quantity');
assert.deepEqual(Q({qty:2,arr:{q:3}}),['السيستم 2 ووصل 3','warn'],'a different quantity');
assert.deepEqual(Q({qty:2,arr:{q:2.4}}),['وصل 2.4: نفس كمية السيستم','ok'],'rounded to whole packs');
assert.deepEqual(Q({qty:2,arr:{q:1.5}}),['وصل 1.5: نفس كمية السيستم','ok']);
assert.equal(Q({qty:2,arr:{q:3.6}})[0],'السيستم 2 ووصل 3.6');
assert.equal(Q({why:'had_stock',arr:{q:1}}),null,'an arrived-only item has no bot quantity');
assert.equal(Q({qty:2}),null,'nothing arrived');assert.equal(Q({qty:2,arr:{vendor:'X',h:3}}),null,'an older file without the quantity');assert.equal(Q(null),null);
// one night
const night=(key,both,ao,bo,extra={})=>({v:2,night:key,at:key+' 00:45',comparable:true,late:false,final:false,window_end:'2026-11-17 06:45',manual:0,
 both_items:Array.from({length:both},(_,k)=>({id:k+1,name:'B'+k,qty:1,bag:'2428',arr:{vendor:'AMG',code:'1',h:14,q:1}})),
 arrived_only_items:Array.from({length:ao},(_,k)=>({id:100+k,name:'A'+k,why:'had_stock',have:3,cover:9,arr:{vendor:'الفتح',code:'2',h:16,q:2}})),
 bot_only_items:Array.from({length:bo},(_,k)=>({id:200+k,name:'T'+k,qty:2,bag:'2428',why:k===0?'new':'carried',days:3})),...extra});
assert.equal(C.parseCompare(null),null);assert.equal(C.parseCompare({}),null);assert.equal(C.parseCompare({nights:'x'}),null);
const empty=C.parseCompare({generated_at:'2026-11-16T00:00:00Z',nights:[],week:{nights:0}});
assert.deepEqual(empty.nights,[]);assert.equal(empty.week.nights,0);assert.equal(empty.week.cover,null,'no nights = no rate');assert.equal(empty.generatedAt,'2026-11-16T00:00:00Z');
const n0=C.normNight(night('2026-11-16',55,15,9,{manual:4,final:true}));
assert.equal(n0.both,55);assert.equal(n0.arrivedOnly,15);assert.equal(n0.botOnly,9);assert.equal(n0.arrived,70,'what he bought = in both + arrived only');assert.equal(n0.bot,64,'the bot\'s order = in both + bot only');
assert.equal(n0.cover,79,'55 of the 70 that arrived');assert.equal(n0.prec,86,'55 of the bot\'s 64 lines arrived');assert.equal(n0.manual,4);assert.equal(n0.final,true);assert.equal(n0.until,'2026-11-17 06:45');
assert.equal(n0.qtyN,55,'every line in both that has the invoice packs');assert.equal(n0.qtySame,55);
// the quantity count: some the same, some different, one without packs
const nq=C.normNight({...night('2026-11-16',3,0,0),both_items:[{id:1,name:'X1',qty:3,arr:{q:3}},{id:2,name:'X2',qty:2,arr:{q:3}},{id:3,name:'X3',qty:1,arr:{vendor:'A',h:2}}]});
assert.equal(nq.qtyN,2,'the third has no packs');assert.equal(nq.qtySame,1);
assert.equal(C.normNight({...night('2026-11-13',1,1,1),comparable:false}),null,'a night that could not be compared is dropped');assert.equal(C.normNight({night:'bad'}),null);assert.equal(C.normNight(null),null);
// the file: newest first, at most 7, broken rows dropped
const f=C.parseCompare({generated_at:'x',nights:[night('2026-11-14',50,10,5),night('2026-11-16',55,15,9),{...night('2026-11-13',1,1,1),comparable:false},null,{night:'bad'},night('2026-11-15',60,5,2)]});
assert.deepEqual(f.nights.map(n=>n.night),['2026-11-16','2026-11-15','2026-11-14']);
// the week = all the nights together, not an average of percentages
assert.equal(f.week.nights,3);assert.equal(f.week.cover,C.pctOf(55+60+50,70+65+60),'165 of 195');assert.equal(f.week.prec,C.pctOf(165,64+62+55),'165 of the bot\'s 181 lines');
assert.equal(C.weekOf([]).cover,null);assert.equal(C.weekOf(null).nights,0);
const many=C.parseCompare({nights:Array.from({length:10},(_,k)=>night('2026-11-'+String(20-k).padStart(2,'0'),5,1,1))});
assert.equal(many.nights.length,7);assert.equal(many.nights[0].night,'2026-11-20');assert.equal(many.nights[6].night,'2026-11-14');
// the little chart: 7 slots, oldest first, the free ones at the end
const s=C.slots(f.nights);assert.equal(s.length,7);assert.deepEqual(s.map(x=>x&&x.night),['2026-11-14','2026-11-15','2026-11-16',null,null,null,null]);
assert.equal(C.slots([]).filter(Boolean).length,0);
// is the file old (the laptop stopped updating)
const now=new Date('2026-11-16T12:00:00Z');
assert.equal(C.isOld('2026-11-16T09:00:00Z',now),false);assert.equal(C.isOld('2026-11-14T09:00:00Z',now),true);assert.equal(C.isOld('bad',now),true);assert.equal(C.isOld('',now),true);
// the MONEY: what he bought in 24 hours (at cost) against the night's cap; the split = the bot's order / items not in it / packs beyond its quantity
const mon=(x,final=true)=>C.normNight({...night('2026-11-16',2,1,0,{final}),...x});
const base={buy_value:20000,both_value:12000,extra_items_value:8000,extra_qty_value:1500,misc_value:400,cap_money:17680};
assert.equal(mon({}).money,null,'an older file without money shows none');assert.equal(C.capLine(mon({})),null);assert.equal(C.buyLine(null),'');assert.equal(C.miscLine(null),'');
const over=mon(base);
assert.deepEqual(over.money,{buy:20000,cap:17680,bot:10500,extraItems:8000,extraQty:1500,misc:400},'the bot\'s part = what arrived of its items minus the packs beyond its quantity; the three add up to what he bought');
assert.equal(over.money.bot+over.money.extraItems+over.money.extraQty,over.money.buy);
assert.deepEqual(C.capLine(over),['عدّيت سقف السيستم بـ 2,320 ج (13%)','over']);
assert.equal(C.buyLine(over.money),'اشتريت 20,000 ج بسعر التكلفة، والسقف 17,680 ج.');
assert.equal(C.splitLine(over.money),'منها 10,500 ج من أمر السيستم، و8,000 ج أصناف مش في أمره، و1,500 ج كميات أكتر من أمره.');
assert.equal(C.miscLine(over.money),'وغير كده 400 ج أصناف متنوعة: مش محسوبة.');assert.equal(C.miscLine(mon({...base,misc_value:0}).money),'','no «أصناف متنوعة» = no line');
assert.deepEqual(C.capLine(mon({...base,buy_value:15000,both_value:9000,extra_items_value:6000})),['كنت تحت سقف السيستم بـ 2,680 ج (15%)','under']);
assert.deepEqual(C.capLine(mon({...base,buy_value:17680})),['اشتريت على سقف السيستم بالظبط','under']);
assert.deepEqual(C.capLine(mon({...base,buy_value:15000},false)),['لحد دلوقتي اشتريت 15,000 ج من سقف 17,680 ج','wait'],'a night still waiting for its invoices only says how far he is');
const nocap=mon({...base,cap_money:null});assert.equal(nocap.money.cap,null);assert.equal(C.capLine(nocap),null,'no cap for that night = no headline');assert.equal(C.buyLine(nocap.money),'اشتريت 20,000 ج بسعر التكلفة.');
assert.equal(mon({...base,cap_money:0}).money.cap,null,'a zero cap is no cap');
assert.equal(mon({...base,extra_qty_value:99999}).money.extraQty,12000,'the extra packs can not be more than what arrived of the bot\'s items');
assert.equal(C.money(1234567.4),'1,234,567');assert.equal(C.money('x'),'0');
// the week's money: only the complete nights that have a cap; the nights together
const w1=C.weekMoney([over,mon({...base,buy_value:15000,both_value:9000,extra_items_value:6000}),mon(base,false),mon({...base,cap_money:null}),mon({})]);
assert.deepEqual(w1,{nights:2,buy:35000,cap:35360,over:-360},'the night still waiting, the night without a cap and the old night are left out');
assert.equal(C.weekMoney([mon({})]),null);assert.equal(C.weekMoney(null),null);assert.equal(C.weekMoney([mon(base,false)]),null);
assert.equal(C.weekMoneyLine(w1),'الأسبوع: اشتريت 35,000 ج من سقف 35,360 ج (الليالي الكاملة: 2)، وكنت تحته بـ 360 ج (1%).');
assert.equal(C.weekMoneyLine({nights:3,buy:60000,cap:53040,over:6960}),'الأسبوع: اشتريت 60,000 ج من سقف 53,040 ج (الليالي الكاملة: 3)، وعدّيته بـ 6,960 ج (13%).');
assert.equal(C.weekMoneyLine({nights:1,buy:100,cap:100,over:0}),'الأسبوع: اشتريت 100 ج من سقف 100 ج (الليالي الكاملة: 1): على السقف بالظبط.');assert.equal(C.weekMoneyLine(null),'');
console.log('PASS: order-compare helpers (v2)');
