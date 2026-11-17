// «محتاج قرارك قبل أمر الشرا» (ar/po-statement.js): reading the laptop's file, the chips under an item, and the two rows his taps write.
const assert=require('node:assert/strict');
const S=require('../ar/po-statement.js');
assert.equal(S.PATH,'orders/statement.json','same place Hub\\orders\\UPLOAD_STATEMENT.ps1 uploads to');
// the file: anything that is not what the laptop writes means «nothing to decide»; rows without an id, a name or a known reason are dropped
assert.equal(S.parseStatement(null),null);assert.equal(S.parseStatement({}),null);assert.equal(S.parseStatement({items:'x'}),null);
const f=S.parseStatement({generated_at:'2026-11-16T08:00:00Z',items:[
 {id:101,name:' NEW ONE 30 CAP ',why:'new',bag:'2428',have:0,sold30:3,min:0,need:1.4,qty:2,last_buy:'2026-11-01',age:20},
 {id:102,name:'BY REQUEST ITEM',why:'byreq',bag:'pv',have:0.5,sold30:0,min:0,need:1,qty:1,n:3,last_buy_date:'2026-09-21'},
 {id:0,name:'no id',why:'new'},{id:103,name:'',why:'new'},{id:104,name:'unknown reason',why:'other'},null,'x']});
assert.deepEqual(f.items.map(r=>r.id),[101,102]);assert.equal(f.items[0].name,'NEW ONE 30 CAP','names are trimmed');assert.equal(f.generatedAt,'2026-11-16T08:00:00Z');
assert.equal(f.items[0].qty,2);assert.equal(f.items[1].qty,1);assert.equal(S.parseStatement({items:[{id:5,name:'Z',why:'new',qty:0}]}).items[0].qty,1,'at least one pack');
assert.deepEqual(S.parseStatement({items:[]}).items,[]);
// the chips under an item
const [a,b]=f.items;
assert.deepEqual(S.chips(a),[['جديد: اتعمل من 20 يوم','new'],['رصيده 0','gray'],['بيع الشهر 3','gray'],['الكمية المقترحة 2','gray']]);
assert.deepEqual(S.chips(b),[['بالطلب: آخر 3 مرات اتباع في يومين','req'],['رصيده 0.5','gray'],['الكمية المقترحة 1','gray']],'no sales = no «بيع الشهر» chip');
assert.equal(S.chips({...b,n:0})[0][0],'بالطلب: آخر 2 مرات اتباع في يومين','at least 2');
assert.equal(S.chips({...a,age:-3})[0][0],'جديد: اتعمل من 0 يوم');
// «ضيفه» writes what the bags page «🛒 أمر شراء» writes: an open line with the item's numbers
assert.deepEqual(S.poRow(a),{item_id:101,item_name:'NEW ONE 30 CAP',bag:'2428',qty:2,status:'open',item:{have:0,sold30:3,min:0,need:1.4,last_buy:'2026-11-01'}});
assert.equal(S.poRow({...b,bag:''}).bag,'pv','a bag the table accepts');
assert.match(S.poRow({...a,bag:'2428'}).bag,/^(pv|gs|[0-9]{1,12})$/);
// «مش دلوقتي» = a CANCELLED line that says «no» (the laptop reads it for 7 days); «رجّعه للبيان» rewrites it as undone
assert.deepEqual(S.noRow(b),{item_id:102,item_name:'BY REQUEST ITEM',bag:'pv',qty:1,status:'cancelled',item:{have:0.5,sold30:0,min:0,need:1,last_buy:null,decision:'no'}});
assert.equal(S.noItem(b,'undone').decision,'undone');
assert.equal(S.noRow({...a,name:'x'.repeat(300)}).item_name.length,200);
// what the table already says about the items of a file (owner 2026-11-17: the item came back after a refresh, because the file is rewritten only a minute or two after a tap)
const t0=new Date('2026-11-17T08:20:00Z'),hoursAgo=(h)=>new Date(t0.getTime()-h*3600e3).toISOString();
const row=(id,item_id,status,item,created_at)=>({id,item_id,status,item,created_at,updated_at:created_at});
const kd=S.knownDecisions([
 row(1,101,'open',{},hoursAgo(1)),                                  // his own open line = added
 row(2,102,'cancelled',{decision:'no'},hoursAgo(1)),                // «مش دلوقتي» now = skipped
 row(3,103,'cancelled',{decision:'no'},hoursAgo(24*8)),             // «مش دلوقتي» 8 days ago = asked again
 row(4,104,'cancelled',{decision:'undone'},hoursAgo(1)),            // «رجّعه للبيان» = asked again
 row(5,105,'open',{auto:true},hoursAgo(1)),                         // the laptop's automatic line: the file still asks him (same as the laptop)
 row(6,106,'cancelled',{},hoursAgo(1)),                             // «رجّعه» (plainly cancelled) = asked again
 row(7,107,'open',{},hoursAgo(2)),row(8,107,'cancelled',{decision:'no'},hoursAgo(1)), // both: added wins
 row(9,108,'cancelled',{decision:'no'},hoursAgo(5)),row(10,108,'cancelled',{decision:'no'},hoursAgo(1)), // the newest line of a kind
 row(11,109,'open',null,hoursAgo(3)),                               // a line with no item json = his
 {id:12,item_id:0,status:'open'},null,{id:13,item_id:'x',status:'open'}],t0);
assert.deepEqual([...kd.entries()].sort((x,y)=>x[0]-y[0]),[[101,{kind:'added',rid:1}],[102,{kind:'skipped',rid:2}],[107,{kind:'added',rid:7}],[108,{kind:'skipped',rid:10}],[109,{kind:'added',rid:11}]]);
assert.equal(S.knownDecisions(null,t0).size,0);assert.equal(S.knownDecisions([],t0).size,0);assert.equal(S.NO_DAYS,7,'the same 7 days the laptop uses');
// the one-open-line clash is not a failure
assert.equal(S.isDuplicate({code:'23505',message:'x'}),true);
assert.equal(S.isDuplicate({message:'duplicate key value violates unique constraint "ar_po_items_one_open"'}),true);
assert.equal(S.isDuplicate({message:'permission denied'}),false);assert.equal(S.isDuplicate(null),false);
// is the file old
const now=new Date('2026-11-16T12:00:00Z');
assert.equal(S.isOld('2026-11-16T09:00:00Z',now),false);assert.equal(S.isOld('2026-11-14T09:00:00Z',now),true);assert.equal(S.isOld('bad',now),true);
assert.equal(S.numText(0.456),'0.5');assert.equal(S.numText(12),'12');
console.log('PASS: po-statement helpers');
