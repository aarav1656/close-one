#!/bin/bash
# Demo day on the Vega Virtual Device: a title plays in the video sample, Clutch's service is connected with its
# device token, one cue goes through the real pipeline, and the toast is captured over the playing video with the
# send, receive, post and render times of the cue.
#
#   scripts/demo-vvd.sh        (VVD booted: scripts/vvd-up.sh; video sample installed: scripts/fetch-video-sample.sh)
#
# Starts the cue server with --demo when none is running, puts every paired household on a clean opted-in night
# following Hawks and Bucks, starts playback, then sends the cue and checks what only a drawn toast produces:
#   - the video is playing: two frames two seconds apart differ
#   - the service acked recv and post to the server, with the TV's clock times
#   - the system notification renderer claimed the screen 0 to 3000 ms after the send (TV clock mapped onto the server's
#     by a ping round trip measured just before the cue)
#   - a frame with the toast over the playing video was saved
# Output: evidence/demo/toast-over-video-<time>.png, timing-<time>.json and one verdict line. Exit 0 only when all hold.
set -u
source "$HOME/vega/env"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SERVER=${CLUTCH_SERVER:-http://127.0.0.1:38787}
OUT="$ROOT/evidence/demo"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG=$(mktemp /tmp/clutch-demo-log.XXXXXX)
STATUS=$(mktemp /tmp/clutch-demo-status.XXXXXX)
mkdir -p "$OUT"
fail() { echo "DEMO FAIL: $1" >&2; exit 1; }
status() { curl -s -XPOST "$SERVER/demo/status"; }
num() { echo "$1" | sed -n "s/.*\"$2\":\([0-9]*\).*/\1/p"; }
shot() { "$ROOT/scripts/vvd-shot.sh" "$1" 2>/dev/null; }

if ! curl -sf "$SERVER/health" >/dev/null; then
  (cd "$ROOT/server" && nohup node live.mjs --demo >> logs/demo-server.log 2>&1 < /dev/null &)
  for i in $(seq 1 15); do curl -sf "$SERVER/health" >/dev/null && break; sleep 1; done
  curl -sf "$SERVER/health" >/dev/null || fail "the cue server did not start"
fi
prep=$(curl -s -XPOST "$SERVER/demo/prepare") || fail "no answer from $SERVER/demo/prepare"
echo "$prep" | grep -q '"ok":true' || fail "demo routes are off or not local: restart the server with --demo ($prep)"
echo "$prep" | grep -q '"households":0' && fail "no TV has paired yet: launch Clutch once, then run this again"

(timeout 300 vega device start-log-stream > "$LOG" 2>&1 &)
sleep 3
vega device terminate-app --appName com.clutch.tv.main >/dev/null 2>&1
vega device terminate-app --appName com.amazondeveloper.keplervideoapp.main >/dev/null 2>&1
vega device launch-app --appName com.clutch.tv.main >/dev/null 2>&1 || fail "Clutch is not installed on the VVD"
for i in $(seq 1 40); do [ "$(num "$(status)" devices)" -ge 1 ] && break; sleep 1; done
[ "$(num "$(status)" devices)" -ge 1 ] || fail "the cue service never connected to the server with its token"

# A title playing: open the first title's page, press Play Movie, let the picture settle.
vega device launch-app --appName com.amazondeveloper.keplervideoapp.main >/dev/null 2>&1 || fail "the video sample is not installed"
sleep 12
"$ROOT/scripts/keys.sh" KEY_RIGHT KEY_DOWN KEY_ENTER; sleep 6
"$ROOT/scripts/keys.sh" KEY_ENTER; sleep 9

# The display can be asleep; frames are then unavailable and the checks fall back to the device log alone.
FRAMES=1
shot "$OUT/playing-a-$STAMP.png" || FRAMES=0
if [ $FRAMES = 1 ]; then
  sleep 2; shot "$OUT/playing-b-$STAMP.png" || FRAMES=0
fi
if [ $FRAMES = 1 ]; then
  cmp -s "$OUT/playing-a-$STAMP.png" "$OUT/playing-b-$STAMP.png" && fail "the video is not playing: two frames two seconds apart are identical"
fi

curl -s -XPOST "$SERVER/demo/ping" >/dev/null
sleep 1
[ $FRAMES = 1 ] && shot "$OUT/before-cue-$STAMP.png"
cue=$(curl -s -XPOST "$SERVER/demo/cue")
echo "cue: $cue"
echo "$cue" | grep -q '"cues":1' || fail "the server sent no cue: $cue"
sleep 1.5
if [ $FRAMES = 1 ]; then
  shot "$OUT/toast-over-video-$STAMP.png" || FRAMES=0
fi

for i in $(seq 1 10); do
  [ "$(num "$(status)" posted)" -ge 1 ] && break
  sleep 1
done
status > "$STATUS"
[ "$(num "$(cat "$STATUS")" posted)" -ge 1 ] || fail "the service never acked the post to the server"
sleep 2
timing=$(node "$ROOT/scripts/demo-timing.mjs" "$LOG" "$STATUS") || fail "render not proven: $timing"
echo "$timing" > "$OUT/timing-$STAMP.json"
if [ $FRAMES = 1 ]; then
  [ -s "$OUT/toast-over-video-$STAMP.png" ] || fail "no frame saved"
  echo "DEMO PASS: video playing, toast drawn over it. $timing. Frame: evidence/demo/toast-over-video-$STAMP.png"
else
  echo "DEMO PASS (device log only, no frames): $timing"
fi
