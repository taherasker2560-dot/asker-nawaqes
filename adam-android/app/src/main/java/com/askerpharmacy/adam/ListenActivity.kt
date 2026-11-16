package com.askerpharmacy.adam

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle

/**
 * «اسأل آدم» (owner 2026-11-17, «آدم 2»): a second app entry with no screen. Opening it starts a conversation with Adam at once, without
 * the word: from the phone's side key (Settings → Advanced features → Side key → Double press → Open app → «اسأل آدم»), from the tile
 * in the quick panel, or from its own icon. It shows over the lock screen, so the side key works with the phone locked; the
 * microphone service may be started because this screen is in front for a moment.
 */
class ListenActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        start(this)
        finish()
        overridePendingTransition(0, 0)
    }

    companion object {
        fun start(ctx: Context) {
            val i = Intent(ctx, AdamService::class.java).setAction(AdamService.ACTION_ASK_AGAIN)
            try { ctx.startForegroundService(i) } catch (e: Throwable) { }
        }
    }
}
