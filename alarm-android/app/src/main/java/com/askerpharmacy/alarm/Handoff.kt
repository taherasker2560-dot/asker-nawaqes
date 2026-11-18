package com.askerpharmacy.alarm

import android.app.Activity
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * The website hands its alarms over (owner 2026-11-18: the work stays in «صيدلية عسكر» on every phone, this small Android app only rings and speaks).
 * The page opens askeralarm://handoff (an Android intent link, from the customer's own tap on «حفظ»): this door shows nothing, takes the alarms and ends at once.
 * What comes: {"app": {"speak", "items": [{"id", "spoken", "times"}]}, "page": {the site's own copy, kept as the seed for this app's own page}}.
 * Like every web-to-app link, any web page could send such an intent: it can only add dose alarms (clean names and times, 40 at most) that the customer can delete.
 */
class HandoffActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val st = Store(this)
        try {
            val raw = intent?.getStringExtra("alarms")
            if (!raw.isNullOrEmpty() && raw.length < 60_000) {
                val o = JSONObject(raw)
                val app = o.optJSONObject("app")
                if (app != null && st.setFromPage(app.toString())) {
                    val page = o.optJSONObject("page")
                    if (page != null) st.seed = page.toString()
                    st.log("وصلت منبهات من الموقع")
                    Scheduler.reschedule(this)
                    VoiceJob.schedule(this)   // the sure way (the system runs it when there is a network, and again if it fails)
                    val ctx = applicationContext
                    Thread { try { VoiceFetcher.fetchMissing(ctx) } catch (e: Exception) { /* the job asks again */ } }.start()   // the quick way, while the process is still alive
                } else {
                    st.log("منبهات الموقع مش مفهومة")
                }
            }
        } catch (e: Exception) {
            st.log("منبهات الموقع ما اتقرتش")
        }
        finish()
    }
}

/**
 * The sentence sound files the app does not have yet, got by the app itself (the site hands over names and times, never sound): the pharmacy's own voice function,
 * the same one the site asks (it answers a sentence it made before from its cache, and makes a new one once).
 */
object VoiceFetcher {
    private const val FUNCTION = "https://qwrzdjdgvanmhaicncuk.supabase.co/functions/v1/asker-dose"
    private const val KEY = "sb_publishable_af0XfsvB0Fwwo3HORqMN2g_iJNd9o0q"   // the site's public key (it is in the page too)
    private const val ORIGIN = "https://taherasker2560-dot.github.io"          // the function answers the pharmacy's own address only

    /** true when every sound is here (or the voice is off), false when something is still missing and the job should try again later */
    fun fetchMissing(ctx: Context): Boolean {
        val st = Store(ctx)
        if (!st.speak) return true
        var all = true
        for (name in st.alarms().map { it.spoken }.distinct()) {
            if (st.hasVoice(name)) continue
            if (!fetch(st, name)) all = false
        }
        return all
    }

    private fun fetch(st: Store, name: String): Boolean = try {
        val c = URL(FUNCTION).openConnection() as HttpURLConnection
        c.requestMethod = "POST"
        c.connectTimeout = 10_000
        c.readTimeout = 60_000
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("Origin", ORIGIN)
        c.setRequestProperty("apikey", KEY)
        c.setRequestProperty("Authorization", "Bearer $KEY")
        c.outputStream.use { it.write(JSONObject().put("action", "voice").put("name", name).toString().toByteArray(Charsets.UTF_8)) }
        if (c.responseCode == 200) {
            val bytes = c.inputStream.use { it.readBytes() }
            val saved = st.saveVoice(name, bytes)
            st.log(if (saved) "نزّل صوت: $name" else "صوت $name مش مقبول (${bytes.size} بايت)")
            saved
        } else {
            st.log("السيرفر رد ${c.responseCode} على صوت $name")
            false
        }
    } catch (e: Exception) {
        st.log("الصوت ما نزلش: ${e.javaClass.simpleName}")
        false
    }
}

/** runs when there is a network: asks for the missing sounds; a failure is tried again later by the system (a linear back-off) */
class VoiceJob : JobService() {
    companion object {
        private const val ID = 4108

        fun schedule(ctx: Context) {
            try {
                val js = ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
                val job = JobInfo.Builder(ID, ComponentName(ctx, VoiceJob::class.java))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setBackoffCriteria(30_000L, JobInfo.BACKOFF_POLICY_LINEAR)
                    .build()
                js.schedule(job)
            } catch (e: Exception) {
                // no job service on this phone: the next open of the app asks again
            }
        }
    }

    override fun onStartJob(params: JobParameters): Boolean {
        Thread {
            val done = try { VoiceFetcher.fetchMissing(applicationContext) } catch (e: Exception) { false }
            jobFinished(params, !done)
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = true
}
