package com.askerpharmacy.alarm

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInstaller
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * The app updates itself (owner 2026-11-19: «مش هقعد أقول للمستخدمين خد الرابط حدّث … لما يفتح التطبيق يلاقي إن في تحديث مطلوب عشان يعرف يشتغل»).
 * The build publishes asker-alarm.json ({"code","name","size","sha256"}) next to asker-alarm.apk; the app reads it (once in 6 hours and on an open) and, when its own
 * versionCode is smaller, covers its screen with «لازم تحدّث» + one button: it downloads the file, checks it, and hands it to Android's own installer (one confirm tap there;
 * the first time Android also asks «allow installs from this app»). The ALARMS keep ringing while the update waits: a medicine alarm is never held back.
 * A debug build (the CI emulator) never reads the network.
 */
object AppUpdate {
    private const val BASE = "https://github.com/taherasker2560-dot/asker-nawaqes/releases/download/alarm-build/"
    const val INFO_URL = BASE + "asker-alarm.json"
    const val APK_URL = BASE + "asker-alarm.apk"
    const val ACTION_RESULT = "com.askerpharmacy.alarm.INSTALL_RESULT"

    /** the file is read again after 6 hours; a failed try waits 10 minutes */
    const val CHECK_EVERY_MS = 6L * 3_600_000
    const val RETRY_MS = 10L * 60_000
    private const val MAX_APK = 40L * 1024 * 1024

    class Info(val code: Int, val name: String, val size: Long, val sha256: String)

    private val CODE = Regex("\"code\"\\s*:\\s*(\\d{1,9})")
    private val NAME = Regex("\"name\"\\s*:\\s*\"([0-9A-Za-z._-]{1,20})\"")
    private val SIZE = Regex("\"size\"\\s*:\\s*(\\d{1,10})")
    private val SHA = Regex("\"sha256\"\\s*:\\s*\"([0-9a-f]{64})\"")

    /** the published version file (any spacing of the JSON); null when it has no code */
    fun parse(text: String): Info? {
        val code = CODE.find(text)?.groupValues?.get(1)?.toIntOrNull() ?: return null
        val name = NAME.find(text)?.groupValues?.get(1) ?: ""
        val size = SIZE.find(text)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        val sha = SHA.find(text)?.groupValues?.get(1) ?: ""
        return Info(code, name, size, sha)
    }

    fun newer(latest: Int, installed: Int): Boolean = latest > installed

    /** 6 hours since the last good read AND 10 minutes since the last try; a clock that went back never blocks it */
    fun checkDue(lastOk: Long, lastTry: Long, now: Long): Boolean =
        (lastOk > now || now - lastOk >= CHECK_EVERY_MS) && (lastTry > now || now - lastTry >= RETRY_MS)

    /** a few short Arabic words for the screen's status line, whatever the reason */
    fun errorText(code: String): String = when (code) {
        "net" -> "مفيش إنترنت أو الاتصال ضعيف. اتصل بالنت وجرّب تاني."
        "corrupt" -> "الملف اتبوّظ في التنزيل. جرّب تاني."
        "disk" -> "مفيش مساحة كفاية في الموبايل. فضّي شوية وجرّب تاني."
        "install" -> "التحديث ما كملش. جرّب تاني."
        else -> "حصلت مشكلة. جرّب تاني."
    }

