// Win probability and leverage from score margin and time left, and the cue decision.
//
// Win probability of the leader: Phi(margin / (SIGMA * sqrt(secsLeft))), the Stern
// random-walk approximation (std of the final margin is about 13.5 points over a
// full 48 minute game). Leverage is the win probability at stake on the next
// possession: the swing between the leader being 2 points ahead and 2 points
// behind after one possession (14 s) has been played.

export const GAME_SECS = 2880;
export const SIGMA = 13.5;
export const POSSESSION_SECS = 14;
export const MIN_SECS_LEFT = 30;
export const REARM_FRACTION = 0.7;

/** Seconds left in regulation, or in the overtime period (clock counts down from 5:00). */
export const secsLeft = (period, clock) => (period <= 4 ? (4 - period) * 720 + clock : clock);

const erf = x => {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
};
export const phi = z => 0.5 * (1 + erf(z / Math.SQRT2));

/** Home win probability. Own model; ESPN's per-play probability is only a cross-check. */
export function homeWinProb(margin, secs) {
  if (secs <= 0) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  return phi(margin / (SIGMA * Math.sqrt(secs / GAME_SECS)));
}

/** Win probability at stake on the next possession, 0 to 1. */
export function leverage(margin, secs) {
  const t = Math.max(secs - POSSESSION_SECS, 1);
  const s = SIGMA * Math.sqrt(t / GAME_SECS);
  const m = Math.abs(margin);
  return phi((m + 2) / s) - phi((m - 2) / s);
}

/**
 * Whether to send a cue now. Order matters: a quiet household or a spent budget
 * must beat a high leverage, and a game that has not calmed since the last cue
 * (armed false) does not cue twice for the same stretch.
 */
export function decide({secs, lev, threshold, armed, cuesTonight, cap, quiet}) {
  if (secs < MIN_SECS_LEFT) return 'too_late';
  if (quiet) return 'quiet';
  if (lev < threshold) return 'below';
  if (!armed) return 'disarmed';
  if (cuesTonight >= cap) return 'capped';
  return 'cue';
}

/** The baseline every alert product ships: within 5 points in the last 5 minutes of the 4th or overtime. */
export const simpleRuleHolds = (period, clock, margin) => period >= 4 && secsLeft(period, clock) <= 300 && Math.abs(margin) <= 5;
