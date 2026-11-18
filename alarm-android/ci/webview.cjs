// CI only: the page inside the REAL app on a REAL Android (the emulator). The CI machine serves THIS repository's store.html on port 8123; the debug app is pointed at it
// (10.0.2.2 is the CI machine as the emulator sees it) and Playwright drives the app's WebView over adb. Proves what the web tests cannot: the page finds window.AskerAndroid in a real
// WebView, the sheet opens by itself, an alarm made on the page reaches the app (its storage + a system alarm), the sound file comes over, and «جرّب المنبه» starts the ring service.
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
  await new Promise((ok) => server.listen(8123, '0.0.0.0', ok));
  const [device] = await android.devices();
  assert.ok(device, 'no android device');
  const sh = async (c) => (await device.shell(c)).toString();
  console.log('device', device.model(), device.serial());
  // a clean start: no data, no old alarm, notifications allowed
  await sh(`pm clear ${PKG}`);
  await sh(`pm grant ${PKG} android.permission.POST_NOTIFICATIONS`);
  await sh(`am start -n ${PKG}/.MainActivity --es base http://10.0.2.2:8123/store.html`);
  const wv = await device.webView({ pkg: PKG }, { timeout: 90000 });
  const page = await wv.page();
  console.log('webview page', page.url());
  await page.waitForFunction(() => !!window.AskerAndroid && !!window.AskerStoreAlarm, null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.AskerAndroid.version()), '1', 'the bridge answers');
  // the sheet is open by itself (inside the app it IS the screen), and no browser-only box shows
  await page.waitForSelector('#alarmSheet', { timeout: 30000 });
  assert.equal(await page.$('[data-al-notif]'), null);
  assert.equal(await page.$('[data-al-getapp]'), null);
  // an alarm made on the page
  await page.click('[data-al-new]');
  await page.click('[data-al-pick="other"]');
  await page.fill('[data-al-name]', 'Pemojet 40 mg');
  await page.click('[data-al-preset="once"]');
  await page.click('[data-al-save]');
  await page.waitForSelector('#alarmSheet .al-card');
  // ... reached the app: its storage holds the name as it is said + the time, and the system has the alarm clock
  let prefs = '';
  for (let k = 0; k < 20; k++) { prefs = await sh(`run-as ${PKG} cat shared_prefs/asker_alarm.xml`); if (/Pemojet/.test(prefs)) break; await sleep(500); }
  console.log(prefs);
  assert.match(prefs, /Pemojet/, 'the alarm reached the app');
  assert.doesNotMatch(prefs, /Pemojet 40/, 'the app got the name as it is said (no strength)');
  assert.match(prefs, /08:00/);
  const dump = await sh('dumpsys alarm');
  assert.match(dump, /com\.askerpharmacy\.alarm\.FIRE/, 'the system has the alarm clock');
  // the sound file: the page asked the server's voice function and handed the file over (soft: the server and the internet are not this test's business)
  let voices = '';
  for (let k = 0; k < 40; k++) { voices = await sh(`run-as ${PKG} ls files/voice`); if (/\.wav/.test(voices)) break; await sleep(1000); }
  console.log('voice files:', voices.trim() || '(none)');
  // «جرّب المنبه»: the app starts the ring
  await page.click('[data-al-apptest]');
  let svc = '';
  for (let k = 0; k < 20; k++) { svc = await sh(`dumpsys activity services ${PKG}`); if (/RingService/.test(svc)) break; await sleep(500); }
  assert.match(svc, /RingService/, 'the test ring started the ring service');
  const notes = await sh('dumpsys notification --noredact');
  assert.match(notes, /android\.title=String \(⏰ ميعاد تجربة المنبه الآن\)/, 'the ring\'s notification');
  // the back button of the app leaves it (the page answers false on the list)
  assert.equal(await page.evaluate(() => window.AskerStoreAlarm.appBack()), false);
  await sh(`am force-stop ${PKG}`);
  console.log('WEBVIEW OK: the page works inside the real app');
  server.close();
  await device.close();
})().catch((e) => { console.error('WEBVIEW FAILED', e); try { server.close(); } catch (x) { /* closed */ } process.exit(1); });
