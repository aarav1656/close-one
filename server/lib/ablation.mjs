// Learning ablation on identical game sequences: a scripted household watches a whole season of the teams it follows,
// answers every cue by one fixed habit, and the same plays are replayed twice, once with a fixed bar and once with the
// accept and dismiss learning. Both runs use the production Engine and Household; only the learning is switched off.
import {Engine} from './engine.mjs';
import {Household, nightOf} from './household.mjs';
import {rows} from './replay.mjs';

export const SCRIPT = {
  follow: ['NY', 'BOS', 'LAL', 'GS', 'OKC', 'MIA'],
  /** The household accepts a cue only when this team is playing, and dismisses every other. */
  own: 'NY',
};

/** The shared event stream: every play of every followed game, night by night, in wallclock order. */
function nights(games, follow) {
  const mine = games.filter(g => follow.some(t => t === g.home.abbr || t === g.away.abbr) && g.plays.every(p => p.ts));
  const byNight = new Map();
  for (const g of mine) {
    const n = nightOf(g.plays[0].ts);
    byNight.set(n, [...(byNight.get(n) ?? []), g]);
  }
  return [...byNight.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([night, gs]) => ({
    night,
    events: gs.flatMap(g => g.plays.map(p => ({g, p}))).sort((x, y) => x.p.ts - y.p.ts),
  }));
}

function run(stream, {learning, follow, own, base = 0.3, cap = 2}) {
  const household = new Household(learning ? {base, cap} : {base, cap, acceptStep: 0, dismissStep: 0, quietAfter: Infinity});
  household.settings = {...household.settings, onboarded: true};
  const tally = {cues: 0, accepted: 0, dismissed: 0, quietNights: 0};
  const quiet = new Set();
  const gameOf = new Map(stream.flatMap(n => n.events.map(e => [e.g.id, e.g])));
  let id = 0;
  const engine = new Engine({
    household,
    follow: new Set(follow),
    newId: () => ++id,
    onCue: cue => {
      const g = gameOf.get(cue.gameId);
      const action = g.home.abbr === own || g.away.abbr === own ? 'accept' : 'dismiss';
      tally.cues++;
      tally[action === 'accept' ? 'accepted' : 'dismissed']++;
      household.feedback({cueId: cue.id, team: cue.team, ms: cue.ms, action});
      if (household.isQuiet(cue.ms)) quiet.add(nightOf(cue.ms));
    },
  });
  for (const {events} of stream) {
    for (const {g, p} of events) {
      engine.ingest(g.id, g, {p: p.p, c: p.c, h: p.h, a: p.a, ts: p.ts}, p.ts);
    }
  }
  tally.quietNights = quiet.size;
  return tally;
}

/** @returns {{fixed, adaptive, saved, keptAccepts}} */
export function ablate(games, script = SCRIPT) {
  const stream = nights(games, script.follow);
  const fixed = run(stream, {learning: false, ...script});
  const adaptive = run(stream, {learning: true, ...script});
  return {
    script,
    nights: stream.length,
    fixed,
    adaptive,
    dismissalsSaved: fixed.dismissed - adaptive.dismissed,
    dismissalsSavedShare: fixed.dismissed ? (fixed.dismissed - adaptive.dismissed) / fixed.dismissed : 0,
    acceptsKept: fixed.accepted ? adaptive.accepted / fixed.accepted : 1,
  };
}
