// «👨‍👩‍👧 أهل البيت» on the customer's account (owner 2026-11-18: «عميل الأجل يقدر يبعت الأبلكيشن لأهل بيته، ويقدر يتحكم فيه، يعني يخلي الحساب الإجمالي يظهر لهم أو يحذفه … هم توابع ليه»).
// The owner of the account adds the people of his house from his own page, sends each one his link, and decides two things per person: the total, and whether his orders go on the account.
// A person of the house opens his own link: the same app, but the server sends no total when the owner keeps it, and the owner's own controls are not there for him.
// The server's answers are faked (state kept in localStorage so a reload keeps it); made-up customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const openMore=(page)=>page.evaluate(()=>{const d=document.querySelector('#acctBox .ac-more');if(d&&!d.open)d.open=true}); // «المزيد» (owner 2026-11-23: four big buttons, the rest folded)
const pad=n=>String(n).padStart(2,'0');
const day=(n)=>{const d=new Date(Date.now()-n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const TOK='c'.repeat(64);
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:1240,last_at:`${day(0)}T11:00:00`,last_kind:'sale',moves:2}];
const MOVES=[
 {id:13,customer_id:101,at:`${day(0)}T11:00:00`,kind:'sale',total:207.8,paid:0,balance:1240,items:[{n:'OMEZ 40 20 CAP',p:1,u:0,k:1,s:207.8,d:0}]},
 {id:12,customer_id:101,at:`${day(1)}T10:00:00`,kind:'payment',total:0,paid:500,balance:1032.2,items:null},
];
// the server's side, faked: members are kept in localStorage (__fam); a member's link is 'mm…' + the id (64 hex); noFamily = the function is not on the server yet
const setup=(page,{noFamily=false,members=[],lang}={})=>page.addInitScript(([moves,tok,noFamily,members,lang])=>{
 try{if(lang)localStorage.setItem('asker-lang',lang);if(!localStorage.getItem('__famSet')){localStorage.setItem('__fam',JSON.stringify({members,seq:members.length}));localStorage.setItem('__famSet','1')}}catch(e){}
 const S=()=>JSON.parse(localStorage.getItem('__fam')||'{"members":[],"seq":0}'),W=(s)=>localStorage.setItem('__fam',JSON.stringify(s));
 const owner=(a)=>a.p_token===tok;
 const mem=(a)=>S().members.find((x)=>x.token===a.p_token);
 const gate=(a,fn)=>{if(mem(a))return {ok:false,error:'not_owner'};if(!owner(a))return {ok:false,error:'link'};return fn(S())};
 window.__fakeRpcs={
  ar_store_pay_info:()=>null,
  ar_customer_regular_view:()=>({ok:true,rows:[],at:new Date().toISOString()}),
  ar_customer_alarms_view:()=>({ok:false,error:'link'}),
  ar_customer_view:(a)=>{const m=mem(a);if(!owner(a)&&!m)return {ok:false,error:'link'};const show=owner(a)||m.show_balance;
   return {ok:true,customer:{id:101,name:'أحمد محمود',balance:show?1240:null},stopped:false,me:owner(a)?{role:'owner'}:{role:'member',id:m.id,name:m.name,show_balance:m.show_balance,on_account:m.on_account},
    month:a.p_before_at||!show?null:{bought:207.8,paid:500},data_at:new Date().toISOString(),phone:owner(a)?'01001112223':null,
    moves:moves.filter((x)=>show||x.kind==='sale'||x.kind==='return').map((x)=>show?x:{...x,paid:null,balance:null}),more:false}},
  ar_members_list:(a)=>noFamily?null:gate(a,(s)=>({ok:true,max:10,members:s.members})),
  ar_member_add:(a)=>gate(a,(s)=>{const name=String(a.p_name||'').trim();if(!name)return {ok:false,error:'bad_name'};if(s.members.length>=10)return {ok:false,error:'max'};
   s.seq+=1;const m={id:s.seq,name,token:String(s.seq).padStart(2,'0')+'a'.repeat(62),show_balance:!!a.p_show_balance,on_account:a.p_on_account!==false,created_at:new Date().toISOString(),last_seen_at:null,seen_count:0};s.members.push(m);W(s);return {ok:true,id:m.id,token:m.token,name}}),
  ar_member_update:(a)=>gate(a,(s)=>{const m=s.members.find((x)=>x.id===a.p_id);if(!m)return {ok:false,error:'no_member'};if(a.p_name!=null)m.name=a.p_name;if(a.p_show_balance!=null)m.show_balance=a.p_show_balance;if(a.p_on_account!=null)m.on_account=a.p_on_account;W(s);return {ok:true}}),
  ar_member_remove:(a)=>gate(a,(s)=>{const i=s.members.findIndex((x)=>x.id===a.p_id);if(i<0)return {ok:false,error:'no_member'};s.members.splice(i,1);W(s);return {ok:true}}),
 };
},[MOVES,TOK,noFamily,members,lang||'']);
const fam=(page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('__fam')));
const seedTables=(page)=>page.evaluate(([c,m,t])=>localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:m,ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[],ar_store_orders:[],ar_chats:[],ar_chat_messages:[],ar_chat_push:[]})),[CUSTOMERS,MOVES,TOK]);
const openAs=async(page,base,token,sel)=>{await page.setViewportSize({width:375,height:812});await seedTables(page);await page.goto(base+'store.html#me='+token);await page.waitForSelector(sel||'[data-view="account"]:not([hidden]) .ac-bal',{state:'attached'});};
const MT=(n)=>String(n).padStart(2,'0')+'a'.repeat(62);
const member=(id,name,o={})=>({id,name,token:MT(id),show_balance:false,on_account:true,created_at:new Date().toISOString(),last_seen_at:null,seen_count:0,...o});

