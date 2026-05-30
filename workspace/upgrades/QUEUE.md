# Helm upgrade queue

Drop improvement requests here (one per `- [ ]` line). The nightly self-upgrade implements the
unchecked ones, marks them done, runs the smoke gate, and commits — or auto-reverts if anything breaks.

You can add items from any chat ("Helm, add to your upgrade queue: ...") or by editing this file.

## Pending
- [ ] Memory consolidation: nightly distil `episodes` into durable `facts`, decay stale low-confidence facts, dedupe near-identical facts/preferences. Add `memory/consolidate.mjs` + a smoke check.
- [ ] Semantic recall: add local embeddings (no paid API) so `recall` ranks by meaning, not just keywords. Fall back to keyword if the embedding model is unavailable. Keep `recall` output shape unchanged.
- [ ] Active-learning quality: track evidence count + last-seen per preference; only raise confidence when independent evidence repeats; surface a "preferences I'm unsure about" list for occasional confirmation.
- [ ] Background think: make the tick adaptive — cheap reflection most ticks, a deeper weekly review that summarises the week into episodes and proposes (disabled) scheduler jobs.

## Done
