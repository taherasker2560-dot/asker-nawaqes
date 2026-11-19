package com.askerpharmacy.apps

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import java.net.URLDecoder

/**
 * The plain rules (tested in OpenTest). The system's button sends askerapps://open?app=<id>&name=<the app's name in the system>:
 * which of HIS apps it means is chosen ON HIS PHONE the first time (a list of the apps he really has), never guessed from a store page
 * (11-19: a guessed package opened another «ابن سينا» app). The old askerapps://open?pkg=<package> still opens that package.
 */
object Open {
    private const val PREFIX = "askerapps://open?"
    private val PKG = Regex("^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z0-9_]+)+$")
    private val ID = Regex("^[a-z][a-z0-9_]{0,30}$")

    data class Ask(val app: String?, val pkg: String?, val name: String?)

    fun parse(data: String?): Ask? {
        if (data == null || !data.startsWith(PREFIX)) return null
        val q = data.substring(PREFIX.length).substringBefore('#')
        var app: String? = null
        var pkg: String? = null
        var name: String? = null
        for (part in q.split('&')) {
            val kv = part.split('=', limit = 2)
            if (kv.size != 2) continue
            when (kv[0]) {
                "app" -> if (ID.matches(kv[1])) app = kv[1]
                "pkg" -> if (kv[1].length <= 150 && PKG.matches(kv[1])) pkg = kv[1]
                "name" -> name = try { URLDecoder.decode(kv[1], "UTF-8").trim().take(40).ifEmpty { null } } catch (e: Exception) { null }
            }
        }
        return if (app == null && pkg == null) null else Ask(app, pkg, name)
    }

    /** The package of the old link style (kept: askerapps://open?pkg=…). */
    fun pkgOf(data: String?): String? = parse(data)?.pkg

    /** The store page of a package (only for the old link style, when it is not on the phone). */
    fun storeUri(pkg: String): String = "market://details?id=$pkg"
}

/** The package to start for an app id: his saved choice first, then the usual packages; each must really be on the phone. */
object Choices {
    /** Apps whose package is certain, tried when he has not chosen yet (WhatsApp Business). Everything else is asked once. */
    val DEFAULTS: Map<String, List<String>> = mapOf("wab" to listOf("com.whatsapp.w4b"))

    fun resolve(app: String, saved: String?, candidates: List<String>, installed: (String) -> Boolean): String? {
        if (saved != null && installed(saved)) return saved
        return candidates.firstOrNull { installed(it) }
    }
}

/** What he chose, on this phone only (SharedPreferences): app id -> package, and the name the system used for it. */
class Prefs(context: Context) {
    private val p = context.getSharedPreferences("apps", Context.MODE_PRIVATE)
    fun pkg(app: String): String? = p.getString("pkg:$app", null)
    fun name(app: String): String? = p.getString("name:$app", null)
    fun set(app: String, pkg: String, name: String?) {
        val e = p.edit()
        e.putString("pkg:$app", pkg)
        if (name != null) e.putString("name:$app", name)
        e.apply()
    }
    fun all(): List<Triple<String, String, String?>> =
        p.all.keys.filter { it.startsWith("pkg:") }.map { it.removePrefix("pkg:") }.sorted()
            .mapNotNull { id -> pkg(id)?.let { Triple(id, it, name(id)) } }
}

/**
 * The system's button lands here (Chrome: intent://open?app=…#Intent;scheme=askerapps;package=com.askerpharmacy.apps;…).
 * No screen of its own: the chosen app's launcher screen starts; the first time (or when the chosen app was removed) the list of his apps opens
 * to choose from. Nothing is read from or given to the app: only its usual start screen.
 */
class OpenActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val ask = Open.parse(intent?.dataString)
        if (ask != null) {
            val prefs = Prefs(this)
            val pkg = ask.pkg ?: Choices.resolve(ask.app ?: "", ask.app?.let { prefs.pkg(it) }, Choices.DEFAULTS[ask.app] ?: emptyList()) { launchable(it) }
            if (pkg == null || !start(pkg)) {
                if (ask.app != null) {
                    startActivity(Intent(this, PickActivity::class.java).putExtra("app", ask.app).putExtra("name", ask.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } else if (pkg != null) {
                    try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Open.storeUri(pkg))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e: Exception) { /* no store app */ }
                }
            }
        }
        finish()
    }

    private fun launchable(pkg: String) = packageManager.getLaunchIntentForPackage(pkg) != null

    private fun start(pkg: String): Boolean = try {
        val launch = packageManager.getLaunchIntentForPackage(pkg)
        if (launch == null) false else { launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(launch); true }
    } catch (e: Exception) {
        false
    }
}
