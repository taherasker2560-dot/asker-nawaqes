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
            val s = SpeechService(rec, 16000.0f)
            s.startListening(object : RecognitionListener {
                override fun onPartialResult(hypothesis: String?) = check(hypothesis, "partial")
                override fun onResult(hypothesis: String?) = check(hypothesis, "text")
                override fun onFinalResult(hypothesis: String?) = check(hypothesis, "text")
                override fun onError(exception: Exception?) { log("wake word error: " + exception?.message) }
                override fun onTimeout() {}
            })
            service = s
            true
        } catch (e: Throwable) {
            log("wake word start failed: " + e.message)
            false
        }
    }

    private fun check(hypothesis: String?, key: String) {
        if (fired || hypothesis == null) return
        val t = try { JSONObject(hypothesis).optString(key, "") } catch (e: Exception) { "" }
        if (t.contains("adam")) {
            fired = true
            onWake()
        }
    }

    /** Lets go of the microphone. */
    fun stop() {
        val s = service ?: return
        service = null
        try { s.stop() } catch (e: Throwable) { }
        try { s.shutdown() } catch (e: Throwable) { }
    }

    val ready: Boolean get() = model != null
}
