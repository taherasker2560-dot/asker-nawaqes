package com.askerpharmacy.alarm

import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.media.AudioManager
import android.os.PowerManager
import org.json.JSONArray
import java.util.TimeZone
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Base64
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * The app's one screen: the pharmacy's own alarm page (store.html) in a WebView, so the customer sets his medicines and times exactly as on the site. What the page sets is handed to this app
 * (AskerAndroid.setAlarms), which is the one that rings: with the app closed, the screen off, or the phone restarted. Nothing but the pharmacy's own address opens inside it.
 */
class MainActivity : Activity() {
    companion object {
        const val HOST = "taherasker2560-dot.github.io"
        const val BASE = "https://taherasker2560-dot.github.io/asker-nawaqes/store.html"
        private val LINK = Regex("^[0-9a-f]{64}$")
    }

    private lateinit var web: WebView
    // «لازم تحدّث»: the full screen over the page while a newer version is published (the alarms keep ringing without the page)
    private lateinit var gate: UpdateGate
    private var updating = false
    private var installing = false
    private var wantInstall = false
    // the page's address: always the pharmacy's own; only a debug build (the CI test) may be pointed somewhere else, with --es base <url>
    private var base = BASE
    private var baseHost = HOST
    private val debuggable: Boolean get() = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (debuggable) WebView.setWebContentsDebuggingEnabled(true)
        web = WebView(this)
        setContentView(web)
        gate = UpdateGate(this)
        addContentView(gate.view, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        gate.onTap = { startUpdate() }
        gate.onBrowser = { try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(AppUpdate.APK_URL))) } catch (e: Exception) { /* no browser */ } }
        AppUpdate.listener = { runOnUiThread { updating = false; installing = false; gate.busy(false); gate.status(AppUpdate.errorText("install")) } }
        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.allowFileAccess = false
        s.allowContentAccess = false
        s.mediaPlaybackRequiresUserGesture = false
        s.userAgentString = s.userAgentString + " AskerAlarmApp/1"
        web.addJavascriptInterface(Bridge(this), "AskerAndroid")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == HOST || request.url.host == baseHost) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (e: Exception) { /* no app for it */ }
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) offline()
            }
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 7)
        }
        load(intent, true)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        load(intent, false)
    }

    override fun onResume() {
        super.onResume()
        Scheduler.reschedule(this)   // whatever happened while the app was closed, the next alarm is set
        VoiceJob.schedule(this)      // and any sentence sound that is still missing is asked for
        AppPing.kick(this)           // and, once a day, the pharmacy's server is told a phone has the app (a random id + the version, nothing else)
        if (installing) { installing = false; updating = false; gate.busy(false); gate.status("") }   // back from Android's confirm screen without the app being replaced: the button is there again
        gateRefresh()                // a newer version already known: the screen covers the page at once
        AppUpdate.kick(this) { runOnUiThread { gateRefresh() } }   // and the published version file is read again when it is time
        if (wantInstall && AppUpdate.canInstall(this)) { wantInstall = false; startUpdate() }   // back from «allow installs from this app»
    }

    override fun onDestroy() {
        AppUpdate.listener = null
        super.onDestroy()
    }

    private fun gateRefresh() {
        gate.show(AppUpdate.required(this), Store(this).latestName)
    }

    /** the big button: download the file, check it, hand it to Android's installer (its own confirm screen); the first time Android's «allow from this app» page comes first */
    private fun startUpdate() {
        if (updating) return
        if (!AppUpdate.canInstall(this)) {
            wantInstall = true
            gate.status("أندرويد هيسألك مرة واحدة: اسمح بالتثبيت من التطبيق ده، وبعدها ارجع واضغط «حدّث دلوقتي» تاني.")
            AppUpdate.openInstallSettings(this)
            return
        }
        updating = true
        gate.busy(true)
        gate.status("جاري التنزيل…")
        val ctx = applicationContext
        Thread {
            val file = AppUpdate.download(ctx) { pct -> runOnUiThread { gate.status("جاري التنزيل… $pct%") } }
            runOnUiThread {
                if (file == null) {
                    updating = false
                    gate.busy(false)
                    gate.status(AppUpdate.errorText(AppUpdate.lastError))
                } else if (AppUpdate.install(this, file)) {
                    installing = true
                    gate.status("أكّد التحديث في شاشة أندرويد.")
                } else {
                    updating = false
                    gate.busy(false)
                    gate.status(AppUpdate.errorText("install"))
                }
            }
        }.start()
    }

    /** the link that opened the app may carry the customer's personal link (?me=) and the alarms he made in the browser: kept for the page to take over once */
    private fun load(i: Intent?, first: Boolean) {
        val d: Uri? = i?.data
        val me = d?.getQueryParameter("me")?.takeIf { LINK.matches(it) }
        val alarms = i?.getStringExtra("alarms")
        if (!alarms.isNullOrEmpty() && alarms.length < 20_000) Store(this).seed = alarms
        val other = if (debuggable) i?.getStringExtra("base") else null
        if (other != null) {
            base = other
            baseHost = Uri.parse(other).host ?: HOST
        }
        if (debuggable) {   // CI only: `--ei fake_latest N` says «the newest published version is N» (the test reads no network), 0 = nothing newer
            val fake = i?.getIntExtra("fake_latest", -1) ?: -1
            if (fake >= 0) {
                Store(this).latestCode = fake
                gateRefresh()
            }
        }
        if (first || other != null || me != null || !alarms.isNullOrEmpty()) web.loadUrl(base + (if (me != null) "?me=$me" else ""))
    }

    private fun offline() {
        web.loadDataWithBaseURL(
            null,
            "<html dir='rtl'><body style='font-family:sans-serif;text-align:center;padding:48px 20px;color:#222'><h2 style='color:#C0522A'>⏰ منبه الدوا</h2>" +
                "<p>مفيش إنترنت دلوقتي. المنبهات اللي ضبطتها قبل كده <b>بترن عادي</b> حتى من غير نت.</p>" +
                "<p>عشان تضيف أو تعدّل منبه، اتصل بالنت وبعدين:</p><p><a href='$base' style='color:#C0522A;font-size:20px'>جرّب تاني</a></p></body></html>",
            "text/html", "utf-8", null,
        )
    }

    @Deprecated("the system's back button")
    override fun onBackPressed() {
        if (gate.visible) { finish(); return }   // the update screen is on top: back leaves the app
        // the page closes its editor first; a back on its list leaves the app
        web.evaluateJavascript("(window.AskerStoreAlarm&&window.AskerStoreAlarm.appBack&&window.AskerStoreAlarm.appBack())?'1':'0'") { r ->
            if (r != "\"1\"") finish()
        }
    }
}

