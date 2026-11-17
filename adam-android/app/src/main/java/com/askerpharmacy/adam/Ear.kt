package com.askerpharmacy.adam

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.os.Handler
import org.json.JSONObject
import org.vosk.Recognizer
import java.util.concurrent.Executors
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

/**
 * «آدم 3»: ONE ear, always on (owner 2026-11-17: «اكلمه يرد عليا، اكلمه يرد عليا، لو قطعته يسكت»).
 * One microphone stream (with the phone's echo canceller), cut into sentences where he stops talking. Each sentence gets, on the phone
 * and offline: its voiceprint (Models.speaker) and whether it is the word «آدم» (Models.speech). AdamService decides what to do with it.
 *  - Nothing is lost at the start: 0.4 s before the first sound is kept, and the ear never closes between sentences.
 *  - While Adam speaks his own voice comes back into the microphone: a sentence then needs to be clearly louder than that echo for
 *    about a quarter second; then [onBargeIn] asks AdamService whether it is HIS voice (he cut Adam to say something else).
 * The reading runs on its own thread; the voiceprint on a worker thread; both callbacks come on the main thread.
 */
class Ear(
    private val main: Handler,
    private val log: (String) -> Unit,
    private val isSpeaking: () -> Boolean,
    private val onSegment: (Segment) -> Unit,
    private val onBargeIn: (Int, FloatArray?) -> Unit,
) {
    /** One sentence: its sound, how long (ms), how much of it was voice, its voiceprint, and «آدم» heard at its start. */
    class Segment(val id: Int, val pcm: ShortArray, val ms: Int, val voicedMs: Int, val vector: FloatArray?, val wake: Boolean,
                  val wakeConf: Double, val words: String, val duringSpeech: Boolean)

    companion object {
        const val RATE = 16000
        private const val FRAME = 320                 // 20 ms
        private const val PREROLL = RATE * 4 / 10     // 0.4 s kept before the first sound
        private const val MAX_MS = 20_000
        private const val MIN_VOICED_MS = 260
        private const val BARGE_MS = 400
    }

    /** How long a pause ends a sentence (AdamService: longer while he dictates a list). */
    @Volatile var endMs = 900
    @Volatile var running = false
        private set
    @Volatile var startedAt = 0L
        private set
    @Volatile var lastFrameAt = 0L
        private set
    /** He is in the middle of a sentence right now (a timeout should wait for its end). */
    @Volatile var inSentence = false
        private set
    @Volatile var floorDb = -60.0
        private set
    @Volatile var echoOn = false
        private set
    /** Seconds of nothing but zeros (another app took the microphone): AdamService starts the ear again. */
    @Volatile var silencedMs = 0L
        private set
    @Volatile private var muteUntil = 0L
    private var rec: AudioRecord? = null
    private var aec: AcousticEchoCanceler? = null
    private var thread: Thread? = null
    private val worker = Executors.newSingleThreadExecutor()
    private var segSeq = 0

    /** Ignore the microphone for [ms] (Adam's own beep). */
    fun mute(ms: Long) { muteUntil = System.currentTimeMillis() + ms }

    @SuppressLint("MissingPermission")
    fun start(): Boolean {
        stop()
        val min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val size = max(min, RATE * 2)
        var r: AudioRecord? = null
        // the «call» source has the phone's echo canceller and noise handling; the plain one if the phone refuses it
        for (src in intArrayOf(MediaRecorder.AudioSource.VOICE_COMMUNICATION, MediaRecorder.AudioSource.VOICE_RECOGNITION)) {
            try {
                val a = AudioRecord(src, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size)
                if (a.state == AudioRecord.STATE_INITIALIZED) { r = a; break } else a.release()
            } catch (e: Throwable) { log("ear: source $src failed: " + e.message) }
        }
        if (r == null) { log("ear: no microphone"); return false }
        try {
            if (AcousticEchoCanceler.isAvailable()) aec = AcousticEchoCanceler.create(r.audioSessionId)?.also { it.enabled = true }
            echoOn = aec?.enabled == true
        } catch (e: Throwable) { echoOn = false }
        try { r.startRecording() } catch (e: Throwable) { log("ear: start failed: " + e.message); r.release(); return false }
        if (r.recordingState != AudioRecord.RECORDSTATE_RECORDING) { log("ear: not recording"); r.release(); return false }
        rec = r
        running = true
        startedAt = System.currentTimeMillis()
        lastFrameAt = startedAt
        silencedMs = 0
        val t = Thread({ loop(r) }, "adam-ear")
        thread = t
        t.start()
        log("ear on (source " + r.audioSource + ", echo canceller " + (if (echoOn) "on" else "off") + ")")
        return true
    }

    fun stop() {
        running = false
        inSentence = false
        val t = thread; thread = null
        val r = rec; rec = null
        try { t?.join(400) } catch (e: Throwable) { }
        try { r?.stop() } catch (e: Throwable) { }
        try { r?.release() } catch (e: Throwable) { }
        try { aec?.release() } catch (e: Throwable) { }
        aec = null
    }

    fun shutdown() {
        stop()
        worker.shutdown()
    }

    /** A test over adb: [pcm] is handled as if he had just said it. */
    fun inject(pcm: ShortArray) {
        val id = ++segSeq
        worker.execute {
            val a = analyze(pcm)
            main.post { onSegment(Segment(id, pcm, pcm.size * 1000 / RATE, pcm.size * 1000 / RATE, a.vector, a.wake, a.conf, a.words, false)) }
        }
    }

    private fun loop(r: AudioRecord) {
        val frame = ShortArray(FRAME)
        val pre = Ring(PREROLL)
        var seg: Grow? = null
        var voiced = 0
        var voicedOver = 0      // of it, while Adam was speaking
        var silent = 0
        var during = false
        var bargeAsked = false
        var segId = 0
        val loudHistory = BooleanArray(15)
        var hi = 0
        var echo = -70.0
        var zeroSince = 0L
        var lastSpeakAt = 0L
        while (running) {
            val n = try { r.read(frame, 0, FRAME) } catch (e: Throwable) { -1 }
            if (n < 0) { log("ear: read error $n"); break }
            if (n == 0) continue
            val now = System.currentTimeMillis()
            lastFrameAt = now
            val db = dbfs(frame, n)
            if (db <= -99.0) { if (zeroSince == 0L) zeroSince = now; silencedMs = now - zeroSince } else { zeroSince = 0L; silencedMs = 0 }
            val speaking = isSpeaking()
            if (speaking) lastSpeakAt = now
            // Adam's beep, and the room's echo for 0.3 s after he stops, do not start a sentence (the 0.4 s kept before still holds his words)
            val muted = now < muteUntil || (!speaking && now - lastSpeakAt < 300)
            if (seg == null && !muted) {
                // the room's own noise: follows a quieter room at once, a louder one slowly (a voice does not raise it)
                if (!speaking) floorDb = if (db < floorDb) floorDb * 0.8 + db * 0.2 else minOf(floorDb + 0.03, -20.0)
                else echo = echo * 0.9 + db * 0.1
            }
            if (!speaking) echo = -70.0
            val bar = if (speaking) max(floorDb + 12, echo + 9) else floorDb + 10
            val loud = !muted && db > bar && db > -58
            loudHistory[hi] = loud; hi = (hi + 1) % loudHistory.size
            val s = seg
            if (s == null) {
                pre.add(frame, n)
                // over Adam's own voice: 240 ms of the last 300 must be loud; otherwise 60 ms of the last 100
                val window = if (speaking) 15 else 5
                val need = if (speaking) 12 else 3
                if (countLast(loudHistory, hi, window) >= need) {
                    val g = Grow(RATE * 4); g.add(pre.all())
                    seg = g
                    pre.clear()
                    voiced = need * 20; voicedOver = if (speaking) voiced else 0; silent = 0; during = speaking; bargeAsked = false; segId = ++segSeq
                    inSentence = true
                }
            } else {
                s.add(frame, n)
                if (loud) { voiced += 20; silent = 0; if (speaking) voicedOver += 20 } else silent += 20
                if (during && !bargeAsked && voiced >= BARGE_MS && isSpeaking()) {
                    bargeAsked = true
                    val copy = s.copy(); val id = segId
                    worker.execute { val a = analyze(copy); main.post { onBargeIn(id, a.vector) } }
                }
                val ms = s.size * 1000 / RATE
                if (silent >= endMs || ms >= MAX_MS) {
                    // the pause at the end is not sent (only 0.2 s of it)
                    val keep = s.size - max(0, (silent - 200) * RATE / 1000)
                    // «over Adam» only when most of it was while he spoke (his echo); he answering right as Adam ends is HIS sentence
                    val pcm = s.copy(keep); val v = voiced; val id = segId; val d = during && voicedOver * 10 >= voiced * 6
                    seg = null; inSentence = false
                    java.util.Arrays.fill(loudHistory, false)
                    if (v >= MIN_VOICED_MS) worker.execute {
                        val a = analyze(pcm)
                        main.post { onSegment(Segment(id, pcm, pcm.size * 1000 / RATE, v, a.vector, a.wake, a.conf, a.words, d)) }
                    }
                }
            }
        }
        running = false
        inSentence = false
    }

    private class Heard(val vector: FloatArray?, val wake: Boolean, val conf: Double, val words: String)

    /** The voiceprint of [pcm] (the average over the parts the model hears) and whether it starts with «آدم». Worker thread. */
    private fun analyze(pcm: ShortArray): Heard {
        val m = Models.speech ?: return Heard(null, false, 0.0, "")
        return try {
            // 1) «آدم»: the small recognizer limited to the word (cheap). It gives NO voiceprint: with that list everything else is
            //    «[unk]», which the model counts as silence, so the speaker model has no speech frames to use (11-17 first test on the phone:
            //    a clear 1.8 s sentence gave no vector).
            // a NEW recognizer for every sentence: in the diagnosis run (adb FEED diag=1) a new one always gave a voiceprint (135-160
            // frames from 2 s); the one kept between sentences (before this change) never did
            val r = Recognizer(m, RATE.toFloat(), "[\"adam\", \"a dam\", \"[unk]\"]").also { it.setWords(true) }
            val texts = ArrayList<String>()
            var firstWord = ""
            var conf = 0.0
            val results = try { run(r, pcm) } finally { try { r.close() } catch (x: Throwable) { } }
            for (j in results) {
                val t = j.optString("text").trim()
                if (t.isNotEmpty()) texts.add(t)
                val res = j.optJSONArray("result")
                if (firstWord.isEmpty() && res != null && res.length() > 0) {
                    val w = res.getJSONObject(0); firstWord = w.optString("word"); conf = w.optDouble("conf", 0.0)
                }
            }
            val words = texts.joinToString(" ").replace("a dam", "adam").trim()
            val toks = words.split(Regex("\\s+")).filter { it.isNotEmpty() }
            val wake = toks.isNotEmpty() && toks.first() == "adam" && toks.size <= 3
            Heard(voiceprint(m, pcm), wake, conf, words)
        } catch (e: Throwable) {
            log("ear: analysis failed: " + e.message)
            Heard(null, false, 0.0, "")
        }
    }

    /** All the results (JSON) the recognizer gives for [pcm], the last one the final. */
    private fun run(r: Recognizer, pcm: ShortArray): List<JSONObject> {
        val out = ArrayList<JSONObject>()
        var pos = 0
        while (pos < pcm.size) {
            val n = minOf(3200, pcm.size - pos)
            if (r.acceptWaveForm(pcm.copyOfRange(pos, pos + n), n)) out.add(JSONObject(r.result))
            pos += n
        }
        out.add(JSONObject(r.finalResult))
        return out
    }

    /**
     * Debug (adb FEED with diag=1): runs the voiceprint over [pcm] in several ways and logs what each gives (the JSON's size, whether it
     * has «spk», how many frames, how long the words are), to find out why the speaker model gives no vector. Worker thread.
     */
    fun diagnose(pcm: ShortArray) {
        worker.execute {
            val m = Models.speech; val sm = Models.speaker
            if (m == null || sm == null) { log("diag: no models"); return@execute }
            fun variant(name: String, audio: ShortArray, grammar: String?, alts: Int, chunk: Int) {
                var r: Recognizer? = null
                try {
                    r = if (grammar != null) Recognizer(m, RATE.toFloat(), grammar) else Recognizer(m, RATE.toFloat())
                    r.setSpeakerModel(sm)
                    if (alts > 0) r.setMaxAlternatives(alts)
                    val parts = ArrayList<String>()
                    var pos = 0
                    while (pos < audio.size) {
                        val n = minOf(chunk, audio.size - pos)
                        if (r.acceptWaveForm(audio.copyOfRange(pos, pos + n), n)) parts.add(r.result)
                        pos += n
                    }
                    parts.add(r.finalResult)
                    val sb = StringBuilder()
                    for (p in parts) {
                        val o = JSONObject(p)
                        val txt = o.optString("text").ifEmpty { o.optJSONArray("alternatives")?.optJSONObject(0)?.optString("text") ?: "" }
                        sb.append(" [len ").append(p.length).append(" spk ").append(o.has("spk") || (o.optJSONArray("alternatives")?.optJSONObject(0)?.has("spk") == true))
                            .append(" frames ").append(o.optInt("spk_frames", -1)).append(" words ").append(txt.split(' ').filter { it.isNotEmpty() }.size).append("]")
                    }
                    log("diag $name:$sb")
                } catch (e: Throwable) { log("diag $name failed: " + e.message) } finally { try { r?.close() } catch (x: Throwable) { } }
            }
            val n = pcm.size
            val loud = ShortArray(n) { (pcm[it] * 4).coerceIn(-32768, 32767).toShort() }
            val padded = ShortArray(n + RATE) .also { System.arraycopy(pcm, 0, it, RATE / 2, n) }
            log("diag: " + (n * 1000 / RATE) + " ms")
            variant("A full 3200", pcm, null, 0, 3200)
            variant("B full whole", pcm, null, 0, n)
            variant("C full x4 gain", loud, null, 0, 3200)
            variant("D full padded 0.5s", padded, null, 0, 3200)
            variant("E full nbest1", pcm, null, 1, 3200)
            variant("F grammar", pcm, "[\"adam\", \"a dam\", \"[unk]\"]", 0, 3200)
            variant("G grammar adam+unk+words", pcm, "[\"the\", \"a\", \"is\", \"adam\", \"[unk]\"]", 0, 3200)
        }
    }

    /**
     * 2) His voiceprint: the speaker model on a recognizer with the WHOLE vocabulary (real words count as speech, even if the English
     * model does not know the Arabic ones), averaged over the parts of the sentence, weighted by their speech frames. null when the
     * sentence is too short for the model (it is logged).
     */
    private fun voiceprint(m: org.vosk.Model, pcm: ShortArray): FloatArray? {
        val sm = Models.speaker ?: return null
        if (pcm.size < RATE * 6 / 10) return null
        var r: Recognizer? = null
        return try {
            r = Recognizer(m, RATE.toFloat()).also { it.setSpeakerModel(sm) }
            var acc: FloatArray? = null
            var frames = 0
            var parts = 0
            for (j in run(r, pcm)) {
                parts++
                val spk = j.optJSONArray("spk") ?: continue
                val f = j.optInt("spk_frames", 1).coerceAtLeast(1)
                val v = Voiceprint.toFloats(spk)
                val a = acc ?: FloatArray(v.size).also { acc = it }
                if (a.size != v.size) continue
                for (i in v.indices) a[i] += v[i] * f
                frames += f
            }
            val a = acc
            if (a == null || frames <= 0) { log("ear: no voiceprint from " + (pcm.size * 1000 / RATE) + " ms (" + parts + " parts)"); null }
            else FloatArray(a.size) { a[it] / frames }
        } catch (e: Throwable) {
            log("ear: voiceprint failed: " + e.message)
            null
        } finally {
            try { r?.close() } catch (x: Throwable) { }
        }
    }

    private fun dbfs(f: ShortArray, n: Int): Double {
        var s = 0.0
        for (i in 0 until n) { val x = f[i].toDouble(); s += x * x }
        val rms = sqrt(s / n)
        return if (rms < 1.0) -100.0 else 20 * log10(rms / 32768.0)
    }

    private fun countLast(h: BooleanArray, next: Int, window: Int): Int {
        var c = 0
        for (k in 1..window) if (h[(next - k + h.size) % h.size]) c++
        return c
    }

    /** The last [cap] samples. */
    private class Ring(cap: Int) {
        private val buf = ShortArray(cap)
        private var pos = 0
        private var full = false
        fun add(f: ShortArray, n: Int) { for (i in 0 until n) { buf[pos] = f[i]; pos = (pos + 1) % buf.size; if (pos == 0) full = true } }
        fun all(): ShortArray = if (!full) buf.copyOfRange(0, pos) else ShortArray(buf.size) { buf[(pos + it) % buf.size] }
        fun clear() { pos = 0; full = false }
    }

    /** A growing list of samples. */
    private class Grow(cap: Int) {
        private var a = ShortArray(cap)
        var size = 0
            private set
        fun add(f: ShortArray, n: Int = f.size) {
            if (size + n > a.size) a = a.copyOf(max(a.size * 2, size + n))
            System.arraycopy(f, 0, a, size, n); size += n
        }
        fun copy(len: Int = size): ShortArray = a.copyOf(len.coerceIn(0, size))
    }
}
