package com.askerpharmacy.adam

import android.content.Context
import android.media.AudioAttributes
import android.os.Handler
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.UUID

/** Adam's voice: the phone's own text-to-speech in Arabic. The voice, its pitch and its speed are the owner's choice (Config). */
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

    /** Says [text]; [then] runs when it is finished (also when the voice is not available, so the conversation goes on). */
    fun say(text: String, then: () -> Unit) {
        val t = tts
        val clean = text.trim().take(3500)
        if (!ready || t == null || clean.isEmpty()) {
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
        try { tts?.stop() } catch (e: Throwable) { }
    }

    fun shutdown() {
        try { tts?.stop(); tts?.shutdown() } catch (e: Throwable) { }
        tts = null
    }
}
