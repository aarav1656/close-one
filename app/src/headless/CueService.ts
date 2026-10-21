/**
 * com.clutch.tv.cue.service: keeps running after the app leaves the screen,
 * holds a WebSocket to the cue server and turns each cue message into a system
 * toast. The socket opens with a `hello` frame carrying the device token the app
 * stored at pairing; the server closes it with code 4401 when the token is not
 * valid, and the service tries again with whatever token is stored by then.
 * Every cue is acked twice so the server can time it: `recv` as soon as the
 * frame arrives, `posted` once NotificationManager.post() has returned.
 */
import {wsUrl} from '../config';
import {cueToast, iconUrl, postToast} from '../notify/toast';
import {getServerUrl, getToken} from '../session';

interface CueMessage {
  type: 'cue';
  id: number;
  title: string;
  body: string;
  /** Spike must-fail case: a channel name that is not a render template. */
  channel?: string;
}

const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 15000;

let socket: WebSocket | undefined;
let stopped = false;
let retry: ReturnType<typeof setTimeout> | undefined;
let retryMs = RETRY_MIN_MS;

function send(obj: object): void {
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify(obj));
  }
}

async function onCue(msg: CueMessage, serverUrl: string): Promise<void> {
  send({type: 'recv', id: msg.id, deviceMs: Date.now()});
  try {
    const content = cueToast(msg.title, msg.body, iconUrl(serverUrl), msg.channel);
    const toastId = await postToast(content);
    send({type: 'posted', id: msg.id, deviceMs: Date.now(), toastId: JSON.stringify(toastId)});
    console.log(`CLUTCH_CUE_POSTED id=${msg.id} channel=${msg.channel ?? 'template'}`);
  } catch (err) {
    const detail = err instanceof Error ? String(err) : JSON.stringify(err);
    send({type: 'error', id: msg.id, deviceMs: Date.now(), error: detail});
    console.log(`CLUTCH_CUE_ERROR id=${msg.id} ${detail}`);
  }
}

function later(): void {
  if (!stopped) {
    retry = setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
  }
}

async function connect(): Promise<void> {
  if (stopped) {
    return;
  }
  const [url, token] = await Promise.all([getServerUrl(), getToken()]);
  if (!token) {
    console.log('CLUTCH_WS_WAIT_TOKEN');
    later();
    return;
  }
  const ws = new WebSocket(wsUrl(url));
  socket = ws;
  ws.onopen = () => {
    console.log('CLUTCH_WS_OPEN');
    retryMs = RETRY_MIN_MS;
    send({type: 'hello', token, deviceMs: Date.now()});
  };
  ws.onmessage = (ev: {data?: unknown}) => {
    try {
      const msg = JSON.parse(String(ev.data)) as CueMessage;
      if (msg.type === 'cue') {
        void onCue(msg, url);
      } else if ((msg as {type: string}).type === 'ping') {
        send({type: 'pong', id: (msg as {id: number}).id, deviceMs: Date.now()});
      }
    } catch (err) {
      console.log(`CLUTCH_WS_BAD_FRAME ${String(err)}`);
    }
  };
  ws.onerror = (ev: unknown) => {
    console.log(`CLUTCH_WS_ERROR ${JSON.stringify(ev)}`);
  };
  ws.onclose = (ev: {code?: number; reason?: string}) => {
    // 4401 is the server saying the token is unknown or expired; anything else is the network.
    console.log(`CLUTCH_WS_CLOSE code=${ev?.code} reason=${ev?.reason ?? ''}${ev?.code === 4401 ? ' (token rejected)' : ''}`);
    later();
  };
}

// The system ends a service whose start has not returned in about 8 s, so start only opens the socket and returns.
export async function onStartCueService(): Promise<void> {
  stopped = false;
  retryMs = RETRY_MIN_MS;
  console.log('CLUTCH_SERVICE_START');
  void connect();
}

export async function onStopCueService(): Promise<void> {
  stopped = true;
  if (retry) {
    clearTimeout(retry);
  }
  socket?.close();
  console.log('CLUTCH_SERVICE_STOP');
}
