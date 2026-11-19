package com.askerpharmacy.apps

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView

/** The list of the apps he has (with a launcher icon): choose the one the system's button means. Asked once; «غيّر» in the app's own screen asks again. */
class PickActivity : Activity() {
    private class Row(val label: String, val pkg: String, val icon: Drawable?)

    private var rows: List<Row> = emptyList()
    private var shown: List<Row> = emptyList()
    private lateinit var app: String
    private var name: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        app = intent.getStringExtra("app") ?: run { finish(); return }
        name = intent.getStringExtra("name")
        val d = resources.displayMetrics.density
        val pad = (16 * d).toInt()
        val pm = packageManager
        val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        rows = pm.queryIntentActivities(main, 0)
            .filter { it.activityInfo.packageName != packageName }
            .map { Row(it.loadLabel(pm).toString(), it.activityInfo.packageName, try { it.loadIcon(pm) } catch (e: Exception) { null }) }
            .distinctBy { it.pkg }
            .sortedBy { it.label.lowercase() }
        shown = rows

        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(pad, pad, pad, 0)
        }
        box.addView(TextView(this).apply {
            text = "اختار تطبيق «${name ?: app}» من اللي على موبايلك"
            textSize = 19f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.parseColor("#C0522A"))
            contentDescription = "pick-title"
        })
        box.addView(TextView(this).apply {
            text = "مرة واحدة بس. بعد كده الزرار في السيستم بيفتحه على طول."
            textSize = 14f
            setTextColor(Color.parseColor("#5B6475"))
            setPadding(0, (4 * d).toInt(), 0, (8 * d).toInt())
        })
        val search = EditText(this).apply {
            hint = "دوّر باسم التطبيق"
            textSize = 16f
            setSingleLine()
        }
        box.addView(search)
        val list = ListView(this).apply { divider = null }
        val adapter = object : BaseAdapter() {
            override fun getCount() = shown.size
            override fun getItem(i: Int) = shown[i]
            override fun getItemId(i: Int) = i.toLong()
            override fun getView(i: Int, convert: View?, parent: ViewGroup?): View {
                val r = shown[i]
                val row = LinearLayout(this@PickActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(0, (8 * d).toInt(), 0, (8 * d).toInt())
                }
                row.addView(ImageView(this@PickActivity).apply {
                    setImageDrawable(r.icon)
                    layoutParams = LinearLayout.LayoutParams((44 * d).toInt(), (44 * d).toInt())
                })
                val texts = LinearLayout(this@PickActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding((12 * d).toInt(), 0, (12 * d).toInt(), 0)
                }
                texts.addView(TextView(this@PickActivity).apply { text = r.label; textSize = 17f; setTextColor(Color.parseColor("#1D1B19")) })
                texts.addView(TextView(this@PickActivity).apply { text = r.pkg; textSize = 11f; setTextColor(Color.parseColor("#5B6475")); textDirection = View.TEXT_DIRECTION_LTR })
                row.addView(texts)
                return row
            }
        }
        list.adapter = adapter
        list.setOnItemClickListener { _, _, i, _ -> choose(shown[i]) }
        box.addView(list, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        search.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val q = s?.toString()?.trim()?.lowercase() ?: ""
                shown = if (q.isEmpty()) rows else rows.filter { it.label.lowercase().contains(q) || it.pkg.lowercase().contains(q) }
                adapter.notifyDataSetChanged()
            }
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        })
        setContentView(box)
    }

    private fun choose(r: Row) {
        Prefs(this).set(app, r.pkg, name)
        try {
            packageManager.getLaunchIntentForPackage(r.pkg)?.let { startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        } catch (e: Exception) { /* chosen; it will open next time */ }
        finish()
    }
}
