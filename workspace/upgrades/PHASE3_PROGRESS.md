# Phase 3 Progress

## 3.1 Screen watcher — DONE
- `workspace/senses/screen/watcher.mjs`: daemon, 60s interval, perceptual hash (sharp 8×8 grayscale), ring buffer 200 frames.
- `workspace/senses/screen/ocr-helper.swift`: Vision framework OCR helper source.
- `workspace/senses/screen/com.helm.screen.plist`: launchd plist, NOT loaded.
- Tools added: `screen.recent`, `screen.at`, `screen.search`.
- sharp installed as project dependency.

## 3.2 Notification interceptor — DONE
- `workspace/senses/notify/poller.mjs`: polls Messages/Calendar/Mail every 30s, records changes.
- `workspace/senses/notify/com.helm.notify.plist`: launchd plist, NOT loaded.
- Tools added: `notify.recent`, `notify.unread`.

## 3.3 Location — DONE
- `workspace/senses/location/location.mjs`: on-demand, checks for CoreLocationCLI, returns {installed: false} if missing.
- Tool added: `location.here`.

## 3.4 Mic — DONE
- `workspace/senses/mic/record.mjs`: checks sox / ffmpeg, returns install hint if neither present.
- `workspace/senses/mic/transcribe.mjs`: checks whisper.cpp, returns install hint if missing.
- Tools added: `mic.record`, `mic.transcribe`.

## Registry
- 8 new tools added. Total: 31 tools.

## Smoke tests
- `workspace/tests/smoke-phase3.mjs`: 19/19 passed.
- Phase 1 regression: 12/12 passed.
- Phase 2 regression: 12/12 passed.
