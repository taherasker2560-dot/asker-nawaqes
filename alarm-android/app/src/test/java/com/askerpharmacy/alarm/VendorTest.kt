package com.askerpharmacy.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VendorTest {
    @Test fun xiaomiFamilyNeedsAutostart() {
        for (m in listOf("Xiaomi", "xiaomi", "Redmi", "POCO", "BLACKSHARK")) assertTrue(m, Vendor.needsAutostart(m))
        assertEquals("com.miui.securitycenter", Vendor.autostartTargets("Xiaomi").first().first)
    }

    @Test fun otherMakersWithTheirOwnScreen() {
        assertTrue(Vendor.needsAutostart("HUAWEI"))
        assertTrue(Vendor.needsAutostart("HONOR"))
        assertTrue(Vendor.needsAutostart("OPPO"))
        assertTrue(Vendor.needsAutostart("realme"))
        assertTrue(Vendor.needsAutostart("vivo"))
        assertEquals("com.vivo.permissionmanager", Vendor.autostartTargets("vivo").first().first)
    }

    @Test fun phonesWithoutOneAreNotAsked() {
        for (m in listOf("samsung", "Google", "motorola", "")) assertFalse(m, Vendor.needsAutostart(m))
    }
}
