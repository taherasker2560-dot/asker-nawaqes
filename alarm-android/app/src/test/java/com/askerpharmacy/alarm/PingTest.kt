package com.askerpharmacy.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PingTest {
    @Test fun theIdIs32LowercaseHexAndNeverTheSameTwice() {
        val a = AppPing.newId()
        val b = AppPing.newId()
        assertTrue(a, AppPing.validId(a))
        assertEquals(32, a.length)
        assertNotEquals(a, b)
    }

    @Test fun onlyAWellFormedIdIsAccepted() {
        assertFalse(AppPing.validId(null))
        assertFalse(AppPing.validId(""))
        assertFalse(AppPing.validId("ABCDEF0123456789abcdef0123456789"))   // capitals are not what the server takes
        assertFalse(AppPing.validId("abcdef0123456789abcdef012345678"))    // 31
        assertTrue(AppPing.validId("abcdef0123456789abcdef0123456789"))
    }

    @Test fun theBodyHasTheIdAndTheVersionAndNothingElse() {
        assertEquals("{\"p_id\":\"abcdef0123456789abcdef0123456789\",\"p_version\":\"1.7\"}", AppPing.body("abcdef0123456789abcdef0123456789", "1.7"))
    }

    @Test fun theVersionIsCleanedAndCut() {
        assertEquals("1.7-debug", AppPing.cleanVersion("1.7-debug"))
        assertEquals("1.7", AppPing.cleanVersion("1.7\"} ; "))
        assertEquals("", AppPing.cleanVersion(null))
        assertEquals(20, AppPing.cleanVersion("1".repeat(50)).length)
    }

    @Test fun theServersAnswerIsReadWhateverItsSpacing() {
        assertTrue(AppPing.accepted("{\"ok\":true}"))
        assertTrue(AppPing.accepted("{\"ok\": true}"))
        assertFalse(AppPing.accepted("{\"ok\":false,\"error\":\"busy\"}"))
        assertFalse(AppPing.accepted("{\"ok\": false, \"error\": \"id\"}"))
        assertFalse(AppPing.accepted(""))
    }

    @Test fun aPingIsDueOncePerDayAndAFailedTryWaitsHalfAnHour() {
        val day = 24L * 3_600_000
        val now = 10 * day
        assertTrue("first run", AppPing.due(0L, 0L, now))
        assertFalse("told it 2 hours ago", AppPing.due(now - 2 * 3_600_000, 0L, now))
        assertTrue("told it 21 hours ago", AppPing.due(now - 21 * 3_600_000, 0L, now))
        assertFalse("a day passed but a try failed 10 minutes ago", AppPing.due(now - day, now - 10 * 60_000, now))
        assertTrue("a try failed 40 minutes ago", AppPing.due(now - day, now - 40 * 60_000, now))
    }

    @Test fun aClockThatWentBackNeverBlocksThePing() {
        val now = 10L * 24 * 3_600_000
        assertTrue(AppPing.due(now + 5 * 24 * 3_600_000, now + 5 * 24 * 3_600_000, now))
    }
}
