// The statement PDF (ar/statement-pdf.js): which payments to start from, the rows from a payment, the message, the file
// name and the PDF file itself. Made-up customers only: the repository is public.
const assert=require('node:assert/strict');
const L=require('../ar/statement-pdf.js');
const M=[
 {id:-7,at:'2026-09-03T10:00:00',kind:'payment',total:0,paid:1000,balance:6000,items:null},
 {id:10,at:'2026-10-01T12:00:00',kind:'sale',total:2272.6,paid:0,balance:8272.6,items:[{n:'A',p:1,u:0,k:1,s:2272.6,d:0}]},
 {id:11,at:'2026-10-01T13:00:00',kind:'payment',total:0,paid:500,balance:7772.6,items:[{n:'أصناف متنوعة',p:1,u:0,k:1,s:0,d:0}]},
 {id:12,at:'2026-11-05T13:07:00',kind:'payment',total:0,paid:8000,balance:-227.4,items:null},
 {id:13,at:'2026-11-05T18:50:00',kind:'sale',total:35,paid:0,balance:-192.4,items:[{n:'OTRIVIN',p:1,u:0,k:1,s:35,d:0}]},
 {id:15,at:'2026-11-11T16:32:00',kind:'sale',total:336.97,paid:0,balance:144.57,items:[{n:'TIRATAM',p:0,u:1,k:3,s:288,d:0},{n:'COLD FREE',p:1,u:0,k:2,s:278,d:0}]},
 {id:14,at:'2026-11-11T16:32:00',kind:'return',total:-54,paid:0,balance:-192.4-54,items:[{n:'OMEZ',p:0,u:1,k:2,s:108,d:0}]},
 {id:16,at:'2026-11-12T10:00:00',kind:'sale',total:191,paid:191,balance:144.57,items:[]},
];
// the payments, newest first, with what came after each (a payment's placeholder line is not an invoice)
assert.deepEqual(L.paymentChoices(M),[
 {id:12,at:'2026-11-05T13:07:00',paid:8000,sales:3,returns:1},
 {id:11,at:'2026-10-01T13:00:00',paid:500,sales:3,returns:1},
 {id:-7,at:'2026-09-03T10:00:00',paid:1000,sales:4,returns:1},
]);
// from the last payment: the balance before it, its rows oldest first (same time: by id), the sums
const s=L.statementFrom(M,12);
assert.equal(s.opening,7772.6,'the balance before the payment');
assert.deepEqual(s.rows.map(r=>r.id),[12,13,14,15,16]);
assert.equal(s.bought,Math.round((35-54+336.97+191)*100)/100);
assert.equal(s.paid,8000+191);
assert.equal(s.closing,144.57);assert.equal(s.from,'2026-11-05T13:07:00');assert.equal(s.to,'2026-11-12T10:00:00');
assert.equal(L.statementFrom(M,999),null);
// from the payment before: starts with that payment
assert.equal(L.statementFrom(M,11).opening,8272.6);
// «من أول الشهر ده»
assert.equal(L.monthStartId(M,new Date(2026,10,12)),12);
assert.equal(L.monthStartId(M,new Date(2026,11,1)),null);
// the customer's discount: items' value minus what was charged (288/3 + 278 = 374 − 336.97)
assert.equal(L.discountOf(M[5]),37.03);assert.equal(L.discountOf(M[2]),0,'a payment has no items');
// the message (to the customer: «عليك», «ليك عندنا», «خالص»)
assert.equal(L.balanceWords(7174.5),'عليك 7,174.50 ج');assert.equal(L.balanceWords(-227.4),'ليك عندنا 227.40 ج');assert.equal(L.balanceWords(0.2),'الحساب خالص');
assert.equal(L.messageText({name:'عميل تجربة',from:'2026-11-05T13:07:00',balance:7174.5,link:'https://x/s.pdf'}),
 'أهلًا بحضرتك 🌿\nده كشف حساب عميل تجربة من صيدلية عسكر، من 05/11/2026 لحد النهارده.\nالرصيد دلوقتي: عليك 7,174.50 ج\n\nالكشف بالتفصيل بالأصناف (PDF):\nhttps://x/s.pdf');
