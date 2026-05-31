# SWEEP_COGNITION_REPORT — 2026-05-31

Zone: memory/, think/, dashboard/, mcp/, swarm/

---

## Verified clean modules

All eight .mjs files in zone pass `node --check` with no syntax errors:

- workspace/memory/memory.mjs
- workspace/memory/consolidate.mjs
- workspace/memory/embed.mjs
- workspace/memory/migrate.mjs
- workspace/memory/refresh-index.mjs
- workspace/think/think.mjs
- workspace/dashboard/server.mjs
- workspace/swarm/swarm.mjs

workspace/mcp/servers.json is valid JSON; no auth tokens present.

Smoke: 23/23 passed pre-fix, 23/23 passed post-fix. One transient session test failure
between runs was caused by a background process briefly holding sessions.db — not a code
defect.

---

## DB schema inspection (workspace/memory/memory.db)

Tables confirmed: facts (50 rows), episodes (0), links (0). vectors table absent — correct,
it is created lazily on first embed call.

Active-learning columns present: evidence_count (NOT NULL DEFAULT 1), last_seen (NOT NULL
DEFAULT 0) — added via ALTER TABLE on memory.db.

UNIQUE index facts_kind_key_uniq ON facts(kind, key) — present and enforced (verified by
smoke check 23).

---

## Bugs found, severity, status

### BUG-CRIT-1: think.mjs stale lock blocks all future ticks permanently
- File: workspace/think/think.mjs line 87 (before fix)
- Severity: MEDIUM
- Description: The tick guard checked existsSync(THINK_LOCK) but never verified that the
  PID written in the lock file was still alive. A SIGKILL of the think process (e.g. OOM,
  launchd force-kill, crash before the finally block) left the lock file on disk. Every
  subsequent tick would see the file and return immediately, silently killing background
  cognition until someone manually deleted the lock. SIGTERM and SIGINT were handled
  correctly; this only affected hard terminations.
- Status: FIXED

### BUG-LOW-2: memory.mjs forget verb leaks embedding vector row
- File: workspace/memory/memory.mjs lines 244-249 (before fix)
- Severity: LOW
- Description: Deleting a fact with `memory.mjs forget <id>` did not delete the
  corresponding row from the vectors table (fact_id PRIMARY KEY references the fact id).
  Once the vectors table is populated, forgotten facts would accumulate as orphaned rows
  indefinitely, wasting space and potentially confusing future similarity queries that
  compare against stale vectors.
- Status: FIXED

### BUG-LOW-3: consolidate.mjs plain INSERT for learned facts fails on race
- File: workspace/memory/consolidate.mjs lines 76-78 (before fix)
- Severity: LOW
- Description: The INSERT for learned facts used a plain INSERT (not INSERT OR REPLACE).
  The code guards against this with a prior SELECT check (stmtFindFact), so the normal
  path always uses UPDATE when a row exists. However, a concurrent write to facts during
  consolidation (e.g. the scheduler running memory.mjs in parallel) could insert the
  same (kind='learned', key=stem) row in the window between the SELECT and the INSERT,
  causing an unhandled UNIQUE constraint failure that would abort the entire consolidation
  run with no error surfaced. The fix adds OR REPLACE as a last-resort fallback; the
  normal UPDATE path is unchanged.
- Status: FIXED

---

## Fixes applied

### Fix 1 — think.mjs: stale-lock detection
Changed the lock guard to read the PID from the lock file and call process.kill(pid, 0).
If the process is gone, the call throws, the stale lock is removed, and the tick proceeds.
If the process is alive, the skip behavior is unchanged.

```
workspace/think/think.mjs
Before:
  if (existsSync(THINK_LOCK)) { log('previous think still running — skip'); return; }

After:
  if (existsSync(THINK_LOCK)) {
    try {
      const lockedPid = parseInt(readFileSync(THINK_LOCK, 'utf8').trim(), 10);
      process.kill(lockedPid, 0);
      log('previous think still running — skip');
      return;
    } catch {
      try { rmSync(THINK_LOCK); } catch {}
      log('stale think lock removed, proceeding');
    }
  }
```

### Fix 2 — memory.mjs: delete vector on forget
Added a guarded DELETE from vectors after deleting the fact. Wrapped in try/catch so
it is a no-op when the vectors table does not yet exist.

```
workspace/memory/memory.mjs (forget case)
Added after the facts DELETE:
  try { db.prepare(`DELETE FROM vectors WHERE fact_id = ?`).run(id); } catch {}
```

### Fix 3 — consolidate.mjs: INSERT OR REPLACE for learned facts
Changed plain INSERT to INSERT OR REPLACE. The normal UPDATE path via stmtUpdateLearned
is still preferred when stmtFindFact returns a row; OR REPLACE is a safety net only.

```
workspace/memory/consolidate.mjs
  INSERT OR REPLACE INTO facts ...
```

---

## Additional findings (no fix applied)

### NOTE-1: swarm.mjs tasks.json write is not atomic relative to merge
If the swarm process is killed after a feature branch is merged into main but before
the final writeFileSync(TASKS_FILE, ...) at line 199, the task remains status:'pending'
in tasks.json but main now contains the merged code. On the next swarm run the task
would be re-built and re-merged, likely producing conflicts or a double-apply. The
restart loop at lines 131-135 re-creates worktrees from the new baseMain (which already
contains the merged feature), so the build agent would be working on top of an already-
applied change. Low probability; only affects interrupted swarm runs. A mitigation would
be writing status:'merged-pending-smoke' to tasks.json immediately before the smoke test
and reverting to 'pending' only on failure. Not fixed here — structural change to swarm
state machine; flag for owner review.

### NOTE-2: dashboard/server.mjs auto-refresh fetches full HTML page twice per cycle
The client-side refresh calls GET /api/state then GET / to parse the full HTML and
extract the #main element. This double-fetches on every 10s tick and forces a full
server-side data collection twice. Both requests are served from localhost with no
external I/O risk; the correctness and security are fine (all values pass through
esc()). Performance impact is negligible. No fix required.

### NOTE-3: embed.mjs isModelAvailable initializes _pipeline as side effect
The function name implies a pure check, but it also warms the pipeline (_pipeline = ...).
This is intentional design (warm once, reuse), but the function name is misleading.
No behavior bug; cosmetic issue only.

### NOTE-4: think.mjs skip window uses getHours() (local time, local time)
The 00:00-05:00 upgrade-window skip is evaluated in local time. The self-upgrade job
runs at 03:00 local. These are consistent. If the Mac's system timezone changes, the
window would shift. Acceptable; no fix required.

---

## Open questions for owner

1. swarm.mjs NOTE-1: should swarm write task status atomically during the merge+smoke
   sequence to survive interrupted runs? Requires a small state-machine change.

2. think.mjs skip window (NOTE-4): should the 00:00-05:00 window be in UTC or local
   time? Currently local (the owner's region). If the machine ever travels timezones, the window
   drifts. Consider storing the upgrade schedule in UTC and comparing against UTC hours.

---

## Verdict

Three bugs fixed (one medium, two low). Smoke 23/23 clean. All new cognitive features
(consolidation, embeddings, active-learning, think daemon, dashboard) are correctly
wired. No broken imports, no schema mismatches, no committed secrets, no open external
listeners.
