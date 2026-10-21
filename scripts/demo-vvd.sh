#!/bin/bash
# Demo day on the Vega Virtual Device: the video sample plays in front, Clutch's service is connected with its
# device token, one cue goes through the real pipeline, and the toast is captured over the video.
#
#   scripts/demo-vvd.sh        (VVD booted: scripts/vvd-up.sh; video sample installed: scripts/fetch-video-sample.sh)
#
# Starts the cue server with --demo when none is running, puts every paired household on a clean opted-in night
# following Hawks and Bucks, sends the cue, then checks three things that only a drawn toast produces: the service
# acked the post to the server, the system notification renderer claimed the screen after the cue, and a frame was captured.
# Output: evidence/demo/toast-over-video-<time>.png and a one-line verdict. Exit 0 only when all three hold.
set -u
source "$HOME/vega/env"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SERVER=${CLUTCH_SERVER:-http://127.0.0.1:38787}
OUT="$ROOT/evidence/demo"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG=$(mktemp /tmp/clutch-demo-log.XXXXXX)
mkdir -p "$OUT"
fail() { echo "DEMO FAIL: $1" >&2; exit 1; }
renderer_claims() { grep -a "Client Requesting Priority 224: SYSTEMUI_PRIORITY" "$LOG" | grep -a -c notification; }

if ! curl -sf "$SERVER/health" >/dev/null; then
  (cd "$ROOT/server" && nohup node live.mjs --demo >> logs/demo-server.log 2>&1 < /dev/null &)
  for i in $(seq 1 15); do curl -sf "$SERVER/health" >/dev/null && break; sleep 1; done
  curl -sf "$SERVER/health" >/dev/null || fail "the cue server did not start"
fi
prep=$(curl -s -XPOST "$SERVER/demo/prepare") || fail "no answer from $SERVER/demo/prepare"
echo "$prep" | grep -q '"ok":true' || fail "demo routes are off or not local: restart the server with --demo ($prep)"
echo "$prep" | grep -q '"households":0' && fail "no TV has paired yet: launch Clutch once, then run this again"

(timeout 240 vega device start-log-stream > "$LOG" 2>&1 &)
sleep 3
vega device terminate-app --appName com.clutch.tv.main >/dev/null 2>&1
vega device terminate-app --appName com.amazondeveloper.keplervideoapp.main >/dev/null 2>&1
vega device launch-app --appName com.clutch.tv.main >/dev/null 2>&1 || fail "Clutch is not installed on the VVD"
status() { curl -s -XPOST "$SERVER/demo/status"; }
num() { echo "$1" | sed -n "s/.*\"$2\":\([0-9]*\).*/\1/p"; }
for i in $(seq 1 40); do [ "$(num "$(status)" devices)" -ge 1 ] && break; sleep 1; done
[ "$(num "$(status)" devices)" -ge 1 ] || fail "the cue service never connected to the server with its token"

vega device launch-app --appName com.amazondeveloper.keplervideoapp.main >/dev/null 2>&1 || fail "the video sample is not installed"
sleep 10
"$ROOT/scripts/keys.sh" KEY_ENTER; sleep 4; "$ROOT/scripts/keys.sh" KEY_ENTER   # open a title, press play
sleep 6
claims_before=$(renderer_claims)
"$ROOT/scripts/vvd-shot.sh" "$OUT/before-cue-$STAMP.png" || fail "could not capture the VVD window"

cue=$(curl -s -XPOST "$SERVER/demo/cue")
echo "cue: $cue"
echo "$cue" | grep -q '"cues":1' || fail "the server sent no cue: $cue"
sleep 2
"$ROOT/scripts/vvd-shot.sh" "$OUT/toast-over-video-$STAMP.png" || fail "could not capture the toast frame"

posted=0; drawn=0
for i in $(seq 1 10); do
  [ "$(num "$(status)" posted)" -ge 1 ] && posted=1
  [ "$(renderer_claims)" -gt "$claims_before" ] && drawn=1
  [ $posted = 1 ] && [ $drawn = 1 ] && break
  sleep 1
done
[ $posted = 1 ] || fail "the service never acked the post to the server"
[ $drawn = 1 ] || fail "the notification renderer did not claim the screen after the cue"
[ -s "$OUT/toast-over-video-$STAMP.png" ] || fail "no frame saved"
echo "DEMO PASS: the service acked the post, renderer claimed the screen after it, frame at evidence/demo/toast-over-video-$STAMP.png"
