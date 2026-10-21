import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocket} from 'ws';
import {Hub, DAY} from '../lib/hub.mjs';
import {createApi, attachWs} from '../lib/api.mjs';

const NY = {abbr: 'NY', short: 'Knicks'};
const PHI = {abbr: 'PHI', short: '76ers'};
const game = {home: NY, away: PHI};
const tied = {p: 4, c: 120, h: 100, a: 100, w: null, ts: null}; // tied with two minutes left: high leverage

const open = [];
after(() => Promise.all(open.map(s => s.close()))); // a failing test must not leave sockets that keep the process alive

// A hub, an http+ws server around it, and a clock the test can move.
async function boot(opts = {}) {
  const clock = {t: Date.parse('2026-10-21T01:00:00Z')};
  const sent = [];
  const hub = new Hub({now: () => clock.t, autoDismissMs: 3600e3, onCue: (rec, cue) => sent.push([rec.id, cue.id]), ...opts});
  const server = http.createServer(createApi(hub, {pairsPerMinute: opts.pairsPerMinute ?? 20, now: () => clock.t}));
  const wss = attachWs(server, hub, {helloTimeoutMs: 300});
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, {token, body} = {}) => {
    const res = await fetch(base + path, {method, headers: {...(token ? {authorization: `Bearer ${token}`} : {}), 'content-type': 'application/json'}, body: body ? JSON.stringify(body) : undefined});
    return {status: res.status, json: await res.json()};
  };
  const pair = async () => (await call('POST', '/api/pair', {body: {name: 'living room'}})).json;
  const self = {hub, clock, sent, base, call, pair, server, close: () => new Promise(r => { wss.clients.forEach(c => c.terminate()); server.closeAllConnections(); server.close(r); })};
  open.push(self);
  return self;
}

test('every endpoint but pairing and health refuses a missing, garbage or expired token', async () => {
  const s = await boot();
  const {token} = await s.pair();
  assert.equal((await s.call('GET', '/health')).status, 200);
  for (const [m, p] of [['GET', '/api/state'], ['GET', '/api/teams'], ['GET', '/api/showcase'], ['PUT', '/api/follow'], ['POST', '/api/feedback']]) {
    assert.equal((await s.call(m, p)).status, 401, `${m} ${p} without a token`);
    assert.equal((await s.call(m, p, {token: 'x'.repeat(43)})).status, 401, `${m} ${p} with a made up token`);
  }
  assert.equal((await s.call('GET', '/api/state', {token})).status, 200);
  s.clock.t += 181 * DAY;
  assert.equal((await s.call('GET', '/api/state', {token})).status, 401, 'expired token');
  await s.close();
});

test('a token in the second half of its life is renewed by use, so a household in use never expires', async () => {
  const s = await boot();
  const {token} = await s.pair();
  s.clock.t += 100 * DAY;
  assert.equal((await s.call('GET', '/api/state', {token})).status, 200);
  s.clock.t += 100 * DAY; // 200 days after pairing, 100 after the renewal
  assert.equal((await s.call('GET', '/api/state', {token})).status, 200);
  await s.close();
});

test('a new household follows nothing and gets no cue; picking the team turns cues on', async () => {
  const s = await boot();
  const {token} = await s.pair();
  assert.deepEqual((await s.call('GET', '/api/state', {token})).json.follow, []);
  s.hub.ingest('g1', game, tied, s.clock.t);
  assert.equal(s.sent.length, 0, 'nothing followed, nothing sent');
  const bad = await s.call('PUT', '/api/follow', {token, body: {teams: ['NY', 'XXX']}});
  assert.equal(bad.status, 400);
  assert.deepEqual((await s.call('GET', '/api/state', {token})).json.follow, [], 'a rejected pick changes nothing');
  assert.equal((await s.call('PUT', '/api/follow', {token, body: {teams: ['NY']}})).status, 200);
  s.hub.ingest('g1', game, tied, s.clock.t + 1000);
  assert.equal(s.sent.length, 1);
  const st = (await s.call('GET', '/api/state', {token})).json;
  assert.deepEqual(st.follow, ['NY']);
  assert.equal(st.active.id, s.sent[0][1]);
  assert.match(st.active.why, /next possession can move the win chance by \d+ points/);
  assert.doesNotMatch(st.active.why, /\d+-\d+/, 'the reason never carries a score');
  await s.close();
});

