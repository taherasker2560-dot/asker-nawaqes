package com.askerpharmacy.alarm

import java.util.Calendar
import java.util.TimeZone

// «منبه الدوا» app: the pure part (no Android): which moment rings next and what is due at it. Tested by PlanTest.

/** one medicine's alarm as the page keeps it: the name as it is SAID («فيموجيسال ق» → «فيموجيسال») and its clock times «HH:mm» on this phone's clock */
data class Alarm(val id: String, val spoken: String, val times: List<String>)

/** «ذكّرني بعد 10 دقايق»: this alarm rings again at that moment (epoch millis) */
data class Snooze(val id: String, val at: Long)

/** the next moment the phone must ring (epoch millis) */
data class Trigger(val at: Long)

object Plan {
    const val SNOOZE_MIN = 10

    fun minutesOf(hhmm: String): Int? {
        val m = Regex("^(\\d{1,2}):(\\d{2})$").find(hhmm.trim()) ?: return null
        val h = m.groupValues[1].toInt()
        val mi = m.groupValues[2].toInt()
        return if (h in 0..23 && mi in 0..59) h * 60 + mi else null
    }

    /** the first moment strictly after [now] at which the clock of [zone] shows [hhmm] (today, or tomorrow when it has passed) */
    fun nextAt(hhmm: String, now: Long, zone: TimeZone): Long? {
        val min = minutesOf(hhmm) ?: return null
        val c = Calendar.getInstance(zone)
        c.timeInMillis = now
        c.set(Calendar.HOUR_OF_DAY, min / 60)
        c.set(Calendar.MINUTE, min % 60)
        c.set(Calendar.SECOND, 0)
        c.set(Calendar.MILLISECOND, 0)
        if (c.timeInMillis <= now) c.add(Calendar.DAY_OF_YEAR, 1)
        return c.timeInMillis
    }

    /** the earliest moment after [now]: a time of an alarm, or a snooze that is over (it rings in two seconds) */
    fun next(alarms: List<Alarm>, snoozes: List<Snooze>, now: Long, zone: TimeZone): Trigger? {
        var best: Long? = null
        for (a in alarms) for (t in a.times) {
            val at = nextAt(t, now, zone) ?: continue
            if (best == null || at < best) best = at
        }
        for (s in snoozes) {
            if (alarms.none { it.id == s.id }) continue
            val at = if (s.at > now) s.at else now + 2000
            if (best == null || at < best) best = at
        }
        return best?.let { Trigger(it) }
    }

    /** the ids of what rings at the moment [at] that was set: the alarms that have a time at that minute, and the snoozes that are over by then */
    fun due(alarms: List<Alarm>, snoozes: List<Snooze>, at: Long, zone: TimeZone): List<String> {
        val out = LinkedHashSet<String>()
        for (a in alarms) if (a.times.any { nextAt(it, at - 1, zone) == at }) out.add(a.id)
        for (s in snoozes) if (s.at <= at + 1000 && alarms.any { it.id == s.id }) out.add(s.id)
        return out.toList()
    }

    /** «ميعاد A، وB الآن، خدمة مقدمة من صيدلية عسكر»: what the phone says (the same words as the page) */
    fun sentence(names: List<String>): String = "ميعاد " + names.joinToString("، و") + " الآن، خدمة مقدمة من صيدلية عسكر"

    /** the notification's title: «⏰ ميعاد A، وB الآن» */
    fun title(names: List<String>): String = "⏰ ميعاد " + names.joinToString("، و") + " الآن"
}
