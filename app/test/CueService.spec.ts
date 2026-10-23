import * as session from '../src/session';
import {onStartCueService, onStopCueService} from '../src/headless/CueService';
import * as toast from '../src/notify/toast';

jest.mock('@amazon-devices/react-native-async-storage__async-storage', () =>
  require('@amazon-devices/react-native-async-storage__async-storage/jest/async-storage-mock'),
);
jest.mock('../src/notify/toast', () => ({
  cueToast: jest.fn((title: string, body: string, iconUri: string, channel?: string) => ({title, body, iconUri, channel})),
  iconUrl: jest.requireActual('../src/notify/toast').iconUrl,
  postToast: jest.fn(async () => ({bytes: [1, 2]})),
}));

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: any[] = [];
  onopen?: () => void;
  onmessage?: (ev: {data: string}) => void;
  onclose?: (ev: {code: number; reason: string}) => void;
  onerror?: (ev: unknown) => void;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(s: string) {
    this.sent.push(JSON.parse(s));
  }
  close() {}
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}

const tick = (ms: number) => jest.advanceTimersByTimeAsync(ms);

describe('cue service', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    FakeSocket.all = [];
    (globalThis as any).WebSocket = FakeSocket;
    await session.resetServerUrl();
  });
  afterEach(async () => {
    await onStopCueService();
    jest.useRealTimers();
  });

  it('waits for the app to pair, then opens the socket and says hello with the stored token', async () => {
    await onStartCueService();
    await tick(10);
    expect(FakeSocket.all).toHaveLength(0);
    await session.saveToken('s'.repeat(43));
    await tick(2100);
    expect(FakeSocket.all).toHaveLength(1);
    expect(FakeSocket.all[0].url).toBe('ws://10.0.2.2:38787');
    FakeSocket.all[0].open();
    expect(FakeSocket.all[0].sent[0]).toMatchObject({type: 'hello', token: 's'.repeat(43)});
  });

  it('turns a cue frame into a toast and acks recv then posted', async () => {
    await session.saveToken('s'.repeat(43));
    await onStartCueService();
    await tick(10);
    const ws = FakeSocket.all[0];
    ws.open();
    ws.onmessage?.({data: JSON.stringify({type: 'cue', id: 5, title: 'A at B is coming down to the wire', body: '4th quarter, 3:12 left.'})});
    await tick(10);
    expect(toast.postToast).toHaveBeenCalledTimes(1);
    expect(toast.cueToast).toHaveBeenCalledWith('A at B is coming down to the wire', '4th quarter, 3:12 left.', 'https://raw.githubusercontent.com/aarav1656/close-one/main/server/assets/clutch-icon.png', undefined);
    expect(ws.sent.map(m => m.type)).toEqual(['hello', 'recv', 'posted']);
  });

  it('after the server rejects the token (4401) it reconnects with whatever token is stored by then', async () => {
    await session.saveToken('old'.repeat(15));
    await onStartCueService();
    await tick(10);
    FakeSocket.all[0].open();
    await session.saveToken('new'.repeat(15));
    FakeSocket.all[0].onclose?.({code: 4401, reason: 'unauthorized'});
    await tick(2100);
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1].open();
    expect(FakeSocket.all[1].sent[0]).toMatchObject({type: 'hello', token: 'new'.repeat(15)});
  });

  it('backs off between failed connections, 2 s then 4 s, and stops when stopped', async () => {
    await session.saveToken('s'.repeat(43));
    await onStartCueService();
    await tick(10);
    FakeSocket.all[0].onclose?.({code: 1006, reason: ''});
    await tick(1900);
    expect(FakeSocket.all).toHaveLength(1);
    await tick(200);
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1].onclose?.({code: 1006, reason: ''});
    await tick(3900);
    expect(FakeSocket.all).toHaveLength(2);
    await tick(200);
    expect(FakeSocket.all).toHaveLength(3);
    await onStopCueService();
    FakeSocket.all[2].onclose?.({code: 1006, reason: ''});
    await tick(20000);
    expect(FakeSocket.all).toHaveLength(3);
  });
});
