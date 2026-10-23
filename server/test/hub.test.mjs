import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocket} from 'ws';
import {Hub, DAY} from '../lib/hub.mjs';
import {Household} from '../lib/household.mjs';
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
  // A paired TV that has also finished onboarding, unless the test is about onboarding itself.
  const pair = async (onboard = true) => {
    const p = (await call('POST', '/api/pair', {body: {name: 'living room'}})).json;
    if (onboard) await call('PUT', '/api/settings', {token: p.token, body: {onboarded: true}});
    return p;
  };
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
  assert.deepEqual(st.followNames, ['Knicks']);
  assert.equal(st.active.id, s.sent[0][1]);
  assert.equal(st.active.when, '4th quarter, 2:00 left');
  assert.equal(st.active.whyData.threshold, 0.3);
  assert.equal(st.active.whyData.cuesLeft, 1);
  assert.equal(st.active.whyData.cap, 2);
  assert.ok(st.active.whyData.lev > st.active.whyData.threshold, 'a cue only goes out over the bar');
  assert.match(st.active.body, /^Coming down to the wire\. 4th quarter, 2:00 left\.$/);
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

test('learning shifts say what the household taught Close One, in its own answers', async () => {
  const s = await boot();
  const {token} = await s.pair();
  await s.call('PUT', '/api/follow', {token, body: {teams: ['NY']}});
  assert.deepEqual((await s.call('GET', '/api/state', {token})).json.learning.shifts, [], 'a fresh household has taught nothing');
  s.hub.ingest('g1', game, tied, s.clock.t);
  s.hub.ingest('g2', {home: NY, away: {abbr: 'BOS', short: 'Celtics'}}, tied, s.clock.t + 1000);
  assert.equal(s.sent.length, 2);
  for (const [, cueId] of s.sent) assert.equal((await s.call('POST', '/api/feedback', {token, body: {cueId, action: 'accept'}})).status, 200);
  const {shifts} = (await s.call('GET', '/api/state', {token})).json.learning;
  assert.deepEqual(shifts, [{team: 'Knicks', bar: 0.24, base: 0.3, watched: 2, notNow: 0}]);
  await s.close();
});

