package com.askerpharmacy.alarm

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.io.File
import java.util.Locale

/** Starting a ring, and the one notification that goes with it (the heads-up / full-screen card on the lock screen). */
object Ring {
    const val CHANNEL = "dose_ring"
    const val CHANNEL_LOUD = "dose_ring_loud"
    const val NOTIF_ID = 4107
    const val ACTION_RING = "com.askerpharmacy.alarm.RING"
    const val ACTION_TOOK = "com.askerpharmacy.alarm.TOOK"
    const val ACTION_SNOOZE = "com.askerpharmacy.alarm.SNOOZE"

    /** The system started us from an exact alarm, so a foreground service is allowed; if the phone refuses anyway, the notification alone still shows (and opens the card on the lock screen). */
    fun start(context: Context, names: List<String>, ids: List<String>, fromCard: Boolean = false) {
        val ctx = context.applicationContext
        val i = Intent(ctx, RingService::class.java).setAction(ACTION_RING)
            .putStringArrayListExtra("names", ArrayList(names)).putStringArrayListExtra("ids", ArrayList(ids))
        try {
            ctx.startForegroundService(i)
        } catch (e: Exception) {
            // the phone refused the service (a battery rule): the notification itself must then make the sound, and the card starts the voice when it opens
            Store(ctx).log("الموبايل رفض الخدمة: ${e.javaClass.simpleName}")
            if (!fromCard) Notifier.post(ctx, names, ids, ongoing = false, loud = true)   // from the card it would only re-open the card
        }
    }
}

