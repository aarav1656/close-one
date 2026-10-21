// HTTP and WebSocket surface of the cue server. Everything except /health and /api/pair needs the
// device token issued at pairing: as a bearer header over HTTP, as the first `hello` frame over WebSocket.
import {readFileSync} from 'node:fs';
import {WebSocketServer} from 'ws';
import {HubError} from './hub.mjs';
import {TEAMS} from './teams.mjs';
import {compare, loadShowcase} from './showcase.mjs';

const icon = readFileSync(new URL('../assets/clutch-icon.png', import.meta.url));

const showcase = compare(loadShowcase(new URL('../showcase/401809247.json', import.meta.url)));

const json = (res, code, obj) => {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(obj));
};

const readJson = (req, max = 4096) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => {
      body += d;
      if (body.length > max) {
        reject(new HubError(413, 'too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new HubError(400, 'bad_json'));
      }
    });
    req.on('error', reject);
  });

const bearer = req => /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];

/** @returns an http request handler bound to the hub; `now` and the pairing limit are injectable for tests. */
export function createApi(hub, {pairsPerMinute = 20, now = Date.now} = {}) {
  const pairs = new Map(); // ip -> timestamps of recent pairings
  return async (req, res) => {
    try {
      const path = req.url.split('?')[0];
      const route = `${req.method} ${path}`;
      if (route === 'GET /health') return json(res, 200, {ok: true});
      // The toast icon. The system renderer fetches it over http, so it is served without a token.
      if (route === 'GET /assets/clutch-icon.png') {
        console.log(`ICON requested by ${req.socket.remoteAddress} ua=${req.headers['user-agent'] ?? ''}`);
        res.setHeader('content-type', 'image/png');
        res.setHeader('cache-control', 'public, max-age=86400');
        return res.end(icon);
      }
      if (route === 'POST /api/pair') {
        const ip = req.socket.remoteAddress ?? '';
        const recent = (pairs.get(ip) ?? []).filter(t => now() - t < 60e3);
        if (recent.length >= pairsPerMinute) throw new HubError(429, 'too_many_pairings');
        pairs.set(ip, [...recent, now()]);
        const {name} = await readJson(req);
        return json(res, 200, hub.pair(name));
      }
      const rec = hub.auth(bearer(req));
      if (!rec) throw new HubError(401, 'unauthorized');
      if (route === 'GET /api/teams') return json(res, 200, {teams: TEAMS});
      if (route === 'GET /api/showcase') return json(res, 200, showcase);
      if (route === 'GET /api/state') return json(res, 200, hub.state(rec));
      if (route === 'PUT /api/follow') {
        const {teams} = await readJson(req);
        return json(res, 200, {ok: true, follow: hub.setFollow(rec, teams)});
      }
      if (route === 'PUT /api/settings') return json(res, 200, {ok: true, settings: hub.setSettings(rec, await readJson(req))});
      if (route === 'POST /api/pause') return json(res, 200, {ok: true, settings: hub.pause(rec, (await readJson(req)).paused)});
      if (route === 'POST /api/feedback') {
        const {cueId, action} = await readJson(req);
        return json(res, 200, {ok: hub.answer(rec, cueId, action)});
      }
      json(res, 404, {ok: false, error: 'not_found'});
    } catch (e) {
      if (e instanceof HubError) return json(res, e.status, {ok: false, error: e.code});
      console.error('api error', e);
      json(res, 500, {ok: false, error: 'server'});
    }
  };
}

/**
 * Cue push channel. A socket is anonymous until its first frame, a `hello` carrying a valid token;
 * anything else, or silence for helloTimeoutMs, closes it with 4401. Later frames go to onMessage(rec, frame, ws).
 */
export function attachWs(server, hub, {onMessage = () => {}, helloTimeoutMs = 5000} = {}) {
  const wss = new WebSocketServer({server, maxPayload: 8192});
  wss.on('connection', ws => {
    let rec = null;
    const timer = setTimeout(() => ws.close(4401, 'no hello'), helloTimeoutMs);
    ws.on('error', () => {});
    ws.on('close', () => {
      clearTimeout(timer);
      rec?.devices.delete(ws);
    });
    ws.on('message', raw => {
      let m;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return ws.close(1003, 'bad frame');
      }
      if (!rec) {
        rec = m?.type === 'hello' ? hub.auth(m.token) : null;
        if (!rec) return ws.close(4401, 'unauthorized');
        clearTimeout(timer);
        rec.devices.add(ws);
        ws.send(JSON.stringify({type: 'welcome', householdId: rec.id}));
      }
      onMessage(rec, m, ws);
    });
  });
  return wss;
}
