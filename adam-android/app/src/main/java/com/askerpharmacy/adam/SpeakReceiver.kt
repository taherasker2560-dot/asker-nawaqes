package com.askerpharmacy.adam

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * «Say this in Adam's voice»: for the bot's own announcements (Tasker's «Send Intent» in place of its «Say», so the bot speaks with the
 * same natural voice as Adam). Action com.askerpharmacy.adam.SPEAK, extra text (at most 300 characters). It can only SPEAK a sentence:
 * it reads nothing and changes nothing, so any app may send it; one sentence a second at most.
 * Adam running: his own voice and queue say it. Adam stopped: the sentence is fetched and played here (the receiver stays alive up to 9 s).
 */
class SpeakReceiver : BroadcastReceiver() {
    companion object { @Volatile private var last = 0L }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "com.askerpharmacy.adam.SPEAK") return
        val t = (intent.getStringExtra("text") ?: "").replace(Regex("\\s+"), " ").trim().take(300)
        if (t.isEmpty() || !Config.ready(context)) return
        val now = System.currentTimeMillis()
        if (now - last < 1000) return
        last = now
        if (AdamService.running) {
            context.startService(Intent(context, AdamService::class.java).setAction(AdamService.ACTION_SAY).putExtra("text", t))
            return
        }
        val app = context.applicationContext
        val pending = goAsync()
        Thread {
            try {
                val f = Natural.file(app, t) ?: return@Thread
                val done = CountDownLatch(1)
                Handler(Looper.getMainLooper()).post {
                    try {
                        val mp = MediaPlayer()
                        mp.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                        mp.setDataSource(f.absolutePath)
                        mp.setOnCompletionListener { try { it.release() } catch (e: Throwable) { }; done.countDown() }
                        mp.setOnErrorListener { p, _, _ -> try { p.release() } catch (e: Throwable) { }; done.countDown(); true }
                        mp.prepare()
                        mp.start()
                    } catch (e: Throwable) { done.countDown() }
                }
                done.await(8, TimeUnit.SECONDS)
            } finally {
                pending.finish()
            }
        }.start()
    }
}
