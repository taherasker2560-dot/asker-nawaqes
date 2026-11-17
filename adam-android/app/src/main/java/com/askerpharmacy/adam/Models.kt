package com.askerpharmacy.adam

import android.content.Context
import org.vosk.Model
import org.vosk.SpeakerModel
import java.io.File
import java.util.zip.ZipInputStream

/**
 * The two small offline models inside the app (Vosk, Apache 2.0; nothing is sent anywhere):
 *  - the speech model (English, small): hears the word «آدم» on the phone itself, and finds where speech is in a sentence;
 *  - the speaker model («آدم 3», 2026-11-17: «عايز يشتغل على بصمة صوتي انا بس»): turns a sentence into a voiceprint (128 numbers).
 * Unpacked from the app's assets the first time (a few seconds), then loaded. Background thread only.
 */
object Models {
    @Volatile var speech: Model? = null
        private set
    @Volatile var speaker: SpeakerModel? = null
        private set

    fun prepare(ctx: Context, log: (String) -> Unit): Boolean {
        return try {
            if (speech == null) speech = Model(unpack(ctx, "vosk-model.zip", "vosk").absolutePath)
            log("speech model ready")
            try {
                if (speaker == null) speaker = SpeakerModel(unpack(ctx, "vosk-spk.zip", "vosk-spk").absolutePath)
                log("speaker model ready")
            } catch (e: Throwable) {
                // without it Adam still works (no voiceprint: as before «آدم 3»)
                log("speaker model failed: " + e.message)
            }
            true
        } catch (e: Throwable) {
            log("speech model failed: " + e.message)
            false
        }
    }

    /** The model folder inside files/[dir] (unpacked once from assets/[asset]; «[dir].ok» marks a finished unpack). */
    private fun unpack(ctx: Context, asset: String, dir: String): File {
        val root = File(ctx.filesDir, dir)
        val mark = File(ctx.filesDir, "$dir.ok")
        if (!mark.exists()) {
            root.deleteRecursively()
            root.mkdirs()
            val rootPath = root.canonicalPath + File.separator
            ctx.assets.open(asset).use { raw ->
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
        return root.listFiles()?.firstOrNull { it.isDirectory } ?: throw IllegalStateException("no model folder in $asset")
    }
}
