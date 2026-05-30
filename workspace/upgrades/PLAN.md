# Helm Upgrade Plan — toward "most advanced agent"

Owner: Nice. Authored 2026-05-30. Working dir: `/Users/owner/secondme/`.
Goal: take Helm from "responsive Discord/iMessage chat → claude -p" to a
proactive, self-improving, multi-sense personal agent.

## Current state (audit)

- **Brain:** `claude -p` invoked per inbound message via Node bots (`index.js` Discord, `imessage.js` iMessage).
- **Memory:** single `workspace/CLAUDE.md` file (8KB, growing).
- **Tools:** whatever Claude Code ships + `bin/guicontrol` (mouse/keyboard) + `screencapture`.
- **Permissions:** `bypassPermissions`. Owner-locked.
- **Session continuity:** per-channel `--resume` via `.sessions.json`.
- **Runtime:** launchd jobs `com.helm.discord` (Node) and `com.helm.agent` (Python under `~/Helm/daemon/`).
- **Hard cap:** each `claude -p` run dies at 5 minutes (`index.js` line 57).

## Gaps (the "advanced agent" delta)

1. **No proactive surface.** Can only react to inbound messages. Cannot wake itself, run on a schedule, watch the screen, or pre-empt.
2. **Flat memory.** CLAUDE.md is a scratchpad — no structured facts, no semantic search, no decay, no per-topic recall.
3. **No tool registry.** Each new capability is a one-off; no place to declare "here are the verbs Helm can call, here's how, here's the cost".
4. **No long-running tasks.** 5-min cap kills any real autonomous work ("upgrade yourself for 3 hours" is impossible today).
5. **No senses beyond on-demand screenshot.** No screen watcher, notification interceptor, mic, location.
6. **Split brain.** Discord and iMessage have separate session ids; same human, different memory of the conversation.
7. **No self-evaluation.** Helm can't test its own changes or notice when it regresses.
8. **No reach.** Browser, calendar, email, Notion, banking — all unreachable except via raw shell hacks per task.

## Design principles

- **Stay in `~/secondme/`.** `~/Helm/` is off-limits per owner rule.
- **Files over services.** A SQLite DB and a `tasks/` dir beat a microservice. Easy to inspect, easy to fix.
- **Idempotent migrations.** Every upgrade must be safely re-runnable. Old behaviour preserved unless explicitly retired.
- **No new always-on dependencies the owner has to babysit.** Reuse launchd, reuse Node, reuse `claude -p`.
- **No money spent.** Local-only, owner's Max subscription is the only AI cost.
- **Confirm-gate persists.** Destructive ops still ask. `~/Helm/` still off-limits.

## Phase 1 — Foundation (autonomous, runs now)

The point of phase 1 is to make every later phase cheap. Without it, every new capability is a snowflake.

### 1.1 Self-scheduling (proactive)

- New subsystem at `workspace/scheduler/`:
  - `jobs.db` (SQLite): `id, name, cron, last_run, next_run, payload, enabled`.
  - `scheduler.mjs`: daemon, ticks every 30s, fires due jobs by spawning `claude -p` with the job's payload as prompt and `--add-dir workspace/`.
  - launchd plist `com.helm.scheduler` to keep it alive.
- A "job" can be (a) a natural-language goal Helm should pursue, or (b) a shell script. Both run through `claude -p` so the agent can adapt.
- Helm can register/edit/delete jobs from any chat. Example job: "every weekday 19:00, check Nice's exam countdown, propose a drill if he hasn't drilled today."

### 1.2 Structured memory

- New subsystem at `workspace/memory/`:
  - `memory.db` (SQLite). Tables: `facts(id, kind, key, value, source, created, updated, confidence)`, `episodes(id, ts, channel, summary, raw_ref)`, `links(from_id, to_id, kind)`.
  - `memory.mjs`: CLI used by the agent. Verbs: `remember`, `recall`, `forget`, `dump`. Embedding-free for v1 — keyword + recency ranking. Embeddings later if needed.
  - `CLAUDE.md` stays as the persona/operating doc. New `MEMORY.md` index is auto-generated from `memory.db` on each agent boot (top N most relevant facts).
- Migration: parse existing `CLAUDE.md` "Profile" + "Notes" into facts on first run. Original file preserved.

### 1.3 Tool registry

- New subsystem at `workspace/tools/`:
  - `registry.json`: declarative list — `{name, summary, exec, args_schema, requires, side_effects, confirm}`.
  - `tools.mjs`: dispatcher. `tools list`, `tools call <name> --json '{...}'`.
  - Built-in tools at boot: `screencap`, `gui.click`, `gui.type`, `gui.key`, `imessage.send`, `discord.attach`, `memory.remember`, `memory.recall`, `scheduler.add`, `scheduler.list`.
  - Each tool a single script under `tools/impl/`. Adding a tool = drop a script + entry in registry.
- The persona is updated so Helm checks `tools/registry.json` early in any non-trivial task.

### 1.4 Long-task runtime

- Remove the 5-minute hard cap from `index.js` / `imessage.js` for jobs initiated by the scheduler. Inbound chat messages keep a (longer) cap — 30 min — with a "still working…" heartbeat.
- New `workspace/runs/` dir. Each run gets `runs/<ts>-<slug>/` with `prompt.txt`, `log.jsonl`, `result.md`. Crash-resumable: the scheduler can re-spawn `claude -p --resume <sid>` on the same run dir.
- Owner notification: when a scheduled run finishes (or fails), Helm DMs/iMessages a one-line summary with `runs/<...>` path.

