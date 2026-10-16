# Full reads for monthly shortages

V10 previously issued unpaginated reads for shortages, matching, confirmed totals and backup export. A monthly list larger than Supabase's default 1,000-row response cap could be partially displayed or matched, and a backup could silently omit rows.

`readAllRows` now reads stable ID-ordered pages of 1,000 and returns data only after all pages succeed. The shortage display, existing-item check before import, incoming matching, coverage totals, pending-match totals, history item details and backup export use it. Coverage reads confirmed items without constructing a URL containing thousands of shortage IDs. A failed totals read clears the affected coverage view instead of showing zero received quantities.

Validation: `node tests/full-read.cjs` passed for 0/999/1000/2000/2126 records, ID ordering, active filtering, later-page and network failures, and complete backup reads. `node tests/bilingual-aliases.cjs` and JavaScript syntax checks passed. No live shortage import or incoming write was submitted.

The prepared paste list has 2,126 unique names from 2,129 source rows. Three identical-name/equal-quantity repetitions were retained once, without summing the quantities. The source spreadsheet is unchanged. All prepared lines were checked against V10's actual parser. Existing test records remain; the import adds shortages rather than deleting previous records.

No new SQL is required. Publish this change before loading the monthly list. The pagination cap assumes the project's standard 1,000-row response limit; concurrent table mutations during multi-request reads are not a transactional snapshot.
