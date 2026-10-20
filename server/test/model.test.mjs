import {test} from 'node:test';
import assert from 'node:assert/strict';
import {leverage, decide, simpleRuleHolds, homeWinProb, secsLeft} from '../lib/model.mjs';
import {modelCues, ruleCues} from '../lib/replay.mjs';
import {Household, nightOf} from '../lib/household.mjs';

// A synthetic game as cached rows: [period, clock secs, margin].
const game = spec => spec.map(([p, c, m]) => ({p, c, h: Math.max(m, 0) + 80, a: Math.max(-m, 0) + 80, m, secs: secsLeft(p, c)}));
const blowout = game(Array.from({length: 200}, (_, i) => [1 + Math.floor(i / 50), 720 - ((i % 50) * 14), 28]));
const finish = game([[1, 720, 0], [2, 300, 6], [3, 300, 9], [4, 600, 7], [4, 400, 6], [4, 240, 3], [4, 120, 2], [4, 60, 1], [4, 31, 1]]);
// five separate tight spikes in the last minutes, each separated by a calm stretch
const spiky = game([
  [4, 300, 1], [4, 280, 14], [4, 250, 1], [4, 230, 16], [4, 200, 0], [4, 180, 15], [4, 150, 1], [4, 130, 17], [4, 100, 0], [4, 80, 14], [4, 50, 0],
]);

test('leverage grows as time runs out and vanishes in a blowout', () => {
  assert.ok(leverage(0, 120) > leverage(0, 600));
  assert.ok(leverage(0, 600) > leverage(8, 600));
  assert.ok(leverage(28, 300) < 0.001);
});

test('win probability is symmetric and decided at the horn', () => {
  assert.equal(homeWinProb(0, 100).toFixed(3), '0.500');
  assert.equal(homeWinProb(3, 0), 1);
  assert.ok(homeWinProb(10, 300) > 0.98);
});

test('a blowout produces zero cues, the simple rule also stays silent', () => {
  assert.equal(modelCues(blowout).length, 0);
  assert.equal(ruleCues(blowout).length, 0);
});

test('a one possession finish produces exactly one cue before the last 30 seconds', () => {
  const cues = modelCues(finish);
  assert.equal(cues.length, 1);
  assert.ok(cues[0].secs >= 30);
});

test('the nightly cap holds at 2 even when the game keeps swinging back', () => {
  const cues = modelCues(spiky);
  assert.equal(cues.length, 2);
  assert.equal(modelCues(spiky, {cap: 1}).length, 1);
  assert.equal(modelCues(spiky, {cap: 5}).length > 2, true);
});

test('decide: order of reasons', () => {
  const ok = {secs: 200, lev: 0.5, threshold: 0.3, armed: true, cuesTonight: 0, cap: 2, quiet: false};
  assert.equal(decide(ok), 'cue');
  assert.equal(decide({...ok, secs: 20}), 'too_late');
  assert.equal(decide({...ok, quiet: true}), 'quiet');
  assert.equal(decide({...ok, lev: 0.1}), 'below');
  assert.equal(decide({...ok, armed: false}), 'disarmed');
  assert.equal(decide({...ok, cuesTonight: 2}), 'capped');
  assert.equal(decide({...ok, cuesTonight: 1}), 'cue');
});

test('simple rule window', () => {
  assert.equal(simpleRuleHolds(4, 200, 4), true);
  assert.equal(simpleRuleHolds(4, 200, 6), false);
  assert.equal(simpleRuleHolds(4, 400, 2), false);
  assert.equal(simpleRuleHolds(3, 100, 2), false);
});

test('household learning shifts the threshold and silences the night after three dismissals', () => {
  const h = new Household({base: 0.3});
  const t0 = Date.parse('2026-10-21T01:00:00Z');
  const base = h.threshold('NYK', t0);
  h.feedback({cueId: 1, team: 'NYK', ms: t0, action: 'dismiss'});
  assert.ok(h.threshold('NYK', t0) > base);
  assert.equal(h.threshold('BOS', t0), base, 'other teams untouched');
  h.feedback({cueId: 2, team: 'NYK', ms: t0 + 60e3, action: 'accept'});
  h.feedback({cueId: 3, team: 'NYK', ms: t0 + 120e3, action: 'accept'});
  assert.ok(h.threshold('NYK', t0) < base);
  assert.equal(h.isQuiet(t0 + 200e3), false);
  for (let i = 0; i < 3; i++) h.feedback({cueId: 10 + i, team: 'NYK', ms: t0 + 300e3 + i * 1000, action: 'dismiss'});
  assert.equal(h.isQuiet(t0 + 400e3), true);
  assert.equal(h.isQuiet(t0 + 24 * 3600e3), false, 'next night is clear');
});

test('a borderline spike stops firing after two dismissals', () => {
  const h = new Household({base: 0.3});
  const t = Date.parse('2026-10-21T01:00:00Z');
  const spike = {secs: 400, lev: 0.34, armed: true, cuesTonight: 0, cap: 2, quiet: false};
  assert.equal(decide({...spike, threshold: h.threshold('NYK', t)}), 'cue');
  h.feedback({cueId: 1, team: 'NYK', ms: t, action: 'dismiss'});
  h.feedback({cueId: 2, team: 'NYK', ms: t + 1000, action: 'dismiss'});
  assert.equal(decide({...spike, threshold: h.threshold('NYK', t)}), 'below');
});

test('cap counts per night, rolling over at 5 am Eastern', () => {
  const h = new Household();
  const t = Date.parse('2026-10-21T02:00:00Z'); // 10 pm ET on the 20th
  h.recordCue(t);
  h.recordCue(t + 3 * 3600e3); // 1 am ET, same night
  assert.equal(h.cuesTonight(t + 3 * 3600e3), 2);
  assert.equal(nightOf(t), nightOf(t + 3 * 3600e3));
  assert.equal(h.cuesTonight(t + 20 * 3600e3), 0);
});
