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
  /** Quarter and clock, for example 4th quarter, 2:27 left. */
  when?: string;
  why?: string;
  /** The numbers behind the cue: pressure on the next possession, the household's bar, cues left tonight. */
  whyData?: {lev: number; threshold: number; base: number; cap: number; cuesLeft: number};
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
export interface Quiet {
  from: number;
  to: number;
}
/** The household's own switches. silence names why no cue will be sent right now, or null. */
export interface Settings {
  onboarded: boolean;
  enabled: boolean;
  quiet: Quiet | null;
  paused: boolean;
  silence: 'off' | 'paused' | 'quiet_hours' | null;
}
export interface Summary {
  gameId: string;
  label: string;
  cues: number;
  accepted: number;
  dismissed: number;
  waiting: number;
  from: number;
  to: number;
}
export interface Alert {
  t: number;
  at: string;
  lev: number;
  why: string;
  verdict?: string;
}
/** One finished game through both rules, from the server's showcase replay. */
export interface Showcase {
  label: string;
  date: string;
  /** Seconds since tip-off where the chart starts, and where the game ends. */
  from: number;
  total: number;
  bar: number;
  series: number[];
  ticks: {t: number; label: string}[];
  rule: Alert[];
  clutch: Alert[];
  summary: string;
}
export interface ServerState {
  active: Card | null;
  tonight: {cues: number; cap: number; quiet: boolean};
  follow: string[];
  followNames: string[];
  settings: Settings;
  summaries: Summary[];
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

export async function setSettings(patch: Partial<Pick<Settings, 'onboarded' | 'enabled' | 'quiet'>> & {offsetMin?: number}): Promise<Settings> {
  return (await call<{settings: Settings}>('PUT', '/api/settings', patch)).settings;
}

export async function setPause(paused: boolean): Promise<Settings> {
  return (await call<{settings: Settings}>('POST', '/api/pause', {paused})).settings;
}

export const getShowcase = (): Promise<Showcase> => call('GET', '/api/showcase');

/** Minutes the TV's clock is ahead of UTC, so quiet hours mean the household's own hours. */
export const localOffsetMin = (): number => -new Date().getTimezoneOffset();

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
