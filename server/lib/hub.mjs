// Households and their device tokens. Every household has its own followed teams, its own learned
// thresholds and nightly cap, its own cue ledger; a token pairs one TV to one household and nothing
// else can read or answer that household's cues.
import {createHash, randomBytes} from 'node:crypto';
import {readFileSync, writeFileSync, existsSync, mkdirSync, renameSync} from 'node:fs';
import {join} from 'node:path';
import {Household} from './household.mjs';
import {Engine} from './engine.mjs';
import {secsLeft, leverage} from './model.mjs';
import {TEAM_ABBRS} from './teams.mjs';

export const DAY = 86400e3;
const sha = t => createHash('sha256').update(t).digest('hex');

export class HubError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export class Hub {
  /**
   * @param dir where registry.json and households/<id>.json live; omit for an in-memory hub
   * @param now clock, injected so tests can move time
   * @param hooks onCue(rec, cue), onDecision(rec, row), onAnswer(rec, cue, action, source)
   */
  constructor({dir, now = Date.now, cap = 2, base = 0.3, tokenTtlMs = 180 * DAY, cueTtlMs = 90e3, autoDismissMs = 30e3, scores = false, onCue = () => {}, onDecision = () => {}, onAnswer = () => {}} = {}) {
    Object.assign(this, {dir, now, cap, base, tokenTtlMs, cueTtlMs, autoDismissMs, scores, onCue, onDecision, onAnswer});
    this.households = new Map(); // id -> rec
    this.byHash = new Map(); // sha256(token) -> {rec, tok}
    this.view = new Map(); // gameId -> display row, shared by every household
    this.upcoming = [];
    this.feed = {ok: false, updatedAt: 0, error: null};
    this.lastCueId = now();
    if (dir) mkdirSync(join(dir, 'households'), {recursive: true});
    const file = dir && join(dir, 'registry.json');
    if (file && existsSync(file)) for (const r of Object.values(JSON.parse(readFileSync(file, 'utf8')).households)) this.#adopt(r);
  }

