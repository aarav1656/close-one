#!/bin/bash
# Point the app build at a Close One server: scripts/set-server.sh https://clutch.example.com
# Rewrites app/clutch.config.json (the address the app uses until a household changes it in Settings).
set -eu
URL=${1:-}
if ! [[ "$URL" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]]; then
  echo "usage: $0 http(s)://host[:port]" >&2
  exit 2
fi
URL=${URL%/}
printf '{\n  "serverUrl": "%s"\n}\n' "$URL" > "$(dirname "$0")/../app/clutch.config.json"
echo "app/clutch.config.json: $URL"
