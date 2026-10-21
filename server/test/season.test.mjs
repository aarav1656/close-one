// Recomputes the headline from the cached games and holds it to the committed results.json.
// Needs the cache (node eval/fetch-season.mjs 20251021 20260413): without it this fails, it never skips.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadGames, runEval} from '../lib/season.mjs';

const games = loadGames();
const out = runEval(games);
const last = out.sets['last season (2025-26)'];
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('the sample is the 1,235 completed 2025-26 regular season games, 257 of them decided late', () => {
  assert.equal(last.games, 1235);
  assert.equal(last.lateGames, 257);
  assert.equal(last.blowouts, 171);
});

test('the headline figures: cues per game, silence, recall, where the cues land, blowouts', () => {
  assert.equal(last.modelCuesPerGame.toFixed(2), '0.56');
  assert.equal((100 * last.modelSilentShare).toFixed(1), '63.0');
  assert.equal((100 * last.modelRecall).toFixed(1), '98.4');
  assert.equal((100 * last.ruleRecall).toFixed(1), '99.2');
  assert.equal(last.ruleCuesPerGame.toFixed(2), '0.81');
  assert.equal((100 * last.modelCuesInLateGames).toFixed(1), '58.9');
  assert.equal((100 * last.ruleCuesInLateGames).toFixed(1), '48.0');
  assert.equal(last.blowoutModelCues, 0);
  assert.equal(last.maxModelCuesInAGame, 2);
});

test('the controls: random plays at the same budget and shuffled margins do worse than the model', () => {
  assert.equal((100 * last.randomRecall).toFixed(1), '31.5');
  assert.equal(last.shuffledCuesPerGame.toFixed(2), '1.89');
  assert.equal(last.shuffledBlowoutCues, 282);
  assert.ok(last.shuffledCuesInLateGames < last.modelCuesInLateGames / 2);
});

test('every figure in the committed results.json is what the cache recomputes', () => {
  const committed = JSON.parse(readFileSync(new URL('../eval/results.json', import.meta.url), 'utf8'));
  const walk = (a, b, path) => {
    if (a && typeof a === 'object') {
      assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `keys at ${path}`);
      for (const k of Object.keys(a)) walk(a[k], b[k], `${path}.${k}`);
    } else if (typeof a === 'number' && Number.isNaN(a)) assert.equal(b, null, path); // JSON writes NaN as null
    else if (typeof a === 'number') near(a, b, path);
    else assert.deepEqual(a, b, path);
  };
  walk(out, committed, 'results');
});

test('an empty cache is an error, not a pass', () => {
  assert.throws(() => loadGames('/nonexistent-clutch-cache/'));
});
