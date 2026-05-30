# Phase 1 Bug Fix Report
Date: 2026-05-30. Author: Helm (autonomous fix run).

---

## BUG-1 — Cron timezone (HIGH) — FIXED

**File changed:** `workspace/scheduler/cron.mjs`

Switched all date reads from local-time to UTC methods:
- `getMinutes()` → `getUTCMinutes()`
- `getHours()` → `getUTCHours()`
- `getDate()` → `getUTCDate()`
- `getMonth()` → `getUTCMonth()`
- `getDay()` → `getUTCDay()`

Also fixed both `setMinutes(getMinutes() + 1)` calls in `nextCronDate` to `setUTCMinutes(getUTCMinutes() + 1)` so the minute-step loop advances UTC time, not local time.

Demo job `good-morning` has cron `0 2 * * 1-5`. With UTC interpretation this fires at 02:00 UTC = 09:00 GMT+7, which is the documented intent. No change to the cron string needed. Smoke test #7 was updated to use `Date.UTC()` constructors so the test is timezone-independent and won't silently revert if the machine timezone changes.

Scheduler daemon was unloaded and reloaded via `launchctl` to pick up the change. New PID 48279 confirmed alive.

---

## BUG-2 — migrate.mjs duplicates on re-run (MED) — FIXED

**File changed:** `workspace/memory/migrate.mjs`

Removed the `ON CONFLICT DO NOTHING` INSERT (which never triggered since there is no UNIQUE constraint on `(kind, key)`). Replaced with the same check-then-insert-or-update pattern used by `memory.mjs remember`:
- `stmtFind.get(kind, key)` to detect existing rows
- `stmtInsert.run(...)` for new rows
- `stmtUpdateVal.run(value, existing.id)` for existing rows

Added a dedup step at the start of migrate (before any inserts) that removes duplicate rows, keeping the lowest id per `(kind, key)` pair:
```sql
DELETE FROM facts WHERE id NOT IN (SELECT MIN(id) FROM facts GROUP BY kind, key)
```

At fix time, memory.db had 23 facts with 0 duplicate groups. The dedup was a no-op. Running migrate twice now leaves the count unchanged.

The inserted counter now only increments on genuinely new rows, so the output message is accurate.

---

## BUG-3 — Confirm gate (MED) — ALREADY FIXED IN PHASE 2

**File:** `workspace/tools/tools.mjs`

Verified. Phase 2 implemented the gate at lines 44–51: if `tool.confirm` is true and `--force` is absent, the dispatcher emits `CONFIRM REQUIRED: <name>` to stderr and exits 2. `imessage.send` has `"confirm": true` in registry.json. The phase 2 smoke suite (test #6) already covers this. Added a new smoke test (#11) to the phase 1 suite as a regression anchor for `imessage.send` specifically.

No code change needed.

---

## BUG-4 — Heartbeat timer refs on function object in index.js (LOW) — FIXED

**File changed:** `index.js`

Replaced `ask._hbStart` / `ask._hbInterval` (properties written to the function object from inside the timeout callback) with `let hbStart, hbInterval` declared in function scope before the try block. Both `clearTimeout` and `clearInterval` calls in the try and catch branches now reference the closure variables directly. Removed the dead `heartbeatFired` variable. No behavior change. `node --check` passes.

---

## BUG-5 — Impossible cron silent loop (LOW) — FIXED

**Files changed:** `workspace/tools/impl/scheduler.add.mjs`, `workspace/scheduler/scheduler.mjs`

**Add-time validation (`scheduler.add.mjs`):** After calling `nextCronDate(cron)`, if the result is null the script now prints an error and exits 1. Impossible crons (e.g., `0 0 30 2 *` — Feb 30 never exists) are rejected before they reach the database.

**Tick-time guard (`scheduler.mjs`):** Added `stmtDisable` prepared statement. In the tick loop, `nextCronDate` is now called once per job at the top of each iteration. If it returns null, the job is logged as impossible and disabled (`enabled = 0`) immediately, stopping the silent write loop. The `stmtUpdate` call in the non-firing branch no longer needs to handle null since impossible jobs are caught first.

---

## Smoke results

After all fixes:
- `node workspace/tests/smoke.mjs`: **12/12 passed** (8 original + 4 new regression tests)
- `node workspace/tests/smoke-phase2.mjs`: **12/12 passed**

New regression tests added to `smoke.mjs`:
- Test 9: BUG-1 — `cronMatches('0 2 * * *', utc02:00)` true, `utc09:00` false; next fire lands at UTC 02:00.
- Test 10: BUG-2 — double migrate run, fact count unchanged.
- Test 11: BUG-3 — `tools.mjs call imessage.send` without `--force` exits non-zero with "CONFIRM" in stderr.
- Test 12: BUG-5 — `scheduler.add.mjs` with cron `0 0 30 2 *` exits non-zero.

---

## New findings

None that weren't in the Phase 1 audit. The security concerns flagged there (unvalidated `--out` in screencap, raw-number SQL interpolation in imessage.js, `exec` field split on spaces) remain open and unchanged. They were not in scope for this run.

---

## Gaps not fixed (deferred)

- **§1.4 — Owner notification on job completion**: still not wired. Jobs finish to `runs/` silently unless the daemon calls `pushOwner`. The scheduler does call `pushOwner` if `job.notify` is set, but the tool registry wrapper doesn't expose a way to set `notify` at add-time.
- **§1.5 — Symlink backward compat**: unchanged from Phase 1. Not a regression.
- **No UNIQUE index on facts (kind, key)**: went with option (b) — application-level upsert. No ALTER TABLE migration was applied. If someone inserts directly via SQL, duplicates are still possible. Adding the UNIQUE index would be the correct long-term fix; deferred to avoid a migration step that could fail on existing DBs with pre-existing duplicates.
