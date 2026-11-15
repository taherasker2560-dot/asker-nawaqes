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

    private fun clean(text: String) = text.replace(Regex("\\s+"), " ").trim()
    // «v2»: lines kept before 2026-11-15 were made with an English style line in front, which the voice sometimes read aloud
    private fun cacheFile(ctx: Context, t: String) = File(dir(ctx), sha1(Config.naturalModel(ctx) + "|" + Config.naturalVoice(ctx) + "|v2|" + t) + ".wav")

    /** The sentence's WAV if it is already on the phone (a line heard before), else null. */
    fun cached(ctx: Context, text: String): File? {
        val t = clean(text)
        if (t.isEmpty()) return null
        val f = cacheFile(ctx, t)
        if (f.length() > 1000) { f.setLastModified(System.currentTimeMillis()); return f }
        return null
    }

    /** Keeps a sentence that was just played from the stream, so it plays at once next time. */
    fun saveWav(ctx: Context, text: String, rate: Int, pcm: ByteArray) {
        try {
            val t = clean(text)
            if (t.isEmpty() || pcm.size < 1000) return
            val h = java.nio.ByteBuffer.allocate(44).order(java.nio.ByteOrder.LITTLE_ENDIAN)
            h.put("RIFF".toByteArray()).putInt(36 + pcm.size).put("WAVE".toByteArray()).put("fmt ".toByteArray())
                .putInt(16).putShort(1).putShort(1).putInt(rate).putInt(rate * 2).putShort(2).putShort(16)
                .put("data".toByteArray()).putInt(pcm.size)
            val f = cacheFile(ctx, t)
            val tmp = File(f.parentFile, f.name + ".tmp")
            tmp.outputStream().use { it.write(h.array()); it.write(pcm) }
            if (!tmp.renameTo(f)) tmp.delete()
            prune(ctx)
        } catch (e: Exception) { }
    }

    /**
     * The sentence as it is made: the server sends the raw 16-bit mono PCM while Gemini makes it, so the phone starts speaking after
     * about a second instead of after the whole sentence. [sink] gets (rate, bytes, count) for every piece and returns false to stop.
     * Returns true when some audio came; false when none did (the caller uses the phone's own voice).
     */
    fun stream(ctx: Context, text: String, log: (String) -> Unit, sink: (Int, ByteArray, Int) -> Boolean): Boolean {
        val t = clean(text)
        if (t.isEmpty() || t.length > MAX || !Config.ready(ctx)) return false
        val t0 = System.currentTimeMillis()
        val c = try { URL(Config.url(ctx) + "/functions/v1/asker-voice").openConnection() as HttpURLConnection } catch (e: Exception) { return false }
        var got = false
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 5000
            c.readTimeout = 12000
            c.doOutput = true
            c.setRequestProperty("x-adam-key", Config.deviceKey(ctx))
            c.setRequestProperty("apikey", Config.apiKey(ctx))
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            // style "" = the words only: an instruction in front of them was read aloud once
            val body = JSONObject().put("text", t).put("voice", Config.naturalVoice(ctx)).put("model", Config.naturalModel(ctx)).put("style", "").put("stream", true)
            c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            if (c.responseCode != 200) { log("natural voice (stream): server said " + c.responseCode); return false }
            val rate = c.getHeaderField("X-Voice-Rate")?.toIntOrNull() ?: 24000
            val inp = c.inputStream
            val buf = ByteArray(8192)
            while (true) {
                val n = inp.read(buf)
                if (n < 0) break
                if (n == 0) continue
                if (!got) log("natural voice (stream): first sound after " + (System.currentTimeMillis() - t0) + " ms")
                got = true
                if (!sink(rate, buf, n)) return got
            }
            log("natural voice (stream): " + t.length + " chars, all in " + (System.currentTimeMillis() - t0) + " ms")
            return got
        } catch (e: Exception) {
            log("natural voice (stream) failed: " + e.javaClass.simpleName)
            return got
        } finally {
            c.disconnect()
        }
    }

    fun file(ctx: Context, text: String, log: (String) -> Unit = {}): File? {
        val t = clean(text)
        if (t.isEmpty() || t.length > MAX || !Config.ready(ctx)) return null
        val model = Config.naturalModel(ctx)
        val voice = Config.naturalVoice(ctx)
        val f = cacheFile(ctx, t)
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
            val body = JSONObject().put("text", t).put("voice", voice).put("model", model).put("style", "")
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
