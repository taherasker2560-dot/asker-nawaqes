// Owner 2026-11-17 («ب»): the store settings he saves in the bot reach the visitors: the closed switch with its message, the site's own words when he types
// them (empty = the page's words), the WhatsApp slide and line (no floating WhatsApp button), the default color.
const {run,text,assert}=require('./harness.cjs');
const ROW={id:1,is_open:true,closed_message:null,hero_title:null,hero_text:null,whatsapp:'01003032931',theme_color:'flame',theme_night:false};
const seed=(page,row)=>page.evaluate(([r])=>{localStorage.setItem('__fakeTables',JSON.stringify({ar_store_settings:r?[r]:[]}));localStorage.removeItem('asker_store_settings');localStorage.setItem('asker_store_cart',JSON.stringify([{id:1,name:'PANADOL EXTRA 24 TAB',arabic_name:null,price:66.7,qty:1}]))},[row]);

run('Store settings reach visitors: WhatsApp slide and line (no floating button), the page\'s own words while the owner\'s are empty, his words when typed, the closed switch',async({page,base})=>{
 await seed(page,ROW);
 await page.goto(base+'store.html?s=1');
 await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 await page.waitForSelector('#contact:not([hidden])');
 assert.equal(await text(page,'#waNumber'),'01003032931');
 assert.equal(await page.getAttribute('#waLink','href'),'https://wa.me/201003032931');
 assert.equal(await page.$eval('#slideWa',e=>e.hidden),false,'the «اسأل الصيدلي» slide is on');
 assert.equal(await page.getAttribute('#slideWaBtn','href'),'https://wa.me/201003032931?text='+encodeURIComponent('عندي سؤال للصيدلي'));
 assert.equal(await page.$('#waFab'),null,'no floating WhatsApp button');
 assert.equal(await page.$('.wa-fab'),null);
 assert.equal(await text(page,'#heroTitle'),'صحتك أولوية','empty owner words = the page\'s own');
 // the default color from the settings is the one the site already has (flame, day)
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('night')),false);
 // his own words when he types them in the bot
 await seed(page,{...ROW,hero_title:'عنوان من الإعدادات',hero_text:'جملة من الإعدادات'});
 await page.goto(base+'store.html?s=2');await page.reload();
 await page.waitForFunction(()=>document.getElementById('heroTitle').textContent==='عنوان من الإعدادات');
 assert.equal(await text(page,'#heroText'),'جملة من الإعدادات');
 // the number cleared: the slide and the line go away
 await seed(page,{...ROW,whatsapp:null});
 await page.goto(base+'store.html?s=3');await page.reload();
 await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 await page.waitForTimeout(500);
 assert.equal(await page.$eval('#contact',e=>e.hidden),true);
 assert.equal(await page.$eval('#slideWa',e=>e.hidden),true);
 // closed from the bot: the page says so with his message, and the order button is off
 await seed(page,{...ROW,is_open:false,closed_message:'مقفول للجرد، بنرجع 9 الصبح'});
 await page.goto(base+'store.html#cart');await page.reload();
 await page.waitForSelector('#checkout .closed-note:not([hidden])');
 assert.equal(await text(page,'#checkout .closed-note'),'مقفول للجرد، بنرجع 9 الصبح');
 assert.equal(await page.$eval('#sendBtn',e=>e.disabled),true);
},{home:true});
