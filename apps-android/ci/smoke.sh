#!/usr/bin/env bash
# CI only: a real Android (the emulator). Install the debug APK and play what the owner does:
#  1) a system button for an app with no choice yet and no certain package opens the LIST of the apps on the phone («اختار تطبيق …»), not a store page;
#  2) he picks an app in the list (typed «Settings», tapped): that app opens and the choice is kept; the next tap opens it at once, the list does not show;
#  3) a removed choice asks again; WhatsApp Business (not on the emulator) asks too, never a wrong app;
#  4) the old askerapps://open?pkg= link still opens that package; a missing package and a broken link are quiet;
#  5) the app's own screen shows what he chose.
set -uo pipefail
APK="$1"
PKG=com.askerpharmacy.apps
fail() {
  echo "SMOKE FAILED: $1"
  adb logcat -d -t 400 | grep -iE "askerpharmacy|AndroidRuntime|FATAL" | tail -40
  adb shell uiautomator dump /sdcard/u.xml >/dev/null 2>&1; adb shell cat /sdcard/u.xml 2>/dev/null | head -c 2500
  exit 1
}
top() { adb shell dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | head -2 | tr -d '\r'; }
wait_top() { for i in $(seq 1 20); do if top | grep -q "$1"; then return 0; fi; sleep 1; done; return 1; }
dump() { adb shell uiautomator dump /sdcard/u.xml >/dev/null 2>&1; adb shell cat /sdcard/u.xml | tr -d '\r'; }
link() { adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "$1" >/dev/null; }
tap_text() {
  local b
  b=$(dump | tr '>' '\n' | grep "text=\"$1\"" | head -1 | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | grep -o '[0-9]*' | tr '\n' ' ')
  [ -n "$b" ] || return 1
  set -- $b
  adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
}

adb install -r "$APK" || fail "install"
adb shell input keyevent KEYCODE_HOME
sleep 2

# 1) no choice yet: the list opens
link "askerapps://open?app=drugeye&name=DrugEye"
wait_top "$PKG/.PickActivity" || fail "the list of apps did not open for an app with no choice yet"
dump | grep -q "DrugEye" || fail "the list does not say which app it asks for"
dump | grep -q 'text="Settings"' || fail "the list does not show the apps on the phone (no Settings in it)"
echo "OK 1: the list opened and shows the phone's apps"

# 2) he picks Settings (search, then tap the row): Settings opens and the choice is kept
adb shell input text "Settings"
sleep 2
tap_text "Settings" || fail "no Settings row to tap"
wait_top "com.android.settings" || fail "Settings did not open after the choice"
adb shell run-as "$PKG" cat shared_prefs/apps.xml | tr -d '\r' | grep -q 'pkg:drugeye">com.android.settings' || fail "the choice was not kept"
echo "OK 2: the choice was kept and the app opened"
adb shell am force-stop com.android.settings
adb shell input keyevent KEYCODE_HOME
sleep 1
# the next tap opens it at once, with no list
link "askerapps://open?app=drugeye&name=DrugEye"
wait_top "com.android.settings" || fail "the second tap did not open the chosen app"
top | grep -q "PickActivity" && fail "the list showed again after a choice"
echo "OK 2b: the next tap opens it at once"
adb shell am force-stop com.android.settings
adb shell input keyevent KEYCODE_HOME
sleep 1

# 3) a choice that is not on the phone any more: ask again (the debug door sets it, as the list would)
adb shell am broadcast -n "$PKG/.DebugReceiver" --es app ibnsina --es pkg com.removed.app --es name IbnSina >/dev/null
link "askerapps://open?app=ibnsina&name=IbnSina"
wait_top "$PKG/.PickActivity" || fail "a removed choice did not ask again"
adb shell input keyevent KEYCODE_BACK
sleep 1
adb shell input keyevent KEYCODE_HOME
# WhatsApp Business is not on this emulator: it asks, it never opens a wrong app
link "askerapps://open?app=wab&name=WhatsAppBusiness&pkg=com.whatsapp.w4b"
wait_top "$PKG/.PickActivity" || fail "WhatsApp Business missing should ask, not open something else"
adb shell input keyevent KEYCODE_BACK
sleep 1
adb shell input keyevent KEYCODE_HOME
echo "OK 3: removed choices and a missing WhatsApp Business ask"

# 4) the old package link, a missing package and a broken link
link "askerapps://open?pkg=com.android.settings"
wait_top "com.android.settings" || fail "the old pkg= link did not open Settings"
adb shell am force-stop com.android.settings
adb shell input keyevent KEYCODE_HOME
sleep 1
adb logcat -c
link "askerapps://open?pkg=com.not.on.this.phone"
sleep 3
adb logcat -d | grep -E "FATAL EXCEPTION" && fail "the app crashed on a missing package"
link "askerapps://open?app=Bad-Id"
sleep 2
adb logcat -d | grep -E "FATAL EXCEPTION" && fail "the app crashed on a broken link"
top | grep -q "com.android.settings" && fail "a broken link opened an app"
echo "OK 4: old link, missing package, broken link"

# 5) the app's own screen shows what he chose
adb shell am start -W -n "$PKG/.MainActivity" >/dev/null
sleep 2
dump | grep -q "DrugEye" || fail "the app's own screen does not list his choice"
dump | grep -q 'text="غيّر"' || fail "no «غيّر» button on the app's own screen"
dump | grep -q 'content-desc="apps-version"' || fail "no version line"
echo "SMOKE OK: asked once, kept, opened at once; removed and missing apps ask; old and broken links are quiet; the app's screen lists the choice"