test('households are isolated: followed teams, cues, feedback and learning', async () => {
  const s = await boot();
  const a = await s.pair();
  const b = await s.pair();
  await s.call('PUT', '/api/follow', {token: a.token, body: {teams: ['NY']}});
  await s.call('PUT', '/api/follow', {token: b.token, body: {teams: ['BOS']}});
  s.hub.ingest('g1', game, tied, s.clock.t);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0][0], a.householdId, 'only the household that follows New York is cued');
  const cueId = s.sent[0][1];
  const stateB = (await s.call('GET', '/api/state', {token: b.token})).json;
  assert.equal(stateB.active, null);
  assert.equal(stateB.tonight.cues, 0);
  // household B cannot answer household A's cue, and A's learning does not move
  const before = s.hub.households.get(a.householdId).household.threshold('NY', s.clock.t);
  const cross = await s.call('POST', '/api/feedback', {token: b.token, body: {cueId, action: 'dismiss'}});
  assert.equal(cross.status, 404);
  assert.equal(s.hub.households.get(a.householdId).household.threshold('NY', s.clock.t), before);
  const own = await s.call('POST', '/api/feedback', {token: a.token, body: {cueId, action: 'dismiss'}});
  assert.deepEqual(own, {status: 200, json: {ok: true}});
  assert.ok(s.hub.households.get(a.householdId).household.threshold('NY', s.clock.t) > before, 'dismiss raised A bar');
  await s.close();
});

test('feedback rejects unknown, expired, answered and malformed cues', async () => {
  const s = await boot({cueTtlMs: 90e3});
  const {token} = await s.pair();
  await s.call('PUT', '/api/follow', {token, body: {teams: ['NY']}});
  s.hub.ingest('g1', game, tied, s.clock.t);
  const id = s.sent[0][1];
  const fb = body => s.call('POST', '/api/feedback', {token, body});
  assert.equal((await fb({cueId: id + 999, action: 'accept'})).status, 404, 'unknown id');
  assert.equal((await fb({cueId: 'abc', action: 'accept'})).status, 400, 'not a number');
  assert.equal((await fb({cueId: id, action: 'maybe'})).status, 400, 'unknown action');
  s.clock.t += 91e3;
  assert.equal((await fb({cueId: id, action: 'accept'})).status, 410, 'expired');
  assert.equal(s.hub.households.values().next().value.household.events.length, 0, 'an expired answer teaches nothing');
  s.clock.t -= 60e3; // back inside the window
  assert.equal((await fb({cueId: id, action: 'accept'})).status, 200);
  assert.equal((await fb({cueId: id, action: 'accept'})).status, 409, 'second answer');
  await s.close();
});

test('the learning bar state lists tonight cues with how each was answered', async () => {
  const s = await boot();
  const {token} = await s.pair();
  await s.call('PUT', '/api/follow', {token, body: {teams: ['NY']}});
  s.hub.ingest('g1', game, tied, s.clock.t);
  let l = (await s.call('GET', '/api/state', {token})).json.learning;
  assert.equal(l.cues.length, 1);
  assert.equal(l.cues[0].action, null, 'waiting for an answer');
  await s.call('POST', '/api/feedback', {token, body: {cueId: s.sent[0][1], action: 'dismiss'}});
  l = (await s.call('GET', '/api/state', {token})).json.learning;
  assert.equal(l.cues[0].action, 'dismiss');
  assert.ok(l.threshold > l.base, 'the bar moved up after a dismissal');
  assert.equal(l.cues[0].after, l.threshold);
  await s.close();
});

