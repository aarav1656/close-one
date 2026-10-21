import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compare, loadShowcase, elapsed} from '../lib/showcase.mjs';

const game = loadShowcase(new URL('../showcase/401809247.json', import.meta.url));
const c = compare(game);

test('Bucks at Hawks: the simple rule alerts three times, Clutch once, and each alert says why', () => {
  assert.equal(c.label, 'Bucks at Hawks');
  assert.deepEqual(c.rule.map(r => r.at), ['4th 4:02', '4th 3:17', '4th 2:47']);
  assert.deepEqual(c.clutch.map(r => r.at), ['4th 2:27']);
  for (const r of c.rule) assert.match(r.why, /^Within 5 points with under 5 minutes left\. Clutch waits: only \d+ points of win chance at stake, under the bar of 30\.$/);
  assert.match(c.clutch[0].why, /^The next possession can move the win chance by 48 points, over the bar of 30\. 3 simple alerts had already gone out\.$/);
  assert.match(c.summary, /^The simple rule alerts 3 times\. Clutch cues once, first at 4th 2:27 with 48 points/);
});

test('every alert Clutch holds back sits under the bar, the one it sends sits over it', () => {
  for (const r of c.rule) assert.ok(r.lev < c.bar, `${r.at}`);
  assert.ok(c.clutch[0].lev >= c.bar);
});

test('the timeline is 96 slices of the game and peaks where Clutch spoke', () => {
  assert.equal(c.series.length, 96);
  assert.equal(c.total, 2880);
  assert.ok(Math.max(...c.series.slice(0, 80)) < c.bar, 'nothing over the bar until the finish');
  assert.ok(Math.max(...c.series.slice(88)) >= c.bar);
  assert.equal(elapsed(4, 147), 2880 - 147);
  assert.equal(elapsed(5, 300), 2880);
  assert.equal(elapsed(6, 0), 2880 + 600);
});

test('a lower bar moves Clutch toward the simple rule: the comparison responds to the household bar', () => {
  const eager = compare(game, {base: 0.15});
  assert.ok(eager.clutch.length >= 1 && eager.clutch[0].t < c.clutch[0].t, 'cues earlier');
  assert.ok(eager.rule.some(r => r.verdict === 'cue'), 'at least one simple alert now coincides with a cue');
});

test('a game that never gets close gets no Clutch cue and no simple alert', () => {
  const blowout = {...game, plays: Array.from({length: 200}, (_, i) => ({p: 1 + Math.floor(i / 50), c: 720 - (i % 50) * 14, h: 120, a: 90}))};
  const b = compare(blowout);
  assert.equal(b.clutch.length, 0);
  assert.equal(b.rule.length, 0);
  assert.match(b.summary, /Clutch stays silent/);
});
