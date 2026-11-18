package com.askerpharmacy.alarm

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom

/**
 * «عدّاد موبايلات المنبه» (owner 2026-11-18: his «👥 المستخدمين» screen counts the phones that have the app and shows when one stops = probably removed).
 * Once a day (and when the app is opened) the app tells the pharmacy's server ONE thing: a random id it made on its first run, and its version.
 * No person, no name, no link, no alarm, no phone model: the id is not tied to anybody (the site tells the server which person has the app, by itself).
 * Server side: ar_app_ping (migration 202611190030): one update per id per 30 minutes, 300 new ids an hour at most.
 */
object AppPing {
    private const val ENDPOINT = "https://qwrzdjdgvanmhaicncuk.supabase.co/rest/v1/rpc/ar_app_ping"

    /** a day, a little less, so a job that runs once a day never skips one */
    const val EVERY_MS = 20L * 3_600_000

    /** the server takes one update per id per 30 minutes: a failed try waits as long */
    const val RETRY_MS = 30L * 60_000

    private val ID = Regex("[0-9a-f]{32}")
    private val OK = Regex("\"ok\"\\s*:\\s*true")

    fun newId(): String {
        val b = ByteArray(16)
        SecureRandom().nextBytes(b)
        return b.joinToString("") { "%02x".format(it) }
    }

    fun validId(s: String?): Boolean = s != null && ID.matches(s)

    /** the version as the server accepts it: plain letters, digits and . - _ , 20 characters at most */
    fun cleanVersion(v: String?): String = (v ?: "").filter { it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it == '.' || it == '-' || it == '_' }.take(20)

    fun body(id: String, version: String?): String = "{\"p_id\":\"$id\",\"p_version\":\"${cleanVersion(version)}\"}"

    /** the server's answer {"ok":true} (a spacing of the JSON is not important); {"ok":false,"error":"busy"|"id"} is not taken */
    fun accepted(answer: String): Boolean = OK.containsMatchIn(answer)

    /** a day since the last good ping AND half an hour since the last try; a clock that went back never blocks it */
    fun due(lastOk: Long, lastTry: Long, now: Long): Boolean =
        (lastOk > now || now - lastOk >= EVERY_MS) && (lastTry > now || now - lastTry >= RETRY_MS)

    /** true = nothing more to do (told the server, or not due yet); false = try again later. Blocking: never on the main thread. */
    fun pingIfDue(context: Context): Boolean {
        val ctx = context.applicationContext
        // a test or developer build (the CI emulator installs one on every run) is never a customer's phone: it must not count
        if ((ctx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) return true
        val st = Store(ctx)
        val now = System.currentTimeMillis()
        if (!due(st.pingOk, st.pingTry, now)) return true
        st.pingTry = now
        val ok = try {
            val version = ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName
            val c = URL(ENDPOINT).openConnection() as HttpURLConnection
            c.requestMethod = "POST"
            c.connectTimeout = 10_000
            c.readTimeout = 20_000
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.setRequestProperty("apikey", VoiceFetcher.KEY)
            c.setRequestProperty("Authorization", "Bearer ${VoiceFetcher.KEY}")
            c.outputStream.use { it.write(body(st.appId, version).toByteArray(Charsets.UTF_8)) }
            c.responseCode == 200 && accepted(c.inputStream.use { String(it.readBytes(), Charsets.UTF_8) })
        } catch (e: Exception) {
            false
        }
        if (ok) st.pingOk = now
        return ok
    }

    /** the daily job is set (once) and, if a day has passed, the ping goes now in the background */
    fun kick(context: Context) {
        val ctx = context.applicationContext
        PingJob.schedule(ctx)
        Thread { try { pingIfDue(ctx) } catch (e: Exception) { /* the daily job asks again */ } }.start()
    }
}

/** once a day when there is a network (kept over a restart of the phone); a failure is tried again later by the system */
class PingJob : JobService() {
    companion object {
        private const val ID = 4109

        fun schedule(ctx: Context) {
            try {
                val js = ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
                if (js.getPendingJob(ID) != null) return   // already there: keep its own clock
                val job = JobInfo.Builder(ID, ComponentName(ctx, PingJob::class.java))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(24L * 3_600_000)
                    .setPersisted(true)
                    .build()
                js.schedule(job)
            } catch (e: Exception) {
                // no job service on this phone: every open of the app pings when a day has passed
            }
        }
    }

    override fun onStartJob(params: JobParameters): Boolean {
        Thread {
            val done = try { AppPing.pingIfDue(applicationContext) } catch (e: Exception) { false }
            try { AppUpdate.checkIfDue(applicationContext) } catch (e: Exception) { /* the next open reads the version file again */ }   // the newest version is known before he opens the app
            jobFinished(params, !done)
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = true
}
