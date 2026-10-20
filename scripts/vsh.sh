#!/bin/bash
# Run one command in the VVD dev shell. The dev shell service starts on demand and
# the first call after idle often fails with "No running instances of
# com.amazon.dev.shell.service", so retry. Complex quoting: push a script with
# `vega exec vda push` and run `sh /tmp/x.sh` instead.
source "$HOME/vega/env"
for i in 1 2 3 4 5 6; do
  out=$(vega exec vda shell "$@" 2>&1); rc=$?
  if echo "$out" | grep -q "No running instances of com.amazon.dev.shell.service"; then sleep 4; continue; fi
  echo "$out"; exit $rc
done
echo "$out"; exit 1
