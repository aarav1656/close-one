import {API_BASE} from './config';

export interface GameView {
  id: string;
  home: string;
  away: string;
  label: string;
  status: string;
  period: number;
  clock: number;
  pressure: number;
}
export interface Card {
  id: number;
  gameId: string;
  title: string;
  body: string;
  home?: string;
  away?: string;
  score?: string;
}
export interface ServerState {
  active: Card | null;
  tonight: {cues: number; cap: number; quiet: boolean};
  games: GameView[];
}

export async function getState(): Promise<ServerState> {
  const res = await fetch(`${API_BASE}/api/state`);
  if (!res.ok) {
    throw new Error(`state ${res.status}`);
  }
  return (await res.json()) as ServerState;
}

export async function sendFeedback(cueId: number, action: 'accept' | 'dismiss'): Promise<void> {
  const res = await fetch(`${API_BASE}/api/feedback`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({cueId, action}),
  });
  if (!res.ok) {
    throw new Error(`feedback ${res.status}`);
  }
  console.log(`CLUTCH_FEEDBACK cue=${cueId} ${action}`);
}

export const periodLabel = (p: number): string =>
  p <= 4 ? ['', '1st', '2nd', '3rd', '4th'][p] : p === 5 ? 'OT' : `${p - 4}OT`;
export const clockLabel = (c: number): string =>
  `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}`;
