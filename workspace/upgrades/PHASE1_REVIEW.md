# Phase 1 Independent Audit
Reviewer: Helm (audit mode). Date: 2026-05-30.
Scope: read-only. No code was modified.

---

## Verified working

- All claimed files exist: `scheduler/cron.mjs`, `scheduler/init-db.mjs`, `scheduler/scheduler.mjs`, `scheduler/com.helm.scheduler.plist`, `memory/memory.mjs`, `memory/migrate.mjs`, `tools/registry.json`, `tools/tools.mjs`, all 10 `tools/impl/*.mjs`, `runs/runs.mjs`, `sessions.mjs`, `tests/smoke.mjs`.
- smoke.mjs: **8/8 green** (independently re-run and confirmed).
- `index.js`: imports `workspace/sessions.mjs`, uses `30 * 60_000` cap, includes `splitAttachments`, sends heartbeat at 30s.
- `imessage.js`: imports `workspace/sessions.mjs`, uses `30 * 60_000` cap, heartbeat implemented correctly with closure-scoped timers.
- `com.helm.scheduler` daemon: **alive** (PID 41518 confirmed via launchctl).
- Demo job `good-morning`: registered in jobs.db with `enabled = 0`. Plist has `RunAtLoad: true` and `KeepAlive: true`.
- All 10 tools in registry have matching impl files. Dispatcher (`tools list`, `tools call`) works.
- `sessions.mjs`: get/set/delete round-trip against `sessions.db` working. Legacy JSON migration fires only when sessions table is empty (idempotent guard).
- `runs.mjs`: `makeRunDir`/`appendLog`/`finaliseRun` structurally correct.
- `memory.mjs`: `remember` verb uses correct application-level upsert (check-then-insert-or-update). `recall` returns keyword-scored, recency-sorted results.
- `/Users/owner/Helm/` **not modified by Phase 1**. One pre-existing unstaged change (`supabase/preferences.md`) is an editorial persona change unrelated to this work.

---

## Bugs found

### BUG-1 — Cron fires at wrong time (HIGH)
**Files:** `workspace/scheduler/cron.mjs:41-45`, `workspace/scheduler/scheduler.mjs`, `workspace/scheduler/com.helm.scheduler.plist`

`cronMatches` and `nextCronDate` use JavaScript local-time methods (`date.getHours()`, `date.getMinutes()`, `date.getDate()`, `date.getMonth()`, `date.getDay()`). The machine is set to **GMT+7** (confirmed: `next_run = 1780254000` decodes to `2026-06-01 02:00:00 GMT+7`, i.e., 2 AM local).

PLAN.md §1.1 says cron fields are UTC. CLAUDE.md documents: `GMT+7 09:00 = UTC 02:00 → cron: 0 2 * * *`. The demo job uses `0 2 * * 1-5`.

With a local-time interpreter and the machine in GMT+7, cron `0 2 * * 1-5` fires at **02:00 AM local** (= 19:00 UTC previous day). The intended time was **09:00 AM GMT+7**. That requires cron `0 9 * * 1-5` in a local-time interpreter, or `0 2 * * 1-5` with UTC methods.

The cron logic and the demo job value are inconsistent with each other. The job fires seven hours early, in the middle of the night.

### BUG-2 — migrate.mjs ON CONFLICT DO NOTHING never triggers; duplicates on re-run (MED)
**File:** `workspace/memory/migrate.mjs:29-33`

The facts table schema (in both `memory.mjs` and `migrate.mjs`) has no UNIQUE constraint on `(kind, key)`. The migrate INSERT uses `ON CONFLICT DO NOTHING`, which can only fire on a primary-key conflict. The AUTOINCREMENT `id` never collides on new rows. Running migrate.mjs a second time inserts all facts again as duplicates.

The docstring says "safe to re-run — uses upsert semantics." This is false. The `remember` verb in `memory.mjs` avoids this by doing a manual check-before-insert, but migrate.mjs does not.

### BUG-3 — confirm: true not enforced by dispatcher (MED)
**File:** `workspace/tools/tools.mjs:31-52`

The dispatcher reads `tool.exec`, `tool.name`, and `tool.summary` from the registry but ignores `tool.confirm`. `imessage.send` has `"confirm": true` in registry.json. The dispatcher calls its impl directly without any gate. Any scheduled job — or any agent invocation — can send an iMessage to an arbitrary handle with no user confirmation. The only enforcement is the LLM's own behavior, which is not reliable and offers no guarantee under prompt injection.

PLAN.md §1.3 says the dispatcher should honor `confirm`. PHASE1_REPORT acknowledges this as a known gap, but it is listed here because it is a gap against the plan, not just a missing feature.

### BUG-4 — Heartbeat timer refs stored on function object in index.js (LOW)
**File:** `index.js:87-89, 93-94`

```js
ask._hbInterval = hbInterval;  // written inside the setTimeout callback
ask._hbStart = hbStart;        // written just after
// ...
clearTimeout(ask._hbStart);    // cleanup
clearInterval(ask._hbInterval);
```

Timer handles are stored as properties on the `ask` function. If `ask` were called a second time before the first resolved (impossible in the current single-owner synchronous loop, but wrong structurally), the second call would overwrite the properties and the first call's cleanup would cancel the second's timers while the first's leak. `imessage.js` gets this right: it uses `let hbStart, hbInterval` in function scope. The Discord adapter is the odd one out.

### BUG-5 — Impossible cron yields perpetual null-next_run DB writes (LOW)
**File:** `workspace/scheduler/scheduler.mjs:47-49, 115-121`

