package com.askerpharmacy.apps

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/** The plain rule (tested in OpenTest): which package a link from the system asks for. Only askerapps://open?pkg=<a package name>. */
object Open {
    private const val PREFIX = "askerapps://open?"
    private val PKG = Regex("^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z0-9_]+)+$")

    fun pkgOf(data: String?): String? {
        if (data == null || !data.startsWith(PREFIX)) return null
        val q = data.substring(PREFIX.length).substringBefore('#')
        for (part in q.split('&')) {
            val kv = part.split('=', limit = 2)
            if (kv.size == 2 && kv[0] == "pkg") {
                val p = kv[1]
                return if (p.length <= 150 && PKG.matches(p)) p else null
            }
        }
        return null
    }

    /** The store page of a package (when it is not on the phone). */
    fun storeUri(pkg: String): String = "market://details?id=$pkg"
}

/**
 * The system's button lands here (Chrome: intent://open?pkg=…#Intent;scheme=askerapps;package=com.askerpharmacy.apps;…).
 * No screen: the asked app's own launcher screen starts, or its store page when it is not on the phone; then this ends.
 * Nothing is read from or given to the app: only its usual start screen.
 */
class OpenActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pkg = Open.pkgOf(intent?.dataString)
        if (pkg != null) {
            try {
                val launch = packageManager.getLaunchIntentForPackage(pkg)
                if (launch != null) {
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(launch)
                } else {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Open.storeUri(pkg))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            } catch (e: Exception) {
                // nothing on this phone can open it (no store app either): nothing happens
            }
        }
        finish()
    }
}
