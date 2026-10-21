// Feeds game states through the cue decision for one household and keeps the per game arming.
import {secsLeft, leverage, decide, REARM_FRACTION} from './model.mjs';
import {nick} from './teams.mjs';

const ordinal = n => ['', '1st', '2nd', '3rd', '4th'][n] ?? `OT${n - 4}`;
export const periodLabel = p => (p <= 4 ? `${ordinal(p)} quarter` : p === 5 ? 'overtime' : `${p - 4}OT`);
const clockLabel = c => `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}`;

const points = x => Math.round(x * 100);

/** The leverage reason in plain words. Never carries the score: it says how close, not who leads. */
export function whyNow({period, clock, lev, threshold, base, cuesLeft}) {
  const parts = [
    `${periodLabel(period)}, ${clockLabel(clock)} left, and the game is close enough that the next possession can move the win chance by ${points(lev)} points.`,
    `Your bar is ${points(threshold)}, so Clutch spoke up.`,
  ];
  if (points(threshold) !== points(base)) parts.push(`It started at ${points(base)} and has moved with how you answered earlier cues.`);
  parts.push(cuesLeft > 0 ? `${cuesLeft} more interruption${cuesLeft === 1 ? '' : 's'} allowed tonight.` : 'That was the last interruption allowed tonight.');
  return parts.join(' ');
}

export class Engine {
  /**
   * @param household Household instance
   * @param follow Set of followed team abbreviations, read live so the picker takes effect at once. Empty means no cues.
   * @param newId () => a cue id that is unique across households
   * @param hooks {onCue(cue), onDecision(row)}
   */
  constructor({household, follow = new Set(), newId, onCue = () => {}, onDecision = () => {}, scores = false}) {
    this.h = household;
    this.follow = follow;
    this.newId = newId ?? (() => this.nextId++);
    this.onCue = onCue;
    this.onDecision = onDecision;
    this.scores = scores;
    this.games = new Map();
    this.nextId = 1;
  }

  /** The followed team of a game, or null when the household follows neither side. */
  followed(meta) {
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
      const id = this.newId();
      cue = {
        id,
        gameId,
        team: team.abbr,
        ms,
        title: `${nick(meta.away)} at ${nick(meta.home)} is coming down to the wire`,
        body: `${periodLabel(row.p)}, ${clockLabel(row.c)} left. Press Menu to open Clutch.`,
        lev,
        threshold,
        period: row.p,
        clock: row.c,
        lastPlayTs: row.ts ?? null,
        why: whyNow({period: row.p, clock: row.c, lev, threshold, base: this.h.o.base, cuesLeft: this.h.o.cap - this.h.cuesTonight(ms) - 1}),
        ...(this.scores ? {score: `${row.a}-${row.h}`} : {}),
      };
      this.h.recordCue(ms, {cueId: id, team: team.abbr, lev, threshold, period: row.p, clock: row.c});
      this.onCue(cue);
    } else if (!g.armed && lev < threshold * REARM_FRACTION) g.armed = true;
    const out = {ms, gameId, period: row.p, clock: row.c, secs, lev, threshold, espnWp: row.w, reason, cueId: cue?.id ?? ''};
    this.onDecision(out);
    return out;
  }
}
