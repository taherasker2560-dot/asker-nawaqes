# Arabic/English suggestions and OCR trial — 26 October 2026

## Published behavior in this change

Supplier availability now displays additional Arabic/English name candidates separately from exact matches and the four owner-approved aliases. It combines trade-name spelling hints, phonetic comparison and normalization of Arabic/Persian digits, decimal separators and dosage-form abbreviations. It searches only active items returned from the user's current shortages; it does not bundle the user's shortages or upload images to a provider.

A stated strength, dosage form, unit, release modifier or package count cannot be silently replaced. Compound strength numbers retain their order. Missing details can yield several clearly labelled candidates rather than an automatic SKU choice. These search hints are not a clinically verified translation dictionary and are not pharmaceutical substitutions.

An optional choice/undo changes only the current comparison's visible selection. It does not persist a correction, add an alias, confirm a receipt or write to Supabase. Editing the input or changing modes clears the result. Quantity-free comparison and the existing four approved aliases remain available. Actual-receipt matching is unchanged.

## OCR experiment — not enabled by this change

Recovered the owner's original ten-photo benchmark archive and inspected its prior results. An earlier column-only crop and a separate recognizer had already failed to show a reliable fix, especially for strengths.

Tested a new pixel-based ruled-column detector and per-row OCR with a white border, threshold 150 and PSM 13. Column and row boxes were generated from each full original image without manual target coordinates. Reference coordinates were used only to select which generated row to evaluate. Compared ten pre-existing manually transcribed reference lines from five originals against the current production extraction, using Tesseract.js **6.0.1**, its 6.0.0 core, and the same pinned Arabic best model (`e12c65a...`, SHA256 `ab9d157d8e38ca00e7e39c7d5363a5239e053f5b0dbdb3167dde9d8124335896`). The experiment used Node and a Canvas implementation, not an Android browser.

| Metric on the ten selected lines | Current reader | Per-row trial |
| --- | ---: | ---: |
| Exact complete line after digit/Arabic/space normalization | 1/10 | 0/10 |
| Exact numeric sequence | 1/10 | 1/10 |
| Total normalized edit distance (163 reference characters) | 28 | 23 |

Four lines had fewer character edits, one had more, and five were equal. This is a small exploratory sample, not full-image accuracy, an independent holdout or evidence of safe strength recognition. The references are earlier manual transcriptions, not owner-approved product identities. The per-row mode was therefore **not connected to the shipped UI**. `incoming-images.js` is byte-for-byte unchanged; no image-reading improvement is claimed for this release.

Technical reference: https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html (segmentation and table-layout limitations).

## Checks

- `node tests/name-translation.cjs`: transliteration/spelling examples, Arabic/Persian digits, fraction/decimal strengths, form/unit/modifier/pack conflicts, inactive/ambiguous targets, suggestions never auto-match.
- `NODE_PATH=<jsdom dependency directory> node tests/translation-ui.cjs`: actual V10 DOM scripts with a mocked Supabase client; separate suggestion display, choice/undo, stale-input and mode invalidation, zero writes.
- Existing alias, availability, image-extraction, file-import, pagination and atomic-incoming suites pass. Atomic-incoming uses PGlite locally; no production writes.
- No paid API requests or live Supabase writes. No Android/browser rendering claim. Real optical extraction in the experiment did not use mocked OCR.
