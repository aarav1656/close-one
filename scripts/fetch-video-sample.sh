#!/bin/bash
# Build Amazon's vega-video-sample (the foreground app for the toast spike) into third_party/.
# ignore-scripts=true in ~/.npmrc blocks its postinstall, so the Shaka build is run explicitly.
set -euo pipefail
source "$HOME/vega/env"
cd "$(dirname "$0")/.."
mkdir -p third_party && cd third_party
[ -d vega-video-sample ] || git clone --depth 1 https://github.com/AmazonAppDev/vega-video-sample
cd vega-video-sample
npm install
npm run postinstall --ignore-scripts=false
npm run build:debug
vega device install-app -b Debug --dir .
