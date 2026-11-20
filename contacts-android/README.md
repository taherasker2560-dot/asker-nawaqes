# «دفتر الأرقام» (contacts-android)

The owner's phone app (2026-11-20, option «أ»: «نخلي حفظ الارقام في تطبيقنا ونعمله اوبشن يتخزن بشكل تلقائي في سجل ارقام الهاتف وجوجل»).
It keeps his phone's contacts (and so his Google contacts, which the phone syncs) in step with the system's number book (`ar_contacts`):

1. **System → phone:** the numbers saved in the system (typed in «طلب مش موجود», `source = 'typed'`, not yet written) are written into the phone's contacts (into his Google account when the
   phone has one), then told back (`ar_phone_ack`). A number the phone already has is not written twice.
2. **Phone → system:** every 10 days (or «زامن دلوقتي») every contact with a number is sent (`ar_phone_push_rows` in chunks of 250, then `ar_phone_finish` checks the count). The LAPTOP merges
   them into the book (`Hub\contacts\MERGE_PHONE_CONTACTS.ps1`): a new number comes **closed to the staff**; nothing is ever deleted.

- Server: migration 202611201900 (`ar_phone_keys`, `ar_phone_contacts`, `ar_phone_syncs`, `ar_contacts.pushed_at` and the functions). The phone has its OWN key (32 bytes, only the sha256 is stored on
  the server); the system's «اربط التطبيق» button (owner only) makes it and opens `askercontacts://link?k=<key>`. The server's address is fixed in the app (`Config.URL`): a link can never send contacts elsewhere.
- Permissions: INTERNET, READ_CONTACTS, WRITE_CONTACTS, RECEIVE_BOOT_COMPLETED (the 3-hourly job survives a restart). No ads, no outside libraries.
- Built, tested (JUnit + an Android 14 emulator against `ci/fake.cjs`) and published by `.github/workflows/contacts-apk.yml` to the pre-release `contacts-build` as `asker-contacts.apk`
  (only from `main`; the debug build with its test receiver is never published).
- One signing key for every build, kept in the Actions cache `contacts-keystore-v1` (a weekly run keeps it): a lost key = uninstall and install again.
- Every release must raise `versionCode` / `versionName` in `app/build.gradle.kts`.