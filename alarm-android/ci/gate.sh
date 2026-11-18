#!/usr/bin/env bash
# CI only (the emulator, the debug APK): the «لازم تحدّث» screen. A debug build reads no network, so `--ei fake_latest N` says «the newest published version is N».
#   999 (newer than this app)  -> a screen with the marker «update-gate» is over the page;  0 (nothing newer) -> no such screen.
# It ends with 0, so the next CI steps (the page tests) never see the gate.
set -uo pipefail
PKG=com.askerpharmacy.alarm
fail() { echo "GATE FAILED: $1"; adb shell cat /sdcard/ui.xml | head -c 1500; exit 1; }
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb shell cat /sdcard/ui.xml 2>/dev/null; }

adb shell input keyevent KEYCODE_WAKEUP || true
adb shell am start -n "$PKG/.MainActivity" --ei fake_latest 999 >/dev/null
SAW=0
for i in $(seq 1 12); do
  sleep 3
  if dump | grep -q 'update-gate-button'; then SAW=1; break; fi
done
[ "$SAW" = 1 ] || fail "no update screen with a newer version published"
echo "the update screen is over the app"

# the button is there and the title says what to do
dump | grep -q 'update-gate' || fail "no update-gate marker"

adb shell am start -n "$PKG/.MainActivity" --ei fake_latest 0 >/dev/null
GONE=0
for i in $(seq 1 12); do
  sleep 3
  if ! dump | grep -q 'update-gate'; then GONE=1; break; fi
done
[ "$GONE" = 1 ] || fail "the update screen stayed with nothing newer"
echo "GATE OK: shown for a newer version, gone when nothing is newer"
