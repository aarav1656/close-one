import {test} from 'node:test';
import assert from 'node:assert/strict';
import {syslogEpochMs, rendererClaims, timeline, RENDER_WINDOW_MS} from '../lib/demo-timing.mjs';

const LOG = [
  'Oct 21 06:46:10.100000 daemon.info com.amazon.notification.renderer[9751]: 2 I Inputd-client:requestPriority:431: Client Requesting Priority 224: SYSTEMUI_PRIORITY',
  'Oct 21 06:46:11.000000 daemon.info splashservice[2134]: something unrelated',
  'Oct 21 06:46:17.250000 daemon.info com.amazon.notification.renderer[9751]: 2 I Inputd-client:requestPriority:431: Client Requesting Priority 224: SYSTEMUI_PRIORITY',
  'Oct 21 06:46:17.300000 daemon.info com.clutch.tv[1]: 2 I Inputd-client:requestPriority:431: Client Requesting Priority 224: SYSTEMUI_PRIORITY',
].join('\n');

test('syslog timestamps are read as UTC milliseconds', () => {
  assert.equal(syslogEpochMs('Oct 21 06:46:17.250000', 2026), Date.UTC(2026, 9, 21, 6, 46, 17, 250));
  assert.equal(syslogEpochMs('Jan  3 00:00:01', 2026), Date.UTC(2026, 0, 3, 0, 0, 1, 0));
  assert.throws(() => syslogEpochMs('21 Oct 06:46', 2026));
});

test('only the notification renderer counts as drawing: other clients asking for the same priority do not', () => {
  assert.deepEqual(rendererClaims(LOG, 2026), [Date.UTC(2026, 9, 21, 6, 46, 10, 100), Date.UTC(2026, 9, 21, 6, 46, 17, 250)]);
});

const offset = 3_600_000; // the TV clock is an hour ahead
const at = (server, extra = 0) => server + offset + extra;

test('send to recv, posted and render, on the server clock, using the first claim after the post', () => {
  const claims = rendererClaims(LOG, 2026); // TV clock
  const sendMs = claims[1] - offset - 250; // server clock: the cue went out 250 ms before the second claim
  const row = {sendMs, recvDeviceMs: sendMs + offset + 30, postedDeviceMs: sendMs + offset + 55, clockOffsetMs: offset};
  const t = timeline(row, claims);
  assert.equal(t.ok, true);
  assert.equal(t.sendToRecvMs, 30);
  assert.equal(t.sendToPostedMs, 55);
  assert.equal(t.sendToRenderMs, 250, 'the 06:46:17.250 claim, not the earlier 06:46:10 one');
});

test('a claim from before the post is not this cue\'s render, and a late one fails the window', () => {
  const sendMs = 10_000_000;
  const base = {sendMs, recvDeviceMs: at(sendMs, 10), postedDeviceMs: at(sendMs, 20), clockOffsetMs: offset};
  assert.equal(timeline(base, [at(sendMs, -5000)]).ok, false, 'only an earlier claim');
  assert.match(timeline(base, [at(sendMs, -5000)]).why, /never claimed/);
  const late = timeline(base, [at(sendMs, RENDER_WINDOW_MS + 1)]);
  assert.equal(late.ok, false);
  assert.match(late.why, /outside 0 to 3000/);
  assert.equal(timeline(base, [at(sendMs, RENDER_WINDOW_MS)]).ok, true, 'the window includes its end');
});

test('missing acks or a missing clock offset fail with the reason', () => {
  const ok = {sendMs: 1, recvDeviceMs: 5, postedDeviceMs: 9, clockOffsetMs: 0};
  assert.match(timeline({...ok, postedDeviceMs: null}, [10]).why, /never acked/);
  assert.match(timeline({...ok, clockOffsetMs: null}, [10]).why, /never answered the ping/);
  assert.equal(timeline(ok, [10]).ok, true);
});
