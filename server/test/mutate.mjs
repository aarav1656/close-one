// Break the decision function in several ways, confirm the tests go red each time, restore, confirm green.
import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const file = new URL('../lib/model.mjs', import.meta.url).pathname;
const original = readFileSync(file, 'utf8');
const mutations = [
  ['cap ignored', "if (cuesTonight >= cap) return 'capped';", ''],
  ['threshold inverted', 'if (lev < threshold) return', 'if (lev > threshold) return'],
  ['quiet ignored', "if (quiet) return 'quiet';", ''],
  ['too-late guard off', 'if (secs < MIN_SECS_LEFT) return', 'if (false) return'],
  ['no re-arm gate', "if (!armed) return 'disarmed';", ''],
  ['leverage ignores time', 'const t = Math.max(secs - POSSESSION_SECS, 1);', 'const t = 1440;'],
];
const run = () => spawnSync('node', ['--test', 'test/model.test.mjs'], {cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8'}).status;
let bad = 0;
try {
  console.log('baseline', run() === 0 ? 'green' : 'RED');
  for (const [name, from, to] of mutations) {
    if (!original.includes(from)) throw new Error(`mutation "${name}" no longer matches the source`);
    writeFileSync(file, original.replace(from, to));
    const red = run() !== 0;
    console.log(`${name}: ${red ? 'red (caught)' : 'GREEN (missed)'}`);
    if (!red) bad++;
  }
} finally {
  writeFileSync(file, original);
}
console.log('restored', run() === 0 ? 'green' : 'RED');
process.exit(bad ? 1 : 0);
