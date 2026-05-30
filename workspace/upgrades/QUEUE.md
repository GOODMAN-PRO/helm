# Helm upgrade queue

Drop improvement requests here (one per `- [ ]` line). The nightly self-upgrade implements the
unchecked ones, marks them done, runs the smoke gate, and commits — or auto-reverts if anything breaks.

You can add items from any chat ("Helm, add to your upgrade queue: ...") or by editing this file.

## Pending

## Done
- [x] Memory consolidation: `workspace/memory/consolidate.mjs` distils recurring episode terms into `learned` facts, decays single-evidence facts older than 30 days, prunes below floor (CLAUDE.md-sourced rows preserved), and merges duplicate `(kind, key)` rows summing evidence_count. Wired into the weekly think pass. Smoke test #13 covers it. (2026-05-30 nightly)
- [x] Semantic recall: `memory.mjs recall` now blends keyword + a TF-IDF cosine over the local corpus so meaning-related facts surface even when literal terms diverge. Falls back to keyword-only via `--keyword-only` or when the corpus is too small. Output shape unchanged. Smoke #16 anchors the shape. (2026-05-30 nightly)
- [x] Active-learning quality: `facts.evidence_count` + `facts.last_seen` columns added. First observation from `--source observed` is capped at confidence 0.7; confidence only ratchets up on independent repeats. New `memory.mjs unsure [--threshold N]` lists preferences below the threshold. Smoke #14 and #15 cover it. (2026-05-30 nightly)
- [x] Adaptive background think: `think.mjs` runs the cheap reflection prompt every tick by default but switches to a deeper WEEKLY_PROMPT once every 7 days, which writes weekly summary episodes, re-asserts evidenced low-confidence preferences, optionally proposes one DISABLED scheduler job, then runs consolidate. Mark file `workspace/think/.last-weekly-review`. (2026-05-30 nightly)