The scheduler queries `WHERE next_run IS NULL OR next_run <= unixepoch()`. If a job's cron never fires within 366 days (e.g., `0 0 30 2 *`), `nextCronDate` returns null and the job is stored with `next_run = NULL`. Every tick, the scheduler picks it up as "due", calls `cronMatches` (which returns false), then writes `next_run = NULL` again and continues. No log message is emitted. This loops silently every 30 seconds until the job is deleted. The job is never actually fired, but the writes accumulate.

No validation at add-time (in `scheduler.add.mjs`) rejects impossible expressions.

---

## Gaps vs PLAN.md

- **§1.4 — Owner notification on job completion**: PLAN says "when a scheduled run finishes (or fails), Helm DMs/iMessages a one-line summary with `runs/<...>` path." Not implemented. The result lands in `runs/` silently. Acknowledged in PHASE1_REPORT.

- **§1.5 — Symlink old session files for backward compat**: PLAN says "symlink the old files for backward compat until the next bot restart." No symlinks were created. The JSON files are preserved (not deleted) but are no longer read. If a third process or script depended on reading `.sessions.json`, it would see a stale value. This is a minor deviation.

- **§1.5 — Only last session ID migrated per adapter**: `migrateJson` takes the last value from the JSON map. If the bot had multiple active channels keyed differently, all but the last are dropped. In practice (owner-only, key='owner'), this is harmless.

- **§1.1 — Cron is documented as UTC but implemented as local**: See BUG-1. The documentation in CLAUDE.md is internally consistent with the _intent_ (UTC) but the implementation is local time. This gap caused the demo job to be registered with the wrong cron value.

- **§1.3 — confirm gate not implemented in dispatcher**: See BUG-3.

---

## Security concerns

**imessage.send without confirmation gate**: A scheduler job payload or a sufficiently crafted prompt could instruct the agent to call `tools call imessage.send --json '{"handle":"+1...", "text":"..."}'` and send a real iMessage to any handle with no user-visible confirmation step. The only defense is the LLM's own persona instructions. Severity: medium. Especially relevant if the owner enables jobs without reviewing their prompts closely.

**Unvalidated --out path in screencap.mjs**: The `--out` argument is passed directly to `screencapture` without sanitization. The agent could write a screenshot to any path writable by the process (e.g., overwriting important files, or writing to a location the owner later reads). With `bypassPermissions` already in effect this is within the agent's existing capability, but the tool adds no guard. Severity: low.

**SQL interpolation in imessage.js newMessages**: `sinceRowId` is injected directly into a SQL string at `imessage.js:163`. It is always a `Number` from `Number(rowid)`, so it is safe in practice. But if the parsing chain ever produced a non-numeric value (e.g., due to sqlite3 output format change), it would be a SQL injection point against the copy of chat.db. Severity: low.

**tool.exec parsed with split(' ')**: `tools.mjs:44` splits the `exec` field on spaces to build the argv. Any tool path containing a space would silently produce a broken command. Not exploitable today (no spaces in current paths), but registry.json is editable by the agent, so a crafted entry could be used to confuse the dispatcher. Severity: low.

---

## Recommended fixes (ordered by priority)

1. **Fix the cron timezone inconsistency.** Pick one interpretation and be consistent throughout. Recommended: switch `cronMatches` and `nextCronDate` to UTC methods (`getUTCHours()`, `getUTCMinutes()`, `getUTCDate()`, `getUTCMonth()`, `getUTCDay()`). Then `0 2 * * 1-5` correctly fires at UTC 02:00 = GMT+7 09:00 as documented. Update the `next_run` in jobs.db for the demo job to match the corrected computation. This is the only fix with immediate user-visible consequences (the job fires at 2 AM if left as-is).

2. **Fix migrate.mjs upsert semantics.** Either: (a) add `UNIQUE(kind, key)` to the facts table schema (requires an ALTER TABLE migration on existing memory.db), or (b) replace the INSERT in migrate.mjs with the same check-then-insert-or-update logic used by `memory.mjs remember`. Option (b) is the safest for existing data.

3. **Enforce confirm: true in tools.mjs dispatcher.** Before calling the impl for any tool with `"confirm": true`, print a prompt to stderr and require an explicit `--force` flag (or stdin confirmation) to proceed. Scheduler-spawned runs should document that they must pass `--force` only after LLM confirms. This closes the iMessage-without-confirmation gap.

4. **Fix heartbeat timer refs in index.js.** Replace `ask._hbStart` / `ask._hbInterval` with local `let` variables in the same pattern as `imessage.js:93-99`. No functional change for the current deployment, but correct.

5. **Guard against null next_run in the scheduler.** In `scheduler.add.mjs`: if `nextCronDate(cron)` returns null, reject the add with an error message rather than storing a null next_run. In `scheduler.mjs` tick: if after a non-firing check `nextCronDate` still returns null, log a warning and optionally auto-disable the job to stop the infinite write loop.

---

## Verdict

**FIX FIRST**

BUG-1 (cron timezone) is a silent behavioral error that will bite the owner the first time they enable the demo job: it fires at 2 AM instead of 9 AM, with no error to investigate. BUG-2 (migration idempotency) corrupts memory on re-run. BUG-3 (confirm gate) is an acknowledged gap that should be closed before the owner enables any iMessage-capable job. None of the bugs crash the daemon or break existing chat functionality, so the baseline is working. But the scheduler — which is the core new capability — will deliver wrong behavior by default until the timezone bug is fixed.
