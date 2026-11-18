// CI only, a proof that is allowed to fail: the REAL Chrome on the emulator hands the site's alarms to the app. The page (this repository's store.html, served on 8123) opens its alarm sheet,
// the «connected» mark is set (it is set by the button that opens the app), an alarm is saved with a real tap, and Chrome must launch the app's hand-off door by itself.
// Prints «CHROME HANDOFF OK» or says why not (no Chrome on the image, Chrome could not be driven, or the app did not get the alarm).
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _android: android } = require('playwright');
const repo = path.resolve(__dirname, '..', '..');
const PKG = 'com.askerpharmacy.alarm';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'), f = path.join(repo, decodeURIComponent(u.pathname));
  if (f.startsWith(repo) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); return r.end(fs.readFileSync(f)); }
  r.writeHead(404); r.end();
});
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
(async () => {
  await new Promise((ok) => server.listen(8124, '0.0.0.0', ok));
  const [device] = await android.devices();
  assert.ok(device, 'no android device');
  const sh = async (c) => (await device.shell(c)).toString();
  const pk = await sh('pm list packages com.android.chrome');
  if (!/com\.android\.chrome/.test(pk)) { console.log('CHROME HANDOFF: SKIPPED (no Chrome on this emulator image)'); server.close(); await device.close(); return; }
  await sh(`pm clear ${PKG}`);
  const context = await device.launchBrowser();
  const page = await context.newPage();
  await page.goto('http://10.0.2.2:8124/store.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.AskerStoreAlarm, null, { timeout: 60000 });
  console.log('chrome ua:', await page.evaluate(() => navigator.userAgent));
  await page.evaluate(() => { localStorage.setItem('asker_dose_app', '1'); window.AskerStoreAlarm.open(); });
  await page.waitForSelector('[data-al-new]');
  await page.click('[data-al-new]');
  await page.click('[data-al-pick="other"]');
  await page.fill('[data-al-name]', 'Chromedose');
  await page.click('[data-al-preset="once"]');
  await page.click('[data-al-save]');
  let prefs = '';
  for (let k = 0; k < 40; k++) { prefs = await sh(`run-as ${PKG} cat shared_prefs/asker_alarm.xml`); if (/Chromedose/.test(prefs)) break; await sleep(500); }
  console.log(prefs.slice(0, 600));
  assert.match(prefs, /Chromedose/, 'Chrome handed the alarm to the app');
  console.log('CHROME HANDOFF OK: the real Chrome launched the app\'s hand-off door from a tap');
  server.close();
  await context.close();
  await device.close();
})().catch((e) => { console.error('CHROME HANDOFF NOT PROVEN:', e && e.message ? e.message : e); try { server.close(); } catch (x) { /* closed */ } process.exit(1); });
