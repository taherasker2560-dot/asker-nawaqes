package com.askerpharmacy.adam

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * What he says after «آدم» (and his «أيوه» / «لا»): the phone's own speech engine, Egyptian Arabic. Main thread only.
 *
 * The engine is KEPT between listens (owner 2026-11-17: «لما بيخلص الرد بتاعه، لو جيت كلمته وراها على طول بيفضل ساكت فترة … ما بيبعتش رسالة ان
 * هو فتح»): making a new one each time took a second or two before it really listened, and the beep came before that, so his first
 * words were lost. Now the same engine starts again at once, and [listen]'s onReady says the moment it really listens (the beep).
 * After a hard error (busy, disconnected, client) it is thrown away and a new one is made the next time.
 */
class Listener(private val ctx: Context, private val handler: Handler, private val log: (String) -> Unit) {
    private var rec: SpeechRecognizer? = null
    private var active = false
    private var seq = 0

    fun available(): Boolean = SpeechRecognizer.isRecognitionAvailable(ctx)

    /** [onText] gets the words, [onFail] the error code (no speech heard, no match, busy, no network ...), [onReady] the moment it listens. */
    fun listen(onText: (String) -> Unit, onFail: (Int) -> Unit, onReady: (() -> Unit)? = null) {
        if (active) cancel()
        val r = rec ?: SpeechRecognizer.createSpeechRecognizer(ctx).also { rec = it }
        val my = ++seq
        val t0 = System.currentTimeMillis()
        // one answer per listen, and ALWAYS one: the phone's speech engine sometimes never calls back (busy, its service restarted);
        // then Adam would wait for ever and never hear «آدم» again («بنادي عليه ما بيردش», 2026-11-15)
        var over = false
        val onText1: (String) -> Unit = { t -> if (!over) { over = true; active = false; onText(t) } }
        val onFail1: (Int) -> Unit = { c -> if (!over) { over = true; active = false; onFail(c) } }
        handler.postDelayed({
            if (!over && my == seq) {
                log("listen: no answer from the speech engine, going on")
                drop()
                onFail1(SpeechRecognizer.ERROR_CLIENT)
            }
        }, LISTEN_MAX_MS)
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                if (my != seq) return
                log("listening after " + (System.currentTimeMillis() - t0) + " ms")
                onReady?.invoke()
            }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onError(error: Int) {
                if (my != seq) return
                log("listen error $error")
                // a hard error: a new engine next time (no speech / no match keep the same one)
                if (error != SpeechRecognizer.ERROR_NO_MATCH && error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT) handler.post { if (rec === r) drop() }
                onFail1(error)
            }
            override fun onResults(results: Bundle?) {
                if (my != seq) return
                val t = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
                if (t.isBlank()) onFail1(SpeechRecognizer.ERROR_NO_MATCH) else onText1(t.trim())
            }
        })
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-EG")
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ar-EG")
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
            .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.packageName)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1600L)
        active = true
        try { r.startListening(i) } catch (e: Throwable) { log("listen start failed: " + e.message); drop(); onFail1(SpeechRecognizer.ERROR_CLIENT) }
    }

    /** Stops the listen that is running (the engine is kept for the next one). */
    fun cancel() {
        seq++
        active = false
        try { rec?.cancel() } catch (e: Throwable) { }
    }

    /** Throws the engine away (a hard error, or the service ends). */
    fun drop() {
        val r = rec ?: return
        rec = null
        active = false
        try { r.cancel() } catch (e: Throwable) { }
        try { r.destroy() } catch (e: Throwable) { }
    }

    companion object {
        /** The longest one listen may take (a long dictation piece is about 30 s; the engine ends by itself well before this). */
        const val LISTEN_MAX_MS = 75_000L
    }
}
