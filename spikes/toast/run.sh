#!/bin/bash
# One spike run: Close One starts its service, the video sample is brought to the front, the server sends N cues.
#   run.sh <template|bad> <n> <interval_ms> <tag>
# Writes latencies-<tag>.csv and devlog-<tag>.txt next to this script.
set -u
source "$HOME/vega/env"
CH=${1:-template}; N=${2:-20}; INT=${3:-12000}; TAG=${4:-$CH}
cd "$(dirname "$0")"
pkill -f "node server.mjs" 2>/dev/null
vega device terminate-app --appName com.clutch.tv.main >/dev/null 2>&1
vega device terminate-app --appName com.amazondeveloper.keplervideoapp.main >/dev/null 2>&1
nohup node server.mjs --n "$N" --interval "$INT" --channel "$CH" --start-delay 26000 --out "latencies-$TAG.csv" > "server-$TAG.log" 2>&1 &
DUR=$(( N * (INT / 1000 + 2) + 90 ))
timeout "$DUR" vega device start-log-stream > "devlog-$TAG.raw" 2>&1 &
sleep 3
vega device launch-app --appName com.clutch.tv.main >/dev/null 2>&1
sleep 12   # service connects and the server begins its cue loop 1.5 s after
vega device launch-app --appName com.amazondeveloper.keplervideoapp.main >/dev/null 2>&1
# start playback in the video sample (select the focused tile, then select again) before cues begin
sleep 10
"$(dirname "$0")/../../scripts/vsh.sh" "inputd-cli button_press KEY_ENTER" >/dev/null
sleep 6
"$(dirname "$0")/../../scripts/vsh.sh" "inputd-cli button_press KEY_ENTER" >/dev/null
echo "run $TAG started: $N cues, channel=$CH, interval=${INT}ms"
wait %1 2>/dev/null
