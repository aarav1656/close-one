#!/bin/bash
# Press the given keys on the VVD (KEY_UP KEY_ENTER ...) and print the focus events the app logged.
#   scripts/dpad.sh KEY_RIGHT KEY_DOWN KEY_ENTER
source "$HOME/vega/env"
LOG=${DPAD_LOG:-/tmp/dpad-log.txt}
(timeout $((8 + 3 * $#)) vega device start-log-stream > "$LOG" 2>&1 &)
sleep 4
for k in "$@"; do
  "$(dirname "$0")/vsh.sh" "inputd-cli button_press $k" >/dev/null
  sleep 2
done
sleep 3
grep -a 'CLUTCH_' "$LOG" | sed 's/^.*JavaScript\] //'
