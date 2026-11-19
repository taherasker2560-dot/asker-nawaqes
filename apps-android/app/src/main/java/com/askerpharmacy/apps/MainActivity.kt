package com.askerpharmacy.apps

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** The app's own icon: says it works, shows which of his apps each system button opens (and lets him change it), and opens the system. */
class MainActivity : Activity() {
    override fun onResume() {
        super.onResume()
        draw()
    }

    private fun draw() {
        val d = resources.displayMetrics.density
        val pad = (20 * d).toInt()
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(Color.WHITE)
            layoutDirection = View.LAYOUT_DIRECTION_RTL
        }
        box.addView(TextView(this).apply {
            text = "🔑 مفتاح التطبيقات"
            textSize = 24f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.parseColor("#C0522A"))
            gravity = Gravity.CENTER
        })
        box.addView(TextView(this).apply {
            text = "✅ شغّال.\nزراير «تطبيقات الشغل» في السيستم بتفتح تطبيقاتك. أول مرة تدوس على زرار هتختار التطبيق من اللي على موبايلك، وبعد كده بيفتح على طول."
            textSize = 16f
            setTextColor(Color.parseColor("#1D1B19"))
            setPadding(0, pad, 0, pad)
        })
        val chosen = Prefs(this).all()
        box.addView(TextView(this).apply {
            text = if (chosen.isEmpty()) "لسه ما اخترتش تطبيقات." else "اللي اخترته:"
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
            contentDescription = "chosen-title"
        })
        for ((id, pkg, name) in chosen) {
            val label = try { packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString() } catch (e: Exception) { "مش موجود: $pkg" }
            val line = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, (6 * d).toInt(), 0, (6 * d).toInt())
            }
            line.addView(TextView(this).apply {
                text = "${name ?: id}  ←  $label"
                textSize = 15f
                setTextColor(Color.parseColor("#1D1B19"))
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            line.addView(Button(this).apply {
                text = "غيّر"
                setOnClickListener { startActivity(Intent(this@MainActivity, PickActivity::class.java).putExtra("app", id).putExtra("name", name)) }
            })
            box.addView(line)
        }
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
        setContentView(ScrollView(this).apply { addView(box) })
    }

    companion object {
        const val SYSTEM = "https://taherasker2560-dot.github.io/asker-nawaqes/asker-nawaqes-arabic.html"
    }
}
