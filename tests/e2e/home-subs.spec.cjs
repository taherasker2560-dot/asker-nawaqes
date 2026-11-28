// «🔁 بدائل» on the search card (owner 2026-11-28, after the drawing: «انا عاوز يظهر البدايل حتى لو فيه رصيد للصنف احيانا العميل حاجه بسعر اعلى او اقل»):
// open under an item with no stock, a button under an item in stock; same active ingredient + strength + form (ar_store_generic), stock only, cheapest first,
// «أرخص بـ / أغلى بـ», an unsure line says «اتأكد»; a tap opens that item's card. «💊 بالمادة الفعالة» when an ingredient is typed.
const {run,assert}=require('./harness.cjs');
const seed=(page,withGeneric=true)=>page.evaluate((g)=>{
 const T={};
 T.ar_store_items=[
  {id:1,name:'PANTOLOC 40MG 14TAB',arabic_name:'بانتولوك ٤٠ مجم',price:102,status:'available',is_listed:true,hidden:false},
  {id:2,name:'CONTROLOC 40MG 14T',arabic_name:null,price:188,status:'available',is_listed:true,hidden:false},
  {id:3,name:'ZURCAL 40MG 14 TAB',arabic_name:null,price:96,status:'available',is_listed:true,hidden:false},
  {id:4,name:'PANTOLOC 20MG 14TAB',arabic_name:null,price:60,status:'available',is_listed:true,hidden:false},
  {id:5,name:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠ مجم',price:52,status:'available',is_listed:true,hidden:false},
 ];
 const st=(item_id,name,packs,price)=>({item_id,name,arabic_name:null,price,packs,units:0,parts:1,exp_near:null,other:null,data_at:'2026-11-28 10:45:00'});
 T.ar_stock=[st(2,'CONTROLOC 40MG 14T',29,188),st(3,'ZURCAL 40MG 14 TAB',13,96),st(4,'PANTOLOC 20MG 14TAB',5,60),st(5,'BRUFEN 400MG 30TAB',3,52)];
 if(g)T.ar_store_generic=[
  {item_id:1,gkey:'tab|pantoprazole 40mg',confident:true,ingredients:'pantoprazole 40mg',form:'tab'},
  {item_id:2,gkey:'tab|pantoprazole 40mg',confident:true,ingredients:'pantoprazole 40mg',form:'tab'},
  {item_id:3,gkey:'tab|pantoprazole 40mg',confident:false,ingredients:'pantoprazole 40mg',form:'tab'},
  {item_id:4,gkey:'tab|pantoprazole 20mg',confident:true,ingredients:'pantoprazole 20mg',form:'tab'},
 ];
 localStorage.setItem('__fakeTables',JSON.stringify(T));
},withGeneric);
const ready=(page)=>page.waitForFunction(()=>/\d/.test(document.getElementById('shStats')?.textContent||''));
const subsOf=(page,name)=>page.evaluate((n)=>{const c=[...document.querySelectorAll('#hsItems .hs-item')].find(x=>x.querySelector('strong').textContent.includes(n));const b=c&&c.querySelector('.hs-subs');
 return b?[...b.querySelectorAll('.hs-sub')].map(r=>r.textContent.replace(/\s+/g,' ').trim()):null;},name);
run('substitutes: open under an item with no stock, cheapest first, with the price difference',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 await page.fill('#hsQ','PANTOLOC 40');
 await page.waitForFunction(()=>!!document.querySelector('#hsItems .hs-subs'));
 assert.deepEqual(await subsOf(page,'بانتولوك'),['ZURCAL 40MG 14 TAB13 علبة96 جأرخص بـ 6 جاتأكد','CONTROLOC 40MG 14T29 علبة188 جأغلى بـ 86 ج'],'stock only, same strength, by price; ZURCAL is an unsure line');
 assert.match(await page.textContent('#hsItems .hs-subs'),/pantoprazole 40mg · أقراص/);
 assert.match(await page.textContent('#hsItems .hs-subs'),/القرار للصيدلي/);
 await page.setViewportSize({width:412,height:860});
 await page.screenshot({path:'test-results/home-subs.png',fullPage:false});
 // a tap on an alternative opens its own card (its name goes in the box)
 await page.click('#hsItems .hs-sub >> nth=1');
 await page.waitForFunction(()=>document.getElementById('hsQ').value==='CONTROLOC 40MG 14T');
 await page.waitForFunction(()=>/CONTROLOC/.test(document.querySelector('#hsItems .hs-item strong')?.textContent||''));
},{home:true});
run('substitutes: an item IN stock has a button «🔁 بدائل (n)» that opens them',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 await page.fill('#hsQ','CONTROLOC');
 await page.waitForFunction(()=>!!document.querySelector('#hsItems [data-subs]'));
 assert.equal(await subsOf(page,'CONTROLOC'),null,'closed at first: the card stays short');
 assert.equal((await page.textContent('#hsItems [data-subs]')).trim(),'🔁 بدائل (1)');
 await page.click('#hsItems [data-subs]');
 await page.waitForFunction(()=>!!document.querySelector('#hsItems .hs-subs'));
 assert.deepEqual(await subsOf(page,'CONTROLOC'),['ZURCAL 40MG 14 TAB13 علبة96 جأرخص بـ 92 جاتأكد'],'PANTOLOC 40 has no stock: not an alternative');
 await page.click('#hsItems .hs-subs-x');
 await page.waitForFunction(()=>!document.querySelector('#hsItems .hs-subs'));
 // an item with no ingredient line: nothing
 await page.fill('#hsQ','بروفين');
 await page.waitForFunction(()=>/بروفين/.test(document.getElementById('hsItems').textContent));
 assert.equal(await page.$$eval('#hsItems [data-subs], #hsItems .hs-subs',x=>x.length),0);
},{home:true});
run('substitutes: «💊 بالمادة الفعالة» when an ingredient is typed',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 await page.fill('#hsQ','pantoprazole');
 await page.waitForFunction(()=>!!document.querySelector('#hsItems .hs-ing'));
 const groups=await page.$$eval('#hsItems .hs-ing-g',g=>g.map(x=>({why:x.querySelector('.hs-subs-w').textContent.trim(),rows:[...x.querySelectorAll('.hs-sub-n')].map(n=>n.textContent.trim())})));
 assert.deepEqual(groups,[
  {why:'pantoprazole 40mg · أقراص',rows:['ZURCAL 40MG 14 TAB','CONTROLOC 40MG 14T','PANTOLOC 40MG 14TAB']},
  {why:'pantoprazole 20mg · أقراص',rows:['PANTOLOC 20MG 14TAB']},
 ],'one group per strength + form, the one with more stock first; in stock first, then no stock');
 assert.doesNotMatch(await page.textContent('#hsStatus'),/مفيش صنف/);
 // nothing was written
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.filter(w=>/ar_store_generic/.test(JSON.stringify(w)))),[]);
},{home:true});
run('substitutes: no ingredient list readable (staff without the right): no box, the search works',async({page})=>{
 await seed(page,false);await page.reload();await ready(page);
 await page.fill('#hsQ','PANTOLOC 40');
 await page.waitForFunction(()=>/بانتولوك/.test(document.getElementById('hsItems').textContent));
 assert.equal(await page.$$eval('#hsItems .hs-subs, #hsItems [data-subs], #hsItems .hs-ing',x=>x.length),0);
},{home:true});
