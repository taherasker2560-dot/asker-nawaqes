package com.askerpharmacy.adam

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * The natural voice: a sentence turned into a WAV by the bot's server (function asker-voice, Gemini's speech model), with this phone's
 * device key. A sentence heard before is kept on the phone (the same words, voice and model = the same file), so the usual short lines
 * («فتحت النواقص») play at once. Blocking: call from a background thread. Returns null when the server or the net is not there: the
 * caller then uses the phone's own voice.
 */
object Natural {
    const val MAX = 480
    private const val KEEP = 120

    private fun sha1(s: String): String =
        MessageDigest.getInstance("SHA-1").digest(s.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    private fun dir(ctx: Context): File = File(ctx.cacheDir, "voice").also { it.mkdirs() }

    fun file(ctx: Context, text: String, log: (String) -> Unit = {}): File? {
        val t = text.replace(Regex("\\s+"), " ").trim()
        if (t.isEmpty() || t.length > MAX || !Config.ready(ctx)) return null
        val model = Config.naturalModel(ctx)
        val voice = Config.naturalVoice(ctx)
        val f = File(dir(ctx), sha1("$model|$voice|$t") + ".wav")
        if (f.length() > 1000) { f.setLastModified(System.currentTimeMillis()); return f }
        val t0 = System.currentTimeMillis()
        val c = try { URL(Config.url(ctx) + "/functions/v1/asker-voice").openConnection() as HttpURLConnection } catch (e: Exception) { return null }
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 5000
            c.readTimeout = 12000
            c.doOutput = true
            c.setRequestProperty("x-adam-key", Config.deviceKey(ctx))
            c.setRequestProperty("apikey", Config.apiKey(ctx))
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            val body = JSONObject().put("text", t).put("voice", voice).put("model", model)
            c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            if (c.responseCode != 200) { log("natural voice: server said " + c.responseCode); return null }
            val bytes = c.inputStream.use { it.readBytes() }
            if (bytes.size < 1000 || bytes[0] != 'R'.code.toByte() || bytes[1] != 'I'.code.toByte()) { log("natural voice: not a WAV"); return null }
            val tmp = File(f.parentFile, f.name + ".tmp")
            tmp.writeBytes(bytes)
            if (!tmp.renameTo(f)) { tmp.delete(); return null }
            log("natural voice: " + t.length + " chars in " + (System.currentTimeMillis() - t0) + " ms")
            prune(ctx)
            return f
        } catch (e: Exception) {
            log("natural voice failed: " + e.javaClass.simpleName)
            return null
        } finally {
            c.disconnect()
        }
    }

    private fun prune(ctx: Context) {
        try {
            val all = dir(ctx).listFiles()?.sortedByDescending { it.lastModified() } ?: return
            for (x in all.drop(KEEP)) x.delete()
        } catch (e: Exception) { }
    }
}
