// «📊 التقارير» → «المرتجعات المطلوبة» (owner 2026-11-28: «جهز الريبورت على طول بعدها، اللي هو الريبورت بالحاجات اللي هتترجع دي على طول»): the card opens «الصلاحيات» on its view
// «↩️ مرتجعات» (ar/return-marks.js): the marked items by supplier, where each stands in PharmaFly, the statement. Made-up items and numbers only (a public repo).
const {run,assert}=require('./harness.cjs');
const seed=(page)=>page.evaluate(()=>{
 const T=window.__tables;
 T.ar_return_marks=[
  {id:1,move_id:5002,vendor_id:71,vendor_name:'مورد أ',code:'11/27/2002',invoiced_at:'2026-11-27 20:22:00',item_id:904,item_name:'EXAMPLE ORDERED DROPS',item_ar:'',expiry:'2028-01-31',k:1,units:5,returned_units:0,status:'marked',marked_at:new Date().toISOString(),prepared_by:null,robot_state:null},
  {id:2,move_id:5001,vendor_id:72,vendor_name:'مورد ب',code:'11/10/1001',invoiced_at:'2026-11-10 12:00:00',item_id:901,item_name:'EXAMPLE SYRUP CHILD',item_ar:'',expiry:'2027-06-30',k:1,units:1,returned_units:1,status:'marked',marked_at:new Date().toISOString(),prepared_by:null,robot_state:'saved'}];
 window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{ar_return_sync:()=>({ok:true,closed:0,touched:0})});
});
run('Reports: «المرتجعات المطلوبة» opens the returns list, by supplier, with where each stands in PharmaFly',async({page})=>{
 await seed(page);
 await page.click('#spareBar .sp-slot >> nth=0');await page.waitForSelector('#reportsPanel:not(.hidden) .rp-card');
 assert.match(await page.textContent('#rpMain [data-rp="retmarks"]'),/المرتجعات المطلوبة/);
 await page.click('#rpMain [data-rp="retmarks"]');
 await page.waitForSelector('#alExpiry .rm-row');
 const rows=await page.$$eval('#alExpiry .rm-row',r=>r.map(x=>({n:x.querySelector('.sd-name').textContent.trim(),e:(x.querySelector('.rm-entry')||{}).textContent||''})));
 assert.deepEqual(rows.map(r=>r.n).sort(),['EXAMPLE ORDERED DROPS','EXAMPLE SYRUP CHILD']);
 assert.match(rows.find(r=>r.n==='EXAMPLE ORDERED DROPS').e,/مستني يتسجل في فارمافلاي/);
 assert.match(rows.find(r=>r.n==='EXAMPLE SYRUP CHILD').e,/اتسجل مرتجع في فارمافلاي/,'entered, still on the list until it is prepared');
 assert.ok(await page.isVisible('#rpBack'),'«‹ التقارير» on top');
 assert.equal(await page.$eval('#alViews [data-al-view="returns"]',b=>!b.classList.contains('secondary')),true,'the view «↩️ مرتجعات» is the one on');
},{home:true});
