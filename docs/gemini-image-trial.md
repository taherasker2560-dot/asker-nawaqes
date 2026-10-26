# Gemini image-reading trial

V10's new optional button opens the existing owner-private ASKER reader. The current local OCR remains unchanged. A Gemini free-tier key is entered only in that private reader's encrypted connection form, never in V10, GitHub or chat. No provider key or Supabase token crosses between tabs.

The popup receives a fresh names-only active-shortages list and optionally the first selected image. The owner reviews a names-only crop before any Google request. The private reader compares the extracted English names with the pharmacy catalogue, then can return selected suggestions to V10's availability comparison. The bridge checks the exact origin, popup window and a random nonce; changing V10's input or switching to actual-receipt mode prevents an old result from replacing it. Availability comparison does not record stock receipts or deduct shortages. Browser opener isolation can prevent the return bridge; the reader offers copying the resulting names instead.

The Gemini service is a trial, with quota and accuracy still to be checked using the owner's key. Stronger suggestions remain optical-reading hypotheses. Uncertain names, conflicting strengths/forms and multiple candidate item IDs require review. No claim of improved live OCR accuracy has been made. The existing local reader is not replaced, and no database/schema change is needed.

Validation: `tests/gemini-bridge.cjs` checks origin/source/nonce, fresh names-only context, replay/stale-input and receipt-mode guards. Existing bilingual/availability tests and the actual V10 DOM test pass. Service/credential/crop and real-catalogue-ID tests live in the private Site source; provider calls there were mocked, not a live Gemini benchmark.
