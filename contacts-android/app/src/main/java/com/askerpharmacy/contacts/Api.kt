package com.askerpharmacy.contacts

import android.content.Context
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** The server's functions (migration 202611201900), called the way the system's own page calls them: POST /rest/v1/rpc/<name> with the public key. The phone's own key travels in the body and is checked by the function. */
object Api {
    fun rpc(c: Context, fn: String, body: String): String {
        val conn = URL(Config.url(c).trimEnd('/') + "/rest/v1/rpc/" + fn).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 60_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("apikey", Config.API)
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            if (code !in 200..299) throw IOException("HTTP $code ${text.take(160)}")
            return text
        } finally {
            conn.disconnect()
        }
    }
}
