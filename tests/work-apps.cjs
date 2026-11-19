// «📱 تطبيقات الشغل» (owner 2026-11-19, ar/work-apps.js): the links that open his work apps on Android, the computer's way, the trade name for an app's search,
// the sentences under a tap, and that the home buttons (ar/shortcuts.js) and the order screen (ar/order-drafts.js) name the same apps.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
global.window = global;
const W = require('../ar/work-apps.js');
const S = require('../ar/shortcuts.js');

// the seven apps he named, each once
assert.deepEqual(W.APPS.map((a) => a.id), ['wab', 'cams', 'ibnsina', 'pharma', 'drugeye', 'doses', 'instapay']);
assert.deepEqual(W.APPS.map((a) => a.label), ['واتساب بيزنس', 'الكاميرات', 'ابن سينا', 'فارما', 'دراج آي', 'الجرعات', 'إنستا باي']);
for (const a of W.APPS) if (a.pkg) assert.match(a.pkg, /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i, 'a real package name: ' + a.id);
// WhatsApp Business takes a link: it opens straight, and a phone without it goes to its store page
assert.equal(W.intentFor(W.BY_ID.wab), 'intent://send#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.whatsapp.w4b;end');
// an app that takes no link: its Google Play page (Android's own «فتح» starts it)
assert.equal(W.intentFor(W.BY_ID.drugeye), 'intent://open?pkg=com.phycod.drugeye#Intent;scheme=askerapps;package=com.askerpharmacy.apps;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.phycod.drugeye;end');
assert.equal(W.intentFor({ pkg: 'bad name' }), '', 'never a link from a broken package name');
assert.equal(W.intentFor({ pkg: 'com.x.y', link: 'javascript:alert(1)' }), 'intent://open?pkg=com.x.y#Intent;scheme=askerapps;package=com.askerpharmacy.apps;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.x.y;end', 'only a scheme:// link is used');
// what a tap does: on the phone a link; on a computer WhatsApp Web, the others «على الموبايل بس»; an app not known yet says so
assert.deepEqual(W.plan('drugeye', true), { url: 'intent://open?pkg=com.phycod.drugeye#Intent;scheme=askerapps;package=com.askerpharmacy.apps;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.phycod.drugeye;end', straight: false });
assert.equal(W.plan('wab', true).straight, true);
assert.deepEqual(W.plan('wab', false), { url: 'https://web.whatsapp.com/', web: true });
assert.deepEqual(W.plan('instapay', false), { say: W.TEXTS.phoneOnly });
assert.deepEqual(W.plan('nope', true), { say: W.TEXTS.unknown });
for (const a of W.APPS) if (!a.pkg) assert.deepEqual(W.plan(a.id, true), { say: W.TEXTS.unknown }, 'not known yet: ' + a.id);
// the sentences under a tap (each its own sentence for the English engine)
assert.deepEqual(W.note(W.plan('drugeye', true), true, 'اسم الصنف', 'دراج آي'), ['✅ اتنسخ اسم الصنف.', 'دراج آي بيفتح.', 'الصق جوه التطبيق.']);
assert.deepEqual(W.note(W.plan('wab', true), null, '', 'واتساب بيزنس'), ['واتساب بيزنس اتفتح.']);
assert.deepEqual(W.note(W.plan('ibnsina', true), false, 'الطلبية', 'ابن سينا'), ['مقدرتش أنسخ، انسخ بإيدك.', 'ابن سينا بيفتح.']);
assert.deepEqual(W.note(W.plan('instapay', false), true, 'المبلغ', 'إنستا باي'), ['✅ اتنسخ المبلغ.', 'التطبيق ده على الموبايل بس.']);
// «مفتاح التطبيقات» (apps-android/): the helper the non-link apps go through; its download is the workflow's release file; its package is the Android project's
assert.equal(W.KEY_PKG, 'com.askerpharmacy.apps');
assert.equal(W.KEY_APK, 'https://github.com/taherasker2560-dot/asker-nawaqes/releases/download/apps-build/asker-apps.apk');
const gradle = fs.readFileSync(path.join(__dirname, '..', 'apps-android', 'app', 'build.gradle.kts'), 'utf8');
assert.match(gradle, new RegExp('applicationId = "' + W.KEY_PKG.replace(/\./g, '\\.') + '"'));
const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'apps-apk.yml'), 'utf8');
assert.match(wf, /gh release upload apps-build asker-apps\.apk/);
const manifest = fs.readFileSync(path.join(__dirname, '..', 'apps-android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
assert.match(manifest, /android:scheme="askerapps" android:host="open"/, 'the helper takes the link the page makes');
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
for (const k of ['phoneOnly', 'unknown', 'paste', 'noCopy']) assert.notEqual(I.translate(W.TEXTS[k]), W.TEXTS[k], 'English: ' + k);
assert.equal(I.translate('✅ اتنسخ المبلغ.'), '✅ Amount copied.');
assert.equal(I.translate('دراج آي بيفتح.'), 'Drug Eye is opening.');
assert.notEqual(I.translate(W.TEXTS.keyHint), W.TEXTS.keyHint);
assert.equal(I.translate(W.TEXTS.keyLink), 'Download «Apps key»');
for (const s of ['👁️ دراج آي', '🧮 الجرعات', '💳 انسخ المبلغ وافتح إنستا باي', '📋 انسخ وافتح تطبيق ابن سينا', '📋 انسخ وافتح تطبيق فارما']) assert.notEqual(I.translate(s), s, 'English: ' + s);
console.log('work-apps ok');
