import {DEFAULT_SERVER_URL, hostOf, normalizeServerUrl, wsUrl} from '../src/config';
import * as session from '../src/session';
import {ApiError, clockTime, ensureToken, getState, setFollow} from '../src/api';
import {feedStatus, STALE_MS} from '../src/status';
import {baseState} from './helpers';
import {cueToast, iconUrl} from '../src/notify/toast';

jest.mock('@amazon-devices/react-native-async-storage__async-storage', () =>
  require('@amazon-devices/react-native-async-storage__async-storage/jest/async-storage-mock'),
);

const reply = (status: number, body: object) => Promise.resolve({ok: status < 300, status, json: async () => body} as Response);

describe('server address', () => {
  it('accepts http(s) hosts and rejects the rest', () => {
    expect(normalizeServerUrl('http://10.0.2.2:38787/')).toBe('http://10.0.2.2:38787');
    expect(normalizeServerUrl(' https://clutch.example.com ')).toBe('https://clutch.example.com');
    for (const bad of ['', 'clutch.example.com', 'ftp://x', 'http://', 'http://a b', 'http://host:99999', 'http://host/path', 'javascript:alert(1)']) {
      expect(normalizeServerUrl(bad)).toBeNull();
    }
  });
  it('derives the socket address and the host label', () => {
    expect(wsUrl('http://h:1')).toBe('ws://h:1');
    expect(wsUrl('https://h')).toBe('wss://h');
    expect(hostOf('https://h:1')).toBe('h:1');
  });
});

describe('session and pairing', () => {
  beforeEach(async () => {
    await session.resetServerUrl();
    jest.restoreAllMocks();
  });

  it('uses the bundled address until one is saved, and a new address drops the old token', async () => {
    expect(await session.getServerUrl()).toBe(DEFAULT_SERVER_URL);
    await session.saveToken('t'.repeat(43));
    expect(await session.setServerUrl('nope')).toBe(false);
    expect(await session.getToken()).toBe('t'.repeat(43));
    expect(await session.setServerUrl('https://clutch.example.com')).toBe(true);
    expect(await session.getServerUrl()).toBe('https://clutch.example.com');
    expect(await session.getToken()).toBeNull();
  });

  it('pairs once even when several calls ask at the same moment, then reuses the token', async () => {
    const fetchMock = jest.fn((_url: string, _init?: RequestInit) => reply(200, {token: 'abc'.repeat(15)}));
    (globalThis as any).fetch = fetchMock;
    const tokens = await Promise.all([ensureToken(), ensureToken(), ensureToken()]);
    expect(new Set(tokens).size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_SERVER_URL}/api/pair`);
    await ensureToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the token as a bearer header and forgets it when the server answers 401', async () => {
    await session.saveToken('k'.repeat(43));
    const fetchMock = jest.fn().mockReturnValueOnce(reply(401, {ok: false})).mockReturnValueOnce(reply(200, baseState));
    (globalThis as any).fetch = fetchMock;
    await expect(getState()).rejects.toMatchObject({status: 401});
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({authorization: `Bearer ${'k'.repeat(43)}`});
    expect(await session.getToken()).toBeNull();
  });

  it('puts followed teams to /api/follow and surfaces a rejection', async () => {
    await session.saveToken('k'.repeat(43));
    const fetchMock = jest.fn().mockReturnValueOnce(reply(200, {ok: true, follow: ['NY']})).mockReturnValueOnce(reply(400, {ok: false}));
    (globalThis as any).fetch = fetchMock;
    expect(await setFollow(['NY'])).toEqual(['NY']);
    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_SERVER_URL}/api/follow`);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({teams: ['NY']});
    await expect(setFollow(['XXX'])).rejects.toBeInstanceOf(ApiError);
  });
});

describe('feedStatus', () => {
  it('orders offline over stale over loading over ok', () => {
    expect(feedStatus(null, 0)).toEqual({kind: 'loading'});
    expect(feedStatus(null, 2)).toEqual({kind: 'offline', attempts: 2});
    expect(feedStatus(baseState, 1)).toEqual({kind: 'offline', attempts: 1});
    expect(feedStatus(baseState, 0)).toEqual({kind: 'ok'});
    expect(feedStatus({...baseState, feed: {ok: true, ageMs: STALE_MS + 1}}, 0)).toEqual({kind: 'stale', ageMin: 1});
    expect(feedStatus({...baseState, feed: {ok: true, ageMs: STALE_MS}}, 0)).toEqual({kind: 'ok'});
    expect(feedStatus({...baseState, feed: {ok: false, ageMs: null}}, 0)).toEqual({kind: 'stale', ageMin: null});
  });
});

describe('clockTime', () => {
  it('formats in 12 hour time', () => {
    expect(clockTime(new Date(2026, 9, 21, 0, 5).toISOString())).toBe('12:05 AM');
    expect(clockTime(new Date(2026, 9, 21, 19, 30).toISOString())).toBe('7:30 PM');
    expect(clockTime(new Date(2026, 9, 21, 12, 0).toISOString())).toBe('12:00 PM');
  });
});

describe('toast', () => {
  it('draws its icon from the Close One server, never a third party', () => {
    expect(iconUrl('http://10.0.2.2:38787')).toBe('https://raw.githubusercontent.com/aarav1656/close-one/main/server/assets/clutch-icon.png');
    const t = cueToast('title', 'body', iconUrl('https://clutch.example.com'));
    expect(t.mIconUri).toBe('https://clutch.example.com/assets/clutch-icon.png');
    expect(t.mChannel.name).toBe('MenuToastRenderTemplate');
    expect(t.mIconUri).not.toContain('amazon.com');
  });
  it('keeps the render template unless a channel is forced', () => {
    expect(cueToast('t', 'b', 'u', 'NotATemplate').mChannel.name).toBe('NotATemplate');
  });
});
