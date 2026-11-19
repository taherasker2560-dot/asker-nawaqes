// An order for more than the pharmacy has (owner 2026-11-17: «لما حد يطلب أوردر من الموقع، لو طلب أزيد من الكمية المتاحة يطلع له تنبيه عشان ما يطلبش وبعد كده يلاقي الكمية ما جاتلوش مظبوطة»).
// The cart asks the server for the boxes in stock (ar_store_item_qty, faked here), warns on the line, stops the plus at the last box, blocks «إرسال الطلب» until it is fixed, and shows
// the server's own refusal (error «qty» with the maximum) the same way. Made-up items only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const CART=[
 {id:1,name:'PANADOL EXTRA 24 TAB',arabic_name:'بنادول اكسترا',price:50,qty:5},
 {id:2,name:'CONGESTAL 20 TAB',arabic_name:null,price:30,qty:2},
 {id:3,name:'SOMETHING ON ORDER',arabic_name:null,price:null,qty:4,on_order:true},
];
const setup=(page,limits,placed)=>page.addInitScript(([limits,placed])=>{
 try{if(!localStorage.getItem('__set')){localStorage.setItem('__limits',JSON.stringify(limits));localStorage.setItem('__placed',JSON.stringify(placed));localStorage.setItem('__set','1');localStorage.setItem('asker_store_cart',JSON.stringify(window.__CART||[]))}}catch(e){}
 window.__fakeRpcs={ar_store_pay_info:()=>null,
  ar_store_item_qty:(a)=>{window.__asked=(window.__asked||[]).concat([a.p_ids]);return JSON.parse(localStorage.getItem('__limits'))},
  ar_store_place_order:(a)=>{window.__placedArgs=a;return JSON.parse(localStorage.getItem('__placed'))}};
},[limits,placed]);
const seed=(page)=>page.addInitScript((c)=>{window.__CART=c},CART);
const open=async(page,base)=>{await page.setViewportSize({width:375,height:812});await page.goto(base+'store.html#cart');await page.waitForSelector('#cartItems .cart-line');};
const OK={ok:true,order_id:7,total:100,items:[{id:1,name:'PANADOL EXTRA 24 TAB',qty:3,price:50,line_total:150}],rx:0};

run('Cart limit: a line above the boxes in stock is warned on the line, the plus stops at the last box, the order is not sent until it is fixed, «خليها 3» fixes it',async({page,base})=>{
 await seed(page);
 await setup(page,{ok:true,max:{1:3,2:20}},OK);
 await open(page,base);
 await page.waitForSelector('.cart-over');
 assert.match(await text(page,'#cartItems .cart-line:nth-of-type(1) .cart-over'),/المتاح عندنا 3 علب بس/);
 assert.equal(await text(page,'#cartItems .cart-line:nth-of-type(1) [data-capq]'),'خليها 3');
 assert.deepEqual(await page.evaluate(()=>window.__asked),[[1,2,3]],'every item of the cart is asked (the one on order may have a cap of the owner\'s)');
 // blocked: the plus is off, the message is in the form, the send button is off
 assert.equal(await page.$eval('#cartItems .cart-line:nth-of-type(1) [data-qty][data-d="1"]',b=>b.disabled),true);
 assert.equal(await text(page,'#formMsg'),'في صنف طلبت منه أكتر من المتاح عندنا. عدّل الكمية وابعت تاني');
 assert.equal(await page.$eval('#sendBtn',b=>b.disabled),true);
 // the other lines are untouched: no warning on an item that has enough, none on the one on order
 assert.equal(await page.$$eval('.cart-over',e=>e.length),1);
 assert.equal(await page.$eval('#cartItems .cart-line:nth-of-type(2) [data-qty][data-d="1"]',b=>b.disabled),false);
 // «خليها 3»
 await page.click('[data-capq="1"]');
 await page.waitForFunction(()=>!document.querySelector('.cart-over'));
 assert.equal(await text(page,'#cartItems .cart-line:nth-of-type(1) .qty span'),'3');
 assert.match(await text(page,'#cartItems .cart-line:nth-of-type(1)'),/ده آخر المتاح عندنا/,'at the last box it says so, and the plus stays off');
 assert.equal(await page.$eval('#cartItems .cart-line:nth-of-type(1) [data-qty][data-d="1"]',b=>b.disabled),true);
 assert.equal(await text(page,'#formMsg'),'','the warning is gone with the problem');
 assert.equal(await page.$eval('#sendBtn',b=>b.disabled),false);
 // minus works, and plus up to the box again
 await page.click('#cartItems .cart-line:nth-of-type(1) [data-qty][data-d="-1"]');
 assert.equal(await text(page,'#cartItems .cart-line:nth-of-type(1) .qty span'),'2');
 await page.click('#cartItems .cart-line:nth-of-type(1) [data-qty][data-d="1"]');
 assert.equal(await text(page,'#cartItems .cart-line:nth-of-type(1) .qty span'),'3');
 // an order from the fixed cart goes through
 await page.fill('#cName','Ahmed');await page.fill('#cPhone','01012345678');
 await page.click('#sendBtn');await page.waitForFunction(()=>window.__placedArgs);
 assert.deepEqual(await page.evaluate(()=>window.__placedArgs.p_items.map(i=>[i.id,i.qty])),[[1,3],[2,2],[3,4]]);
 assert.ok(await page.waitForSelector('[data-view="done"]:not([hidden])',{timeout:8000}));
},{home:true});

