package com.askerpharmacy.adam

import android.media.AudioFormat
import android.speech.tts.SynthesisCallback
import android.speech.tts.SynthesisRequest
import android.speech.tts.TextToSpeech
import android.speech.tts.TextToSpeechService
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Callable
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * «Adam's voice» as a text-to-speech ENGINE of the phone (the owner 2026-11-15: «عايز صوت طبيعي … سواء اللي بينطق من البوت او سواء ادم»).
 *
 * He made it the phone's PREFERRED engine, so every app that speaks asks it. It then works as a doorman:
 *  - Tasker («Say» steps = the bot's announcements), the AutoApps and Adam itself, in ARABIC: the natural voice of the bot's server
 *    (Natural.kt; numbers and units made Egyptian, no title: Egyptian.kt / Titles.kt). A sentence the natural voice cannot make
 *    (no net, server down, no credit) is said in the phone's Google voice instead of nothing.
 *  - Every other app (navigation, the call-name reader, TalkBack, ...) and every other language: the phone's own Google voice, as
 *    if this engine was not there (no delay, no cost, no change of voice).
 * Every request is written to files/engine.log (who asked, which voice, how long; never the words), so a «strange voice» can be
 * traced to its cause at once.
 */
class AdamTtsService : TextToSpeechService() {
    companion object {
        const val VOICE = "adam-natural"
        // who gets the natural voice: Tasker (the bot's announcements), the AutoApps of the same author, and Adam's own app
        private val NATURAL_CALLERS = listOf("net.dinglisch.android.", "com.joaomgcd.", "com.askerpharmacy.adam")
    }

    @Volatile private var stopped = false
    private val pool = Executors.newFixedThreadPool(3)

    // the phone's own voice (Google's engine; named explicitly, so this engine can never end up calling itself)
    private var google: TextToSpeech? = null
    @Volatile private var googleUp = false
    private val googleInit = CountDownLatch(1)
    private val localeCache = HashMap<String, Locale?>()
    @Volatile private var cur: Array<String> = arrayOf("ara", "EGY", "")

    override fun onCreate() {
        super.onCreate()
        try {
            google = TextToSpeech(applicationContext, { st ->
                googleUp = st == TextToSpeech.SUCCESS
                googleInit.countDown()
            }, "com.google.android.tts")
        } catch (e: Throwable) {
            google = null
            googleInit.countDown()
        }
    }

    /** The Google engine once it is connected (waits up to 3 s the first time), or null. */
    private fun awaitGoogle(): TextToSpeech? {
        try { googleInit.await(3, TimeUnit.SECONDS) } catch (e: InterruptedException) { }
        return if (googleUp) google else null
    }

    private fun elog(m: String) {
        try {
            val f = File(filesDir, "engine.log")
            if (f.length() > 100_000) f.delete()
            f.appendText(SimpleDateFormat("MM-dd HH:mm:ss", Locale.US).format(Date()) + "  " + m + "\n")
        } catch (e: Throwable) { }
    }

    // ---------- languages and voices: Arabic is ours, the rest is what Google's engine has ----------
    private fun ok(lang: String?) = lang != null && (lang.equals("ara", true) || lang.equals("ar", true))

    /** A Locale for the engine's ISO-3 codes («eng», «USA»), or null. */
    private fun localeOf(lang: String?, country: String?): Locale? {
        if (lang.isNullOrEmpty()) return null
        val key = lang + "|" + (country ?: "")
        val found: Locale? = synchronized(localeCache) {
            if (localeCache.containsKey(key)) localeCache[key] else findLocale(lang, country).also { localeCache[key] = it }
        }
        return found
    }

    private fun findLocale(lang: String, country: String?): Locale? {
        if (lang.length == 2) return Locale(lang, country ?: "")
        var langOnly: Locale? = null
        for (l in Locale.getAvailableLocales()) {
            try {
                if (!l.getISO3Language().equals(lang, true)) continue
                if (country.isNullOrEmpty()) return Locale(l.language)
                if (langOnly == null) langOnly = Locale(l.language)
                if (l.getISO3Country().equals(country, true)) return l
            } catch (e: Exception) { }
        }
        return langOnly
    }

    override fun onIsLanguageAvailable(lang: String?, country: String?, variant: String?): Int {
        if (ok(lang)) return if (country.isNullOrEmpty()) TextToSpeech.LANG_AVAILABLE else TextToSpeech.LANG_COUNTRY_AVAILABLE
        val g = awaitGoogle() ?: return TextToSpeech.LANG_NOT_SUPPORTED
        val loc = localeOf(lang, country) ?: return TextToSpeech.LANG_NOT_SUPPORTED
        return try { g.isLanguageAvailable(loc) } catch (e: Throwable) { TextToSpeech.LANG_NOT_SUPPORTED }
    }

    override fun onGetLanguage(): Array<String> = cur

    override fun onLoadLanguage(lang: String?, country: String?, variant: String?): Int {
        val r = onIsLanguageAvailable(lang, country, variant)
        if (r >= TextToSpeech.LANG_AVAILABLE) cur = arrayOf(lang ?: "", country ?: "", variant ?: "")
        return r
    }

    private fun ours() = Voice(VOICE, Locale("ar", "EG"), Voice.QUALITY_VERY_HIGH, Voice.LATENCY_NORMAL, true, emptySet())

    private fun googleVoice(name: String?): Voice? {
        if (name.isNullOrEmpty()) return null
        return try { awaitGoogle()?.voices?.firstOrNull { it.name == name } } catch (e: Throwable) { null }
    }

    override fun onGetVoices(): List<Voice> {
        val out = ArrayList<Voice>()
        out.add(ours())
        try { awaitGoogle()?.voices?.let { out.addAll(it) } } catch (e: Throwable) { }
        return out
    }

    override fun onIsValidVoiceName(name: String?): Int =
        if (name == VOICE || googleVoice(name) != null) TextToSpeech.SUCCESS else TextToSpeech.ERROR

    override fun onLoadVoice(name: String?): Int = onIsValidVoiceName(name)

    override fun onGetDefaultVoiceNameFor(lang: String?, country: String?, variant: String?): String {
        if (ok(lang)) return VOICE
        val g = awaitGoogle() ?: return ""
        val loc = localeOf(lang, country) ?: return ""
        return try {
            g.voices?.firstOrNull { it.locale.language == loc.language && (country.isNullOrEmpty() || it.locale.country == loc.country) }?.name ?: ""
        } catch (e: Throwable) { "" }
    }

    override fun onStop() {
        stopped = true
        try { google?.stop() } catch (e: Throwable) { }
    }

    // ---------- the phone's own voice ----------
    /** Google's engine on Arabic, with the Arabic voice he chose for the phone (Config.voice). */
    private fun googleArabic(g: TextToSpeech) {
        try {
            val r = g.setLanguage(Locale("ar", "EG"))
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) g.setLanguage(Locale("ar"))
            val want = Config.voice(applicationContext)
            if (want.isNotEmpty()) g.voices?.firstOrNull { it.name == want }?.let { g.voice = it }
            g.setSpeechRate(1.0f)
            g.setPitch(1.0f)
        } catch (e: Throwable) { }
    }

    /** [text] said by Google's engine into a WAV file (already set up by the caller), or null. */
    private fun googleFile(g: TextToSpeech, text: String): File? {
        val f = File(cacheDir, "google_" + System.nanoTime() + ".wav")
        val id = java.util.UUID.randomUUID().toString()
        val done = CountDownLatch(1)
        val good = AtomicBoolean(false)
        g.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) { if (utteranceId == id) { good.set(true); done.countDown() } }
            override fun onError(utteranceId: String?) { if (utteranceId == id) done.countDown() }
        })
        if (g.synthesizeToFile(text, android.os.Bundle(), f, id) != TextToSpeech.SUCCESS) { f.delete(); return null }
        val limit = System.currentTimeMillis() + 20_000L + text.length * 40L
        while (!done.await(200, TimeUnit.MILLISECONDS)) {
            if (stopped) { try { g.stop() } catch (e: Throwable) { }; break }
            if (System.currentTimeMillis() > limit) break
        }
        return if (good.get() && f.length() > 44) f else { f.delete(); null }
    }

    private class Wav(val rate: Int, val channels: Int, val offset: Int, val length: Int)

    private fun le16(b: ByteArray, o: Int) = (b[o].toInt() and 0xff) or ((b[o + 1].toInt() and 0xff) shl 8)
    private fun le32(b: ByteArray, o: Int) = le16(b, o) or (le16(b, o + 2) shl 16)

    /** Where the audio is in a 16-bit PCM WAV, or null when it is any other kind. */
    private fun wavInfo(b: ByteArray): Wav? {
        if (b.size < 44 || String(b, 0, 4, Charsets.US_ASCII) != "RIFF") return null
        var p = 12
        var rate = 0
        var ch = 0
        var bits = 0
        while (p + 8 <= b.size) {
            val id = String(b, p, 4, Charsets.US_ASCII)
            val len = le32(b, p + 4)
            if (id == "fmt " && p + 8 + 16 <= b.size) { ch = le16(b, p + 10); rate = le32(b, p + 12); bits = le16(b, p + 22) }
            if (id == "data") {
                val avail = b.size - (p + 8)
                val n = if (len < 0 || len > avail) avail else len   // a file written in one go may carry a wrong size
                return if (bits == 16 && ch in 1..2 && rate in 8000..48000) Wav(rate, ch, p + 8, n) else null
            }
            if (len < 0) return null
            p += 8 + len + (len and 1)
        }
        return null
    }

    /** What any other app asked for, said by the phone's Google voice as if this engine was not there. */
    private fun speakGoogle(request: SynthesisRequest, raw: String, callback: SynthesisCallback): String {
        val g = awaitGoogle()
        if (g == null) { callback.error(); return "google: the phone's own voice is not there" }
        try {
            val vn = request.voiceName
            val v = if (!vn.isNullOrEmpty() && vn != VOICE) googleVoice(vn) else null
            if (v != null) g.voice = v
            else if (ok(request.language)) googleArabic(g)
            else localeOf(request.language, request.country)?.let { g.setLanguage(it) }
            if (request.speechRate > 0) g.setSpeechRate(request.speechRate / 100f)
            if (request.pitch > 0) g.setPitch(request.pitch / 100f)
        } catch (e: Throwable) { }
        val f = googleFile(g, raw)
        if (f == null) { callback.error(); return "google: made nothing" }
        val bytes = try { f.readBytes() } catch (e: Throwable) { null }
        f.delete()
        val w = if (bytes != null) wavInfo(bytes) else null
        if (bytes == null || w == null) { callback.error(); return "google: audio of an unknown kind" }
        callback.start(w.rate, AudioFormat.ENCODING_PCM_16BIT, w.channels)
        val max = callback.maxBufferSize.coerceAtLeast(1024)
        var off = w.offset
        val end = w.offset + w.length
        while (off < end) {
            if (stopped) { callback.done(); return "google: stopped" }
            val n = minOf(max, end - off)
            if (callback.audioAvailable(bytes, off, n) != TextToSpeech.SUCCESS) return "google: the player stopped"
            off += n
        }
        callback.done()
        return "google: ok " + w.rate + " Hz"
    }

    // ---------- the natural voice (the bot's announcements) ----------
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

    private fun speakNatural(raw: String, callback: SynthesisCallback): String {
        val text = Egyptian.speak(Titles.strip(raw))   // no title or name, numbers and units in Egyptian words
        val parts = pieces(text)
        if (parts.isEmpty()) { callback.done(); return "natural: nothing left to say" }
        val notes = ConcurrentLinkedQueue<String>()
        // all pieces are asked for at once; the first one is played as soon as it is there
        val jobs: List<Future<File?>> = parts.map { p -> pool.submit(Callable<File?> { Natural.file(applicationContext, p) { m -> notes.add(m) } }) }
        var started = false
        var startedRate = 0
        var startedCh = 0
        var useGoogle = false   // once a piece is in Google's voice the rest is too (one voice and one rate per announcement)
        var viaGoogle = 0
        fun tail() = if (notes.isEmpty()) "" else " [" + notes.joinToString(" | ") + "]"
        for ((i, j) in jobs.withIndex()) {
            if (stopped) { jobs.forEach { it.cancel(true) }; callback.done(); return "natural: stopped" }
            var f: File? = if (useGoogle) { j.cancel(true); null } else try { j.get() } catch (e: Throwable) { null }
            var fallback = false
            if (f == null || f.length() <= 44) {
                val g = awaitGoogle()   // the announcement is still said
                if (g != null) { googleArabic(g); f = googleFile(g, parts[i]); fallback = f != null }
                if (fallback && !started) useGoogle = true
            }
            val bytes = if (f != null) try { f.readBytes() } catch (e: Throwable) { null } else null
            if (fallback) f?.delete()
            val w = if (bytes != null) wavInfo(bytes) else null
            if (bytes == null || w == null) {
                if (!started) { callback.error(); return "natural: nothing could be said" + tail() }
                continue
            }
            if (!started) {
                startedRate = w.rate
                startedCh = w.channels
                callback.start(startedRate, AudioFormat.ENCODING_PCM_16BIT, startedCh)
                started = true
            } else if (w.rate != startedRate || w.channels != startedCh) continue   // one audio stream has one format
            if (fallback) viaGoogle++
            val max = callback.maxBufferSize.coerceAtLeast(1024)
            var off = w.offset
            val end = w.offset + w.length
            while (off < end) {
                if (stopped) { callback.done(); return "natural: stopped" }
                val n = minOf(max, end - off)
                if (callback.audioAvailable(bytes, off, n) != TextToSpeech.SUCCESS) return "natural: the player stopped"
                off += n
            }
        }
        callback.done()
        return "natural: " + parts.size + " piece(s), " + viaGoogle + " in Google's voice" + tail()
    }

    override fun onSynthesizeText(request: SynthesisRequest, callback: SynthesisCallback) {
        stopped = false
        val raw = (request.charSequenceText ?: request.text ?: "").toString()
        if (raw.isBlank()) { callback.done(); return }
        val t0 = System.currentTimeMillis()
        val pk = try { packageManager.getPackagesForUid(request.callerUid)?.toList() ?: emptyList() } catch (e: Throwable) { emptyList<String>() }
        // a test can force the phone's own voice (TTS_TEST force=google); no app needs this
        val forced = try { request.params?.getString("adam_force") == "google" } catch (e: Throwable) { false }
        val natural = ok(request.language) && !forced && pk.any { p -> NATURAL_CALLERS.any { p.startsWith(it) } }
        val res = try {
            if (natural) speakNatural(raw, callback) else speakGoogle(request, raw, callback)
        } catch (e: Throwable) {
            try { callback.error() } catch (x: Throwable) { }
            "crashed: " + e.javaClass.simpleName + " " + (e.message ?: "")
        }
        elog("caller=" + (if (pk.isEmpty()) "uid" + request.callerUid else pk.joinToString(",")) + " lang=" + request.language +
            (if (forced) " forced" else "") + " chars=" + raw.length + " " + (System.currentTimeMillis() - t0) + " ms :: " + res)
    }

    override fun onDestroy() {
        pool.shutdownNow()
        try { google?.shutdown() } catch (e: Throwable) { }
        super.onDestroy()
    }
}
