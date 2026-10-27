# Supplier messages pasted as text (added 2026-10-27)

Suppliers often send the incoming list as a chat message: greetings, section titles, emoji, quota remarks and offers mixed with product names, sometimes several products on one line. `parseIncomingLines` (in `availability.js`) turns that text into one name per product before the comparison:

- Greeting/intro lines (e.g. السلام عليكم، وارد اليوم) and section titles (الالبان، الثلاجه) are skipped and counted in the status message. Blank and dash-only lines are dropped silently.
- Emoji and bullet characters are removed.
- Remarks move out of the name into a note shown under the result: quota (كوته in any spelling, نصف/ربع كوته, and a quota count that follows it), bonus offers such as `10+1` (only when the first number is up to 100 and the bonus is smaller, so `10+14` or `500+125` stay in the name), discounts (خصم ...), العرض prices and "last quantity / small quantity" phrases.
- A line with products separated by two or more dots becomes separate names. A part that is only a number or starts with a number reuses the product name (`فياجرا 50.....100 ق` → `فياجرا 50`, `فياجرا 100 ق`); size words (كبير/صغير/كبار/صغار) become variants.
- Strengths, pack numbers and formulas are never changed (`50*100`, `1/2/3`, `15/12.5`). Abbreviations such as ق and ش are left as written. Digits glued to an Arabic word get a space (`سليسبت500` → `سليسبت 500`).

Matching rules are unchanged: exact normalized names and the four approved aliases only, and anything else stays unresolved for review. Tests: `tests/availability.cjs`.
