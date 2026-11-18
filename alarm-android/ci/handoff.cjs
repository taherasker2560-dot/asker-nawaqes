// CI only: the website's hand-off door on a REAL Android (the emulator). The page opens an Android intent link (askeralarm://handoff) from the customer's tap; here the same link is started
// with `am start`, which is exactly what Chrome does with an intent: link. The app must take the alarms with no screen, set the system alarm, keep the site's own copy as the seed for its page,
// and get the sentence sound file BY ITSELF from the pharmacy's voice function (the site hands over names and times, never sound).
const assert = require('node:assert/strict');
const { _android: android } = require('playwright');
const PKG = 'com.askerpharmacy.alarm';
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
(async () => {
  const [device] = await android.devices();
  assert.ok(device, 'no android device');
  const sh = async (c) => (await device.shell(c)).toString();
  await sh(`pm clear ${PKG}`);
  const payload = {
    app: { speak: true, items: [{ id: 'h1', spoken: 'Pemojet', times: ['07:30'] }] },
    page: { v: 1, speak: true, items: [{ id: 'h1', name: 'Pemojet 40 mg', say: '', times: ['07:30'], on: true }] },
  };
  const uri = 'intent://handoff#Intent;scheme=askeralarm;package=' + PKG + ';S.alarms=' + encodeURIComponent(JSON.stringify(payload)) + ';end';
  const out = await sh(`am start -W "${uri}"`);
  console.log(out.trim());
  assert.doesNotMatch(out, /Error|Exception|does not exist/i, 'the hand-off door opened');
  let prefs = '';
  for (let k = 0; k < 30; k++) { prefs = await sh(`run-as ${PKG} cat shared_prefs/asker_alarm.xml`); if (/Pemojet/.test(prefs)) break; await sleep(500); }
  console.log(prefs);
  assert.match(prefs, /Pemojet/, 'the app took the alarm');
  assert.match(prefs, /07:30/);
  assert.match(prefs, /Pemojet 40 mg/, 'the site\'s own copy is kept as the seed of the app\'s page');
  assert.match(await sh('dumpsys alarm'), /com\.askerpharmacy\.alarm\.FIRE/, 'the system has the alarm clock');
  const top = await sh('dumpsys activity activities');
  assert.doesNotMatch(top.split('\n').filter((l) => /topResumedActivity|mResumedActivity/.test(l)).join('\n'), /HandoffActivity/, 'the door shows no screen');
  // the app gets the sound by itself (a sentence the server made before comes from its cache at once)
  let voices = '';
  for (let k = 0; k < 120; k++) { voices = await sh(`run-as ${PKG} ls files/voice`); if (/\.wav/.test(voices)) break; await sleep(1000); }
  console.log('voice files:', voices.trim() || '(none)');
  prefs = await sh(`run-as ${PKG} cat shared_prefs/asker_alarm.xml`);
  console.log((prefs.match(/<string name="ringlog">[^<]*/) || ['(no log)'])[0]);
  assert.match(voices, /\.wav/, 'the app asked the pharmacy\'s voice function itself and kept the sound');
  assert.match(prefs, /وصلت منبهات من الموقع/, 'the log says the alarms came from the site');
  console.log('HANDOFF OK: the alarms came over an intent link with no screen, and the app fetched the sound itself');
  await device.close();
  process.exit(0);   // (the adb connection keeps node alive otherwise: this is what hung the first CI run)
})().catch((e) => { console.error('HANDOFF FAILED', e); process.exit(1); });
