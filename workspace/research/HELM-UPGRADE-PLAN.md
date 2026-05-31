# HELM-UPGRADE-PLAN.md
*Synthesized from 10 research reports — 2026-05-31*
*Stack: Node bot → `claude -p` → SQLite memory/plans/sessions → cron scheduler → guicontrol/screencapture → Playwright → git-worktree swarm → smoke gate → nightly self-upgrade → secrets vault. Mac M1 Pro + Windows SSH.*

---

## 1. Executive Summary

Helm is 80% of the way to being a world-class personal agent. The gap is not model capability — it's harness engineering. The 10 research reports identify the same failure modes that killed every production agent in 2025-2026: runaway loops, context drift, brittle GUI clicks, memory that doesn't compound, and a build swarm that produces unreviewed output.

The upgrades below close those gaps. They fall into five themes:

1. **Reliability rails** — stop runaway costs, add circuit breakers, checkpoint long jobs
2. **Smarter memory** — BM25+entity retrieval, temporal validity, LLM distillation from episodes
3. **GUI that doesn't miss clicks** — coordinate fix, verify loop, accessibility tree, Playwright MCP
4. **Planning that plans** — plan-before-act UX, DAG parallelism, reflexion retry, replanning
5. **Swarm 2.0** — str_replace edits, localize-then-repair, critic gate, prompt caching

Every upgrade listed is buildable on the current stack in one or two sessions. No new infrastructure except where explicitly noted. The roadmap is sequenced to ship value in the first week, not after a month of refactoring.

---

## 2. Top 10 Upgrades Ranked by Impact/Effort

### #1 — Circuit Breakers + Cost Tracking
**Impact: 5 | Effort: 1.5**

**What it is:** A CircuitBreaker class wrapping every tool call (closed → open after 5 consecutive failures, half-open probe after 60s). Paired with a cost tracker that logs `{model, input_tokens, cached_tokens, output_tokens, cost_usd}` to `workspace/costs/costs.db` after every `claude -p` call, and a `/cost` bot command that returns a daily table.

**Why it matters:** A real April 2026 incident: agent entered a retry loop at 11 PM, made thousands of identical failed calls by 7 AM. Helm has no defense against this today. Without a circuit breaker, one stuck tool or rate-limited API can run to zero tokens and zero budget. The cost tracker makes spend visible before it becomes a problem. Both are <100 LOC.

**Concrete build approach:**
- `workspace/tools/circuit-breaker.mjs` — CircuitBreaker class, state persisted in `workspace/tools/circuit-state.db`
- Wrap the `call()` dispatcher in `workspace/tools/tools.mjs`
- `workspace/costs/cost-tracker.mjs` — append-only log, `getCostSummary(since)` query
- Add `/cost` handler in Discord bot that calls `getCostSummary(yesterday)`
- Add `maxIterations: 50` and `maxWallTime: 600s` guards to any agent loop

---

### #2 — Plan-Before-Act + Autonomy Mode
**Impact: 5 | Effort: 1**

**What it is:** For any task estimated at >2 shell commands or touching files/git, Helm replies with a numbered plan first: `Plan:\n1. ...\n2. ...\n→ Proceed?`. Owner replies or stays silent (after 60s auto-proceed in autopilot mode). Three selectable modes via `!mode suggest|copilot|autopilot`, stored in `memory.db` as `preference helm.autonomy_mode`.

**Why it matters:** Devin's #1 cited differentiator. Catches misunderstood intent before damage. Shifts oversight from step-by-step babysitting to strategic review. The autonomy dial means trust escalates naturally — Anthropic's own research shows users start at 20% autonomous approval, reach 40% by session 750. Start conservative; the mode system allows expanding. This is primarily a behavior/CLAUDE.md change — near-zero code.

**Concrete build approach:**
- CLAUDE.md addition: formalize plan-before-act protocol and three guardrail tiers (auto / brief-notice / intent-preview + "yes")
- `workspace/tools/impl/plan-reply.mjs` — format the plan block and send via helm-push
- `!mode` command handler in Discord bot (~30 lines) — reads/writes `preference helm.autonomy_mode`
- Escalation gate: when stuck mid-task, DM "Stuck: [task]. At: [step]. Options: A/B/C" then write pending-decision row to `workspace/tasks.db`

