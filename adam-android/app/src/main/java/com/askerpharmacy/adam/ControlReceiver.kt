package com.askerpharmacy.adam

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Base64

/**
 * Commands from the laptop over adb (the receiver is protected by the DUMP permission, which only adb / the system hold):
 *   SET_CONFIG  url, api, key, bot   the server's address, its public key, this phone's device key, the bot's page
 *   ASK         text | b64           a typed question (as if he said it after «آدم»); b64 = the same text in UTF-8 base64 (for Arabic over adb)
 *   STOP                             switch the listening service off
 */
class ControlReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            "com.askerpharmacy.adam.SET_CONFIG" -> {
                Config.save(context, intent.getStringExtra("url"), intent.getStringExtra("api"), intent.getStringExtra("key"), intent.getStringExtra("bot"))
                resultData = if (Config.ready(context)) "config ok" else "config incomplete"
            }
            "com.askerpharmacy.adam.ASK" -> {
                var t = intent.getStringExtra("text")?.trim() ?: ""
                val b = intent.getStringExtra("b64")
                if (!b.isNullOrEmpty()) {
                    try { t = String(Base64.decode(b, Base64.DEFAULT), Charsets.UTF_8).trim() } catch (e: Exception) { }
                }
                if (t.isNotEmpty() && AdamService.running) {
                    context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_TEXT).putExtra("text", t)
                        .putExtra("idle", intent.getStringExtra("idle") ?: ""))
                    resultData = "asked"
                } else resultData = "adam is not running"
            }
            // «آدم 3»: ENROLL = record his voiceprint now (Adam says 8 sentences, he repeats them); FEED file = a WAV in files/
            // (pushed with run-as) handled as if he had just said it; VP = the voiceprint's state, bar=0.45 a new bar, learn=off ends
            // the 2 learning days, forget=1 deletes it
            "com.askerpharmacy.adam.ENROLL" -> {
                if (AdamService.running) context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_ENROLL))
                resultData = if (AdamService.running) "enrolling" else "adam is not running"
            }
            "com.askerpharmacy.adam.FEED" -> {
                if (AdamService.running) context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_FEED)
                    .putExtra("file", intent.getStringExtra("file") ?: "test.wav"))
                resultData = if (AdamService.running) "fed" else "adam is not running"
            }
            "com.askerpharmacy.adam.VP" -> {
                Voiceprint.load(context)
                intent.getStringExtra("bar")?.toFloatOrNull()?.let { Voiceprint.setBar(context, it) }
                if (intent.getStringExtra("learn") == "off") Voiceprint.endLearning(context)
                if (intent.getStringExtra("forget") == "1") Voiceprint.forget(context)
                resultData = Voiceprint.describe().toString()
            }
            // the voice: SET_VOICE voice (a name from VOICES, or "" for the default), pitch (1.0 normal, lower = deeper), rate; then
            // VOICES writes files/voices.txt (readable with run-as); SAY says a sentence (text | b64) in the current voice
            "com.askerpharmacy.adam.SET_VOICE" -> {
                Config.saveVoice(context, intent.getStringExtra("voice"), intent.getStringExtra("pitch")?.toFloatOrNull(), intent.getStringExtra("rate")?.toFloatOrNull())
                // the natural voice: natural = on|off, nvoice = a Gemini voice name (Charon), nmodel = a Gemini speech model
                Config.saveNatural(context, intent.getStringExtra("natural")?.let { it == "on" || it == "true" || it == "1" }, intent.getStringExtra("nvoice"), intent.getStringExtra("nmodel"))
                Config.saveWakeConf(context, intent.getStringExtra("wakeconf")?.toFloatOrNull())
                if (AdamService.running) context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_VOICE))
                resultData = "voice=" + Config.voice(context) + " pitch=" + Config.pitch(context) + " rate=" + Config.rate(context) +
                    " natural=" + Config.natural(context) + " " + Config.naturalVoice(context) + " " + Config.naturalModel(context) + " wakeconf=" + Config.wakeConf(context)
            }
            "com.askerpharmacy.adam.VOICES" -> {
                if (AdamService.running) context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_VOICES))
                resultData = "voices requested"
            }
            "com.askerpharmacy.adam.SAY" -> {
                var t = intent.getStringExtra("text")?.trim() ?: ""
                val b = intent.getStringExtra("b64")
                if (!b.isNullOrEmpty()) {
                    try { t = String(Base64.decode(b, Base64.DEFAULT), Charsets.UTF_8).trim() } catch (e: Exception) { }
                }
                if (t.isNotEmpty() && AdamService.running) {
                    context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_SAY).putExtra("text", t))
                    resultData = "saying"
                } else resultData = "adam is not running"
            }
            // TTS_TEST text | b64: speaks the sentence THROUGH THE ENGINE «آدم» (the way a Tasker Say step with that engine does) and
            // answers done / error / timeout; proves the engine works without touching Tasker
            "com.askerpharmacy.adam.TTS_TEST" -> {
                var t = intent.getStringExtra("text")?.trim() ?: ""
                val b = intent.getStringExtra("b64")
                if (!b.isNullOrEmpty()) {
                    try { t = String(Base64.decode(b, Base64.DEFAULT), Charsets.UTF_8).trim() } catch (e: Exception) { }
                }
                if (t.isEmpty()) { resultData = "no text"; return }
                val pending = goAsync()
                val answered = java.util.concurrent.atomic.AtomicBoolean(false)
                var engine: android.speech.tts.TextToSpeech? = null
                // the answer to adb goes once; the engine is shut only when the sentence is over (2026-11-15: a long sentence was
                // cut at 9 s by the old timeout, which shut the engine while it was still speaking)
                val answer = { msg: String -> if (answered.compareAndSet(false, true)) { pending.resultData = msg; pending.finish() } }
                val finish = { msg: String ->
                    answer(msg)
                    try { engine?.shutdown() } catch (e: Throwable) { }
                }
                engine = android.speech.tts.TextToSpeech(context.applicationContext, { status ->
                    val e = engine
                    if (status != android.speech.tts.TextToSpeech.SUCCESS || e == null) { finish("init failed $status") } else {
                        // lang = a language tag («en-US») to test another language; force=google = the phone's own voice even for
                        // Adam's own app (tests only); the engine's own log (files/engine.log) says what it did
                        val langTag = intent.getStringExtra("lang")?.trim().orEmpty()
                        val lr = e.setLanguage(if (langTag.isNotEmpty()) java.util.Locale.forLanguageTag(langTag) else java.util.Locale("ar", "EG"))
                        e.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
                            override fun onStart(utteranceId: String?) {}
                            override fun onDone(utteranceId: String?) { finish("done (engine " + e.defaultEngine + ", setLanguage=" + lr + ")") }
                            override fun onError(utteranceId: String?) { finish("error (setLanguage=" + lr + ")") }
                        })
                        val params = if (intent.getStringExtra("force") == "google") android.os.Bundle().apply { putString("adam_force", "google") } else null
                        e.speak(t, android.speech.tts.TextToSpeech.QUEUE_FLUSH, params, "t")
                    }
                }, "com.askerpharmacy.adam")
                val h = android.os.Handler(android.os.Looper.getMainLooper())
                h.postDelayed({ answer("speaking") }, 9000)          // adb gets an answer; the sentence goes on
                h.postDelayed({ finish("timeout") }, 120_000)        // the engine is let go at the latest after 2 minutes
            }
            "com.askerpharmacy.adam.STOP" -> {
                if (AdamService.running) context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_STOP))
                resultData = "stopping"
            }
        }
    }
}
