// The shop's shortage file replaces the trial list (summary + confirm, cancel keeps it); Arabic names stay per product;
// typed names only add; V10's shortage_items is never touched.
const {run,text,waitStatus,assert}=require('./harness.cjs');
run('shortage file replaces the list, translations kept',async({page,fixture,table})=>{
 await page.evaluate(()=>window.__tables.ar_names.push({name_key:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠',status:'approved'},{name_key:'FLAGYL 125MG SYP',arabic_name:'فلاجيل ١٢٥ شراب',status:'approved'}));
 await page.setInputFiles('#shxFile',fixture('shortages.xlsx'));await page.waitForSelector('#shxPick:not(.hidden)');
 await page.click('#shxBtn');await page.waitForSelector('#shConfirm:not(.hidden)');
 assert.match(await text(page,'#shStatus'),/3 صنف: 2 جديد، 1 موجودين وهيفضلوا، و2 هيطلعوا/);
 await page.click('#shNo');assert.equal((await table('ar_shortages')).filter(x=>x.is_active).length,3,'cancel keeps the list');
 await page.click('#shxBtn');await page.click('#shYes');await waitStatus(page,/اتبدلت/,'shStatus');
 assert.deepEqual((await table('ar_shortages')).map(x=>x.name_key+':'+x.is_active).sort(),['BRUFEN 400MG 30TAB:true','CONGESTAL 20TAB:true','FLAGYL 125MG SYP:false','JANUVIA 50MG 28TAB:false','OMEPRAZOLE 20MG 14CAP:true']);
 assert.equal((await table('ar_names')).length,2,'translations are never deleted');
 await page.click('#shortPanel summary');await page.fill('#shText','FLAGYL 125MG SYP');await page.click('#shTextBtn');await waitStatus(page,/اتضاف/,'shStatus');
 assert.match(await text(page,'#shStatus'),/النواقص دلوقتي 4 صنف، منهم 2 ليهم ترجمة محفوظة/);
 assert.equal((await table('shortage_items')).length,3,'V10 list untouched');
});