    private fun debuggable(ctx: Context): Boolean = (ctx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

    @Suppress("DEPRECATION")
    fun installedCode(ctx: Context): Int = try {
        val p = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        if (Build.VERSION.SDK_INT >= 28) p.longVersionCode.toInt() else p.versionCode
    } catch (e: Exception) {
        0
    }

    /** true when the newest published version is newer than this app (from what the last read kept) */
    fun required(ctx: Context): Boolean = newer(Store(ctx).latestCode, installedCode(ctx))

    /** reads the version file when it is time (blocking: never on the main thread); true = nothing more to do now */
    fun checkIfDue(context: Context): Boolean {
        val ctx = context.applicationContext
        if (debuggable(ctx)) return true
        val st = Store(ctx)
        val now = System.currentTimeMillis()
        if (!checkDue(st.updateOk, st.updateTry, now)) return true
        st.updateTry = now
        val found: Info? = try {
            val c = URL(INFO_URL).openConnection() as HttpURLConnection
            c.connectTimeout = 10_000
            c.readTimeout = 15_000
            if (c.responseCode == 200) parse(String(c.inputStream.use { it.readBytes() }, Charsets.UTF_8).take(2000)) else null
        } catch (e: Exception) {
            null
        }
        val info = found ?: return false
        st.setLatest(info)
        st.updateOk = now
        return true
    }

    /** the read in the background; [then] runs after it (the screen looks again) */
    fun kick(context: Context, then: () -> Unit = {}) {
        val ctx = context.applicationContext
        Thread {
            try { checkIfDue(ctx) } catch (e: Exception) { /* the next open reads again */ }
            then()
        }.start()
    }

    @Volatile var lastError: String = ""

    /** the file into the app's cache, checked against the published size and sha-256 (null + [lastError] when it did not work) */
    fun download(context: Context, progress: (Int) -> Unit): File? {
        val ctx = context.applicationContext
        val st = Store(ctx)
        val dir = File(ctx.cacheDir, "update").also { it.mkdirs() }
        val part = File(dir, "asker-alarm.apk.part")
        val out = File(dir, "asker-alarm.apk")
        part.delete()
        out.delete()
        try {
            val c = URL(APK_URL).openConnection() as HttpURLConnection
            c.connectTimeout = 15_000
            c.readTimeout = 30_000
            if (c.responseCode != 200) { lastError = "net"; return null }
            val total = if (c.contentLengthLong > 0) c.contentLengthLong else st.latestSize
            if (total > MAX_APK) { lastError = "corrupt"; return null }
            val md = MessageDigest.getInstance("SHA-256")
            var done = 0L
            var last = -1
            c.inputStream.use { input ->
                part.outputStream().use { o ->
                    val buf = ByteArray(32 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        o.write(buf, 0, n)
                        md.update(buf, 0, n)
                        done += n
                        if (done > MAX_APK) { part.delete(); lastError = "corrupt"; return null }
                        if (total > 0) {
                            val pct = (done * 100 / total).toInt().coerceIn(0, 100)
                            if (pct != last) { last = pct; progress(pct) }
                        }
                    }
                }
            }
            val hex = md.digest().joinToString("") { "%02x".format(it) }
            if (done < 100_000 || (st.latestSha.isNotEmpty() && hex != st.latestSha)) {
                part.delete()
                st.updateOk = 0L   // the published file may be a newer one than the version we read: read it again at the next open
                lastError = "corrupt"
                return null
            }
            if (!part.renameTo(out)) { lastError = "disk"; return null }
            return out
        } catch (e: Exception) {
            part.delete()
            lastError = "net"
            return null
        }
    }

    fun canInstall(ctx: Context): Boolean = try { ctx.packageManager.canRequestPackageInstalls() } catch (e: Exception) { false }

    /** Android's «allow installs from this app» page (once) */
    fun openInstallSettings(ctx: Context) {
        try {
            ctx.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.packageName)))
        } catch (e: Exception) {
            // no such page on this phone
        }
    }

    /** the screen listens while it is open: "failed" (the install was cancelled or did not finish) so the button comes back */
    @Volatile var listener: ((String) -> Unit)? = null

    /** hands the file to Android's own installer; the answer comes to [InstallReceiver] (the confirm screen is Android's) */
    fun install(context: Context, apk: File): Boolean {
        return try {
            val ctx = context.applicationContext
            val pi = ctx.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(ctx.packageName)
            if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            val id = pi.createSession(params)
            pi.openSession(id).use { s ->
                apk.inputStream().use { input ->
                    s.openWrite("asker-alarm.apk", 0, apk.length()).use { out ->
                        input.copyTo(out)
                        s.fsync(out)
                    }
                }
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                val pending = PendingIntent.getBroadcast(ctx, id, Intent(ctx, InstallReceiver::class.java).setAction(ACTION_RESULT), flags)
                s.commit(pending.intentSender)
            }
            true
        } catch (e: Exception) {
            Store(context).log("التحديث: ما قدرش يبدأ التثبيت (" + e.javaClass.simpleName + ")")
            false
        }
    }
}

