// Live cue server. Polls ESPN for in-progress NBA games, runs every new game state through the
// cue decision, pushes cues over a WebSocket to the Vega service and serves the game card to the app.
//
//   node live.mjs [--follow all|NYK,SA] [--port 38787] [--scores] [--replay <cached game id> --speed 30]
import http from 'node:http';
import {readFileSync, appendFileSync, mkdirSync, existsSync, writeFileSync} from 'node:fs';
import {WebSocketServer} from 'ws';
import {scoreboard, summary, timeline, teams} from './lib/espn.mjs';
import {Engine, periodLabel} from './lib/engine.mjs';
import {Household, nightOf} from './lib/household.mjs';
import {secsLeft, leverage} from './lib/model.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const flag = k => process.argv.includes(`--${k}`);
const PORT = Number(arg('port', 38787));
const followArg = arg('follow', 'all');
const follow = followArg === 'all' ? 'all' : new Set(followArg.split(','));
const REPLAY = arg('replay');
const SPEED = Number(arg('speed', 30));
const POLL_MS = Number(arg('poll', 10000));
const logs = new URL('./logs/', import.meta.url).pathname;
mkdirSync(logs, {recursive: true});

const household = new Household({cap: Number(arg('cap', 2)), base: Number(arg('base', 0.3))}, new URL('./data/household.json', import.meta.url).pathname);
const csvLine = a => a.map(v => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)).join(',') + '\n';
const logTo = (name, header, row) => {
  const f = `${logs}${name}-${nightOf(Date.now())}.csv`;
  if (!existsSync(f)) writeFileSync(f, header + '\n');
  appendFileSync(f, csvLine(row));
};

const view = new Map(); // gameId -> display state for the app
const cues = new Map(); // cueId -> cue + feedback state
let active = null;
const devices = new Set();

const engine = new Engine({
  household,
  follow,
  scores: flag('scores'),
  onCue: cue => {
    cues.set(cue.id, {...cue, answered: false, lastPlayTs: cue.lastPlayTs});
    active = cue;
    for (const ws of devices) ws.send(JSON.stringify({type: 'cue', id: cue.id, title: cue.title, body: cue.body}));
    logTo('cues', 'iso,cue_id,game,team,period,clock,leverage,threshold,devices,last_play_wallclock,wall_minus_play_s', [
      new Date(cue.ms).toISOString(), cue.id, cue.gameId, cue.team, cue.period, cue.clock, cue.lev.toFixed(3), cue.threshold.toFixed(3), devices.size,
      cue.lastPlayTs ? new Date(cue.lastPlayTs).toISOString() : '', cue.lastPlayTs ? ((cue.ms - cue.lastPlayTs) / 1000).toFixed(1) : '',
    ]);
    console.log(`CUE ${cue.id} ${cue.title} | ${cue.body} (lev ${cue.lev.toFixed(2)} >= ${cue.threshold.toFixed(2)}, devices ${devices.size})`);
    setTimeout(() => answer(cue.id, 'dismiss', 'timeout'), 30000);
  },
  onDecision: d =>
    logTo('decisions', 'iso,game,period,clock,secs_left,leverage,threshold,espn_home_wp,decision,cue_id', [
      new Date(d.ms).toISOString(), d.gameId, d.period, d.clock, d.secs, d.lev.toFixed(3), d.threshold.toFixed(3), d.espnWp ?? '', d.reason, d.cueId,
    ]),
});

function answer(cueId, action, source = 'app') {
  const c = cues.get(cueId);
  if (!c || c.answered) return false;
  c.answered = true;
  household.feedback({cueId, team: c.team, ms: c.ms, action});
  logTo('feedback', 'iso,cue_id,action,source,latency_s,new_threshold', [new Date().toISOString(), cueId, action, source, ((Date.now() - c.ms) / 1000).toFixed(1), household.threshold(c.team, c.ms).toFixed(3)]);
  console.log(`FEEDBACK cue ${cueId} ${action} (${source}) threshold now ${household.threshold(c.team, c.ms).toFixed(3)}`);
  if (active?.id === cueId) active = null;
  return true;
}

