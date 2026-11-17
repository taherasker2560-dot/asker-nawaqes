package com.askerpharmacy.adam

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.sqrt

/**
 * His voiceprint («آدم 3», owner 2026-11-17: «عايز يشتغل على بصمة صوتي انا بس»): kept ONLY on the phone (files/voiceprint.json).
 * Made once from 8 sentences he repeats after Adam, then improved by itself from his clear sentences in a conversation.
 * Each sentence gets a score (how close its voice is to his, -1..1, the cosine of the two voiceprints); under the bar = not him.
 *  - The bar is set from his own sentences (the farthest of them, a bit lower), and is lower for a short sentence («آدم»، «أيوه»).
 *  - The first 2 days are «learning»: only voices far from his are stopped; his real sentences in the pharmacy (noise, phone in the
 *    pocket) are counted, and at the end of the 2 days the bar is set again from them.
 * Main thread only (the scores come from the Ear's worker and are posted to the main thread).
 */
object Voiceprint {
    private const val LEARN_MS = 2 * 24 * 3600 * 1000L
    private const val MAX_VECTORS = 40
    private const val SHORT_MS = 1200
    private const val SHORT_DROP = 0.10f
    private const val LEARN_DROP = 0.20f

    private var loaded = false
    private val vectors = ArrayList<FloatArray>()     // the enrollment ones first, then the ones learned
    private var enrolledCount = 0
    private var mean: FloatArray? = null
    var bar = 0.5f
        private set
    var enrolledAt = 0L
        private set
    var learnUntil = 0L
        private set
    private var recalibrated = false
    private val his = ArrayList<Float>()                // scores of his sentences in a conversation (for the new bar after learning)
    val recent = ArrayList<String>()                    // the last scores, for the status (adb)

    private fun file(c: Context) = File(c.filesDir, "voiceprint.json")

    fun load(c: Context) {
        if (loaded) return
        loaded = true
        try {
            val f = file(c)
            if (!f.exists()) return
            val o = JSONObject(f.readText())
            vectors.clear()
            val a = o.getJSONArray("vectors")
            for (i in 0 until a.length()) vectors.add(toFloats(a.getJSONArray(i)))
            enrolledCount = o.optInt("enrolled", vectors.size)
            bar = o.optDouble("bar", 0.5).toFloat()
            enrolledAt = o.optLong("enrolled_at")
            learnUntil = o.optLong("learn_until")
            recalibrated = o.optBoolean("recalibrated")
            his.clear()
            o.optJSONArray("his")?.let { h -> for (i in 0 until h.length()) his.add(h.getDouble(i).toFloat()) }
            mean = average(vectors)
        } catch (e: Throwable) { vectors.clear(); mean = null }
    }

    private fun save(c: Context) {
        try {
            val a = JSONArray(); for (v in vectors) a.put(toJson(v))
            val h = JSONArray(); for (s in his.takeLast(200)) h.put(s.toDouble())
            file(c).writeText(JSONObject().put("vectors", a).put("enrolled", enrolledCount).put("bar", bar.toDouble())
                .put("enrolled_at", enrolledAt).put("learn_until", learnUntil).put("recalibrated", recalibrated).put("his", h).toString())
        } catch (e: Throwable) { }
    }

    val enrolled: Boolean get() = mean != null
    fun learning(now: Long = System.currentTimeMillis()): Boolean = enrolled && now < learnUntil

    /** How close [v] is to his voice (-1..1); -2 when there is no voiceprint or no vector. */
    fun score(v: FloatArray?): Float {
        val m = mean ?: return -2f
        if (v == null || v.size != m.size) return -2f
        return cos(v, m)
    }

    /** The bar for a sentence of [ms] milliseconds (lower while learning and for short sentences). */
    fun barFor(ms: Int, now: Long = System.currentTimeMillis()): Float {
        var b = bar
        if (ms < SHORT_MS) b -= SHORT_DROP
        if (learning(now)) b -= LEARN_DROP
        return b
    }

    /** Is it his voice? No voiceprint yet = everyone is accepted (as before «آدم 3»). A sentence without a vector is not him. */
    fun accepts(score: Float, ms: Int): Boolean {
        if (!enrolled) return true
        if (score <= -2f) return false
        return score >= barFor(ms)
    }

    fun note(score: Float, ms: Int, ok: Boolean, where: String) {
        recent.add(where + " " + ms + "ms " + "%.2f".format(score) + (if (ok) " ✓" else " ✗"))
        while (recent.size > 30) recent.removeAt(0)
    }

