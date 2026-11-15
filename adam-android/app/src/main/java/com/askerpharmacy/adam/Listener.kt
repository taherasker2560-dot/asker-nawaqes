package com.askerpharmacy.adam

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/** What he says after «آدم» (and his «أيوه» / «لا»): the phone's own speech engine, Egyptian Arabic. Main thread only. */
class Listener(private val ctx: Context, private val handler: Handler, private val log: (String) -> Unit) {
    private var rec: SpeechRecognizer? = null

    fun available(): Boolean = SpeechRecognizer.isRecognitionAvailable(ctx)

    /** [onText] gets the words, [onFail] the error code (no speech heard, no match, busy, no network ...). */
    fun listen(onText: (String) -> Unit, onFail: (Int) -> Unit) {
        cancel()
        val r = SpeechRecognizer.createSpeechRecognizer(ctx)
        rec = r
        // one answer per listen, and ALWAYS one: the phone's speech engine sometimes never calls back (busy, its service restarted);
        // then Adam would wait for ever and never hear «آدم» again («بنادي عليه ما بيردش», 2026-11-15)
        var over = false
        val onText1: (String) -> Unit = { t -> if (!over) { over = true; onText(t) } }
        val onFail1: (Int) -> Unit = { c -> if (!over) { over = true; onFail(c) } }
        handler.postDelayed({
            if (!over && rec === r) {
                log("listen: no answer from the speech engine, going on")
                cancel()
                onFail1(SpeechRecognizer.ERROR_CLIENT)
            }
        }, LISTEN_MAX_MS)
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onError(error: Int) {
                log("listen error $error")
                finish(r)
                onFail1(error)
            }
            override fun onResults(results: Bundle?) {
                val t = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
                finish(r)
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
        r.startListening(i)
    }

    private fun finish(r: SpeechRecognizer) {
        handler.post {
            try { r.cancel() } catch (e: Throwable) { }
            try { r.destroy() } catch (e: Throwable) { }
            if (rec === r) rec = null
        }
    }

    fun cancel() {
        val r = rec ?: return
        rec = null
        try { r.cancel() } catch (e: Throwable) { }
        try { r.destroy() } catch (e: Throwable) { }
    }

    companion object {
        /** The longest one listen may take (a long dictation piece is about 30 s; the engine ends by itself well before this). */
        const val LISTEN_MAX_MS = 75_000L
    }
}