test('learning shifts list the biggest move first and at most two teams', async () => {
  const s = await boot();
  const {token} = await s.pair();
  await s.call('PUT', '/api/follow', {token, body: {teams: ['NY', 'BOS', 'PHI']}});
  const h = [...s.hub.households.values()][0].household;
  h.feedback({cueId: 1, team: 'NY', ms: s.clock.t, action: 'accept'});
  h.feedback({cueId: 2, team: 'BOS', ms: s.clock.t, action: 'dismiss'});
  h.feedback({cueId: 3, team: 'BOS', ms: s.clock.t, action: 'dismiss'});
  h.feedback({cueId: 4, team: 'PHI', ms: s.clock.t, action: 'dismiss'});
  const {shifts} = (await s.call('GET', '/api/state', {token})).json.learning;
  assert.deepEqual(shifts.map(x => [x.team, x.bar, x.notNow]), [['Celtics', 0.4, 2], ['76ers', 0.35, 1]]);
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
  assert.match(s.hub.households.values().next().value.cues.values().next().value.title, /^Cavaliers at Knicks$/);
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

test('nothing is sent before the TV opts in, even for a followed team; opting in turns cues on', async () => {
  const s = await boot();
  const {token} = await s.pair(false);
  await s.call('PUT', '/api/follow', {token, body: {teams: ['NY']}});
  assert.equal((await s.call('GET', '/api/state', {token})).json.settings.onboarded, false);
  s.hub.ingest('g1', game, tied, s.clock.t);
  assert.equal(s.sent.length, 0, 'followed, tight game, not opted in');
  assert.deepEqual((await s.call('PUT', '/api/settings', {token, body: {onboarded: true}})).json.settings, {onboarded: true, enabled: true, quiet: null, paused: false, silence: null});
  s.hub.ingest('g1', game, tied, s.clock.t + 1000);
  assert.equal(s.sent.length, 1);
  await s.close();
});

test('the off switch, one press pause for tonight, and quiet hours each stop cues and each can be undone', async () => {
  const s = await boot();
  const {token} = await s.pair();
  await s.call('PUT', '/api/follow', {token, body: {teams: ['NY']}});
  const st = async () => (await s.call('GET', '/api/state', {token})).json.settings;
  const tryCue = id => {
    const before = s.sent.length;
    s.hub.ingest(id, game, tied, s.clock.t);
    return s.sent.length - before;
  };

  await s.call('PUT', '/api/settings', {token, body: {enabled: false}});
  assert.equal(tryCue('off'), 0, 'switched off');
  assert.equal((await st()).silence, 'off');
  await s.call('PUT', '/api/settings', {token, body: {enabled: true}});

  assert.equal((await s.call('POST', '/api/pause', {token, body: {paused: true}})).json.settings.paused, true);
  assert.equal(tryCue('paused'), 0, 'paused for tonight');
  assert.equal((await st()).paused, true);
  assert.equal((await st()).silence, 'paused');
  s.clock.t += 20 * 3600e3; // the next night
  assert.equal((await st()).paused, false, 'the pause ends with the night');
  assert.equal(tryCue('nextnight'), 1, 'and cues flow again the next night');
  s.clock.t -= 20 * 3600e3;
  await s.call('POST', '/api/pause', {token, body: {paused: false}});

  // 01:00 UTC. A TV at UTC-5 is at 20:00: quiet from 19 to 23 covers it, quiet from 22 to 7 does not.
  await s.call('PUT', '/api/settings', {token, body: {offsetMin: -300, quiet: {from: 19, to: 23}}});
  assert.equal(tryCue('quiet1'), 0, 'inside quiet hours');
  assert.equal((await st()).silence, 'quiet_hours');
  await s.call('PUT', '/api/settings', {token, body: {quiet: {from: 22, to: 7}}});
  assert.equal(tryCue('quiet2'), 1, 'outside quiet hours, the cue goes out');
  assert.deepEqual((await st()).quiet, {from: 22, to: 7});
  await s.close();
});

test('quiet hours that wrap midnight cover both sides of it', () => {
  const h = new Household();
  h.settings = {onboarded: true, enabled: true, quiet: {from: 22, to: 7}, offsetMin: 0, pausedNight: null};
  const at = hour => Date.parse(`2026-10-21T${String(hour).padStart(2, '0')}:30:00Z`);
  const verdicts = [21, 22, 23, 0, 3, 6, 7, 8].map(x => [x, h.gate(at(x))]);
  assert.deepEqual(verdicts, [[21, null], [22, 'quiet_hours'], [23, 'quiet_hours'], [0, 'quiet_hours'], [3, 'quiet_hours'], [6, 'quiet_hours'], [7, null], [8, null]]);
});

test('settings reject anything that is not a switch the household owns', async () => {
  const s = await boot();
  const {token} = await s.pair();
  for (const body of [{enabled: 'yes'}, {onboarded: 1}, {quiet: {from: 25, to: 1}}, {quiet: {from: 1}}, {offsetMin: 9999}, {cap: 50}, {unknown: true}, [1]]) {
    assert.equal((await s.call('PUT', '/api/settings', {token, body})).status, 400, JSON.stringify(body));
  }
  assert.equal((await s.call('POST', '/api/pause', {token, body: {paused: 'tonight'}})).status, 400);
  assert.equal((await s.call('PUT', '/api/settings', {token: 'z'.repeat(43), body: {enabled: false}})).status, 401);
  await s.close();
});

test('after a game ends the household gets a summary: cues sent, how they were answered, where the bar went', async () => {
  const s = await boot();
  const {token} = await s.pair();
  await s.call('PUT', '/api/follow', {token, body: {teams: ['NY']}});
  s.hub.show('g1', game, tied, 'live');
  s.hub.ingest('g1', game, tied, s.clock.t);
  await s.call('POST', '/api/feedback', {token, body: {cueId: s.sent[0][1], action: 'dismiss'}});
  assert.deepEqual((await s.call('GET', '/api/state', {token})).json.summaries, [], 'nothing before the game is over');
  s.hub.markFinal('g1');
  const [sum] = (await s.call('GET', '/api/state', {token})).json.summaries;
  assert.deepEqual({...sum, from: +sum.from.toFixed(2), to: +sum.to.toFixed(2)}, {gameId: 'g1', label: '76ers at Knicks', cues: 1, accepted: 0, dismissed: 1, waiting: 0, from: 0.3, to: 0.35});
  // a followed game that ended without a cue is a summary too: silence is the product working
  s.hub.show('g2', {home: {abbr: 'NY', short: 'Knicks'}, away: {abbr: 'BOS', short: 'Celtics'}}, {p: 4, c: 0, h: 100, a: 80}, 'live');
  s.hub.markFinal('g2');
  const quiet = (await s.call('GET', '/api/state', {token})).json.summaries.find(x => x.gameId === 'g2');
  assert.equal(quiet.cues, 0);
  await s.close();
});
