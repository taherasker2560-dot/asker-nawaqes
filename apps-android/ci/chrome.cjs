// CI only: the REAL Chrome on the emulator. A page with the system's exact link (the one ar/work-apps.js makes) is tapped: Chrome must hand it to «مفتاح التطبيقات»,
// which starts the asked app (Settings: it is on every emulator). Prints «CHROME OPEN OK», or says why not (no Chrome on the image, Chrome could not be driven).
const http = require('node:http'), assert = require('node:assert/strict');
const path = require('node:path');
const { _android: android } = require('playwright');
const W = require(path.resolve(__dirname, '..', '..', 'ar', 'work-apps.js'));
const url = W.intentFor({ pkg: 'com.android.settings', link: '' });
const html = `<!doctype html><meta name="viewport" content="width=device-width"><a id="go" href="${url.replace(/"/g, '&quot;')}" style="display:block;font-size:40px;padding:40px">open</a>`;
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.end(html); });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
setTimeout(() => { console.error('CHROME OPEN NOT PROVEN: it took too long (Chrome could not be driven on this emulator)'); process.exit(1); }, 140000).unref();
(async () => {
  console.log('the link:', url);
  await new Promise((ok) => server.listen(8125, '0.0.0.0', ok));
  const [device] = await android.devices();
  assert.ok(device, 'no android device');
  const sh = async (c) => (await device.shell(c)).toString();
  if (!/com\.android\.chrome/.test(await sh('pm list packages com.android.chrome'))) { console.log('CHROME OPEN: SKIPPED (no Chrome on this emulator image)'); server.close(); await device.close(); process.exit(0); }
  await sh('am force-stop com.android.settings');
  const context = await device.launchBrowser();
  const page = await context.newPage();
  await page.goto('http://10.0.2.2:8125/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.click('#go', { noWaitAfter: true }); // a real tap: Chrome starts intent: links only from a tap
  let top = '';
  for (let k = 0; k < 30; k++) { top = await sh('dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity"'); if (/com\.android\.settings/.test(top)) break; await sleep(500); }
  console.log(top.trim().slice(0, 400));
  assert.match(top, /com\.android\.settings/, 'Chrome handed the link to the helper, which opened the asked app');
  console.log('CHROME OPEN OK: one tap in Chrome opened the asked app through «مفتاح التطبيقات»');
  server.close();
  await context.close().catch(() => {});
  await device.close();
  process.exit(0);
})().catch((e) => { console.error('CHROME OPEN NOT PROVEN:', e && e.message ? e.message : e); try { server.close(); } catch (x) { /* closed */ } process.exit(1); });
