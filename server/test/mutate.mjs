// Break the guards one at a time, confirm the tests go red each time, restore, confirm green.
import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const mutations = [
  // file, name, from, to
  ['lib/model.mjs', 'cap ignored', "if (cuesTonight >= cap) return 'capped';", ''],
  ['lib/model.mjs', 'threshold inverted', 'if (lev < threshold) return', 'if (lev > threshold) return'],
  ['lib/model.mjs', 'quiet ignored', "if (quiet) return 'quiet';", ''],
  ['lib/model.mjs', 'too-late guard off', 'if (secs < MIN_SECS_LEFT) return', 'if (false) return'],
  ['lib/model.mjs', 'no re-arm gate', "if (!armed) return 'disarmed';", ''],
  ['lib/model.mjs', 'leverage ignores time', 'const t = Math.max(secs - POSSESSION_SECS, 1);', 'const t = 1440;'],
  ['lib/engine.mjs', 'follows every game', 'return [meta.home, meta.away].find(t => this.follow.has(t.abbr)) ?? null;', 'return meta.home;'],
  ['lib/hub.mjs', 'token expiry ignored', 'if (hit.tok.exp <= now) return null;', ''],
  ['lib/hub.mjs', 'token never renewed', 'if (hit.tok.exp - now < this.tokenTtlMs / 2) {', 'if (false) {'],
  ['lib/hub.mjs', 'cue lookup crosses households', 'const c = rec.cues.get(cueId);', 'const c = [...this.households.values()].map(r => r.cues.get(cueId)).find(Boolean);'],
  ['lib/hub.mjs', 'unknown cue accepted', "if (!c) throw new HubError(404, 'unknown_cue');", ''],
  ['lib/hub.mjs', 'expired cue accepted', "if (now - c.ms > this.cueTtlMs) throw new HubError(410, 'expired');", ''],
  ['lib/hub.mjs', 'cue answered twice', "if (c.answered) throw new HubError(409, 'already_answered');", ''],
  ['lib/hub.mjs', 'team list unchecked', '|| !teams.every(t => TEAM_ABBRS.has(t))', ''],
  ['lib/api.mjs', 'http auth gate off', "if (!rec) throw new HubError(401, 'unauthorized');", ''],
  ['lib/api.mjs', 'socket hello unchecked', "if (!rec) return ws.close(4401, 'unauthorized');", ''],
  ['lib/api.mjs', 'pairing unlimited', 'if (recent.length >= pairsPerMinute) throw', 'if (false) throw'],
];
const tests = ['test/model.test.mjs', 'test/hub.test.mjs'];
// A mutant that hangs a test counts as caught: the suite has a per test timeout and the run a hard one.
const run = () => spawnSync('node', ['--test', '--test-timeout=15000', ...tests], {cwd: root, encoding: 'utf8', timeout: 90000}).status;
const originals = new Map();
let bad = 0;
const restore = () => { for (const [path, src] of originals) writeFileSync(path, src); };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { restore(); process.exit(130); });
try {
  console.log('baseline', run() === 0 ? 'green' : 'RED');
  for (const [file, name, from, to] of mutations) {
    const path = root + file;
    if (!originals.has(path)) originals.set(path, readFileSync(path, 'utf8'));
    const original = originals.get(path);
    if (!original.includes(from)) throw new Error(`mutation "${name}" no longer matches ${file}`);
    writeFileSync(path, original.replace(from, to));
    const red = run() !== 0;
    writeFileSync(path, original);
    console.log(`${name}: ${red ? 'red (caught)' : 'GREEN (missed)'}`);
    if (!red) bad++;
  }
} finally {
  restore();
}
console.log('restored', run() === 0 ? 'green' : 'RED');
process.exit(bad ? 1 : 0);
