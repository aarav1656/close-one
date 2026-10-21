// Held-back evaluation and the equal-budget comparison.
//
// The rule is tuned on games before TUNE_BEFORE only; every figure reported as the result comes from the
// games on or after that date. A late-decided game counts as caught when a cue lands in the 4th quarter or
// overtime with at least `lead` seconds left, so the same games can be scored for how much time the household
// has to switch.
import {rows, modelCues, ruleCues, decidedLate} from './replay.mjs';
import {DEFAULTS} from './household.mjs';

export const TUNE_BEFORE = '20260115';
export const SEASON_END = '20260601';
export const LEADS = [30, 60, 90, 120, 150];
export const TUNE_BASES = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];

const caught = (cues, lead) => cues.some(c => c.p >= 4 && c.secs >= lead);

/** Season games split by date: those the rule may be tuned on, and those it is reported on. */
export function split(all) {
  const season = all.filter(g => g.date < SEASON_END);
  return {tune: season.filter(g => g.date < TUNE_BEFORE), report: season.filter(g => g.date >= TUNE_BEFORE)};
}

/** A within-`margin`-points-in-the-last-`minutes` alert, edge triggered like the baseline. */
export function simpleCues(rs, margin, minutes) {
  const out = [];
  let inside = false;
  for (const r of rs) {
    const holds = r.p >= 4 && r.secs <= minutes * 60 && Math.abs(r.m) <= margin && r.secs >= 30;
    if (holds && !inside) out.push(r);
    inside = holds;
  }
  return out;
}

/** Per game: the rows, whether it was decided late, and the cues of each rule, computed once. */
export function prepare(games) {
  return games.map(g => {
    const rs = rows(g);
    return {rs, late: decidedLate(rs), rule: ruleCues(rs), simple: new Map(), model: new Map()};
  });
}

export const modelOf = (g, base) => (g.model.has(base) ? g.model.get(base) : (g.model.set(base, modelCues(g.rs, {base})), g.model.get(base)));
const simpleOf = (g, m, t) => {
  const k = `${m}/${t}`;
  return g.simple.has(k) ? g.simple.get(k) : (g.simple.set(k, simpleCues(g.rs, m, t)), g.simple.get(k));
};

/** Caught late-decided games, how many there were, and cues per game, for any cue function. */
export function score(prepared, cuesOf, lead = 30) {
  let late = 0;
  let hit = 0;
  let cues = 0;
  for (const g of prepared) {
    const c = cuesOf(g);
    cues += c.length;
    if (g.late) {
      late++;
      if (caught(c, lead)) hit++;
    }
  }
  return {games: prepared.length, late, caught: hit, recall: late ? hit / late : NaN, cuesPerGame: cues / prepared.length};
}

/**
 * Pre-registered selection: among the candidate bars, the one with the fewest cues per game on the tuning
 * games whose recall is at least the within-5-in-5 rule's there. Tuning games only.
 */
export function tuneBase(tuned) {
  const rule = score(tuned, g => g.rule);
  const ok = TUNE_BASES.map(base => ({base, ...score(tuned, g => modelOf(g, base))})).filter(r => r.recall >= rule.recall);
  if (!ok.length) throw new Error('no candidate bar keeps the baseline recall on the tuning games');
  ok.sort((a, b) => a.cuesPerGame - b.cuesPerGame);
  return {base: ok[0].base, tuning: ok[0], rule};
}

/**
 * Equal budget: at the cue budget Clutch spends, the best within-m-points-in-the-last-t-minutes rule, chosen on the
 * tuning games (most late-decided games caught, then fewest cues, never more cues than Clutch), scored on both halves.
 */
export function equalBudget(tuned, reported, lead) {
  const clutchTune = score(tuned, g => modelOf(g, DEFAULTS.base), lead);
  let best = null;
  for (let m = 1; m <= 12; m++) {
    for (let t = 1; t <= 10; t++) {
      const s = score(tuned, g => simpleOf(g, m, t), lead);
      if (s.cuesPerGame > clutchTune.cuesPerGame + 1e-9) continue;
      if (!best || s.recall > best.s.recall || (s.recall === best.s.recall && s.cuesPerGame < best.s.cuesPerGame)) best = {m, t, s};
    }
  }
  const pick = {margin: best.m, minutes: best.t};
  return {
    lead,
    rule: pick,
    tune: {clutch: clutchTune, simple: best.s},
    report: {
      clutch: score(reported, g => modelOf(g, DEFAULTS.base), lead),
      simple: score(reported, g => simpleOf(g, best.m, best.t), lead),
      baseline: score(reported, g => g.rule, lead),
    },
  };
}
