package com.askerpharmacy.adam

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.AlarmClock
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * What Adam does on the phone, from the laptop's answer. Only simple, official Android actions (phase 1): open the bot at a place,
 * open an app, WhatsApp opened on a chat with the text ready (he taps send), call, alarm, timer. The laptop has already checked
 * every action and kept the ones that send or call for the spoken «أيوه»; this only does what it is told.
 */
object Actions {
    // the bot command for an action (ar/adam.js reads them from the address), or null
    fun botCommand(a: JSONObject): String? = when (a.optString("type")) {
        "open_tab" -> "go:" + a.optString("tab")
        "open_customer" -> "cust:" + a.optLong("id")
        "search" -> "find:" + a.optString("q")
        "theme" -> {
            val c = a.optString("color").lowercase(Locale.ROOT)
            val col = if (c.startsWith("#")) "hex-" + c.substring(1) else c
            "theme:" + col + (if (a.has("night")) (if (a.optBoolean("night")) ":n" else ":d") else "")
        }
        "theme_undo" -> "undo"
        else -> null
    }

    /** The bot's address with commands ([cmds] one ?adam=… each). */
    fun botUrl(ctx: Context, cmds: List<String>): String {
        val b = Uri.parse(Config.botUrl(ctx)).buildUpon().clearQuery()
        for (c in cmds.take(4)) b.appendQueryParameter("adam", c)
        return b.build().toString()
    }

    /** The command for the «افتح» button of a reply: its «open» target (tab / customer / search). */
    fun openCommand(open: JSONObject?): String? {
        if (open == null) return null
        return when {
            open.has("tab") -> "go:" + open.optString("tab")
            open.has("customer") -> "cust:" + open.optLong("customer")
            open.has("q") -> "find:" + open.optString("q")
            else -> null
        }
    }

    private fun launch(ctx: Context, i: Intent): Boolean {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try { ctx.startActivity(i); true } catch (e: Throwable) { false }
    }

    /**
     * An address opened the way he wants: in his installed bot app (the home-screen web app «نواقص عربي», a Chrome WebAPK whose
     * scope covers the address), not in whatever browser the phone has (owner 2026-11-15: «بقول لها افتح لي النواقص بتفتح لي
     * ابلكيشن تاني»: it opened Firefox). If that app is not installed: Chrome, else the phone's choice.
     */
    fun viewIntent(ctx: Context, url: String): Intent {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)
        try {
            val pm = ctx.packageManager
            val handlers = pm.queryIntentActivities(i, PackageManager.MATCH_ALL)
            val app = handlers.firstOrNull { it.activityInfo.packageName.startsWith("org.chromium.webapk") }?.activityInfo?.packageName
            if (app != null) {
                i.setPackage(app)
            } else if (handlers.any { it.activityInfo.packageName == "com.android.chrome" }) {
                i.setPackage("com.android.chrome")
            }
        } catch (e: Throwable) { }
        return i
    }

    private val aliases = mapOf(
        "واتساب" to "whatsapp", "الواتس" to "whatsapp", "واتس" to "whatsapp", "الكاميرا" to "camera", "كاميرا" to "camera",
        "الصور" to "gallery", "المعرض" to "gallery", "الاعدادات" to "settings", "الإعدادات" to "settings", "اعدادات" to "settings",
        "كروم" to "chrome", "المتصفح" to "chrome", "الخرائط" to "maps", "خرائط" to "maps", "يوتيوب" to "youtube", "الحاسبة" to "calculator",
        "الآلة الحاسبة" to "calculator", "الساعة" to "clock", "المنبه" to "clock", "التليفون" to "phone", "الهاتف" to "phone", "الرسائل" to "messages",
        "جيميل" to "gmail", "البريد" to "gmail", "تليجرام" to "telegram", "فيسبوك" to "facebook", "ماسنجر" to "messenger"
    )

    private fun openApp(ctx: Context, name: String): Boolean {
        val pm = ctx.packageManager
        val q = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val want = (aliases[name.trim()] ?: name).lowercase(Locale.ROOT).trim()
        val list = pm.queryIntentActivities(q, 0)
        val hit = list.firstOrNull { it.loadLabel(pm).toString().lowercase(Locale.ROOT) == want }
            ?: list.firstOrNull { it.loadLabel(pm).toString().lowercase(Locale.ROOT).contains(want) }
            ?: list.firstOrNull { it.activityInfo.packageName.lowercase(Locale.ROOT).contains(want) }
            ?: return false
        val i = pm.getLaunchIntentForPackage(hit.activityInfo.packageName) ?: return false
        return launch(ctx, i)
    }

    private fun whatsapp(ctx: Context, phone: String, text: String): Boolean {
        val u = Uri.parse("https://wa.me/" + phone.filter { it.isDigit() } + "?text=" + Uri.encode(text))
        val i = Intent(Intent.ACTION_VIEW, u)
        // the WhatsApp app itself, when it is on the phone
        try {
            ctx.packageManager.getPackageInfo("com.whatsapp", 0)
            i.setPackage("com.whatsapp")
        } catch (e: Throwable) { }
        return launch(ctx, i)
    }

    private fun call(ctx: Context, phone: String): Boolean {
        val uri = Uri.parse("tel:+" + phone.filter { it.isDigit() })
        val granted = ctx.checkSelfPermission(android.Manifest.permission.CALL_PHONE) == android.content.pm.PackageManager.PERMISSION_GRANTED
        return launch(ctx, Intent(if (granted) Intent.ACTION_CALL else Intent.ACTION_DIAL, uri))
    }

    private fun alarm(ctx: Context, a: JSONObject): Boolean {
        val i = Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, a.optInt("hour"))
            .putExtra(AlarmClock.EXTRA_MINUTES, a.optInt("minute"))
            .putExtra(AlarmClock.EXTRA_MESSAGE, a.optString("label"))
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        return launch(ctx, i)
    }

    private fun timer(ctx: Context, a: JSONObject): Boolean {
        val i = Intent(AlarmClock.ACTION_SET_TIMER)
            .putExtra(AlarmClock.EXTRA_LENGTH, a.optInt("seconds"))
            .putExtra(AlarmClock.EXTRA_MESSAGE, a.optString("label"))
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        return launch(ctx, i)
    }

    /** Does the actions; returns the address of the bot if any of them was for the bot (the «افتح» button uses it too). */
    fun run(ctx: Context, list: JSONArray?): String? {
        if (list == null) return null
        val botCmds = ArrayList<String>()
        for (n in 0 until list.length()) {
            val a = list.optJSONObject(n) ?: continue
            val cmd = botCommand(a)
            if (cmd != null) { botCmds.add(cmd); continue }
            when (a.optString("type")) {
                "open_app" -> openApp(ctx, a.optString("name"))
                "whatsapp" -> whatsapp(ctx, a.optString("phone"), a.optString("text"))
                "call" -> call(ctx, a.optString("phone"))
                "alarm" -> alarm(ctx, a)
                "timer" -> timer(ctx, a)
            }
        }
        if (botCmds.isEmpty()) return null
        val url = botUrl(ctx, botCmds)
        launch(ctx, viewIntent(ctx, url))
        return url
    }

    fun openUrl(ctx: Context, url: String): Boolean = launch(ctx, viewIntent(ctx, url))
}
