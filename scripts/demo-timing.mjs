#!/usr/bin/env node
// scripts/demo-timing.mjs <device-log> <status-json-file>
// Prints the send to recv, posted and render timeline of the demo cue as JSON; exit 1 when the render is not proven.
import {readFileSync} from 'node:fs';
import {rendererClaims, timeline} from '../server/lib/demo-timing.mjs';

const [logFile, statusFile] = process.argv.slice(2);
if (!logFile || !statusFile) {
  console.error('usage: demo-timing.mjs <device-log> <status-json-file>');
  process.exit(2);
}
const status = JSON.parse(readFileSync(statusFile, 'utf8'));
const row = status.timings.at(-1);
if (!row) {
  console.log(JSON.stringify({ok: false, why: 'no cue in the status'}));
  process.exit(1);
}
const claims = rendererClaims(readFileSync(logFile, 'utf8'), new Date().getUTCFullYear());
const t = timeline({...row, clockOffsetMs: status.clockOffsetMs}, claims);
console.log(JSON.stringify({...t, cueId: row.cueId, clockOffsetMs: status.clockOffsetMs, pingRoundTripMs: status.pingRoundTripMs}));
process.exit(t.ok ? 0 : 1);
