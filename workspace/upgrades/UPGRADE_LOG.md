
## 2026-05-30T11:37:46.647Z — NO CHANGES
- base: 5abcfc1b00f37baa45ddfc503a01b50054991ff9
- head: 5abcfc1b00f37baa45ddfc503a01b50054991ff9
- summary: (dryrun: no changes)

## 2026-05-30T13:56:44.383Z — APPLIED 99e1adb
- base: efbf7272b5e31ec652669791f3b77548874be48d
- head: 99e1adb713a59f461754c3447be7aa52106b9150
- summary: All 16 smoke tests green. Both bots parse cleanly. ## Summary of nightly self-upgrade Implemented all four QUEUE items and verified them with new regression tests (smoke 12→16, all green). **Active-learning gate (`workspace/memory/memory.mjs`)** — Added `evidence_count` + `last_seen` columns (idempotent ALTERs, with backfill). When a preference is `remember`d with `--source observed`, the first observation is capped at confidence 0.7; identical-value repeats increment `evidence_count` and ratchet confidence upward only — never overwrite higher confidence. New `unsure [--threshold N]` verb surfaces low-confidence preferences for the owner to confirm. Existing recall/dump/forget/episode behaviour unchanged. **Semantic recall** — `recall` now blends the existing keyword score with a pure-Node TF-IDF cosine over the local fact corpus, taking the stronger of the two signals. Output shape preserved (internal `_score`/`_k`/`_s` keys are stripped). `--keyword-only` flag and small-corpus auto-fallback satisfy the "embedding unavailable" path; the real-model swap point is marked in a comment. **`workspace/memory/consolidate.mjs` (new)** — Three idempotent passes: (1) distil recurring st
