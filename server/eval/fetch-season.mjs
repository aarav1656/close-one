// Pull completed regular-season games and cache compact timelines in data/games/<id>.json.
//   node eval/fetch-season.mjs 20251021 20260413     (last season)
//   node eval/fetch-season.mjs 20261020 <today>      (this season)
import {mkdirSync, existsSync, writeFileSync} from 'node:fs';
import {scoreboard, summary, timeline, teams} from '../lib/espn.mjs';

const [from, to] = process.argv.slice(2);
const dir = new URL('../data/games/', import.meta.url).pathname;
mkdirSync(dir, {recursive: true});

const parse = s => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
const fmt = d => d.toISOString().slice(0, 10).replaceAll('-', '');
const ids = [];
for (let d = parse(from); d <= parse(to); d = new Date(d.getTime() + 864e5)) {
  const sb = await scoreboard(fmt(d));
  for (const e of sb.events) {
    if (e.season?.type === 2 && e.status.type.completed && !existsSync(`${dir}${e.id}.json`)) ids.push({id: e.id, date: fmt(d)});
  }
  process.stdout.write(`\r${fmt(d)} queued=${ids.length}`);
}
console.log();
let done = 0, bad = 0;
const queue = [...ids];
await Promise.all(Array.from({length: 8}, async () => {
  while (queue.length) {
    const {id, date} = queue.pop();
    try {
      const s = await summary(id);
      const t = timeline(s);
      const tm = teams(s);
      if (t.length < 100) throw new Error(`only ${t.length} plays`);
      writeFileSync(`${dir}${id}.json`, JSON.stringify({id, date, ...tm, plays: t}));
    } catch (e) {
      bad++;
      console.error(`\n${id} ${e.message}`);
    }
    done++;
    if (done % 25 === 0) process.stdout.write(`\r${done}/${ids.length} bad=${bad}`);
  }
}));
console.log(`\ndone ${done} bad ${bad}`);