---

### #3 — Memory Intelligence Upgrade (BM25 + Temporal Validity + LLM Consolidation)
**Impact: 5 | Effort: 2.5**

**What it is:** Three layered memory upgrades: (a) replace TF-IDF with BM25+entity-boost retrieval using RRF fusion; (b) add `valid_from`/`expired_at` columns so fact changes are tracked, not overwritten; (c) replace stem-counting consolidation with a weekly LLM call that distils recent episodes into durable facts.

**Why it matters:** Helm's current recall does TF-IDF + cosine. This gives identical scores to a memory from 5 min ago and 5 weeks ago, and misses exact keyword matches. BM25 is the single biggest retrieval improvement in every 2026 memory benchmark (+10-20pp on multi-hop). Temporal validity prevents the "preference flips silently" bug that produces contradictory context. LLM consolidation replaces the broken stem-counting with actual understanding — this is why Mem0 scores 94.4 on LongMemEval.

**Concrete build approach:**
- `workspace/memory/memory.mjs recall`: add BM25 (~30 lines JS), RRF fusion `1/(60+rank_bm25) + 1/(60+rank_cosine)`, entity boost (1.3× for facts whose key matches query tokens)
- `ALTER TABLE facts ADD COLUMN valid_from INTEGER DEFAULT (unixepoch()); ADD COLUMN expired_at INTEGER;` — on same-key update with different value, set `expired_at` on old row, INSERT new row
- `memory.mjs history <kind> <key>` verb for version history
- Access-count decay: `ALTER TABLE facts ADD COLUMN access_count INTEGER DEFAULT 0;` — bump on every recall hit; update `consolidate.mjs` decay formula to `confidence * exp(-λ*days) * log1p(access_count)`
- Weekly think pass: pipe last 7 days of episodes through `claude -p` with extraction prompt → JSON array of `{kind, key, value}` → run `memory.mjs remember` for each

---

### #4 — GUI Hardening (Coordinate Fix + Verify Loop + Playwright MCP)
**Impact: 5 | Effort: 2**

**What it is:** Three GUI fixes that compound: (a) `bin/guiclick` wrapper that detects Retina scale factor at runtime and divides before clicking; (b) mandatory screenshot-verify loop after every action (takes <200ms via `claude -p` with "did [action] succeed? YES/NO"); (c) Playwright MCP added to `workspace/mcp/servers.json` for all browser tasks, using accessibility tree instead of pixel-hunting.

**Why it matters:** The coordinate bug is Helm's #1 silent failure — CLAUDE.md says "divide by 2" but no code enforces it. One missed click cascades through a 5-step GUI task with no error signal. The verify loop catches failures immediately. Playwright MCP replaces fragile screenshot+guicontrol for web tasks with semantic accessibility tree targeting — 78%→42% success rate drop when tree is unavailable (UC Berkeley 2026). Together these are a 3x reliability improvement on all GUI tasks.

**Concrete build approach:**
- `bin/guiclick` (~15 lines): `scale=$(system_profiler SPDisplaysDataType | grep "Resolution" | ...)`, compute `pt_x = px_x / scale`, call `guicontrol click $pt_x $pt_y`, log the translation
- `workspace/tools/impl/gui_task.mjs`: `async guiStep(action, description, maxRetries=3)` — exec action, screenshot, `claude -p "Did [description] succeed? YES or NO"`, retry with failure classification on NO
- `workspace/mcp/servers.json`: add `{"playwright": {"command": "npx", "args": ["-y", "@playwright/mcp@latest", "--headless"]}}`
- Failure classifier: before retry, classify WRONG_ELEMENT / NOT_FOUND / PAGE_NOT_LOADED / AUTH_WALL; dispatch appropriate recovery

---

### #5 — Prompt Caching via SDK Migration
**Impact: 5 | Effort: 3**

**What it is:** Replace `claude -p` subprocess calls with direct `@anthropic-ai/sdk` Node.js API calls that use `cache_control: {type: "ephemeral"}` on the static system prompt (CLAUDE.md + memory INDEX.md). Also switch short classification/formatting tasks to `claude-haiku-4-5` via model routing.