run('Household: the owner adds a person, sends his link, decides the total and the account for him, and removes him',async({page,base})=>{
 await setup(page);
 await openAs(page,base,TOK,'.ac-fam-tile');
 assert.equal(await text(page,'.ac-fam-tile b'),'👨‍👩‍👧 أهل البيت');assert.equal(await text(page,'.ac-fam-tile small'),'ابعت التطبيق لأهلك وإنت اللي بتتحكم');
 // the tile comes after the complaint tile (and the alarm's)
 assert.equal(await page.evaluate(()=>document.querySelector('.ac-fam-tile').closest('.ac-al-wrap').previousElementSibling.querySelector('.ac-fb-tile')!==null),true);
 await openMore(page);await page.click('.ac-fam-tile');await page.waitForSelector('#familySheet');
 assert.equal(await text(page,'#familySheet .rg-top b'),'أهل البيت');
 assert.match(await text(page,'#familySheet .rg-hint'),/كل واحد من أهلك بياخد رابط لنفسه/);
 assert.match(await text(page,'#familySheet'),/لسه ما ضفتش حد من أهلك\./);
 // an empty name asks for it
 await page.click('[data-fm-add]');await page.waitForSelector('#familySheet .al-warn');assert.equal(await text(page,'#familySheet .al-warn'),'اكتب اسمه الأول.');
 // a new person: the total is hidden by default, his orders go on the account by default
 await page.fill('[data-fm-name]','ماما');await page.click('[data-fm-add]');await page.waitForSelector('#familySheet [data-fm-card]');
 let s=await fam(page);assert.equal(s.members.length,1);assert.deepEqual([s.members[0].name,s.members[0].show_balance,s.members[0].on_account],['ماما',false,true]);
 assert.equal(await text(page,'[data-fm-card] > b'),'ماما');assert.equal(await text(page,'[data-fm-card] > small'),'لسه ما فتحش الرابط');
 assert.equal(await text(page,'#familySheet .rg-warn'),'اتضاف. دوس «ابعت الرابط» عشان يوصله.');
 assert.equal(await page.getAttribute('[data-fm-sw="show"]','aria-checked'),'false');assert.equal(await page.getAttribute('[data-fm-sw="acc"]','aria-checked'),'true');
 assert.equal(await text(page,'[data-fm-card] .fm-sw:nth-of-type(1) small'),'مش هيشوف عليك كام ولا الدفعات، هيشوف الفواتير والأدوية بس.');
 // the total ON for him, then the account OFF: each saved on the server at once
 await page.click('[data-fm-sw="show"]');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('__fam')).members[0].show_balance===true);
 assert.equal(await page.getAttribute('[data-fm-sw="show"]','aria-checked'),'true');assert.equal(await text(page,'[data-fm-card] .fm-sw:nth-of-type(1) small'),'هيشوف عليك كام والدفعات وحساب الشهر.');
 await page.click('[data-fm-sw="acc"]');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('__fam')).members[0].on_account===false);
 assert.equal(await text(page,'[data-fm-card] .fm-sw:nth-of-type(2) small'),'طلباته كاش عند الاستلام.');
 const tok=(await fam(page)).members[0].token;
 // send: the phone's share sheet when it has one, else WhatsApp with the same text; copy: the link itself
 await page.evaluate(()=>{window.__opened=null;window.__shared=null;Object.defineProperty(navigator,'share',{value:undefined,configurable:true});window.open=(u)=>{window.__opened=u;return null}});
 await page.click('[data-fm-send]');await page.waitForFunction(()=>!!window.__opened);
 const wa=await page.evaluate(()=>window.__opened);assert.ok(wa.startsWith('https://wa.me/?text='));
 const sent=decodeURIComponent(wa.slice('https://wa.me/?text='.length));assert.match(sent,/أهلاً يا ماما/);assert.ok(sent.endsWith('store.html#me='+tok),'the text ends with his own link');
 await page.evaluate(()=>{Object.defineProperty(navigator,'share',{value:async(d)=>{window.__shared=d},configurable:true})});
 await page.click('[data-fm-send]');await page.waitForFunction(()=>!!window.__shared);assert.ok((await page.evaluate(()=>window.__shared.text)).endsWith('store.html#me='+tok));
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied=t}},configurable:true})});
 await page.click('[data-fm-copy]');await page.waitForFunction(()=>!!window.__copied);
 assert.ok((await page.evaluate(()=>window.__copied)).endsWith('store.html#me='+tok));assert.equal(await text(page,'[data-fm-copy]'),'اتنسخ ✓');
 // the tile counts them; closing goes back to the account
 await page.click('[data-fm-close]');await page.waitForFunction(()=>!document.getElementById('familySheet'));
 assert.equal(await text(page,'.ac-fam-tile small'),'واحد من أهلك');
 // removing him: asked first, then his link is gone
 await openMore(page);await page.click('.ac-fam-tile');await page.waitForSelector('#familySheet [data-fm-del]');
 await page.evaluate(()=>{window.__asked=null;window.confirm=(m)=>{window.__asked=m;return false}});
 await page.click('[data-fm-del]');assert.equal(await page.evaluate(()=>window.__asked),'تشيل ماما من أهل البيت؟ رابطه هيقف فورًا.');assert.equal((await fam(page)).members.length,1,'«لا» keeps him');
 await page.evaluate(()=>{window.confirm=()=>true});
 await page.click('[data-fm-del]');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('__fam')).members.length===0);
 await page.waitForFunction(()=>!document.querySelector('#familySheet [data-fm-card]'));assert.match(await text(page,'#familySheet'),/لسه ما ضفتش حد من أهلك\./);
 await page.click('[data-fm-close]');assert.equal(await text(page,'.ac-fam-tile small'),'ابعت التطبيق لأهلك وإنت اللي بتتحكم');
},{home:true});

