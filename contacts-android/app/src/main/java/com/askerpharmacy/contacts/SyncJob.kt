package com.askerpharmacy.contacts

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context

/** Runs Sync every 3 hours in the background (the system picks the minute; it survives a restart of the phone). */
class SyncJob : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        Thread {
            try {
                Sync.run(applicationContext)
            } finally {
                jobFinished(params, false)
            }
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = false

    companion object {
        private const val ID = 7

        fun schedule(c: Context) {
            val js = c.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
            if (js.getPendingJob(ID) != null) return
            js.schedule(
                JobInfo.Builder(ID, ComponentName(c, SyncJob::class.java))
                    .setPeriodic(3 * 3_600_000L)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true)
                    .build()
            )
        }
    }
}
