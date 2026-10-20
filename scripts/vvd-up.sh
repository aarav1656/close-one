#!/bin/bash
# Boot the Vega Virtual Device detached from this shell (a plain `&` child dies when
# the shell exits) and wait until `vega device list` sees it.
source "$HOME/vega/env"
nohup vega virtual-device start > /tmp/vvd-start.log 2>&1 < /dev/null &
disown
for i in $(seq 1 40); do
  vega device list 2>&1 | grep -q VirtualDevice && { vega device list | tail -1; vega virtual-device status | tail -1; exit 0; }
  sleep 3
done
echo "VVD did not come up, see /tmp/vvd-start.log"; exit 1