/** What the page (store/alarm.js) can ask of the app. Nothing here reads anything of the customer's: it only schedules alarms and keeps sound files. */
class Bridge(private val act: Activity) {
    private val st = Store(act)

    @JavascriptInterface fun version(): String = "1"

    /** {"speak":true,"items":[{"id","spoken","times":["08:00"]}]}: the alarms that are ON */
    @JavascriptInterface fun setAlarms(json: String): Boolean {
        val ok = st.setFromPage(json)
        if (ok) {
            st.seed = ""
            Scheduler.reschedule(act)
            VoiceJob.schedule(act)
        }
        return ok
    }

    @JavascriptInterface fun seed(): String = st.seed

    @JavascriptInterface fun hasVoice(name: String): Boolean = st.hasVoice(name)

    @JavascriptInterface fun saveVoice(name: String, base64: String): Boolean = try {
        st.saveVoice(name, Base64.decode(base64, Base64.DEFAULT))
    } catch (e: Exception) {
        false
    }

    @JavascriptInterface fun status(): String {
        val nm = act.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val fullScreen = if (Build.VERSION.SDK_INT >= 34) nm.canUseFullScreenIntent() else true
        val pm = act.getSystemService(Context.POWER_SERVICE) as PowerManager
        return JSONObject().put("v", 1).put("notifications", nm.areNotificationsEnabled()).put("fullScreen", fullScreen).put("sdk", Build.VERSION.SDK_INT)
            .put("battery", pm.isIgnoringBatteryOptimizations(act.packageName))
            .put("maker", Build.MANUFACTURER)
            .put("needsAutostart", Vendor.needsAutostart(Build.MANUFACTURER))
            .put("selftest", SelfTest.state(st, System.currentTimeMillis()))
            .toString()
    }