run('Household: ten at most; and no tile at all when the server does not have the feature yet',async({page,base})=>{
 await setup(page,{members:Array.from({length:10},(_,i)=>member(i+1,'فرد '+(i+1)))});
 await openAs(page,base,TOK,'.ac-fam-tile');
 assert.equal(await text(page,'.ac-fam-tile small'),'10 من أهلك');
 await openMore(page);await page.click('.ac-fam-tile');await page.waitForSelector('#familySheet [data-fm-card]');
 assert.equal(await page.$$eval('#familySheet [data-fm-card]',e=>e.length),10);
 assert.equal(await text(page,'#familySheet .al-warn'),'وصلت للحد الأقصى (10). شيل حد عشان تضيف.');assert.equal(await page.$('[data-fm-name]'),null);
},{home:true});
run('Household: an older server (no household functions) shows no tile and the account works as before',async({page,base})=>{
 await setup(page,{noFamily:true});
 await openAs(page,base,TOK);
 await page.waitForSelector('.ac-fb-tile',{state:'attached'});assert.equal(await page.$('.ac-fam-tile'),null);assert.equal(await text(page,'.ac-big'),'عليك 1,240 ج');
},{home:true});

run('Household: a person of the house with the total kept from him: a greeting instead of the balance, only the purchases, no PDF, no household controls, cash when the owner said so',async({page,base})=>{
 await setup(page,{members:[member(1,'عمر')]});
 await openAs(page,base,MT(1),'.ac-hi');
 assert.equal(await text(page,'#acctName'),'أهلاً يا عمر · حساب أحمد محمود');assert.equal(await text(page,'#acctCardText'),'');
 assert.equal(await text(page,'.ac-hi .ac-big'),'أهلاً يا عمر');assert.equal(await text(page,'.ac-hi .hint-sm'),'ده حساب أحمد محمود. تقدر تطلب، وتشوف مشترياتك وأدويتك، وتظبط منبهك.');
 const all=await page.evaluate(()=>document.getElementById('acctBox').innerText);assert.equal(/1,?240|عليك|ليك عندنا|حسابك خالص|اشتريت الشهر|دفعت/.test(all),false,'no number of the account on his page');
 assert.equal(await page.$('.ac-big.owe'),null);assert.equal(await page.$('[data-acct-pdf]'),null,'the statement carries the balance');assert.equal(await page.$('.ac-fam-tile'),null,'he does not control the household');
 assert.equal(await page.$('.ac-paybtn'),null);
 assert.ok(await page.$('.ac-fb-tile'),'the messages page is his too');assert.ok(await page.$('.ac-al-tile'),'and his own alarm');assert.ok(await page.$('.ac-order'));
 assert.deepEqual(await page.$$eval('.ac-tab',e=>e.map(x=>x.textContent)),['الرئيسية','المشتريات']);
 await page.click('[data-acct-filter="sales"]');await page.waitForSelector('.ac-mv');
 assert.equal(await page.$$eval('.ac-mv',e=>e.length),1,'the invoice only, not the payment');assert.equal(await page.$('.ac-after'),null,'no «بعدها» balance');assert.equal(await page.$('.ac-mini'),null);
 await page.click('[data-acct-items]');assert.match(await text(page,'.ac-items'),/OMEZ 40 20 CAP/,'the items are his to see');
 // the orders: on the account by default (account is the checked option), cash only when the owner switched it off (also when the server says so mid-order)
 assert.equal(await page.evaluate(()=>{const r=document.querySelector('#payBox input[value="account"]');return !!r&&!r.disabled&&r.checked}),true);
 await page.click('[data-acct-filter="home"]');assert.equal(await text(page,'.ac-order'),'🛒 اطلب من الصيدلية');
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('__fam'));s.members[0].on_account=false;localStorage.setItem('__fam',JSON.stringify(s))});
 await page.evaluate(()=>window.AskerStoreAccount.memberCashNow());
 await page.waitForFunction(()=>{const r=document.querySelector('#payBox input[value="account"]');return !!r&&r.disabled});
 assert.equal(await page.evaluate(()=>document.querySelector('#payBox input[value="cash"]').checked),true);
 assert.match(await page.evaluate(()=>document.getElementById('payBox').innerText),/الدفع كاش عند الاستلام\. الآجل لصاحب الحساب\./);
 await page.click('[data-acct-filter="home"]');assert.equal(await page.evaluate(()=>document.querySelector('.ac-order').textContent),'🛒 اطلب (كاش عند الاستلام)');
 assert.equal(await page.evaluate(()=>window.AskerStoreAccount.role()),'member');
},{home:true});