run('Cart limit: the server\'s own refusal (stock changed after the cart was drawn) shows the same warning with its maximum, and nothing is placed',async({page,base})=>{
 await seed(page);
 // the page could not ask the stock (offline moment): no warning yet; the server then says «qty» with the maximum
 await setup(page,{ok:false},{ok:false,error:'qty',items:[{id:1,name:'PANADOL EXTRA 24 TAB',max:2}]});
 await open(page,base);
 assert.equal(await page.$('.cart-over'),null,'no limits known: nothing is blocked on the page');
 await page.fill('#cName','Ahmed');await page.fill('#cPhone','01012345678');
 await page.click('#sendBtn');
 await page.waitForSelector('.cart-over');
 assert.match(await text(page,'#cartItems .cart-line:nth-of-type(1) .cart-over'),/المتاح عندنا علبتين بس/);
 assert.equal(await text(page,'#formMsg'),'في صنف طلبت منه أكتر من المتاح عندنا. عدّل الكمية وابعت تاني');
 assert.equal(await page.$eval('#sendBtn',b=>b.disabled),true,'and it is not sent again until he fixes it');
 assert.equal(await page.$('[data-view="done"]:not([hidden])'),null);
 await page.click('[data-capq="1"]');await page.waitForFunction(()=>!document.querySelector('.cart-over'));
 assert.equal(await text(page,'#cartItems .cart-line:nth-of-type(1) .qty span'),'2');
},{home:true});

