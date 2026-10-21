import {clearToken, getServerUrl, getToken, saveToken} from './session';

export interface GameView {
  id: string;
  home: string;
  away: string;
  label: string;
  status: string;
  period: number;
  clock: number;
  pressure: number;
  followed: boolean;
}
export interface Card {
  id: number;
  gameId: string;
  title: string;
  body: string;
  why?: string;
  home?: string;
  away?: string;
  score?: string;
}
export interface Team {
  abbr: string;
  city: string;
  nick: string;
  name: string;
}
/** One cue this household got tonight. action is null while it waits for an answer. */
export interface CueMark {
  cueId: number;
  team: string;
  lev: number;
  threshold: number;
  action: 'accept' | 'dismiss' | null;
  after: number | null;
  period: number;
  clock: number;
}
export interface ServerState {
  active: Card | null;
  tonight: {cues: number; cap: number; quiet: boolean};
  follow: string[];
  games: GameView[];
  upcoming: {label: string; startsAt: string}[];
  feed: {ok: boolean; ageMs: number | null};
  learning: {base: number; min: number; max: number; threshold: number; cues: CueMark[]};
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
  });
  try {
    return await Promise.race([fetch(url, init), timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

let pairing: Promise<string> | undefined;

/** The stored device token, pairing this TV with a new household the first time. */
export function ensureToken(): Promise<string> {
  pairing ??= (async () => {
    try {
      const have = await getToken();
      if (have) {
        return have;
      }
      const res = await fetchWithTimeout(`${await getServerUrl()}/api/pair`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({name: 'Fire TV'}),
      });
      if (!res.ok) {
        throw new ApiError(res.status, `pair ${res.status}`);
      }
      const {token} = (await res.json()) as {token: string};
      await saveToken(token);
      console.log('CLUTCH_PAIRED');
      return token;
    } finally {
      pairing = undefined;
    }
  })();
  return pairing;
}

async function call<T>(method: string, path: string, body?: object): Promise<T> {
  const res = await fetchWithTimeout(`${await getServerUrl()}${path}`, {
    method,
    headers: {'content-type': 'application/json', authorization: `Bearer ${await ensureToken()}`},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    // Unknown or expired token: forget it, the next call pairs again.
    await clearToken();
  }
  if (!res.ok) {
    throw new ApiError(res.status, `${method} ${path} ${res.status}`);
  }
  return (await res.json()) as T;
}

export const getState = (): Promise<ServerState> => call('GET', '/api/state');

export async function getTeams(): Promise<Team[]> {
  return (await call<{teams: Team[]}>('GET', '/api/teams')).teams;
}

export async function setFollow(teams: string[]): Promise<string[]> {
  return (await call<{follow: string[]}>('PUT', '/api/follow', {teams})).follow;
}

export async function sendFeedback(cueId: number, action: 'accept' | 'dismiss'): Promise<void> {
  await call('POST', '/api/feedback', {cueId, action});
  console.log(`CLUTCH_FEEDBACK cue=${cueId} ${action}`);
}

export const periodLabel = (p: number): string =>
  p <= 4 ? ['', '1st', '2nd', '3rd', '4th'][p] : p === 5 ? 'OT' : `${p - 4}OT`;
export const clockLabel = (c: number): string =>
  `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}`;

/** 7:30 PM in the TV's own time zone. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
