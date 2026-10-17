# Supplier list comparison

The incoming panel defaults to supplier availability (names only). Text retains all trailing numbers as part of the name. CSV/Excel can select a name column without a quantity column; price columns are ignored. Images compare extracted names immediately without obligatory transcription review or quantity entry.

The comparison reads all active shortages through the paginated reader. It displays unique exact normalized names and the four owner-approved bilingual aliases. Other names appear separately as unresolved, including ambiguous duplicate target names. Fuzzy similarity is not confirmed automatically. An unresolved row does not establish absence: OCR, spelling, and the limited Arabic/English dictionary may prevent recognition. The OCR engine and transcription accuracy are unchanged.

Availability results are temporary and are not receipts. They perform no inserts, updates, RPCs, stock deductions, or changes to shortage coverage/history. Refreshing the page clears them. Existing records remain available. The optional actual-receipt mode retains quantity validation, manual suggestions, and atomic save.

Validation: unit tests cover number preservation, aliases, ambiguity, and mode-specific quantity validation. Mobile UI tests cover text, price-only CSV, automatic photo comparison using mocked OCR, and zero DB writes. Existing receipt-mode OCR/import tests still exercise quantities, cancellation and stale image results. Real OCR transcription quality has not been re-tested or improved by this change.
