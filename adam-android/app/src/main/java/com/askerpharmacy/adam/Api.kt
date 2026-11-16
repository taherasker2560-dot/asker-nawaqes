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

    /**
     * «آدم 2» (2026-11-17): the FAST brain on the server (function asker-adam). One call, no queue: [history] = the conversation so far
     * ([{who: "me"|"adam", text}], the last 8), [talkCtx] = what the server said we are talking about. The answer has the same shape as
     * the laptop's ({speak, show, do_now, open, walk}) plus ctx / end / handoff. null = no answer (no net, server down): the laptop is
     * asked instead, as before.
     */
    fun talk(ctx: Context, text: String, history: org.json.JSONArray, talkCtx: JSONObject?): JSONObject? {
        val c = URL(Config.url(ctx) + "/functions/v1/asker-adam").openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 6000
            c.readTimeout = 15000
            c.doOutput = true
            c.setRequestProperty("x-adam-key", Config.deviceKey(ctx))
            c.setRequestProperty("apikey", Config.apiKey(ctx))
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            val b = JSONObject().put("text", text).put("history", history)
            if (talkCtx != null) b.put("ctx", talkCtx)
            c.outputStream.use { it.write(b.toString().toByteArray(Charsets.UTF_8)) }
            if (c.responseCode != 200) return null
            val t = c.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            return JSONObject(t)
        } catch (e: Exception) {
            return null
        } finally {
            c.disconnect()
        }
    }
}
