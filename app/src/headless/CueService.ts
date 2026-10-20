/**
 * com.clutch.tv.cue.service: keeps running after the app leaves the screen,
 * holds a WebSocket to the cue server and turns each cue message into a system
 * toast. Every cue is acked twice so the server can time it: `recv` as soon as
 * the frame arrives, `posted` once NotificationManager.post() has returned.
 */
import {CUE_WS_URL} from '../config';
import {cueToast, postToast} from '../notify/toast';

interface CueMessage {
  type: 'cue';
  id: number;
  title: string;
  body: string;
  /** Spike must-fail case: a channel name that is not a render template. */
  channel?: string;
}

let socket: WebSocket | undefined;
let stopped = false;
let retry: ReturnType<typeof setTimeout> | undefined;

function send(obj: object): void {
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify(obj));
  }
}

async function onCue(msg: CueMessage): Promise<void> {
  send({type: 'recv', id: msg.id, deviceMs: Date.now()});
  try {
    const toastId = await postToast(cueToast(msg.title, msg.body, msg.channel));
    send({type: 'posted', id: msg.id, deviceMs: Date.now(), toastId: JSON.stringify(toastId)});
    console.log(`CLUTCH_CUE_POSTED id=${msg.id} channel=${msg.channel ?? 'template'}`);
  } catch (err) {
    send({type: 'error', id: msg.id, deviceMs: Date.now(), error: String(err)});
    console.log(`CLUTCH_CUE_ERROR id=${msg.id} ${String(err)}`);
  }
}

function connect(): void {
  if (stopped) {
    return;
  }
  const ws = new WebSocket(CUE_WS_URL);
  socket = ws;
  ws.onopen = () => {
    console.log('CLUTCH_WS_OPEN');
    send({type: 'hello', deviceMs: Date.now()});
  };
  ws.onmessage = (ev: {data?: unknown}) => {
    try {
      const msg = JSON.parse(String(ev.data)) as CueMessage;
      if (msg.type === 'cue') {
        void onCue(msg);
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
  ws.onclose = () => {
    console.log('CLUTCH_WS_CLOSE');
    if (!stopped) {
      retry = setTimeout(connect, 2000);
    }
  };
}

// The system ends a service whose start has not returned in about 8 s, so start only opens the socket and returns.
export async function onStartCueService(): Promise<void> {
  stopped = false;
  console.log('CLUTCH_SERVICE_START');
  connect();
}

export async function onStopCueService(): Promise<void> {
  stopped = true;
  if (retry) {
    clearTimeout(retry);
  }
  socket?.close();
  console.log('CLUTCH_SERVICE_STOP');
}
