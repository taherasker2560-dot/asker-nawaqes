package com.askerpharmacy.adam

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import org.json.JSONObject
import java.io.File
import java.text.Normalizer
import java.util.Locale

/**
 * «آدم» on the phone: a foreground service with the fixed notification «● آدم صاحي». It listens for the word offline (WakeWord),
 * hears the request (Listener), puts it in the bot's queue (Api), speaks the laptop's answer (Speaker), does the phone's part of it
 * (Actions) and keeps the conversation (a follow-up within 10 minutes is the same conversation on the laptop).
 * A reply that sends or calls asks first: it is read out and only his spoken «أيوه» goes back to the server (the laptop cannot do it
 * without that answer; see the migration). Everything runs on the main thread; the network on short background threads.
 */
class AdamService : Service() {
    companion object {
        const val ACTION_ASK_AGAIN = "com.askerpharmacy.adam.ASK_AGAIN"
        const val ACTION_TEXT = "com.askerpharmacy.adam.TEXT"
        const val ACTION_STOP = "com.askerpharmacy.adam.STOP_SERVICE"
        const val ACTION_VOICE = "com.askerpharmacy.adam.VOICE"      // the chosen voice / pitch / speed changed
        const val ACTION_VOICES = "com.askerpharmacy.adam.VOICES"    // write the Arabic voices of the phone to files/voices.txt
        const val ACTION_SAY = "com.askerpharmacy.adam.SAY"          // say a sentence in the current voice (to try a voice)
        const val CH_LISTEN = "adam_listen"
        const val CH_RESULT = "adam_result"
        const val ID_LISTEN = 1
        const val ID_RESULT = 2
        private const val CONVO_MS = 10 * 60 * 1000L
        private const val POLL_MAX_MS = 3 * 3600 * 1000L

        @Volatile
        var running = false

        fun start(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, AdamService::class.java))
        }

        private val YES = setOf("ايوه", "ايوة", "ايوا", "اه", "ااه", "نعم", "تمام", "ماشي", "اوكي", "اوكيه", "يلا", "اعمل", "اكيد", "طبعا", "موافق", "ابعت", "كمل", "اتفضل", "ok", "okay", "yes")
        private val NO = setOf("لا", "لأ", "لاء", "بلاش", "الغي", "الغيه", "لغي", "وقف", "ماتعملش", "متعملش", "مش", "no")

        /** «أيوه» = 1, «لا» = -1, anything else = 0 (Arabic spelling variants folded). */
        fun classify(said: String): Int {
            val t = Normalizer.normalize(said.lowercase(Locale.ROOT), Normalizer.Form.NFKC)
                .replace(Regex("[\\u064B-\\u0652\\u0640]"), "")
                .replace(Regex("[أإآٱ]"), "ا").replace('ى', 'ي').replace('ة', 'ه')
            val words = t.split(Regex("[^\\p{L}]+")).filter { it.isNotEmpty() }
            val no = words.any { it in NO }
            val yes = words.any { it in YES }
            return if (no) -1 else if (yes) 1 else 0
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private lateinit var wake: WakeWord
    private lateinit var listener: Listener
    private lateinit var speaker: Speaker
    private var wl: PowerManager.WakeLock? = null
    private var state = "starting"
    private var convo = newConvo()
    private var lastUse = 0L
    private var current = 0L          // the request being waited for
    private var pendingConfirm = 0L   // the request whose proposal he is answering
    private var askedConfirmAgain = false
    private var wakes = 0
    private var lastHeard = ""
    private var lastReply = ""
    @Volatile
    private var alive = true

    private fun newConvo(): String = "c" + java.lang.Long.toString(System.nanoTime(), 36) + java.lang.Long.toString((Math.random() * 1e9).toLong(), 36)

    private fun log(m: String) {
        try {
            val f = File(filesDir, "adam.log")
            if (f.length() > 200_000) f.delete()
            f.appendText(java.text.SimpleDateFormat("MM-dd HH:mm:ss", Locale.US).format(java.util.Date()) + "  " + m + "\n")
        } catch (e: Throwable) { }
    }

    private fun writeStatus() {
        try {
            val o = JSONObject()
                .put("state", state).put("wake_ready", wake.ready).put("voice_ready", speaker.isReady)
                .put("recognizer", listener.available()).put("wakes", wakes).put("heard", lastHeard).put("reply", lastReply)
                .put("convo", convo).put("config", Config.ready(this)).put("at", System.currentTimeMillis())
            File(filesDir, "status.json").writeText(o.toString())
        } catch (e: Throwable) { }
    }

    private fun setState(s: String, note: String? = null) {
        state = s
        notifyListening(note ?: (if (s == "speaking") "بيرد عليك…" else null))
        writeStatus()
    }

    // ---------- the service ----------
    override fun onCreate() {
        super.onCreate()
        running = true
        createChannels()
        try {
            val n = listeningNotification("بيجهّز…")
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID_LISTEN, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            else startForeground(ID_LISTEN, n)
        } catch (e: Throwable) {
            log("cannot start in the foreground: " + e.message)
            notifyOpenApp("آدم مش قادر يشتغل. افتح التطبيق مرة.")
            stopSelf()
            return
        }
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "adam:listen").apply { setReferenceCounted(false); acquire() }
        speaker = Speaker(this, main) { log(it) }
        listener = Listener(this, main) { log(it) }
        wake = WakeWord(this, { main.post { onWake() } }) { log(it) }
        wake.prepare { ok ->
            main.post {
                if (!alive) return@post
                if (ok) goIdle() else setState("no-model", "نموذج الكلمة ما اشتغلش")
            }
        }
        log("service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!::wake.isInitialized) return START_NOT_STICKY
        when (intent?.action) {
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
            ACTION_VOICE -> speaker.apply()
            ACTION_VOICES -> try { File(filesDir, "voices.txt").writeText(speaker.describeVoices()) } catch (e: Throwable) { log("voices: " + e.message) }
            ACTION_SAY -> {
                val t = intent.getStringExtra("text")?.trim() ?: ""
                if (t.isNotEmpty() && wake.ready) {
                    wake.stop(); speaker.stop(); listener.cancel()
                    setState("speaking")
                    speaker.say(t) { goIdle() }
                }
            }
            ACTION_ASK_AGAIN -> if (wake.ready) { wake.stop(); beginRequestListening() }
            ACTION_TEXT -> {
                val t = intent.getStringExtra("text")?.trim() ?: ""
                if (t.isNotEmpty() && wake.ready) { wake.stop(); speaker.stop(); listener.cancel(); handleText(t) }
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        alive = false
        running = false
        try { wake.stop() } catch (e: Throwable) { }
        try { listener.cancel() } catch (e: Throwable) { }
        try { speaker.shutdown() } catch (e: Throwable) { }
        try { wl?.release() } catch (e: Throwable) { }
        main.removeCallbacksAndMessages(null)
        log("service destroyed")
        super.onDestroy()
    }

    // ---------- the conversation ----------
    private fun goIdle() {
        askedConfirmAgain = false
        setState("idle")
        if (!wake.start()) {
            log("wake word did not start, again in 5 s")
            main.postDelayed({ if (alive && state == "idle") goIdle() }, 5000)
        }
    }

    private fun onWake() {
        if (state != "idle") return
        wakes++
        log("heard the word")
        wake.stop()
        beep()
        main.postDelayed({ if (alive) beginRequestListening() }, 250)
    }

    private fun beep() {
        try {
            val t = ToneGenerator(AudioManager.STREAM_MUSIC, 70)
            t.startTone(ToneGenerator.TONE_PROP_BEEP, 120)
            main.postDelayed({ try { t.release() } catch (e: Throwable) { } }, 400)
        } catch (e: Throwable) { }
    }

    private fun beginRequestListening() {
        if (!Config.ready(this)) { speaker.say("لسه ماتظبطتش الإعدادات") { goIdle() }; return }
        setState("listening", "سامعك…")
        listener.listen(
            { text -> handleText(text) },
            { code ->
                log("request not heard ($code)")
                // nothing heard: back to waiting for the word, quietly
                goIdle()
            }
        )
    }

    private fun handleText(text: String) {
        val now = System.currentTimeMillis()
        if (now - lastUse > CONVO_MS) convo = newConvo()
        lastUse = now
        lastHeard = text
        setState("thinking", "«" + text.take(60) + "» بيدوّر…")
        log("asking: " + text.take(80))
        val c = convo
        Thread {
            val r = Api.ask(this, c, text)
            main.post { if (alive) onAsked(r) }
        }.start()
    }

    private fun onAsked(r: JSONObject?) {
        if (r == null) { saySimple("النت مش واصل عندي، جرّب تاني"); return }
        if (!r.optBoolean("ok")) {
            val msg = when (r.optString("error")) {
                "key" -> "مفتاح آدم مش مظبوط"
                "rate" -> "استنى شوية، بتسأل بسرعة"
                "no_pending" -> "الطلب ده خلص وقته، اسألني من الأول"
                else -> "مقدرتش أبعت السؤال"
            }
            saySimple(msg)
            return
        }
        val id = r.optLong("id")
        current = id
        if (!r.optBoolean("laptop_ok", true)) {
            // the laptop is off: the answer is spoken whenever it comes
            current = 0
            poll(id, false)
            saySimple("اللاب مقفول، هرد أول ما يفتح")
            return
        }
        poll(id, true)
    }

    private fun saySimple(text: String) {
        lastReply = text
        setState("speaking")
        speaker.say(text) { goIdle() }
    }

    /** Waits for the laptop's answer: every second at first, then every 10 seconds (up to 3 hours: the laptop may be switched on later). */
    private fun poll(id: Long, interactive: Boolean) {
        Thread {
            val start = System.currentTimeMillis()
            while (alive && System.currentTimeMillis() - start < POLL_MAX_MS) {
                try { Thread.sleep(if (System.currentTimeMillis() - start < 120_000) 1200 else 10_000) } catch (e: InterruptedException) { return@Thread }
                val g = Api.get(this, id) ?: continue
                if (!g.optBoolean("ok")) { if (g.optString("error") == "none") return@Thread else continue }
                val status = g.optString("status")
                if (status == "done" || status == "error") {
                    val reply = g.optJSONObject("reply") ?: JSONObject()
                    main.post { if (alive) onReply(id, reply, interactive && current == id) }
                    return@Thread
                }
            }
            if (alive && interactive) main.post { if (current == id) saySimple("اتأخرت، جرّب تاني بعد شوية") }
        }.start()
    }

    private fun onReply(id: Long, reply: JSONObject, interactive: Boolean) {
        val speak = reply.optString("speak", "")
        val show = reply.optString("show", speak).ifEmpty { speak }
        lastReply = speak
        lastUse = System.currentTimeMillis()
        val confirm = if (interactive) reply.optJSONObject("confirm") else null
        // a late answer (the laptop was off) is told and shown, but nothing is opened or done behind his back
        val url = if (interactive) Actions.run(this, reply.optJSONArray("do_now")) else null
        val openUrl = url ?: Actions.openCommand(reply.optJSONObject("open"))?.let { Actions.botUrl(this, listOf(it)) }
        postResult(show, openUrl)
        if (current == id) current = 0
        if (!interactive && state != "idle") return
        setState("speaking")
        if (confirm != null) {
            pendingConfirm = id
            askedConfirmAgain = false
            speaker.say(confirm.optString("say", speak)) { listenConfirm() }
        } else {
            speaker.say(speak) { if (interactive && reply.optBoolean("listen_again")) beginRequestListening() else goIdle() }
        }
    }

    // ---------- «أيوه» / «لا» ----------
    private fun listenConfirm() {
        setState("confirm", "قول أيوه أو لا")
        listener.listen(
            { said ->
                lastHeard = said
                when (classify(said)) {
                    1 -> sendConfirm("yes", said)
                    -1 -> sendConfirm("no", said)
                    else -> reAsk()
                }
            },
            { _ -> reAsk() }
        )
    }

    private fun reAsk() {
        if (!askedConfirmAgain) {
            askedConfirmAgain = true
            setState("speaking")
            speaker.say("قول أيوه أو لا") { listenConfirm() }
        } else {
            // no clear answer twice: nothing is done
            pendingConfirm = 0
            saySimple("تمام، ماعملتش حاجة")
        }
    }

    private fun sendConfirm(answer: String, said: String) {
        val of = pendingConfirm
        pendingConfirm = 0
        lastUse = System.currentTimeMillis()
        setState("thinking", if (answer == "yes") "بينفّذ…" else "بيلغي…")
        val c = convo
        Thread {
            val r = Api.ask(this, c, said, of, answer)
            main.post { if (alive) onAsked(r) }
        }.start()
    }

    // ---------- notifications ----------
    private fun createChannels() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CH_LISTEN, "آدم صاحي", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
        nm.createNotificationChannel(NotificationChannel(CH_RESULT, "ردود آدم", NotificationManager.IMPORTANCE_HIGH))
    }

    private fun listeningNotification(note: String?): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val ask = PendingIntent.getService(this, 3, Intent(this, AdamService::class.java).setAction(ACTION_ASK_AGAIN), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return Notification.Builder(this, CH_LISTEN)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("● آدم صاحي")
            .setContentText(note ?: "قول «آدم» وبعدها طلبك")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_btn_speak_now), "اسأل", ask).build())
            .build()
    }

    private fun notifyListening(note: String?) {
        try {
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(ID_LISTEN, listeningNotification(note))
        } catch (e: Throwable) { }
    }

    private fun postResult(text: String, openUrl: String?) {
        try {
            val b = Notification.Builder(this, CH_RESULT)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("آدم")
                .setContentText(text.lineSequence().firstOrNull() ?: text)
                .setStyle(Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
            if (openUrl != null) {
                val pi = PendingIntent.getActivity(this, 1, Intent(Intent.ACTION_VIEW, Uri.parse(openUrl)), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                b.setContentIntent(pi)
                b.addAction(Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_menu_view), "افتح", pi).build())
            }
            val again = PendingIntent.getService(this, 2, Intent(this, AdamService::class.java).setAction(ACTION_ASK_AGAIN), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            b.addAction(Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_btn_speak_now), "اسأل تاني", again).build())
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(ID_RESULT, b.build())
        } catch (e: Throwable) {
            log("result notification failed: " + e.message)
        }
    }

    private fun notifyOpenApp(text: String) {
        try {
            val pi = PendingIntent.getActivity(this, 9, Intent(this, MainActivity::class.java).putExtra("autostart", true), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val b = Notification.Builder(this, CH_RESULT).setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("آدم").setContentText(text).setContentIntent(pi).setAutoCancel(true)
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(ID_RESULT, b.build())
        } catch (e: Throwable) { }
    }
}