**Why it matters:** Helm's CLAUDE.md + INDEX.md is ~3,000+ tokens injected on every call. At $3/M input tokens (Sonnet 4.6), cache hits are $0.30/M — 90% savings. For a bot making 50 calls/day with a 3k-token system prompt, that's ~$1.30/day saved → ~$475/year at essentially zero effort once implemented. The latency reduction (85%) makes responses feel faster. Model routing for simple tasks (classify/format/summarize) to Haiku 4.5 cuts costs a further 30-60% on those calls.

**Concrete build approach:**
- `workspace/tools/impl/claude-runner.mjs` — wraps `@anthropic-ai/sdk` `messages.create`, adds `cache_control` on system + INDEX.md blocks, logs token usage to `costs.db`
- Message structure: system (CLAUDE.md + INDEX, cached) → prior turns (dynamic) → new user message (uncached)
- Task router: `classifyTaskComplexity(prompt)` → returns `"haiku"|"sonnet"|"opus"` based on keyword patterns; wire into runner
- Replace `child_process.exec("claude -p ...")` calls in bot handlers with `runner.mjs` calls

---

### #6 — Swarm 2.0: str_replace + Localize-Repair + Critic Gate
**Impact: 5 | Effort: 3**

**What it is:** Three upgrades to the git-worktree build swarm: (a) str_replace edit protocol instead of whole-file rewrites; (b) two-phase localize-then-repair for coding tasks; (c) critic pass before any PR is opened.

**Why it matters:** The current swarm writes whole files — this overwrites changes, loses context, and fails on large files. Five independent agent systems converged on str_replace semantics (old-string → new-string) independently. Localize-then-repair is the dominant SWE-bench architecture — identify files/functions first (repo map + grep), then generate patch with only those excerpts in context. The critic pass is the last gate before a PR opens: "review this diff for logic errors, security issues, test gaps — PASS or FAIL." These three together are why OpenHands reaches 72% SWE-bench Verified vs Helm's swarm producing ~unverified output.

**Concrete build approach:**
- `workspace/swarm/apply-edit.mjs`: parse `<<<OLD / === / >>>NEW` fences from agent output, `String.replace()` (error if not found or matched >1 time), auto-revert via `git checkout <path>` on lint failure, feed diff back to agent
- `workspace/swarm/coding-task.mjs`: Phase 1 `claude -p` (localization prompt → JSON `{file, lines, reason}`), Phase 2 `claude -p` gets only those excerpts + task
- Post-task critic in `workspace/swarm/smoke.mjs`: `claude -p "review this diff: PASS or FAIL + issues"` — on FAIL, attach critique to Discord notification instead of opening PR
- ACI-style bounded tools: `workspace/swarm/tools/view_file.sh` (100-line window), `search_repo.sh` (returns file list not matches), `search_file.sh` (match lines capped at 50)

---

### #7 — Context Management: Anchored Summarization + Handoff Payloads
**Impact: 4 | Effort: 2**

**What it is:** Two patterns: (a) session anchor — after every 10 turns or 60% context, run a summarization step and maintain a `session_anchor.json` with schema `{intent, changes_made, decisions_taken, next_steps, constraints}`; on resume, inject anchor not raw history. (b) structured handoff JSON between swarm agents instead of free-form markdown.

**Why it matters:** 65% of enterprise agent failures in 2025 traced to context drift — conflicting info accumulating across turns. Context rot is documented at 2% retention loss per step; at 5 steps, <60% of original intent is reliably accessible. The anchored summary preserves intent across compaction. The structured handoff prevents the swarm's orchestrator from re-reading 50-page agent outputs to find the relevant 200 words.

**Concrete build approach:**
- `workspace/sessions/` — add `compact.mjs`: detects token threshold (60% of nominal limit), runs `claude -p "summarize in structured JSON: intent, changes_made, decisions_taken, next_steps, constraints"`, writes `session_anchor.json`, scheduler can trigger after long sessions
- Swarm handoff schema: `{worker_id, task, artifacts:[], key_findings:[], decisions_made:[], open_questions:[], confidence: 0.8}` — worker writes `handoff.json` before exit; orchestrator reads only this, not raw output
- Swarm runner: after each turn, scan message history and replace `ReadFile` results older than 3 turns with `[file read: <path>, <N> lines — dropped]`

---

### #8 — ProAct Think Daemon + Interrupt Gate
**Impact: 4 | Effort: 2**

