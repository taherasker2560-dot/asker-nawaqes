#!/usr/bin/env bash
# CI only: a real Android (the emulator). Install the debug APK, set ONE alarm two minutes ahead through the debug door, CLOSE the app (home + kill the process,
# not a «force stop»), wait for the minute: the system alarm must start the app again, which starts the ring service and posts the notification.
set -uo pipefail
APK="$1"
PKG=com.askerpharmacy.alarm
fail() { echo "SMOKE FAILED: $1"; adb logcat -d -t 300 | grep -iE "askerpharmacy|AndroidRuntime|FATAL" | tail -60; exit 1; }

adb install -r "$APK" || fail "install"
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS || true
adb shell appops set "$PKG" USE_FULL_SCREEN_INTENT allow || true
adb shell am start -n "$PKG/.MainActivity" >/dev/null
sleep 10

NOW=$(adb shell date +%H:%M | tr -d '\r')
H=${NOW%%:*}
M=${NOW##*:}
TOT=$(( (10#$H * 60 + 10#$M + 2) % 1440 ))
T=$(printf '%02d:%02d' $((TOT / 60)) $((TOT % 60)))
echo "device clock $H:$M, alarm set for $T"
adb shell am broadcast -n "$PKG/.DebugReceiver" --es name Pemojet --es time "$T" | tee /tmp/bc.txt
grep -q "Broadcast completed" /tmp/bc.txt || fail "the debug door did not answer"

# the system must have the alarm clock now
adb shell dumpsys alarm | grep -B2 -A6 "$PKG" | head -40 || true

adb shell input keyevent KEYCODE_HOME
sleep 2
adb shell am kill "$PKG" || true
adb shell pidof "$PKG" || echo "(the app process is gone, as intended)"

FOUND=0
for i in $(seq 1 48); do
  if adb shell dumpsys notification --noredact | grep -q "Pemojet"; then FOUND=1; break; fi
  sleep 5
done
echo "---- the notification"
adb shell dumpsys notification --noredact | grep -B3 -A14 "Pemojet" | head -60
echo "---- the services"
adb shell dumpsys activity services "$PKG" | head -40
[ "$FOUND" = 1 ] || fail "no notification after the alarm minute"
adb shell dumpsys activity services "$PKG" | grep -q "RingService" || fail "the ring service is not running"
echo "SMOKE OK: the alarm fired with the app closed, the ring started"
