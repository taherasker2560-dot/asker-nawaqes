package com.askerpharmacy.adam

import android.media.AudioFormat
import android.speech.tts.SynthesisCallback
import android.speech.tts.SynthesisRequest
import android.speech.tts.TextToSpeech
import android.speech.tts.TextToSpeechService
import android.speech.tts.Voice
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.Future

/**
 * «Adam's voice» as a text-to-speech ENGINE of the phone (the owner 2026-11-15: «عايز صوت طبيعي … سواء اللي بينطق من البوت او سواء ادم»).
 * The bot speaks through Tasker's «Say» steps (the announcements of «نواقص اتحدثت» and «وارد»). Choosing this engine in a Say step
 * (Engine: Voice → آدم) makes it speak with the same natural voice as Adam, with no other change in Tasker. Since 2026-11-15 the owner
 * chose it as the phone's PREFERRED engine, so every Tasker announcement uses it.
 * The sentences come from the bot's server (Natural.kt, the same cache and the same voice); a long text is cut at sentence ends
 * and the pieces are fetched together, then played in order. No net / no server / no credit: the phone's Google voice says it, so
 * an announcement is never lost.
 */
class AdamTtsService : TextToSpeechService() {
    companion object { const val VOICE = "adam-natural" }
    @Volatile private var stopped = false
    private val pool = Executors.newFixedThreadPool(3)

    // The phone's Google voice, used ONLY when the natural voice cannot be had (no net, server down, Gemini credit empty), so a
    // bot announcement is never lost (2026-11-15: this engine is now the phone's preferred one; before, such a step said nothing).
    private var google: TextToSpeech? = null
    @Volatile private var googleReady = false

