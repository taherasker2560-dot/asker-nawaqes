package com.askerpharmacy.contacts

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * CI only (debug build, never published): the emulator test drives the app with it:
 *   am broadcast -n com.askerpharmacy.contacts/.DebugReceiver --es url http://10.0.2.2:8787 --es key <64 hex> --es add "Name|0100…" --es sync 1
 * url = the test's fake server, key = the phone's key, add = a contact written on the phone first, sync = run both jobs now; the answer is the app's own status line.
 */
class DebugReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val pending = goAsync()
        Thread {
            var out = "ok"
            try {
                i.getStringExtra("url")?.let { Config.setUrl(c, it) }
                i.getStringExtra("key")?.let { Config.saveKey(c, it) }
                i.getStringExtra("add")?.let {
                    val p = it.split("|")
                    if (p.size == 2) out = "add=" + Contacts.insert(c, p[0], p[1], null)
                }
                if (i.getStringExtra("sync") == "1") out = Sync.run(c, true)
            } catch (e: Exception) {
                out = "error " + e
            } finally {
                pending.resultData = out
                pending.finish()
            }
        }.start()
    }
}