test('households, followed teams and tokens survive a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'clutch-hub-'));
  const s1 = await boot({dir});
  const {token, householdId} = await s1.pair();
  await s1.call('PUT', '/api/follow', {token, body: {teams: ['NY', 'SA']}});
  await s1.close();
  const s2 = await boot({dir});
  const st = await s2.call('GET', '/api/state', {token});
  assert.equal(st.status, 200);
  assert.deepEqual(st.json.follow, ['NY', 'SA']);
  assert.ok(s2.hub.households.has(householdId));
  assert.equal((await s2.call('GET', '/api/state', {token: token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')})).status, 401, 'a one character change is another token');
  await s2.close();
});

test('pairing is rate limited per address', async () => {
  const s = await boot({pairsPerMinute: 3});
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await s.call('POST', '/api/pair', {body: {}})).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  await s.close();
});

const wsClose = ws => new Promise(r => ws.once('close', code => r(code)));
const wsOpen = ws => new Promise(r => ws.once('open', r));

test('the cue socket needs a valid hello token and only carries its own household cues', async () => {
  const s = await boot();
  const a = await s.pair();
  const b = await s.pair();
  await s.call('PUT', '/api/follow', {token: a.token, body: {teams: ['NY']}});
  const url = s.base.replace('http', 'ws');

  const anon = new WebSocket(url);
  await wsOpen(anon);
  assert.equal(await wsClose(anon), 4401, 'no hello at all');

  const forged = new WebSocket(url);
  await wsOpen(forged);
  forged.send(JSON.stringify({type: 'hello', token: 'y'.repeat(43)}));
  assert.equal(await wsClose(forged), 4401, 'hello with a made up token');

  const noToken = new WebSocket(url);
  await wsOpen(noToken);
  noToken.send(JSON.stringify({type: 'hello'}));
  assert.equal(await wsClose(noToken), 4401, 'hello without a token');

  const wa = new WebSocket(url);
  const wb = new WebSocket(url);
  const got = {a: [], b: []};
  wa.on('message', m => got.a.push(JSON.parse(String(m))));
  wb.on('message', m => got.b.push(JSON.parse(String(m))));
  await Promise.all([wsOpen(wa), wsOpen(wb)]);
  wa.send(JSON.stringify({type: 'hello', token: a.token}));
  wb.send(JSON.stringify({type: 'hello', token: b.token}));
  await new Promise(r => setTimeout(r, 100));
  assert.equal(got.a[0].type, 'welcome');
  assert.equal(got.a[0].householdId, a.householdId);
  assert.equal(s.hub.households.get(a.householdId).devices.size, 1);

  // the live glue sends each cue to rec.devices; mirror it here
  const hub2 = s.hub;
  hub2.onCue = (rec, cue) => rec.devices.forEach(ws => ws.send(JSON.stringify({type: 'cue', id: cue.id})));
  hub2.ingest('g1', game, tied, s.clock.t);
  await new Promise(r => setTimeout(r, 100));
  assert.equal(got.a.filter(m => m.type === 'cue').length, 1);
  assert.equal(got.b.filter(m => m.type === 'cue').length, 0, 'household B never sees it');
  wa.close();
  wb.close();
  await s.close();
});

test('on screen names are team nicknames even when the feed sends a full name', async () => {
  const s = await boot();
  const {token} = await s.pair();
  await s.call('PUT', '/api/follow', {token, body: {teams: ['NY']}});
  const full = {home: {abbr: 'NY', short: 'New York Knicks'}, away: {abbr: 'CLE', short: 'Cleveland Cavaliers'}};
  s.hub.show('g9', full, tied, 'live');
  s.hub.ingest('g9', full, tied, s.clock.t);
  const st = (await s.call('GET', '/api/state', {token})).json;
  assert.equal(st.games[0].label, 'Cavaliers at Knicks');
  assert.equal(st.active.home, 'Knicks');
  assert.match(s.hub.households.values().next().value.cues.values().next().value.title, /^Cavaliers at Knicks /);
  await s.close();
});

test('the toast icon is served without a token as a real PNG', async () => {
  const s = await boot();
  const res = await fetch(`${s.base}/assets/clutch-icon.png`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer()).slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal((await fetch(`${s.base}/assets/other.png`)).status, 401, 'nothing else under /assets is public');
  await s.close();
});

test('the showcase replay is served to a paired household', async () => {
  const s = await boot();
  const {token} = await s.pair();
  const res = await s.call('GET', '/api/showcase', {token});
  assert.equal(res.status, 200);
  assert.equal(res.json.label, 'Bucks at Hawks');
  assert.equal(res.json.rule.length, 3);
  assert.equal(res.json.clutch.length, 1);
  await s.close();
});
