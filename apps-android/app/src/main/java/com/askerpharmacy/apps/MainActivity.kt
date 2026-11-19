package com.askerpharmacy.apps

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** The app's own icon: says it is ready and opens the system. It is not needed for the work: the system's buttons use OpenActivity. */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(Color.WHITE)
            layoutDirection = android.view.View.LAYOUT_DIRECTION_RTL
        }
        box.addView(TextView(this).apply {
            text = "🔑 مفتاح التطبيقات"
            textSize = 24f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.parseColor("#C0522A"))
            gravity = Gravity.CENTER
        })
        box.addView(TextView(this).apply {
            text = "✅ شغّال.\n\nزراير «تطبيقات الشغل» في السيستم بقت بتفتح كل تطبيق بدوسة واحدة.\nمش محتاج تفتح التطبيق ده تاني."
            textSize = 17f
            setTextColor(Color.parseColor("#1D1B19"))
            gravity = Gravity.CENTER
            setPadding(0, pad, 0, pad)
        })
        box.addView(Button(this).apply {
            text = "افتح السيستم"
            setOnClickListener {
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(SYSTEM))) } catch (e: Exception) { /* no browser */ }
            }
        })
        box.addView(TextView(this).apply {
            text = "الإصدار ${packageManager.getPackageInfo(packageName, 0).versionName}"
            textSize = 13f
            setTextColor(Color.parseColor("#5B6475"))
            gravity = Gravity.CENTER
            setPadding(0, pad, 0, 0)
            contentDescription = "apps-version"
        })
        setContentView(box)
    }

    companion object {
        const val SYSTEM = "https://taherasker2560-dot.github.io/asker-nawaqes/asker-nawaqes-arabic.html"
    }
}
