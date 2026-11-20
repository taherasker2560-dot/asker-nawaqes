package com.askerpharmacy.contacts

import android.content.Context

/**
 * The server's address and its public key are the system's own (both are public in its page); the only secret is this phone's key,
 * put here by LinkActivity (the system's «اربط التطبيق» button). The address can be changed only by the debug build's test receiver.
 */
object Config {
    const val URL = "https://qwrzdjdgvanmhaicncuk.supabase.co"
    const val API = "sb_publishable_af0XfsvB0Fwwo3HORqMN2g_iJNd9o0q"

    private fun p(c: Context) = c.getSharedPreferences("cfg", Context.MODE_PRIVATE)

    fun url(c: Context): String = p(c).getString("url", URL) ?: URL
    fun setUrl(c: Context, u: String) { p(c).edit().putString("url", u).apply() }
    fun key(c: Context): String = p(c).getString("key", "") ?: ""
    fun saveKey(c: Context, k: String) { p(c).edit().putString("key", k).apply() }
    fun ready(c: Context): Boolean = key(c).isNotEmpty()
    fun lastSnapshot(c: Context): Long = p(c).getLong("snap", 0L)
    fun setSnapshot(c: Context, t: Long) { p(c).edit().putLong("snap", t).apply() }
    fun lastRun(c: Context): Long = p(c).getLong("run", 0L)
    fun note(c: Context): String = p(c).getString("note", "") ?: ""
    fun setNote(c: Context, s: String) { p(c).edit().putString("note", s).putLong("run", System.currentTimeMillis()).apply() }
}
