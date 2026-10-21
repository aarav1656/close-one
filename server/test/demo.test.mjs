import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Hub} from '../lib/hub.mjs';
import {createDemo} from '../lib/demo.mjs';
import {loadShowcase} from '../lib/showcase.mjs';

const game = loadShowcase(new URL('../showcase/401809247.json', import.meta.url));
const call = (handler, url, ip = '127.0.0.1', method = 'POST') => {
  const res = {headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); }};
  const handled = handler({url, method, socket: {remoteAddress: ip}}, res);
  return {handled, status: res.statusCode, body: res.body};
};

test('demo prepare puts a paired household on a clean opted-in night, demo cue sends one cue over it', () => {
  const sent = [];
  const hub = new Hub({onCue: (rec, cue) => sent.push([rec.id, cue])});
  const rec = hub.households.get(hub.pair('tv').householdId); // fresh: follows nobody, not opted in
  const demo = createDemo(hub, game);

  assert.equal(call(demo, '/demo/cue').body.cues, 0, 'before prepare nothing is followed, nothing is sent');
  assert.equal(call(demo, '/demo/prepare').body.households, 1);
  assert.deepEqual([...rec.follow].sort(), ['ATL', 'MIL']);
  assert.equal(rec.household.settings.onboarded, true);
  const cue = call(demo, '/demo/cue');
  assert.equal(cue.body.cues, 1);
  assert.equal(cue.body.at, '4th 2:27');
  assert.equal(sent.length, 1);
  assert.match(sent[0][1].title, /^Bucks at Hawks$/);
});

test('a second prepare resets the night so the demo can run again', () => {
  const hub = new Hub({});
  const rec = hub.households.get(hub.pair('tv').householdId);
  const demo = createDemo(hub, game);
  call(demo, '/demo/prepare');
  call(demo, '/demo/cue');
  assert.equal(rec.household.cuesTonight(hub.now()), 1);
  call(demo, '/demo/prepare');
  assert.equal(rec.household.cuesTonight(hub.now()), 0);
  assert.equal(call(demo, '/demo/cue').body.cues, 1);
});

test('demo routes answer only on the loopback address and never touch other paths', () => {
  const hub = new Hub({});
  hub.pair('tv');
  const demo = createDemo(hub, game);
  for (const ip of ['10.0.2.15', '192.168.1.20', '::ffff:10.0.0.1', '']) {
    const r = call(demo, '/demo/prepare', ip);
    assert.equal(r.status, 403, ip);
    assert.equal(r.handled, true);
  }
  assert.equal(call(demo, '/api/state', '10.0.2.15').handled, false, 'the normal API is left alone');
  assert.equal(call(demo, '/demo/prepare', '127.0.0.1', 'GET').status, 405);
});

test('demo final ends the game and the household gets its summary', () => {
  const hub = new Hub({});
  const rec = hub.households.get(hub.pair('tv').householdId);
  const demo = createDemo(hub, game);
  call(demo, '/demo/prepare');
  call(demo, '/demo/cue');
  assert.deepEqual(hub.state(rec).summaries, [], 'nothing while the game is live');
  call(demo, '/demo/final');
  const [sum] = hub.state(rec).summaries;
  assert.equal(sum.label, 'Bucks at Hawks');
  assert.equal(sum.cues, 1);
  assert.equal(sum.waiting, 1);
});

test('demo status counts connected devices and cues the service acked as posted', () => {
  const hub = new Hub({});
  const rec = hub.households.get(hub.pair('tv').householdId);
  const demo = createDemo(hub, game);
  rec.devices.add({send() {}}); // a connected TV
  call(demo, '/demo/prepare');
  const first = call(demo, '/demo/status').body;
  assert.deepEqual([first.households, first.devices, first.cues, first.posted, first.timings], [1, 1, 0, 0, []]);
  call(demo, '/demo/cue');
  assert.equal(call(demo, '/demo/status').body.posted, 0, 'sent but not yet acked');
  hub.markPosted(rec, [...rec.cues.keys()][0], 5000);
  const second = call(demo, '/demo/status').body;
  assert.deepEqual([second.cues, second.posted], [1, 1]);
});

test('the TV clock offset comes from the midpoint of a ping round trip, and each cue keeps the TV time of its recv and posted acks', () => {
  let t = 1_000_000;
  const sent = [];
  const hub = new Hub({now: () => t});
  const rec = hub.households.get(hub.pair('tv').householdId);
  rec.devices.add({send: m => sent.push(JSON.parse(m))});
  const demo = createDemo(hub, game);
  call(demo, '/demo/prepare');

  call(demo, '/demo/ping');
  assert.equal(sent[0].type, 'ping');
  t += 40; // the reply is 40 ms later; the TV read its clock halfway, at server time 1_000_020
  hub.markPong(rec, sent[0].id, 1_000_020 + 3_600_000); // the TV runs an hour ahead
  const st = call(demo, '/demo/status').body;
  assert.equal(st.clockOffsetMs, 3_600_000);
  assert.equal(st.pingRoundTripMs, 40);
  hub.markPong(rec, sent[0].id, 0); // a reply to a ping already answered changes nothing
  assert.equal(call(demo, '/demo/status').body.clockOffsetMs, 3_600_000);

  call(demo, '/demo/cue');
  const id = [...rec.cues.keys()][0];
  t += 30;
  hub.markRecv(rec, id, t + 3_600_000);
  t += 25;
  hub.markPosted(rec, id, t + 3_600_000);
  const [row] = call(demo, '/demo/status').body.timings;
  assert.deepEqual(row, {cueId: id, sendMs: 1_000_040, recvAtMs: 1_000_070, recvDeviceMs: 1_000_070 + 3_600_000, postedAtMs: 1_000_095, postedDeviceMs: 1_000_095 + 3_600_000});
});
