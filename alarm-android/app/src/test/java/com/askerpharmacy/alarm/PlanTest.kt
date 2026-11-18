package com.askerpharmacy.alarm

import java.util.Calendar
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlanTest {
    private val cairo: TimeZone = TimeZone.getTimeZone("Africa/Cairo")
    private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int, s: Int = 0): Long {
        val c = Calendar.getInstance(cairo)
        c.clear()
        c.set(y, mo - 1, d, h, mi, s)
        return c.timeInMillis
    }

    private val a = Alarm("a1", "فيموجيسال", listOf("08:00", "20:00"))
    private val b = Alarm("a2", "بنادول", listOf("14:00", "08:00"))

    @Test fun minutesParse() {
        assertEquals(480, Plan.minutesOf("08:00"))
        assertEquals(480, Plan.minutesOf("8:00"))
        assertEquals(1439, Plan.minutesOf("23:59"))
        assertNull(Plan.minutesOf("24:00"))
        assertNull(Plan.minutesOf("12:60"))
        assertNull(Plan.minutesOf("x"))
    }

    @Test fun nextIsTodayOrTomorrow() {
        val now = at(2026, 11, 18, 7, 59, 30)
        assertEquals(at(2026, 11, 18, 8, 0), Plan.nextAt("08:00", now, cairo))
        assertEquals(at(2026, 11, 19, 8, 0), Plan.nextAt("08:00", at(2026, 11, 18, 8, 0), cairo))   // at the minute itself: tomorrow (it just rang)
        assertEquals(at(2026, 11, 19, 8, 0), Plan.nextAt("08:00", at(2026, 11, 18, 9, 30), cairo))
    }

    @Test fun earliestOfAll() {
        val now = at(2026, 11, 18, 9, 0)
        assertEquals(at(2026, 11, 18, 14, 0), Plan.next(listOf(a, b), emptyList(), now, cairo)!!.at)
        assertEquals(at(2026, 11, 19, 8, 0), Plan.next(listOf(a), emptyList(), at(2026, 11, 18, 21, 0), cairo)!!.at)
        assertNull(Plan.next(emptyList(), emptyList(), now, cairo))
        assertNull(Plan.next(listOf(Alarm("x", "س", emptyList())), emptyList(), now, cairo))
    }

    @Test fun twoAlarmsAtTheSameMinuteRingTogether() {
        val t = at(2026, 11, 18, 8, 0)
        assertEquals(listOf("a1", "a2"), Plan.due(listOf(a, b), emptyList(), t, cairo))
        assertEquals(listOf("a2"), Plan.due(listOf(a, b), emptyList(), at(2026, 11, 18, 14, 0), cairo))
        assertEquals(emptyList<String>(), Plan.due(listOf(a, b), emptyList(), at(2026, 11, 18, 9, 0), cairo))
    }

    @Test fun snoozeComesBack() {
        val now = at(2026, 11, 18, 8, 1)
        val s = Snooze("a1", at(2026, 11, 18, 8, 10, 20))
        assertEquals(s.at, Plan.next(listOf(a), listOf(s), now, cairo)!!.at)
        assertEquals(listOf("a1"), Plan.due(listOf(a), listOf(s), s.at, cairo))
        // a snooze that is already over rings in two seconds
        assertEquals(now + 2000, Plan.next(listOf(a), listOf(Snooze("a1", now - 5000)), now, cairo)!!.at)
        // a snooze of an alarm that is gone is ignored
        assertEquals(at(2026, 11, 18, 20, 0), Plan.next(listOf(a), listOf(Snooze("zzz", now + 1000)), now, cairo)!!.at)
    }

    @Test fun sentenceIsTheSameAsThePage() {
        assertEquals("ميعاد فيموجيسال الآن، خدمة مقدمة من صيدلية عسكر", Plan.sentence(listOf("فيموجيسال")))
        assertEquals("ميعاد أ، وب الآن، خدمة مقدمة من صيدلية عسكر", Plan.sentence(listOf("أ", "ب")))
        assertEquals("⏰ ميعاد أ، وب الآن", Plan.title(listOf("أ", "ب")))
    }
}
