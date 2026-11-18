#!/usr/bin/env bash
# CI only (the emulator, the debug APK): the «لازم تحدّث» screen. A debug build reads no network, so `--ei fake_latest N` says «the newest published version is N».
#   999 (newer than this app)  -> a screen with the marker «update-gate» is over the page;  0 (nothing newer) -> no such screen.
# It ends with 0, so the next CI steps (the page tests) never see the gate.
set -uo pipefail
PKG=com.askerpharmacy.alarm
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb shell cat /sdcard/ui.xml 2>/dev/null; }
fail() {
  echo "GATE FAILED: $1"
  echo "---- what the screen says (packages / texts / descriptions)"
  dump | grep -oE '(package|text|content-desc)="[^"]+"' | sort -u | head -40
  echo "---- the app's window"
  adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp" | head -4
  adb logcat -d -t 300 | grep -iE "askerpharmacy|AndroidRuntime|FATAL" | tail -30
  exit 1
}

# the earlier tests cleared the app's data (its notification permission with it): a permission dialog would hide the screen from the dump
adb shell am force-stop "$PKG" || true
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS || true
adb shell input keyevent KEYCODE_HOME || true
adb shell input keyevent KEYCODE_WAKEUP || true
sleep 2

adb shell am start -n "$PKG/.MainActivity" --ei fake_latest 999 >/dev/null
SAW=0
for i in $(seq 1 12); do
  sleep 3
  if dump | grep -q 'update-gate-button'; then SAW=1; break; fi
done
[ "$SAW" = 1 ] || fail "no update screen with a newer version published"
echo "the update screen is over the app"

adb shell am start -n "$PKG/.MainActivity" --ei fake_latest 0 >/dev/null
GONE=0
for i in $(seq 1 12); do
  sleep 3
  D=$(dump)   # the app must really be on screen (a failed dump is empty, which must not count as «gone»)
  if echo "$D" | grep -q "package=\"$PKG\"" && ! echo "$D" | grep -q 'update-gate'; then GONE=1; break; fi
done
[ "$GONE" = 1 ] || fail "the update screen stayed with nothing newer"
echo "GATE OK: shown for a newer version, gone when nothing is newer"
