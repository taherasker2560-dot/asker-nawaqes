package com.askerpharmacy.alarm

import android.app.Activity
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Making the phone let the alarm through, for a customer who will never look for settings (owner 2026-11-18, a Redmi Note 13: the alarm never woke the app until «التشغيل التلقائي»
 * was on and the battery was «بدون قيود», and he said: «عايز حاجة في متناول المستخدم الغبي»). The page shows one big button per missing step; this is what the buttons open.
 */
object Vendor {
    /** the screens where each maker hides «let this app start by itself»; tried one by one (a maker moves them between versions) */
    fun autostartTargets(manufacturer: String): List<Pair<String, String>> {
        val m = manufacturer.lowercase()
        return when {
            listOf("xiaomi", "redmi", "poco", "blackshark").any { it in m } -> listOf(
                "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
                "com.miui.securitycenter" to "com.miui.powercenter.PowerSettings",
            )
            listOf("huawei", "honor").any { it in m } -> listOf(
                "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
                "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
            )
            listOf("oppo", "realme", "oneplus").any { it in m } -> listOf(
                "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
                "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
                "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
            )
            listOf("vivo", "iqoo").any { it in m } -> listOf(
                "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
                "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
            )
            else -> emptyList()
        }
    }

    fun needsAutostart(manufacturer: String): Boolean = autostartTargets(manufacturer).isNotEmpty()

    /** opens the first screen of the maker that exists; else this app's own settings page. true = one of the maker's own screens opened */
    fun openAutostart(act: Activity): Boolean {
        for ((pkg, cls) in autostartTargets(Build.MANUFACTURER)) {
            try {
                act.startActivity(Intent().setComponent(ComponentName(pkg, cls)))
                return true
            } catch (e: Exception) {
                // not on this version: the next one
            }
        }
        try {
            act.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + act.packageName)))
        } catch (e: Exception) {
            // no settings page
        }
        return false
    }

    /** «اضغط وبعدين سماح»: the system's own question «always run in the background?» (the battery list when the phone has no such question) */
    fun askBattery(act: Activity) {
        try {
            act.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + act.packageName)))
        } catch (e: Exception) {
            try {
                act.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            } catch (x: Exception) {
                // no battery page
            }
        }
    }
}

/**
 * «جرّب منبه حقيقي»: the app sets a real alarm clock about a minute ahead, exactly as a dose time does. If the phone wakes the app with it the test is ok (and it rings, so the customer
 * hears it); if the time passes and nothing came, the phone is blocking the alarm and the page says so. The phone's own verdict, with nobody guessing.
 */
object SelfTest {
    const val ACTION = "com.askerpharmacy.alarm.SELFTEST"
    const val WAIT_MS = 75_000L
    private const val GRACE_MS = 40_000L

    fun start(ctx: Context, delayMs: Long) {
        val at = System.currentTimeMillis() + delayMs
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val fire = PendingIntent.getBroadcast(ctx, 3, Intent(ctx, SelfTestReceiver::class.java).setAction(ACTION), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val show = PendingIntent.getActivity(ctx, 4, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), fire)
        val st = Store(ctx)
        st.selftestAt = at
        st.selftestState = "pending"
        st.log("تجربة حقيقية: المنبه هيضرب بعد ${delayMs / 1000} ثانية")
    }

    /** "none" | "pending" | "ok" | "failed" (its time passed and the app was never woken) */
    fun state(st: Store, now: Long): String = when (st.selftestState) {
        "ok" -> "ok"
        "pending" -> if (now > st.selftestAt + GRACE_MS) "failed" else "pending"
        else -> "none"
    }
}

class SelfTestReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val ctx = context.applicationContext
        val st = Store(ctx)
        st.selftestState = "ok"
        st.log("التجربة الحقيقية: المنبه صحّى التطبيق")
        Ring.start(ctx, listOf("تجربة المنبه"), listOf("selftest"))
    }
}
