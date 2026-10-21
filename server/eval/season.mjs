// Recompute the headline from the cached games and write eval/results.json.
//   node eval/season.mjs        (npm run eval)
import {writeFileSync} from 'node:fs';
import {loadGames, runEval} from '../lib/season.mjs';

const pct = x => `${(100 * x).toFixed(1)}%`;
const out = runEval(loadGames());
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
