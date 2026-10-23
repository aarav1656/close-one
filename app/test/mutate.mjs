// Break the app's guards one at a time, confirm jest goes red each time, restore, confirm green.
import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const mutations = [
  // file, name, from, to
  ['src/status.ts', 'stale feed never flagged', 'age === null || age > STALE_MS', 'age === null'],
  ['src/status.ts', 'offline never flagged', 'if (failures > 0) {', 'if (false) {'],
  ['src/screens/Home.tsx', 'first game loses first focus', '<GameRow key={g.id} g={g} preferred={i === 0}', '<GameRow key={g.id} g={g} preferred={false}'],
  ['src/screens/Home.tsx', 'quiet panel never shown', ') : quiet ? (', ') : false ? ('],
  ['src/screens/Home.tsx', 'no-teams prompt never shown', ') : noTeams ? (', ') : false ? ('],
  ['src/screens/Home.tsx', 'no-games copy removed', "games.length === 0 ? 'No live games right now'", "games.length === 0 ? 'No data'"],
  ['src/screens/TeamPicker.tsx', 'pick cannot be undone', 'p.includes(abbr) ? p.filter(a => a !== abbr) : [...p, abbr]', '[...p, abbr]'],
  ['src/screens/TeamPicker.tsx', 'save failure hidden', 'setSaveFailed(true);', ''],
  ['src/screens/CueCard.tsx', 'why panel never opens', '{why ? (', '{false ? ('],
  ['src/screens/CueCard.tsx', 'why button loses its label', "why ? 'Hide reason' : 'Why this cue?'", "'Why this cue?'"],
  ['src/ui/LearningBar.tsx', 'accepted cue labelled as dismissed', "a === 'accept' ? 'Watched'", "a === 'accept' ? 'Not now'"],
  ['src/ui/LearningBar.tsx', 'bar tick ignores the learned threshold', '<View style={[styles.barTick, {left: space(x(learning.threshold))}]} />', '<View style={[styles.barTick, {left: space(x(learning.base))}]} />'],
  ['src/api.ts', 'concurrent calls pair twice', 'pairing ??= ', 'pairing = '],
  ['src/api.ts', '401 keeps the dead token', 'if (res.status === 401) {', 'if (false) {'],
  ['src/api.ts', 'token not sent', "authorization: `Bearer ${await ensureToken()}`", "authorization: ''"],
  ['src/config.ts', 'port range unchecked', '(port < 1 || port > 65535)', 'false'],
  ['src/session.ts', 'new server keeps old token', 'await AsyncStorage.removeItem(TOKEN_KEY);\n  }\n  await AsyncStorage.setItem', '}\n  await AsyncStorage.setItem'],
  ['src/notify/toast.ts', 'toast icon is a third party favicon', "serverUrl.startsWith('https:') ? `${serverUrl}/assets/clutch-icon.png` : ICON_HTTPS", "'https://www.amazon.com/favicon.ico'"],
  ['src/notify/toast.ts', 'cleartext icon passed to renderer', "serverUrl.startsWith('https:') ? `${serverUrl}/assets/clutch-icon.png` : ICON_HTTPS", '`${serverUrl}/assets/clutch-icon.png`'],
  ['src/App.tsx', 'setup never offered', 'if (!s.settings.onboarded && !onboardingOffered.current) {', 'if (false) {'],
  ['src/App.tsx', 'Turn cues on does not opt in', 'onboarded: true, enabled: true, quiet: draftQuiet', 'onboarded: false, enabled: true, quiet: draftQuiet'],
  ['src/screens/Home.tsx', 'pause button never says resume', "state?.settings.paused ? 'Resume tonight' : 'Pause tonight'", "'Pause tonight'"],
  ['src/screens/Home.tsx', 'cues-off panel never shown', "silence === 'off' || silence === 'paused' || silence === 'quiet_hours' ? (", 'false ? ('],
  ['src/screens/Home.tsx', 'quiet game summarised as cues', 's.cues === 0', 'false'],
  ['src/screens/Showcase.tsx', 'alerts not in game order', '.sort((p, q) => p.a.t - q.a.t)', '.sort((p, q) => q.a.t - p.a.t)'],
  ['src/screens/Showcase.tsx', 'focus does not reveal the reason', 'onFocus={() => setPick({kind: e.kind, index: e.index})}', 'onFocus={() => undefined}'],
  ['src/ui/Timeline.tsx', 'columns never bright over the bar', 'lev >= data.bar ? styles.over : styles.under', 'styles.under'],
  ['src/quiet.ts', 'wrong quiet hours preset', '{label: \'10 pm to 7 am\', quiet: {from: 22, to: 7}}', '{label: \'10 pm to 7 am\', quiet: {from: 21, to: 7}}'],
  ['src/screens/Settings.tsx', 'off switch label never flips', "settings.enabled ? 'Turn cues off' : 'Turn cues on'", "'Turn cues off'"],
  ['src/ui/WhyBar.tsx', 'cues left never shown', "cuesLeft > 0 ? `${cuesLeft} of ${cap} cues left tonight after this one.` : `That was the last of ${cap} cues tonight.`", "''"],
  ['src/ui/WhyBar.tsx', 'bar shown at the starting value', 'style={[styles.barTick, {left: space(x(threshold))}]}', 'style={[styles.barTick, {left: space(x(0.3))}]}'],
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
