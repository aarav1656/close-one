# Clutch for Fire TV (Vega OS)

One quiet toast over whatever the household is watching, only when a game they follow turns into a one possession finish. No score in it. The TV learns how often this household wants to be interrupted.

In the 632 games from Jan 15 on, Clutch cues 0.48 times per game against 0.71 for the usual "within 5 points in the last 5 minutes" rule, 32% fewer interruptions, and stays silent in 68% of games. At the same cue budget with two minutes left to switch, it reaches 97 of the 104 games decided late where the best simple rule reaches 93. The bar was chosen on the 603 games before that date and the learning keeps every cue a household wanted while sending 25% fewer it dismissed (`server/eval/results.json`, `npm run test:eval`).

A React Native for Vega app (RN 0.83, Vega SDK 0.24) with a background service that holds a WebSocket and raises a system toast over the app on screen. It runs on the Vega Virtual Device (VVD).

| Part | Path | What it is |
|---|---|---|
| Vega app | `app/` | Interactive component `com.clutch.tv.main`: team picker, game list, cue card, learning bar, server settings. Service `com.clutch.tv.cue.service` |
| Cue server | `server/` | Per household teams, thresholds and nightly cap; device token auth; ESPN ingest; season replay eval |
| Toast spike | `spikes/toast/` | Cue server, run script, latency CSVs and device logs for 20 sends over a foreground app |
| Scripts | `scripts/` | VVD boot, dev shell with retry, D-pad driver, video sample build, server address switch |
| Evidence | `evidence/` | VVD screens and focus logs, live night logs, the demo toast capture, season results |
| Friction log | `FRICTION.md` | Install and build friction with exact error text |

## Households

A TV pairs with the server on first launch (`POST /api/pair`) and gets a device token. The server keeps only its hash. Every other endpoint and the cue socket need that token, and a household sees only its own teams, cues and learning (`server/lib/hub.mjs`, `server/lib/api.mjs`).

- A new household follows nobody and receives no cue until the TV picks teams (`PUT /api/follow`, 30 NBA teams in `server/lib/teams.mjs`).
- Feedback is accepted only for the household's own cues that are still open. An unknown id, another household's id, an expired cue (90 s) and an already answered cue are each refused (`404`, `404`, `410`, `409`).
- Tokens last 180 days and renew while in use. The cue socket opens with a `hello` frame carrying the token and closes with code 4401 without one.
- Pairing is limited to 20 per minute per address.

`server/test/hub.test.mjs` exercises all of it over real HTTP and WebSocket connections. `server/test/mutate.mjs` breaks 19 guards one at a time (token expiry, cross household lookup, expiry window, answer-twice, team list check, socket hello, pairing limit and more) and requires the tests to turn red each time.

## Opt-in and the household's own switches

Nothing is sent before the TV opts in. First launch walks three steps: pick teams, choose quiet hours, then Turn cues on, the only press that starts cues (`app/src/App.tsx`, `server/lib/household.mjs`). After that, every switch is one press:

- **Off switch.** Settings turns every cue off, from every game, until it is turned back on.
- **Pause tonight.** One button on Home silences every cue until the 5 am rollover, or until Resume.
- **Quiet hours.** Never a cue between the chosen hours, in the household's own time zone, across midnight too.
- **Teams.** Only games with a followed team in them can cue.

The server checks these before the decision function runs (`gate()` in `server/lib/household.mjs`) and `server/test/hub.test.mjs` exercises each one, including that a followed team on a tight game stays silent until the household has opted in.

## The app

| Screen | What it shows | Evidence |
|---|---|---|
| Team picker | 30 teams on a D-pad grid, selected teams filled in amber, saved to the household | `evidence/vvd-r2/team-picker.png` |
| Setup | Teams, quiet hours, Turn cues on: three steps before the first cue | `evidence/vvd-r3/setup-quiet-hours.png`, `evidence/vvd-r3/setup-turn-cues-on.png` |
| Home | Games of the teams you follow with a pressure meter, interruptions left tonight, the learning bar, Pause tonight | `evidence/vvd-r2/home-game-pressure.png` |
| Same game, two rules | One finished game on its own clock: the pressure on every possession, every alert the simple rule would have sent against the one Clutch sent, and the reason for each | `evidence/vvd-r3/same-game-two-rules.png` |
| After the game | What Clutch did in the game that just ended: cues sent, watched, not now, and where the bar moved | `evidence/vvd-r3/post-game-summary.png` |
| Settings | Cues on or off, pause tonight, quiet hours, teams, server address | `evidence/vvd-r3/settings.png` |
| Learning bar | The household's bar on a 0 to 60 scale, where it started, and every cue tonight as a marker: green circle watched, coral diamond not now, ring waiting | `evidence/vvd-r2/learning-bar-dismissed-marker.png` |
| Cue card | Watch, Not now, and Why this cue?: the pressure on the next possession against the household's bar, the cues left tonight, and the reason in plain words, with no score | `evidence/vvd-r3/why-this-cue.png` |
| Quiet tonight | Three Not nows within an hour silence the night; a moon panel says so | `app/src/screens/Home.tsx`, `app/test/App.spec.tsx` |
| Connection lost | Names the server and the retry count, keeps the last update visible | `evidence/vvd-r2/connection-lost.png` |
| Feed behind, no games tonight, loading | Each has its own copy and the next tip-off when there is one | `app/src/status.ts`, `app/src/screens/Home.tsx` |
| Server | The address the household's server answers on, editable with a D-pad focusable field | `evidence/vvd-r2/server-settings-input-focused.png` |