  #adopt({id, created, follow, tokens}) {
    const household = new Household({cap: this.cap, base: this.base}, this.dir && join(this.dir, 'households', `${id}.json`));
    const rec = {id, created, tokens, follow: new Set(follow), household, cues: new Map(), devices: new Set(), active: null};
    rec.engine = new Engine({
      household,
      follow: rec.follow,
      scores: this.scores,
      newId: () => ++this.lastCueId,
      onCue: cue => this.#cued(rec, cue),
      onDecision: d => this.onDecision(rec, d),
    });
    this.households.set(id, rec);
    for (const tok of tokens) this.byHash.set(tok.hash, {rec, tok});
    return rec;
  }

  #save() {
    if (!this.dir) return;
    const households = {};
    for (const {id, created, tokens, follow} of this.households.values()) households[id] = {id, created, tokens, follow: [...follow]};
    const file = join(this.dir, 'registry.json');
    writeFileSync(`${file}.tmp`, JSON.stringify({households}));
    renameSync(`${file}.tmp`, file);
  }

  /** A new household and the token that proves a TV belongs to it. The token is shown once; only its hash is kept. */
  pair(name = '') {
    const now = this.now();
    const token = randomBytes(32).toString('base64url');
    const tok = {hash: sha(token), exp: now + this.tokenTtlMs, name: String(name).slice(0, 40)};
    const rec = this.#adopt({id: `hh_${randomBytes(6).toString('hex')}`, created: now, follow: [], tokens: [tok]});
    this.#save();
    return {token, householdId: rec.id, expiresAt: tok.exp};
  }

  /** The household a bearer token belongs to, or null when it is unknown or expired. A token in its second half of life is renewed on use. */
  auth(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    const hit = this.byHash.get(sha(token));
    if (!hit) return null;
    const now = this.now();
    if (hit.tok.exp <= now) return null;
    if (hit.tok.exp - now < this.tokenTtlMs / 2) {
      hit.tok.exp = now + this.tokenTtlMs;
      this.#save();
    }
    return hit.rec;
  }

  setFollow(rec, teams) {
    if (!Array.isArray(teams) || teams.length > TEAM_ABBRS.size || !teams.every(t => TEAM_ABBRS.has(t))) throw new HubError(400, 'bad_teams');
    rec.follow.clear();
    for (const t of teams) rec.follow.add(t);
    this.#save();
    return [...rec.follow];
  }

  #cued(rec, cue) {
    rec.cues.set(cue.id, {...cue, answered: false});
    rec.active = cue;
    this.onCue(rec, cue);
    setTimeout(() => {
      const c = rec.cues.get(cue.id);
      if (c && !c.answered) this.#resolve(rec, c, 'dismiss', 'timeout');
    }, this.autoDismissMs).unref();
  }

  #resolve(rec, c, action, source) {
    c.answered = true;
    rec.household.feedback({cueId: c.id, team: c.team, ms: c.ms, action});
    if (rec.active?.id === c.id) rec.active = null;
    this.onAnswer(rec, c, action, source);
  }

  /** Answers one of this household's own cues. Another household's id looks exactly like an unknown one. */
  answer(rec, cueId, action, source = 'app') {
    if (!['accept', 'dismiss'].includes(action)) throw new HubError(400, 'bad_action');
    if (!Number.isSafeInteger(cueId)) throw new HubError(400, 'bad_cue');
    const now = this.now();
    for (const [id, c] of rec.cues) if (now - c.ms > 60 * 60e3) rec.cues.delete(id);
    const c = rec.cues.get(cueId);
    if (!c) throw new HubError(404, 'unknown_cue');
    if (now - c.ms > this.cueTtlMs) throw new HubError(410, 'expired');
    if (c.answered) throw new HubError(409, 'already_answered');
    this.#resolve(rec, c, action, source);
    return true;
  }

  ingest(gameId, meta, row, ms) {
    for (const rec of this.households.values()) rec.engine.ingest(gameId, meta, {...row}, ms);
  }

  show(id, meta, row, status, ms = this.now()) {
    const secs = secsLeft(row.p, row.c);
    this.view.set(id, {
      id, at: ms, status, period: row.p, clock: row.c,
      home: meta.home.short, away: meta.away.short, homeAbbr: meta.home.abbr, awayAbbr: meta.away.abbr,
      label: `${meta.away.short} at ${meta.home.short}`,
      pressure: Number(Math.min(1, leverage(row.h - row.a, secs) / 0.6).toFixed(2)),
    });
  }

  markFinal(id, ms = this.now()) {
    const g = this.view.get(id);
    if (g && g.status !== 'final') this.view.set(id, {...g, status: 'final', at: ms});
  }

  feedOk(ms = this.now(), upcoming = this.upcoming) {
    this.feed = {ok: true, updatedAt: ms, error: null};
    this.upcoming = upcoming;
  }

  feedFailed(error) {
    this.feed = {...this.feed, ok: false, error: String(error)};
  }

  state(rec, now = this.now()) {
    const act = rec.active;
    const games = [...this.view.values()]
      .filter(g => now - g.at < (g.status === 'final' ? 2 * 3600e3 : 20 * 60e3))
      .map(({at, homeAbbr, awayAbbr, ...g}) => ({...g, followed: rec.follow.has(homeAbbr) || rec.follow.has(awayAbbr)}));
    const h = rec.household;
    const thresholds = [...rec.follow].map(t => h.threshold(t, now));
    return {
      active: act && now - act.ms < this.cueTtlMs ? this.#card(act) : null,
      tonight: {cues: h.cuesTonight(now), cap: h.o.cap, quiet: h.isQuiet(now)},
      follow: [...rec.follow],
      games,
      upcoming: this.upcoming,
      feed: {ok: this.feed.ok, ageMs: this.feed.updatedAt ? now - this.feed.updatedAt : null},
      learning: {
        base: h.o.base,
        min: h.o.min,
        max: h.o.max,
        threshold: thresholds.length ? Math.min(...thresholds) : h.o.base,
        cues: h.tonight(now).map(({cueId, team, lev, threshold, action, after, period, clock}) => ({cueId, team, lev, threshold, action, after, period, clock})),
      },
    };
  }

  #card(cue) {
    const v = this.view.get(cue.gameId);
    return {id: cue.id, gameId: cue.gameId, title: cue.title, body: cue.body, why: cue.why, home: v?.home, away: v?.away, ...(cue.score ? {score: cue.score} : {})};
  }
}