object Notifier {
    private fun channel(ctx: Context, loud: Boolean) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (loud) {
            if (nm.getNotificationChannel(Ring.CHANNEL_LOUD) != null) return
            // used only when the ring service could not start: then the notification itself must be heard (the phone's own alarm tone, the alarm volume)
            val c = NotificationChannel(Ring.CHANNEL_LOUD, "منبه الدوا (صوت)", NotificationManager.IMPORTANCE_HIGH)
            c.description = "بيرنّ بصوت المنبه لو التطبيق ما قدرش يشغّل النطق"
            c.setSound(
                android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
            )
            c.enableVibration(true)
            c.vibrationPattern = longArrayOf(0, 500, 250, 500, 250, 500)
            c.setShowBadge(false)
            c.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            nm.createNotificationChannel(c)
            return
        }
        if (nm.getNotificationChannel(Ring.CHANNEL) != null) return
        val c = NotificationChannel(Ring.CHANNEL, "منبه الدوا", NotificationManager.IMPORTANCE_HIGH)
        c.description = "ميعاد الدوا: اسم الدوا بصوته"
        c.setSound(null, null)          // the service plays the sentence itself; the notification stays quiet so nothing is said twice
        c.enableVibration(false)
        c.setShowBadge(false)
        c.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        nm.createNotificationChannel(c)
    }

    fun build(ctx: Context, names: List<String>, ids: List<String>, ongoing: Boolean, loud: Boolean = false): Notification {
        channel(ctx, loud)
        val fl = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        // «auto»: only when the ring service never started: the card, once opened, starts the voice itself (it is in front now, so the phone allows it)
        val card = PendingIntent.getActivity(
            ctx, if (loud) 13 else 10,
            Intent(ctx, RingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putStringArrayListExtra("names", ArrayList(names)).putStringArrayListExtra("ids", ArrayList(ids))
                .putExtra("auto", loud).putExtra("at", System.currentTimeMillis()),
            fl,
        )
        val took = PendingIntent.getService(ctx, 11, Intent(ctx, RingService::class.java).setAction(Ring.ACTION_TOOK).putStringArrayListExtra("ids", ArrayList(ids)), fl)
        val snooze = PendingIntent.getService(ctx, 12, Intent(ctx, RingService::class.java).setAction(Ring.ACTION_SNOOZE).putStringArrayListExtra("ids", ArrayList(ids)), fl)
        val b = Notification.Builder(ctx, if (loud) Ring.CHANNEL_LOUD else Ring.CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_alarm)
            .setContentTitle(Plan.title(names))
            .setContentText("خدمة مقدمة من صيدلية عسكر")
            .setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(ongoing)
            .setAutoCancel(!ongoing)
            .setContentIntent(card)
            .setDeleteIntent(took)          // swiping the notification away ends the ring too (it must never go on «hanging» with no way to close it)
            .setFullScreenIntent(card, true)
            .addAction(Notification.Action.Builder(Icon.createWithResource(ctx, R.drawable.ic_stat_alarm), "✓ خدته", took).build())
            .addAction(Notification.Action.Builder(Icon.createWithResource(ctx, R.drawable.ic_stat_alarm), "بعد ${Plan.SNOOZE_MIN} دقايق", snooze).build())
        return b.build()
    }

    fun post(ctx: Context, names: List<String>, ids: List<String>, ongoing: Boolean, loud: Boolean = false) {
        try {
            (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(Ring.NOTIF_ID, build(ctx, names, ids, ongoing, loud))
        } catch (e: Exception) {
            // notifications are off for the app: nothing more can be shown
        }
    }
}

/**
 * The ring: says «ميعاد <الاسم> الآن، خدمة مقدمة من صيدلية عسكر» (the server's voice file kept on the phone, else the phone's own speech engine; a plain alarm tone when the customer
 * switched the voice off), up to 3 times 12 seconds apart, with vibration, for at most 100 seconds. «خدته» ends it, «بعد 10 دقايق» brings it back.
 */
class RingService : Service() {
    companion object {
        @Volatile var running = false
        @Volatile var ringIds: List<String> = emptyList()
        @Volatile var ringNames: List<String> = emptyList()
    }

    private val h = Handler(Looper.getMainLooper())
    private val names = LinkedHashSet<String>()
    private val ids = LinkedHashSet<String>()
    private var tts: TextToSpeech? = null
    private var ttsOk = false
    private var player: MediaPlayer? = null
    private var focus: AudioFocusRequest? = null
    private var says = 0
    private var seq = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            Ring.ACTION_TOOK -> end(false, intent.getStringArrayListExtra("ids"))
            Ring.ACTION_SNOOZE -> end(true, intent.getStringArrayListExtra("ids"))
            else -> ring(intent)
        }
        return START_NOT_STICKY
    }

    private fun alarmAttrs(): AudioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()

    private fun ring(intent: Intent?) {
        names.addAll(intent?.getStringArrayListExtra("names") ?: arrayListOf())
        ids.addAll(intent?.getStringArrayListExtra("ids") ?: arrayListOf())
        if (names.isEmpty()) { stopSelf(); return }
        running = true
        ringIds = ids.toList()
        ringNames = names.toList()
        val note = Notifier.build(this, names.toList(), ids.toList(), ongoing = true)
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(Ring.NOTIF_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) else startForeground(Ring.NOTIF_ID, note)
        } catch (e: Exception) {
            // the phone would not let this service run in front: a notification that makes the alarm sound by itself, and the service ends (an unanswered start would crash the app)
            Store(this).log("الموبايل منع الخدمة: ${e.javaClass.simpleName}")
            Notifier.post(this, names.toList(), ids.toList(), ongoing = false, loud = true)
            running = false
            stopSelf()
            return
        }
        Store(this).log("الرنين بدأ: " + names.joinToString("، "))
        // a new ring (or one more medicine at the same minute) starts the whole cycle again
        seq++
        says = 0
        stopSound()
        vibrate()
        takeFocus()
        val mine = seq
        h.postDelayed({ if (mine == seq) giveUp() }, 100_000L)
        cycle(mine)
    }

    @Suppress("DEPRECATION")
    private fun vibrate() {
        try {
            val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 200, 400, 200, 400, 1500), 0), alarmAttrs())
        } catch (e: Exception) {
            // no vibrator
        }
    }

    private fun takeFocus() {
        try {
            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val f = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE).setAudioAttributes(alarmAttrs()).build()
            am.requestAudioFocus(f)
            focus = f
        } catch (e: Exception) {
            // the sentence plays anyway
        }
    }

    private fun cycle(mine: Int) {
        if (mine != seq) return
        if (says >= 3) return
        says++
        val st = Store(this)
        if (!st.speak) { st.log("النطق مقفول: نغمة"); playTone(mine); return }
        val files = names.map { st.voiceFile(it) }
        if (files.all { it.isFile && it.length() > 1000 }) { st.log("بشغّل ملف صوت الصيدلية"); playFiles(files, 0, mine) { st.log("ملف الصوت فشل: صوت الموبايل"); speakTts(mine) } }
        else { st.log("مفيش ملف صوت جاهز: صوت الموبايل"); speakTts(mine) }
    }

    private fun afterSpeech(mine: Int) {
        if (mine != seq) return
        h.postDelayed({ cycle(mine) }, 12_000L)
    }

    private fun playFiles(files: List<File>, i: Int, mine: Int, onFail: () -> Unit) {
        if (mine != seq) return
        if (i >= files.size) { afterSpeech(mine); return }
        try {
            stopPlayer()
            val mp = MediaPlayer()
            mp.setAudioAttributes(alarmAttrs())
            mp.setDataSource(files[i].absolutePath)
            mp.setOnCompletionListener { playFiles(files, i + 1, mine, onFail) }
            mp.setOnErrorListener { _, what, extra -> Store(this).log("المشغّل غلط ($what/$extra)"); onFail(); true }
            mp.setOnPreparedListener { it.start(); Store(this).log("الملف بيتشغّل") }
            player = mp
            mp.prepareAsync()
        } catch (e: Exception) {
            onFail()
        }
    }

    private fun playTone(mine: Int) {
        try {
            stopPlayer()
            val mp = MediaPlayer()
            mp.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            mp.setDataSource(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
            mp.isLooping = true
            mp.setOnPreparedListener { if (mine == seq) { it.start(); Store(this).log("النغمة بتتشغّل") } }
            mp.setOnErrorListener { _, what, extra -> Store(this).log("النغمة غلط ($what/$extra)"); true }
            player = mp
            mp.prepareAsync()
        } catch (e: Exception) {
            // vibration and the notification remain
            Store(this).log("النغمة فشلت: ${e.javaClass.simpleName}")
        }
    }

    private fun speakTts(mine: Int) {
        if (mine != seq) return
        val say = fun(t: TextToSpeech) {
            val p = Bundle()
            p.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_ALARM)
            t.speak(Plan.sentence(names.toList()), TextToSpeech.QUEUE_FLUSH, p, "ring$mine")
        }
        val ready = tts
        if (ready != null && ttsOk) { say(ready); return }
        try {
            tts = TextToSpeech(applicationContext) { status ->
                h.post {
                    val t = tts
                    // no speech engine, or none with Arabic (a Samsung phone's own engine has none): the phone's alarm tone rings instead, so there is always a sound at the dose time
                    if (status != TextToSpeech.SUCCESS || t == null) { Store(this).log("محرك النطق ما اشتغلش: نغمة"); playTone(mine); return@post }
                    try {
                        t.setAudioAttributes(alarmAttrs())
                        val arabic = t.setLanguage(Locale("ar", "EG")) >= 0 || t.setLanguage(Locale("ar")) >= 0
                        if (!arabic) { Store(this).log("الموبايل مفيهوش نطق عربي: نغمة"); playTone(mine); return@post }
                        t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                            override fun onStart(utteranceId: String?) { Store(this@RingService).log("النطق بدأ") }
                            override fun onDone(utteranceId: String?) { h.post { afterSpeech(seq) } }
                            @Deprecated("the engine's own error callback")
                            override fun onError(utteranceId: String?) { Store(this@RingService).log("النطق فشل: نغمة"); h.post { playTone(seq) } }
                        })
                    } catch (e: Exception) {
                        // the engine speaks with its own settings
                    }
                    ttsOk = true
                    if (mine == seq) say(t)
                }
            }
        } catch (e: Exception) {
            Store(this).log("محرك النطق فشل: ${e.javaClass.simpleName}")
            playTone(mine)
        }
    }

    private fun stopPlayer() {
        try { player?.stop() } catch (e: Exception) { /* not playing */ }
        try { player?.release() } catch (e: Exception) { /* gone */ }
        player = null
    }

    private fun stopSound() {
        stopPlayer()
        try { tts?.stop() } catch (e: Exception) { /* not speaking */ }
    }

    @Suppress("DEPRECATION")
    private fun stopAll() {
        seq++
        h.removeCallbacksAndMessages(null)
        stopSound()
        try { (getSystemService(Context.VIBRATOR_SERVICE) as Vibrator).cancel() } catch (e: Exception) { /* none */ }
        try { focus?.let { (getSystemService(Context.AUDIO_SERVICE) as AudioManager).abandonAudioFocusRequest(it) } } catch (e: Exception) { /* none */ }
        focus = null
    }

    /** nobody answered for 100 seconds: it goes quiet, the notification stays (no longer «ongoing») so he still sees what he missed */
    private fun giveUp() {
        val n = names.toList()
        val i = ids.toList()
        Store(this).log("100 ثانية من غير رد: الرنين وقف")
        stopAll()
        stopForeground(STOP_FOREGROUND_DETACH)
        Notifier.post(this, n, i, ongoing = false)
        running = false
        stopSelf()
    }

    /** «خدته» / «بعد 10 دقايق» (the ids come with the button, so it works even when the ring itself could not start) */
    private fun end(snooze: Boolean, idsFromButton: List<String>?) {
        val which = (idsFromButton ?: emptyList()) + ids
        Store(this).log(if (snooze) "اتأجّل 10 دقايق" else "اتقفل (خدته أو الإشعار اتشال)")
        stopAll()
        if (snooze) {
            val st = Store(this)
            val at = System.currentTimeMillis() + Plan.SNOOZE_MIN * 60_000L
            st.setSnoozes(st.snoozes().filter { it.id !in which } + which.distinct().map { Snooze(it, at) })
            Scheduler.reschedule(this)
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(Ring.NOTIF_ID)
        running = false
        stopSelf()
    }

    override fun onDestroy() {
        stopAll()
        try { tts?.shutdown() } catch (e: Exception) { /* gone */ }
        tts = null
        running = false
        super.onDestroy()
    }
}

