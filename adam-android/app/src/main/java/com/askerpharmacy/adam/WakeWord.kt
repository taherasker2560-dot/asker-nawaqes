package com.askerpharmacy.adam

import android.content.Context
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import java.io.File
import java.util.zip.ZipInputStream

/**
 * The word «آدم», heard on the phone only, offline (Vosk, a small speech model kept inside the app; no account, nothing is sent).
 * The recognizer is limited to a tiny list of words ("adam" and "everything else"), which is cheap and works with the screen off.
 */
class WakeWord(private val ctx: Context, private val onWake: () -> Unit, private val log: (String) -> Unit) {
    private var model: Model? = null
    private var service: SpeechService? = null
    private var fired = false

    /** Unpacks the model the first time (a few seconds), then loads it. [done] is called on a background thread. */
    fun prepare(done: (Boolean) -> Unit) {
        Thread {
            try {
                val root = File(ctx.filesDir, "vosk")
                val mark = File(ctx.filesDir, "vosk.ok")
                if (!mark.exists()) {
                    root.deleteRecursively()
                    root.mkdirs()
                    val rootPath = root.canonicalPath + File.separator
                    ctx.assets.open("vosk-model.zip").use { raw ->
                        ZipInputStream(raw).use { z ->
                            var e = z.nextEntry
                            while (e != null) {
                                val out = File(root, e.name)
                                if (!out.canonicalPath.startsWith(rootPath)) throw IllegalStateException("bad zip entry")
                                if (e.isDirectory) out.mkdirs() else {
                                    out.parentFile?.mkdirs()
                                    out.outputStream().use { o -> z.copyTo(o) }
                                }
                                e = z.nextEntry
                            }
                        }
                    }
                    mark.writeText("ok")
                }
                val dir = root.listFiles()?.firstOrNull { it.isDirectory } ?: throw IllegalStateException("no model folder")
                model = Model(dir.absolutePath)
                log("wake word model ready")
                done(true)
            } catch (e: Throwable) {
                log("wake word model failed: " + e.message)
                done(false)
            }
        }.start()
    }

    /** Starts listening for the word (the microphone is taken). */
    fun start(): Boolean {
        val m = model ?: return false
        stop()
        fired = false
        return try {
            val rec = Recognizer(m, 16000.0f, "[\"adam\", \"a dam\", \"[unk]\"]")
            rec.setWords(true)   // each word with its confidence
            val s = SpeechService(rec, 16000.0f)
            s.startListening(object : RecognitionListener {
                // a half-heard guess wakes only when it is «آدم» and NOTHING before it (the start of what he says: fast); «آدم» in the
                // middle of a conversation never does (owner 2026-11-15: «بقى بيتكلم اصلا من غير ما اقول ادم»)
                override fun onPartialResult(hypothesis: String?) = checkPartial(hypothesis)
                override fun onResult(hypothesis: String?) = check(hypothesis)
                override fun onFinalResult(hypothesis: String?) = check(hypothesis)
                // the microphone was lost (another app, a call): the service restarts it (AdamService's check every 15 s)
                override fun onError(exception: Exception?) { log("wake word error: " + exception?.message); dead = true }
                override fun onTimeout() { dead = true }
            })
            service = s
            dead = false
            startedAt = System.currentTimeMillis()
            true
        } catch (e: Throwable) {
            log("wake word start failed: " + e.message)
            false
        }
    }

    /** The start of what he says is «آدم» (nothing before it): wake at once, without waiting for him to stop talking. */
    private fun checkPartial(hypothesis: String?) {
        if (fired || hypothesis == null) return
        try {
            val p = JSONObject(hypothesis).optString("partial", "").trim()
            if (p == "adam" || p == "a dam") { log("wake (start of speech)"); fired = true; onWake() }
        } catch (e: Exception) { }
    }

    /**
     * After he stops talking: wakes on a short call where «آدم» is the first or the last word («آدم»، «يا آدم»، «آدم بقولك»: at most
     * 3 words), heard with good confidence. «آدم» in the middle of a longer sentence (him talking to someone, or about Adam) or a
     * doubtful sound is ignored and written to the log (seen 11-15: «يا آدم» was ignored by the first, too strict, version).
     */
    private fun check(hypothesis: String?) {
        if (fired || hypothesis == null) return
        try {
            val o = JSONObject(hypothesis)
            val text = o.optString("text", "").trim().replace("a dam", "adam")
            if (text.isEmpty() || !text.contains("adam")) return
            val tokens = text.split(Regex("\\s+"))
            val firstOrLast = tokens.first() == "adam" || tokens.last() == "adam"
            val words = o.optJSONArray("result")
            if (tokens.size > 3 || !firstOrLast) { log("wake ignored, inside a sentence: $text" + timings(words)); return }
            var conf = 1.0
            if (words != null) {
                for (i in 0 until words.length()) {
                    val w = words.getJSONObject(i)
                    if (w.optString("word") == "adam" || w.optString("word") == "a") { conf = w.optDouble("conf", 0.0); break }
                }
            }
            if (conf < Config.wakeConf(ctx)) { log("wake ignored, conf %.2f: %s".format(conf, text)); return }
            log("wake conf %.2f: %s".format(conf, text))
            fired = true
            onWake()
        } catch (e: Exception) { }
    }

    /** « | adam 3.1-3.5 0.71, [unk] 3.6-4.0 …»: when each word was heard and how sure, for tuning the rule from the log. */
    private fun timings(words: org.json.JSONArray?): String {
        if (words == null || words.length() == 0) return ""
        val sb = StringBuilder(" |")
        for (i in 0 until minOf(words.length(), 12)) {
            val w = words.optJSONObject(i) ?: continue
            sb.append(' ').append(w.optString("word")).append(' ')
                .append("%.1f-%.1f %.2f".format(w.optDouble("start"), w.optDouble("end"), w.optDouble("conf")))
                .append(',')
        }
        return sb.toString()
    }

    /** Lets go of the microphone. */
    fun stop() {
        dead = true
        val s = service ?: return
        service = null
        try { s.stop() } catch (e: Throwable) { }
        try { s.shutdown() } catch (e: Throwable) { }
    }

    val ready: Boolean get() = model != null

    /** Listening is over by itself (error / timeout) or was never started: it must be started again. */
    @Volatile var dead = true
        private set
    /** When listening last started (it is renewed every few minutes while nothing happens). */
    @Volatile var startedAt = 0L
        private set
}
