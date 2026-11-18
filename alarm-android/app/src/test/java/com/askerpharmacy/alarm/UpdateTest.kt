package com.askerpharmacy.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateTest {
    private val sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

    @Test fun theVersionFileIsRead() {
        val i = AppUpdate.parse("{\"code\":9,\"name\":\"1.8\",\"size\":660681,\"sha256\":\"$sha\"}")
        assertNotNull(i)
        assertEquals(9, i!!.code)
        assertEquals("1.8", i.name)
        assertEquals(660681L, i.size)
        assertEquals(sha, i.sha256)
    }

    @Test fun anySpacingOfTheJsonIsRead() {
        val i = AppUpdate.parse("{ \"code\" : 12 ,\n  \"name\" : \"2.0-rc1\" ,\n \"size\": 5 }")
        assertNotNull(i)
        assertEquals(12, i!!.code)
        assertEquals("2.0-rc1", i.name)
        assertEquals("", i.sha256)
    }

    @Test fun aFileWithoutACodeIsNothing() {
        assertNull(AppUpdate.parse(""))
        assertNull(AppUpdate.parse("<html>Not Found</html>"))
        assertNull(AppUpdate.parse("{\"name\":\"1.8\"}"))
    }

    @Test fun aBadShaOrNameIsIgnoredNotTrusted() {
        val i = AppUpdate.parse("{\"code\":9,\"name\":\"1.8\\\";rm\",\"sha256\":\"XYZ\"}")
        assertNotNull(i)
        assertEquals("", i!!.sha256)
        assertEquals("", i.name)
    }

    @Test fun onlyANewerVersionIsRequired() {
        assertTrue(AppUpdate.newer(9, 8))
        assertFalse(AppUpdate.newer(9, 9))
        assertFalse(AppUpdate.newer(8, 9))
        assertFalse(AppUpdate.newer(0, 9))
    }

    @Test fun theFileIsReadEverySixHoursAndAFailedTryWaitsTenMinutes() {
        val h = 3_600_000L
        val now = 100 * h
        assertTrue("first run", AppUpdate.checkDue(0L, 0L, now))
        assertFalse("read 2 hours ago", AppUpdate.checkDue(now - 2 * h, 0L, now))
        assertTrue("read 7 hours ago", AppUpdate.checkDue(now - 7 * h, 0L, now))
        assertFalse("a try failed 5 minutes ago", AppUpdate.checkDue(now - 7 * h, now - 5 * 60_000, now))
        assertTrue("a try failed 15 minutes ago", AppUpdate.checkDue(now - 7 * h, now - 15 * 60_000, now))
        assertTrue("a clock that went back never blocks it", AppUpdate.checkDue(now + 9 * h, now + 9 * h, now))
    }

    @Test fun everyErrorHasPlainArabicWords() {
        for (c in listOf("net", "corrupt", "disk", "install", "whatever")) assertTrue(c, AppUpdate.errorText(c).length > 10)
        assertTrue(AppUpdate.errorText("net").contains("إنترنت"))
    }
}
