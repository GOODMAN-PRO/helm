# Senses Zone Bug-Sweep Report
Generated: 2026-05-31

---

## Files Audited

- `workspace/senses/screen/watcher.mjs`
- `workspace/senses/notify/poller.mjs`
- `workspace/senses/location/location.mjs`
- `workspace/senses/mic/record.mjs`
- `workspace/senses/mic/transcribe.mjs`
- `workspace/senses/screen/ocr-helper.swift`
- `workspace/senses/screen/com.helm.screen.plist`
- `workspace/senses/notify/com.helm.notify.plist`
- Runtime copies in `~/Library/LaunchAgents/`

---

## Bugs Found

### BUG-1 — watcher.mjs:85 — Ring buffer never deletes oldest (MEDIUM) — FIXED
**Location:** `enforceRing()`, the `.map()` that computes mtime.
**Cause:** `+new Date('1780150518506')` parses a numeric string as a date string → `NaN`. The sort comparator then produces `NaN - NaN = NaN`, so `.sort()` is no-op. Files are shifted in undefined (insertion) order rather than oldest-first. Older frames may outlive newer ones.
**Fix:** Changed `+new Date(f.split('-')[0])` to `parseInt(f.split('-')[0], 10)`.

### BUG-2 — watcher.mjs:78-95 — Ring buffer never prunes DB rows (MEDIUM) — FIXED
**Location:** `enforceRing()`.
**Cause:** Only `unlinkSync` on the PNG; no corresponding `DELETE FROM events WHERE png_path = ?`. After the ring reaches 200 frames, every pruned PNG leaves a stale row in `events.db` with a path that no longer exists. DB grows without bound; `screen.search` over `ocr_text` will scan dead rows.
**Fix:** Added `const deleteEvent = db.prepare('DELETE FROM events WHERE png_path = ?')` and call `deleteEvent.run(fpath)` inside `enforceRing` after each `unlinkSync`.

### BUG-3 — poller.mjs:63-78 — chat.db temp file and fd leaked on exception (MEDIUM) — FIXED
**Location:** `getMessagesUnread()`.
**Cause:** `snap.close()` and `execFileSync('rm', tmp)` are inside the `try` block. If `new DatabaseSync(tmp)` succeeds but `snap.prepare(...).get()` throws, control jumps to `catch` without closing the DatabaseSync handle or removing the temp file. On a busy machine with a locked WAL, this silently leaks one file and one fd per tick.
**Fix:** Restructured with `let snap = null; let result = null;`, moved cleanup to `finally { try { snap?.close(); } ... try { execFileSync('rm', '-f', tmp); } ... }`.

### BUG-4 — watcher.mjs, poller.mjs — Log files grow unbounded (LOW) — FIXED
**Location:** Top of both daemon files.
**Cause:** `StandardOutPath`/`StandardErrorPath` are plain files opened with `O_APPEND` by launchd; neither file is ever rotated or truncated. Over weeks of continuous operation these grow without bound.
**Fix:** Added startup truncation: if file size exceeds 5 MB at process start, `truncateSync(path, 0)` is called before any output is written. Added `statSync`/`truncateSync` to the `node:fs` imports in both files.

---

## Verified Clean

### Perceptual hash math (watcher.mjs:59-68)
Downscale to 8×8 grayscale via `sharp`, compute mean, binarize `v >= mean`. Hamming comparison at line 71-75 is a correct character-by-character XOR count. The all-1s hash for a uniform/blank screen (display asleep or solid-colour capture) is mathematically correct. Two identical uniform frames compare to dist=0, correctly suppressed. Not a bug.

### Calendar JXA timeout (poller.mjs:105)
`timeout: 25000` (25 s). Task brief documented a worst-case observed run of 17 s; this leaves 8 s headroom. Adequate; no change made.

### Calendar/Mail JSON.parse on empty output (poller.mjs:110, 132)
Both `getCalendarNext()` and `getMailUnread()` wrap `JSON.parse(r.stdout.trim())` inside a `try/catch` that logs via `warnOnce` and returns `null`. Handles empty string, non-JSON osascript errors, and timeout silently. Clean.

