# Clutch for Fire TV (Vega OS)

A React Native for Vega app (RN 0.83, Vega SDK 0.24) with a background service that holds a WebSocket and raises a system toast over whatever app is on screen. It runs on the Vega Virtual Device (VVD) and is the base for the Clutch cue product (see `../docs/tracks/firetv.md`).

| Part | Path | What it is |
|---|---|---|
| Vega app | `app/` | Interactive component `com.clutch.tv.main` with D-pad focus tiles, plus the service `com.clutch.tv.cue.service` |
| Toast spike | `spikes/toast/` | Cue server, run script, latency CSVs and device logs for 20 sends over a foreground app |
| Scripts | `scripts/` | VVD boot, dev shell with retry, D-pad demo, video sample build |
| Friction log | `FRICTION.md` | Install and build friction with exact error text |

The app started from `AmazonAppDev/react-native-multi-tv-helloworld` (Vega package, RN 0.83, the same SDK 0.24 line as the SDK installed here). The foreground app for the toast spike is `AmazonAppDev/vega-video-sample`, built unmodified by `scripts/fetch-video-sample.sh`.

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
npm run typecheck && npm test
npm run build:debug   # build/aarch64-debug/clutch-vega_aarch64.vpkg
```

Projects under `~/Desktop`, `~/Documents` or `~/Downloads` need a macOS Files and Folders (or Full Disk Access) grant for `watchman`, otherwise the build prints `Waiting for Watchman` forever. Without the grant, set `resolver: {useWatchman: false}` in `app/metro.config.js` and run jest with `--no-watchman`.

## Run on the Vega Virtual Device

```bash
scripts/vvd-up.sh                         # boots the VVD detached, waits for it
cd app
vega device install-app -b Debug --dir .  # installs com.clutch.tv
vega device launch-app --appName com.clutch.tv.main
vega device running-apps | grep clutch    # com.clutch.tv.main
```

D-pad on the VVD: arrow keys, Enter is select, Esc is back, F1 is home. From a script, `vega exec vda shell "inputd-cli button_press KEY_RIGHT"` (developer mode is on when `vsm developer-mode` prints `developer-mode: enable`). `scripts/dpad-demo.sh` presses right, right, left, right, right, right and prints the focus events the app logged:

```
CLUTCH_FOCUS games
CLUTCH_FOCUS service
CLUTCH_FOCUS games
CLUTCH_FOCUS service
CLUTCH_FOCUS about
```

(`evidence/dpad-focus-log.txt`)

## Toast over another app

The app starts its service by URI on every launch (`src/App.tsx`: `Linking.openURL('pkg://com.clutch.tv.cue.service')`). The service (`src/headless/CueService.ts`) connects to `ws://10.0.2.2:38787` (the Mac, from inside the VVD) and posts a `MenuToastRenderTemplate` toast for every cue frame (`src/notify/toast.ts`).

```bash
scripts/fetch-video-sample.sh                       # builds and installs vega-video-sample (foreground app)
cd spikes/toast && npm install
./run.sh template 20 12000 template                 # 20 cues, 12 s apart, valid channel name
./run.sh bad 20 12000 bad                           # same, channel name that is not a render template
python3 analyze.py latencies-template.csv devlog-template.raw   # committed copies are devlog-*.txt (filtered lines)
```

`run.sh` launches Clutch, brings the video sample to the front, then the server sends the cues. Each row of `latencies-<tag>.csv` has the send time, the device clock offset (ping/pong midpoint), send to receive, send to `post()` returned, and send to render. A toast counts as rendered when the system notification renderer claims input priority (`SYSTEMUI_PRIORITY`) within 3 s of the send.

## The cue engine (server/)

A Node server reads ESPN's NBA play-by-play every 10 s per live game, turns the score margin and clock into the win probability at stake on the next possession (leverage), and sends a cue to the Vega service only when that crosses the household's threshold. The toast carries no score.

- `lib/model.mjs`: win probability, leverage and `decide()`, the single decision function.
- `lib/household.mjs`: per team and hour threshold that moves on accept (down 0.03) and dismiss (up 0.05), a nightly cap (default 2), and a quiet night after 3 dismissals in an hour. State is saved to `data/household.json`.
- `live.mjs`: ESPN polling, WebSocket push to the service, `/api/state` and `/api/feedback` for the app, CSV logs in `logs/` (`decisions`, `cues`, `feedback`, `toasts`, `finals`). A cue nobody answers within 30 s counts as a dismissal.
- The app opens on the game card when the toast's Menu button brings it forward. Watch sends accept and opens the live pressure view. Not now sends dismiss.

```bash
cd server && npm install
npm test                              # unit tests, then 6 mutations of decide() that must each turn them red
node live.mjs --follow all            # live games; --follow NYK,SA to pick teams, --scores to show scores
node live.mjs --replay 401809250 --speed 12 --skip 0.82   # a cached game through the same pipeline
node eval/fetch-season.mjs 20251021 20260413 && node eval/season.mjs
```

### Season replay (1,235 completed 2025-26 regular season games, 594,525 plays)

A household watches every game with nothing learned and a cap of 2 per game. A game counts as decided late when it was within 3 points with 60 s left in its last period, had a lead change in that minute, or went to overtime (257 games). It is caught when a cue lands in the 4th quarter or overtime with at least 30 s left.

| | Clutch model | "within 5 in the last 5 minutes" |
|---|---|---|
| Cues per game | 0.56 (silent in 63% of games) | 0.81 |
| Late-decided games caught | 98.4% | 99.2% |
| Share of cues sent in late-decided games | 58.9% | 48.0% |
| Cues in the 171 games decided by 25 or more | 0 | 0 |

Controls: the same number of cues at random plays catches 31.5% of late-decided games. The same model on shuffled margins sends 1.89 cues per game, 21.8% of them in late-decided games, and 282 cues in blowouts. Our win probability differs from ESPN's per-play probability by 0.075 on average. Threshold sweep (cues per game, recall): 0.20 gives 0.88 and 85.2%, 0.25 gives 0.66 and 98.8%, 0.30 gives 0.56 and 98.4%, 0.35 gives 0.46 and 94.9%, 0.40 gives 0.40 and 94.6%, 0.50 gives 0.29 and 83.3%. `server/eval/results.json` holds every figure.

## Record the demo video

The VVD is a GUI window, so record it from the host while the Mac is unlocked and awake.

```bash
scripts/vvd-up.sh
# window id of the VVD (for single frames), or a screen recording with the VVD window in view
swift - <<'SW'
import CoreGraphics
for w in CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String:Any]] {
  if (w["kCGWindowName"] as? String) == "Vega Virtual Device" { print(w["kCGWindowNumber"]!) }
}
SW
screencapture -x -l <window-id> evidence/frame.png          # one frame
screencapture -v -V 120 evidence/demo.mov                   # 120 s of the screen with the VVD window in view
```

Submissions need under 3 minutes, English, public on YouTube or Vimeo.

## License

MIT. See `LICENSE`. `third_party/` (built sample apps) is not committed.