Every control is reachable by D-pad, and each screen has exactly one first-focus target. The VVD focus log is `evidence/vvd-r2/dpad-focus-log.txt`; `app/test/App.spec.tsx` asserts the same per screen.

`app/clutch.config.json` holds the server address a build starts with and `scripts/set-server.sh https://host` rewrites it. A household changes it in Settings, which pairs the TV again.

## Prerequisites (macOS, Apple Silicon)

```bash
brew install binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh -o /tmp/get_vvm.sh   # read it, then:
NONINTERACTIVE=true /bin/bash /tmp/get_vvm.sh
source ~/vega/env
vega --version        # Active SDK Version: 0.24.12112
```

## Build

```bash
cd app
npm install
npm run typecheck && npm test   # 41 tests
npm run mutate                  # 21 breaks of the app's guards, each must turn jest red
npm run build:debug             # build/aarch64-debug/clutch-vega_aarch64.vpkg
```

Projects under `~/Desktop`, `~/Documents` or `~/Downloads` need a macOS Files and Folders (or Full Disk Access) grant for `watchman`. Without it, set `resolver: {useWatchman: false}` in `app/metro.config.js` and run jest with `--no-watchman`.

## Run on the Vega Virtual Device

```bash
scripts/vvd-up.sh                         # boots the VVD detached, waits for it
cd server && npm install && node live.mjs &
cd ../app
vega device install-app -b Debug --dir .  # installs com.clutch.tv
vega device launch-app --appName com.clutch.tv.main
scripts/dpad.sh KEY_RIGHT KEY_DOWN KEY_ENTER   # presses keys, prints the focus events the app logged
```

D-pad on the VVD: arrow keys, Enter is select, Esc is back, F1 is home. From a script, `vega exec vda shell "inputd-cli button_press KEY_RIGHT"` (developer mode is on when `vsm developer-mode` prints `developer-mode: enable`).

## Demo day

```bash
scripts/vvd-up.sh && scripts/fetch-video-sample.sh   # once
scripts/demo-vvd.sh
```

The video sample comes to the front, Clutch's service connects with its device token, one finished game (Bucks at Hawks, `server/showcase/401809247.json`) is driven through the real decision and the cue travels the authenticated socket. A title plays in the video sample, and the script exits 0 only when two frames two seconds apart differ (the picture is moving), the service acked the frame and the post, the system notification renderer claimed the screen 0 to 3000 ms after the send, and a frame with the toast over the playing video was saved: `evidence/demo/toast-over-video-*.png`. The TV clock is mapped onto the server's by a ping round trip, so `evidence/demo/timing-*.json` carries the send to receive, post and render times of the cue (2 ms, 38 ms and 177 ms in the committed run, `evidence/demo/timing-20261021-131633.json`). The toast is two short text lines with an Open Clutch action.

## Toast over another app

The app starts its service by URI on every launch (`app/src/App.tsx`: `Linking.openURL('pkg://com.clutch.tv.cue.service')`). The service (`app/src/headless/CueService.ts`) reads the device token and server address the app stored, opens the WebSocket, sends `hello`, and posts a `MenuToastRenderTemplate` toast for every cue frame (`app/src/notify/toast.ts`). The icon is the Clutch mark the server hosts at `/assets/clutch-icon.png` (`server/assets/clutch-icon.png`).

```bash
scripts/fetch-video-sample.sh                       # builds and installs vega-video-sample (foreground app)
cd spikes/toast && npm install
./run.sh template 20 12000 template                 # 20 cues, 12 s apart, valid channel name
./run.sh bad 20 12000 bad                           # same, channel name that is not a render template
python3 analyze.py latencies-template.csv devlog-template.raw   # committed copies are devlog-*.txt (filtered lines)
```

`run.sh` launches Clutch, brings the video sample to the front, then the server sends the cues. Each row of `latencies-<tag>.csv` has the send time, the device clock offset (ping/pong midpoint), send to receive, send to `post()` returned, and send to render. A toast counts as rendered when the system notification renderer claims input priority (`SYSTEMUI_PRIORITY`) within 3 s of the send. With the template name 20 of 20 sends rendered, median 50 ms, p95 75 ms (`spikes/toast/latencies-template.csv`); with a channel name that is not a render template 0 of 20 did (`spikes/toast/latencies-bad.csv`).

## The cue engine (server/)

A Node server reads ESPN's NBA play-by-play every 10 s per live game, turns the score margin and clock into the win probability at stake on the next possession (leverage), and sends a cue to a household's service only when that crosses that household's threshold. The toast carries no score.

