# Phase 1 Report

Completed: 2026-05-30.

## What changed

### 1. Scheduler subsystem (workspace/scheduler/)
- `cron.mjs` — 5-field cron parser. Supports `*`, lists, ranges, steps. Also computes next fire date.
- `init-db.mjs` — idempotent jobs.db schema creation.
- `scheduler.mjs` — daemon: ticks every 30s, fires enabled due jobs by spawning `claude -p`. Each job run lands in `workspace/runs/<ts>-<slug>/` with prompt.txt, log.jsonl, result.md.
- `com.helm.scheduler.plist` — launchd plist. Loaded into `~/Library/LaunchAgents/`. Confirmed alive (PID seen in launchctl list).
- Demo job `good-morning` registered, DISABLED by default. Owner enables from chat.

### 2. Memory subsystem (workspace/memory/)
- `memory.mjs` — CLI: remember/recall/forget/dump/episode. Keyword + recency ranking with simple stemming (plurals, -ing, -ed).
- `migrate.mjs` — one-shot import of CLAUDE.md Profile + Notes into facts. 22 facts migrated on first run.
- `memory.db` — live. Contains profile, exam, and note facts.

### 3. Tool registry (workspace/tools/)
- `registry.json` — 10 declared tools with schemas, side_effects, confirm flags.
- `tools.mjs` — dispatcher: `list` and `call <name> --json` verbs.
- `impl/` — one script per tool: screencap, gui.click, gui.type, gui.key, imessage.send, discord.attach, memory.remember, memory.recall, scheduler.add, scheduler.list.

### 4. Runs subsystem (workspace/runs/)
- `runs.mjs` — makeRunDir, appendLog, finaliseRun. Used by scheduler to persist job output.

### 5. Bot patches (index.js, imessage.js)
- Both now import `workspace/sessions.mjs` (unified sessions.db) instead of per-adapter JSON files.
- Session key is `'owner'` for both adapters — one brain thread across Discord + iMessage.
- 5-minute hard cap lifted to 30 minutes for chat messages.
- Heartbeat added: after 30s without a reply, sends "still working..." every 60s.
- Legacy JSON session files migrated into sessions.db on first import.

### 6. Tests (workspace/tests/smoke.mjs)
- 8 tests, all green.
- Covers: Discord/iMessage source code structural checks, claude -p round-trip (haiku model), memory recall of the seeded example facts, tools list, sessions.db round-trip, cron correctness, runs dir creation.

### 7. CLAUDE.md
- Added "Phase 1 subsystems" section: tool registry pointer, memory query examples, scheduler usage, unified sessions note.

## Blocks remaining

None for Phase 1.

## Known gaps / notes for Phase 2

- **screencapture**: still needs Screen Recording permission on the node process. Unchanged from pre-Phase-1 state.
- **guicontrol**: not tested end-to-end during this run. Accessibility permission may need granting.
- **Embeddings**: memory uses keyword + stemming for recall. Adequate for now; vector search deferred.
- **Scheduler notification**: when a job finishes, Helm does not yet DM the owner with a summary. The result lands in `runs/`; owner would need to ask. This is a Phase 1.5 / Phase 2 add.
- **imessage.send confirm gate**: marked `"confirm": true` in registry but the gate is not enforced at the dispatcher level yet. Dispatcher currently calls the impl directly. Phase 2 should add a confirm prompt flow for `confirm: true` tools.
- **Phase 2 target**: after Chemistry MCQ (~2026-06-06), per PLAN.md.
