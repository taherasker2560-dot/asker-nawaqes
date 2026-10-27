"""Builds the private item list used by read-supplier-image (codes + names only, no prices or vendors).

Usage: python3 scripts/build-catalog.py ASKER_ITEMS.CSV [name-references.js] > catalog.json
- ASKER_ITEMS.CSV: PharmaFly export, ';' separated, UTF-8 with BOM (columns ID, name, NameOld, DESCRIPTION, IsActive).
- name-references.js (optional): main-site bilingual list; its Arabic draft names are added per item code.
Inactive items and items marked cancelled (ملغى / لاغى) are left out.
Upload the output to Supabase Storage bucket "asker-private" as catalog.json. Never commit it: this repository is public.
"""
import csv, json, re, sys

AR = re.compile('[ء-ي]')
DEAD = re.compile(r'مل[غع][ىي]|لا[غع][ىي]')
ok = lambda s: s and s != 'NULL' and 2 <= len(s.strip()) <= 250

rows = list(csv.DictReader(open(sys.argv[1], encoding='utf-8-sig', newline=''), delimiter=';'))
refs = {}
if len(sys.argv) > 2:
    t = open(sys.argv[2], encoding='utf-8').read()
    refs = {p['code']: p['draftNames'] for p in json.loads(t[t.index('{'):t.rindex('}') + 1])['products']}
out = []
for r in rows:
    name = (r['name'] or '').strip()
    if r['IsActive'] != '1' or not ok(name) or DEAD.search(name):
        continue
    alts = []
    for v in [(r.get('NameOld') or '').strip(), (r.get('DESCRIPTION') or '').strip(), *refs.get(r['ID'], [])]:
        if ok(v) and AR.search(v) and v != name and not DEAD.search(v) and v not in alts:
            alts.append(v)
    out.append([r['ID'], name, alts[:5]] if alts else [r['ID'], name])
json.dump(out, sys.stdout, ensure_ascii=False, separators=(',', ':'))
print(f'{len(out)} items, {sum(len(x) > 2 for x in out)} with Arabic names', file=sys.stderr)
