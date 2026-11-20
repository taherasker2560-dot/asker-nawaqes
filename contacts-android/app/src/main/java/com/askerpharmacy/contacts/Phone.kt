package com.askerpharmacy.contacts

import org.json.JSONArray

/** The plain rules of the app (no Android here, so they are tested with JUnit): the JSON it sends, what it reads back, when the 10 days are over, how contacts are grouped. */
object Phone {
    const val SNAPSHOT_DAYS = 10
    const val CHUNK = 250

    /** One contact of the phone: its own id, its name, its numbers (as written there). */
    data class Row(val id: Long, val name: String, val phones: List<String>)

    /** A number the system wants written into the phone. */
    data class Pending(val phone: String, val name: String)

    /** A string as JSON text (quotes, backslashes and control characters escaped). */
    fun quote(s: String): String {
        val b = StringBuilder("\"")
        for (ch in s) {
            when {
                ch == '"' -> b.append("\\\"")
                ch == '\\' -> b.append("\\\\")
                ch == '\n' -> b.append("\\n")
                ch == '\r' -> b.append("\\r")
                ch == '\t' -> b.append("\\t")
                ch < ' ' -> b.append(String.format("\\u%04x", ch.code))
                else -> b.append(ch)
            }
        }
        return b.append('"').toString()
    }

    fun listJson(items: List<String>): String = items.joinToString(",", "[", "]") { quote(it) }

    /** The contacts as the server wants them: [{"id":1,"name":"…","phones":["…"]}]; a name is cut at 200 characters, a number at 40, at most 20 numbers a contact. */
    fun rowsJson(rows: List<Row>): String = rows.joinToString(",", "[", "]") { r ->
        "{\"id\":${r.id},\"name\":${quote(r.name.take(200))},\"phones\":${listJson(r.phones.take(20).map { it.take(40) })}}"
    }

    /** What the server answers to «what is waiting for the phone»: [{"phone":"…","name":"…"}]; a row with no number or no name is dropped. */
    fun parsePending(json: String): List<Pending> {
        val a = JSONArray(if (json.isBlank()) "[]" else json)
        val out = ArrayList<Pending>()
        for (i in 0 until a.length()) {
            val o = a.getJSONObject(i)
            val p = Pending(o.optString("phone", "").trim(), o.optString("name", "").trim())
            if (p.phone.isNotEmpty() && p.name.isNotEmpty()) out.add(p)
        }
        return out
    }

    /** The phone's contacts are sent again when 10 days passed since the last time (or never). */
    fun dueSnapshot(last: Long, now: Long, days: Int = SNAPSHOT_DAYS): Boolean = last <= 0L || now - last >= days * 86_400_000L

    fun chunks(rows: List<Row>): List<List<Row>> = rows.chunked(CHUNK)

    /** This phone's key as the system makes it: 32 to 128 lower-case hex characters. */
    fun validKey(k: String): Boolean = Regex("^[0-9a-f]{32,128}\$").matches(k)

    /** One line per (contact id, name, number) from the phone's list of numbers → one contact each, with its numbers in order and no number twice; the name is the first one that is not blank. */
    fun group(raw: List<Triple<Long, String, String>>): List<Row> {
        val names = LinkedHashMap<Long, String>()
        val phones = LinkedHashMap<Long, MutableList<String>>()
        for ((id, name, number) in raw) {
            val n = number.trim()
            if (n.isEmpty()) continue
            if (names[id].isNullOrBlank()) names[id] = name.trim()
            val l = phones.getOrPut(id) { ArrayList() }
            if (n !in l) l.add(n)
        }
        return phones.map { (id, l) -> Row(id, names[id] ?: "", l) }
    }
}
