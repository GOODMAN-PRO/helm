# Phase 3 Report

Completed: 2026-05-30.

## What landed

### 3.1 Screen watcher

Files:
- `workspace/senses/screen/watcher.mjs` — daemon
- `workspace/senses/screen/ocr-helper.swift` — OCR source
- `workspace/senses/screen/com.helm.screen.plist` — launchd plist (NOT loaded)
- `workspace/tools/impl/screen.recent.mjs`
- `workspace/tools/impl/screen.at.mjs`
- `workspace/tools/impl/screen.search.mjs`

Behaviour:
- Every 60s (configurable via `--interval`), runs `screencapture -x -t png`.
- Perceptual hash: downscale to 8×8 grayscale with `sharp`, threshold by pixel mean → 64-char binary string. Hamming distance against last frame.
- Default change threshold: 10 bits. If delta ≤ threshold, frame is discarded.
- Changed frames moved to `workspace/senses/screen/frames/` ring buffer (max 200 files; oldest deleted when full).
- Events recorded in `workspace/senses/screen/events.db` (table: `events(id, ts, hash, png_path, ocr_text)`).
- OCR is **opt-in** via `--ocr` flag. Uses `bin/ocr-helper` binary (compiled from `ocr-helper.swift` — see install hints below). If binary absent, OCR silently skipped.
- Daemon is OFF by default. No launchd load performed.

Tools:
- `screen.recent --limit N` — last N events.
- `screen.at --ts <unix_ms>` — event closest to timestamp.
- `screen.search --query <text>` — LIKE search on `ocr_text`; returns helpful error if no OCR data.

Dependency added: `sharp` (npm, free). Added to `package.json`.

### 3.2 Notification interceptor

Files:
- `workspace/senses/notify/poller.mjs` — daemon
- `workspace/senses/notify/com.helm.notify.plist` — launchd plist (NOT loaded)
- `workspace/tools/impl/notify.recent.mjs`
- `workspace/tools/impl/notify.unread.mjs`

Behaviour:
- Every 30s (configurable via `--interval`): snapshots Messages `chat.db` (cp + read-only DatabaseSync), queries Calendar via JXA, queries Mail via JXA.
- Records **changes only** in `workspace/senses/notify/events.db` (`events(id, ts, source, kind, summary, payload_json)`).
- If a source is inaccessible (permission missing), emits a one-time warning to stderr and records null for that source.
- Daemon is OFF by default.

Tools:
- `notify.recent --limit N` — last N recorded change events.
- `notify.unread` — live query returning `{messages, calendar, mail}`. Works without the daemon. Null values plus a `warnings` array when permissions are missing.

### 3.3 Location

Files:
- `workspace/senses/location/location.mjs` — on-demand script
- `workspace/tools/impl/location.here.mjs`

Behaviour:
- Calls `CoreLocationCLI -json -once` if binary is on PATH.
- Returns `{lat, lon, accuracy, ts}` on success.
- Returns `{installed: false, hint: "brew install corlocationcli..."}` if binary absent. Does not install anything.
- No daemon, no continuous tracking.

### 3.4 Mic on demand

Files:
- `workspace/senses/mic/record.mjs` — recording script
- `workspace/senses/mic/transcribe.mjs` — transcription script
- `workspace/tools/impl/mic.record.mjs`
- `workspace/tools/impl/mic.transcribe.mjs`

Behaviour:
- `record.mjs`: checks `sox` (`rec`) first, then `ffmpeg`. Neither → returns `{error, hint}` with Homebrew install commands (does not install).
  - Default duration: 30s. Hard cap: 300s. Writes to `/tmp/helm-mic-<ts>.wav`.
  - ffmpeg uses AVFoundation input device `:0` (macOS default mic).
- `transcribe.mjs`: checks `whisper-cpp`, `whisper`, `main` in PATH. Not found → returns `{error, hint}`. Found → runs with `-nt -l en`.
- Both tools are strictly on-demand; no daemon, no background capture.
- `mic.record` is marked `confirm: true` in the registry.

## Registry

Phase 1: 10 tools.
Phase 2: 13 tools added (total 23).
Phase 3: 8 tools added (total **31**).

New tools: `screen.recent`, `screen.at`, `screen.search`, `notify.recent`, `notify.unread`, `location.here`, `mic.record`, `mic.transcribe`.

## Smoke tests

- Phase 3: `node workspace/tests/smoke-phase3.mjs` — **19/19 passed**.
- Phase 1 regression: `node workspace/tests/smoke.mjs` — **12/12 passed**.
- Phase 2 regression: `node workspace/tests/smoke-phase2.mjs` — **12/12 passed**.

Total: 43/43.

## What is blocked / not fully functional without owner action

### Screen watcher OCR

OCR requires the `bin/ocr-helper` binary compiled from `workspace/senses/screen/ocr-helper.swift`. Not compiled yet.

To compile (requires Xcode Command Line Tools):
```
swiftc workspace/senses/screen/ocr-helper.swift -o bin/ocr-helper
```

If Command Line Tools not installed:
```
xcode-select --install
```

OCR will be silently skipped until the binary is present. The watcher and all three screen tools work without it.

### Enabling the screen watcher daemon

```
cp workspace/senses/screen/com.helm.screen.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.helm.screen.plist
```

To enable OCR, edit the plist and add `--ocr` to `ProgramArguments` before loading.

### Enabling the notify poller daemon

```
cp workspace/senses/notify/com.helm.notify.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.helm.notify.plist
```

`notify.unread` works without the daemon (live queries). The daemon is only needed to record the change history that `notify.recent` reads.

### Notify permissions

`notify.unread` (and the poller) need:
- **Messages**: System Preferences > Privacy & Security > Full Disk Access — add Terminal.app (and the Node process running the bot).
- **Calendar**: System Preferences > Privacy & Security > Automation > Calendar.app — grant to Terminal.app and the bot's Node process.
- **Mail**: Same as Calendar but for Mail.app.

Without these, the respective fields return `null` with a `warnings` entry explaining what is missing.

### Location

CoreLocationCLI not installed. To install (free, open source — confirm with owner first):
```
brew install corlocationcli
```

### Mic recording

Neither `sox` nor `ffmpeg` detected. To install (confirm with owner first):
```
brew install sox        # preferred: smaller, audio-focused
# or
brew install ffmpeg     # heavier; useful if already wanted for other tools
```

Microphone permission will also be needed for whichever app runs `rec`/`ffmpeg` (Terminal.app or the launchd process).

### Transcription

`whisper.cpp` not installed. To install (confirm with owner first):
```
brew install whisper-cpp
# Then download a model:
whisper-cpp --download-model base.en
```

## Privacy posture

- Screen PNGs stay in `workspace/senses/screen/frames/` — never uploaded anywhere.
- OCR text stays in `events.db` — never uploaded.
- Mic WAVs write to `/tmp/helm-mic-<ts>.wav` — ephemeral, not uploaded.
- Location is on-demand only; no passive tracking.
- Both daemons are OFF by default; owner activates explicitly.
