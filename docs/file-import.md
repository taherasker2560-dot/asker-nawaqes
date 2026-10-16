# Excel and CSV import in V10

Both monthly shortages and daily incoming now have an **استيراد Excel أو CSV** panel. Supported extensions are `.xlsx`, `.xls` and `.csv`. PDF remains a later feature. Daily incoming images have a separate OCR panel documented in incoming-images.md.

1. Choose a local file (up to 10 MiB), sheet and header row.
2. Review the selected name and quantity columns. Price/cost/discount/amount columns cannot be mapped as quantities. If quantity is absent, the preview leaves it blank for manual entry.
3. Preview up to 10,000 non-empty data rows, 100 per page. Edit names/quantities or uncheck rows. Exact normalized-name/equal-quantity duplicates start unchecked; they remain visible. Conflicting duplicates and missing/invalid quantities must be corrected or excluded.
4. Transfer reviewed rows to the existing text area. Replacing existing text asks first. This does **not** save records. The user then uses the ordinary Save button, preserving the atomic incoming RPC and existing matching/confirmation workflow.

While an import is open, its normal Save button is disabled to avoid saving stale text. Cancel preserves existing text. Changing a mapping/sheet invalidates the old preview. A generation counter prevents a slow previous file read from replacing a newer selection.

Files are parsed locally. Excel uses a vendored SheetJS CE 0.20.3 standalone build, lazy-loaded from `vendor/xlsx-0.20.3.full.min.js`. The bytes were checked against the official 0.20.3 tar archive. SHA-256: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`. License is in `vendor/SheetJS-LICENSE.txt`.

Primary source: https://docs.sheetjs.com/docs/getting-started/installation/standalone/ . Download: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js . Version is pinned; no runtime CDN dependency is introduced for Excel parsing.

CSV handles UTF-8/BOM and Windows-1256, comma/semicolon/tab delimiters, quoted separators/newlines and escaped quotes. Quantities accept Arabic/Persian digits and positive decimal numbers. No default quantity is supplied by the importer. Excel formulas are not calculated; absent cached results must be entered manually.

## Validation

- `node tests/file-import.cjs`: CSV dialects/quoting/BOM, Arabic/Persian numbers, Windows-1256, price rejection, manual quantities, duplicate handling, invalid mapping and row limits. Setting `ASKER_SOURCE_XLSX` also validates the owner's real workbook: header row 4, Product Name/Required Qty columns, 2,129 data rows and 2,126 selected unique names.
- `node tests/file-import-ui.cjs` with Playwright and Chromium: real browser at 390×844, both import panels, Arabic semicolon CSV, price-only input with manual quantity, legacy XLS, real XLSX with all rows and paginated preview, cancellation/overwrite rejection and malformed-file errors. Database methods are mocked and monitored: zero writes during import/preview/transfer, no JavaScript errors.
- Existing pagination and bilingual alias tests still pass. Mobile entry point visually inspected.

UI test environment variables: `PLAYWRIGHT_MODULE`, optional `CHROMIUM_EXECUTABLE` or `CHROMIUM_MODULE`, optional `ASKER_SOURCE_XLSX`, optional `IMPORT_SCREENSHOT`.

No SQL or data migration is needed. No pharmacy data was imported into the live database during these tests. Local file import does not fix the separate monthly-list replacement workflow; the existing save action still adds/updates records and retains earlier active entries.
