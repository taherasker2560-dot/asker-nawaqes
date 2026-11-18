package com.askerpharmacy.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

/** CI only (debug build): `am broadcast -n .../.DebugReceiver --es name X --es time HH:mm` sets one alarm, as the page would. */
class DebugReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val time = intent.getStringExtra("time") ?: return
        val name = intent.getStringExtra("name") ?: "Test"
        val json = JSONObject().put("speak", intent.getBooleanExtra("speak", true))
            .put("items", JSONArray().put(JSONObject().put("id", "t1").put("spoken", name).put("times", JSONArray().put(time)))).toString()
        Store(context).setFromPage(json)
        Scheduler.reschedule(context)
    }
}
