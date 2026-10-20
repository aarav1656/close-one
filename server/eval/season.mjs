// Replay every cached completed game: cues per game and recall of late-decided games,
// Clutch model versus the simple "within 5 in the last 5 minutes" rule, with controls.
//   node eval/season.mjs
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {rows, modelCues, ruleCues, decidedLate, finalMargin} from '../lib/replay.mjs';
import {homeWinProb, leverage, decide} from '../lib/model.mjs';

const dir = new URL('../data/games/', import.meta.url).pathname;
const all = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(dir + f, 'utf8')));
const SEASON_SPLIT = '20260601';
const sets = {
  'last season (2025-26)': all.filter(g => g.date < SEASON_SPLIT),
  'this season (2026-27)': all.filter(g => g.date >= SEASON_SPLIT),
};
sets['all'] = all;

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
const pct = x => `${(100 * x).toFixed(1)}%`;

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

// ESPN win probability cross-check on the games with it
let n = 0, ae = 0;
for (const g of all) for (const r of rows(g)) if (r.w !== null && r.secs > 0) {
  ae += Math.abs(homeWinProb(r.m, r.secs) - r.w);
  n++;
}

const out = {generatedFrom: all.length, espnWpMeanAbsError: n ? ae / n : null, espnWpRows: n, sets: {}, sensitivity: {}};
for (const [name, g] of Object.entries(sets)) if (g.length) out.sets[name] = evaluate(g, 0.3);
for (const b of [0.2, 0.25, 0.3, 0.35, 0.4, 0.5]) out.sensitivity[b] = evaluate(all, b);
writeFileSync(new URL('results.json', import.meta.url), JSON.stringify(out, null, 2));

for (const [name, r] of Object.entries(out.sets)) {
  console.log(`\n${name}: ${r.games} games, ${r.lateGames} decided late`);
  console.log(`  cues per game  model ${r.modelCuesPerGame.toFixed(2)} (median ${r.modelMedian}, silent in ${pct(r.modelSilentShare)})   rule ${r.ruleCuesPerGame.toFixed(2)} (median ${r.ruleMedian})`);
  console.log(`  recall of late-decided games  model ${pct(r.modelRecall)}   rule ${pct(r.ruleRecall)}   random same budget ${pct(r.randomRecall)}   shuffled-order model ${pct(r.shuffledRecall)}`);
  console.log(`  share of cues sent in late-decided games  model ${pct(r.modelCuesInLateGames)}   rule ${pct(r.ruleCuesInLateGames)}`);
  console.log(`  control, same model on shuffled margins: ${r.shuffledCuesPerGame.toFixed(2)} cues/game, ${pct(r.shuffledCuesInLateGames)} of them in late-decided games, ${r.shuffledBlowoutCues} cues in blowouts`);
  console.log(`  blowouts (final margin >= 25): ${r.blowouts} games, model cues ${r.blowoutModelCues}, rule cues ${r.blowoutRuleCues}; max model cues in a game ${r.maxModelCuesInAGame}`);
}
console.log(`\nESPN win probability vs our model: mean abs error ${(out.espnWpMeanAbsError ?? NaN).toFixed(3)} over ${out.espnWpRows} plays`);
console.log('\nthreshold sensitivity (all games): base, cues/game, recall');
for (const [b, r] of Object.entries(out.sensitivity)) console.log(`  ${b}  ${r.modelCuesPerGame.toFixed(2)}  ${pct(r.modelRecall)}`);
