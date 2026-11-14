package com.askerpharmacy.adam

import android.content.Context

/**
 * What the app knows: the server's address, the public key of the bot's server, and this phone's own device key (64 hex).
 * They are put in once, from the laptop over adb (ControlReceiver); nothing here is built into the app.
 */
object Config {
    const val DEFAULT_BOT = "https://taherasker2560-dot.github.io/asker-nawaqes/asker-nawaqes-arabic.html"

    private fun p(c: Context) = c.getSharedPreferences("adam", Context.MODE_PRIVATE)

    fun url(c: Context): String = p(c).getString("url", "") ?: ""
    fun apiKey(c: Context): String = p(c).getString("api", "") ?: ""
    fun deviceKey(c: Context): String = p(c).getString("key", "") ?: ""
    fun botUrl(c: Context): String = p(c).getString("bot", DEFAULT_BOT) ?: DEFAULT_BOT

    fun ready(c: Context): Boolean = url(c).startsWith("https://") && apiKey(c).isNotEmpty() && deviceKey(c).length == 64

    fun save(c: Context, url: String?, api: String?, key: String?, bot: String?) {
        val e = p(c).edit()
        if (!url.isNullOrBlank()) e.putString("url", url.trim().trimEnd('/'))
        if (!api.isNullOrBlank()) e.putString("api", api.trim())
        if (!key.isNullOrBlank()) e.putString("key", key.trim())
        if (!bot.isNullOrBlank()) e.putString("bot", bot.trim())
        e.apply()
    }
}