**What it is:** Two enhancements to `com.helm.think`: (a) interrupt gate — before any unsolicited DM, compute `interrupt_score = (urgency × relevance × confidence) / (focus_cost × recency_penalty)` and only push if score > 0.65; (b) forward-looking pass — analyze last 10 recalls + episodes to predict what the owner will need in the next 2 hours, pre-research it, cache to `workspace/think/prefetch-cache.json` (TTL 2h).

**Why it matters:** ProAct (arXiv:2605.25971) shows 14.8% fewer turns, 11.7% less user effort, 28.1% fewer hallucinations from idle-time pre-research. Helm's 15-min think daemon runs but has no direction — it currently might push a DM about anything, at any time. The interrupt gate prevents it from becoming noise. The prefetch cache means the next question is often already answered before it's asked. The 15-min tick already exists; these are logic additions to the think prompt.

**Concrete build approach:**
- `workspace/think/think.mjs` addition: after normal think pass, add forward-looking section: "Based on recent episodes and goals, what is most likely needed in the next 2 hours? Pre-research top prediction and output `{prediction, answer, confidence, ttl_s}`"
- Write result to `workspace/think/prefetch-cache.json`; bot checks cache before calling `claude -p` on incoming messages
- Interrupt score: add `computeInterruptScore(finding, recentDMs, activeGoals)` function; only call `helm-push.mjs` if score > 0.65
- Inputs: urgency from deadline keywords, relevance from memory recall score, focus_cost from ambient transcript keywords ("meeting", "call", fast typing rate)
- Ambient listener daemon (`com.helm.listener`): whisper.cpp Metal build + Silero VAD, captures mic in 30s rolling chunks, tags chunks with keywords for focus_cost estimation

---

### #9 — Planning Engine: DAG Parallelism + Reflexion Retry
**Impact: 4 | Effort: 2.5**

**What it is:** Two planning upgrades: (a) add `deps` column to `steps` table — steps with no unresolved deps are fired in parallel as separate `claude -p` subprocesses, same as the swarm today; (b) Reflexion-on-failure — when a step exits non-zero, call `claude -p "Step failed: [error]. One-sentence diagnosis and fix."`, store in step checkpoint, insert retry step with reflection as context.

**Why it matters:** LLMCompiler-style DAG parallelism shows 3.6x speedup on multi-tool workflows. Research tasks (web search + file read + memory recall) have no dependencies between them — running sequentially wastes 2/3 of wall-clock time. Reflexion (arXiv:2303.11366) converts failure signals into targeted retries without fine-tuning. Currently when a plan step fails, it just fails — no diagnosis, no retry, no escalation. These two upgrades are the biggest productivity multiplier for complex autonomous tasks.

**Concrete build approach:**
- `ALTER TABLE steps ADD COLUMN deps TEXT DEFAULT '[]'; ALTER TABLE plans ADD COLUMN replan_count INTEGER DEFAULT 0;`
- `plan.mjs next` rewrite: `WHERE status='pending' AND deps satisfied` — returns all runnable steps, not just next sequential
- Scheduler: when `next` returns multiple steps, spawn N parallel `claude -p` subprocesses (same pattern as swarm worktrees)
- `plan.mjs` `complete` verb: on step failure, call `claude -p` reflection prompt, store in `checkpoint`, insert retry step at `idx + 0.5`; cap at 2 retries then escalate to owner
- Replanning node: after max retries, `claude -p "original goal + completed steps + failure → revised remaining steps"`, replace all pending steps

---

### #10 — MCP Expansion: GitHub + Calendar + Brave Search
**Impact: 4 | Effort: 2**

**What it is:** Add three MCP servers to `workspace/mcp/servers.json`: GitHub official (`github/github-mcp-server` — issues, PRs, code search, Actions status), Google Workspace (`taylorwilsdon/google_workspace_mcp` — Calendar + Gmail, OAuth via secrets vault), Brave Search (replace ad-hoc curl calls). Extend server config to include health checks and a `workspace/mcp/check.mjs` startup diagnostic.

