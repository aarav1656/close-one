// Live cue server. Polls ESPN for in-progress NBA games, runs every new game state through each paired
// household's cue decision, pushes cues over a WebSocket to that household's Vega service and serves its
// game card to the app. Every household follows only the teams its TV picked.
//
//   node live.mjs [--port 38787] [--data ./data] [--scores] [--replay <cached game id> --speed 30] [--demo]
import http from 'node:http';
import {readFileSync, appendFileSync, mkdirSync, existsSync, writeFileSync, renameSync} from 'node:fs';
import {scoreboard, summary, timeline, teams} from './lib/espn.mjs';
import {nightOf} from './lib/household.mjs';
import {Hub} from './lib/hub.mjs';
import {createApi, attachWs} from './lib/api.mjs';
import {createDemo} from './lib/demo.mjs';
import {loadShowcase} from './lib/showcase.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const flag = k => process.argv.includes(`--${k}`);
const PORT = Number(arg('port', 38787));
const REPLAY = arg('replay');
const SPEED = Number(arg('speed', 30));
const SKIP = Number(arg('skip', 0)); // replay from this fraction of the game
const POLL_MS = Number(arg('poll', 10000));
const dataDir = arg('data', new URL('./data/', import.meta.url).pathname);
const logs = arg('logs', new URL('./logs/', import.meta.url).pathname);
mkdirSync(logs, {recursive: true});

const csvLine = a => a.map(v => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)).join(',') + '\n';
// A log file whose header no longer matches the columns written now is set aside, never appended to misaligned.
const logTo = (name, header, row) => {
  const f = `${logs}${name}-${nightOf(Date.now())}.csv`;
  if (existsSync(f) && readFileSync(f, 'utf8').split('\n')[0] !== header) renameSync(f, f.replace(/\.csv$/, `.${Date.now()}.csv`));
  if (!existsSync(f)) writeFileSync(f, header + '\n');
  appendFileSync(f, csvLine(row));
};

const hub = new Hub({
  dir: dataDir,
  cap: Number(arg('cap', 2)),
  base: Number(arg('base', 0.3)),
  scores: flag('scores'),
  onCue: (rec, cue) => {
    for (const ws of rec.devices) ws.send(JSON.stringify({type: 'cue', id: cue.id, title: cue.title, body: cue.body}));
    logTo('cues', 'iso,cue_id,game,team,period,clock,leverage,threshold,devices,last_play_wallclock,wall_minus_play_s,household', [
      new Date(cue.ms).toISOString(), cue.id, cue.gameId, cue.team, cue.period, cue.clock, cue.lev.toFixed(3), cue.threshold.toFixed(3), rec.devices.size,
      cue.lastPlayTs ? new Date(cue.lastPlayTs).toISOString() : '', cue.lastPlayTs ? ((cue.ms - cue.lastPlayTs) / 1000).toFixed(1) : '', rec.id,
    ]);
    console.log(`CUE ${cue.id} ${rec.id} ${cue.title} | ${cue.body} (lev ${cue.lev.toFixed(2)} >= ${cue.threshold.toFixed(2)}, devices ${rec.devices.size})`);
  },
  onDecision: (rec, d) =>
    logTo('decisions', 'iso,game,period,clock,secs_left,leverage,threshold,espn_home_wp,decision,cue_id,household', [
      new Date(d.ms).toISOString(), d.gameId, d.period, d.clock, d.secs, d.lev.toFixed(3), d.threshold.toFixed(3), d.espnWp ?? '', d.reason, d.cueId, rec.id,
    ]),
  onAnswer: (rec, c, action, source) => {
    const th = rec.household.threshold(c.team, c.ms);
    logTo('feedback', 'iso,cue_id,action,source,latency_s,new_threshold,household', [new Date().toISOString(), c.id, action, source, ((Date.now() - c.ms) / 1000).toFixed(1), th.toFixed(3), rec.id]);
    console.log(`FEEDBACK cue ${c.id} ${rec.id} ${action} (${source}) threshold now ${th.toFixed(3)}`);
  },
});

