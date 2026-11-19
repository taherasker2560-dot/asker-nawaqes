package com.askerpharmacy.apps

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** CI only (debug build): `am broadcast -n .../.DebugReceiver --es app drugeye --es pkg com.android.settings` = the choice he makes in the list. */
class DebugReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = intent.getStringExtra("app") ?: return
        val pkg = intent.getStringExtra("pkg") ?: return
        Prefs(context).set(app, pkg, intent.getStringExtra("name"))
    }
}
