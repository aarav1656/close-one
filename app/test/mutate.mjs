// Break the app's guards one at a time, confirm jest goes red each time, restore, confirm green.
import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const mutations = [
  // file, name, from, to
  ['src/status.ts', 'stale feed never flagged', 'age === null || age > STALE_MS', 'age === null'],
  ['src/status.ts', 'offline never flagged', 'if (failures > 0) {', 'if (false) {'],
  ['src/screens/Home.tsx', 'first game loses first focus', '<GameRow key={g.id} g={g} preferred={i === 0}', '<GameRow key={g.id} g={g} preferred={false}'],
  ['src/screens/Home.tsx', 'quiet panel never shown', '{quiet ? (', '{false ? ('],
  ['src/screens/Home.tsx', 'no-teams prompt never shown', ') : noTeams ? (', ') : false ? ('],
  ['src/screens/Home.tsx', 'no-games copy removed', "games.length === 0 ? 'No live games right now'", "games.length === 0 ? 'No data'"],
  ['src/screens/TeamPicker.tsx', 'pick cannot be undone', 'p.includes(abbr) ? p.filter(a => a !== abbr) : [...p, abbr]', '[...p, abbr]'],
  ['src/screens/TeamPicker.tsx', 'save failure hidden', 'setSaveFailed(true);', ''],
  ['src/screens/CueCard.tsx', 'why panel never opens', '{why ? (', '{false ? ('],
  ['src/screens/CueCard.tsx', 'why button loses its label', "why ? 'Hide reason' : 'Why now?'", "'Why now?'"],
  ['src/ui/LearningBar.tsx', 'accepted cue labelled as dismissed', "a === 'accept' ? 'Watched'", "a === 'accept' ? 'Not now'"],
  ['src/ui/LearningBar.tsx', 'bar tick ignores the learned threshold', '<View style={[styles.barTick, {left: space(x(learning.threshold))}]} />', '<View style={[styles.barTick, {left: space(x(learning.base))}]} />'],
  ['src/App.tsx', 'picker never offered', 'if (s.follow.length === 0 && !pickerSeen.current) {', 'if (false) {'],
  ['src/api.ts', 'concurrent calls pair twice', 'pairing ??= ', 'pairing = '],
  ['src/api.ts', '401 keeps the dead token', 'if (res.status === 401) {', 'if (false) {'],
  ['src/api.ts', 'token not sent', "authorization: `Bearer ${await ensureToken()}`", "authorization: ''"],
  ['src/config.ts', 'port range unchecked', '(port < 1 || port > 65535)', 'false'],
  ['src/session.ts', 'new server keeps old token', 'await AsyncStorage.removeItem(TOKEN_KEY);\n  }\n  await AsyncStorage.setItem', '}\n  await AsyncStorage.setItem'],
  ['src/notify/toast.ts', 'toast icon is a third party favicon', '`${serverUrl}/assets/clutch-icon.png`', "'https://www.amazon.com/favicon.ico'"],
  ['src/headless/CueService.ts', 'hello without token', "send({type: 'hello', token, deviceMs: Date.now()});", "send({type: 'hello', deviceMs: Date.now()});"],
  ['src/headless/CueService.ts', 'no retry after close', 'later();\n  };\n}', '};\n}'],
];
const run = () => spawnSync('npx', ['jest', '--ci', '--watchAll=false', '--forceExit', '--silent'], {cwd: root, encoding: 'utf8', timeout: 180000}).status;
const originals = new Map();
const restore = () => { for (const [path, src] of originals) writeFileSync(path, src); };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { restore(); process.exit(130); });
let bad = 0;
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
