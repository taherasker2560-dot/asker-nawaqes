package com.askerpharmacy.alarm

import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Base64
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
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
                if (request.url.host == HOST) return false
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
    }

    /** the link that opened the app may carry the customer's personal link (?me=) and the alarms he made in the browser: kept for the page to take over once */
    private fun load(i: Intent?, first: Boolean) {
        val d: Uri? = i?.data
        val me = d?.getQueryParameter("me")?.takeIf { LINK.matches(it) }
        val alarms = i?.getStringExtra("alarms")
        if (!alarms.isNullOrEmpty() && alarms.length < 20_000) Store(this).seed = alarms
        if (first || me != null || !alarms.isNullOrEmpty()) web.loadUrl(BASE + (if (me != null) "?me=$me" else ""))
    }

    private fun offline() {
        web.loadDataWithBaseURL(
            null,
            "<html dir='rtl'><body style='font-family:sans-serif;text-align:center;padding:48px 20px;color:#222'><h2 style='color:#C0522A'>⏰ منبه الدوا</h2>" +
                "<p>مفيش إنترنت دلوقتي. المنبهات اللي ضبطتها قبل كده <b>بترن عادي</b> حتى من غير نت.</p>" +
                "<p>عشان تضيف أو تعدّل منبه، اتصل بالنت وبعدين:</p><p><a href='$BASE' style='color:#C0522A;font-size:20px'>جرّب تاني</a></p></body></html>",
            "text/html", "utf-8", null,
        )
    }

    @Deprecated("the system's back button")
    override fun onBackPressed() {
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
        return JSONObject().put("v", 1).put("notifications", nm.areNotificationsEnabled()).put("fullScreen", fullScreen).put("sdk", Build.VERSION.SDK_INT).toString()
    }

    /** "notifications" | "fullScreen": the question or the settings page for it */
    @JavascriptInterface fun ask(kind: String) {
        act.runOnUiThread {
            try {
                if (kind == "notifications") {
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
        Ring.start(act, listOf("تجربة المنبه"), listOf("test"))
    }

    @JavascriptInterface fun close() {
        act.runOnUiThread { act.finish() }
    }
}