run('Cart limit: in English too, and a cart with nothing above the stock is not touched',async({page,base})=>{
 await seed(page);
 await page.addInitScript(()=>{try{localStorage.setItem('asker-lang','en')}catch(e){}});
 await setup(page,{ok:true,max:{1:3,2:20}},OK);
 await open(page,base);
 await page.waitForSelector('.cart-over');
 assert.match(await text(page,'#cartItems .cart-line:nth-of-type(1) .cart-over'),/We have only 3 packs/);
 assert.equal(await text(page,'[data-capq="1"]'),'Make it 3');
 assert.equal(await text(page,'#formMsg'),'One item is above what we have. Change the quantity and send again');
 await page.click('[data-capq="1"]');await page.waitForFunction(()=>!document.querySelector('.cart-over'));
 assert.match(await text(page,'#cartItems .cart-line:nth-of-type(1)'),/That's all we have/);
 // a cart that is within the stock: no warning at all (qty 2 of 20, and the one on order)
 await page.evaluate(()=>{const c=JSON.parse(localStorage.getItem('asker_store_cart'));c[0].qty=1;localStorage.setItem('asker_store_cart',JSON.stringify(c))});
 await page.reload();await page.waitForSelector('#cartItems .cart-line');await page.waitForTimeout(500);
 assert.equal(await page.$('.cart-over'),null);assert.equal(await page.$eval('#sendBtn',b=>b.disabled),false);
},{home:true});

run('Owner cap: «أقصى كمية في الطلب N» on the line (also for an item on order), the form says «المسموح في الطلب الواحد», the plus stops at the cap, «خليها N» fixes it and the order goes through',async({page,base})=>{
 await seed(page);
 // item 1: the owner capped it at 2 (the pharmacy has more); item 3 is on order and capped at 3; item 2 has no cap
 await setup(page,{ok:true,max:{1:2,2:20,3:3},cap:{1:true,3:true}},OK);
 await open(page,base);
 await page.waitForSelector('.cart-over');
 assert.equal(await page.$$eval('.cart-over',e=>e.length),2,'two lines are above the owner\'s cap: item 1 (5 > 2) and the one on order (4 > 3)');
 assert.match(await text(page,'#cartItems .cart-line:nth-of-type(1) .cart-over'),/أقصى كمية في الطلب علبتين/);
 assert.doesNotMatch(await text(page,'#cartItems .cart-line:nth-of-type(1) .cart-over'),/المتاح عندنا/);
 assert.match(await text(page,'#cartItems .cart-line:nth-of-type(3) .cart-over'),/أقصى كمية في الطلب 3 علب/);
 assert.equal(await text(page,'#formMsg'),'في صنف طلبت منه أكتر من المسموح في الطلب الواحد. عدّل الكمية وابعت تاني');
 assert.equal(await page.$eval('#sendBtn',b=>b.disabled),true);
 assert.equal(await page.$('#cartItems .cart-line:nth-of-type(2) .cart-over'),null,'an item with no cap and enough stock: no warning');
 await page.click('[data-capq="1"]');
 await page.waitForFunction(()=>document.querySelectorAll('.cart-over').length===1);
 assert.match(await text(page,'#cartItems .cart-line:nth-of-type(1)'),/ده أقصى كمية في الطلب الواحد/,'at the cap it says so (not «آخر المتاح»)');
 assert.equal(await page.$eval('#cartItems .cart-line:nth-of-type(1) [data-qty][data-d="1"]',b=>b.disabled),true);
 assert.equal(await page.$eval('#sendBtn',b=>b.disabled),true,'the one on order is still above its cap');
 await page.click('[data-capq="3"]');
 await page.waitForFunction(()=>!document.querySelector('.cart-over'));
 assert.equal(await text(page,'#formMsg'),'');
 assert.equal(await page.$eval('#sendBtn',b=>b.disabled),false);
 await page.fill('#cName','Ahmed');await page.fill('#cPhone','01012345678');
 await page.click('#sendBtn');await page.waitForFunction(()=>window.__placedArgs);
 assert.deepEqual(await page.evaluate(()=>window.__placedArgs.p_items.map(i=>[i.id,i.qty])),[[1,2],[2,2],[3,3]]);
},{home:true});

run('Owner cap: one line is the pharmacy\'s stock and one is the owner\'s cap: the form says the stock words; the server\'s refusal with «cap» draws the cap words',async({page,base})=>{
 await seed(page);
 await setup(page,{ok:true,max:{1:3,2:1},cap:{2:true}},OK);
 await open(page,base);
 await page.waitForSelector('.cart-over');
 assert.match(await text(page,'#cartItems .cart-line:nth-of-type(1) .cart-over'),/المتاح عندنا 3 علب بس/);
 assert.match(await text(page,'#cartItems .cart-line:nth-of-type(2) .cart-over'),/أقصى كمية في الطلب علبة واحدة/);
 assert.equal(await text(page,'#formMsg'),'في صنف طلبت منه أكتر من المتاح عندنا. عدّل الكمية وابعت تاني','mixed: the stock words');
},{home:true});

run('Owner cap: the server refuses an order above the cap (the page could not ask before): the line and the form show the cap words; English too',async({page,base})=>{
 await seed(page);
 await page.addInitScript(()=>{try{localStorage.setItem('asker-lang','en')}catch(e){}});
 await setup(page,{ok:false},{ok:false,error:'qty',items:[{id:1,name:'PANADOL EXTRA 24 TAB',max:2,cap:true}]});
 await open(page,base);
 assert.equal(await page.$('.cart-over'),null,'no limits known: nothing is blocked on the page');
 await page.fill('#cName','Ahmed');await page.fill('#cPhone','01012345678');
 await page.click('#sendBtn');
 await page.waitForSelector('.cart-over');
 assert.match(await text(page,'#cartItems .cart-line:nth-of-type(1) .cart-over'),/Maximum 2 packs per order/);
 assert.equal(await text(page,'#formMsg'),'One item is above the maximum for one order. Change the quantity and send again');
 assert.equal(await page.$eval('#sendBtn',b=>b.disabled),true);
 await page.click('[data-capq="1"]');await page.waitForFunction(()=>!document.querySelector('.cart-over'));
 assert.match(await text(page,'#cartItems .cart-line:nth-of-type(1)'),/That's the most for one order/);
},{home:true});
