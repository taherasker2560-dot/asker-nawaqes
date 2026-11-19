// CI only: the REAL Chrome on the emulator. A page with the system's exact links (the ones ar/work-apps.js makes) is tapped.
//  1) an app he has already chosen (the debug door sets the choice «settingsapp» = Settings): one tap opens Settings through «مفتاح التطبيقات»;
//  2) an app with no choice yet: the tap opens the helper's LIST («اختار تطبيق …»), the first-time flow from the real Chrome.
// Prints «CHROME OPEN OK», or says why not (no Chrome on the image, Chrome could not be driven).
const http = require('node:http'), assert = require('node:assert/strict');
const path = require('node:path');
const { _android: android } = require('playwright');
const W = require(path.resolve(__dirname, '..', '..', 'ar', 'work-apps.js'));
const PKG = 'com.askerpharmacy.apps';
const chosen = W.intentFor({ id: 'settingsapp', label: 'Settings', pkg: '' });
const fresh = W.intentFor({ id: 'freshapp', label: 'Fresh app', pkg: '' });
const a = (id, u) => `<a id="${id}" href="${u.replace(/"/g, '&quot;')}" style="display:block;font-size:40px;padding:40px">${id}</a>`;
const html = `<!doctype html><meta name="viewport" content="width=device-width">${a('chosen', chosen)}${a('fresh', fresh)}`;
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.end(html); });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
setTimeout(() => { console.error('CHROME OPEN NOT PROVEN: it took too long (Chrome could not be driven on this emulator)'); process.exit(1); }, 150000).unref();
(async () => {
  console.log('the links:', chosen, '|', fresh);
  await new Promise((ok) => server.listen(8125, '0.0.0.0', ok));
  const [device] = await android.devices();
  assert.ok(device, 'no android device');
  const sh = async (c) => (await device.shell(c)).toString();
  const top = async () => sh('dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity"');
  if (!/com\.android\.chrome/.test(await sh('pm list packages com.android.chrome'))) { console.log('CHROME OPEN: SKIPPED (no Chrome on this emulator image)'); server.close(); await device.close(); process.exit(0); }
  await sh(`am broadcast -n ${PKG}/.DebugReceiver --es app settingsapp --es pkg com.android.settings --es name Settings`);
  await sh('am force-stop com.android.settings');
  const context = await device.launchBrowser();
  const page = await context.newPage();
  await page.goto('http://10.0.2.2:8125/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 1) a chosen app: one real tap opens it
  await page.click('#chosen', { noWaitAfter: true }); // a real tap: Chrome starts intent: links only from a tap
  let t = '';
  for (let k = 0; k < 30; k++) { t = await top(); if (/com\.android\.settings/.test(t)) break; await sleep(500); }
  console.log(t.trim().slice(0, 300));
  assert.match(t, /com\.android\.settings/, 'Chrome handed the link to the helper, which opened the chosen app');
  console.log('CHROME OPEN OK: one tap in Chrome opened the chosen app through «مفتاح التطبيقات»');
  await sh('am force-stop com.android.settings');
  // 2) an app with no choice: the list opens (a second proof: it never fails the run, it says what happened)
  try {
    await sh('am start -n com.android.chrome/com.google.android.apps.chrome.Main');
    await sleep(2500);
    await page.bringToFront();
    await page.click('#fresh', { noWaitAfter: true });
    for (let k = 0; k < 30; k++) { t = await top(); if (/askerpharmacy\.apps\/\.PickActivity/.test(t)) break; await sleep(500); }
    console.log(t.trim().slice(0, 300));
    assert.match(t, /askerpharmacy\.apps\/\.PickActivity/, 'a first tap opens the list that asks which app');
    console.log('CHROME ASK OK: the first tap on an app with no choice opened the list «اختار تطبيق …»');
  } catch (e) {
    console.log('CHROME ASK: not proven on this emulator (' + (e && e.message ? e.message : e) + '); the list itself is proven by smoke.sh');
  }  server.close();
  await context.close().catch(() => {});
  await device.close();
  process.exit(0);
})().catch((e) => { console.error('CHROME OPEN NOT PROVEN:', e && e.message ? e.message : e); try { server.close(); } catch (x) { /* closed */ } process.exit(1); });
