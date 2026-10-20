// Household policy: a base leverage threshold, a per team and hour offset learned from
// accept and dismiss, a nightly cap, and a quiet period after repeated dismissals.
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export const DEFAULTS = {base: 0.3, cap: 2, acceptStep: 0.03, dismissStep: 0.05, min: 0.15, max: 0.6, quietAfter: 3, quietWindowMs: 3600e3};

/** The night a moment belongs to: US Eastern date, with the day rolling over at 5 am so late games stay in the same night. */
export const nightOf = ms => new Date(ms - 5 * 3600e3).toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
export const hourOf = ms => Number(new Date(ms).toLocaleString('en-US', {timeZone: 'America/New_York', hour: 'numeric', hour12: false})) % 24;

export class Household {
  constructor(opts = {}, file) {
    this.o = {...DEFAULTS, ...opts};
    this.file = file;
    this.offset = {}; // `${team}:${hour}` -> threshold shift
    this.cues = {}; // night -> count
    this.dismissals = []; // ms
    this.quietNight = null;
    this.events = []; // {ms, cueId, team, hour, action}
    if (file && existsSync(file)) Object.assign(this, JSON.parse(readFileSync(file, 'utf8')));
  }
  save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), {recursive: true});
    const {offset, cues, dismissals, quietNight, events} = this;
    writeFileSync(this.file, JSON.stringify({offset, cues, dismissals, quietNight, events}));
  }
  threshold(team, ms) {
    const off = this.offset[`${team}:${hourOf(ms)}`] ?? 0;
    return Math.min(this.o.max, Math.max(this.o.min, this.o.base + off));
  }
  cuesTonight(ms) {
    return this.cues[nightOf(ms)] ?? 0;
  }
  isQuiet(ms) {
    return this.quietNight === nightOf(ms);
  }
  recordCue(ms) {
    const n = nightOf(ms);
    this.cues[n] = (this.cues[n] ?? 0) + 1;
    this.save();
  }
  /** Accept lowers that team and hour's threshold, dismiss raises it; three dismissals in an hour silence the night. */
  feedback({cueId, team, ms, action}) {
    const key = `${team}:${hourOf(ms)}`;
    const step = action === 'accept' ? -this.o.acceptStep : this.o.dismissStep;
    const next = (this.offset[key] ?? 0) + step;
    this.offset[key] = Math.min(this.o.max - this.o.base, Math.max(this.o.min - this.o.base, next));
    this.events.push({ms, cueId, team, hour: hourOf(ms), action});
    if (action === 'dismiss') {
      this.dismissals = this.dismissals.filter(t => ms - t <= this.o.quietWindowMs);
      this.dismissals.push(ms);
      if (this.dismissals.length >= this.o.quietAfter) this.quietNight = nightOf(ms);
    }
    this.save();
  }
}
