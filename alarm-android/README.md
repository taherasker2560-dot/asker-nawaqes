# صيدلية عسكر (Asker Pharmacy): the customer's Android app, the store itself plus the dose alarm that rings with the app closed

A small app so the dose alarm **rings and says the medicine's name with the app (and the browser) closed**, which a web page cannot do.

- `MainActivity`: a WebView of the pharmacy's own `store.html` (owner 2026-11-18, «ب طبعا»: ONE app: the whole store, opened on its home like the site; the alarm sheet is the account's tile, or opens by itself when the app is opened from the site's alarm button, `?sheet=1`). The app's name and icon are the pharmacy's (the old website icon on a phone should be removed). Inside it the page finds `window.AskerAndroid` (the `Bridge` class) and hands over the alarms that are ON; the app is what rings.
- `Scheduler` / `AlarmReceiver`: one `AlarmManager.setAlarmClock` for the next dose moment (exact, works in Doze); the next one is set before the ring starts. `BootReceiver` sets it again after a restart, an update or a clock / time-zone change.
- `Ring.kt`: `RingService` (foreground, media playback) says «ميعاد <الاسم> الآن، خدمة مقدمة من صيدلية عسكر» (the server's sound file that the page handed over, else the phone's speech engine, else a tone when the voice is off) up to 3 times, with vibration, for at most 100 seconds; the notification and `RingActivity` (over the lock screen) have «✓ خدته» and «بعد 10 دقايق».
- `Plan.kt`: the pure time math (JUnit: `PlanTest`).
- The names and times stay on the phone; the app only has the pharmacy's address and the notification / alarm permissions.

Built, tested and published by `.github/workflows/alarm-apk.yml` (JUnit, a signed release, an emulator test that sets an alarm, closes the app and waits for it, and another that drives the page inside the app's WebView). The release APK is `asker-alarm.apk` on the pre-release `alarm-build`; the alarm sheet's button links to it. The signing key lives in the Actions cache (a weekly run keeps it alive): never rebuild with a new key, customers could not update in place.

A debug build (CI only) has a receiver to set an alarm from `adb` and can be pointed at another page address with `--es base <url>`; the release build has neither.

Inside the app the store's «install the app» box is hidden, and the site's account gate (for the installed site) is NOT asked: a credit customer reaches the app with his personal link from the site's app button (the intent link carries ?me= and sheet=1).