run('Household: a person of the house whose owner turned the total ON sees the account like the owner (still no household controls); a removed person\'s link stops',async({page,base})=>{
 await setup(page,{members:[member(1,'عمر',{show_balance:true})]});
 await openAs(page,base,MT(1));
 assert.equal(await text(page,'.ac-big'),'عليك 1,240 ج');assert.equal(await page.$('.ac-hi'),null);assert.ok(await page.$('[data-acct-pdf]'));assert.equal(await page.$('.ac-fam-tile'),null);
 assert.deepEqual(await page.$$eval('.ac-tab',e=>e.map(x=>x.textContent)),['الرئيسية','الكل','المشتريات','المدفوعات']);
 assert.equal(await text(page,'#acctName'),'أهلاً يا عمر · حساب أحمد محمود');
 await page.click('[data-acct-filter="payments"]');await page.waitForSelector('.ac-mv');assert.match(await text(page,'.ac-mv'),/دفعة 500 ج/);
 // the owner removed him: the next open says the link stopped
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('__fam'));s.members=[];localStorage.setItem('__fam',JSON.stringify(s))});
 await page.reload();await page.waitForSelector('#acctBox .note.bad');
},{home:true});

run('Household: in English too (the owner\'s tile and list, the person\'s greeting)',async({page,base})=>{
 await setup(page,{lang:'en',members:[member(1,'Omar')]});
 await openAs(page,base,TOK,'.ac-fam-tile');
 assert.equal(await text(page,'.ac-fam-tile b'),'👨‍👩‍👧 My household');assert.equal(await text(page,'.ac-fam-tile small'),'One family member');
 await openMore(page);await page.click('.ac-fam-tile');await page.waitForSelector('#familySheet [data-fm-card]');
 assert.equal(await text(page,'#familySheet .rg-top b'),'Household');
 assert.match(await text(page,'#familySheet .rg-hint'),/Each family member gets his own link/);
 assert.equal(await text(page,'[data-fm-card] > small'),"Hasn't opened the link yet");
 assert.deepEqual(await page.$$eval('[data-fm-card] .fm-sw > span',e=>e.map(x=>x.firstChild.textContent)),['Can see the account total','Can order on your account']);
 assert.deepEqual(await page.$$eval('[data-fm-card] .fm-btn',e=>e.map(x=>x.textContent)),['📤 Send the link','📋 Copy the link']);
 assert.equal(await text(page,'[data-fm-card] .al-del'),'🗑 Remove');assert.equal(await page.getAttribute('[data-fm-name]','placeholder'),'His name, e.g. Mum or Ahmed');assert.equal(await text(page,'[data-fm-add]'),'➕ Add him');
 assert.equal(await page.evaluate(()=>/[؀-ۿ]/.test(document.getElementById('familySheet').innerText.replace(/Omar/g,''))),false,'nothing Arabic left in the sheet');
 await page.goto(base+'store.html?m=1#me='+MT(1));await page.waitForSelector('.ac-hi');
 assert.equal(await text(page,'.ac-hi .ac-big'),'Hi Omar');assert.match(await text(page,'#acctName'),/^Hi Omar · /);
},{home:true});
