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
import android.speech.SpeechRecognizer
import org.json.JSONObject
import java.io.File
import java.text.Normalizer
import java.util.Locale

/**
 * «آدم 3» (2026-11-17): ONE ear always on (Ear), his voiceprint (Voiceprint), his sentences heard by the server (Api.hear); see the
 * «آدم 3» part below. Before that (still true): a foreground service with the fixed notification «● آدم صاحي». It listens for the word offline,
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
        const val ACTION_STOP_WALK = "com.askerpharmacy.adam.STOP_WALK" // «وقّف» on the notification while a list is read
        const val ACTION_ENROLL = "com.askerpharmacy.adam.ENROLL"    // «آدم 3»: record his voiceprint (8 sentences he repeats)
        const val ACTION_FEED = "com.askerpharmacy.adam.FEED"        // a test over adb: a WAV file handled as if he had just said it
        const val CH_LISTEN = "adam_listen"
        const val CH_RESULT = "adam_result"
        const val ID_LISTEN = 1
        const val ID_RESULT = 2
        private const val CONVO_MS = 10 * 60 * 1000L
        private const val POLL_MAX_MS = 3 * 3600 * 1000L
        private const val THINK_MS = 90 * 1000L          // the laptop's answer normally comes in 1-30 s
        private const val STUCK_MS = 8 * 60 * 1000L      // the voice and the listening have their own limits; this is the last net
        private const val WAKE_RENEW_MS = 10 * 60 * 1000L

        @Volatile
        var running = false

        fun start(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, AdamService::class.java))
        }

        private val YES = setOf("ايوه", "ايوة", "ايوا", "اه", "ااه", "نعم", "تمام", "ماشي", "اوكي", "اوكيه", "يلا", "اعمل", "اكيد", "طبعا", "موافق", "ابعت", "كمل", "اتفضل", "ok", "okay", "yes")
        private val NO = setOf("لا", "لأ", "لاء", "بلاش", "الغي", "الغيه", "لغي", "وقف", "ماتعملش", "متعملش", "مش", "no")

        private fun fold(s: String): String = Normalizer.normalize(s.lowercase(Locale.ROOT), Normalizer.Form.NFKC)
            .replace(Regex("[\\u064B-\\u0652\\u0640]"), "")
            .replace(Regex("[أإآٱ]"), "ا").replace('ى', 'ي').replace('ة', 'ه')

        private val DICTATION = Regex("^(سجل|سجللي|بيع|بيعه|فاتوره|اكتب|اكتبلي|مرتجع|طلبيه|اطلب|ضيف|جرد|دخل|اعمل فاتوره|اعمل بيعه)(\\s|$)")
        /** A request that lists things (a sale, an invoice, an order, a count): he gets time to say all of them. */
        fun isDictation(said: String): Boolean = DICTATION.containsMatchIn(fold(said).trim())

        private val DONE = Regex("\\s*(خلاص|بس كده|بس كدا|كده تمام|كدا تمام|خلصت|انتهيت)\\s*$")
        private val ENROLL_WORDS = Regex("(سجل\\S*\\s+(بصمتي|بصمه صوتي|البصمه|بصمه)|بصمه صوتي|بصمتي)")
        /** The words without a «خلاص» at their end, and whether it was there. */
        fun stripDone(said: String): Pair<String, Boolean> {
            val t = said.trim()
            val f = fold(t)
            val m = DONE.find(f) ?: return Pair(t, false)
            // the same number of characters is cut from the original (fold only removes marks, so cut by the folded tail's words)
            val tailWords = m.value.trim().split(Regex("\\s+")).size
            val words = t.split(Regex("\\s+"))
            return Pair(words.dropLast(tailWords).joinToString(" "), true)
        }

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
    private lateinit var ear: Ear
    private var modelsReady = false
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
                .put("state", state).put("wake_ready", modelsReady).put("voice_ready", speaker.isReady)
                .put("recognizer", listener.available()).put("wakes", wakes).put("heard", lastHeard).put("reply", lastReply)
                .put("convo", convo).put("config", Config.ready(this)).put("at", System.currentTimeMillis())
                .put("ear", JSONObject().put("on", ear.running).put("floor_db", Math.round(ear.floorDb)).put("echo_canceller", ear.echoOn)
                    .put("speaker_model", Models.speaker != null))
                .put("voiceprint", Voiceprint.describe())
            File(filesDir, "status.json").writeText(o.toString())
        } catch (e: Throwable) { }
    }

    private fun setState(s: String, note: String? = null) {
        state = s
        stateAt = System.currentTimeMillis()
        notifyListening(note ?: (if (s == "speaking") "بيرد عليك…" else null))
        writeStatus()
    }

    // ---------- the guard: Adam never stays deaf ----------
    // Owner 2026-11-15: «يا عم انا بنادي عليه ما بيردش عليا». While Adam speaks, thinks or listens to a request, the word «آدم» is
    // not listened for; if one of those never ends (the voice, the speech engine or the laptop stuck) he would be deaf for ever.
    // Every 15 s: listening for the word died (the mic was taken) → started again; renewed every 10 min while nothing happens;
    // any other state much longer than it can take → back to waiting for «آدم».
    private var stateAt = 0L

    private fun guard() {
        if (!alive) return
        try {
            val now = System.currentTimeMillis()
            val age = now - stateAt
            when (state) {
                // «آدم 3»: the ear stopped, hears nothing but zeros (another app took the microphone) or is old: started again
                "idle" -> if (modelsReady && !ear.inSentence && (!ear.running || now - ear.lastFrameAt > 5000 || ear.silencedMs > 20_000 || now - ear.startedAt > WAKE_RENEW_MS)) {
                    if (!ear.running || now - ear.lastFrameAt > 5000) log("guard: the ear had stopped, starting it again")
                    else if (ear.silencedMs > 20_000) log("guard: the microphone gives only silence (another app?), starting the ear again")
                    if (!ear.start()) log("guard: the ear did not start, again in 15 s")
                }
                // the laptop is slow: he is told, and the answer is still spoken when it comes (poll goes on, as when the laptop is off)
                "thinking" -> if (age > THINK_MS) {
                    log("guard: no answer in ${age / 1000} s, waiting for it quietly")
                    current = 0
                    saySimple("لسه بيدوّر، هقولك أول ما يخلص")
                } else Unit
                "speaking", "listening", "confirm" -> if (age > STUCK_MS) {
                    log("guard: stuck in $state for ${age / 1000} s, back to waiting")
                    walk = null; current = 0; pendingConfirm = 0
                    try { speaker.stop() } catch (e: Throwable) { }
                    try { cancelHear() } catch (e: Throwable) { }
                    enrolling = null
                    goIdle()
                }
            }
        } catch (e: Throwable) { log("guard: " + e.message) }
        main.postDelayed({ guard() }, 15_000)
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
        Voiceprint.load(this)
        ear = Ear(main, { log(it) }, { speaker.talking }, { onSegment(it) }, { id, v -> onBargeIn(id, v) })
        Thread {
            val ok = Models.prepare(this) { log(it) }
            main.post {
                if (!alive) return@post
                if (ok) {
                    modelsReady = true
                    if (!ear.start()) log("the ear did not start; the guard tries again")
                    goIdle()
                    // started by the side key / the tile before the models were ready: the conversation starts now
                    if (askWhenReady) { askWhenReady = false; startConvo() }
                } else setState("no-model", "نموذج الكلمة ما اشتغلش")
            }
        }.start()
        main.postDelayed({ guard() }, 15_000)
        log("service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!::ear.isInitialized) return START_NOT_STICKY
        when (intent?.action) {
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
            ACTION_VOICE -> speaker.apply()
            ACTION_VOICES -> try { File(filesDir, "voices.txt").writeText(speaker.describeVoices()) } catch (e: Throwable) { log("voices: " + e.message) }
            ACTION_SAY -> {
                val t = intent.getStringExtra("text")?.trim() ?: ""
                if (t.isNotEmpty() && modelsReady) {
                    speaker.stop(); cancelHear()
                    setState("speaking")
                    speaker.say(t) { goIdle() }
                }
            }
            // «اسأل» on the notification: also cuts a list that is being read
            // also the side key («اسأل آدم», ListenActivity) and the tile: a conversation starts at once, without the word
            ACTION_ASK_AGAIN -> if (modelsReady) { walk = null; enrolling = null; speaker.stop(); cancelHear(); startConvo() } else askWhenReady = true
            ACTION_STOP_WALK -> { walk = null; speaker.stop(); cancelHear(); log("walk stopped from the notification"); goIdle() }
            ACTION_TEXT -> {
                val t = intent.getStringExtra("text")?.trim() ?: ""
                // idle=1 over adb: as if he had said a «لي» command without the name
                if (t.isNotEmpty() && modelsReady) { speaker.stop(); cancelHear(); handleText(t, intent.getStringExtra("idle") == "1") }
            }
            ACTION_ENROLL -> if (modelsReady) startEnroll()
            ACTION_FEED -> {
                val f = File(filesDir, intent.getStringExtra("file")?.replace(Regex("[^A-Za-z0-9_.\\-]"), "") ?: "test.wav")
                val pcm = try { Audio.readWav(f.readBytes()) } catch (e: Throwable) { null }
                if (pcm == null) log("feed: no 16-bit WAV at " + f.name) else { log("feed: " + f.name + " " + (pcm.size * 1000 / Ear.RATE) + " ms"); ear.inject(pcm) }
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        alive = false
        running = false
        try { ear.shutdown() } catch (e: Throwable) { }
        try { listener.drop() } catch (e: Throwable) { }
        try { speaker.shutdown() } catch (e: Throwable) { }
        try { wl?.release() } catch (e: Throwable) { }
        main.removeCallbacksAndMessages(null)
        log("service destroyed")
        super.onDestroy()
    }

    // ---------- the conversation ----------
    private fun goIdle() {
        askedConfirmAgain = false
        notHeardOnce = false
        collecting = false
        continuing = false
        errorTurns = 0
        dictation.setLength(0)
        walk = null
        if (inConvo) log("conversation ended after $replyCount answer(s)")
        inConvo = false; talkHistory.clear(); talkCtx = null; silentTurns = 0; replyCount = 0
        want = null; bargeSeg = 0
        ear.endMs = 800
        setState("idle")
        if (modelsReady && !ear.running && !ear.start()) log("the ear did not start; the guard tries again in 15 s")
    }

    // ---------- «آدم 3»: one ear, his voice only (owner 2026-11-17) ----------
    // «عايز يشتغل على بصمة صوتي انا بس … اكلمه يرد عليا، اكلمه يرد عليا، لو قطعته يسكت … فإما يبقى مربوط بـ«لي»، أو اقول له آدم».
    // The ear (Ear.kt) is always on and gives whole sentences with their voiceprint. While Adam waits:
    //   - «آدم» alone, heard on the phone: the conversation starts at once (as before);
    //   - with a voiceprint, any of HIS sentences goes to the server (hear, idle): «آدم + request» starts the conversation with it,
    //     a «… لي» command is done without a conversation, anything else (him talking to customers / staff) is ignored.
    // In a conversation / a «أيوه» question: hearNext waits for HIS next sentence (others' voices are skipped). While Adam speaks:
    // if HE talks over him, Adam stops at once and listens (onBargeIn). No voiceprint yet: only «آدم» works, and everyone is heard
    // in a conversation (as before) — nothing of the room goes to the server.
    private class Want(val seq: Int, val mode: String, val onText: (String) -> Unit, val onFail: (Int) -> Unit) { var busy = false }
    private var want: Want? = null
    private var wantSeq = 0
    private var bargeSeg = 0          // the sentence that cut Adam's speech: it is his next request
    private var idleBusy = false

    /** Waits for HIS next sentence: [onText] gets the words, [onFail] 6 = nothing said in [timeoutMs], 7 = nothing clear, 2 = no net. */
    private fun hearNext(mode: String, timeoutMs: Long, onText: (String) -> Unit, onFail: (Int) -> Unit, onReady: (() -> Unit)? = null) {
        if (!ear.running) {
            // the ear could not take the microphone: the phone's own speech engine, as before «آدم 3» (no voiceprint there)
            listener.listen(onText, onFail, onReady)
            return
        }
        val w = Want(++wantSeq, mode, onText, onFail)
        want = w
        onReady?.invoke()
        fun check() {
            if (want !== w || w.busy) return
            if (ear.inSentence) { main.postDelayed({ check() }, 500); return }   // he is still talking
            want = null
            w.onFail(SpeechRecognizer.ERROR_SPEECH_TIMEOUT)
        }
        main.postDelayed({ check() }, timeoutMs)
    }

    private fun cancelHear() {
        want = null
        try { listener.cancel() } catch (e: Throwable) { }
    }

    private fun onSegment(s: Ear.Segment) {
        if (!alive) return
        val sc = Voiceprint.score(s.vector)
        // a sentence that began while Adam spoke is his own voice coming back, unless it cut him (then it is the next request)
        if (s.duringSpeech && s.id != bargeSeg) { log("echo of Adam's voice skipped (" + s.ms + " ms)"); return }
        if (enrolling != null) { enrollSegment(s); return }
        if (state == "idle") { idleSegment(s, sc); return }
        val w = want
        if (w == null || w.busy) { log("a sentence while $state, skipped"); return }
        val ok = Voiceprint.accepts(sc, s.ms)
        Voiceprint.note(sc, s.ms, ok, w.mode)
        if (!ok) { log("not his voice (%.2f under %.2f), still waiting".format(sc, Voiceprint.barFor(s.ms))); return }
        w.busy = true
        if (inConvo) Voiceprint.learn(this, s.vector, sc, s.ms)?.let { log(it) }
        val t0 = System.currentTimeMillis()
        Thread {
            val r = Api.hear(this, s.pcm, "convo", sc)
            main.post {
                if (want !== w) return@post
                want = null
                if (r == null || !r.optBoolean("ok")) { log("hear failed"); w.onFail(SpeechRecognizer.ERROR_NETWORK); return@post }
                val t = r.optString("text").trim()
                log("heard in " + (System.currentTimeMillis() - t0) + " ms (" + s.ms + " ms of voice, print %.2f)".format(sc))
                if (t.isEmpty()) w.onFail(SpeechRecognizer.ERROR_NO_MATCH) else w.onText(t)
            }
        }.start()
    }

    private fun idleSegment(s: Ear.Segment, sc: Float) {
        val ok = Voiceprint.accepts(sc, s.ms)
        // «آدم» alone, heard on the phone itself: at once, without the server
        if (s.wake && s.ms < 1800 && s.wakeConf >= Config.wakeConf(this)) {
            Voiceprint.note(sc, s.ms, ok, "adam")
            if (ok) { wakes++; log("wake (on the phone) conf %.2f, print %.2f".format(s.wakeConf, sc)); startConvo(); return }
            log("«آدم» in another voice (%.2f), ignored".format(sc)); return
        }
        if (!Voiceprint.enrolled) return       // no voiceprint yet: nothing of the room goes out
        Voiceprint.note(sc, s.ms, ok, "idle")
        if (!ok) return
        if (idleBusy) { log("a sentence skipped: the last one is still being heard"); return }
        idleBusy = true
        Thread {
            val r = Api.hear(this, s.pcm, "idle", sc)
            main.post {
                idleBusy = false
                if (!alive || state != "idle") return@post
                if (r == null || !r.optBoolean("ok")) { log("hear (idle) failed"); return@post }
                when (r.optString("to")) {
                    "name" -> { wakes++; log("called by name, print %.2f".format(sc)); startConvo(r.optString("rest").trim()) }
                    "command" -> {
                        log("«" + r.optString("verb") + " لي» command, print %.2f".format(sc))
                        val t = r.optString("text").trim()
                        if (t.isNotEmpty()) { beepShort(); handleText(t, true) }
                    }
                    else -> { }   // he was talking to someone else
                }
            }
        }.start()
    }

    /** He talked over Adam: if it is his voice, Adam stops at once and his sentence is the next request (or the answer Adam waits for). */
    private fun onBargeIn(id: Int, v: FloatArray?) {
        if (!alive || !speaker.talking || enrolling != null || state == "idle") return
        val sc = Voiceprint.score(v)
        // his voice is mixed with Adam's here, so the bar is a little lower than for a sentence alone
        val ok = !Voiceprint.enrolled || (sc > -2f && sc >= Voiceprint.barFor(800) - 0.05f)
        Voiceprint.note(sc, 800, ok, "cut")
        if (!ok) { log("a voice over Adam's (%.2f), not his".format(sc)); return }
        log("he cut Adam's speech (print %.2f)".format(sc))
        bargeSeg = id
        speaker.stop()
        buzz()
        val w = walk
        when {
            w != null && w.optString("mode") == "pick" -> walkListen()
            w != null -> { walk = null; inConvo = true; beginRequestListening(quiet = true) }
            pendingConfirm != 0L -> listenConfirm()
            else -> { inConvo = true; beginRequestListening(quiet = true) }
        }
    }

    // ---------- his voiceprint (8 sentences he repeats after Adam) ----------
    // Started by «آدم، سجّل بصمتي», the notification's «سجّل بصمتي», or adb (ENROLL). Kept only on the phone (Voiceprint.kt).
    private val ENROLL_LINES = listOf(
        "آدم، بانادول اكسترا بكام؟", "اقرالي النواقص العامة", "بيع لي علبة كونجستال", "رصيد الدكتور كام؟",
        "افتحلي الطلبيات", "عندنا كام علبة أوجمنتين؟", "سجّل دفعة لفارما ألف جنيه", "خلاص يا آدم، شكرا",
    )
    private var enrolling: ArrayList<FloatArray>? = null
    private var enrollIdx = 0
    private var enrollTries = 0
    private var enrollSeq = 0

    private fun startEnroll() {
        if (Models.speaker == null) { saySimple("بصمة الصوت مش شغالة على الموبايل ده"); return }
        if (!ear.running) { saySimple("الميكروفون مش متاح دلوقتي، جرّب تاني"); return }
        speaker.stop(); cancelHear(); walk = null; inConvo = false; pendingConfirm = 0
        enrolling = ArrayList(); enrollIdx = 0; enrollTries = 0
        log("voiceprint: enrollment started")
        setState("speaking", "بصمة الصوت")
        speaker.say("هسجّل بصمة صوتك. هقول جملة، وبعد الصفارة قولها ورايا بصوتك العادي. ٨ جمل.") { enrollNext() }
    }

    private fun enrollNext() {
        val list = enrolling ?: return goIdle()
        if (enrollIdx >= ENROLL_LINES.size) return enrollFinish(list)
        setState("speaking", "بصمة الصوت " + (enrollIdx + 1) + " من " + ENROLL_LINES.size)
        speaker.say("قول: " + ENROLL_LINES[enrollIdx]) {
            if (enrolling == null || !alive) return@say
            setState("listening", "قول الجملة… " + (enrollIdx + 1) + " من " + ENROLL_LINES.size)
            ear.endMs = 1000
            readyCue(true)
            val my = ++enrollSeq
            main.postDelayed({ if (enrolling != null && my == enrollSeq && state == "listening") enrollMissed() }, 9000)
        }
    }

    private fun enrollSegment(s: Ear.Segment) {
        if (state != "listening") return
        val v = s.vector
        if (v == null) { log("voiceprint: no voiceprint from this sentence (" + s.voicedMs + " ms of voice), waiting"); return }
        if (s.voicedMs < 600) { log("voiceprint: a sentence too short (" + s.voicedMs + " ms of voice), waiting"); return }
        enrollSeq++
        enrolling?.add(v)
        log("voiceprint: sentence " + (enrollIdx + 1) + " (" + s.ms + " ms)")
        enrollIdx++; enrollTries = 0
        enrollNext()
    }

    private fun enrollMissed() {
        enrollTries++
        if (enrollTries >= 2) { enrollIdx++; enrollTries = 0 }
        enrollNext()
    }

    private fun enrollFinish(list: List<FloatArray>) {
        enrolling = null
        val r = Voiceprint.enroll(this, list)
        if (r == null) {
            log("voiceprint: not enough clear sentences (" + list.size + ")")
            saySimple("الصوت ماكانش واضح كفاية. قول «آدم، سجّل بصمتي» تاني في مكان هادي شوية")
            return
        }
        log("voiceprint: $r")
        saySimple("تمام، بصمتك اتسجلت. من دلوقتي هسمع صوتك انت بس، وتقدر تقول «آدم» أو أي أمر بـ«لي» زي «بيع لي» و«افتحلي». أول يومين بتعلّم صوتك أكتر.")
    }

    // ---------- «آدم 2»: a conversation (owner 2026-11-17: «ياخد ويدي معايا … مش صنم») ----------
    // Called once (the word, the side key, the tile, «اسأل»); after every answer Adam listens again by himself, until he says
    // «خلاص / شكرا / كده تمام», the server says end, or he says nothing twice. The fast brain on the server (Api.talk) answers first;
    // what it hands over (anything that records or sends) and anything it cannot answer goes to the laptop's queue as before.
    private var inConvo = false
    private val talkHistory = ArrayList<JSONObject>()
    private var talkCtx: JSONObject? = null
    private var silentTurns = 0
    private var replyCount = 0
    private var askWhenReady = false
    private val ENDS = Regex("^(خلاص|شكرا|شكراً|متشكر|متشكرين|كده تمام|تمام كده|مع السلامة|مع السلامه|سلام|لا خلاص|خلاص كده)( شكرا| يا آدم| يا ادم)?[.!؟]*$")

    private var errorTurns = 0
    // a sentence that stops on «و / يعني / بس / عشان / اللي …» is not finished: he paused to think («… اعرف فيه كم و», 2026-11-17)
    private val UNFINISHED = Regex("(^|\\s)(و|او|أو|يعني|بس|عشان|علشان|اللي|ان|إن|في|من|على|علي|لما|لو|ولا|مع|بتاع|بتاعت)$")
    private var continuing = false

    /** [first] = what he already asked with the name («آدم، بانادول بكام»): answered at once. */
    private fun startConvo(first: String = "") {
        inConvo = true; talkHistory.clear(); talkCtx = null; silentTurns = 0; replyCount = 0; errorTurns = 0
        setState("listening", "سامعك…")
        if (first.isNotBlank()) { beep(); onHeard(first); return }
        beginRequestListening()
    }

    private fun addTurn(who: String, text: String) {
        if (text.isBlank()) return
        talkHistory.add(JSONObject().put("who", who).put("text", text.take(400)))
        while (talkHistory.size > 8) talkHistory.removeAt(0)
    }

    /** After an answer: in a conversation, listen again at once (the short beep + buzz come when it really listens); otherwise back to waiting for the word. */
    private fun afterTurn() {
        if (!alive) return
        if (inConvo) beginRequestListening() else goIdle()
    }

    /**
     * «سامعك»: said the moment the speech engine really listens (owner 2026-11-17: «لو جيت كلمته وراها على طول بيفضل ساكت فترة، ما بيبعتش
     * رسالة ان هو فتح»). The first listen gets the full beep; every next one (in a conversation, a dictation piece) a short beep and a
     * short buzz, so he feels it with the phone in his pocket too.
     */
    private fun readyCue(first: Boolean) {
        ear.mute(250)   // the beep itself is not a sentence
        if (first) beep() else beepShort()
        if (!first) buzz()
    }

    private fun buzz() {
        try {
            val v = if (Build.VERSION.SDK_INT >= 31) (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as android.os.VibratorManager).defaultVibrator
                    else @Suppress("DEPRECATION") (getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator)
            v.vibrate(android.os.VibrationEffect.createOneShot(40, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (e: Throwable) { }
    }

    private fun beep() {
        try {
            val t = ToneGenerator(AudioManager.STREAM_MUSIC, 70)
            t.startTone(ToneGenerator.TONE_PROP_BEEP, 120)
            main.postDelayed({ try { t.release() } catch (e: Throwable) { } }, 400)
        } catch (e: Throwable) { }
    }

    private fun beepShort() {
        try {
            val t = ToneGenerator(AudioManager.STREAM_MUSIC, 50)
            t.startTone(ToneGenerator.TONE_PROP_ACK, 70)
            main.postDelayed({ try { t.release() } catch (e: Throwable) { } }, 300)
        } catch (e: Throwable) { }
    }

    // ---------- what he says after «آدم» ----------
    // Owner 2026-11-15: «ساعات بكلمه ومش بيرد اصلا» and «لو عايز اقول له على 7 8 اصناف … بيقوم جاي قافل عليا وياخد اول صنفين».
    // - Not heard right after the word: he is told («مسمعتكش، قول تاني») and listened to once more; then back to waiting quietly.
    // - Dictation: a request that starts with «سجّل / بيعة / فاتورة / اكتب / مرتجع / طلبية / ضيف / جرد» keeps listening piece after
    //   piece (a short beep between them) until he says «خلاص» or stops talking; all of it goes as ONE request.
    private var notHeardOnce = false
    private var collecting = false
    private val dictation = StringBuilder()
    private var pieces = 0

    /** [quiet] = he is already talking (he cut Adam): no beep. */
    private fun beginRequestListening(quiet: Boolean = false) {
        if (!Config.ready(this)) { speaker.say("لسه ماتظبطتش الإعدادات") { goIdle() }; return }
        val note = if (collecting) "كمّل… وقول «خلاص» لما تخلص" else if (inConvo && replyCount > 0) "في محادثة… قول «خلاص» للخروج" else "سامعك…"
        val first = !collecting && replyCount == 0 && silentTurns == 0 && errorTurns == 0 && !notHeardOnce
        // «لحظة…» until it really listens; then the beep and «سامعك» together (with the ear: at once)
        setState("listening", "لحظة…")
        ear.endMs = if (collecting) 1500 else 1000
        hearNext("convo", if (collecting) 6000L else 8000L,
            { text -> onHeard(text) },
            { code ->
                log("request not heard ($code)")
                if (collecting) { finishDictation(); return@hearNext }
                val nothingSaid = code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                // the phone's speech engine failed for a moment (busy / disconnected, e.g. right after the previous listen): try again
                // after a short pause instead of ending the conversation (11-17: «listen error 11» ended it after one answer)
                if (!nothingSaid && errorTurns < 3) {
                    errorTurns++
                    main.postDelayed({ if (alive && state == "listening") beginRequestListening() }, 700)
                    return@hearNext
                }
                // in a conversation, after an answer: one more quiet try, then the conversation ends (he walked away)
                if (inConvo && replyCount > 0) {
                    if (nothingSaid && silentTurns == 0) { silentTurns = 1; main.postDelayed({ if (alive && state == "listening") beginRequestListening() }, 300) } else goIdle()
                    return@hearNext
                }
                if (nothingSaid && !notHeardOnce) {
                    notHeardOnce = true
                    setState("speaking")
                    speaker.say("مسمعتكش، قول تاني") { if (alive) beginRequestListening() }
                } else goIdle()
            },
            { if (alive && state == "listening") { if (!quiet) readyCue(first); setState("listening", note) } }
        )
    }

    private fun onHeard(text: String) {
        notHeardOnce = false
        silentTurns = 0
        errorTurns = 0
        // «خلاص / شكرا / كده تمام» ends the conversation (in a dictation «خلاص» ends the dictation instead, below)
        if (!collecting && ENDS.matches(text.trim().replace(Regex("\\s+"), " "))) {
            inConvo = false
            saySimple("تمام")
            return
        }
        // «سجّل بصمتي» / «بصمة صوتي»: his voiceprint (in a conversation his voice already passed the old one, if there is one)
        if (!collecting && ENROLL_WORDS.containsMatchIn(fold(text))) { startEnroll(); return }
        val (piece, done) = stripDone(text)
        if (collecting) {
            if (piece.isNotBlank()) { dictation.append(' ').append(piece); pieces++ }
            log("dictation piece $pieces: " + piece.take(60))
            // a paused sentence ends with the piece that is itself finished
            val finished = continuing && !UNFINISHED.containsMatchIn(piece.trim())
            if (done || finished || pieces >= 10 || dictation.length > 1200) { continuing = false; finishDictation() } else beginRequestListening()
            return
        }
        if (!done && UNFINISHED.containsMatchIn(piece.trim())) {
            collecting = true; continuing = true
            dictation.setLength(0); dictation.append(piece.trim()); pieces = 1
            log("sentence not finished, listening on: " + piece.take(60))
            beginRequestListening()
            return
        }
        if (isDictation(piece) && !done) {
            collecting = true
            dictation.setLength(0); dictation.append(piece); pieces = 1
            log("dictation started: " + piece.take(60))
            beginRequestListening()
            return
        }
        handleText(if (piece.isNotBlank()) piece else text)
    }

    private fun finishDictation() {
        collecting = false
        continuing = false
        val t = dictation.toString().trim()
        dictation.setLength(0)
        if (t.isEmpty()) goIdle() else handleText(t)
    }

    /** [idle] = a «لي» command heard without his name («آدم 3»): the server stays quiet ({ignore}) unless there is a real answer. */
    private fun handleText(text: String, idle: Boolean = false) {
        val now = System.currentTimeMillis()
        if (now - lastUse > CONVO_MS) convo = newConvo()
        lastUse = now
        lastHeard = text
        setState("thinking", "«" + text.take(60) + "» بيدوّر…")
        log("asking" + (if (idle) " (لي)" else "") + ": " + text.take(80))
        val c = convo
        val hist = org.json.JSONArray(); for (t in talkHistory) hist.put(t)
        val tc = if (idle) null else talkCtx
        Thread {
            // the fast brain first (one call, ~2 s); handed over / no answer: the laptop's queue, as before
            val t0 = System.currentTimeMillis()
            val t = Api.talk(this, text, if (idle) org.json.JSONArray() else hist, tc, idle)
            if (t != null && t.optBoolean("ok") && t.optBoolean("ignore")) {
                log("not for Adam after all (" + t.optString("tool") + "), quiet")
                main.post { if (alive && state == "thinking") goIdle() }
                return@Thread
            }
            // a «لي» command and no server: quiet (it may not have been for Adam)
            if (idle && t == null) { main.post { if (alive && state == "thinking") goIdle() }; return@Thread }
            if (t != null && t.optBoolean("ok") && !t.optBoolean("handoff")) {
                log("fast brain: " + t.optString("tool") + " in " + (System.currentTimeMillis() - t0) + " ms (server " + t.optLong("ms") + ")")
                main.post { if (alive) onTalk(text, t) }
                return@Thread
            }
            log(if (t == null) "fast brain: no answer, asking the laptop" else "fast brain handed over (" + t.optString("tool") + "), asking the laptop")
            main.post { if (alive) { addTurn("me", text); if (t != null) speaker.say("ثانية بدوّر") { } } }
            val r = Api.ask(this, c, text)
            main.post { if (alive) onAsked(r) }
        }.start()
    }

    private fun onTalk(text: String, t: JSONObject) {
        addTurn("me", text)
        t.optJSONObject("ctx")?.let { talkCtx = it }
        if (t.optBoolean("end")) inConvo = false
        onReply(0L, t, true)
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

    /** Waits for the laptop's answer: every half second at first (the answer is spoken as soon as it is there), then every 10 seconds (up to 3 hours: the laptop may be switched on later). */
    private fun poll(id: Long, interactive: Boolean) {
        Thread {
            val start = System.currentTimeMillis()
            while (alive && System.currentTimeMillis() - start < POLL_MAX_MS) {
                try { Thread.sleep(if (System.currentTimeMillis() - start < 120_000) 500 else 10_000) } catch (e: InterruptedException) { return@Thread }
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
        if (interactive) { replyCount++; addTurn("adam", speak) }
        setState("speaking")
        val walkObj = if (interactive) reply.optJSONObject("walk") else null
        if (walkObj != null) { startWalk(id, walkObj); return }
        if (confirm != null) {
            pendingConfirm = id
            askedConfirmAgain = false
            speaker.say(confirm.optString("say", speak)) { listenConfirm() }
        } else {
            speaker.say(speak) { if (interactive && reply.optBoolean("listen_again")) beginRequestListening() else if (interactive) afterTurn() else goIdle() }
        }
    }

    // ---------- a list read item by item (owner 2026-11-15: «افتح حقيبة النواقص اليومية … يقرا لي الاصناف وانا اقول له ايوه او لا») ----------
    // The laptop sends the whole list once (reply.walk); the phone reads it here without going back to the laptop between items:
    //   read: the items in groups of 6, «أكمّل؟» between groups;
    //   pick: one item, then «أيوه / لا / خلاص / كرر»; at the end «هحوّل 7 صنف … أكمّل؟» and only his «أيوه» sends the chosen items
    //         (as «pick:12,45,…», the answer to the proposal) - the laptop records only those, and only ones it proposed.
    private var walk: JSONObject? = null
    private var walkReq = 0L
    private var walkIdx = 0
    private var walkRetry = false
    private val walkPicked = ArrayList<Long>()

    private fun startWalk(id: Long, w: JSONObject) {
        walk = w; walkReq = id; walkIdx = 0; walkRetry = false; walkPicked.clear()
        log("walk " + w.optString("mode") + ": " + (w.optJSONArray("items")?.length() ?: 0) + " items")
        speaker.say(w.optString("intro")) { if (alive) walkNext() }
    }

    private fun walkItems(): org.json.JSONArray? = walk?.optJSONArray("items")

    private fun walkNext() {
        val w = walk ?: return goIdle()
        val items = walkItems() ?: return walkEnd()
        if (walkIdx >= items.length()) return walkEnd()
        setState("speaking", "بيقرا " + (walkIdx + 1) + " من " + items.length())
        if (w.optString("mode") == "read") {
            val sb = StringBuilder()
            var n = 0
            // 3 at a time, then «أكمّل؟»: while Adam speaks he cannot hear «خلاص» or «آدم» (2026-11-15: 6 at a time was too long)
            while (walkIdx < items.length() && n < 3) { sb.append(items.getJSONObject(walkIdx).optString("say")).append(". "); walkIdx++; n++ }
            speaker.say(sb.toString()) { if (!alive) return@say; if (walkIdx < items.length()) walkAskMore() else walkEnd() }
        } else {
            val it = items.getJSONObject(walkIdx)
            speaker.say(it.optString("say") + ". " + w.optString("ask", "أيوه ولا لا؟")) { if (alive) walkListen() }
        }
    }

    private fun walkAskMore() {
        speaker.say("أكمّل؟") {
            setState("confirm", "أكمّل؟")
            hearNext("confirm", 8000L, { said -> if (classify(said) == 1) walkNext() else walkEnd() }, { _ -> walkEnd() }, { readyCue(false) })
        }
    }

    // 1 yes, -1 no, 2 stop («خلاص / كفاية / بس»), 3 repeat («كرر / تاني / اعيد»), 0 unclear
    private fun walkAnswer(said: String): Int {
        val t = said.trim()
        if (Regex("(خلاص|كفايه|كفاية|بس كده|انهي|اقف|ستوب|stop)").containsMatchIn(t)) return 2
        if (Regex("(كرر|كررها|تاني|اعيد|اعد|قول تاني)").containsMatchIn(t)) return 3
        return classify(t)
    }

    private fun walkListen() {
        setState("confirm", "أيوه / لا / خلاص")
        hearNext("confirm", 8000L,
            { said ->
                lastHeard = said
                when (walkAnswer(said)) {
                    1 -> { walkItems()?.optJSONObject(walkIdx)?.optLong("id")?.let { walkPicked.add(it) }; walkIdx++; walkRetry = false; walkNext() }
                    -1 -> { walkIdx++; walkRetry = false; walkNext() }
                    2 -> walkEnd()
                    3 -> walkNext()
                    else -> walkUnclear()
                }
            },
            { _ -> walkUnclear() }, { readyCue(false) }
        )
    }

    private fun walkUnclear() {
        if (!walkRetry) { walkRetry = true; speaker.say("أيوه ولا لا؟") { if (alive) walkListen() } }
        else { walkRetry = false; walkIdx++; walkNext() }   // no clear answer twice: this item is left out
    }

    private fun walkEnd() {
        val w = walk ?: return goIdle()
        if (w.optString("mode") == "read") { walk = null; speaker.say(w.optString("end_say", "خلصت")) { afterTurn() }; return }
        if (walkPicked.isEmpty()) { walk = null; speaker.say(w.optString("none_say", "ماختارتش حاجة")) { goIdle() }; return }
        val say = w.optString("final_tpl", "أكمّل؟").replace("{n}", walkPicked.size.toString())
        askedConfirmAgain = false
        speaker.say(say) { if (alive) walkConfirm() }
    }

    private fun walkConfirm() {
        setState("confirm", "قول أيوه أو لا")
        hearNext("confirm", 8000L,
            { said ->
                lastHeard = said
                when (classify(said)) {
                    1 -> { pendingConfirm = walkReq; val ids = walkPicked.joinToString(","); walk = null; sendConfirm("yes", "pick:$ids") }
                    -1 -> { walk = null; saySimple("تمام، ماعملتش حاجة") }
                    else -> walkConfirmAgain()
                }
            },
            { _ -> walkConfirmAgain() }, { readyCue(false) }
        )
    }

    private fun walkConfirmAgain() {
        if (!askedConfirmAgain) { askedConfirmAgain = true; speaker.say("قول أيوه أو لا") { if (alive) walkConfirm() } }
        else { walk = null; saySimple("تمام، ماعملتش حاجة") }
    }

    // ---------- «أيوه» / «لا» ----------
    private fun listenConfirm() {
        setState("confirm", "قول أيوه أو لا")
        hearNext("confirm", 8000L,
            { said ->
                lastHeard = said
                when (classify(said)) {
                    1 -> sendConfirm("yes", said)
                    -1 -> sendConfirm("no", said)
                    else -> reAsk()
                }
            },
            { _ -> reAsk() }, { readyCue(false) }
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
        val b = Notification.Builder(this, CH_LISTEN)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("● آدم صاحي")
            .setContentText(note ?: if (Voiceprint.enrolled) "قول «آدم» أو أمر بـ«لي» (بيع لي، افتحلي…)" else "قول «آدم» وبعدها طلبك")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_btn_speak_now), "اسأل", ask).build())
        // «آدم 3»: no voiceprint yet: one tap records it (8 sentences he repeats after Adam)
        if (!Voiceprint.enrolled && Models.speaker != null && enrolling == null) {
            val enroll = PendingIntent.getService(this, 5, Intent(this, AdamService::class.java).setAction(ACTION_ENROLL), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            b.addAction(Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_btn_speak_now), "سجّل بصمتي", enroll).build())
        }
        // while a list is being read: «وقّف» stops it at once (he can also just talk over Adam now)
        if (walk != null) {
            val stop = PendingIntent.getService(this, 4, Intent(this, AdamService::class.java).setAction(ACTION_STOP_WALK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            b.addAction(Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel), "وقّف", stop).build())
        }
        return b.build()
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
                val pi = PendingIntent.getActivity(this, 1, Actions.viewIntent(this, openUrl), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
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
