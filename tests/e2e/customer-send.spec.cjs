// Sending a customer's statement on WhatsApp (owner 2026-11-12: the number picked from the phone's contacts and kept on the
// customer; the statement from the payment he chooses, detailed with the items, as a PDF; «يتبعت مباشر» = WhatsApp opens on
// that customer's chat with the message and the PDF's link). Made-up customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const at=(d,h,m)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`;
const today=new Date(),old=new Date(Date.now()-40*864e5),older=new Date(Date.now()-70*864e5);
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:7174.5,last_at:at(today,11,0),last_kind:'sale',moves:5}];
const MOVES=[
 {id:-9,customer_id:101,at:at(older,10,0),kind:'payment',total:0,paid:1000,balance:5800,items:null},
 {id:-7,customer_id:101,at:at(old,13,7),kind:'payment',total:0,paid:500,balance:6800,items:[{n:'أصناف متنوعة',p:1,u:0,k:1,s:0,d:0}]},
 {id:11,customer_id:101,at:at(today,9,0),kind:'sale',total:166.7,paid:0,balance:6966.7,items:[{n:'PANADOL EXTRA 24 TAB',p:1,u:0,k:1,s:66.7,d:0},{n:'VITACID C 1000',p:0,u:2,k:2,s:100,d:0}]},
 {id:12,customer_id:101,at:at(today,10,0),kind:'return',total:-54,paid:0,balance:6912.7,items:[{n:'OMEZ 40 20 CAP',p:0,u:1,k:2,s:108,d:0}]},
 {id:13,customer_id:101,at:at(today,11,0),kind:'sale',total:261.8,paid:0,balance:7174.5,items:[{n:'لزق جروح طويل',p:5,u:0,k:1,s:0.5,d:0},{n:'B',p:1,u:0,k:1,s:290.3,d:0}]},
];
const setData=(page,phones=[])=>page.evaluate(([c,m,p])=>{window.__tables.ar_customers=c;window.__tables.ar_customer_moves=m;window.__tables.ar_customer_phones=p;window.__opened=[];window.open=(u)=>{window.__opened.push(u);return null}},[CUSTOMERS,MOVES,phones]);
const openStatement=async(page)=>{await page.click('[data-group="accounts"]');await page.waitForSelector('#cuBox:not(.hidden)');await page.click('#cuChips [data-cu-view="all"]');await page.click('#cuRows [data-cu="101"]');await page.waitForSelector('#cuSt:not(.hidden) .cu-mv')};
run('Statement on WhatsApp: the number (typed, or from the phone\'s contacts) is kept on the customer',async({page,table})=>{
 await setData(page);
 await openStatement(page);
 assert.equal(await text(page,'#cuSt .cu-phone'),'📱 مالوش رقم واتس');
 assert.equal(await page.$('[data-cu-pick]'),null,'no contacts list on this browser: typing only');
 assert.equal(await page.$('[data-cu-send]'),null,'nothing to send to yet');
 // a wrong number is refused; a right one is kept with the country code
 await page.fill('#cuPhoneIn','0101');await page.click('[data-cu-phone-save]');
 assert.match(await text(page,'#cuSt'),/الرقم ده مش مظبوط/);
 await page.fill('#cuPhoneIn','01012345678');await page.click('[data-cu-phone-save]');
 await page.waitForSelector('[data-cu-send]');
 assert.match(await text(page,'#cuSt .cu-phone'),/📱 واتس: 0101 234 5678/);
 assert.deepEqual((await table('ar_customer_phones')).map(r=>[r.customer_id,r.phone,r.contact_name]),[[101,'201012345678',null]]);
 // from the phone's contacts: a contact with two numbers asks which one (the same number written twice counts once)
 await page.evaluate(()=>{window.ContactsManager=function(){};Object.defineProperty(navigator,'contacts',{value:{select:async()=>[{name:['جار الصيدلية'],tel:['+20 101 111 2222','0101 111 2222','0222334455']}]},configurable:true})});
 await page.click('[data-cu-phone-edit]');
 await page.click('[data-cu-pick]');
 await page.waitForSelector('[data-cu-tel]');
 assert.deepEqual(await page.$$eval('[data-cu-tel]',b=>b.map(x=>x.textContent)),['0101 111 2222','+20222334455','ضيفهم كلهم']);
 await page.click('[data-cu-tel="0"]');
 // several numbers a customer (owner: «رقم و2 و3»): the new one is added next to the first
 await page.waitForFunction(()=>document.querySelectorAll('#cuSt .cu-phone [data-cu-phone-del]').length===2);
 const rowsText=()=>page.$$eval('#cuSt .cu-phone',r=>r.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 assert.deepEqual(await rowsText(),['📱 واتس: 0101 234 5678شيله','📱 واتس: 0101 111 2222جار الصيدلية في الموبايلشيله']);
 assert.deepEqual((await table('ar_customer_phones')).map(r=>[r.customer_id,r.phone,r.contact_name]),[[101,'201012345678',null],[101,'201011112222','جار الصيدلية']]);
 // «ضيفهم كلهم»: both numbers of the contact (one already there only gets updated)
 await page.click('[data-cu-phone-edit]');await page.click('[data-cu-pick]');await page.waitForSelector('[data-cu-tel="all"]');
 await page.click('[data-cu-tel="all"]');
 await page.waitForFunction(()=>/اتحفظ 2 رقم/.test(document.getElementById('cuSt').textContent));
 assert.deepEqual((await table('ar_customer_phones')).map(r=>r.phone),['201012345678','201011112222','20222334455']);
 // remove one (asks first)
 page.once('dialog',d=>{assert.match(d.message(),/تشيل الرقم ده من العميل؟ \+20222334455/);d.accept()});
 await page.click('[data-cu-phone-del="20222334455"]');
 await page.waitForFunction(()=>/اتشال الرقم/.test(document.getElementById('cuSt').textContent));
 assert.deepEqual((await table('ar_customer_phones')).map(r=>r.phone),['201012345678','201011112222']);
 // at 5 numbers it says to remove one first
 await page.evaluate(()=>{for(const p of ['201000000003','201000000004','201000000005'])window.__tables.ar_customer_phones.push({customer_id:101,phone:p,contact_name:null})});
 await page.click('[data-cu-back]');await page.waitForSelector('#cuListView:not(.hidden)');await page.evaluate(()=>window.AskerCustomers.load(true));
 await page.click('#cuRows [data-cu="101"]');await page.waitForSelector('#cuSt:not(.hidden) .cu-mv');
 assert.equal(await page.$('[data-cu-phone-edit]'),null,'no «ضيف رقم تاني» at 5');
 await page.evaluate(()=>{window.__tables.ar_customer_phones.splice(2)});await page.click('[data-cu-back]');await page.waitForSelector('#cuListView:not(.hidden)');
 await page.evaluate(()=>window.AskerCustomers.load(true));
 // the list shows who has a number
 assert.match(await text(page,'#cuRows [data-cu="101"] strong'),/📱/);
});
run('Statement on WhatsApp: from the payment he picks, a detailed PDF, WhatsApp opens on the customer\'s chat',async({page,table})=>{
 await setData(page,[{customer_id:101,phone:'201012345678',contact_name:'جار الصيدلية',last_sent_at:null,last_sent_from:null,updated_at:'2026-11-12T10:00:00Z'},
  {customer_id:101,phone:'201099998888',contact_name:'ابنه',last_sent_at:'2026-11-10T10:00:00Z',last_sent_from:null,updated_at:'2026-11-12T11:00:00Z'}]);
 await openStatement(page);
 await page.click('[data-cu-send]');
 await page.waitForSelector('.cu-sendbox [data-cu-from]');
 // two numbers: «ابعت على» chooses, the last one a statement went to first
 assert.deepEqual(await page.$$eval('.cu-sendbox [data-cu-to]',b=>b.map(x=>(x.classList.contains('on')?'* ':'')+x.textContent)),['0101 234 5678','* 0109 999 8888']);
 await page.click('.cu-sendbox [data-cu-to="201012345678"]');
 await page.waitForFunction(()=>!/بيجيب الحركات/.test(document.querySelector('.cu-sendbox')?.textContent||''));
 // the payments, newest first (the last one chosen), then «من أول الشهر ده»
 const opts=await page.$$eval('.cu-sendbox .cu-opt',b=>b.map(x=>(x.classList.contains('on')?'* ':'')+x.querySelector('span').firstChild.textContent));
 assert.deepEqual(opts,['* آخر دفعة: 500 ج','الدفعة اللي قبلها: 1,000 ج','من أول الشهر ده']);
 assert.match(await text(page,'.cu-sendbox [data-cu-from="-7"] small'),/بعدها 2 فاتورة و1 مرتجع/);
 // make it: a PDF in the private bucket, a link, the message
 await page.click('[data-cu-make]');
 await page.waitForSelector('#cuMsg',{timeout:20000});
 assert.match(await text(page,'.cu-sendbox'),/الكشف جاهز: 1 صفحة/);
 const files=await page.evaluate(()=>Object.keys(window.__storage).filter(k=>k.startsWith('s/')));
 assert.equal(files.length,1);assert.match(files[0],/^s\/\d{4}-\d{2}\/[0-9a-f-]{20,40}\.pdf$/);
 assert.ok((await page.evaluate(k=>window.__storage[k],files[0])).startsWith('%PDF-1.4'),'a PDF file');
 const msg=await page.inputValue('#cuMsg');
 assert.match(msg,/^أهلًا بحضرتك 🌿\nده كشف حساب أحمد محمود من صيدلية عسكر، من \d\d\/\d\d\/\d{4} لحد النهارده\.\nالرصيد دلوقتي: عليك 7,174.50 ج\n\nالكشف بالتفصيل بالأصناف \(PDF\):\n/);
 assert.ok(msg.endsWith(encodeURIComponent(files[0])),'the link to that file');
 // he can change the message; WhatsApp opens on the customer's chat with it
 await page.fill('#cuMsg',msg.replace('أهلًا بحضرتك','أهلًا يا حاج'));
 await page.click('[data-cu-wa]');
 const opened=await page.evaluate(()=>window.__opened);
 assert.equal(opened.length,1);assert.ok(opened[0].startsWith('https://wa.me/201012345678?text='));
 assert.match(decodeURIComponent(opened[0].split('?text=')[1]),/^أهلًا يا حاج 🌿\nده كشف حساب أحمد محمود/);
 assert.match(await text(page,'.cu-sendbox'),/اتفتحت محادثته في الواتس: دوس إرسال هناك/);
 await page.waitForFunction(()=>window.__tables.ar_customer_phones[0].last_sent_at);
 const row=(await table('ar_customer_phones'))[0];
 assert.equal(row.last_sent_from,MOVES[1].at,'remembered: sent from that payment');
 // another start: «من أول الشهر ده» makes a new one
 await page.click('[data-cu-from="11"]');
 assert.equal(await page.$('#cuMsg'),null,'a new start needs a new statement');
 await page.click('[data-cu-make]');await page.waitForSelector('#cuMsg',{timeout:20000});
 assert.match(await page.inputValue('#cuMsg'),new RegExp('من '+[pad(today.getDate()),pad(today.getMonth()+1),today.getFullYear()].join('/')));
 // «لغي» closes the box
 await page.click('[data-cu-send-close]');
 assert.equal(await page.$('.cu-sendbox'),null);
});
run('Statement on WhatsApp: every outcome of the contacts list says something; paste; reopened while picking',async({page,table})=>{
 await setData(page);
 const contacts=(answer)=>page.evaluate((a)=>{window.ContactsManager=function(){};Object.defineProperty(navigator,'contacts',{value:{select:async()=>{if(a==='throw')throw new Error('no');return a}},configurable:true})},answer);
 await openStatement(page);
 // nothing came back (the owner tapped «تم» without a ticked name): it says so
 await contacts([]);await page.click('[data-cu-phone-save]');await page.evaluate(()=>window.AskerCustomers.statement('101'));await page.waitForSelector('[data-cu-pick]');
 await page.click('[data-cu-pick]');
 await page.waitForFunction(()=>/ماوصلش أي اسم من القايمة/.test(document.getElementById('cuSt').textContent));
 // a name without its number (the «أرقام التليفون» switch off in the list)
 await contacts([{name:['جار الصيدلية'],tel:[]}]);await page.click('[data-cu-pick]');
 await page.waitForFunction(()=>/الاسم وصل من غير رقم/.test(document.getElementById('cuSt').textContent));
 // a number that is not one
 await contacts([{name:['X'],tel:['123']}]);await page.click('[data-cu-pick]');
 await page.waitForFunction(()=>/الرقم اللي وصل \(123\) مش رقم ينفع للواتس/.test(document.getElementById('cuSt').textContent));
 // the list could not open
 await contacts('throw');await page.click('[data-cu-pick]');
 await page.waitForFunction(()=>/مقدرتش أفتح أسامي الموبايل/.test(document.getElementById('cuSt').textContent));
 assert.deepEqual(await table('ar_customer_phones'),[],'nothing saved by a failed pick');
 // paste: something that is not a number, then the number copied on the phone
 await page.evaluate(()=>{window.__clip='مش رقم';Object.defineProperty(navigator,'clipboard',{value:{readText:async()=>window.__clip},configurable:true})});
 await page.click('[data-cu-paste]');
 await page.waitForFunction(()=>/اللي متنسخ مش رقم تليفون/.test(document.getElementById('cuSt').textContent));
 await page.evaluate(()=>{window.__clip='+20 101 234 5678'});
 await page.click('[data-cu-paste]');
 await page.waitForFunction(()=>/0101 234 5678/.test(document.querySelector('#cuSt .cu-phone')?.textContent||''));
 assert.deepEqual((await table('ar_customer_phones')).map(r=>[r.customer_id,r.phone]),[[101,'201012345678']]);
 // the phone closed and reopened the bot while the contacts list was open: back on that customer, saying so
 await page.evaluate(()=>{window.__tables.ar_customer_phones=[];localStorage.setItem('asker-cu-pick',JSON.stringify({id:101,at:Date.now()}))});
 await page.evaluate(([c,m])=>localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:m,ar_customer_phones:[]})),[CUSTOMERS,MOVES]);
 await page.reload();
 await page.waitForFunction(()=>/البوت اتقفل واتفتح تاني وانت في أسامي الموبايل/.test(document.getElementById('cuSt')?.textContent||''),null,{timeout:15000});
 assert.equal(await text(page,'#cuSt .cu-name strong'),'أحمد محمود');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker-cu-pick')),null,'said once');
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
});
run('Statement on WhatsApp: no numbers table on the server yet = nothing shown',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('__fakeFail','ar_customer_phones'));
 await page.reload();await page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
 await setData(page);
 await openStatement(page);
 assert.equal(await page.$('#cuSt .cu-phone'),null);assert.equal(await page.$('[data-cu-send]'),null);
 await page.evaluate(()=>localStorage.removeItem('__fakeFail'));
});
