// Demo day. With `node live.mjs --demo` the server also answers two loopback-only calls that drive a finished game
// through the real pipeline: /demo/prepare puts every paired household on a clean night following the game's teams,
// /demo/ping measures the TV's clock offset and /demo/status says how many TVs are connected and how many cues the service acked as posted. /demo/cue plays the game up to the moment Clutch speaks, so a recording reaches a real toast on a real
// authenticated socket without waiting for a live game, and /demo/final ends the game so the summary shows.
import {secsLeft} from './model.mjs';
import {compare, elapsed} from './showcase.mjs';

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function createDemo(hub, game) {
  const meta = {home: {...game.home, short: game.home.short}, away: {...game.away, short: game.away.short}};
  const teams = [game.home.abbr, game.away.abbr];
  const cueAt = compare(game).clutch[0];
  if (!cueAt) throw new Error('the demo game has no Clutch cue');
  const row = game.plays.find(r => elapsed(r.p, r.c) === cueAt.t);
  const reply = (res, code, obj) => {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(obj));
  };

  /** Returns true when the request was a demo route (handled), false to let the normal API see it. */
  return (req, res) => {
    if (!req.url.startsWith('/demo/')) return false;
    if (!LOCAL.has(req.socket.remoteAddress ?? '')) return reply(res, 403, {ok: false, error: 'local_only'}), true;
    if (req.method !== 'POST') return reply(res, 405, {ok: false}), true;
    if (req.url === '/demo/prepare') {
      for (const rec of hub.households.values()) hub.demoReset(rec, teams);
      return reply(res, 200, {ok: true, households: hub.households.size, follow: teams}), true;
    }
    if (req.url === '/demo/cue') {
      const now = hub.now();
      hub.show(game.id, meta, row, 'live', now);
      hub.feedOk(now);
      const before = [...hub.households.values()].reduce((n, rec) => n + rec.cues.size, 0);
      hub.ingest(game.id, meta, row, now);
      const after = [...hub.households.values()].reduce((n, rec) => n + rec.cues.size, 0);
      return reply(res, 200, {ok: true, cues: after - before, at: cueAt.at, secsLeft: secsLeft(row.p, row.c)}), true;
    }
    if (req.url === '/demo/ping') {
      for (const rec of hub.households.values()) hub.ping(rec);
      return reply(res, 200, {ok: true}), true;
    }
    if (req.url === '/demo/status') {
      const recs = [...hub.households.values()];
      const count = f => recs.reduce((n, rec) => n + f(rec), 0);
      return reply(res, 200, {
        ok: true,
        households: recs.length,
        devices: count(rec => rec.devices.size),
        cues: count(rec => rec.cues.size),
        posted: count(rec => [...rec.cues.values()].filter(c => c.postedAt).length),
        clockOffsetMs: recs.find(r => r.clockOffsetMs !== undefined)?.clockOffsetMs ?? null,
        pingRoundTripMs: recs.find(r => r.pingRoundTripMs !== undefined)?.pingRoundTripMs ?? null,
        timings: recs.flatMap(rec => [...rec.cues.values()].map(c => ({cueId: c.id, sendMs: c.ms, recvAtMs: c.recvAt ?? null, recvDeviceMs: c.recvDeviceMs ?? null, postedAtMs: c.postedAt ?? null, postedDeviceMs: c.postedDeviceMs ?? null}))),
      }), true;
    }
    if (req.url === '/demo/final') {
      hub.markFinal(game.id, hub.now());
      return reply(res, 200, {ok: true}), true;
    }
    return reply(res, 404, {ok: false}), true;
  };
}
