#!/usr/bin/env bash
# Emulator test of «دفتر الأرقام» (an Android 14 emulator on the build machine; the debug build; the fake server of fake.cjs):
#  - a contact the phone already has, then both jobs: the number the "system" wants written is written (and told back), and every contact of the phone goes up, in a complete sync;
#  - a second run writes nothing twice; the system's link (askercontacts://link) opens the app's own LinkActivity.
set -euo pipefail
APK="$(realpath "$1")"; PKG=com.askerpharmacy.contacts; KEY=$(printf 'ab%.0s' $(seq 1 32))
cd "$(dirname "$0")"
node fake.cjs & FAKE=$!
trap 'kill $FAKE 2>/dev/null || true' EXIT
sleep 1
adb install -r -g "$APK"
OUT=$(adb shell am broadcast -n "$PKG/.DebugReceiver" --es url http://10.0.2.2:8787 --es key "$KEY" --es add "Existing Person|01111111111")
echo "$OUT"; echo "$OUT" | grep -q 'data="add=true"'
OUT=$(adb shell am broadcast -n "$PKG/.DebugReceiver" --es sync 1)
echo "$OUT"
STATE=$(curl -s localhost:8787/__state); echo "$STATE"
node -e '
const assert = require("node:assert/strict"), s = JSON.parse(process.argv[1]);
assert.deepEqual(s.acked, ["01000000001"], "the number the system wanted written was written and told back");
assert.equal(s.badKey, 0); assert.equal(s.badApi, 0);
const rows = Object.values(s.rows), digits = (r) => r.phones.map((p) => p.replace(/\D/g, ""));
assert.deepEqual(rows.map((r) => r.name).sort(), ["Existing Person", "Pending Person"], "every contact of the phone went up, the one just written too");
assert.ok(digits(rows.find((r) => r.name === "Existing Person")).includes("01111111111"));
assert.ok(digits(rows.find((r) => r.name === "Pending Person")).includes("01000000001"));
assert.equal(s.finished.n, 2); assert.equal(s.finished.got, 2, "a complete sync");
console.log("state ok");
' "$STATE"
adb shell content query --uri content://com.android.contacts/data/phones --projection display_name:data1 | tee /tmp/phones.txt
grep -q 'Pending Person' /tmp/phones.txt
# the second run: nothing is written twice
adb shell am broadcast -n "$PKG/.DebugReceiver" --es sync 1 >/dev/null
adb shell content query --uri content://com.android.contacts/data/phones --projection display_name:data1 > /tmp/phones2.txt
test "$(grep -c 'Pending Person' /tmp/phones2.txt)" = "1"
# the system's link opens the app's own LinkActivity (asks him before it keeps the key)
adb shell cmd package resolve-activity --brief -a android.intent.action.VIEW -d "askercontacts://link?k=$KEY" "$PKG" | tee /tmp/link.txt
grep -q 'LinkActivity' /tmp/link.txt
echo "smoke ok"