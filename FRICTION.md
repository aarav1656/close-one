# Friction log

Product feedback for the Vega SDK, Vega Virtual Device (VVD), the Amazon Devices Builder Tools MCP and the sample apps, written while building Close One. Environment for every entry: macOS 26.4.1 on Apple Silicon (arm64), Node v24.9.0, Vega CLI 1.4.5, Vega SDK 0.24.12112, React Native for Vega 0.83. Date of all entries: 2026-10-21.

Severity: High = blocked the work or cost more than 30 minutes, Medium = needed a workaround, Low = papercut.

## FL-001 Metro and jest hang forever on a macOS-protected folder, with no error

- Task: build the app with `npm run build:debug` after installing the prerequisites from the install page (`brew install binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman`).
- Steps: `npm install` in a fresh project under `~/Desktop`, then `npm run build:debug` (`react-native build-kepler`).
- Expected: a .vpkg in `build/`, as the same command produced for a project under `/tmp`.
- Actual: the build never finishes and prints one line every 20 seconds for as long as it is left running:
  `Waiting for Watchman \`watch-project\` (870s)...`
  `watchman watch-project .` run by hand in the same directory returns no output and no error, and the same call on `/tmp/samples` returns at once. `npx jest` in the project hangs the same way (240 s with no output) and returns in 1 s with `--no-watchman`.
- Root cause: `~/Desktop` is a macOS privacy-protected folder. The Homebrew `watchman` daemon had no Files and Folders grant for it, so `watch-project` blocked on the permission prompt that nothing displayed. After the grant (System Settings, Privacy & Security, Files and Folders or Full Disk Access, for watchman) `watch-project` returns at once (`"watcher": "fsevents"`), `npm run build:debug` finishes with Watchman on, jest passes without `--no-watchman`, and `react-native start` serves Metro.
- Severity: High. Over 20 minutes lost across two hangs before the cause was found, and nothing in the output names the permission, or Watchman, as blocked rather than slow.
- Workaround until the grant exists: `resolver: {useWatchman: false}` in `metro.config.js` and `--no-watchman` for jest.
- Suggestion: have the Vega build time out `watch-project` after 30 s with a message that names the macOS folder-privacy cause, and add the Files and Folders grant for watchman to the install page prerequisites for projects under Desktop, Documents and Downloads.

## FL-002 `ignore-scripts=true` silently skips the vega-video-sample Shaka build

- Task: build `AmazonAppDev/vega-video-sample` for the VVD.
- Steps: `npm install` then `npm run build:debug`, with `ignore-scripts=true` in `~/.npmrc` (a common supply-chain setting).
- Expected: either a working build or a message that the postinstall did not run.
- Actual: `npm install` succeeds with 1646 packages and no mention of the skipped `postinstall` (`cd shaka-setup && ./build.sh && ./copyOutputs.sh`). The build then fails in Metro:
  `error Unable to resolve module ./dist/shaka-player.compiled from /private/tmp/samples/vega-video-sample/src/w3cmedia/shakaplayer/ShakaPlayer.ts`
