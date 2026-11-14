package com.askerpharmacy.adam

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** The bot server's queue (migration 202611150100_ar_adam): ask, and read the answer. Blocking: call from a background thread. */
object Api {
    private fun call(ctx: Context, fn: String, body: JSONObject): JSONObject? {
        val c = URL(Config.url(ctx) + "/rest/v1/rpc/" + fn).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 10000
            c.readTimeout = 25000
            c.doOutput = true
            val api = Config.apiKey(ctx)
            c.setRequestProperty("apikey", api)
            if (!api.startsWith("sb_")) c.setRequestProperty("Authorization", "Bearer $api")
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            if (code !in 200..299) return null
            return if (text.isBlank() || text == "null") JSONObject() else JSONObject(text)
        } catch (e: Exception) {
            return null
        } finally {
            c.disconnect()
        }
    }

    /** A new request (what he said), or his answer to a confirmation (confirmOf = the request that asked, answer = "yes" / "no"). */
    fun ask(ctx: Context, convo: String, text: String, confirmOf: Long? = null, answer: String? = null): JSONObject? {
        val b = JSONObject()
            .put("p_key", Config.deviceKey(ctx))
            .put("p_convo", convo)
            .put("p_body", text)
            .put("p_confirm_of", if (confirmOf == null) JSONObject.NULL else confirmOf)
            .put("p_answer", if (answer == null) JSONObject.NULL else answer)
        return call(ctx, "ar_adam_ask", b)
    }

    fun get(ctx: Context, id: Long): JSONObject? {
        val b = JSONObject().put("p_key", Config.deviceKey(ctx)).put("p_id", id)
        return call(ctx, "ar_adam_get", b)
    }
}
