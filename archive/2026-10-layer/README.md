# The October layer (archived 2026-11-23)

The first web version of the shortages system (October 2026). It was moved here as one piece during the hardening
of 2026-11-23, and nothing was deleted. Git history keeps every file at its old path.

What is here:
- the page `asker-nawaqes-test-10.html` and its 9 scripts;
- the Tesseract files it loaded;
- the source of the edge function `read-supplier-image`;
- the 18 unit tests of that code. CI runs only `tests/*.cjs` and `tests/e2e/*.spec.cjs`, so these no longer run.

Why: no live page loads any of it.
- The Arabic system page, the store, the supplier page, the service workers and the workflows were all checked.
- It reads its own tables, which nothing live uses: `incoming_batches`, `incoming_items`, `shortage_items`,
  `shortage_availability`, `name_review_queue`, `name_aliases`, `name_rejections`, `reading_fixes`, and the RPC
  `save_incoming_batch_atomic`.

What stays where it was:
- `vendor/xlsx-0.20.3.full.min.js` and its licence stay in `vendor/`, because the live system page uses them.
- `tests/catalog-match.cjs` stays and now tests `supabase/functions/arabic-shortages/match.ts`. That file is
  byte-identical to the archived copy.
- The deployed function `read-supplier-image` was not undeployed. Archiving its source changes nothing on
  Supabase. It still needs a login and the email allowlist.
- The old tables were not touched.

To bring something back, `git mv` it to its old path.