### 1.5 Unified session

- One `sessions.db` shared by Discord + iMessage adapters. Keyed by `owner_id` (one human → one session), not channel.
- Migration: copy existing `.sessions.json` + `.imessage-sessions.json` rows into `sessions.db`, then symlink the old files for backward compat until the next bot restart.

### 1.6 Self-test loop

- `workspace/tests/smoke.mjs`: fires after every upgrade. Verifies:
  - Discord adapter still parses messages.
  - iMessage decoder still reads `attributedBody`.
  - `claude -p` round-trip from `WORKSPACE` works.
  - `memory.recall "example query"` returns the the seeded example facts.
  - `tools list` returns ≥ all built-ins.
- Phase 1 is "done" only when smoke passes.

## Phase 2 — Reach (after Chemistry MCQ, ~2026-06-06)

Each item below is one new tool in the registry. Order = priority.

1. **`browser.*`** — Playwright-driven Chromium. `browser.open url`, `browser.read`, `browser.click selector`, `browser.fill selector text`, `browser.screenshot`. Profile dir under `workspace/browser-profile/` so logins persist.
2. **`imessage.send_to <handle> <text>`** — already half there (osascript send). Expose as a first-class tool so Helm can send unprompted.
3. **`calendar.*`** — CalendarStore or `icalBuddy` for read, `osascript Calendar` for write. `calendar.list days=7`, `calendar.add`.
4. **`email.*`** — IMAP read (Gmail app password in `.env`), `osascript Mail` send. Tagged so Helm can scan for things-needing-reply.
5. **`finder.*`** — `finder.search query`, `finder.reveal path`. Cheap but high QoL.
6. **`web.*`** — already have Claude's WebFetch/WebSearch; wrap them as registry tools so scheduler jobs can use them without a chat round-trip.

## Phase 3 — Senses (after phase 2 is stable)

1. **Screen watcher.** Every N seconds, `screencapture -x` to a ring buffer; perceptual hash diff; on significant change, optionally OCR (Vision framework) into a `screen_events` table. Helm can query "what was on screen at 14:30?".
2. **Notification interceptor.** macOS doesn't expose notifications cleanly; pragmatic path = poll Messages DB (we already do), poll Mail unread count, poll Calendar next-event.
3. **Location.** `CoreLocationCLI` (open source) when needed. Off by default. Used for context, not tracking.
4. **Mic on demand.** `sox` or `ffmpeg` for capture; whisper.cpp local for transcribe. Strictly user-invoked ("Helm, listen for 30s and summarize").

## Phase 4 — Intelligence (continuous, after phase 3)

1. **Pattern learning.** Daily job summarises the day's chats into `memory.episodes`, flags repeated requests ("user asked for X 4 times this week — propose a scheduled job").
2. **Context compression.** When a session memory gets long, distil into facts + drop raw turns.
3. **Self-modification gate.** Helm may edit `~/secondme/` source code, but every edit goes through `tests/smoke.mjs` and a git commit. Failed smoke ⇒ auto-revert.
4. **Multi-step planning.** A `plans/` subsystem: a plan is a list of `(goal, tool calls, checkpoint)`. The scheduler can resume a plan, not just a job.

## Phase 1 task list (for the autonomous run)

Execute in this order. Each ends with a green smoke test. Commit (or stage) after each.

1. `workspace/scheduler/` — db schema, `scheduler.mjs`, launchd plist (don't load yet), unit-style test for cron parsing.
2. `workspace/memory/` — db schema, `memory.mjs` with `remember/recall/forget/dump`, migration script that parses existing `CLAUDE.md` into facts.
3. `workspace/tools/` — registry.json with stubs for the 10 built-ins, dispatcher, real impl for: `screencap`, `gui.click`, `gui.type`, `gui.key`, `imessage.send`, `memory.remember`, `memory.recall`, `scheduler.add`, `scheduler.list`, `discord.attach` (the last one is just doc — Helm already attaches via the `ATTACH:` convention).
4. `workspace/runs/` — directory convention + a tiny `runs.mjs` for the scheduler to wrap a `claude -p` invocation, capture log, persist result.
5. Patch `index.js` + `imessage.js`:
   - Read shared `sessions.db` instead of per-adapter JSON.
   - Lift 5-min cap → 30 min for chats, no cap for scheduler-initiated runs.
   - Add a `still working…` heartbeat (every 60s) to chats once a run passes 30s.
6. `workspace/tests/smoke.mjs` — implement the checklist above; run it; iterate until green.
7. Load `com.helm.scheduler` via launchctl; confirm scheduler is alive; register one demo job (`every day 09:00 GMT+7: ping owner with "good morning, exam in N days"` — but DISABLED by default; owner must enable from chat).
8. Update `CLAUDE.md` with: tool registry pointer, memory query examples, scheduler usage examples.
9. Write a brief `workspace/upgrades/PHASE1_REPORT.md` summarising what changed, what didn't, what blocks remain.

## Non-goals for phase 1

- Embeddings / vector search — premature; keyword + recency is fine until proven inadequate.
- New always-on services beyond the scheduler.
- Touching `~/Helm/` for any reason.
- Spending money. No API keys, no paid services.

## Hard rules (mirror CLAUDE.md)

- Confirm before destructive, irreversible, or money-spending actions.
- No emojis, no flattery, no preamble in any output to the owner.
- Exam season (until ~2026-06-06) — do not interrupt the owner with non-urgent agent chatter.
