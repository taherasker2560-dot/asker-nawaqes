# Approved bilingual names in V10

Four Arabic/English product-name pairs confirmed by the owner on 2026-10-17:

| Arabic name | English shortage name |
| --- | --- |
| زابيميرت 30 مجم أقراص | ZAPIMERT 30MG TAB |
| دونازيل 5 مجم أقراص | DONAZIL 5MG 30TAB |
| فالساتنس 160/25 أقراص | VALSATENS PLUS 160/25 MG |
| سبازموبينافير 50 أقراص | SPASMOPINAVER 50MG 30TABL |

The dictionary only suggests a single existing active shortage with the listed English name. It never imports shortages or creates incoming batches. The actual receipt remains `possible` until the user confirms it. A dictionary hit is described as such rather than presented as a 100% fuzzy score.

Arabic/Persian/ASCII digits, spacing, mg, tablet abbreviations and common Arabic tablet wording are normalized. Other strengths, forms and explicit package sizes are not dictionary matches. Existing fuzzy matching remains a separate fallback and is unchanged.

Current uploaded V10 backup contains trial records, so these real product suggestions will appear only when the corresponding real shortages exist. Supplier screenshots contain prices, not received quantities; they were used only for product-name mapping. No receipt, shortage import or deduction was submitted.

Validation: `node tests/bilingual-aliases.cjs` checks the four confirmed pairs; digit/spacing variants; missing, inactive and ambiguous targets; differing strength, form and package; the pending-confirmation save path; and JavaScript syntax. No new SQL or data migration is required.