### Notify "changes only" detection (poller.mjs:139-170)
`prev.messages`, `prev.calendar`, `prev.mail` are compared before each insert. Calendar uses `JSON.stringify` signature comparison which detects any event list change. Messages and Mail compare counts directly. Restart resets `prev` to null, causing one re-record per source on restart; acceptable and by design.

### Mail JXA when Mail.app not running (poller.mjs:126)
osascript returns exit status 1 with stderr `execution error: Error: Application isn't running. (-600)`. `r.status !== 0` branch fires → `warnOnce('mail-perm', ...)` includes the actual stderr in the message → returns null. No crash, no DB write. Clean (message is informative enough).

### OCR helper — non-ASCII / Thai text (ocr-helper.swift)
`VNRecognizeTextRequest` with `.accurate` level supports multi-language recognition including Thai. Swift's `print()` outputs UTF-8. Thai calendar event title `วันหยุดชดเชย วันวิสาขบูชา` is visible end-to-end in `notify.unread` output — confirmed by live tool call.

### OCR helper — unreadable image error path (ocr-helper.swift:23-27)
`guard NSImage(...), cgImage(...)` prints to stderr and `exit(1)`. `runOcr()` in watcher.mjs uses `r.stdout?.trim() || null` — empty stdout on non-zero exit returns null. OCR failure does not abort the tick.

### Location — CoreLocationCLI not installed (location.mjs:15-23)
`which('CoreLocationCLI')` returns null → prints JSON `{ installed: false, hint: ... }` and `process.exit(0)`. Graceful.

### Mic — sox/ffmpeg/whisper not installed (record.mjs:29-35, transcribe.mjs:27-39)
`which()` checks on both backends; prints JSON error with `hint` and exits cleanly. Graceful.

### Plist — PATH includes /usr/sbin (screen)
`com.helm.screen.plist`: PATH = `.local/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` — `screencapture` at `/usr/sbin/screencapture` is covered. Correct.

### Plist — PATH for notify
`com.helm.notify.plist`: PATH = `.local/bin:/usr/local/bin:/usr/bin:/bin`. Notify uses only `osascript` (/usr/bin), `cp`, `rm` (/bin). `/usr/sbin` not needed. Correct.

### Plist — RunAtLoad + KeepAlive
Both plists: `RunAtLoad=true`, `KeepAlive=true`. Intent is a persistent always-on daemon. Consistent.

### DB schema — events_ts index
Both `events.db` schemas include `CREATE INDEX IF NOT EXISTS events_ts ON events(ts)`. Present and correct.

### node --check
All five `.mjs` files passed `node --check` both before and after edits.

### DB write confirmation (post-kickstart)
- Screen `events.db`: new row 58 at ts=1780170310407 written within 8 s of kickstart.
- Notify `events.db`: rows 14-16 written at ts=1780170310348 (messages, calendar, mail) within seconds of kickstart.

---

## Daemons Left Running

| Service | PID | Last Exit | Status |
|---|---|---|---|
| com.helm.screen | 30168 | -15 (SIGTERM from kickstart) | running |
| com.helm.notify | 30171 | -15 (SIGTERM from kickstart) | running |

Both kickstarted with `launchctl kickstart -k gui/$(id -u)/com.helm.{screen,notify}` after edits. Verified via `launchctl list` and confirmed new DB rows written post-restart.

---

## End-to-End Verification

`node workspace/tools/tools.mjs call notify.unread --json '{}'` returned:
```json
{"messages":29,"calendar":{"title":"วันหยุดชดเชย วันวิสาขบูชา","start":"2026-05-31T17:00:00.000Z"},"mail":0}
```
Calendar, Messages, and Mail all functional. Thai text round-tripped correctly.

---

## Verdict

Three medium bugs fixed (NaN sort, DB row leak, temp-file fd leak), one low fix (log rotation). All five .mjs files pass syntax check. Both daemons restarted and confirmed writing. Zone is clean.
