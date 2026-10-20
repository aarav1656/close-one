#!/bin/bash
# Press D-pad keys on the VVD and print the focus events the app logged.
# Needs the app running and developer mode on (`vsm developer-mode` in the VVD shell prints "enable").
source "$HOME/vega/env"
LOG=${1:-/tmp/dpad-log.txt}
(timeout 45 vega device start-log-stream > "$LOG" 2>&1 &)
sleep 4
for k in KEY_RIGHT KEY_RIGHT KEY_LEFT KEY_RIGHT KEY_RIGHT KEY_RIGHT; do
  "$(dirname "$0")/vsh.sh" "inputd-cli button_press $k" | tail -1
  sleep 2
done
sleep 4
grep CLUTCH_FOCUS "$LOG" | sed 's/^.*com.clutch.tv/com.clutch.tv/'
