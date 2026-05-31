# SWEEP_BOTS_REPORT — zone: index.js, imessage.js, sessions.mjs, bin/, scheduler/, runs/, plans/
Date: 2026-05-31

---

## Verified clean

| File | What was checked |
|------|-----------------|
| `index.js` | Discord adapter, heartbeat, fleet commands, session retry, typing indicator, splitAttachments |
| `imessage.js` | Poll loop, sinceRowId coercion, SQL string concat (intentional int coercion guards injection), attributedBody decoder, send/file via osascript (args passed as argv array — no shell), wasSentByUs dedup |
| `workspace/sessions.mjs` | DatabaseSync setup, idempotent migration from legacy JSON, get/set/delete stmts |
| `workspace/scheduler/init-db.mjs` | CREATE TABLE idempotent; `notify` column added at daemon startup — not a runtime bug |
| `workspace/runs/runs.mjs` | makeRunDir timestamp format, appendLog, finaliseRun |
| `workspace/plans/plan.mjs` | All verbs, idx auto-increment, plan auto-close on completion, no SQL injection (all prepared stmts) |
| `bin/helm-push.mjs` | DM channel creation, sendText/sendFile, .env parser (tokens never have spaces/comments) |
| `bin/guicontrol.swift` | CGEvent usage, num() safe default to 0, no user input reaches a shell |
| `workspace/scheduler/com.helm.scheduler.plist` | PATH includes ~/.local/bin, RunAtLoad=true, KeepAlive=true, ThrottleInterval=10 — all correct |

---

## Bugs found

| # | File:line | Severity | What | Status |
|---|-----------|----------|------|--------|
| A | `workspace/scheduler/cron.mjs:20` | HIGH | `parseInt('0')` = 0; `for (let i=start; i<=end; i+=0)` is an infinite loop — any cron field with step `/0` hangs the scheduler daemon's event loop permanently | FIXED |
| B | `workspace/scheduler/scheduler.mjs:92` | MEDIUM | `fireJob` spawns a child process with no kill timeout; if claude hangs, the run dir is never finalised, the child reference is held forever, and no notification is sent | FIXED |
| C | `index.js:62` | MEDIUM | SSH remote command is assembled by string interpolation: `HELM_WIN_DIR`, `HELM_WIN_CLAUDE`, `MODEL`, `PERMISSION_MODE` are unquoted; a Windows path with spaces (e.g. `C:/Program Files/...`) breaks the remote `cd` and the claude invocation | FIXED |

---

## Fixes applied

### BUG-A — `workspace/scheduler/cron.mjs`
Added `if (!Number.isInteger(step) || step <= 0) throw new Error(...)` in `parseField` before the `for` loop.  
Wrapped `nextCronDate` body in `try/catch { return null }` so a malformed expression returns null rather than throwing — the scheduler's existing `if (!next) { stmtDisable... }` path then disables the job cleanly.

### BUG-B — `workspace/scheduler/scheduler.mjs`
Added `const killTimer = setTimeout(() => child.kill(), 2 * 60 * 60 * 1000)` (2-hour hard cap) inside `fireJob`.  
Added `clearTimeout(killTimer)` in both `child.on('close', ...)` and `child.on('error', ...)` handlers.

### BUG-C — `index.js`
Added a local `q = s => '"' + s.replace(/"/g, '\\"') + '"'` helper in `runClaudeRemote`.  
Applied it to `HELM_WIN_DIR`, `HELM_WIN_CLAUDE`, `MODEL`, and `PERMISSION_MODE` in the assembled remote command string.  
Double-quoting is compatible with both `cmd.exe` and bash remote shells.

---

## Regressions to verify

- Cron expressions that were valid before (no `/0`) are unchanged; smoke test `BUG-5: scheduler.add rejects impossible cron` and the `cronMatches` test both pass (23/23).
- Scheduler daemon reloaded cleanly via `launchctl kickstart -k gui/.../com.helm.scheduler`; log shows clean restart.
- Windows SSH fleet feature (runClaudeRemote) is not covered by the smoke suite — manual test required next time HELM_WIN_HOST is configured.

---

## Verdict

Three real bugs fixed (one hang risk, one resource leak, one operational correctness); 23/23 smoke pass maintained; scheduler daemon reloaded.
