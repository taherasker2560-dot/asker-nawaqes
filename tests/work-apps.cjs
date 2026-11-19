// «📱 تطبيقات الشغل» (owner 2026-11-19, ar/work-apps.js): the links that open his work apps on Android (through «مفتاح التطبيقات», which asks him once which app on his phone),
// the computer's way, the trade name for an app's search, the sentences under a tap, and that the home buttons (ar/shortcuts.js) and the order screen (ar/order-drafts.js)
// name the same apps. His 11-19 test: WhatsApp Business opened nothing (its link had no «/?») and Ibn Sina opened another app (a package guessed from the web): no package is guessed now.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
global.window = global;
const W = require('../ar/work-apps.js');
const S = require('../ar/shortcuts.js');

// the seven apps he named, each once
assert.deepEqual(W.APPS.map((a) => a.id), ['wab', 'cams', 'ibnsina', 'pharma', 'drugeye', 'doses', 'instapay']);
assert.deepEqual(W.APPS.map((a) => a.label), ['واتساب بيزنس', 'الكاميرات', 'ابن سينا', 'فارما', 'دراج آي', 'الجرعات', 'إنستا باي']);
// no package is guessed from the web: only WhatsApp Business's is certain; the rest is chosen on his phone
assert.deepEqual(W.APPS.filter((a) => a.pkg).map((a) => [a.id, a.pkg]), [['wab', 'com.whatsapp.w4b']]);
const fb = (u) => encodeURIComponent(u);
// every app goes through the helper with its id and name; the helper's download is the fallback (a phone without it)
const APK = 'https://github.com/taherasker2560-dot/asker-nawaqes/releases/download/apps-build/asker-apps.apk';
assert.equal(W.intentFor(W.BY_ID.ibnsina), `intent://open?app=ibnsina&name=${encodeURIComponent('ابن سينا')}#Intent;scheme=askerapps;package=com.askerpharmacy.apps;S.browser_fallback_url=${fb(APK)};end`);
assert.equal(W.intentFor(W.BY_ID.cams), `intent://open?app=cams&name=${encodeURIComponent('الكاميرات')}#Intent;scheme=askerapps;package=com.askerpharmacy.apps;S.browser_fallback_url=${fb(APK)};end`);
// WhatsApp Business: its certain package rides along (the first version of the helper opens it by that), and its store page is the fallback
assert.equal(W.intentFor(W.BY_ID.wab), `intent://open?app=wab&name=${encodeURIComponent('واتساب بيزنس')}&pkg=com.whatsapp.w4b#Intent;scheme=askerapps;package=com.askerpharmacy.apps;S.browser_fallback_url=${fb('https://play.google.com/store/apps/details?id=com.whatsapp.w4b')};end`);
assert.equal(W.intentFor({ id: 'Bad Id', label: 'x' }), '', 'never a link from a broken id');
assert.equal(W.intentFor(null), '');
assert.ok(!/;end[^$]/.test(W.intentFor(W.BY_ID.drugeye)) && !/\s/.test(W.intentFor(W.BY_ID.drugeye)), 'no spaces in the link');
// what a tap does: on the phone the link; on a computer WhatsApp Web, the others «على الموبايل بس»; an unknown id says so
for (const a of W.APPS) assert.deepEqual(W.plan(a.id, true), { url: W.intentFor(a) }, 'every app opens on a phone: ' + a.id);
assert.deepEqual(W.plan('wab', false), { url: 'https://web.whatsapp.com/', web: true });
assert.deepEqual(W.plan('instapay', false), { say: W.TEXTS.phoneOnly });
assert.deepEqual(W.plan('nope', true), { say: W.TEXTS.unknown });
// the sentences under a tap (each its own sentence for the English engine)
assert.deepEqual(W.note(W.plan('drugeye', true), true, 'اسم الصنف', 'دراج آي'), ['✅ اتنسخ اسم الصنف.', 'دراج آي بيفتح.', 'الصق جوه التطبيق.']);
assert.deepEqual(W.note(W.plan('wab', true), null, '', 'واتساب بيزنس'), ['واتساب بيزنس بيفتح.']);
assert.deepEqual(W.note(W.plan('ibnsina', true), false, 'الطلبية', 'ابن سينا'), ['مقدرتش أنسخ، انسخ بإيدك.', 'ابن سينا بيفتح.']);
assert.deepEqual(W.note(W.plan('wab', false), null, '', 'واتساب بيزنس'), ['واتساب بيزنس اتفتح.']);
assert.deepEqual(W.note(W.plan('instapay', false), true, 'المبلغ', 'إنستا باي'), ['✅ اتنسخ المبلغ.', 'التطبيق ده على الموبايل بس.']);
// «مفتاح التطبيقات» (apps-android/): its package, release and manifest agree with the page
assert.equal(W.KEY_PKG, 'com.askerpharmacy.apps');
assert.equal(W.KEY_APK, APK);
const gradle = fs.readFileSync(path.join(__dirname, '..', 'apps-android', 'app', 'build.gradle.kts'), 'utf8');
assert.match(gradle, new RegExp('applicationId = "' + W.KEY_PKG.replace(/\./g, '\\.') + '"'));
const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'apps-apk.yml'), 'utf8');
assert.match(wf, /gh release upload apps-build asker-apps\.apk/);
const manifest = fs.readFileSync(path.join(__dirname, '..', 'apps-android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
assert.match(manifest, /android:scheme="askerapps" android:host="open"/, 'the helper takes the link the page makes');
assert.match(manifest, /\.PickActivity/, 'and asks which app, once');
// the helper's own certain package is the same one the page sends
const open = fs.readFileSync(path.join(__dirname, '..', 'apps-android', 'app', 'src', 'main', 'java', 'com', 'askerpharmacy', 'apps', 'Open.kt'), 'utf8');
assert.match(open, /"wab" to listOf\("com\.whatsapp\.w4b"\)/);
// the trade name for an app's search box
assert.equal(W.brandOf('CONCOR 5MG 30TAB'), 'CONCOR');
assert.equal(W.brandOf('MELLITOFIX TRIO 25/5/1000 TAB'), 'MELLITOFIX TRIO');
assert.equal(W.brandOf('DEPOVIT B12 1000MCG 5A'), 'DEPOVIT');
assert.equal(W.brandOf('  123 EXTRA  TAB '), '123 EXTRA TAB', 'starts with a digit: the whole name');
assert.equal(W.brandOf(''), '');
// the home buttons name the same apps, in the group «تطبيقات الشغل»
const appRows = S.ALL.filter((x) => x[6]);
assert.deepEqual(appRows.map((x) => x[6]), W.APPS.map((a) => a.id));
for (const x of appRows) { assert.equal(x[1], W.BY_ID[x[6]].label); assert.equal(x[2], 'تطبيقات الشغل'); assert.equal(S.APP_OF[x[0]], x[6]); }
// the order screen's suppliers exist there (ar/order-drafts.js)
const od = fs.readFileSync(path.join(__dirname, '..', 'ar', 'order-drafts.js'), 'utf8');
for (const [sup, app] of Object.entries(W.ORDER_APP)) { assert.ok(new RegExp('\\b' + sup + ':').test(od), 'a supplier of the orders: ' + sup); assert.ok(W.BY_ID[app]); }
// English
require('../ar/i18n-en.js'); require('../ar/i18n.js');
const I = global.AskerI18n; I._use(global.AskerEN);
for (const a of W.APPS) assert.notEqual(I.translate(a.label), a.label, 'English: ' + a.label);
assert.equal(I.translate('تطبيقات الشغل'), 'Work apps');
for (const k of ['phoneOnly', 'unknown', 'paste', 'noCopy', 'keyHint']) assert.notEqual(I.translate(W.TEXTS[k]), W.TEXTS[k], 'English: ' + k);
assert.equal(I.translate(W.TEXTS.keyLink), 'Download «Apps key»');
assert.equal(I.translate('✅ اتنسخ المبلغ.'), '✅ Amount copied.');
assert.equal(I.translate('دراج آي بيفتح.'), 'Drug Eye is opening.');
for (const s of ['👁️ دراج آي', '🧮 الجرعات', '💳 انسخ المبلغ وافتح إنستا باي', '📋 انسخ وافتح تطبيق ابن سينا', '📋 انسخ وافتح تطبيق فارما']) assert.notEqual(I.translate(s), s, 'English: ' + s);
console.log('work-apps ok');
