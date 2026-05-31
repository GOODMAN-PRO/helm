# FIX_DEFERRED_REPORT — 2026-05-31

Resolves all four open items from SWEEP_COGNITION_REPORT.md (NOTE-1 through NOTE-4).

---

## Smoke results

**Before:** smoke 23/23, phase2 12/12, phase3 17/19 (2 pre-existing plist failures)
**After:**  smoke 24/24, phase2 12/12, phase3 17/19 (same 2 pre-existing plist failures, no new failures)

---

## Item 1 — NOTE-1: swarm.mjs task state not atomic

**File:** `workspace/swarm/swarm.mjs`

**What changed:**

Added a `flushTasks(tasks)` helper that writes `tasks.json` to disk. The merge
sequence now uses three intermediate states:

- `merging` — written before `git merge`. If swarm crashes here, the state of main
  is unknown. On next startup, swarm logs a warning and skips the task, requiring
  operator review.
- `merged-pending-smoke` — written immediately after a successful merge, before
  smoke runs. If swarm crashes here, the code is already in main. On next startup,
  swarm treats the task as already-applied and skips rebuild.
- `done` — written only after smoke passes (unchanged meaning).
- `pending` — task reverts to this state if smoke fails and git reverts the merge.

The startup `todo` filter was expanded to handle `merged-pending-smoke` (skip with
info log) and `merging` (skip with WARN log). Previously it only excluded `done`.

The final `writeFileSync` at the end of the run is now a call to `flushTasks` for
consistency; this is redundant but ensures any in-flight state from async rejections
is persisted.

**Why `flushTasks` on every transition, not just at the end:**
The original bug was that a crash between merge and the final write left tasks.json
stale. Writing after each state change means the worst case is one task in an
ambiguous state (logged and skipped), not silent re-application of already-merged
code.

**Smoke test added:** check 24 in `workspace/tests/smoke.mjs` — verifies that
`'merging'` and `'merged-pending-smoke'` literals are in source, `flushTasks` helper
is present, the operator-review warning exists, and the assignment order is correct
(t.status='merging' before the git merge call; t.status='merged-pending-smoke' after).

---

## Item 2 — NOTE-2: dashboard double-fetch

**File:** `workspace/dashboard/server.mjs`

**What changed:**

The client-side `refresh()` function previously called `GET /api/state` for the
timestamp, then `GET /` to get full HTML and extract `#main`. That was two server
round-trips and two full `buildState()` calls per 10-second refresh cycle.

The fix moves all rendering logic into the `<script>` block as client-side JavaScript:
`esc()`, `fmtTs()`, `renderServices()`, `renderMemory()`, `renderJobs()`,
`renderJournal()`, `renderUpgrades()`, `renderGit()`, and `renderAllCards()` are now
duplicated on the client. The `refresh()` function now only calls `GET /api/state`,
takes the returned JSON, calls `renderAllCards(state)` client-side, and sets
`#main.innerHTML`. No second HTTP request.

The initial page load (first paint) is unchanged — the server still renders the full
HTML via `buildHTML(state)` on `GET /`.

**Why both server and client have the renderers:**
The initial load must be synchronous (no client JS execution before first paint). The
server-side renderers stay for that path. The client-side copies handle live refresh.
They are identical in logic; a mismatch would only cause cosmetic inconsistency on
refresh, not data corruption.

---

## Item 3 — NOTE-3: embed.mjs cosmetic rename

**Files:** `workspace/memory/embed.mjs`, `workspace/memory/memory.mjs`

**What changed:**

`isModelAvailable()` renamed to `ensurePipelineLoaded()`. The name now accurately
describes the side effect: it warms `_pipeline` as well as checking availability.
Return type is unchanged (boolean).

A deprecated alias is kept for one release cycle:
```js
export const isModelAvailable = ensurePipelineLoaded; // DEPRECATED: remove after one cycle
```

The caller in `memory.mjs` (lines 191-193) is updated to import and call
`ensurePipelineLoaded` directly.

The smoke test (check 19) still passes because `isModelAvailable` remains exported
via the alias. The test label still says "isModelAvailable" — that is a cosmetic
mismatch in the test label only and does not affect correctness.

---

## Item 4 — NOTE-4: think.mjs skip window TZ

**File:** `workspace/think/think.mjs`

**What changed:**

Two module-level constants added:
```js
const THINK_QUIET_START = 0; // 00:00 local
const THINK_QUIET_END   = 5; // 05:00 local
```

The tick guard now uses these constants instead of bare literals.

A comment block above the constants explains why local time is correct:
launchd's `StartCalendarInterval` for `com.helm.selfupgrade` and `com.helm.discord`
also uses local time, so using UTC would shift the quiet window relative to the
actual upgrade job. The window tracks "owner's overnight" rather than a fixed UTC
range, which is the intended behavior regardless of machine timezone.

No behavior change. The comment and constants make the intent discoverable and
the window endpoints editable in one place.

---

## New findings discovered while fixing

- smoke.mjs check 24 first failed because `indexOf("'merged-pending-smoke'")` returned
  the position inside the startup filter (earlier in the file), not the assignment
  inside the merge loop. Fixed by checking for `indexOf("t.status = 'merged-pending-smoke'")`.
  This is a general fragility in source-inspection smoke tests: string search must
  match the specific assignment form, not any occurrence of the literal.

- The dashboard `buildHTML` function renders `renderAllCards` server-side for first
  paint and also embeds the client-side copy inside `<script>`. The two copies are
  structurally identical. If the server-side renderers are ever changed, the
  client-side copy must be updated in sync. This is the expected trade-off given the
  constraint of "no HTML re-fetch on refresh."
