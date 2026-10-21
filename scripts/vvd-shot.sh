#!/bin/bash
# Save a screenshot of the Vega Virtual Device window: scripts/vvd-shot.sh out.png
# The display may have gone to sleep, so wake it and retry a few times.
OUT=${1:-/tmp/vvd.png}
for i in 1 2 3 4 5 6; do
  caffeinate -u -t 2 &
  sleep 1
  WID=$(swift - <<'SW' 2>/dev/null
import CoreGraphics
for w in CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String:Any]] {
  if (w["kCGWindowName"] as? String) == "Vega Virtual Device" { print(w["kCGWindowNumber"]!) }
}
SW
)
  [ -n "$WID" ] && screencapture -x -l "$WID" "$OUT" 2>/dev/null && [ -s "$OUT" ] && exit 0
  sleep 2
done
echo "could not capture the Vega Virtual Device window" >&2
exit 1