    override fun onCreate() {
        super.onCreate()
        try {
            google = TextToSpeech(applicationContext, { st ->
                val g = google
                if (st == TextToSpeech.SUCCESS && g != null) {
                    var r = g.setLanguage(Locale("ar", "EG"))
                    if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) r = g.setLanguage(Locale("ar"))
                    try { val want = Config.voice(applicationContext); if (want.isNotEmpty()) g.voices?.firstOrNull { it.name == want }?.let { g.voice = it } } catch (e: Throwable) { }
                    googleReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED
                }
            }, "com.google.android.tts")
        } catch (e: Throwable) { google = null }
    }

    /** [text] in the phone's Google voice, as a WAV file (null when that voice is not there either). Waits at most 20 s. */
    private fun googleWav(text: String): File? {
        val g = google ?: return null
        if (!googleReady) return null
        val f = File(cacheDir, "fallback_" + System.nanoTime() + ".wav")
        val id = java.util.UUID.randomUUID().toString()
        val latch = java.util.concurrent.CountDownLatch(1)
        var ok = false
        g.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) { if (utteranceId == id) { ok = true; latch.countDown() } }
            override fun onError(utteranceId: String?) { if (utteranceId == id) latch.countDown() }
        })
        if (g.synthesizeToFile(text, android.os.Bundle(), f, id) != TextToSpeech.SUCCESS) return null
        latch.await(20, java.util.concurrent.TimeUnit.SECONDS)
        return if (ok && f.length() > 44) f else { f.delete(); null }
    }

    private fun ok(lang: String?) = lang != null && (lang.equals("ara", true) || lang.equals("ar", true))

    override fun onIsLanguageAvailable(lang: String?, country: String?, variant: String?): Int {
        if (!ok(lang)) return TextToSpeech.LANG_NOT_SUPPORTED
        return if (country.isNullOrEmpty()) TextToSpeech.LANG_AVAILABLE else TextToSpeech.LANG_COUNTRY_AVAILABLE
    }
    override fun onGetLanguage(): Array<String> = arrayOf("ara", "EGY", "")
    override fun onLoadLanguage(lang: String?, country: String?, variant: String?): Int = onIsLanguageAvailable(lang, country, variant)

    override fun onGetVoices(): List<Voice> = listOf(Voice(VOICE, Locale("ar", "EG"), Voice.QUALITY_VERY_HIGH, Voice.LATENCY_NORMAL, true, emptySet()))
    override fun onIsValidVoiceName(name: String?): Int = if (name == VOICE) TextToSpeech.SUCCESS else TextToSpeech.ERROR
    override fun onLoadVoice(name: String?): Int = onIsValidVoiceName(name)
    override fun onGetDefaultVoiceNameFor(lang: String?, country: String?, variant: String?): String =
        if (ok(lang)) VOICE else ""

    override fun onStop() { stopped = true }

    /** Sentences cut at their ends, each piece at most Natural.MAX characters. */
    private fun pieces(text: String): List<String> {
        val t = text.replace(Regex("\\s+"), " ").trim()
        if (t.length <= Natural.MAX) return if (t.isEmpty()) emptyList() else listOf(t)
        val out = ArrayList<String>()
        var cur = StringBuilder()
        for (s in t.split(Regex("(?<=[.!?؟،:؛])\\s+"))) {
            if (cur.isNotEmpty() && cur.length + s.length + 1 > Natural.MAX) { out.add(cur.toString()); cur = StringBuilder() }
            var rest = s
            while (rest.length > Natural.MAX) { out.add(rest.take(Natural.MAX)); rest = rest.drop(Natural.MAX) }
            if (cur.isNotEmpty()) cur.append(' ')
            cur.append(rest)
        }
        if (cur.isNotEmpty()) out.add(cur.toString())
        return out.take(8)
    }

    override fun onSynthesizeText(request: SynthesisRequest, callback: SynthesisCallback) {
        stopped = false
        val text = Titles.strip((request.charSequenceText ?: request.text ?: "").toString())   // no title or name (owner 2026-11-15)
        val parts = pieces(text)
        if (parts.isEmpty()) { callback.done(); return }
        if (!ok(request.language)) { callback.error(); return }
        // all pieces are asked for at once; the first one is played as soon as it is there
        val jobs: List<Future<File?>> = parts.map { p -> pool.submit(java.util.concurrent.Callable<File?> { Natural.file(applicationContext, p) }) }
        var started = false
        var startedRate = 0
        var useGoogle = false   // once a piece is in Google's voice, the rest is too (one voice and one rate per announcement)
        for ((i, j) in jobs.withIndex()) {
            if (stopped) { jobs.forEach { it.cancel(true) }; callback.done(); return }
            var f = if (useGoogle) { j.cancel(true); null } else try { j.get() } catch (e: Throwable) { null }
            var fallback = false
            if (f == null || f.length() <= 44) { f = googleWav(parts[i]); fallback = f != null; if (fallback && !started) useGoogle = true }   // the announcement is still said
            val wav = if (f != null) try { f.readBytes() } catch (e: Throwable) { null } else null
            if (fallback) f?.delete()
            if (wav == null || wav.size <= 44) {
                if (!started) { callback.error(); return }
                continue
            }
            val rate = (wav[24].toInt() and 0xff) or ((wav[25].toInt() and 0xff) shl 8) or ((wav[26].toInt() and 0xff) shl 16)
            if (!started) {
                startedRate = if (rate in 8000..48000) rate else 24000
                callback.start(startedRate, AudioFormat.ENCODING_PCM_16BIT, 1)
                started = true
            } else if (rate != startedRate) continue   // one audio stream has one rate: a piece made at another rate is skipped
            val max = callback.maxBufferSize.coerceAtLeast(1024)
            var off = 44
            while (off < wav.size) {
                if (stopped) { callback.done(); return }
                val n = minOf(max, wav.size - off)
                if (callback.audioAvailable(wav, off, n) != TextToSpeech.SUCCESS) { return }
                off += n
            }
        }
        callback.done()
    }

    override fun onDestroy() {
        pool.shutdownNow()
        try { google?.shutdown() } catch (e: Throwable) { }
        super.onDestroy()
    }
}
