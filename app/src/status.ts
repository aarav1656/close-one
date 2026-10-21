import {ServerState} from './api';

export const STALE_MS = 45000;

export type FeedStatus =
  | {kind: 'loading'}
  | {kind: 'offline'; attempts: number}
  | {kind: 'stale'; ageMin: number | null}
  | {kind: 'ok'};

/**
 * What the Home screen should tell the household about the link and the feed.
 * `failures` is the number of failed polls in a row; the last good state stays on screen under the banner.
 */
export function feedStatus(state: ServerState | null, failures: number): FeedStatus {
  if (failures > 0) {
    return {kind: 'offline', attempts: failures};
  }
  if (!state) {
    return {kind: 'loading'};
  }
  const age = state.feed.ageMs;
  if (age === null || age > STALE_MS) {
    return {kind: 'stale', ageMin: age === null ? null : Math.max(1, Math.round(age / 60000))};
  }
  return {kind: 'ok'};
}