const cardOf = cue => {
  const v = view.get(cue.gameId);
  return {id: cue.id, gameId: cue.gameId, title: cue.title, body: cue.body, home: v?.home, away: v?.away, ...(cue.score ? {score: cue.score} : {})};
};
const state = () => {
  const now = Date.now();
  return {
    active: active && now - active.ms < 90000 ? cardOf(active) : null,
    tonight: {cues: household.cuesTonight(now), cap: household.o.cap, quiet: household.isQuiet(now)},
    games: [...view.values()].map(({id, home, away, label, pressure, status, period, clock}) => ({id, home, away, label, pressure, status, period, clock})),
  };
};

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.method === 'GET' && req.url === '/api/state') return res.end(JSON.stringify(state()));
  if (req.method === 'POST' && req.url === '/api/feedback') {
    let body = '';
    req.on('data', d => (body += d));
    req.on('end', () => {
      try {
        const {cueId, action} = JSON.parse(body);
        if (!['accept', 'dismiss'].includes(action)) throw new Error('action');
        res.end(JSON.stringify({ok: answer(Number(cueId), action)}));
      } catch {
        res.statusCode = 400;
        res.end('{"ok":false}');
      }
    });
    return;
  }
  res.statusCode = 404;
  res.end('{}');
});
const wss = new WebSocketServer({server});
wss.on('connection', ws => {
  devices.add(ws);
  console.log(`device connected (${devices.size})`);
  ws.on('close', () => devices.delete(ws));
  ws.on('message', raw => {
    const m = JSON.parse(String(raw));
    if (m.type === 'ping') ws.send(JSON.stringify({type: 'pong', id: m.id, deviceMs: Date.now()}));
    if (m.type === 'posted') logTo('toasts', 'iso,cue_id,send_to_posted_ms', [new Date().toISOString(), m.id, Date.now() - (cues.get(m.id)?.ms ?? Date.now())]);
  });
});
server.listen(PORT, '0.0.0.0', () => console.log(`clutch server :${PORT} follow=${followArg} cap=${household.o.cap} base=${household.o.base}${REPLAY ? ` replay=${REPLAY}x${SPEED}` : ''}`));

const label = (meta, row) => `${meta.away.short} at ${meta.home.short}`;
function show(id, meta, row, status) {
  const secs = secsLeft(row.p, row.c);
  view.set(id, {id, home: meta.home.short, away: meta.away.short, label: label(meta), status, period: row.p, clock: row.c, pressure: Number(Math.min(1, leverage(row.h - row.a, secs) / 0.6).toFixed(2))});
}

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
  const sent = [...cues.values()].filter(c => c.gameId === id).length;
  logTo('finals', 'iso,game,final_margin,final_period,last_lead_change_wallclock,last_play_wallclock,cues_sent', [
    new Date().toISOString(), id, Math.abs(last.h - last.a), last.p, lastChange ? new Date(lastChange).toISOString() : '', last.ts ? new Date(last.ts).toISOString() : '', sent,
  ]);
}

if (REPLAY) {
  const g = JSON.parse(readFileSync(new URL(`./data/games/${REPLAY}.json`, import.meta.url), 'utf8'));
  const t0 = Date.now();
  const gameStart = g.plays[0].ts ?? 0;
  let i = 0;
  const tick = () => {
    const wallSoFar = (Date.now() - t0) * SPEED;
    while (i < g.plays.length - 1 && (g.plays[i + 1].ts ?? 0) - gameStart <= wallSoFar) i++;
    const row = g.plays[i];
    show(g.id, g, row, i >= g.plays.length - 1 ? 'final' : 'live');
    engine.ingest(g.id, g, row, Date.now());
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
        if (e.status.type.state === 'post' && wasLive.delete(e.id)) await finalRow(e.id);
        if (e.status.type.state !== 'in') continue;
        wasLive.add(e.id);
        const s = await summary(e.id);
        const t = timeline(s);
        if (!t.length) continue;
        const row = t[t.length - 1];
        const meta = teams(s);
        show(e.id, meta, row, 'live');
        const ms = Date.now();
        if (lastTs.get(e.id) === row.ts) continue; // nothing new since the last poll
        lastTs.set(e.id, row.ts);
        engine.ingest(e.id, meta, {...row}, ms);
      }
    } catch (err) {
      console.error('poll failed', err.message);
    }
  };
  await poll();
  setInterval(poll, POLL_MS);
}
