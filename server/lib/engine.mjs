// Feeds game states through the cue decision for one household and keeps the per game arming.
import {secsLeft, leverage, decide, REARM_FRACTION} from './model.mjs';

const ordinal = n => ['', '1st', '2nd', '3rd', '4th'][n] ?? `OT${n - 4}`;
export const periodLabel = p => (p <= 4 ? `${ordinal(p)} quarter` : p === 5 ? 'overtime' : `${p - 4}OT`);
const clockLabel = c => `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}`;

export class Engine {
  /**
   * @param household Household instance
   * @param follow 'all' or a Set of team abbreviations
   * @param hooks {onCue(cue), onDecision(row)}
   */
  constructor({household, follow = 'all', onCue = () => {}, onDecision = () => {}, scores = false}) {
    this.h = household;
    this.follow = follow;
    this.onCue = onCue;
    this.onDecision = onDecision;
    this.scores = scores;
    this.games = new Map();
    this.nextId = 1;
  }

  /** The followed team of a game, or null when the household follows neither side. */
  followed(meta) {
    if (this.follow === 'all') return meta.home;
    return [meta.home, meta.away].find(t => this.follow.has(t.abbr)) ?? null;
  }

  ingest(gameId, meta, row, ms) {
    const g = this.games.get(gameId) ?? {armed: true};
    this.games.set(gameId, g);
    const team = this.followed(meta);
    if (!team) return null;
    const secs = secsLeft(row.p, row.c);
    const lev = leverage(row.h - row.a, secs);
    const threshold = this.h.threshold(team.abbr, ms);
    const reason = decide({secs, lev, threshold, armed: g.armed, cuesTonight: this.h.cuesTonight(ms), cap: this.h.o.cap, quiet: this.h.isQuiet(ms)});
    let cue = null;
    if (reason === 'cue') {
      g.armed = false;
      this.h.recordCue(ms);
      cue = {
        id: this.nextId++,
        gameId,
        team: team.abbr,
        ms,
        title: `${meta.away.short} at ${meta.home.short} is coming down to the wire`,
        body: `${periodLabel(row.p)}, ${clockLabel(row.c)} left. Press Menu to switch.`,
        lev,
        threshold,
        period: row.p,
        clock: row.c,
        lastPlayTs: row.ts ?? null,
        ...(this.scores ? {score: `${row.a}-${row.h}`} : {}),
      };
      this.onCue(cue);
    } else if (!g.armed && lev < threshold * REARM_FRACTION) g.armed = true;
    const out = {ms, gameId, period: row.p, clock: row.c, secs, lev, threshold, espnWp: row.w, reason, cueId: cue?.id ?? ''};
    this.onDecision(out);
    return out;
  }
}
