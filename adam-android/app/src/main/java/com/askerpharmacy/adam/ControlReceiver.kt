package com.askerpharmacy.adam

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Base64

/**
 * Commands from the laptop over adb (the receiver is protected by the DUMP permission, which only adb / the system hold):
 *   SET_CONFIG  url, api, key, bot   the server's address, its public key, this phone's device key, the bot's page
 *   ASK         text | b64           a typed question (as if he said it after «آدم»); b64 = the same text in UTF-8 base64 (for Arabic over adb)
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
                var t = intent.getStringExtra("text")?.trim() ?: ""
                val b = intent.getStringExtra("b64")
                if (!b.isNullOrEmpty()) {
                    try { t = String(Base64.decode(b, Base64.DEFAULT), Charsets.UTF_8).trim() } catch (e: Exception) { }
                }
                if (t.isNotEmpty() && AdamService.running) {
                    context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_TEXT).putExtra("text", t))
                    resultData = "asked"
                } else resultData = "adam is not running"
            }
            // the voice: SET_VOICE voice (a name from VOICES, or "" for the default), pitch (1.0 normal, lower = deeper), rate; then
            // VOICES writes files/voices.txt (readable with run-as); SAY says a sentence (text | b64) in the current voice
            "com.askerpharmacy.adam.SET_VOICE" -> {
                Config.saveVoice(context, intent.getStringExtra("voice"), intent.getStringExtra("pitch")?.toFloatOrNull(), intent.getStringExtra("rate")?.toFloatOrNull())
                if (AdamService.running) context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_VOICE))
                resultData = "voice=" + Config.voice(context) + " pitch=" + Config.pitch(context) + " rate=" + Config.rate(context)
            }
            "com.askerpharmacy.adam.VOICES" -> {
                if (AdamService.running) context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_VOICES))
                resultData = "voices requested"
            }
            "com.askerpharmacy.adam.SAY" -> {
                var t = intent.getStringExtra("text")?.trim() ?: ""
                val b = intent.getStringExtra("b64")
                if (!b.isNullOrEmpty()) {
                    try { t = String(Base64.decode(b, Base64.DEFAULT), Charsets.UTF_8).trim() } catch (e: Exception) { }
                }
                if (t.isNotEmpty() && AdamService.running) {
                    context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_SAY).putExtra("text", t))
                    resultData = "saying"
                } else resultData = "adam is not running"
            }
            "com.askerpharmacy.adam.STOP" -> {
                if (AdamService.running) context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_STOP))
                resultData = "stopping"
            }
        }
    }
}
