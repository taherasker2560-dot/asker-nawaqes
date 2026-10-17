const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const XLSX=require('../vendor/xlsx-0.20.3.full.min.js');
(async()=>{
 let browser;const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');res.end(data)})});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
 let launch={headless:true};if(process.env.CHROMIUM_EXECUTABLE)launch={...launch,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-gpu']};if(process.env.CHROMIUM_MODULE){const {default:binary}=await import(process.env.CHROMIUM_MODULE);launch={...launch,executablePath:await binary.executablePath(),args:binary.args}}
 browser=await chromium.launch(launch);const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:`window.testWrites=0;window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{}}}),onAuthStateChange:()=>{}},from:()=>{const q=new Proxy({},{get:(t,k)=>k==='then'?r=>r({data:[],error:null}):(...args)=>{if(['insert','update','upsert','delete'].includes(k)){window.testWrites++;throw Error('Unexpected database write')}return q}});return q},rpc:()=>{window.testWrites++;throw Error('Unexpected RPC')}})};`}));
 await page.goto(`http://127.0.0.1:${server.address().port}/asker-nawaqes-test-10.html`);await page.waitForSelector('#workspace:not(.hidden)');assert.equal(await page.locator('.file-import:not(.incoming-images)').count(),2);
 const widget=prefix=>page.locator('#'+prefix+'ImportFile').locator('..');
 const short=widget('shortage');
 await page.locator('#shortageImportFile').setInputFiles({name:'quoted.csv',mimeType:'text/csv',buffer:Buffer.from('Product Name;Required Qty;Price\n"Drug A 500mg";"٢";70\n"Drug B";3;90')});
 await page.waitForFunction(()=>document.getElementById('shortageImportName').value==='0');
 await short.locator('[data-role=preview]').click();assert.equal(await short.locator('[data-role=apply]').isEnabled(),true);await short.locator('[data-role=apply]').click();assert.equal(await page.locator('#shortageText').inputValue(),'Drug A 500mg | 2\nDrug B | 3');
 // A canceled import must preserve staged text.
 await page.locator('#shortageImportFile').setInputFiles({name:'bad.csv',buffer:Buffer.from('name,qty\nB,0')});await short.locator('[data-role=preview]').click();assert.equal(await short.locator('[data-role=apply]').isDisabled(),true);await short.locator('[data-role=cancel]').click();assert.ok((await page.locator('#shortageText').inputValue()).startsWith('Drug A'));
 // Price-only incoming data has no default quantity and cannot be staged until explicitly entered.
 await page.locator('[data-tab=incoming]').click();await page.locator('#incomingMode').selectOption('receipt');const incoming=widget('incoming');
 await page.locator('#incomingImportFile').setInputFiles({name:'prices.csv',buffer:Buffer.from('الصنف,السعر\nزابيميرت 30 مجم أقراص,165')});await incoming.locator('[data-role=preview]').click();assert.equal(await incoming.locator('[data-field=rawQuantity]').inputValue(),'');assert.equal(await incoming.locator('[data-role=apply]').isDisabled(),true);assert.equal(await page.locator('#incomingImportQty option[value="1"]').isDisabled(),true);
 await incoming.locator('[data-field=rawQuantity]').fill('٤');await incoming.locator('[data-role=apply]').click();assert.equal(await page.locator('#incomingText').inputValue(),'زابيميرت 30 مجم أقراص | 4');
 // Legacy XLS is parsed by the locally bundled reader.
 await page.locator('[data-tab=shortages]').click();const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['name','qty'],['Legacy Drug',2]]),'Products');const xls=XLSX.write(wb,{type:'buffer',bookType:'biff8'});
 await page.locator('#shortageImportFile').setInputFiles({name:'legacy.xls',buffer:Buffer.from(xls)});await page.waitForFunction(()=>document.getElementById('shortageImportName').value==='0');await short.locator('[data-role=preview]').click();
 page.once('dialog',d=>d.dismiss());await short.locator('[data-role=apply]').click();assert.ok((await page.locator('#shortageText').inputValue()).startsWith('Drug A'));
 await short.locator('[data-role=cancel]').click();
 if(process.env.ASKER_SOURCE_XLSX){await page.locator('#shortageImportFile').setInputFiles(process.env.ASKER_SOURCE_XLSX);await page.waitForFunction(()=>document.getElementById('shortageImportHeader').value==='4');assert.equal(await page.locator('#shortageImportName').inputValue(),'1');assert.equal(await page.locator('#shortageImportQty').inputValue(),'2');await short.locator('[data-role=preview]').click();assert.match(await short.locator('[data-role=status]').textContent(),/مختار 2126/);assert.equal(await short.locator('[data-index]').count(),100);await short.locator('[data-role=next]').click();assert.match(await short.locator('[data-role=page]').textContent(),/2 من/);await short.locator('[data-role=cancel]').click();}
 await page.locator('#shortageImportFile').setInputFiles({name:'broken.csv',buffer:Buffer.from('name,qty\n"unclosed,2')});await page.waitForFunction(()=>document.querySelector('#shortageImportFile').parentElement.querySelector('[data-role=status]').textContent.includes('تعذر'));
 assert.equal(await page.evaluate(()=>window.testWrites),0);assert.deepEqual(errors,[]);
 // Capture the ordinary mobile entry point with no imported user data.
 await short.locator('[data-role=cancel]').click();await page.locator('#shortageText').fill('');await page.locator('#shortagesPanel').screenshot({path:process.env.IMPORT_SCREENSHOT||'/tmp/asker-file-import-mobile.png'});
 console.log('PASS: real mobile Chromium UI, both widgets, semicolon/Arabic CSV, manual quantity, price-column block, XLS, actual 2129-row XLSX preview, pagination, cancel/overwrite, malformed file, zero database writes and no JS errors');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
