package com.askerpharmacy.adam

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import java.io.File

/**
 * The only screen: what is on and what is missing (the permissions he taps himself), a button to talk to Adam now, and a box to type
 * a question. Opening it also switches the listening service on (the microphone may only be started while the app is on screen).
 */
class MainActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var status: TextView
    private lateinit var heard: TextView
    private lateinit var box: EditText
    private val ticker = object : Runnable {
        override fun run() {
            refresh()
            main.postDelayed(this, 2000)
        }
    }

    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    private fun button(label: String, onClick: () -> Unit): Button {
        val b = Button(this)
        b.text = label
        b.textSize = 16f
        b.setOnClickListener { onClick() }
        val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        lp.topMargin = dp(6)
        b.layoutParams = lp
        return b
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val col = LinearLayout(this)
        col.orientation = LinearLayout.VERTICAL
        col.layoutDirection = View.LAYOUT_DIRECTION_RTL
        col.setPadding(dp(18), dp(24), dp(18), dp(24))

        val title = TextView(this)
        title.text = "آدم"
        title.textSize = 34f
        title.gravity = Gravity.CENTER
        col.addView(title)

        status = TextView(this)
        status.textSize = 16f
        status.setPadding(0, dp(12), 0, dp(12))
        col.addView(status)

        col.addView(button("شغّل آدم") { startAdam() })
        col.addView(button("كلّم آدم دلوقتي") { talkNow() })

        box = EditText(this)
        box.hint = "أو اكتب سؤالك هنا"
        box.inputType = InputType.TYPE_CLASS_TEXT
        box.textDirection = View.TEXT_DIRECTION_RTL
        col.addView(box)
        col.addView(button("اسأل بالكتابة") {
            val t = box.text.toString().trim()
            if (t.isNotEmpty() && AdamService.running) {
                startService(Intent(this, AdamService::class.java).setAction(AdamService.ACTION_TEXT).putExtra("text", t))
                box.setText("")
            }
        })

        heard = TextView(this)
        heard.textSize = 15f
        heard.setPadding(0, dp(12), 0, dp(12))
        col.addView(heard)

        val h = TextView(this)
        h.text = "الصلاحيات (دوس على كل واحدة وسمح):"
        h.textSize = 15f
        col.addView(h)
        col.addView(button("الميكروفون") { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1) })
        col.addView(button("الإشعارات") {
            if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 2)
        })
        col.addView(button("الظهور فوق التطبيقات (عشان يفتح لك البوت)") {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        })
        col.addView(button("البطارية: بدون قيود (عشان يفضل صاحي)") {
            try {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            } catch (e: Throwable) {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            }
        })
        col.addView(button("الاتصال بالتليفون") { requestPermissions(arrayOf(Manifest.permission.CALL_PHONE), 3) })

        val sv = ScrollView(this)
        sv.addView(col)
        setContentView(sv)
    }

    private fun micOk() = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun startAdam() {
        if (!micOk()) { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1); return }
        if (!AdamService.running) AdamService.start(this)
        refresh()
    }

    private fun talkNow() {
        if (!AdamService.running) { startAdam(); return }
        startService(Intent(this, AdamService::class.java).setAction(AdamService.ACTION_ASK_AGAIN))
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1 && micOk()) startAdam()
        refresh()
    }

    override fun onResume() {
        super.onResume()
        // opened (by hand, or from the laptop over adb): switch Adam on when everything needed is there
        if (micOk() && Config.ready(this) && !AdamService.running) AdamService.start(this)
        main.post(ticker)
    }

    override fun onPause() {
        main.removeCallbacks(ticker)
        super.onPause()
    }

    private fun mark(ok: Boolean) = if (ok) "✔" else "✘"

    private fun refresh() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        var st: JSONObject? = null
        try { st = JSONObject(File(filesDir, "status.json").readText()) } catch (e: Throwable) { }
        val lines = ArrayList<String>()
        lines.add(mark(AdamService.running) + " آدم صاحي" + (if (st != null) " (" + st.optString("state") + ")" else ""))
        lines.add(mark(micOk()) + " الميكروفون")
        lines.add(mark(Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) + " الإشعارات")
        lines.add(mark(Settings.canDrawOverlays(this)) + " الظهور فوق التطبيقات")
        lines.add(mark(pm.isIgnoringBatteryOptimizations(packageName)) + " البطارية بدون قيود")
        lines.add(mark(Config.ready(this)) + " الإعدادات (السيرفر والمفتاح)")
        if (st != null) {
            lines.add(mark(st.optBoolean("wake_ready")) + " كلمة «آدم» جاهزة")
            lines.add(mark(st.optBoolean("voice_ready")) + " الصوت العربي جاهز")
            lines.add(mark(st.optBoolean("recognizer")) + " فهم الكلام جاهز")
        }
        status.text = lines.joinToString("\n")
        if (st != null) {
            val a = st.optString("heard")
            val b = st.optString("reply")
            heard.text = (if (a.isNotEmpty()) "سمعت: $a\n" else "") + (if (b.isNotEmpty()) "رديت: $b" else "")
        }
    }
}