- Severity: Medium.
- Workaround: `npm run postinstall --ignore-scripts=false` (the script clones shaka-player from GitHub, applies Amazon's patches and compiles it with `kepler exec python build/all.py`, about 3 minutes). Wrapped in `scripts/fetch-video-sample.sh`.
- Suggestion: make the sample's `compile`/`build:debug` check for `src/w3cmedia/shakaplayer/dist/shaka-player.compiled.js` and print "run `npm run postinstall --ignore-scripts=false`", and say so in the sample README.

## FL-003 No way to take a screenshot of the VVD from the CLI

- Task: capture a still of the running app on the VVD for the demo evidence.
- Steps: `vega exec vda shell 'screenshooter /tmp/s1.png'`, also `screenshooter -r`, `gwsi-tool-screenshooter`, with `XDG_RUNTIME_DIR` set to `/tmp`, `/dev/shm`, `/data`, `/var/run`.
- Expected: a PNG on the device, then `vega exec vda pull`.
- Actual, every variant:
  `creating a buffer file for 8294400 B failed: Permission denied`
  `error marshalling arguments for shoot (signature oo): null value passed for arg 1`
  `Error marshalling request: Invalid argument`
  The 0-byte output file is left behind and `vda pull` reports `1 file pulled` for it.
  The QEMU monitor exposes `screendump` on `/tmp/qmp-socket-5554.sock`, but it writes an all-black 1920x1080 frame (virtio-gpu with GL acceleration, which `vega virtual-device start --no-gl-accel` refuses on Mac: `GL acceleration was turned off with the --gl-accel flag, but this is not permitted on Mac.`). Host `screencapture` is black while the Mac display is asleep or locked, because the VVD is a GUI window.
- Severity: High for anyone who must show the simulator running. The hackathon rules require video on a real Fire TV or the simulator.
- Workaround: none headless. Host-side capture of the VVD window while the Mac is unlocked and awake.
- Suggestion: a `vega device screenshot` and `vega device record` command (the VVD and the Fire TV Stick both have the compositor), or make `screenshooter` work from the dev shell user.

## FL-004 VVD process is tied to the launching shell

- Task: start the VVD and keep it for the session.
- Steps: `vega virtual-device start &` from a script, then run other commands in later shells.
- Expected: the VVD keeps running; there is a `status` and a `stop`, which suggests a daemon.
- Actual: `vega virtual-device status` printed `{"running":true,...}` right after start, and about 10 minutes later in a new shell `{"running":false,"process_ids":{"qemu":-1}}` and `vega device install-app` failed with `Device not found: No connected Vega devices found.`
- Severity: Medium.
- Workaround: `nohup vega virtual-device start > log 2>&1 < /dev/null & disown` (`scripts/vvd-up.sh`).
- Suggestion: detach QEMU by default or add `--detach`; document that `start` is a foreground process.

## FL-005 Dev shell and device list are intermittently unavailable on a healthy VVD

- Task: run commands in the VVD shell and list devices.
- Steps: `vega exec vda shell '<cmd>'` repeatedly with gaps of 30 s or more; `vega device list` in between.
- Expected: the same answer each time while `vega virtual-device status` says `running: true`.
- Actual: roughly every second call after idle fails with
  `Error: No running instances of com.amazon.dev.shell.service found`
  and `vega device list` printed `No devices found` while QEMU was alive, then `VirtualDevice : tv - aarch64 - OS - amazon-5a033a7b429ef645` a few seconds later. The device log shows the shell service being launched on demand and stopped about 15 s after the last client.
- Severity: Medium. Scripts need retries.
- Workaround: a retry wrapper (`scripts/vsh.sh`, six tries four seconds apart).
- Suggestion: make `vda shell` wait for the service launch instead of failing, and keep the device entry stable while the VM is up.

## FL-006 `vega exec vda shell` splits quoted arguments

- Task: run a command with a pipe or quoted alternation on the device.
- Steps: `vega exec vda shell 'ls /usr/bin | grep -i -E "wl|wayland"'`.
- Expected: the string reaches `/bin/sh` intact.
- Actual: the pipe and the quoted `|` inside the regex are interpreted on a different side: `/bin/sh: grep: ...`, `/bin/sh: weston: No such file or directory`, `/bin/sh: compositor: command not found`.
- Severity: Low.
- Workaround: `vega exec vda push script.sh /tmp/script.sh` and run `sh /tmp/script.sh`.
- Suggestion: pass the argument vector through unchanged, or document the quoting rule.

## FL-007 `vega device start-log-stream` replays the whole journal and has no filter

- Task: capture the device log for one test run.
- Steps: `vega device start-log-stream > file` before a run.
- Expected: lines from now on, as `--help` ("Start streaming logs from a device") suggests.
- Actual: the first 1,400 to 2,000 lines are the journal since boot (package installs, earlier runs), so a run's file contains the previous runs' lines. A count of marker lines is wrong unless each is matched by timestamp.
- Severity: Low.
- Workaround: match by timestamp window per event (`spikes/toast/analyze.py`).
- Suggestion: `--since now`, `--tail`, and a `--grep`.

## FL-008 Toast from a headless service: only a hook is documented, and a wrong channel name fails silently

- Task: show a system toast over another app from a background service (the core mechanism of Close One).
- Steps: read the toast pages; the only documented API is the React hook `useToastKepler`, which a headless service has no React tree to call. Import `NativeNotificationManager` and `NotificationManagerUtils` from `@amazon-devices/react-native-kepler/Libraries/Components/ToastKepler/` and call `post()` with the content the hook builds.
- Expected: a documented non-hook route, and an error for a bad channel.
- Actual: `post()` resolves with `{"bytes":[...16 numbers]}` for every channel name. With `name: 'NotATemplateName'` nothing is drawn and no error is logged; with `name: 'MenuToastRenderTemplate'` the renderer claims input (`Client Requesting Priority 224: SYSTEMUI_PRIORITY`) and releases it 8 s later. Measured here: 20 of 20 sends with the template name, 0 of 20 with the other name (`spikes/toast/`). The channel `name` field is the render template selector, which the type comments do not say. First reported by github.com/rogerjeasy/wick (FL-022 in their log); reproduced here.
- Severity: High for discoverability. The accepted-but-invisible case looks like success.
- Workaround: use the template constants `SimpleToastRenderTemplate` or `MenuToastRenderTemplate` as the channel name.
- Suggestion: reject unknown channel names from `post()`, and document the headless route with `NotificationManager`.

## FL-009 A service is never started by the platform; the start path is an undocumented self-URI

- Task: keep a `[[components.service]]` running after the app leaves the screen.
- Steps: declare the service in `manifest.toml` with `[[offers.service]]` and `[[wants.service]]`, install, launch the app.
- Expected: the service starts, or the docs say what starts it.
- Actual: nothing starts it. `Linking.openURL('pkg://com.clutch.tv.cue.service')` from the app starts it, and it keeps running with another app in front (confirmed by `CLUTCH_CUE_POSTED` lines while `com.amazondeveloper.keplervideoapp.main` was foreground). The log line `CLUTCH_SERVICE_STOP` appears when the app is terminated with `vega device terminate-app`, so the service lifetime follows the package.
- Severity: Medium.
- Workaround: start the service from `App.tsx` on every launch.
- Suggestion: document `pkg://<service-id>` as the start path, and the lifetime rule.

## FL-010 10.0.2.2 reaches host loopback, so any local listener on that port answers the app

- Task: connect the service WebSocket from the VVD to a server on the Mac.
- Steps: server on port 8787, `new WebSocket('ws://10.0.2.2:8787')` from the service.
- Expected: connect to my server.
- Actual: `Refused WebSockets upgrade: 404` in a loop. QEMU maps 10.0.2.2 to the host's 127.0.0.1, where an unrelated Python process was already listening on 8787. `curl http://10.0.2.2:8787/` from the device shell returned that process's 404. After moving to port 38787 the socket opened at once. The device log line (`WebSocketCurlManager_ErrorString: Curl error Refused WebSockets upgrade: 404`) is clear once read, but the page that explains the VVD host address was not found.
- Severity: Low.
- Workaround: pick an unusual port, check `lsof -iTCP:<port>`.
- Suggestion: document `10.0.2.2` for the VVD next to the networking page.

## FL-011 `build-kepler` is deprecated in the shipped templates

- Task: build with the script in the helloworld sample's `package.json`.
- Steps: `npm run build:debug` (`react-native build-kepler --build-type Debug`).
- Actual: `warn This command is deprecated and will be removed in a future version of the Vega CLI plugin.` / `warn Please replace usage with 'build-vega' instead.` / `warn Invoking 'build-vega' with respective args...`
- Severity: Low.
- Workaround: `build-vega` (this repo's scripts).
- Suggestion: update the template scripts.

## FL-012 helloworld template's test dependency does not work with its own React version

- Task: run the template's snapshot test.
- Steps: `AmazonAppDev/react-native-multi-tv-helloworld` pins `@testing-library/react-native ^7.2.0` with `react 19.2.0`; render the app with `render(<App />)` inside `act`.
- Actual: `Can't access .root on unmounted test renderer` from `render.js:50`.
- Severity: Low.
- Workaround: `react-test-renderer` directly (`app/test/App.spec.tsx`).
- Suggestion: bump to a React 19 compatible testing library in the sample.

## FL-013 Build output path contains `undefined`

- Task: find the built package.
- Actual: `build/private/kepler/clutch-vega/undefined/vega/aarch64/Debug/clutch-vega_aarch64.vpkg`, with `package.json` version `0.1.0` and manifest version `0.1.0`. `vega device install-app -b Debug --dir .` still finds it.
- Severity: Low.
- Suggestion: derive the path segment from the manifest version.

## FL-014 `vega virtual-device list` does not exist

- Task: list virtual devices, as a reader of `vega virtual-device --help` expects after `start`, `status`, `stop`.
- Actual: `Vega CLI argument error: Unknown argument: list`. The working command is `vega device list`, which lists both virtual and physical devices.
- Severity: Low.
- Suggestion: alias `vega virtual-device list` to `vega device list` or mention it in the `virtual-device --help` text.

## FL-015 Builder Tools `init-context` writes into the global skills directory

- Task: install the Builder Tools context for Claude Code inside one repo.
- Steps: `npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.17 init-context --agent claude-code-cli --skip-mcp-config --force` run in an empty directory.
- Expected: one context document in that directory, per the README step "Create the appropriate context file".
- Actual: `CLAUDE.md` (13.7 KB) in the directory, and 21 skill folders (`amazon-devices-*`, `vega-multi-tv-migration`) created under `~/.claude/skills`, user-global, shared by every project. The command ends with `Review skills before use; they run with full agent permissions.` There is no flag to skip the skills (`--skip-context-document` and `--skip-mcp-config` do not cover them). The generated `CLAUDE.md` tells the agent to run a six-step session setup silently and call MCP tools, which is dead weight when the MCP server is not configured.
- Severity: Medium. A project-scoped command changed user-global agent configuration.
- Workaround: this repo keeps the generated file as `.amazon-devices/context.md` instead of an auto-loaded `CLAUDE.md`; the 21 skills were read (documentation only, no commands) and left in place.
- Suggestion: a `--skip-skills` flag, a `--skills-dir`, and a printed list of the paths that will be written before they are.

## FL-016 Installer edits five shell rc files

- Task: run the official installer (`get_vvm.sh`).
- Actual: `Modified shell .rc files: /Users/dev/.bashrc /Users/dev/.zshrc /Users/dev/.bash_profile /Users/dev/.zprofile /Users/dev/.profile`. `.zshrc` and `.zprofile` each gained `source "/Users/dev/vega/env"`.
- Severity: Low.
- Suggestion: edit only the rc file of the user's login shell, and print the line it added.

## FL-017 Toast icon: a data URI is rejected, a package path is accepted and draws blank

- Task: show the Close One mark on the toast raised from the headless service.
- Steps: `post()` with `iconUri` set in turn to a data URI, `file:///pkg/assets/...`, `pkg://`, a relative path, `asset://`, the amazon.com favicon over https, an https URL that returns 404, and `http://10.0.2.2:38787/assets/clutch-icon.png`.
- Expected: an error for an icon the renderer cannot draw, or one documented icon form.
- Actual: the data URI fails with `Bad Parameter Error`. Every package path form is accepted by `post()` and the renderer draws a blank icon slot. The https favicon draws. The https 404 draws blank. The cleartext dev server URL was never requested by the renderer. The icon source is not in the toast type comments.
- Severity: Medium. The accepted-but-blank case looks like success, the same shape as FL-008.
- Workaround: host the icon on the cue server and pass an https URL (`app/src/notify/toast.ts`); the toast text carries the message without it.
- Suggestion: document the icon forms the renderer draws, and make `post()` reject the ones it cannot.

## Timings measured

| Step | Time |
|---|---|
| `brew install binutils gawk findutils grep gnu-sed watchman` | 1 min 21 s |
| Official installer (CLI + SDK 0.24.12112 + VVD, 39,131 files) | 6 min 13 s |
| `vega virtual-device start` to `Virtual device ready.` | about 45 s |
| vega-video-sample: `npm install` | 2 min |
| vega-video-sample: Shaka compile | about 3 min |
| Close One `npm install` | 42 s |
