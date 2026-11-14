package com.askerpharmacy.adam

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * After the phone restarts Android does not let an app start a microphone service by itself, so Adam says so with one tap:
 * «آدم مش صاحي، دوس عشان يصحى».
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(NotificationChannel(AdamService.CH_RESULT, "ردود آدم", NotificationManager.IMPORTANCE_HIGH))
            val pi = PendingIntent.getActivity(
                context, 9, Intent(context, MainActivity::class.java).putExtra("autostart", true),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            nm.notify(
                AdamService.ID_RESULT,
                Notification.Builder(context, AdamService.CH_RESULT)
                    .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                    .setContentTitle("آدم مش صاحي")
                    .setContentText("دوس هنا عشان يصحى")
                    .setContentIntent(pi)
                    .setAutoCancel(true)
                    .build()
            )
        } catch (e: Throwable) { }
    }
}