// the file's place matches the bucket's rule
const key=L.fileKey(new Date(2026,10,12),'0f8c2a4e-1b2c-4d5e-8f90-a1b2c3d4e5f6');
assert.equal(key,'s/2026-11/0f8c2a4e-1b2c-4d5e-8f90-a1b2c3d4e5f6.pdf');
assert.match(key,/^s\/[0-9]{4}-[0-9]{2}\/[0-9a-f-]{20,40}\.pdf$/);
// the PDF: two pages, every object where the table of contents says, the pictures inside as they were given
const jpeg=(n)=>Uint8Array.from({length:n},(_,i)=>i%256);
const pdf=L.buildPdf([{jpeg:jpeg(300),w:1240,h:1754},{jpeg:jpeg(500),w:1240,h:1754}]);
const txt=Buffer.from(pdf).toString('latin1');
assert.ok(txt.startsWith('%PDF-1.4\n'));assert.ok(txt.endsWith('%%EOF\n'));
assert.match(txt,/\/Type \/Pages \/Kids \[3 0 R 6 0 R\] \/Count 2/);
assert.equal((txt.match(/\/Subtype \/Image/g)||[]).length,2);
assert.match(txt,/\/Width 1240 \/Height 1754 .* \/Filter \/DCTDecode \/Length 500/);
const xref=+/startxref\n(\d+)\n%%EOF/.exec(txt)[1];
assert.ok(txt.slice(xref).startsWith('xref\n0 9\n'));
const offs=txt.slice(xref).split('\n').slice(3,11).map(l=>+l.slice(0,10));
offs.forEach((o,k)=>assert.ok(txt.slice(o).startsWith(`${k+1} 0 obj`),`object ${k+1} at its offset`));
txt.slice(xref).split('\n').slice(2,11).forEach(l=>assert.equal(l.length+1,20,'xref lines are 20 bytes'));
const at=txt.indexOf('/Length 300 >>\nstream\n')+'/Length 300 >>\nstream\n'.length;
assert.deepEqual([...pdf.slice(at,at+300)],[...jpeg(300)]);
// the items' pictures (2026-11-16): a page may carry link rectangles (in its own pixels); each becomes a link annotation numbered after the pages' objects
const url='https://example.invalid/store.html#item=77';
const pdfL=L.buildPdf([{jpeg:jpeg(300),w:1240,h:1754,links:[{x:620,y:877,w:124,h:175,url},{x:100,y:100,w:50,h:60,url:'https://example.invalid/a(b)\\c\u0627'}]},{jpeg:jpeg(500),w:1240,h:1754}]);
const tl=Buffer.from(pdfL).toString('latin1');
assert.match(tl,/\/Type \/Page \/Parent 2 0 R .* \/Annots \[9 0 R 10 0 R\] >>/,'the first page lists its two annotations');
assert.equal((tl.match(/\/Annots/g)||[]).length,1,'the second page has none');
assert.equal((tl.match(/\/Subtype \/Link/g)||[]).length,2);
assert.ok(tl.includes('/A << /S /URI /URI (https://example.invalid/store.html#item=77) >>'));
assert.ok(tl.includes('(https://example.invalid/a\\(b\\)\\\\c)'),'parentheses and a backslash are escaped, a non-ASCII letter is dropped');
const rect=/\/Rect \[([0-9.]+) ([0-9.]+) ([0-9.]+) ([0-9.]+)\]/.exec(tl).slice(1).map(Number);
const near=(a,b)=>Math.abs(a-b)<0.02;
assert.ok(near(rect[0],620*595.28/1240)&&near(rect[2],(620+124)*595.28/1240),'left and right in points');
assert.ok(near(rect[1],841.89-(877+175)*841.89/1754)&&near(rect[3],841.89-877*841.89/1754),'bottom and top in points (the y axis goes up)');
const xr2=+/startxref\n(\d+)\n%%EOF/.exec(tl)[1];
assert.ok(tl.slice(xr2).startsWith('xref\n0 11\n'),'10 objects: 2 + 3 per page + 2 annotations');
tl.slice(xr2).split('\n').slice(3,12).map(l=>+l.slice(0,10)).forEach((o,k)=>assert.ok(tl.slice(o).startsWith(`${k+1} 0 obj`),`object ${k+1} (links too) at its offset`));
// a page with no links is exactly as before
assert.equal(Buffer.from(L.buildPdf([{jpeg:jpeg(300),w:1240,h:1754,links:[]},{jpeg:jpeg(500),w:1240,h:1754}])).toString('latin1'),txt,'no links = the same file');
// the message says so only when the pictures are in
const base={name:'عميل تجربة',from:'2026-11-05T13:07:00',balance:7174.5,link:'https://x/s.pdf'};
assert.equal(L.messageText({...base,photos:false}),L.messageText(base),'no pictures = the message as before');
assert.ok(L.messageText({...base,photos:true}).endsWith('\n\nوفي الكشف صور الأصناف، ولو دوست على أي صنف هتفتح لك صفحته في الستور.'));
console.log('statement-pdf ok');
