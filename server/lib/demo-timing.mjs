// Joins the three clocks of a demo cue: the server's (when it sent), the TV's (when its service received and posted)
// and the TV's system log (when the notification renderer claimed the screen). The TV clock is mapped onto the
// server clock with the offset measured by a ping round trip.

export const RENDER_WINDOW_MS = 3000;

const MONTHS = {Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11};

/** "Oct 21 06:46:17.123456" as epoch milliseconds, read as UTC (the TV's syslog clock). */
export function syslogEpochMs(stamp, year) {
  const m = /^(\w{3}) +(\d+) (\d\d):(\d\d):(\d\d)(?:\.(\d+))?$/.exec(stamp.trim());
  if (!m || !(m[1] in MONTHS)) throw new Error(`not a syslog timestamp: ${stamp}`);
  const ms = m[6] ? Math.round(Number(`0.${m[6]}`) * 1000) : 0;
  return Date.UTC(year, MONTHS[m[1]], Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), ms);
}

const CLAIM = /^(\w{3} +\d+ \d\d:\d\d:\d\d(?:\.\d+)?) .*notification.*Client Requesting Priority 224: SYSTEMUI_PRIORITY/;

/** TV clock times at which the notification renderer claimed the screen, in log order. */
export function rendererClaims(logText, year) {
  const out = [];
  for (const line of logText.split('\n')) {
    const m = CLAIM.exec(line);
    if (m) out.push(syslogEpochMs(m[1], year));
  }
  return out;
}

/**
 * @param t one row of /demo/status timings plus the measured clockOffsetMs
 * @param claims renderer claims in TV clock milliseconds
 * @returns send to recv, posted and render in server-clock milliseconds, or ok false with the reason
 */
export function timeline({sendMs, recvDeviceMs, postedDeviceMs, clockOffsetMs}, claims) {
  if (recvDeviceMs === null || postedDeviceMs === null) return {ok: false, why: 'the service never acked recv and posted'};
  if (clockOffsetMs === null) return {ok: false, why: 'no clock offset: the TV never answered the ping'};
  const onServer = tvMs => tvMs - clockOffsetMs;
  const claim = claims.map(onServer).find(c => c >= onServer(postedDeviceMs) - 50);
  if (claim === undefined) return {ok: false, why: 'the notification renderer never claimed the screen after the post'};
  const sendToRecvMs = Math.round(onServer(recvDeviceMs) - sendMs);
  const sendToPostedMs = Math.round(onServer(postedDeviceMs) - sendMs);
  const sendToRenderMs = Math.round(claim - sendMs);
  const inWindow = sendToRenderMs >= 0 && sendToRenderMs <= RENDER_WINDOW_MS;
  return {ok: inWindow, why: inWindow ? null : `the renderer claimed the screen ${sendToRenderMs} ms after the send, outside 0 to ${RENDER_WINDOW_MS}`, sendToRecvMs, sendToPostedMs, sendToRenderMs};
}