const api = createApi(hub);
const demo = flag('demo') ? createDemo(hub, loadShowcase(new URL('./showcase/401809247.json', import.meta.url))) : () => false;
const server = http.createServer((req, res) => (demo(req, res) ? undefined : api(req, res)));
attachWs(server, hub, {
  onMessage: (rec, m, ws) => {
    if (m.type === 'hello') console.log(`device connected to ${rec.id} (${rec.devices.size})`);
    if (m.type === 'ping') ws.send(JSON.stringify({type: 'pong', id: m.id, deviceMs: Date.now()}));
    if (m.type === 'posted') logTo('toasts', 'iso,cue_id,send_to_posted_ms,household', [new Date().toISOString(), m.id, Date.now() - (rec.cues.get(m.id)?.ms ?? Date.now()), rec.id]);
  },
});
server.listen(PORT, '0.0.0.0', () => console.log(`clutch server :${PORT} data=${dataDir} households=${hub.households.size} cap=${hub.cap} base=${hub.base}${REPLAY ? ` replay=${REPLAY}x${SPEED}` : ''}`));

// One row per finished game: how it ended and when its last lead change happened, to set against the cue wallclock.
async function finalRow(id) {
  const s = await summary(id);
  const t = timeline(s);
  const last = t[t.length - 1];
  let lastChange = null;
  let prev = 0;
  for (const r of t) {
    const sg = Math.sign(r.h - r.a);
    if (sg !== 0 && prev !== 0 && sg !== prev) lastChange = r.ts;
    if (sg !== 0) prev = sg;
  }
  const sent = [...hub.households.values()].reduce((n, rec) => n + [...rec.cues.values()].filter(c => c.gameId === id).length, 0);
  logTo('finals', 'iso,game,final_margin,final_period,last_lead_change_wallclock,last_play_wallclock,cues_sent', [
    new Date().toISOString(), id, Math.abs(last.h - last.a), last.p, lastChange ? new Date(lastChange).toISOString() : '', last.ts ? new Date(last.ts).toISOString() : '', sent,
  ]);
}

const upcomingOf = sb =>
  sb.events
    .filter(e => e.status.type.state === 'pre')
    .map(e => {
      const side = k => e.competitions?.[0]?.competitors?.find(c => c.homeAway === k)?.team?.name;
      return {label: `${side('away')} at ${side('home')}`, startsAt: e.date};
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 3);

if (REPLAY) {
  const g = JSON.parse(readFileSync(new URL(`./data/games/${REPLAY}.json`, import.meta.url), 'utf8'));
  const t0 = Date.now();
  let i = Math.floor(g.plays.length * SKIP);
  const gameStart = g.plays[i].ts ?? 0;
  let seen = -1;
  const tick = () => {
    const wallSoFar = (Date.now() - t0) * SPEED;
    while (i < g.plays.length - 1 && (g.plays[i + 1].ts ?? 0) - gameStart <= wallSoFar) i++;
    const row = g.plays[i];
    hub.show(g.id, g, row, i >= g.plays.length - 1 ? 'final' : 'live');
    hub.feedOk();
    if (i !== seen) hub.ingest(g.id, g, row, Date.now());
    seen = i;
    if (i < g.plays.length - 1) setTimeout(tick, 1000);
  };
  tick();
} else {
  const lastTs = new Map();
  const wasLive = new Set();
  const poll = async () => {
    try {
      const sb = await scoreboard();
      for (const e of sb.events) {
        if (e.status.type.state === 'post') {
          hub.markFinal(e.id);
          if (wasLive.delete(e.id)) await finalRow(e.id);
        }
        if (e.status.type.state !== 'in') continue;
        wasLive.add(e.id);
        const s = await summary(e.id);
        const t = timeline(s);
        if (!t.length) continue;
        const row = t[t.length - 1];
        const meta = teams(s);
        hub.show(e.id, meta, row, 'live');
        const key = `${row.ts}|${row.p}|${row.c}|${row.h}|${row.a}`;
        if (lastTs.get(e.id) === key) continue; // nothing new since the last poll
        lastTs.set(e.id, key);
        hub.ingest(e.id, meta, row, Date.now());
      }
      hub.feedOk(Date.now(), upcomingOf(sb));
    } catch (err) {
      hub.feedFailed(err.message);
      console.error('poll failed', err.message);
    }
  };
  await poll();
  setInterval(poll, POLL_MS);
}
