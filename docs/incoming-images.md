# Incoming images in V10

The daily incoming panel now accepts up to 10 JPG/PNG/WebP images, 8 MiB per image and 30 MiB in total. Thumbnails can be opened at full size for review. Images are processed sequentially on the device and are not attached to the database history.

The user explicitly starts OCR, chooses Arabic/English/mixed text and accuracy mode, and can cancel. Arabic with the higher-accuracy model is the default. Selecting CSV/Excel or canceling the shared importer cancels pending image work and prevents late results from replacing a newer preview or existing text.

OCR drafts enter the existing editable preview with source filename and row. Quantities are **always blank**, including when photos contain prices or quantities. Exact repeated names across overlapping photos start unchecked. The user edits names, enters received quantities and excludes unwanted rows before transferring to the ordinary input. Only the separate normal Save action writes records and invokes the existing matching flow.

An explicitly recognized price-column header at an outer edge lets the extractor exclude that column. A recognized price-header line is removed. If the price column cannot be identified, the UI warns that remaining prices must be removed from draft names. Concentration digits are retained as name text, never interpreted as quantities. Low-resolution Arabic OCR can still misread drug names and concentrations; manual review is mandatory, and extracted names are not treated as verified dictionary entries.

## Runtime dependencies and privacy

- Vendored Tesseract.js 6.0.1 main and worker scripts, with Apache 2.0 license.
- Pinned Tesseract.js-core 6.0.0 WASM downloads from jsDelivr, selected by the engine.
- Higher-accuracy models from official `tesseract-ocr/tessdata_best` commit `e12c65a915945e4c28e237a9b52bc4a8f39a0cec`, uncompressed. Arabic model: 12,603,724 bytes, SHA-256 `ab9d157d8e38ca00e7e39c7d5363a5239e053f5b0dbdb3167dde9d8124335896`. The pinned production Arabic model was byte-compared with the browser test model.
- Faster mode uses Tesseract.js's default language data CDN. Each mode has a separate browser cache key. First use requires downloading engine/models; higher accuracy downloads more data.
- No image bytes are sent to an OCR service or the pharmacy database. The browser downloads dependencies, then uses a local worker. Network/resource failures preserve prior text, show an error and allow cancellation/retry.

Primary docs: https://github.com/naptha/tesseract.js/blob/master/docs/api.md and https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md . Models: https://github.com/tesseract-ocr/tessdata_best .

## Validation

`node tests/incoming-images.cjs`: file count/type/size, price-column geometry (including an OCR-corrupted name header), preserved concentration text, text fallback, source labels, overlapping-image duplicates and blank quantities.

`tests/incoming-images-ui.cjs` with Playwright/Chromium at 390×844: multiple image previews, blank/editable quantities, duplicate exclusion, safe transfer, cancel/late results, Excel/CSV supersession and OCR failure recovery. Database write methods were mocked and monitored; no writes occurred during import/preview/transfer, and there were no JavaScript errors.

The same real-browser test ran actual Tesseract/WASM on the owner's `1000455127.jpg`, serving engine/models locally for a repeatable test. Both model modes returned names for review; the higher-accuracy run produced 51 rows and excluded the price column. Several names/concentrations still needed correction, so this is an editable draft rather than a verified transcription. No live incoming batch was saved. Existing Excel/CSV mobile tests, parser tests, pagination and bilingual tests also passed.

Test env: `PLAYWRIGHT_MODULE`, `CHROMIUM_EXECUTABLE`, optional `ASKER_OCR_IMAGE`, `OCR_DEPENDENCIES` (local Tesseract core/model test assets), `OCR_BEST_MODELS` (local official best models).

No SQL is required. PDF remains deferred.
