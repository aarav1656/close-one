// ESPN site API: scoreboard (which games) and summary (plays plus per-play win probability).
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

async function getJson(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {headers: {accept: 'application/json'}});
      if (r.ok) return await r.json();
      last = new Error(`${r.status} ${url}`);
    } catch (e) {
      last = e;
    }
    await new Promise(r => setTimeout(r, 400 * (i + 1)));
  }
  throw last;
}

export const scoreboard = date => getJson(`${BASE}/scoreboard${date ? `?dates=${date}` : ''}`);
export const summary = id => getJson(`${BASE}/summary?event=${id}`);

const clockSecs = display => {
  const s = String(display ?? '0:00');
  if (s.includes(':')) {
    const [m, sec] = s.split(':');
    return Number(m) * 60 + Number(sec);
  }
  return Number(s);
};

/** Compact timeline: one row per play, {p: period, c: seconds left in the period, h, a, w: ESPN home win prob or null, ts: wallclock ms or null}. */
export function timeline(sum) {
  const wp = new Map((sum.winprobability ?? []).map(x => [x.playId, x.homeWinPercentage]));
  return (sum.plays ?? [])
    .filter(p => p.period?.number && p.clock?.displayValue !== undefined)
    .map(p => ({
      p: p.period.number,
      c: clockSecs(p.clock.displayValue),
      h: p.homeScore,
      a: p.awayScore,
      w: wp.has(p.id) ? wp.get(p.id) : null,
      ts: p.wallclock ? Date.parse(p.wallclock) : null,
    }));
}

export function teams(sum) {
  const comp = sum.header.competitions[0];
  const side = k => comp.competitors.find(c => c.homeAway === k);
  const pick = c => ({id: c.team.id, name: c.team.displayName, short: c.team.shortDisplayName ?? c.team.displayName, abbr: c.team.abbreviation});
  return {home: pick(side('home')), away: pick(side('away')), status: comp.status.type};
}
