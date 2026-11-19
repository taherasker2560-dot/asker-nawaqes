# «مفتاح التطبيقات» (apps-android)

The owner's small Android app (owner 2026-11-19, «أ، اعمله»). The system's «📱 تطبيقات الشغل» buttons (`ar/work-apps.js`) open his work apps
(Ibn Sina, Pharma, Drug Eye, doses, InstaPay, cameras). A web page cannot start another app's own screen: Chrome only starts links an app agreed to
take. So the page hands this app the package, `intent://open?pkg=<package>#Intent;scheme=askerapps;package=com.askerpharmacy.apps;S.browser_fallback_url=<the app's Google Play page>;end`,
and `OpenActivity` (no screen) starts that package's own launcher screen (`getLaunchIntentForPackage`), or its store page when it is missing. One tap.
A phone without this app follows the fallback (the Google Play page, whose «فتح» opens the app): nothing breaks.

- No internet, no permissions, no data: it only starts an app's usual first screen. `<queries>` = apps with a launcher icon only.
- Built, tested (JUnit + an Android 14 emulator: the link opens Settings; the REAL Chrome tap does the same) and published by `.github/workflows/apps-apk.yml`
  to the pre-release `apps-build` as `asker-apps.apk` (the sheet «✏️ عدّل الزراير» links to it on Android).
- One signing key for every build, kept in the Actions cache `apps-keystore-v1` (a weekly run keeps it): a lost key = uninstall and install again.
- Every release must raise `versionCode` / `versionName` in `app/build.gradle.kts`.