**Why it matters:** Helm's two current MCP servers (filesystem, fetch) cover local file operations and HTTP fetch. GitHub MCP unlocks issue/PR management, code search, and Actions status without shell `gh` calls. Google Calendar unlocks "block time for study", "what's on my calendar this week" — high-frequency student tasks. Brave Search replaces unreliable ad-hoc curl with a proper tool schema. Health checks surface MCP startup failures that currently cause silent tool loss.

**Concrete build approach:**
- `workspace/mcp/servers.json`: add `github` (binary or Docker, PAT from secrets vault), `google-workspace` (Node, OAuth creds from vault, Calendar+Gmail scopes only), `brave-search` (API key from vault)
- `workspace/mcp/check.mjs`: iterate servers, run healthCheck command, report UP/DOWN to stdout; call from bot startup
- Extend server entry schema: `{command, args, env, healthCheck, tools: [{name, description}], enabled: true}`
- Zod validation in `workspace/tools/impl/*.mjs`: 3-line schema at top of each impl before executing, return `{error, issues}` on failure

---

## 3. Phased Plan

### Phase 0 — Quick Wins (Day 1, 1-2 hours each)
*Immediate value, zero or trivial infrastructure.*

| Upgrade | File(s) | Time |
|---|---|---|
| Circuit breaker + cost tracker | `workspace/tools/circuit-breaker.mjs`, `workspace/costs/cost-tracker.mjs` | 2h |
| Plan-before-act + guardrail tiers | CLAUDE.md additions | 30min |
| `bin/guiclick` coordinate wrapper | `bin/guiclick` (~15 lines) | 30min |
| Playwright MCP + Brave Search MCP | `workspace/mcp/servers.json` 2 entries | 30min |
| Constrained planning prompt + verbal self-critique | CLAUDE.md + `plan.mjs create` prompt | 1h |
| Conflict detection + access-count decay | `workspace/memory/memory.mjs` | 1h |
| Confidence signaling + async DM receipts | CLAUDE.md + `bin/helm-notify` wrapper | 1h |

---

### Phase 1 — Foundation Sprint (Week 1, 2-4h sessions)
*Core reliability + memory intelligence.*

1. **BM25+entity retrieval** — `memory.mjs recall` rewrite. Ship in isolation; immediately improves every recall.
2. **Temporal validity columns** — DB migration + `remember` logic update. No breaking changes.
3. **Token budget per session** — `sessions.db` column + pre-call check. Prevents surprise cost spikes.
4. **SQLite checkpoint resume** — `checkpoints` table in `plans.db` + `complete`/`next` updates.
5. **Screenshot-verify loop** — `workspace/tools/impl/gui_task.mjs`. Mandatory for all GUI tasks.
6. **`!mode` autonomy command** — Discord handler + `helm.autonomy_mode` memory preference.
7. **Escalation gate protocol** — `workspace/tools/impl/escalate.mjs` + pending-decision DB row.
8. **Anchored session summarization** — `workspace/sessions/compact.mjs`, inject anchor on resume.
9. **Structured handoff payload** — swarm `HANDOFF_SCHEMA` + orchestrator reads `handoff.json`.

---

### Phase 2 — Capability Sprint (Week 2-3)
*Swarm upgrades + planning engine + MCP expansion.*

1. **str_replace edit protocol** — `workspace/swarm/apply-edit.mjs`. Foundation for all coding edits.
2. **ACI bounded tool wrappers** — `workspace/swarm/tools/view_file.sh`, `search_repo.sh`, `search_file.sh`.
3. **Localize-then-repair two-phase swarm** — `workspace/swarm/coding-task.mjs`.
4. **Critic gate before PR** — extend `workspace/swarm/smoke.mjs`.
5. **Step dependency DAG** — `deps` column migration + executor loop rewrite.
6. **Reflexion-on-failure retry** — `plan.mjs complete` failure path + `replan_count` cap.
7. **SDK migration + prompt caching** — `workspace/tools/impl/claude-runner.mjs` replacing `claude -p` subprocess.
8. **GitHub + Google Workspace MCP** — `servers.json` + health checks + `workspace/mcp/check.mjs`.
9. **LLM episodic consolidation** — weekly think pass extension + episode logging in bot handlers.

---

### Phase 3 — Big Bets (Week 4+)
*Ambient intelligence + graph memory + voice.*

