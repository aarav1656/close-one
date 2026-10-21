// Household policy: a base leverage threshold, a per team and hour offset learned from
// accept and dismiss, a nightly cap, a quiet period after repeated dismissals, and the household's own
// switches: opt-in, an off switch, quiet hours and a pause for tonight.
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export const DEFAULTS = {base: 0.3, cap: 2, acceptStep: 0.03, dismissStep: 0.05, min: 0.15, max: 0.6, quietAfter: 3, quietWindowMs: 3600e3};

/** The night a moment belongs to: US Eastern date, with the day rolling over at 5 am so late games stay in the same night. */
const memo = f => {
  const seen = new Map(); // Eastern time has whole hour offsets, so one answer per UTC hour holds for the hour
  return ms => {
    const k = Math.floor(ms / 3600e3);
    if (!seen.has(k)) seen.set(k, f(ms));
    return seen.get(k);
  };
};
export const nightOf = memo(ms => new Date(ms - 5 * 3600e3).toLocaleDateString('en-CA', {timeZone: 'America/New_York'}));
export const hourOf = memo(ms => Number(new Date(ms).toLocaleString('en-US', {timeZone: 'America/New_York', hour: 'numeric', hour12: false})) % 24);

export const DEFAULT_SETTINGS = {onboarded: false, enabled: true, quiet: null, offsetMin: 0, pausedNight: null};

/** The household's local hour of the day, from the minutes the TV's clock is offset from UTC. */
export const localHour = (ms, offsetMin) => Math.floor((((ms / 60000 + offsetMin) % 1440) + 1440) % 1440 / 60);

export class Household {
  constructor(opts = {}, file) {
    this.o = {...DEFAULTS, ...opts};
    this.file = file;
    this.offset = {}; // `${team}:${hour}` -> threshold shift
    this.cues = {}; // night -> count
    this.dismissals = []; // ms
    this.quietNight = null;
    this.events = []; // {ms, cueId, team, hour, action}
    this.settings = {...DEFAULT_SETTINGS};
    this.log = []; // one row per cue sent: {cueId, ms, team, lev, threshold, period, clock, action, after}
    if (file && existsSync(file)) Object.assign(this, JSON.parse(readFileSync(file, 'utf8')));
  }
  save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), {recursive: true});
    const {offset, cues, dismissals, quietNight, events, log, settings} = this;
    writeFileSync(this.file, JSON.stringify({offset, cues, dismissals, quietNight, events, settings, log: log.slice(-200)}));
  }
  threshold(team, ms) {
    const off = this.offset[`${team}:${hourOf(ms)}`] ?? 0;
    return Math.min(this.o.max, Math.max(this.o.min, this.o.base + off));
  }
  /** Why no cue may be sent right now by the household's own choice, or null. Opt-in comes first: nothing is sent before the TV turns cues on. */
  gate(ms) {
    const s = this.settings;
    if (!s.onboarded) return 'not_onboarded';
    if (!s.enabled) return 'off';
    if (s.pausedNight === nightOf(ms)) return 'paused';
    if (s.quiet) {
      const h = localHour(ms, s.offsetMin);
      const {from, to} = s.quiet;
      if (from === to ? false : from < to ? h >= from && h < to : h >= from || h < to) return 'quiet_hours';
    }
    return null;
  }
  isPaused(ms) {
    return this.settings.pausedNight === nightOf(ms);
  }
  cuesTonight(ms) {
    return this.cues[nightOf(ms)] ?? 0;
  }
  isQuiet(ms) {
    return this.quietNight === nightOf(ms);
  }
  /** Counts a cue against tonight's cap. `info` ({cueId, team, lev, threshold, period, clock}) adds it to the visible log. */
  recordCue(ms, info) {
    const n = nightOf(ms);
    this.cues[n] = (this.cues[n] ?? 0) + 1;
    if (info) this.log.push({...info, ms, action: null, after: null});
    this.save();
  }
  /** Tonight's cues with how each was answered (action null while it is still waiting). */
  tonight(ms) {
    const n = nightOf(ms);
    return this.log.filter(r => nightOf(r.ms) === n);
  }
  /** Accept lowers that team and hour's threshold, dismiss raises it; three dismissals in an hour silence the night. */
  feedback({cueId, team, ms, action}) {
    const key = `${team}:${hourOf(ms)}`;
    const step = action === 'accept' ? -this.o.acceptStep : this.o.dismissStep;
    const next = (this.offset[key] ?? 0) + step;
    this.offset[key] = Math.min(this.o.max - this.o.base, Math.max(this.o.min - this.o.base, next));
    this.events.push({ms, cueId, team, hour: hourOf(ms), action});
    const row = this.log.find(r => r.cueId === cueId);
    if (row) {
      row.action = action;
      row.after = this.threshold(team, ms);
    }
    if (action === 'dismiss') {
      this.dismissals = this.dismissals.filter(t => ms - t <= this.o.quietWindowMs);
      this.dismissals.push(ms);
      if (this.dismissals.length >= this.o.quietAfter) this.quietNight = nightOf(ms);
    }
    this.save();
  }
}
