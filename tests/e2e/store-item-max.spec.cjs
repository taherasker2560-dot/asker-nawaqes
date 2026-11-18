// «أقصى كمية في الطلب الواحد» in the bot (owner 2026-11-19: «أقصى كمية من أصناف معينة أنا أحددها»): in «إعدادات الموقع ← صنف معين» each item card has a box for the most boxes one order may hold;
// save, change, clear, and the refusals (0, 21, text). Made-up items only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const ITEMS=[
 {id:1,name:'PANADOL EXTRA 24 TAB',arabic_name:'بنادول اكسترا',status:'available',price:50,hidden:false,is_listed:true,max_per_order:null},
 {id:2,name:'PANADOL COLD FLU',arabic_name:null,status:'available',price:30,hidden:false,is_listed:true,max_per_order:4},
];
const find=async(page,q)=>{await page.fill('#ssQ',q);await page.click('#ssSearch');await page.waitForSelector('#ssItems .ss-item')};

run('Bot: the item card has «أقصى كمية في الطلب الواحد»: save a number, see it on the card, change it, clear it; bad numbers are refused before saving',async({page})=>{
 await page.evaluate(([items])=>{window.__tables.ar_store_items=items.map(x=>({...x}))},[ITEMS]);
 await page.click('[data-group="sales"]');
 await page.waitForSelector('#storeSettings');
 await page.click('#storeSettings summary');
 await find(page,'panadol');
 assert.equal(await page.$$eval('#ssItems .ss-item',c=>c.length),2);
 // the box shows the saved cap (item 2) or stays empty (item 1); the card says it in the line under the name
 assert.equal(await page.inputValue('#mx-1'),'');assert.equal(await page.inputValue('#mx-2'),'4');
 assert.doesNotMatch(await text(page,'[data-item="1"] .hint'),/أقصى كمية/);
 assert.match(await text(page,'[data-item="2"] .hint'),/أقصى كمية في الطلب 4/);
 // save 5 on item 1
 await page.fill('#mx-1','5');await page.click('[data-item="1"] [data-max]');
 await page.waitForFunction(()=>window.__tables.ar_store_items.find(x=>x.id===1).max_per_order===5);
 assert.equal(await text(page,'#ssItemStatus'),'الحد اتحفظ: أقصى 5 في الطلب الواحد، وهيظهر في الموقع على طول');
 assert.match(await text(page,'[data-item="1"] .hint'),/أقصى كمية في الطلب 5/);
 assert.equal(await page.inputValue('#mx-1'),'5');
 assert.equal(await page.evaluate(()=>window.__tables.ar_store_items.find(x=>x.id===2).max_per_order),4,'only the item he saved changed');
 // Arabic digits are read
 await page.fill('#mx-1','٣');await page.click('[data-item="1"] [data-max]');
 await page.waitForFunction(()=>window.__tables.ar_store_items.find(x=>x.id===1).max_per_order===3);
 // clear it: empty = no limit of his own
 await page.fill('#mx-2','');await page.click('[data-item="2"] [data-max]');
 await page.waitForFunction(()=>window.__tables.ar_store_items.find(x=>x.id===2).max_per_order===null);
 assert.equal(await text(page,'#ssItemStatus'),'الحد اتشال: الصنف رجع للموجود بس');
 assert.doesNotMatch(await text(page,'[data-item="2"] .hint'),/أقصى كمية/);
 // refused before anything is saved: 0, 21, text
 const writes=()=>page.evaluate(()=>window.__fakeWrites.filter(w=>w.table==='ar_store_items').length);
 const before=await writes();
 for(const [v,msg] of [['0','الحد لازم يكون من 1 لـ 20 علبة'],['21','الحد لازم يكون من 1 لـ 20 علبة']]){
  await page.fill('#mx-1',v);await page.click('[data-item="1"] [data-max]');
  assert.equal(await text(page,'#ssItemStatus'),msg,'refused: '+v);
 }
 assert.equal(await writes(),before,'nothing was written for a refused number');
 assert.equal(await page.evaluate(()=>window.__tables.ar_store_items.find(x=>x.id===1).max_per_order),3);
});

run('Bot: before the database has the column the card shows no box (nothing breaks)',async({page})=>{
 await page.evaluate(([items])=>{window.__tables.ar_store_items=items.map(({max_per_order,...x})=>({...x}))},[ITEMS]);
 await page.click('[data-group="sales"]');
 await page.waitForSelector('#storeSettings');
 await page.click('#storeSettings summary');
 await find(page,'panadol');
 assert.equal(await page.$('#mx-1'),null);assert.equal(await page.$('[data-max]'),null);
 assert.ok(await page.$('[data-ar]'),'the Arabic-name box is still there');
});