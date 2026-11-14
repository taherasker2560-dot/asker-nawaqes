package com.askerpharmacy.adam

import android.content.Context
import android.media.AudioAttributes
import android.os.Handler
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.UUID

/** Adam's voice: the phone's own text-to-speech in Arabic. */
class Speaker(ctx: Context, private val handler: Handler, private val log: (String) -> Unit) {
    private var tts: TextToSpeech? = null
    private var ready = false
    val isReady: Boolean get() = ready
    private val waiting = HashMap<String, () -> Unit>()

    init {
        tts = TextToSpeech(ctx.applicationContext) { status ->
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
            } else {
                log("voice failed to start")
            }
        }
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