    /** «جرّب منبه حقيقي»: a real alarm clock about a minute ahead (15 seconds in a debug build, the CI test), to see whether this phone lets it wake the app */
    @JavascriptInterface fun selfTest() {
        val debuggable = (act.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        SelfTest.start(act, if (debuggable) 15_000L else SelfTest.WAIT_MS)
    }

    /** "notifications" | "fullScreen" | "battery" | "autostart": the question or the settings page for it */
    @JavascriptInterface fun ask(kind: String) {
        act.runOnUiThread {
            try {
                if (kind == "battery") {
                    Vendor.askBattery(act)
                } else if (kind == "autostart") {
                    Vendor.openAutostart(act)
                } else if (kind == "notifications") {
                    if (Build.VERSION.SDK_INT >= 33 && act.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        act.requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 7)
                    } else {
                        act.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, act.packageName))
                    }
                } else if (kind == "fullScreen" && Build.VERSION.SDK_INT >= 34) {
                    act.startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + act.packageName)))
                }
            } catch (e: Exception) {
                // the settings page is not there on this phone
            }
        }
    }

    /** «جرّب المنبه»: a real ring now, the same one a dose time makes */
    @JavascriptInterface fun testRing() {
        Store(act).log("جرّبت المنبه من الشاشة")
        Ring.start(act, listOf("تجربة المنبه"), listOf("test"))
    }

    /** the test ring (or any ring) can be stopped from the page: «⏹ وقّف الرنين» */
    @JavascriptInterface fun stopRing() {
        act.startService(Intent(act, RingService::class.java).setAction(Ring.ACTION_TOOK).putStringArrayListExtra("ids", ArrayList(RingService.ringIds)))
    }

    @JavascriptInterface fun ringing(): Boolean = RingService.running

    /** the phone's battery list for this app: a phone that «optimizes» the app may hold its alarms back */
    @JavascriptInterface fun openBattery() {
        act.runOnUiThread {
            try {
                act.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            } catch (e: Exception) {
                try { act.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + act.packageName))) } catch (x: Exception) { /* no settings page */ }
            }
        }
    }

    /** «🔍 فحص المنبه»: what this phone says about everything the ring needs (read by the page and written in plain Arabic) */
    @JavascriptInterface fun diag(): String {
        val ctx = act.applicationContext
        val o = JSONObject()
        try {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val au = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            val st = Store(ctx)
            val alarms = st.alarms()
            val next = Plan.next(alarms, st.snoozes(), System.currentTimeMillis(), TimeZone.getDefault())
            val names = alarms.map { it.spoken }.distinct()
            o.put("version", ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName)
            o.put("latest", st.latestCode)
            o.put("sdk", Build.VERSION.SDK_INT)
            o.put("model", Build.MANUFACTURER + " " + Build.MODEL)
            o.put("now", System.currentTimeMillis())
            o.put("notifications", nm.areNotificationsEnabled())
            o.put("exact", if (Build.VERSION.SDK_INT >= 31) am.canScheduleExactAlarms() else true)
            o.put("alarms", alarms.size)
            o.put("nextOurs", next?.at ?: 0L)
            o.put("nextSystem", am.nextAlarmClock?.triggerTime ?: 0L)
            o.put("alarmVol", au.getStreamVolume(AudioManager.STREAM_ALARM))
            o.put("alarmMax", au.getStreamMaxVolume(AudioManager.STREAM_ALARM))
            o.put("musicVol", au.getStreamVolume(AudioManager.STREAM_MUSIC))
            o.put("ringer", au.ringerMode)
            o.put("dnd", nm.currentInterruptionFilter)
            o.put("battery", pm.isIgnoringBatteryOptimizations(ctx.packageName))
            o.put("selftest", SelfTest.state(st, System.currentTimeMillis()))
            o.put("speak", st.speak)
            o.put("names", names.size)
            o.put("voices", names.count { st.hasVoice(it) })
            o.put("log", JSONArray(st.ringLog()))
        } catch (e: Exception) {
            o.put("error", e.javaClass.simpleName)
        }
        return o.toString()
    }

    @JavascriptInterface fun close() {
        act.runOnUiThread { act.finish() }
    }
}
