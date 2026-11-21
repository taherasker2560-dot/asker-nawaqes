package com.askerpharmacy.contacts

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.widget.Toast

/**
 * The system's «اربط التطبيق» button opens askercontacts://link?k=<this phone's key>. It asks him once, then keeps the key.
 * Only the key is taken from the link: the server's address is fixed in the app, so a link from any other page can at worst put a wrong key here
 * (the sync then fails and he links again); it can never send the phone's contacts anywhere else.
 */
class LinkActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        val k = intent?.data?.getQueryParameter("k") ?: ""
        if (!Phone.validKey(k)) {
            Toast.makeText(this, "الرابط ده مش سليم", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        AlertDialog.Builder(this)
            .setTitle("ربط دفتر الأرقام")
            .setMessage("أربط التطبيق ده بسيستم صيدلية عسكر؟")
            .setPositiveButton("اربط") { _, _ ->
                Config.saveKey(this, k)
                SyncJob.schedule(this)
                // the app's own screen, in the app's own task (it stays in the recent apps and on the phone's app list as any app)
                startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
                finish()
            }
            .setNegativeButton("لأ") { _, _ -> finish() }
            .setOnCancelListener { finish() }
            .show()
    }
}
