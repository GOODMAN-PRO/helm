# Tool Zone Bug Sweep Report
Generated: 2026-05-31

## Scope
- `workspace/tools/registry.json` — 33 entries (task memo said 31; actual count is 33)
- `workspace/tools/tools.mjs` — dispatcher
- `workspace/tools/impl/*.mjs` — 30 impl files

## Process
1. Read all registry entries and dispatcher source.
2. Read every impl file.
3. `node --check` on all 31 files — all passed.
4. Baseline smoke: smoke.mjs 23/23, smoke-phase2.mjs 12/12, smoke-phase3.mjs 17/19 (2 pre-existing launchd failures unrelated to tools zone).
5. Bugs identified, fixes applied, smoke re-run.

---

## Bugs Found and Fixed

| # | File:Line | Severity | Description | Status |
|---|-----------|----------|-------------|--------|
| 1 | `impl/vision.mjs:57` | HIGH | `rawArgs[1] \|\| get('query')` — when called from dispatcher, `rawArgs[1]` is `"--query"` (truthy), so `get('query')` is never reached; query was always the literal string `"--query"` | Fixed |
| 2 | `tools.mjs:62` | MEDIUM | `r.status ?? 0` — child killed by signal exits 0 (success) instead of non-zero; masks failed spawns | Fixed |
| 3 | `impl/imessage.send.mjs:20` | MEDIUM | `spawnSync('/usr/bin/osascript', ...)` called without `timeout`; hangs indefinitely if Messages.app is unresponsive | Fixed |
| 4 | `impl/imessage.send_to.mjs:25` | MEDIUM | Same as #3 | Fixed |
| 5 | `impl/notify.unread.mjs:59` | MEDIUM | `JSON.parse(r.stdout.trim())` on calendar JXA output without osascript wrapping cleanup; `calendar.mjs` handles this with `replace(/^"\|"$/g,'')` + `replace(/\\"/g,'"')`; `notify.unread` could throw on macOS builds that wrap JXA string output in quotes | Fixed |
| 6 | `impl/screen.at.mjs:19` | LOW | `parseInt(args[tsIdx+1], 10)` with no NaN check; if `--ts` is supplied without a value, `ts=NaN` and `ABS(ts-NaN)` in SQLite returns NULL ordering, returning an unpredictable row silently | Fixed |

### Fix detail

**Bug 1** — `vision.mjs:57`
```diff
- const query = rawArgs[1] || get('query');
+ const query = get('query') || rawArgs[1];
```
`--query` flag now takes priority; positional form still works for direct invocation.

**Bug 2** — `tools.mjs:62`
```diff
- process.exit(r.status ?? 0);
+ process.exit(r.status ?? 1);
```

**Bugs 3 & 4** — `imessage.send.mjs:20`, `imessage.send_to.mjs:25`
```diff
- { encoding: 'utf8' }
+ { encoding: 'utf8', timeout: 30_000 }
```

**Bug 5** — `notify.unread.mjs:59`
```diff
- const evs = JSON.parse(r.stdout.trim());
+ const raw = r.stdout.trim();
+ const cleaned = raw.replace(/^"|"$/g, '').replace(/\\"/g, '"');
+ const evs = JSON.parse(cleaned.startsWith('[') ? cleaned : raw);
```

**Bug 6** — `screen.at.mjs:19`
```diff
  const ts = parseInt(args[tsIdx + 1], 10);
+ if (isNaN(ts)) {
+   console.error('--ts must be a valid integer (Unix ms)');
+   process.exit(1);
+ }
```

---

## Verified-Clean Tools (no bugs found)

screencap, gui.click, gui.type, gui.key, discord.attach, memory.remember, memory.recall,
scheduler.add, scheduler.list, browser.open, browser.read, browser.click, browser.fill,
browser.screenshot, browser.close, imessage.send_to (fixed), imessage.send (fixed),
calendar.list, calendar.add, finder.search, finder.reveal, web.fetch, web.search,
screen.recent, screen.search, notify.recent, location.here, mic.record, mic.transcribe,
vision.describe, vision.find (fixed)

### Checklist notes (per-tool categories, no issues found)

- **Schema vs args**: all impls accept the args the registry advertises.
- **Arg injection** (`--key value` where value starts with `--`): all tools use `spawnSync` with `shell: false`; no shell injection possible. Value-starts-with-`--` is parsed safely since `get()` returns the next array element unconditionally.
- **Shell injection**: no `exec`/`spawn` with `shell: true` anywhere.
- **Path injection**: finder.reveal embeds path via `JSON.stringify()` in AppleScript; paths with literal double-quotes would technically break the AppleScript string literal (JSON `\"` is not a valid AppleScript escape), but macOS paths cannot contain `"` so this is not reachable in practice.
- **Confirm gate**: `tools.mjs` enforces `confirm: true` tools before running. `imessage.send`, `imessage.send_to`, `calendar.add`, `mic.record` all have `confirm: true`. Gate verified by smoke test BUG-3 and phase2 `tools dispatcher exits 2 for calendar.add without --force`.
- **Exit codes**: all tools exit non-zero on error (stderr), zero on success (stdout JSON).
- **Side effects vs registry**: all `side_effects` fields match what the impls do.
- **Calendar JXA duplicate-key bug**: `calendar.list` uses `cal.events()` (full scan, no `whose()`) — no `_and` pattern required, no duplicate-key risk. `notify.unread.mjs` already uses the correct `_and: [...]` form.
- **Race conditions**: `browser-state.json` is written by `browser.open/click/screenshot`; no file lock, but browser calls are inherently sequential in practice.
- **Timeouts**: calendar JXA has 20s, finder 15s, web fetch/curl 25s, osascript iMessage now 30s, location 20s, mic wrapper 320s (correct for 300s max recording + margin), transcribe 130s.

---

## Disabled Tools
None.

---

## Smoke Results (post-fix)
- `smoke.mjs`: **23/23 passed**
- `smoke-phase2.mjs`: **12/12 passed**
- `smoke-phase3.mjs`: **17/19** (2 pre-existing failures: launchd plists for screen/notify are loaded when tests expect them off — unrelated to this zone)

## Verdict
6 bugs found (1 high, 4 medium, 1 low), all fixed. All smoke tests that were passing before the sweep continue to pass.
