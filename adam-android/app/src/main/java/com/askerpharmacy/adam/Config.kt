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

    /** The voice he chose (the engine's voice name, empty = the phone's default), its pitch (1.0 = normal, lower = deeper) and speed. */
    // the owner's pick (2026-11-15, after hearing the four offline Arabic voices of Google's engine): number 4, a man's voice
    fun voice(c: Context): String = p(c).getString("voice", "ar-xa-x-are-local") ?: "ar-xa-x-are-local"
    fun pitch(c: Context): Float = p(c).getFloat("pitch", 1.0f)
    fun rate(c: Context): Float = p(c).getFloat("rate", 1.0f)

    /**
     * The natural voice (the owner 2026-11-15: «عايز صوت طبيعي زي ما انا بكلمك»; he picked sample 5 = Charon on the fast model): the
     * words are spoken by Gemini's speech model through the bot's server (function asker-voice, with this phone's device key); the
     * phone's own voice above is the fallback when the server or the net is not there.
     */
    fun natural(c: Context): Boolean = p(c).getBoolean("natural", true)
    fun naturalVoice(c: Context): String = p(c).getString("nvoice", "Charon") ?: "Charon"
    fun naturalModel(c: Context): String = p(c).getString("nmodel", "gemini-3.8-flash-lite-tts") ?: "gemini-3.8-flash-lite-tts"
    fun saveNatural(c: Context, on: Boolean?, voice: String?, model: String?) {
        val e = p(c).edit()
        if (on != null) e.putBoolean("natural", on)
        if (!voice.isNullOrBlank() && Regex("^[A-Za-z]{3,24}$").matches(voice.trim())) e.putString("nvoice", voice.trim())
        if (!model.isNullOrBlank() && Regex("^gemini-[a-z0-9.\\-]{0,60}tts[a-z0-9.\\-]{0,30}$").matches(model.trim())) e.putString("nmodel", model.trim())
        e.apply()
    }

    fun saveVoice(c: Context, voice: String?, pitch: Float?, rate: Float?) {
        val e = p(c).edit()
        if (voice != null) e.putString("voice", voice.trim())
        if (pitch != null && pitch in 0.4f..2.0f) e.putFloat("pitch", pitch)
        if (rate != null && rate in 0.5f..2.0f) e.putFloat("rate", rate)
        e.apply()
    }

    fun ready(c: Context): Boolean =url(c).startsWith("https://") && apiKey(c).isNotEmpty() && deviceKey(c).length == 64

    fun save(c: Context, url: String?, api: String?, key: String?, bot: String?) {
        val e = p(c).edit()
        if (!url.isNullOrBlank()) e.putString("url", url.trim().trimEnd('/'))
        if (!api.isNullOrBlank()) e.putString("api", api.trim())
        if (!key.isNullOrBlank()) e.putString("key", key.trim())
        if (!bot.isNullOrBlank()) e.putString("bot", bot.trim())
        e.apply()
    }
}
