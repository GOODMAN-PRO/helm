# Helm upgrade queue

Drop improvement requests here (one per `- [ ]` line). The nightly self-upgrade implements the
unchecked ones, marks them done, runs the smoke gate, and commits — or auto-reverts if anything breaks.

You can add items from any chat ("Helm, add to your upgrade queue: ...") or by editing this file.

## Pending
(none)

## Done
- [x] Hermes gap-closure: built `workspace/skills/` on Mac with loader.mjs (listSkills/runSkillCommand), seed skill files (helm-core, reverse-engineering, screenshot-and-show), wired into index.js with /skill and /skills commands, added smoke assertion for >= 3 skills. All 69 smoke tests green. (2026-05-31 nightly self-upgrade)
- [x] Scheduler `notify` flag exposed at add-time: `scheduler.add` now accepts `--notify true|false` (default true), `scheduler.list` surfaces it, `registry.json` documents it. Closes the §1.4 deferral from BUGS_REPORT — owner can opt housekeeping jobs out of completion DMs while keeping the proactive default on. Smoke #22. (2026-05-31 nightly)
- [x] DB-level dedup guard for memory: UNIQUE index `facts_kind_key_uniq` on `facts(kind, key)` created in both `memory.mjs` boot init and `migrate.mjs` (after the dedup pass). Closes the deferred half of BUG-2 — direct SQL inserts can no longer reintroduce duplicates. Smoke #23. (2026-05-31 nightly)
- [x] iMessage row-id SQL hardening: `newMessages(sinceRowId)` in `imessage.js` now coerces `sinceRowId` to a non-negative integer (`Math.max(0, Math.floor(Number(...) || 0))`) before interpolating into the chat.db sqlite3 CLI query, removing the raw-number-interpolation smell from PHASE1_REVIEW. (2026-05-31 nightly)
- [x] Memory consolidation: `workspace/memory/consolidate.mjs` distils recurring episode terms into `learned` facts, decays single-evidence facts older than 30 days, prunes below floor (CLAUDE.md-sourced rows preserved), and merges duplicate `(kind, key)` rows summing evidence_count. Wired into the weekly think pass. Smoke test #13 covers it. (2026-05-30 nightly)
- [x] Semantic recall: `memory.mjs recall` now blends keyword + a TF-IDF cosine over the local corpus so meaning-related facts surface even when literal terms diverge. Falls back to keyword-only via `--keyword-only` or when the corpus is too small. Output shape unchanged. Smoke #16 anchors the shape. (2026-05-30 nightly)
- [x] Active-learning quality: `facts.evidence_count` + `facts.last_seen` columns added. First observation from `--source observed` is capped at confidence 0.7; confidence only ratchets up on independent repeats. New `memory.mjs unsure [--threshold N]` lists preferences below the threshold. Smoke #14 and #15 cover it. (2026-05-30 nightly)
- [x] Adaptive background think: `think.mjs` runs the cheap reflection prompt every tick by default but switches to a deeper WEEKLY_PROMPT once every 7 days, which writes weekly summary episodes, re-asserts evidenced low-confidence preferences, optionally proposes one DISABLED scheduler job, then runs consolidate. Mark file `workspace/think/.last-weekly-review`. (2026-05-30 nightly)
