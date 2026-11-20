package com.askerpharmacy.contacts

import android.content.ContentProviderOperation
import android.content.Context
import android.net.Uri
import android.provider.ContactsContract
import android.provider.ContactsContract.CommonDataKinds.Phone as PhoneKind
import android.provider.ContactsContract.CommonDataKinds.StructuredName

/** The phone's own contacts: read them all (name + numbers), see whether a number is already there, write a new one (into his Google account when the phone has one, so Google keeps it too). */
object Contacts {
    /** Every contact that has a number, grouped (one entry per contact). */
    fun readAll(c: Context): List<Phone.Row> {
        val raw = ArrayList<Triple<Long, String, String>>()
        val proj = arrayOf(PhoneKind.CONTACT_ID, PhoneKind.DISPLAY_NAME, PhoneKind.NUMBER)
        c.contentResolver.query(PhoneKind.CONTENT_URI, proj, null, null, null)?.use { cur ->
            val iId = cur.getColumnIndexOrThrow(PhoneKind.CONTACT_ID)
            val iName = cur.getColumnIndexOrThrow(PhoneKind.DISPLAY_NAME)
            val iNum = cur.getColumnIndexOrThrow(PhoneKind.NUMBER)
            while (cur.moveToNext()) raw.add(Triple(cur.getLong(iId), cur.getString(iName) ?: "", cur.getString(iNum) ?: ""))
        }
        return Phone.group(raw)
    }

    /** True when some contact already has this number (Android compares the way a call does, so 0100… and +20100… are the same). */
    fun has(c: Context, number: String): Boolean {
        val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
        c.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup._ID), null, null, null)?.use { return it.count > 0 }
        return false
    }

    /** The Google account that already holds contacts on this phone (type, name), or null: then a new contact is kept on the phone only. */
    fun account(c: Context): Pair<String, String>? {
        val sel = "${ContactsContract.RawContacts.ACCOUNT_TYPE}=? AND ${ContactsContract.RawContacts.DELETED}=0"
        c.contentResolver.query(ContactsContract.RawContacts.CONTENT_URI, arrayOf(ContactsContract.RawContacts.ACCOUNT_TYPE, ContactsContract.RawContacts.ACCOUNT_NAME), sel, arrayOf("com.google"), null)?.use { cur ->
            if (cur.moveToFirst()) {
                val t = cur.getString(0)
                val n = cur.getString(1)
                if (!t.isNullOrEmpty() && !n.isNullOrEmpty()) return Pair(t, n)
            }
        }
        return null
    }

    /** Writes one contact (name + mobile number). Returns false when the phone refused. */
    fun insert(c: Context, name: String, number: String, account: Pair<String, String>?): Boolean {
        return try {
            val ops = ArrayList<ContentProviderOperation>()
            ops.add(ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI)
                .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, account?.first)
                .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, account?.second)
                .build())
            ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                .withValue(ContactsContract.Data.MIMETYPE, StructuredName.CONTENT_ITEM_TYPE)
                .withValue(StructuredName.DISPLAY_NAME, name)
                .build())
            ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                .withValue(ContactsContract.Data.MIMETYPE, PhoneKind.CONTENT_ITEM_TYPE)
                .withValue(PhoneKind.NUMBER, number)
                .withValue(PhoneKind.TYPE, PhoneKind.TYPE_MOBILE)
                .build())
            c.contentResolver.applyBatch(ContactsContract.AUTHORITY, ops)
            true
        } catch (e: Exception) {
            false
        }
    }
}