1. **Ambient listener daemon** — `com.helm.listener` launchd: whisper.cpp Metal + Silero VAD → episode pipeline. ~1 day setup.
2. **ProAct interrupt gate + prefetch cache** — think daemon forward-looking pass. Reuses existing infra.
3. **Entity-relation graph in memory.db** — `relations` table, `link`/`traverse`/`neighbors` verbs, graph-aware consolidation.
4. **macOS Accessibility API** — `osascript` element enumeration for native app GUI control.
5. **Multi-critic self-upgrade gate** — diff critic + style critic in nightly `com.helm.selfupgrade`.
6. **Tree-sitter repo map** — `workspace/swarm/repo-map.mjs` for swarm coding task context.
7. **MCTS / best-of-N swarm** — `workspace/swarm/best-of-n.mjs`, parallel worktrees + judge agent.
8. **Streamable HTTP MCP bridge** — Mac↔Windows tool sharing over SSH tunnel.
9. **`say` TTS + hotword trigger** — ambient voice I/O on Mac.

---

## 4. QUEUE-Ready Task List

Copy this directly into `workspace/upgrades/QUEUE.md`. Each line is a discrete swarm-executable task.

```
## HELM UPGRADE QUEUE — 2026-05-31

### Phase 0 (Do First — same-day wins)
- [ ] Create workspace/tools/circuit-breaker.mjs: CircuitBreaker class (threshold=5, cooldown=60s), state in workspace/tools/circuit-state.db, wrap tools.mjs call() dispatcher
- [ ] Create workspace/costs/cost-tracker.mjs: log {timestamp, model, input_tokens, cached_tokens, output_tokens, cost_usd} to workspace/costs/costs.db; add /cost Discord command
- [ ] Add token budget per session: ALTER TABLE sessions ADD COLUMN tokens_used INTEGER DEFAULT 0, token_budget INTEGER DEFAULT 100000; enforce pre-call check in session handler
- [ ] CLAUDE.md: add plan-before-act protocol (>2 shell commands → numbered plan reply → wait for go), three guardrail tiers (auto/brief-notice/intent-preview+yes), confidence signaling ([confident]/[uncertain]/[guessing]) for factual claims
- [ ] Create bin/guiclick: detect Retina scale via system_profiler, divide px coords by scale, call guicontrol click, log translation; replace all hardcoded guicontrol click calls
- [ ] workspace/mcp/servers.json: add playwright entry (npx -y @playwright/mcp@latest --headless) and brave-search entry (BRAVE_API_KEY from vault)
- [ ] CLAUDE.md: formalize constrained planning prompt (inject tool registry names into planning prompt so Claude only plans achievable steps)
- [ ] plan.mjs create: add verbal self-critique pass after plan creation ("are all steps achievable? anything missing?"), store as first checkpoint
- [ ] memory.mjs remember: add conflict detection (when kind+key exists with different value, log episode "fact superseded: [kind]/[key] was '[old]'", set expired_at)
- [ ] memory.mjs: ALTER TABLE facts ADD COLUMN access_count INTEGER DEFAULT 0; bump on every recall hit; update consolidate.mjs decay formula to include log1p(access_count)
- [ ] Create bin/helm-notify wrapper: all scheduled jobs call helm-notify on exit; sends DONE DM via helm-push.mjs with {task, duration, files_changed, summary}
- [ ] Discord bot: add !mode handler (suggest/copilot/autopilot), read/write preference helm.autonomy_mode to memory.db

### Phase 1 (Week 1 — Foundation)
- [ ] memory.mjs recall: replace TF-IDF with BM25 scoring (~30 lines JS, IDF from corpus at startup); add RRF fusion: score = 1/(60+bm25_rank) + 1/(60+cosine_rank); add entity boost 1.3x for facts whose key matches query tokens
- [ ] memory.mjs: ALTER TABLE facts ADD COLUMN valid_from INTEGER DEFAULT (unixepoch()); ADD COLUMN expired_at INTEGER; update remember verb to INSERT new row + set expired_at on old; update recall to WHERE expired_at IS NULL; add history verb
- [ ] plans.db: CREATE TABLE IF NOT EXISTS checkpoints (id, plan_id, step_id, state_json, created_at); plan.mjs complete: write checkpoint after each step; plan.mjs next: return latest checkpoint alongside next step
- [ ] Create workspace/tools/impl/gui_task.mjs: guiStep(action, description, maxRetries=3) — exec action, screencapture, claude -p verify ("did [description] succeed? YES/NO"), retry on NO with failure classification (WRONG_ELEMENT/NOT_FOUND/PAGE_NOT_LOADED/AUTH_WALL)
- [ ] Create workspace/sessions/compact.mjs: detect token threshold (60% of 100k), run claude -p summarization → {intent, changes_made, decisions_taken, next_steps, constraints}, write session_anchor.json; scheduler triggers after sessions > 10 turns
- [ ] Create workspace/tools/impl/escalate.mjs: format "Stuck: [task]. At: [step]. Problem: [reason]. Options: A/B/C" DM via helm-push; write pending-decision row to workspace/tasks.db; scheduler checks pending rows each tick
- [ ] Swarm: define HANDOFF_SCHEMA constant ({worker_id, task, artifacts, key_findings, decisions_made, open_questions, confidence}); update worker prompt to write handoff.json before exit; update orchestrator to read handoff.json not raw output
- [ ] Swarm runner: after each turn, replace ReadFile results older than 3 turns with "[file read: <path>, <N> lines — dropped]" summary entries in message history
- [ ] memory.db: add core kind (max 15 entries); update refresh-index.mjs INDEX.md template to put core facts first, remaining facts truncated to top 40 by recency+confidence
- [ ] memory.mjs: add staleness tagging in refresh-index.mjs: mark [STALE?] for facts where updated > 120 days, confidence < 0.85, evidence_count < 3

### Phase 2 (Week 2-3 — Capability)
- [ ] Create workspace/swarm/apply-edit.mjs: parse <<<OLD/===/>>>NEW fences from agent output, String.replace (error if not found or >1 match), auto-revert via git checkout on lint failure (node --check / py -m py_compile), feed diff back to agent
- [ ] Create workspace/swarm/tools/view_file.sh (100-line window with 2-line overlap), search_repo.sh (returns file list not match lines), search_file.sh (match lines capped at 50); add signatures to swarm system prompt
- [ ] Create workspace/swarm/coding-task.mjs: Phase 1 claude -p localization prompt → JSON {file, lines, reason}; Phase 2 claude -p gets only those excerpts + task; no whole-repo context in Phase 2
- [ ] workspace/swarm/smoke.mjs: add critic pass post-build: claude -p "review this diff: PASS or FAIL + specific issues"; on FAIL, attach critique to Discord notification, do not open PR
- [ ] plans.db: ALTER TABLE steps ADD COLUMN deps TEXT DEFAULT '[]'; ALTER TABLE plans ADD COLUMN replan_count INTEGER DEFAULT 0; rewrite plan.mjs next to return all runnable steps (deps satisfied); scheduler spawns parallel claude -p subprocesses for each
- [ ] plan.mjs complete: on step exit non-zero, call claude -p reflection prompt ("step failed: [error]. one-sentence diagnosis and fix"), store in checkpoint, insert retry step at idx+0.5; max 2 retries then escalate via escalate.mjs
- [ ] plan.mjs: add replan verb — takes original goal + completed steps + failure + reason → claude -p "revised remaining steps" → replace pending steps; cap replan_count at 3
- [ ] Create workspace/tools/impl/claude-runner.mjs: wraps @anthropic-ai/sdk messages.create, adds cache_control:{type:"ephemeral"} on system (CLAUDE.md + INDEX.md) and last large static block, logs token usage to costs.db; replace child_process.exec("claude -p ...") calls in bot handlers
- [ ] workspace/tools/impl/claude-runner.mjs: add task router — classifyTaskComplexity(prompt) returns "haiku"|"sonnet"|"opus" based on keyword patterns; route classify/format/summarize to haiku-4-5
- [ ] workspace/mcp/servers.json: add github entry (github-mcp-server binary, GITHUB_PAT from vault); add google-workspace entry (google_workspace_mcp npx, OAuth creds from vault, Calendar+Gmail scopes only)
- [ ] Create workspace/mcp/check.mjs: iterate servers, run healthCheck command, report UP/DOWN; call from bot startup; extend server entry schema with healthCheck, tools list, enabled flag
- [ ] Add Zod validation to workspace/tools/impl/*.mjs: 3-line schema at top of each impl before executing, return {error, issues} on failure so Claude can self-correct
- [ ] com.helm.think weekly pass: add LLM consolidation step — pipe last 7 days of episodes through claude -p extraction prompt → JSON [{kind,key,value}] → run memory.mjs remember for each; replace stem-counting
- [ ] bot handlers: add memory.mjs episode add at end of notable Discord/iMessage conversations (sessions > 5 turns or containing action keywords)
- [ ] plan.mjs: add step result propagation — plan.mjs complete stores stdout in result column; executor builds prior-step context using #E1 variable substitution before calling claude -p

### Phase 3 (Week 4+ — Big Bets)
- [ ] Install whisper.cpp with Metal build; create workspace/voice/listener.mjs daemon: ffmpeg avfoundation mic capture → Silero VAD (onnxruntime-node) → whisper-cli transcript → append to workspace/voice/transcript-buffer.jsonl; launchd plist com.helm.listener
- [ ] Create workspace/voice/summarize.mjs: every 10 min, claude -p summarize transcript buffer → memory.mjs episode add; run from com.helm.listener on interval
- [ ] workspace/think/think.mjs: add interrupt gate — computeInterruptScore(finding, recentDMs, activeGoals) → only call helm-push if score > 0.65; inputs: urgency from deadline keywords, relevance from memory recall score, focus_cost from voice transcript keywords
- [ ] workspace/think/think.mjs: add forward-looking pass — "what will owner most likely need in next 2 hours? pre-research top prediction" → write {prediction, answer, confidence, ttl_s} to workspace/think/prefetch-cache.json; bot checks cache before claude -p on incoming messages
- [ ] memory.db: CREATE TABLE IF NOT EXISTS relations (id, from_id REFERENCES facts, relation TEXT, to_id REFERENCES facts, weight REAL DEFAULT 1.0, created_at); add memory.mjs link/traverse/neighbors verbs; update consolidation to decay weak relations
- [ ] workspace/swarm/repo-map.mjs: run npx tree-sitter over target dir, extract def/ref tags, rank by cross-file reference count (PageRank-lite), binary-search to fit in ~1500 tokens; inject as repoMap field in swarm job payload
- [ ] com.helm.selfupgrade: extend smoke gate to multi-critic pipeline: (1) existing smoke.mjs, (2) diff critic claude -p "review git diff for security regressions, breaking changes, logic errors", (3) style critic "check for violations of Helm operating principles"; all three must pass; write findings to workspace/upgrades/CRITIQUE.md on failure
- [ ] Create workspace/swarm/best-of-n.mjs: accept coding task JSON, spawn N parallel worktree-based runs, wait for all (or timeout), call judge claude -p with N diffs + original task, return winning diff; wire to Discord !swarm best-of <N> <task>
- [ ] Create workspace/mcp/bridge-server.mjs: Fastify + @modelcontextprotocol/sdk Streamable HTTP server wrapping screencap and guicontrol tools; launchd plist on each machine; tunnel via SSH for Mac↔Windows tool sharing
- [ ] macOS Accessibility API integration: create workspace/tools/impl/axui.mjs wrapping osascript accessibility queries; returns element list with bounding boxes for native app GUI control; use as primary targeting before screenshot fallback
- [ ] bot reply handler: add optional say TTS output — `say -v Samantha -r 200 "$(echo "$REPLY" | head -c 400)"`; controlled by preference helm.voice_output in memory.db
```

---

## Cross-Cutting Principles (applies to all upgrades)

1. **The harness is the binding constraint, not the model.** 65% of enterprise agent failures trace to harness defects. Ship the circuit breaker before any new feature.
2. **One tool call per iteration** (Manus pattern). Prevents cascading failures. Don't fan out unbounded.
3. **Write artifacts, not inline content.** Workers write to `workspace/runs/<ts>/`, pass file paths back. Prevents context blowout.
4. **Checkpoint before any compaction.** Extract structured summaries at 60% context, not 92%. By 92%, critical constraints are already lost.
5. **Plan plans before plans execute.** Constrained planning (tool registry injection) + verbal self-critique before step 1. Costs one LLM call; catches 60% of obvious failures.
6. **Trust is earned incrementally.** Start in copilot mode. Every autonomous success earns more latitude. Never ship autopilot as default.
