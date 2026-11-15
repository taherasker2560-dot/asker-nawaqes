package com.askerpharmacy.adam

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaPlayer
import android.os.Handler
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.io.File
import java.util.Locale
import java.util.UUID

/** Adam's voice: the natural voice of the bot's server (Natural.kt), with the phone's own Arabic text-to-speech as the fallback (its voice, pitch and speed are Config's). */
class Speaker(ctx: Context, private val handler: Handler, private val log: (String) -> Unit) {
    private val app = ctx.applicationContext
    private var tts: TextToSpeech? = null
    private var ready = false
    val isReady: Boolean get() = ready
    private val waiting = HashMap<String, () -> Unit>()

    init {
        // the phone's own voice is Google's engine, whatever the default engine is (Adam's own engine «آدم» must never be its own fallback)
        val engine = try { app.packageManager.getPackageInfo("com.google.android.tts", 0); "com.google.android.tts" } catch (e: Throwable) { null }
        tts = TextToSpeech(app, { status ->
            val t = tts
            if (status == TextToSpeech.SUCCESS && t != null) {
                var r = t.setLanguage(Locale("ar", "EG"))
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) r = t.setLanguage(Locale("ar"))
                ready = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED
                log("voice ready=$ready")
                t.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}
                    override fun onDone(utteranceId: String?) = finished(utteranceId)
                    override fun onError(utteranceId: String?) = finished(utteranceId)
                })
                apply()
            } else {
                log("voice failed to start")
            }
        }, engine)
    }

    /** Puts the chosen voice, pitch and speed (Config) on the engine. A voice that is not on the phone is ignored. */
    fun apply() {
        val t = tts ?: return
        if (!ready) return
        try {
            val want = Config.voice(app)
            if (want.isNotEmpty()) {
                val v = t.voices?.firstOrNull { it.name == want }
                if (v != null) t.voice = v else log("voice not found: $want")
            }
            t.setPitch(Config.pitch(app))
            t.setSpeechRate(Config.rate(app))
        } catch (e: Throwable) {
            log("voice apply failed: " + e.message)
        }
    }

    /** One line per Arabic voice the engine has: name, language, quality, speed, needs the net. */
    fun describeVoices(): String {
        val t = tts ?: return "no engine"
        val sb = StringBuilder()
        try {
            sb.append("engine=").append(t.defaultEngine).append(" current=").append(t.voice?.name).append("\n")
            for (v in (t.voices ?: emptySet())) {
                if (!v.locale.language.equals("ar", ignoreCase = true)) continue
                sb.append(v.name).append(" | ").append(v.locale).append(" | quality ").append(v.quality)
                    .append(" | latency ").append(v.latency).append(" | net ").append(v.isNetworkConnectionRequired)
                    .append(" | ").append(v.features.joinToString(",")).append("\n")
            }
        } catch (e: Throwable) {
            sb.append("error: ").append(e.message)
        }
        return sb.toString()
    }

    private fun finished(id: String?) {
        handler.post { if (id != null) waiting.remove(id)?.invoke() }
    }

    @Volatile private var seq = 0
    private var player: MediaPlayer? = null

    /**
     * Says [text]; [then] runs when it is finished (also when no voice is available, so the conversation goes on).
     * The natural voice first (the bot's server, Gemini's speech: Natural.kt, kept on the phone for repeated lines); the phone's own
     * voice when the server or the net is not there, or the sentence is too long for it.
     */
    fun say(text: String, after: () -> Unit) {
        val clean = Titles.strip(text).take(3500)
        if (clean.isEmpty()) { handler.post(after); return }
        stopPlayer()
        val my = ++seq
        // [after] runs once, and ALWAYS: if the voice never says it is finished (the server, the net or the phone's engine stuck),
        // the conversation goes on after a generous time instead of Adam staying deaf («بنادي عليه ما بيردش», 2026-11-15)
        var ran = false
        val then: () -> Unit = { if (!ran) { ran = true; after() } }
        handler.postDelayed({
            if (my == seq && !ran) {
                log("voice did not finish in time, going on")
                seq++
                stopPlayer()
                try { tts?.stop() } catch (e: Throwable) { }
                then()
            }
        }, 15_000L + clean.length * 120L)
        if (!Config.natural(app) || !Config.ready(app) || clean.length > Natural.MAX) { sayLocal(clean, then); return }
        Thread {
            val cached = Natural.cached(app, clean)
            if (cached != null) {
                // a line heard before: it plays at once
                handler.post {
                    if (my != seq) return@post   // a newer sentence (or stop) replaced this one
                    if (!play(cached, my, then)) sayLocal(clean, then)
                }
            } else {
                streamSay(clean, my, then)
            }
        }.start()
    }

    @Volatile private var activeTrack: AudioTrack? = null

    /**
     * A new sentence is played while the server is still making it (Natural.stream): it starts after the first 0.35 s of sound is
     * there (so it does not run dry), not after the whole sentence. When it is over it is kept on the phone for next time.
     * No sound at all (server / net / quota): the phone's own voice says it. Runs on a background thread.
     */
    private fun streamSay(clean: String, my: Int, then: () -> Unit) {
        var track: AudioTrack? = null
        val all = java.io.ByteArrayOutputStream()
        val head = java.io.ByteArrayOutputStream()
        var carry = -1
        var rateNow = 24000
        var frames = 0L
        fun newTrack(rate: Int): AudioTrack {
            val min = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val t = AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(AudioFormat.Builder().setSampleRate(rate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(maxOf(min * 2, rate * 2))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
            activeTrack = t
            t.play()
            return t
        }
        val sink = { rate: Int, buf: ByteArray, n: Int ->
            if (my != seq) false else try {
                rateNow = rate
                var data = buf
                var len = n
                if (carry >= 0) { data = ByteArray(n + 1); data[0] = carry.toByte(); System.arraycopy(buf, 0, data, 1, n); len = n + 1; carry = -1 }
                if (len % 2 == 1) { carry = data[len - 1].toInt() and 0xff; len -= 1 }
                if (len > 0) {
                    all.write(data, 0, len)
                    val t = track
                    if (t == null) {
                        head.write(data, 0, len)
                        if (head.size() >= rate * 2 * 35 / 100) {
                            val nt = newTrack(rate); track = nt
                            val h = head.toByteArray(); nt.write(h, 0, h.size); frames += h.size / 2
                        }
                    } else { t.write(data, 0, len); frames += len / 2 }
                }
                true
            } catch (e: Throwable) { false }
        }
        val got = Natural.stream(app, clean, log, sink)
        try {
            if (my != seq) return
            if (!got) { handler.post { if (my == seq) sayLocal(clean, then) }; return }
            if (track == null) {   // a short sentence: all of it is still in the head
                val nt = newTrack(rateNow); track = nt
                val h = head.toByteArray(); nt.write(h, 0, h.size); frames += h.size / 2
            }
            val t = track ?: return
            t.stop()   // a streaming track plays what is written, then stops
            val limit = System.currentTimeMillis() + frames * 1000 / rateNow + 3000
            while (my == seq && t.playbackHeadPosition < frames && System.currentTimeMillis() < limit) Thread.sleep(40)
            if (my == seq) Natural.saveWav(app, clean, rateNow, all.toByteArray())
            handler.post { if (my == seq) then() }
        } catch (e: Throwable) {
            log("stream play failed: " + e.message)
            handler.post { if (my == seq) then() }
        } finally {
            try { track?.release() } catch (e: Throwable) { }
            if (activeTrack === track) activeTrack = null
        }
    }

    private fun play(f: File, my: Int, then: () -> Unit): Boolean {
        val mp = MediaPlayer()
        return try {
            player = mp
            mp.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            mp.setDataSource(f.absolutePath)
            mp.setOnCompletionListener { releasePlayer(mp); if (my == seq) handler.post(then) }
            mp.setOnErrorListener { _, _, _ -> releasePlayer(mp); if (my == seq) handler.post(then); true }
            mp.prepare()
            mp.start()
            true
        } catch (e: Throwable) {
            log("play failed: " + e.message)
            releasePlayer(mp)
            false
        }
    }

    private fun releasePlayer(mp: MediaPlayer) {
        try { mp.release() } catch (e: Throwable) { }
        if (player === mp) player = null
    }

    private fun stopPlayer() {
        val at = activeTrack
        if (at != null) {
            activeTrack = null
            try { at.pause(); at.flush() } catch (e: Throwable) { }
            try { at.release() } catch (e: Throwable) { }
        }
        val mp = player ?: return
        player = null
        try { mp.stop() } catch (e: Throwable) { }
        try { mp.release() } catch (e: Throwable) { }
    }

    private fun sayLocal(clean: String, then: () -> Unit) {
        val t = tts
        if (!ready || t == null) {
            handler.post(then)
            return
        }
        val id = UUID.randomUUID().toString()
        waiting[id] = then
        val r = t.speak(clean, TextToSpeech.QUEUE_FLUSH, null, id)
        if (r != TextToSpeech.SUCCESS) {
            waiting.remove(id)
            handler.post(then)
        }
    }

    fun stop() {
        seq++
        stopPlayer()
        try { tts?.stop() } catch (e: Throwable) { }
    }

    fun shutdown() {
        seq++
        stopPlayer()
        try { tts?.stop(); tts?.shutdown() } catch (e: Throwable) { }
        tts = null
    }
}