/** The card over the lock screen: the names, «✓ خدته», «بعد 10 دقايق». */
class RingActivity : Activity() {
    private val h = Handler(Looper.getMainLooper())
    private var wasRunning = false
    private lateinit var namesView: TextView
    private var names: List<String> = emptyList()
    private var ids: List<String> = emptyList()

    private fun dp(n: Int): Int = (n * resources.displayMetrics.density).toInt()

    private fun button(text: String, fill: Int, ink: Int): Button {
        val b = Button(this)
        b.text = text
        b.isAllCaps = false
        b.textSize = 20f
        b.setTextColor(ink)
        val g = GradientDrawable()
        g.cornerRadius = dp(30).toFloat()
        g.setColor(fill)
        if (fill == Color.WHITE) g.setStroke(dp(2), Color.parseColor("#C0522A"))
        b.background = g
        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(60))
        lp.topMargin = dp(14)
        b.layoutParams = lp
        return b
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        names = intent.getStringArrayListExtra("names") ?: emptyList()
        ids = intent.getStringArrayListExtra("ids") ?: emptyList()
        // the ring service never started (the phone refused it) and only the notification sounded: opening the card starts the voice now, within 5 minutes of the dose time
        if (intent.getBooleanExtra("auto", false) && !RingService.running && names.isNotEmpty() && System.currentTimeMillis() - intent.getLongExtra("at", 0L) < 5 * 60_000L) {
            Ring.start(this, names, ids, fromCard = true)
        }
        val orange = Color.parseColor("#C0522A")
        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.gravity = Gravity.CENTER
        root.setBackgroundColor(Color.WHITE)
        root.layoutDirection = View.LAYOUT_DIRECTION_RTL
        root.setPadding(dp(24), dp(24), dp(24), dp(24))
        val ico = TextView(this)
        ico.text = "⏰"
        ico.textSize = 64f
        ico.gravity = Gravity.CENTER
        root.addView(ico)
        val title = TextView(this)
        title.text = "ميعاد الدوا"
        title.textSize = 22f
        title.setTypeface(null, Typeface.BOLD)
        title.setTextColor(orange)
        title.gravity = Gravity.CENTER
        root.addView(title)
        namesView = TextView(this)
        namesView.textSize = 32f
        namesView.setTypeface(null, Typeface.BOLD)
        namesView.setTextColor(Color.parseColor("#222222"))
        namesView.gravity = Gravity.CENTER
        namesView.setPadding(0, dp(16), 0, dp(8))
        root.addView(namesView)
        val sub = TextView(this)
        sub.text = "خدمة مقدمة من صيدلية عسكر"
        sub.textSize = 15f
        sub.setTextColor(Color.parseColor("#666666"))
        sub.gravity = Gravity.CENTER
        sub.setPadding(0, 0, 0, dp(18))
        root.addView(sub)
        val took = button("✓ خدته", orange, Color.WHITE)
        took.setOnClickListener { act(Ring.ACTION_TOOK) }
        root.addView(took)
        val later = button("⏱ ذكّرني بعد ${Plan.SNOOZE_MIN} دقايق", Color.WHITE, orange)
        later.setOnClickListener { act(Ring.ACTION_SNOOZE) }
        root.addView(later)
        setContentView(root)
        show()
        h.post(object : Runnable {
            override fun run() {
                if (RingService.running) wasRunning = true
                if (wasRunning && !RingService.running) { finish(); return }
                if (RingService.running) show()
                h.postDelayed(this, 1000L)
            }
        })
    }

    private fun show() {
        val n = if (RingService.running) RingService.ringNames else names
        namesView.text = n.joinToString("\n")
    }

    private fun act(action: String) {
        val which = if (RingService.running) RingService.ringIds else ids
        startService(Intent(this, RingService::class.java).setAction(action).putStringArrayListExtra("ids", ArrayList(which)))
        finish()
    }

    override fun onDestroy() {
        h.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
