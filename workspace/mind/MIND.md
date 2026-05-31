# Helm Mind — the AI-first second brain protocol

Helm Mind turns the HelmBrain Obsidian vault into a living, AI-first second brain (inspired by the
open `obsidian-second-brain` skill, adapted to Helm's PARA vault). Every input compounds knowledge:
conversations, research and captures **rewrite existing notes**, they don't just pile up.

## Three rules
1. **The vault rewrites itself.** Prefer updating an existing note over creating a new one. Merge new
   facts into the right page; supersede stale claims instead of duplicating.
2. **Two-output rule.** When you answer something worth keeping, also write it back into the vault —
   every session leaves a trace.
3. **Vault-first.** Before researching externally, search the vault for what's already known; only go
   to the web for the gaps, and record contradictions you find.

## Where things live (HelmBrain PARA — reuse it, never make a parallel vault)
- `00 Inbox/` — zero-friction captures awaiting filing
- `01 Journal/` — daily notes + work logs
- `02 People/` — person/entity notes
- `03 Projects/` — active projects (decisions, tasks, status)
- `04 Areas/` — ongoing responsibilities
- `05 Resources/` — concepts, frameworks, research notes
- `06 Archive/` — done/inactive
- `MOCs/` — Maps of Content / synthesis pages that link clusters together

(Path is machine-aware: `/Users/owner/HelmBrain` on Mac, `C:\Users\User\HelmBrain` on Windows. Never create a new vault.)

## AI-first note format
Every note is optimized for future-Helm retrieval first, human reading second:

```markdown
---
type: person | concept | project | research | daily | decision | area
tags: [..]
sources: [url, ...]
last_updated: YYYY-MM-DD
confidence: high | medium | low
recency: YYYY-MM-DD   # when the vault learned this
---

> For future Helm: 2-3 sentences on what this note is and why it matters.

## Key claims
- Claim text (as of YYYY-MM, source.com, confidence: high)

## Details
Context, examples, related entities via [[wikilinks]].

## Contradictions
- Conflicts with [[other note]] — status: open | resolved (how)
```

## Verbs (run via `node workspace/tools/impl/mind.mjs <verb> "<input>"`, or `mind <verb> ...` in chat)
- **save** — pull decisions, people, tasks and ideas out of a conversation and merge each into the right note.
- **capture** — one-line idea straight into `00 Inbox/` (no friction).
- **find** — vault-first smart search; synthesize an answer from existing notes with links.
- **synthesize [topic]** — discover patterns across notes and write/update a synthesis page in `MOCs/`.
- **research <topic>** — vault-first, then fill gaps from the web; write an AI-first research note with sources + recency.
- **daily** — create/update today's note in `01 Journal/`.
- **recap [day|week|month]** — summarize recent activity from the vault.
- **health** — audit the vault for orphans, stale claims, and contradictions; fix the safe ones, report the rest.

## Nightly agent
`com.helm.mind` (quiet window) runs `synthesize` + `health` so the brain stays coherent: it heals
orphans, reconciles contradictions, and distils patterns while you sleep.
