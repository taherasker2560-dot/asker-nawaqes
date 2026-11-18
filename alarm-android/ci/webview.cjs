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
  // what the page itself got from the server's voice function (soft: this page is served from the CI machine, so the function's origin rule may refuse it; the live page is checked separately)
  const vb = await page.evaluate(async () => { const r = await window.AskerStoreAlarm.voiceBlob('Pemojet', 20000); return r.blob ? { ok: true, size: r.blob.size, from: r.from } : { ok: false, error: r.error }; });
  console.log('voice from the page:', JSON.stringify(vb));
  // the app's own file door, whatever the network did: a real WAV (1.2 s, 440 Hz) for the test ring's name is handed over exactly as the page does (base64), and the app has it
  const rate = 22050, n = Math.round(rate * 1.2), wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 440) * 9000), 44 + i * 2);
  assert.equal(await page.evaluate((b) => window.AskerAndroid.saveVoice('تجربة المنبه', b), wav.toString('base64')), true, 'the app took the sound file');
  assert.equal(await page.evaluate(() => window.AskerAndroid.hasVoice('تجربة المنبه')), true);
  voices = await sh(`run-as ${PKG} ls files/voice`);
  assert.match(voices, /\.wav/, 'the sound file is on the phone');
  // «جرّب المنبه»: the app starts the ring (with that file as its voice)
  await page.click('[data-al-apptest]');
  let svc = '';
  for (let k = 0; k < 20; k++) { svc = await sh(`dumpsys activity services ${PKG}`); if (/RingService/.test(svc)) break; await sleep(500); }
  assert.match(svc, /RingService/, 'the test ring started the ring service');
  const notes = await sh('dumpsys notification --noredact');
  assert.match(notes, /android\.title=String \(⏰ ميعاد تجربة المنبه الآن\)/, 'the ring\'s notification');
  // is the sentence really being PLAYED as an alarm sound? (soft: printed for the log; the emulator's audio is virtual)
  await sleep(2500);
  const audio = await sh('dumpsys audio');
  console.log('players:', (audio.split('\n').filter((l) => /AudioPlaybackConfiguration|USAGE_ALARM|state:started|piid/i.test(l) && /askerpharmacy|ALARM|started/i.test(l)).slice(0, 8).join('\n') || '(none shown)'));
  // the back button of the app leaves it (the page answers false on the list)
  assert.equal(await page.evaluate(() => window.AskerStoreAlarm.appBack()), false);
  await sh(`am force-stop ${PKG}`);
  console.log('WEBVIEW OK: the page works inside the real app');
  server.close();
  await device.close();
})().catch((e) => { console.error('WEBVIEW FAILED', e); try { server.close(); } catch (x) { /* closed */ } process.exit(1); });
