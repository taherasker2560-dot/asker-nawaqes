// The page warns once when the deployed function is older than the page expects, and stays quiet when it matches.
const {run,waitStatus,assert}=require('./harness.cjs'),fs=require('node:fs'),path=require('node:path');
const expected=fs.readFileSync(path.join(__dirname,'..','..','ar','app.js'),'utf8').match(/SERVER_VERSION = '([^']+)'/)[1];
run('server version warning',async({page})=>{
 await page.click('[data-tab="read"]');await page.click('[data-src="text"]');
 await page.evaluate(v=>window.__serverVersion=v,expected);await page.fill('#pasteText','فلاجيل شراب ١٢٥');await page.click('#textBtn');await waitStatus(page,/اتقرا/);
 assert.equal(await page.isVisible('#versionWarn'),false,'no warning when versions match');
 await page.evaluate(()=>window.__serverVersion='ar1');await page.click('#textBtn');await waitStatus(page,/اتقرا/);
 assert.equal(await page.isVisible('#versionWarn'),true);assert.match(await page.textContent('#versionWarn'),new RegExp('ar1.*'+expected));
});
