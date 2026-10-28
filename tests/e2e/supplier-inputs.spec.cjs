// Supplier input: typed lines, an Excel file (name column guessed) and a PDF (sent to the reader as application/pdf).
const {run,text,waitStatus,assert}=require('./harness.cjs');
run('typed lines, Excel and PDF input',async({page,fixture})=>{
 await page.click('[data-tab="read"]');
 await page.click('[data-src="text"]');await page.fill('#pasteText','فلاجيل شراب ١٢٥ | 5\nجانوفيا ٥٠ مجم\n\nحاجة تانية');await page.click('#textBtn');await waitStatus(page,/اتقرا/);
 assert.deepEqual(await page.evaluate(()=>window.__lines),['فلاجيل شراب ١٢٥ | 5','جانوفيا ٥٠ مجم','حاجة تانية']);
 assert.match(await text(page,'#results h3'),/وصل من النواقص: 2/);
 await page.click('[data-src="excel"]');await page.setInputFiles('#xlsFile',fixture('supplier.xlsx'));await page.waitForSelector('#xlsPick:not(.hidden)');
 assert.match(await page.$eval('#xlsCol',s=>s.options[s.selectedIndex].text),/عمود 2 — اسم الصنف/);
 await page.evaluate(()=>window.__lines=[]);await page.click('#xlsBtn');await waitStatus(page,/اتقرا/);
 assert.deepEqual(await page.evaluate(()=>window.__lines),['فلاجيل شراب ١٢٥','جانوفيا ٥٠ مجم','صنف تاني']);
 await page.click('[data-src="img"]');await page.setInputFiles('#images',fixture('supplier.pdf'));await page.click('#readBtn');await waitStatus(page,/اتقرا/);
 assert.deepEqual(await page.evaluate(()=>window.__mimes),['application/pdf']);
});
