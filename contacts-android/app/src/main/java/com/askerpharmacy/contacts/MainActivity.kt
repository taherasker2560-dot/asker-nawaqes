package com.askerpharmacy.contacts

import android.Manifest
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** The app's own screen: is it linked, is the permission given, what happened last, and two buttons. Everything on it is in the system's language. */
class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var permBtn: Button
    private lateinit var syncBtn: Button

    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        window.decorView.layoutDirection = View.LAYOUT_DIRECTION_RTL
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(28), dp(20), dp(20)) }
        col.addView(TextView(this).apply { text = "دفتر الأرقام"; textSize = 24f; setTextColor(Color.parseColor("#217BAB")); gravity = Gravity.START })
        col.addView(TextView(this).apply {
            text = "بيحفظ الأرقام اللي بتتسجل في السيستم في جهات اتصال موبايلك (وجوجل بيشوفها لوحده)، وكل 10 أيام بيبعت جهات اتصالك للسيستم."
            textSize = 15f; setPadding(0, dp(8), 0, dp(14))
        })
        status = TextView(this).apply { textSize = 16f; setPadding(0, 0, 0, dp(14)) }
        col.addView(status)
        permBtn = Button(this).apply { text = "اطلب إذن جهات الاتصال"; setOnClickListener { requestPermissions(arrayOf(Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS), 1) } }
        col.addView(permBtn)
        syncBtn = Button(this).apply { text = "زامن دلوقتي"; setOnClickListener { syncNow() } }
        col.addView(syncBtn)
        setContentView(ScrollView(this).apply { addView(col) })
    }

    override fun onResume() {
        super.onResume()
        if (Config.ready(this) && Sync.hasPermission(this)) SyncJob.schedule(this)
        refresh()
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, perms, results)
        if (Config.ready(this) && Sync.hasPermission(this)) SyncJob.schedule(this)
        refresh()
    }

    private fun syncNow() {
        syncBtn.isEnabled = false
        status.text = "بيزامن…"
        Thread {
            Sync.run(applicationContext, true)
            runOnUiThread { syncBtn.isEnabled = true; refresh() }
        }.start()
    }

    private fun fmt(t: Long): String = if (t <= 0L) "لسه" else SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date(t))

    private fun refresh() {
        val linked = Config.ready(this)
        val perm = Sync.hasPermission(this)
        permBtn.visibility = if (perm) View.GONE else View.VISIBLE
        syncBtn.visibility = if (linked && perm) View.VISIBLE else View.GONE
        val lines = ArrayList<String>()
        lines.add(if (linked) "✓ مربوط بالسيستم" else "✗ مش مربوط: افتح السيستم ← «دفتر الأرقام» ← «اربط التطبيق»")
        lines.add(if (perm) "✓ إذن جهات الاتصال معطى" else "✗ إذن جهات الاتصال مش معطى")
        if (linked) {
            lines.add("آخر مرة اتصل بالسيستم: ${fmt(Config.lastRun(this))}")
            lines.add("آخر إرسال لجهات اتصالك: ${fmt(Config.lastSnapshot(this))}")
            if (Config.note(this).isNotEmpty()) lines.add(Config.note(this))
        }
        status.text = lines.joinToString("\n")
    }
}
