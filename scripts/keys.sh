#!/bin/bash
# Press keys on the VVD without logging: scripts/keys.sh KEY_RIGHT KEY_ENTER
for k in "$@"; do
  "$(dirname "$0")/vsh.sh" "inputd-cli button_press $k" >/dev/null
  sleep 1.2
done
