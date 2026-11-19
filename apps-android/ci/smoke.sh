#!/usr/bin/env bash
# CI only: a real Android (the emulator). Install the debug APK; the system's link askerapps://open?pkg=<package> must start that package's own screen
# (Settings here: it is on every emulator), a package that is not on the phone must not crash the app, and a broken link opens nothing.
set -uo pipefail
APK="$1"
PKG=com.askerpharmacy.apps
fail() {
  echo "SMOKE FAILED: $1"
  adb logcat -d -t 400 | grep -iE "askerpharmacy|AndroidRuntime|FATAL" | tail -40
  exit 1
}
top() { adb shell dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | head -2 | tr -d '\r'; }

adb install -r "$APK" || fail "install"
adb shell input keyevent KEYCODE_HOME
sleep 2

# 1) the system's link opens the asked app (Settings)
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "askerapps://open?pkg=com.android.settings" | tee /tmp/a1.txt
FOUND=0
for i in $(seq 1 20); do
  if top | grep -q "com.android.settings"; then FOUND=1; break; fi
  sleep 1
done
top
[ "$FOUND" = 1 ] || fail "Settings did not open from askerapps://open?pkg=com.android.settings"
adb shell am force-stop com.android.settings
adb shell input keyevent KEYCODE_HOME
sleep 1

# 2) a package that is not on the phone (no store app on this image either): nothing crashes
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "askerapps://open?pkg=com.not.on.this.phone" >/dev/null
sleep 3
adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime: Process: $PKG" && fail "the app crashed on a missing package"

# 3) a broken link opens nothing and does not crash
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "askerapps://open?pkg=bad" >/dev/null
sleep 2
adb logcat -d | grep -E "FATAL EXCEPTION" && fail "the app crashed on a broken link"
top | grep -q "com.android.settings" && fail "a broken link opened an app"

# 4) its own icon opens its screen
adb shell am start -W -n "$PKG/.MainActivity" >/dev/null
sleep 2
top | grep -q "$PKG/.MainActivity" || fail "the app's own screen did not open"
echo "SMOKE OK: the system's link opens the asked app; missing and broken links are quiet"
