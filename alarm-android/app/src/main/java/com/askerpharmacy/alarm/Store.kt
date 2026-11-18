package com.askerpharmacy.alarm

import android.content.Context
import java.io.File
import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject

/** What the app keeps on this phone (and nowhere else): the enabled alarms the page sent, the «speak» switch, the snoozes, and the sentence sound files. */
class Store(context: Context) {
    private val ctx = context.applicationContext
    private val p = ctx.getSharedPreferences("asker_alarm", Context.MODE_PRIVATE)

    fun alarms(): List<Alarm> = try {
        val arr = JSONArray(p.getString("alarms", "[]") ?: "[]")
        (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            val id = o.optString("id")
            val spoken = o.optString("spoken").trim()
            val ts = o.optJSONArray("times") ?: JSONArray()
            val times = (0 until ts.length()).map { ts.optString(it) }.filter { Plan.minutesOf(it) != null }
            if (id.isEmpty() || spoken.isEmpty() || times.isEmpty()) null else Alarm(id, spoken, times)
        }
    } catch (e: Exception) {
        emptyList()
    }

    var speak: Boolean
        get() = p.getBoolean("speak", true)
        set(v) { p.edit().putBoolean("speak", v).apply() }

    /** from the page: {"speak":true,"items":[{"id","spoken","times":[..]}]} (only the alarms that are ON) */
    fun setFromPage(json: String): Boolean = try {
        val o = JSONObject(json)
        val items = o.optJSONArray("items") ?: JSONArray()
        val keep = JSONArray()
        for (i in 0 until minOf(items.length(), 40)) {
            val it = items.optJSONObject(i) ?: continue
            keep.put(JSONObject().put("id", it.optString("id")).put("spoken", it.optString("spoken")).put("times", it.optJSONArray("times") ?: JSONArray()))
        }
        // a snooze of an alarm that is gone is dropped
        val ids = (0 until keep.length()).map { keep.getJSONObject(it).optString("id") }.toSet()
        p.edit().putString("alarms", keep.toString()).putBoolean("speak", o.optBoolean("speak", true)).apply()
        setSnoozes(snoozes().filter { it.id in ids })
        true
    } catch (e: Exception) {
        false
    }

    fun snoozes(): List<Snooze> = try {
        val arr = JSONArray(p.getString("snoozes", "[]") ?: "[]")
        (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let { Snooze(it.optString("id"), it.optLong("at")) } }
    } catch (e: Exception) {
        emptyList()
    }

    fun setSnoozes(list: List<Snooze>) {
        val arr = JSONArray()
        list.takeLast(40).forEach { arr.put(JSONObject().put("id", it.id).put("at", it.at)) }
        p.edit().putString("snoozes", arr.toString()).apply()
    }

    /** the alarms the customer made in the browser before he installed the app (sent in the link that opened the app): the page takes them over once */
    var seed: String
        get() = p.getString("seed", "") ?: ""
        set(v) { p.edit().putString("seed", v).apply() }

    // ---- «جرّب منبه حقيقي» (SelfTest): when its alarm was set for and what came of it ----
    var selftestAt: Long
        get() = p.getLong("selftest_at", 0L)
        set(v) { p.edit().putLong("selftest_at", v).apply() }

    var selftestState: String
        get() = p.getString("selftest_state", "") ?: ""
        set(v) { p.edit().putString("selftest_state", v).apply() }

    // ---- what happened at the last rings (the page's «🔍 فحص المنبه» shows it in plain Arabic: the facts instead of guesses) ----
    fun log(msg: String) {
        try {
            val old = ringLog()
            val line = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(java.util.Date()) + " " + msg.replace("\n", " ").take(90)
            p.edit().putString("ringlog", (old + line).takeLast(16).joinToString("\n")).apply()
        } catch (e: Exception) {
            // a log must never stop a ring
        }
    }

    fun ringLog(): List<String> = (p.getString("ringlog", "") ?: "").split("\n").filter { it.isNotEmpty() }

    // ---- the sentence sounds (made by the server, handed over by the page) ----
    private fun voiceDir(): File = File(ctx.filesDir, "voice").also { it.mkdirs() }

    fun voiceFile(name: String): File {
        val h = MessageDigest.getInstance("SHA-1").digest(name.trim().toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        return File(voiceDir(), "$h.wav")
    }

    fun hasVoice(name: String): Boolean = voiceFile(name).let { it.isFile && it.length() > 1000 }

    fun saveVoice(name: String, bytes: ByteArray): Boolean = try {
        if (bytes.size < 1000 || bytes.size > 3_000_000) false
        else { voiceFile(name).writeBytes(bytes); true }
    } catch (e: Exception) {
        false
    }
}
