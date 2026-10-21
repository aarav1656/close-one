// The season evaluation: Clutch's decision function against the simple "within 5 in the last 5 minutes"
// rule over every cached completed game, with controls. Pure: games in, figures out.
import {readdirSync, readFileSync} from 'node:fs';
import {rows, modelCues, ruleCues, decidedLate, finalMargin} from './replay.mjs';
import {homeWinProb} from './model.mjs';
import {ablate} from './ablation.mjs';
import {split, prepare, tuneBase, equalBudget, modelOf, score, LEADS, TUNE_BEFORE} from './budget.mjs';

export const GAMES_DIR = new URL('../data/games/', import.meta.url).pathname;
export const SEASON_SPLIT = '20260601';
export const BASES = [0.2, 0.25, 0.3, 0.35, 0.4, 0.5];

/** Every cached game (see eval/fetch-season.mjs). Throws when the cache is empty: an empty cache evaluates nothing. */
export function loadGames(dir = GAMES_DIR) {
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!files.length) throw new Error(`no cached games in ${dir}; run: node eval/fetch-season.mjs 20251021 20260413`);
  return files.map(f => JSON.parse(readFileSync(dir + f, 'utf8')));
}

// deterministic PRNG so the controls reproduce
let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const shuffled = a => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = a => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

// A late-decided game is caught when a cue lands in the 4th quarter or overtime with at least 30
// seconds left: early enough to switch over and still see how it ends.
const inTime = cues => cues.some(c => c.p >= 4 && c.secs >= 30);

function evaluate(games, base) {
  const per = games.map(g => {
    const rs = rows(g);
    const late = decidedLate(rs);
    const m = modelCues(rs, {base});
    const r = ruleCues(rs);
    // control 1: same number of cues as the model, at random plays (not in the last 30 s)
    const eligible = rs.filter(x => x.secs >= 30);
    const rnd = Array.from({length: m.length}, () => eligible[Math.floor(rand() * eligible.length)]);
    // control 2: model on the same plays with margins shuffled in order (breaks the leverage curve)
    const sh = shuffled(rs.map(x => x.m));
    const mShuf = modelCues(rs.map((x, i) => ({...x, m: sh[i]})), {base});
    return {late, margin: finalMargin(rs), m: m.length, r: r.length, rnd: rnd.length, mShuf: mShuf.length,
      mHit: inTime(m), rHit: inTime(r), rndHit: inTime(rnd), mShufHit: inTime(mShuf)};
  });
  const lateGames = per.filter(x => x.late);
  const recall = f => (lateGames.length ? lateGames.filter(f).length / lateGames.length : NaN);
  const blow = per.filter(x => x.margin >= 25);
  return {
    games: per.length,
    lateGames: lateGames.length,
    modelCuesPerGame: mean(per.map(x => x.m)),
    ruleCuesPerGame: mean(per.map(x => x.r)),
    modelMedian: median(per.map(x => x.m)),
    ruleMedian: median(per.map(x => x.r)),
    modelSilentShare: per.filter(x => x.m === 0).length / per.length,
    modelRecall: recall(x => x.mHit),
    ruleRecall: recall(x => x.rHit),
    modelCuesInLateGames: lateGames.reduce((t, x) => t + x.m, 0) / Math.max(1, per.reduce((t, x) => t + x.m, 0)),
    ruleCuesInLateGames: lateGames.reduce((t, x) => t + x.r, 0) / Math.max(1, per.reduce((t, x) => t + x.r, 0)),
    randomRecall: recall(x => x.rndHit),
    shuffledRecall: recall(x => x.mShufHit),
    shuffledCuesPerGame: mean(per.map(x => x.mShuf)),
    shuffledCuesInLateGames: lateGames.reduce((t, x) => t + x.mShuf, 0) / Math.max(1, per.reduce((t, x) => t + x.mShuf, 0)),
    shuffledBlowoutCues: blow.reduce((t, x) => t + x.mShuf, 0),
    blowouts: blow.length,
    blowoutModelCues: blow.reduce((s, x) => s + x.m, 0),
    blowoutRuleCues: blow.reduce((s, x) => s + x.r, 0),
    maxModelCuesInAGame: Math.max(...per.map(x => x.m)),
  };
}

/** The whole evaluation as one object; the same games always give the same figures. */
export function runEval(all) {
  seed = 12345;
  const sets = {
    'last season (2025-26)': all.filter(g => g.date < SEASON_SPLIT),
    'this season (2026-27)': all.filter(g => g.date >= SEASON_SPLIT),
    all,
  };
  // ESPN win probability cross-check on the games with it
  let n = 0, ae = 0;
  for (const g of all) for (const r of rows(g)) if (r.w !== null && r.secs > 0) {
    ae += Math.abs(homeWinProb(r.m, r.secs) - r.w);
    n++;
  }
  const out = {generatedFrom: all.length, espnWpMeanAbsError: n ? ae / n : null, espnWpRows: n, sets: {}, sensitivity: {}};
  for (const [name, g] of Object.entries(sets)) if (g.length) out.sets[name] = evaluate(g, 0.3);
  for (const b of BASES) out.sensitivity[b] = evaluate(all, b);
  out.heldBack = heldBack(all);
  out.learning = ablate(all.filter(g => g.date < SEASON_SPLIT));
  return out;
}

/**
 * The result a reader should trust most: the bar is chosen on games before TUNE_BEFORE, and Clutch, the
 * within-5-in-5 baseline and the equal-budget rule are all scored on the games from that date on.
 */
function heldBack(all) {
  const {tune, report} = split(all);
  const T = prepare(tune);
  const R = prepare(report);
  const tuned = tuneBase(T);
  const clutchReport = score(R, g => modelOf(g, tuned.base), 30);
  return {
    from: TUNE_BEFORE,
    tuneGames: tune.length,
    reportGames: report.length,
    tunedBase: tuned.base,
    tuning: {clutch: tuned.tuning, baseline: tuned.rule},
    report: {
      clutch: {...clutchReport, silentGames: R.filter(g => modelOf(g, tuned.base).length === 0).length},
      baseline: score(R, g => g.rule, 30),
    },
    equalBudget: LEADS.map(lead => equalBudget(T, R, lead)),
  };
}
