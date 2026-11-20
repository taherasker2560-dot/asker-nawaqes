package com.askerpharmacy.contacts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneTest {
    @Test fun quoteEscapesWhatJsonNeeds() {
        assertEquals("\"a\\\"b\\\\c\\nd\"", Phone.quote("a\"b\\c\nd"))
        assertEquals("\"\\u0001\"", Phone.quote("\u0001"))
        assertEquals("\"عميل ١٢١\"", Phone.quote("عميل ١٢١"))
    }

    @Test fun rowsJsonIsWhatTheServerReads() {
        val rows = listOf(Phone.Row(7, "احمد \"الكبير\"", listOf("0100 123 4567", "+20 101 000 0000")), Phone.Row(8, "x", listOf("123")))
        val j = org.json.JSONArray(Phone.rowsJson(rows))
        assertEquals(2, j.length())
        assertEquals(7L, j.getJSONObject(0).getLong("id"))
        assertEquals("احمد \"الكبير\"", j.getJSONObject(0).getString("name"))
        assertEquals("+20 101 000 0000", j.getJSONObject(0).getJSONArray("phones").getString(1))
        assertEquals("[]", Phone.rowsJson(emptyList()))
    }

    @Test fun rowsJsonCutsWhatIsTooLong() {
        val r = Phone.Row(1, "n".repeat(300), (1..30).map { "1".repeat(60) })
        val o = org.json.JSONArray(Phone.rowsJson(listOf(r))).getJSONObject(0)
        assertEquals(200, o.getString("name").length)
        assertEquals(20, o.getJSONArray("phones").length())
        assertEquals(40, o.getJSONArray("phones").getString(0).length)
    }

    @Test fun parsePendingKeepsOnlyCompleteRows() {
        val got = Phone.parsePending("""[{"phone":"01012345678","name":"عميل ١٢٦"},{"phone":"","name":"x"},{"phone":"01099998888","name":" "},{"phone":" 0111 ","name":" سيد "}]""")
        assertEquals(listOf(Phone.Pending("01012345678", "عميل ١٢٦"), Phone.Pending("0111", "سيد")), got)
        assertTrue(Phone.parsePending("").isEmpty())
        assertTrue(Phone.parsePending("[]").isEmpty())
    }

    @Test fun tenDays() {
        val day = 86_400_000L
        assertTrue(Phone.dueSnapshot(0, 5 * day))
        assertFalse(Phone.dueSnapshot(1 * day, 10 * day))
        assertTrue(Phone.dueSnapshot(1 * day, 11 * day))
        assertTrue(Phone.dueSnapshot(1 * day, 12 * day))
    }

    @Test fun chunksOf250() {
        val rows = (1..600L).map { Phone.Row(it, "n$it", listOf("0100000$it")) }
        assertEquals(listOf(250, 250, 100), Phone.chunks(rows).map { it.size })
        assertTrue(Phone.chunks(emptyList()).isEmpty())
    }

    @Test fun keyIsHex() {
        assertTrue(Phone.validKey("ab".repeat(32)))
        assertFalse(Phone.validKey("ab".repeat(8)))
        assertFalse(Phone.validKey("AB".repeat(32)))
        assertFalse(Phone.validKey("zz".repeat(32)))
        assertFalse(Phone.validKey("ab".repeat(32) + "\n"))
    }

    @Test fun groupMakesOneContactWithItsNumbers() {
        val raw = listOf(
            Triple(5L, "احمد", "0100 111"), Triple(5L, "احمد", "0100 222"), Triple(5L, "احمد", "0100 111"),
            Triple(6L, "", "0111 333"), Triple(6L, "سيد", "0111 333"), Triple(9L, "فاضي", "  "), Triple(7L, "مها", "0122 444"))
        val g = Phone.group(raw)
        assertEquals(listOf(5L, 6L, 7L), g.map { it.id })
        assertEquals(listOf("0100 111", "0100 222"), g[0].phones)
        assertEquals("سيد", g[1].name)
        assertEquals(listOf("0111 333"), g[1].phones)
        assertEquals("مها", g[2].name)
    }
}
