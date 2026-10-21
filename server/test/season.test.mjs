// Recomputes the headline from the cached games and holds it to the committed results.json.
// Needs the cache (node eval/fetch-season.mjs 20251021 20260413): without it this fails, it never skips.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadGames, runEval} from '../lib/season.mjs';
import {split, prepare, tuneBase, TUNE_BEFORE} from '../lib/budget.mjs';
import {DEFAULTS} from '../lib/household.mjs';

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

const hb = out.heldBack;

test('the split is by date: 603 games before 2026-01-15 to tune on, 632 from that date on to report on, none in both', () => {
  const {tune, report} = split(games);
  assert.equal(TUNE_BEFORE, '20260115');
  assert.equal(tune.length, 603);
  assert.equal(report.length, 632);
  assert.ok(tune.every(g => g.date < '20260115') && report.every(g => g.date >= '20260115'));
  assert.equal(new Set([...tune, ...report].map(g => g.id)).size, 1235);
});

test('the bar chosen on the early games alone is the shipped default of 30', () => {
  const {tune} = split(games);
  const chosen = tuneBase(prepare(tune));
  assert.equal(chosen.base, DEFAULTS.base);
  assert.equal(chosen.tuning.caught, 153);
  assert.equal(chosen.rule.caught, 153);
  assert.equal(hb.tunedBase, 0.3);
});

test('games from Jan 15 on: Clutch 0.48 cues per game against 0.71, silent in 431 of 632, 100 of 104 late-decided caught against 102', () => {
  assert.equal(hb.report.clutch.games, 632);
  assert.equal(hb.report.clutch.late, 104);
  assert.equal(hb.report.clutch.caught, 100);
  assert.equal(hb.report.baseline.caught, 102);
  assert.equal(hb.report.clutch.cuesPerGame.toFixed(2), '0.48');
  assert.equal(hb.report.baseline.cuesPerGame.toFixed(2), '0.71');
  assert.equal(hb.report.clutch.silentGames, 431);
  assert.ok(hb.report.clutch.cuesPerGame < 0.7 * hb.report.baseline.cuesPerGame, 'at least 30% fewer cues');
});

test('equal budget with two minutes to switch: Clutch catches 97 of 104, the best simple rule tuned on the early games 93', () => {
  const at = lead => hb.equalBudget.find(e => e.lead === lead);
  assert.deepEqual(at(120).rule, {margin: 3, minutes: 3});
  assert.equal(at(120).report.clutch.caught, 97);
  assert.equal(at(120).report.simple.caught, 93);
  assert.equal(at(150).report.clutch.caught, 88);
  assert.equal(at(150).report.simple.caught, 80);
  assert.equal(at(120).tune.clutch.caught, 138);
  assert.equal(at(120).tune.simple.caught, 132);
  for (const e of hb.equalBudget) {
    assert.ok(e.tune.simple.cuesPerGame <= e.tune.clutch.cuesPerGame + 1e-9, `lead ${e.lead}: the rule never spends more than Clutch on the games it was tuned on`);
  }
});

test('the whole lead-time table is in the results, losses included', () => {
  assert.deepEqual(hb.equalBudget.map(e => e.lead), [30, 60, 90, 120, 150]);
  const short = hb.equalBudget.find(e => e.lead === 30);
  assert.ok(short.report.simple.caught >= short.report.clutch.caught, 'with only 30 s left a last-minute rule keeps up: printed, not hidden');
});

test('learning ablation on identical games: a household that accepts only Knicks cues gets 33 fewer dismissed interruptions and 17 more accepted ones', () => {
  const l = out.learning;
  assert.equal(l.script.own, 'NY');
  assert.equal(l.nights, 155);
  assert.deepEqual(l.fixed, {cues: 173, accepted: 40, dismissed: 133, quietNights: 0});
  assert.deepEqual(l.adaptive, {cues: 157, accepted: 57, dismissed: 100, quietNights: 0});
  assert.equal(l.dismissalsSaved, 33);
  assert.equal((100 * l.dismissalsSavedShare).toFixed(1), '24.8');
  assert.ok(l.acceptsKept >= 1, 'learning keeps every cue the household wanted');
});