    /**
     * Makes the voiceprint from his enrollment sentences. A sentence far from the others (someone else talked, a noise) is dropped.
     * Returns null when there are too few good ones (he is asked to do it again).
     */
    fun enroll(c: Context, list: List<FloatArray>, now: Long = System.currentTimeMillis()): String? {
        val good = list.filter { it.isNotEmpty() }.toMutableList()
        if (good.size < 5) return null
        // leave-one-out: each sentence against the others
        fun loo(vs: List<FloatArray>): List<Float> = vs.indices.map { i -> cos(vs[i], average(vs.filterIndexed { j, _ -> j != i })!!) }
        var scores = loo(good)
        val med = scores.sorted()[scores.size / 2]
        val keep = good.filterIndexed { i, _ -> scores[i] >= med - 0.15f }
        if (keep.size < 5) return null
        scores = loo(keep)
        vectors.clear(); vectors.addAll(keep)
        enrolledCount = keep.size
        mean = average(vectors)
        bar = (scores.minOrNull()!! - 0.08f).coerceIn(0.20f, 0.85f)
        enrolledAt = now
        learnUntil = now + LEARN_MS
        recalibrated = false
        his.clear()
        save(c)
        return "kept ${keep.size} of ${list.size}, own scores " + scores.joinToString(",") { "%.2f".format(it) } + ", bar " + "%.2f".format(bar)
    }

    /**
     * One of his sentences in a conversation (he called Adam and answered him): counted for the new bar, and a clear long one also
     * improves the voiceprint itself. After the 2 learning days the bar is set once from these (the 10% lowest of his, a bit lower).
     */
    fun learn(c: Context, v: FloatArray?, score: Float, ms: Int, now: Long = System.currentTimeMillis()): String? {
        if (!enrolled || v == null || score <= -2f) return null
        his.add(score); while (his.size > 200) his.removeAt(0)
        var said: String? = null
        if (ms >= 1500 && score >= bar + 0.05f) {
            vectors.add(v)
            // the enrollment ones stay; the oldest learned one goes
            while (vectors.size > MAX_VECTORS) vectors.removeAt(enrolledCount.coerceAtMost(vectors.size - 1))
            mean = average(vectors)
        }
        if (!recalibrated && now >= learnUntil && his.size >= 30) {
            val sorted = his.sorted()
            val p10 = sorted[sorted.size / 10]
            val old = bar
            bar = minOf(bar, p10 - 0.02f).coerceIn(0.20f, 0.85f)
            recalibrated = true
            said = "voiceprint bar after learning: %.2f → %.2f (from %d of his sentences)".format(old, bar, his.size)
        }
        save(c)
        return said
    }

    /** Over adb: a new bar, or forget the voiceprint. */
    fun setBar(c: Context, b: Float) { if (b in 0.05f..0.95f) { bar = b; save(c) } }
    fun endLearning(c: Context) { learnUntil = 0; save(c) }
    fun forget(c: Context) { vectors.clear(); mean = null; enrolledCount = 0; his.clear(); try { file(c).delete() } catch (e: Throwable) { } }

    fun describe(): JSONObject = JSONObject().put("enrolled", enrolled).put("vectors", vectors.size).put("bar", bar.toDouble())
        .put("learning", learning()).put("learn_until", learnUntil).put("his", his.size).put("recent", JSONArray(recent.takeLast(12)))

    // ---------- maths ----------
    private fun norm(v: FloatArray): FloatArray {
        var s = 0.0; for (x in v) s += x * x
        val n = sqrt(s).toFloat().takeIf { it > 1e-9f } ?: return v.copyOf()
        return FloatArray(v.size) { v[it] / n }
    }

    private fun average(vs: List<FloatArray>): FloatArray? {
        if (vs.isEmpty()) return null
        val d = vs[0].size
        val m = FloatArray(d)
        for (v in vs) { if (v.size != d) continue; val u = norm(v); for (i in 0 until d) m[i] += u[i] }
        return norm(m)
    }

    fun cos(a: FloatArray, b: FloatArray): Float {
        if (a.size != b.size || a.isEmpty()) return -2f
        var d = 0.0; var na = 0.0; var nb = 0.0
        for (i in a.indices) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
        if (na <= 0 || nb <= 0) return -2f
        return (d / (sqrt(na) * sqrt(nb))).toFloat()
    }

    fun toFloats(a: JSONArray): FloatArray = FloatArray(a.length()) { a.getDouble(it).toFloat() }
    private fun toJson(v: FloatArray): JSONArray { val a = JSONArray(); for (x in v) a.put(x.toDouble()); return a }
}