- `lib/model.mjs`: win probability, leverage and `decide()`, the single decision function.
- `lib/household.mjs`: per team and hour threshold that moves on accept (down 0.03) and dismiss (up 0.05), a nightly cap (default 2), and a quiet night after 3 dismissals in an hour. State is saved per household under `data/households/`.
- `lib/hub.mjs`, `lib/api.mjs`: households, tokens, followed teams, cue ownership and the HTTP and WebSocket surface.
- `live.mjs`: ESPN polling, pushes cues to each household's devices, CSV logs in `logs/` (`decisions`, `cues`, `feedback`, `toasts`, `finals`, each with the household id). A cue nobody answers within 30 s counts as a dismissal.
- The app opens on the cue card when the toast's Menu button brings it forward. Watch sends accept and opens the live pressure view. Not now sends dismiss.

```bash
cd server && npm install
npm test                              # unit, HTTP and season tests, then 51 mutations that must each turn them red
node live.mjs                         # live games for every paired household
node live.mjs --demo                  # adds loopback-only calls that drive the finished showcase game (used by scripts/demo-vvd.sh)
node live.mjs --replay 401809238 --speed 12 --skip 0.85   # a cached game through the same pipeline
node eval/fetch-season.mjs 20251021 20260413   # caches the season's play-by-play in data/games/
npm run eval                          # recomputes every figure below into eval/results.json
npm run test:eval                     # asserts 1,235 games, 257 late-decided, the cue and recall figures
```

### Live night

`evidence/live-2026-10-20/` holds the decisions, cues, feedback and toast logs from the first NBA night (76ers at Knicks: two cues in the 4th quarter, toast posted 80 ms and 36 ms after each cue).

### Games from Jan 15 on, with the bar chosen on the games before

`server/lib/budget.mjs` splits the season by date. The bar is picked on the 603 games before 2026-01-15 only: the one with the fewest cues per game that still reaches every late-decided game the within-5-in-5 rule reaches there. It lands on 0.30, the bar the app ships with. Everything below is scored on the 632 games from 2026-01-15 on (104 decided late).

| Games from Jan 15 on | Clutch | "within 5 in the last 5 minutes" |
|---|---|---|
| Cues per game | 0.48 (silent in 431 of 632 games) | 0.71 |
| Late-decided games reached with 30 s or more left | 100 of 104 | 102 of 104 |

Equal budget: at the cue budget Clutch spends, the best within-m-points-in-the-last-t-minutes rule is chosen on the early games and both are scored on the later ones, by how much time the household has left to switch.

| Time left to switch | Clutch, late-decided games reached | Best simple rule at the same budget | Same comparison on the early games |
|---|---|---|---|
| 2 minutes | 97 of 104 | 93 (within 3 in the last 3 minutes) | 138 against 132 of 153 |
| 2.5 minutes | 88 of 104 | 80 (within 3 in the last 3 minutes) | 130 against 115 of 153 |

`server/eval/results.json` holds the same table for 30, 60 and 90 seconds.

### Learning, on identical games

`server/lib/ablation.mjs` replays the 155 nights of a household that follows six teams and accepts a cue only when the Knicks are playing, once with a fixed bar and once with the accept and dismiss learning, through the production engine and household. The fixed bar sends 173 cues, 40 accepted and 133 dismissed. The learning sends 157, 57 accepted and 100 dismissed: 33 fewer dismissed interruptions (25%) and 17 more cues the household wanted.

### Season replay (1,235 completed 2025-26 regular season games)

The games are ESPN's play-by-play for every completed 2025-26 regular season game, fetched by `server/eval/fetch-season.mjs` and cached locally. `server/lib/season.mjs` evaluates them, `npm run eval` prints the headline and rewrites `server/eval/results.json`, and `server/test/season.test.mjs` recomputes everything from the cache and requires the committed results to match it. The win probability is a closed form random walk approximation (`server/lib/model.mjs`), checked against ESPN's per-play probability below.

A household watches every game with nothing learned and a cap of 2 per game. A game counts as decided late when it was within 3 points with 60 s left in its last period, had a lead change in that minute, or went to overtime (257 games). It is caught when a cue lands in the 4th quarter or overtime with at least 30 s left.

| | Clutch model | "within 5 in the last 5 minutes" |
|---|---|---|
| Cues per game | 0.56 (silent in 63% of games) | 0.81 |
| Late-decided games caught | 98.4% | 99.2% |
| Share of cues sent in late-decided games | 58.9% | 48.0% |
| Cues in the 171 games decided by 25 or more | 0 | 0 |

Controls: the same number of cues at random plays catches 31.5% of late-decided games. The same model on shuffled margins sends 1.89 cues per game, 21.8% of them in late-decided games, and 282 cues in blowouts. Our win probability differs from ESPN's per-play probability by 0.075 on average over 595,022 plays. Threshold sweep (cues per game, recall): 0.20 gives 0.88 and 85.2%, 0.25 gives 0.66 and 98.8%, 0.30 gives 0.56 and 98.4%, 0.35 gives 0.46 and 94.9%, 0.40 gives 0.40 and 94.6%, 0.50 gives 0.29 and 83.3%. `server/eval/results.json` holds every figure.

## License

MIT. See `LICENSE`.
