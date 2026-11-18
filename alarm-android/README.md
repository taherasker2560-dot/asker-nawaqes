# منبه الدوا (Asker Pharmacy medicine alarm): the customer's Android app

A small app so the dose alarm **rings and says the medicine's name with the app (and the browser) closed**, which a web page cannot do.

- `MainActivity`: a WebView of the pharmacy's own `store.html` (the same alarm editor as the site). Inside it the page finds `window.AskerAndroid` (the `Bridge` class) and hands over the alarms that are ON; the app is what rings.
- `Scheduler` / `AlarmReceiver`: one `AlarmManager.setAlarmClock` for the next dose moment (exact, works in Doze); the next one is set before the ring starts. `BootReceiver` sets it again after a restart, an update or a clock / time-zone change.
- `Ring.kt`: `RingService` (foreground, media playback) says «ميعاد <الاسم> الآن، خدمة مقدمة من صيدلية عسكر» (the server's sound file that the page handed over, else the phone's speech engine, else a tone when the voice is off) up to 3 times, with vibration, for at most 100 seconds; the notification and `RingActivity` (over the lock screen) have «✓ خدته» and «بعد 10 دقايق».
- `Plan.kt`: the pure time math (JUnit: `PlanTest`).
- `Ping.kt` (`AppPing` + `PingJob`, JUnit: `PingTest`): once a day and on an open of the app, ONE call to the server's `ar_app_ping` with a random id (made on the first run) and the version, so the owner's «👥 المستخدمين» screen can count the phones that have the app and see when one stops. No person, name, link, alarm or phone model. A debuggable (test) build never pings.
- The names and times stay on the phone; the app only has the pharmacy's address and the notification / alarm permissions.

Built, tested and published by `.github/workflows/alarm-apk.yml` (JUnit, a signed release, an emulator test that sets an alarm, closes the app and waits for it, and another that drives the page inside the app's WebView). The release APK is `asker-alarm.apk` on the pre-release `alarm-build`; the alarm sheet's button links to it. The signing key lives in the Actions cache (a weekly run keeps it alive): never rebuild with a new key, customers could not update in place.

A debug build (CI only) has a receiver to set an alarm from `adb` and can be pointed at another page address with `--es base <url>`; the release build has neither.