/** Android's answer about the install: the confirm screen to show, a cancel, a failure (a success restarts the app, the boot receiver sets the alarms again) */
class InstallReceiver : BroadcastReceiver() {
    @Suppress("DEPRECATION")
    private fun confirmIntent(intent: Intent): Intent? =
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java) else intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)

    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val st = Store(context)
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            val confirm = confirmIntent(intent)
            if (confirm != null) {
                try {
                    context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    return
                } catch (e: Exception) {
                    st.log("التحديث: شاشة التأكيد ما فتحتش")
                }
            }
            AppUpdate.listener?.invoke("failed")
        } else if (status == PackageInstaller.STATUS_SUCCESS) {
            st.log("التحديث اتثبّت")
        } else {
            st.log("التحديث ما كملش: " + (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: status.toString()).take(60))
            AppUpdate.listener?.invoke("failed")
        }
    }
}

/**
 * The full screen over the app while an update is required: one clear sentence and ONE big button. Built in code (no layout file); MainActivity puts it on top of the page.
 * The browser link is the way out when the phone refuses the in-app install (a blocked install, no room): the same file, opened by the browser.
 */
class UpdateGate(private val ctx: Context) {
    private fun dp(v: Int): Int = (v * ctx.resources.displayMetrics.density).toInt()

    private val title = TextView(ctx)
    private val body = TextView(ctx)
    private val note = TextView(ctx)
    private val button = Button(ctx)
    private val link = TextView(ctx)
    val view = LinearLayout(ctx)

    /** the big button was tapped */
    var onTap: () -> Unit = {}

    /** «نزّله من المتصفح» was tapped */
    var onBrowser: () -> Unit = {}

    init {
        view.orientation = LinearLayout.VERTICAL
        view.gravity = Gravity.CENTER
        view.setBackgroundColor(Color.WHITE)
        view.setPadding(dp(28), dp(28), dp(28), dp(28))
        view.layoutDirection = View.LAYOUT_DIRECTION_RTL
        view.isClickable = true
        view.isFocusable = true
        view.contentDescription = "update-gate"
        view.visibility = View.GONE

        title.text = "🔄 لازم تحدّث «منبه الدوا»"
        title.textSize = 24f
        title.setTextColor(Color.parseColor("#C0522A"))
        title.gravity = Gravity.CENTER
        title.setPadding(0, 0, 0, dp(14))

        body.textSize = 17f
        body.setTextColor(Color.parseColor("#222222"))
        body.gravity = Gravity.CENTER
        body.setPadding(0, 0, 0, dp(26))

        button.text = "🔄 حدّث دلوقتي"
        button.textSize = 20f
        button.setTextColor(Color.WHITE)
        button.isAllCaps = false
        button.contentDescription = "update-gate-button"
        val bg = GradientDrawable()
        bg.setColor(Color.parseColor("#C0522A"))
        bg.cornerRadius = dp(14).toFloat()
        button.background = bg
        button.setPadding(dp(28), dp(16), dp(28), dp(16))
        button.setOnClickListener { onTap() }

        note.textSize = 15f
        note.setTextColor(Color.parseColor("#555555"))
        note.gravity = Gravity.CENTER
        note.setPadding(0, dp(18), 0, 0)

        link.text = "مش راضي يتحدّث؟ نزّله من المتصفح"
        link.textSize = 15f
        link.setTextColor(Color.parseColor("#C0522A"))
        link.gravity = Gravity.CENTER
        link.setPadding(0, dp(30), 0, 0)
        link.setOnClickListener { onBrowser() }

        for (v in listOf<View>(title, body, button, note, link)) view.addView(v)
    }

    val visible: Boolean get() = view.visibility == View.VISIBLE

    /** [need]: show or hide; [name]: the new version's name (may be empty) */
    fun show(need: Boolean, name: String) {
        body.text = (if (name.isNotEmpty()) "فيه نسخة جديدة ($name). " else "فيه نسخة جديدة. ") +
            "لازم تحدّث التطبيق عشان يشتغل تمام.\nالمنبهات اللي ضبطتها هتفضل ترن لحد ما تحدّث."
        view.visibility = if (need) View.VISIBLE else View.GONE
    }

    fun status(text: String) {
        note.text = text
    }

    fun busy(on: Boolean) {
        button.isEnabled = !on
        button.alpha = if (on) 0.5f else 1f
    }
}
