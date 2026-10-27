# Gemini image-reading trial

V10's new optional button opens the existing owner-private ASKER reader. The current local OCR remains unchanged. A Gemini free-tier key is entered only in that private reader's encrypted connection form, never in V10, GitHub or chat. No provider key or Supabase token crosses between tabs.

The popup receives a fresh list of active shortages (`id` and `name` only, no quantities) and up to 20 of the selected images (8 MiB each at most). The owner reviews a names-only crop before any Google request. The private reader compares the extracted English names with the pharmacy catalogue, then can return selected suggestions to V10's availability comparison. The bridge checks the exact origin, popup window and a random nonce; changing V10's input or switching to actual-receipt mode prevents an old result from replacing it. Availability comparison does not record stock receipts or deduct shortages. Browser opener isolation can prevent the return bridge; the reader offers copying the resulting names instead.

The Gemini service is a trial, with quota and accuracy still to be checked using the owner's key. Stronger suggestions remain optical-reading hypotheses. Uncertain names, conflicting strengths/forms and multiple candidate item IDs require review. No claim of improved live OCR accuracy has been made. The existing local reader is not replaced, and no database/schema change is needed.

Validation: `tests/gemini-bridge.cjs` checks origin/source/nonce, fresh names-only context, replay/stale-input and receipt-mode guards. Existing bilingual/availability tests and the actual V10 DOM test pass. Service/credential/crop and real-catalogue-ID tests live in the private Site source; provider calls there were mocked, not a live Gemini benchmark.

## Bridge behaviour (updated 2026-10-27)

- Oversized images (over 8 MiB) are skipped by name and the rest are sent; images beyond 20 are reported, not silently dropped. A database read failure has its own message, and the reader may retry.
- A result is accepted only after the shortage list was sent for that session. Invalid names (under 2 or over 250 characters, line breaks, `|`) are dropped one by one and counted; the batch is rejected only when nothing valid remains or it has over 1,600 names. Every rejection shows a status message.
- If V10's text or mode changed while the reader was open, the result is ignored and the session is closed, so an old result cannot be applied later.
- Gemini names replace the incoming text; a "restore" button brings back the previous text. A comparison failure is reported.
- Returned names go through the same supplier-text parser as pasted text (offers such as 10+1 and quota words become notes).
- Tests without npm: `node tests/gemini-bridge-nodeps.cjs`. `tests/gemini-bridge.cjs` still needs `jsdom`.
- Still unverified: the private reader's own code (`/gemini-reader.html`): model, prompt, what is sent to Google, and where the key is stored.
