package com.askerpharmacy.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.util.TimeZone

/** Sets ONE system alarm: the next moment anything must ring. setAlarmClock is exact, works in Doze, and survives the app being closed (not «force-stopped»). */
object Scheduler {
    const val ACTION_FIRE = "com.askerpharmacy.alarm.FIRE"

    private fun firePending(ctx: Context, at: Long): PendingIntent {
        val i = Intent(ctx, AlarmReceiver::class.java).setAction(ACTION_FIRE).putExtra("at", at)
        return PendingIntent.getBroadcast(ctx, 1, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** [after]: the moment that just rang (never rings it twice if the clock is a hair early) */
    fun reschedule(context: Context, after: Long = 0L) {
        val ctx = context.applicationContext
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val st = Store(ctx)
        val now = maxOf(System.currentTimeMillis(), after)
        val t = Plan.next(st.alarms(), st.snoozes(), now, TimeZone.getDefault())
        if (t == null) {
            am.cancel(firePending(ctx, 0L))
            return
        }
        val show = PendingIntent.getActivity(ctx, 2, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        am.setAlarmClock(AlarmManager.AlarmClockInfo(t.at, show), firePending(ctx, t.at))
    }
}

/** The system alarm went off (the app may have been closed, even killed): the next one is set first, then the ring starts. */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val ctx = context.applicationContext
        val at = intent.getLongExtra("at", System.currentTimeMillis())
        val st = Store(ctx)
        val alarms = st.alarms()
        val snoozes = st.snoozes()
        val ids = Plan.due(alarms, snoozes, at, TimeZone.getDefault())
        st.setSnoozes(snoozes.filter { it.at > at + 1000 })
        Scheduler.reschedule(ctx, at)
        st.log(if (ids.isEmpty()) "المنبه ضرب بس مفيش دوا مستحق" else "المنبه ضرب: ${ids.size} دوا")
        if (ids.isEmpty()) return
        Ring.start(ctx, alarms.filter { it.id in ids }.map { it.spoken }.distinct(), ids)
    }
}

/** The phone started / the app was updated / the clock or zone changed: set the next alarm again. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Scheduler.reschedule(context)
    }
}
