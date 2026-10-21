import bundled from '../clutch.config.json';

/**
 * The server a build talks to unless the household changed it in Settings.
 * clutch.config.json carries it (scripts/set-server.sh rewrites it); the value in the repo is the
 * host alias the Vega Virtual Device uses for the Mac that runs `node live.mjs`.
 */
export const DEFAULT_SERVER_URL: string = bundled.serverUrl;
export const CUE_SERVICE_URI = 'pkg://com.clutch.tv.cue.service';
export const APP_URI = 'pkg://com.clutch.tv.main';

/** http://host:port becomes ws://host:port, https becomes wss. */
export const wsUrl = (serverUrl: string): string => serverUrl.replace(/^http/, 'ws');

/** Accepts http(s)://host[:port] and returns it without a trailing slash, or null. */
export function normalizeServerUrl(input: string): string | null {
  const m = /^(https?):\/\/([A-Za-z0-9.-]+)(?::(\d{1,5}))?\/?$/.exec(input.trim());
  if (!m) {
    return null;
  }
  const port = m[3] ? Number(m[3]) : undefined;
  if (port !== undefined && (port < 1 || port > 65535)) {
    return null;
  }
  return `${m[1]}://${m[2]}${port !== undefined ? `:${port}` : ''}`;
}

export const hostOf = (serverUrl: string): string => serverUrl.replace(/^https?:\/\//, '');
