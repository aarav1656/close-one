// "Same game, two rules": one finished game replayed play by play through the simple rule
// ("within 5 in the last 5 minutes") and through Clutch's decision, every alert placed on the game clock
// with the one-line reason it fired or stayed quiet.
import {readFileSync} from 'node:fs';
import {secsLeft, leverage, decide, simpleRuleHolds, MIN_SECS_LEFT, REARM_FRACTION} from './model.mjs';
import {DEFAULTS} from './household.mjs';
import {nick} from './teams.mjs';

const BUCKETS = 96;
const REG_SECS = 2880;
const OT_SECS = 300;

const ord = p => (p <= 4 ? ['', '1st', '2nd', '3rd', '4th'][p] : p === 5 ? 'OT' : `${p - 4}OT`);
const clock = c => `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}`;
const points = x => Math.round(x * 100);

/** Seconds since tip-off, with overtime periods of five minutes. */
export const elapsed = (p, c) => (p <= 4 ? (p - 1) * 720 + (720 - c) : REG_SECS + (p - 5) * OT_SECS + (OT_SECS - c));

export function loadShowcase(file) {
  const g = JSON.parse(readFileSync(file, 'utf8'));
  return {...g, plays: g.plays.map(([p, c, h, a]) => ({p, c, h, a}))};
}

/**
 * @returns {{label, date, from, total, bar, series, ticks, rule, clutch, summary}} series is the pressure per slice of the window from `from` to the buzzer (the peak in each slice),
 * rule and clutch are the alerts each rule would have sent, each with the plain reason.
 */
export function compare(game, {base = DEFAULTS.base, cap = DEFAULTS.cap} = {}) {
  const rs = game.plays.map(r => ({...r, m: r.h - r.a, secs: secsLeft(r.p, r.c), t: elapsed(r.p, r.c), lev: leverage(r.h - r.a, secsLeft(r.p, r.c))}));

  const rule = [];
  const clutch = [];
  let armed = true;
  let inside = false;
  let sent = 0;
  for (const r of rs) {
    const verdict = decide({secs: r.secs, lev: r.lev, threshold: base, armed, cuesTonight: sent, cap, quiet: false});
    const holds = simpleRuleHolds(r.p, r.c, r.m) && r.secs >= MIN_SECS_LEFT;
    if (holds && !inside) {
      rule.push({
        t: r.t, at: `${ord(r.p)} ${clock(r.c)}`, lev: r.lev,
        verdict,
        why:
          verdict === 'cue'
            ? 'Within 5 points with under 5 minutes left. Clutch speaks up here too.'
            : `Within 5 points with under 5 minutes left. Clutch waits: ${QUIET[verdict](r.lev, base)}`,
      });
    }
    inside = holds;
    if (verdict === 'cue') {
      armed = false;
      sent++;
      clutch.push({
        t: r.t, at: `${ord(r.p)} ${clock(r.c)}`, lev: r.lev,
        why: `The next possession can move the win chance by ${points(r.lev)} points, over the bar of ${points(base)}. ${rule.length} simple alert${rule.length === 1 ? '' : 's'} had already gone out.`,
      });
    } else if (!armed && r.lev < base * REARM_FRACTION) armed = true;
  }
  // The chart shows the stretch where anything happens: from a minute-aligned point a minute before the first
  // alert of either rule to the final buzzer, so alerts seconds apart stay apart on screen.
  const total = Math.max(...rs.map(r => r.t));
  const alerts = [...rule, ...clutch].map(a => a.t);
  const from = alerts.length ? Math.max(0, Math.floor((Math.min(...alerts) - 60) / 60) * 60) : Math.max(0, total - 360);
  const series = Array.from({length: BUCKETS}, () => 0);
  for (const r of rs) {
    if (r.t < from) continue;
    const i = Math.min(BUCKETS - 1, Math.floor(((r.t - from) / (total - from)) * BUCKETS));
    series[i] = Math.max(series[i], r.lev);
  }
  const ticks = [];
  for (let t = from; t <= total; t += 60) {
    const p = t < REG_SECS ? Math.floor(t / 720) + 1 : 5 + Math.floor((t - REG_SECS) / OT_SECS);
    const c = t < REG_SECS ? 720 - (t % 720) : OT_SECS - ((t - REG_SECS) % OT_SECS);
    ticks.push({t, label: t === from ? `${ord(p)} ${clock(c === 720 ? 0 : c)}` : clock(c % (p <= 4 ? 720 : OT_SECS))});
  }
  const away = nick(game.away);
  const home = nick(game.home);
  return {
    label: `${away} at ${home}`,
    date: game.date,
    from,
    total,
    bar: base,
    series,
    ticks,
    rule,
    clutch,
    summary: `The simple rule alerts ${rule.length} time${rule.length === 1 ? '' : 's'}. ${
      clutch.length === 0 ? 'Clutch stays silent.' : `Clutch cues ${clutch.length === 1 ? 'once' : `${clutch.length} times`}, first at ${clutch[0].at} with ${points(clutch[0].lev)} points of win chance on the next possession.`
    }`,
  };
}

const QUIET = {
  below: (lev, base) => `only ${points(lev)} points of win chance at stake, under the bar of ${points(base)}.`,
  disarmed: () => 'it already cued for this stretch of the game.',
  capped: () => 'the nightly cap is spent.',
  too_late: () => `under ${MIN_SECS_LEFT} seconds left, too late to switch.`,
  quiet: () => 'the household asked for quiet.',
};
