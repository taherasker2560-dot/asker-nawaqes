package com.askerpharmacy.contacts

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import org.json.JSONObject

/**
 * The two jobs of the app:
 *  1) the numbers saved in the system (typed in «طلب مش موجود») are written into the phone's contacts, then the system is told («ar_phone_ack»);
 *  2) every 10 days (or «زامن دلوقتي») every contact of the phone is sent to the system («ar_phone_push_rows» in chunks, then «ar_phone_finish»).
 * Nothing is ever deleted from the phone, and a number the phone already has is not written twice.
 */
object Sync {
    fun hasPermission(c: Context): Boolean =
        c.checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED &&
            c.checkSelfPermission(Manifest.permission.WRITE_CONTACTS) == PackageManager.PERMISSION_GRANTED

    /** Returns the line shown on the app's screen (also kept as the last note). */
    @Synchronized
    fun run(c: Context, forceSnapshot: Boolean = false): String {
        if (!Config.ready(c)) return done(c, "التطبيق لسه مش مربوط بالسيستم: دوس «اربط التطبيق» من السيستم.")
        if (!hasPermission(c)) return done(c, "محتاج إذن جهات الاتصال: دوس «اطلب إذن جهات الاتصال».")
        val key = Phone.quote(Config.key(c))
        val parts = ArrayList<String>()
        try {
            // 1) the system → the phone
            val pending = Phone.parsePending(Api.rpc(c, "ar_phone_pending", "{\"p_key\":$key}"))
            if (pending.isNotEmpty()) {
                val account = Contacts.account(c)
                val ok = ArrayList<String>()
                var added = 0
                for (p in pending) {
                    val had = Contacts.has(c, p.phone)
                    if (had || Contacts.insert(c, p.name, p.phone, account)) {
                        ok.add(p.phone)
                        if (!had) added++
                    }
                }
                if (ok.isNotEmpty()) Api.rpc(c, "ar_phone_ack", "{\"p_key\":$key,\"p_phones\":${Phone.listJson(ok)}}")
                parts.add("نزّلت $added رقم على الموبايل")
            }
            // 2) the phone → the system
            if (forceSnapshot || Phone.dueSnapshot(Config.lastSnapshot(c), System.currentTimeMillis())) {
                val rows = Contacts.readAll(c)
                if (rows.isNotEmpty()) {
                    val sync = System.currentTimeMillis()
                    for (chunk in Phone.chunks(rows)) Api.rpc(c, "ar_phone_push_rows", "{\"p_key\":$key,\"p_sync\":$sync,\"p_rows\":${Phone.rowsJson(chunk)}}")
                    val r = JSONObject(Api.rpc(c, "ar_phone_finish", "{\"p_key\":$key,\"p_sync\":$sync,\"p_n\":${rows.size}}"))
                    if (r.optBoolean("ok", false)) {
                        Config.setSnapshot(c, System.currentTimeMillis())
                        parts.add("بعتّ ${rows.size} جهة اتصال للسيستم")
                    } else {
                        parts.add("المزامنة ما اكتملتش، هجرّب تاني")
                    }
                } else {
                    parts.add("مالقيتش جهات اتصال أبعتها")
                }
            }
            if (parts.isEmpty()) parts.add("مفيش جديد")
            return done(c, parts.joinToString("، "))
        } catch (e: Exception) {
            return done(c, "ما اتصلتش بالسيستم: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    private fun done(c: Context, line: String): String {
        Config.setNote(c, line)
        return line
    }
}
