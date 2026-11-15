package com.askerpharmacy.adam

import android.content.Context
import android.media.AudioAttributes
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
        tts = TextToSpeech(app) { status ->
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
        }
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

    private var seq = 0
    private var player: MediaPlayer? = null

    /**
     * Says [text]; [then] runs when it is finished (also when no voice is available, so the conversation goes on).
     * The natural voice first (the bot's server, Gemini's speech: Natural.kt, kept on the phone for repeated lines); the phone's own
     * voice when the server or the net is not there, or the sentence is too long for it.
     */
    fun say(text: String, then: () -> Unit) {
        val clean = text.trim().take(3500)
        if (clean.isEmpty()) { handler.post(then); return }
        stopPlayer()
        val my = ++seq
        if (!Config.natural(app) || !Config.ready(app) || clean.length > Natural.MAX) { sayLocal(clean, then); return }
        Thread {
            val f = Natural.file(app, clean, log)
            handler.post {
                if (my != seq) return@post   // a newer sentence (or stop) replaced this one while it was being made
                if (f == null || !play(f, my, then)) sayLocal(clean, then)
            }
        }.start()
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
