// PharmaFly's report cuts names at 25 letters: a cut name that starts exactly one known product gets its full name back
// (and so keeps its Arabic name); an ambiguous or unknown cut name is kept as it is.
const {run,waitStatus,assert}=require('./harness.cjs');
run('cut names restored from known products',async({page,table})=>{
 await page.evaluate(()=>window.__tables.ar_names.push(
  {name_key:'CLEARALIQUE FORTE 4% CREAM 30GM',english_name:'CLEARALIQUE FORTE 4% CREAM 30GM',arabic_name:'كليراليك فورت كريم',status:'approved'},
  {name_key:'CEFTRIAXONE 500MG I.M. VIAL',english_name:'CEFTRIAXONE 500MG I.M. VIAL',arabic_name:'سيفترياكسون ٥٠٠ عضل',status:'suggested'},
  {name_key:'CEFTRIAXONE 500MG I.M. VIAL (EVA)',english_name:'CEFTRIAXONE 500MG I.M. VIAL (EVA)',arabic_name:'سيفترياكسون ايفا',status:'suggested'}));
 await page.click('#shortPanel summary');
 await page.fill('#shText','BRUFEN 400MG 30TAB');await page.click('#shTextBtn');await waitStatus(page,/اتضاف/,'shStatus'); // reload known names
 await page.fill('#shText','CLEARALIQUE FORTE 4% CREA\nCEFTRIAXONE 500MG I.M. VI\nNEW PRODUCT WITH A LONG NA');await page.click('#shTextBtn');await waitStatus(page,/اتضاف 3/,'shStatus');
 const keys=(await table('ar_shortages')).map(x=>x.name_key);
 assert.ok(keys.includes('CLEARALIQUE FORTE 4% CREAM 30GM'),'one known product: full name restored');
 assert.ok(keys.includes('CEFTRIAXONE 500MG I.M. VI'),'two products start the same way: kept as written');
 assert.ok(keys.includes('NEW PRODUCT WITH A LONG NA'),'unknown: kept as written');
 assert.match(await page.textContent('#shStatus'),/منهم \d+ ليهم ترجمة محفوظة/);
});
