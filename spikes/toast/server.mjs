// Cue server for the toast spike. The Vega service connects here; the server sends
// N cues and records send->recv and send->posted latency, with the device clock
// offset estimated from ping/pong midpoints taken just before each cue.
//
//   node server.mjs [--n 20] [--interval 12000] [--channel template|bad] [--out latencies.csv] [--start-delay 1500]
import {WebSocketServer} from 'ws';
import {appendFileSync, writeFileSync} from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const N = Number(arg('n', 20));
const INTERVAL = Number(arg('interval', 12000));
const CHANNEL = arg('channel', 'template');
const OUT = arg('out', `latencies-${CHANNEL}.csv`);
const START_DELAY = Number(arg('start-delay', 1500));
const PORT = Number(arg('port', 38787));

const now = () => Date.now();
// NotificationManager.post() returns {bytes:[...]} (a 16 byte id); print it as hex.
const toastHex = raw => {
  try {
    return Buffer.from(JSON.parse(raw).bytes.map(b => b & 255)).toString('hex');
  } catch {
    return '';
  }
};
const wss = new WebSocketServer({port: PORT, host: '0.0.0.0'});
console.log(`cue server on :${PORT}, ${N} cues, channel=${CHANNEL}, out=${OUT}`);

let running = false;
wss.on('connection', ws => {
  console.log('device connected');
  const waiters = new Map();
  ws.on('message', raw => {
    const m = JSON.parse(String(raw));
    const key = `${m.type}:${m.id ?? ''}`;
    waiters.get(key)?.({m, at: now()});
    waiters.delete(key);
  });
  const wait = (key, ms = 5000) =>
    new Promise(res => {
      waiters.set(key, res);
      setTimeout(() => {
        if (waiters.delete(key)) res(null);
      }, ms);
    });

  ws.on('close', () => console.log('device disconnected'));
  if (running) return;
  running = true;
  (async () => {
    writeFileSync(OUT, 'id,channel,t_send_ms,clock_offset_ms,send_to_recv_ms,send_to_posted_ms,toast_id,error\n');
    await new Promise(r => setTimeout(r, START_DELAY));
    for (let id = 1; id <= N; id++) {
      const t0 = now();
      ws.send(JSON.stringify({type: 'ping', id}));
      const pong = await wait(`pong:${id}`);
      const offset = pong ? pong.m.deviceMs - (t0 + (pong.at - t0) / 2) : '';
      const waitRecv = wait(`recv:${id}`);
      const waitPosted = wait(`posted:${id}`, 6000);
      const waitErr = wait(`error:${id}`, 6000);
      const tSend = now();
      ws.send(JSON.stringify({
        type: 'cue', id,
        title: `Clutch cue ${id}`,
        body: 'The game is coming down to the wire. Menu to switch.',
        ...(CHANNEL === 'bad' ? {channel: 'NotATemplateName'} : {}),
      }));
      const recv = await waitRecv;
      const outcome = await Promise.race([waitPosted, waitErr]);
      const posted = outcome?.m.type === 'posted' ? outcome : null;
      const err = outcome?.m.type === 'error' ? outcome : null;
      const row = [
        id, CHANNEL, tSend, typeof offset === 'number' ? offset.toFixed(1) : '',
        recv ? (recv.m.deviceMs - offset - tSend).toFixed(1) : '',
        posted ? (posted.m.deviceMs - offset - tSend).toFixed(1) : '',
        toastHex(posted?.m.toastId), err ? JSON.stringify(err.m.error) : '',
      ].join(',');
      appendFileSync(OUT, row + '\n');
      console.log(row);
      await new Promise(r => setTimeout(r, INTERVAL));
    }
    console.log('done');
    process.exit(0);
  })();
});
