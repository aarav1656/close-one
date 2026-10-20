// Run the cue policy and the simple rule over one cached game, play by play.
import {secsLeft, leverage, decide, simpleRuleHolds, REARM_FRACTION, MIN_SECS_LEFT} from './model.mjs';
import {DEFAULTS} from './household.mjs';

/** Rows of a cached game with margin (home minus away) and seconds left. */
export const rows = game => game.plays.map(r => ({...r, m: r.h - r.a, secs: secsLeft(r.p, r.c)}));

/** The model with a fresh household and nothing learned: cap per game, no quiet, fixed threshold. */
export function modelCues(rs, {base = DEFAULTS.base, cap = DEFAULTS.cap} = {}) {
  const out = [];
  let armed = true;
  for (const r of rs) {
    const lev = leverage(r.m, r.secs);
    const d = decide({secs: r.secs, lev, threshold: base, armed, cuesTonight: out.length, cap, quiet: false});
    if (d === 'cue') {
      out.push({...r, lev});
      armed = false;
    } else if (!armed && lev < base * REARM_FRACTION) armed = true;
  }
  return out;
}

/** Edge triggered simple rule: one alert each time the game enters the window. */
export function ruleCues(rs) {
  const out = [];
  let inside = false;
  for (const r of rs) {
    const holds = simpleRuleHolds(r.p, r.c, r.m) && r.secs >= MIN_SECS_LEFT;
    if (holds && !inside) out.push(r);
    inside = holds;
  }
  return out;
}

/**
 * Games decided late: within one possession (3) with 60 s left in the last period, or a lead
 * change inside that minute, or an overtime game.
 */
export function decidedLate(rs) {
  const last = rs[rs.length - 1].p;
  if (last >= 5) return true;
  const tail = rs.filter(r => r.p === last && r.c <= 60);
  if (!tail.length) return false;
  if (Math.abs(tail[0].m) <= 3) return true;
  const sg = Math.sign(tail[0].m);
  return tail.some(r => Math.sign(r.m) !== sg && r.m !== 0);
}

export const finalMargin = rs => Math.abs(rs[rs.length - 1].m);
