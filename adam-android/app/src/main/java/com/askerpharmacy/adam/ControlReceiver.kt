package com.askerpharmacy.adam

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Commands from the laptop over adb (the receiver is protected by the DUMP permission, which only adb / the system hold):
 *   SET_CONFIG  url, api, key, bot   the server's address, its public key, this phone's device key, the bot's page
 *   ASK         text                 a typed question (as if he said it after «آدم»)
 *   STOP                             switch the listening service off
 */
class ControlReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            "com.askerpharmacy.adam.SET_CONFIG" -> {
                Config.save(context, intent.getStringExtra("url"), intent.getStringExtra("api"), intent.getStringExtra("key"), intent.getStringExtra("bot"))
                resultData = if (Config.ready(context)) "config ok" else "config incomplete"
            }
            "com.askerpharmacy.adam.ASK" -> {
                val t = intent.getStringExtra("text")?.trim() ?: ""
                if (t.isNotEmpty() && AdamService.running) {
                    context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_TEXT).putExtra("text", t))
                    resultData = "asked"
                } else resultData = "adam is not running"
            }
            "com.askerpharmacy.adam.STOP" -> {
                if (AdamService.running) context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_STOP))
                resultData = "stopping"
            }
        }
    }
}
