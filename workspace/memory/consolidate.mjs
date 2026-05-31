#!/usr/bin/env node
// Helm memory consolidation.
//
// Run nightly. Does three things, all idempotent:
//   1. Distil recent episodes into durable facts when the same topic recurs.
//   2. Decay stale, low-confidence, never-repeated facts; prune sub-floor rows.
//   3. Dedupe near-identical facts/preferences within the same kind+key, merging
//      evidence counts and keeping the highest confidence.
//
// Flags:
//   --dry-run        report changes without writing
//   --since-days N   distillation window (default 30)
//   --decay-days N   age in days before a fact starts decaying (default 30)
//   --floor C        prune facts with confidence below this AND evidence_count<2 (default 0.05)
//
// Owner-safe by design: facts with source='CLAUDE.md' or evidence_count>=2 are never pruned.

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.join(__dirname, 'memory.db');

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) { flags[args[i].slice(2)] = next; i++; }
      else flags[args[i].slice(2)] = true;
    }
  }
  return flags;
}

const flags = parseFlags(process.argv.slice(2));
const DRY = flags['dry-run'] === true || flags['dry-run'] === 'true';
const SINCE_DAYS = parseInt(flags['since-days'] ?? 30, 10);
const DECAY_DAYS = parseInt(flags['decay-days'] ?? 30, 10);
const FLOOR      = parseFloat(flags.floor ?? 0.05);

const db = new DatabaseSync(DB_PATH);
// Ensure the active-learning columns exist (consolidate may run before memory.mjs ever did).
try { db.exec(`ALTER TABLE facts ADD COLUMN evidence_count INTEGER NOT NULL DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE facts ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0`); } catch {}
db.exec(`UPDATE facts SET last_seen = COALESCE(NULLIF(last_seen, 0), updated)`);

const stats = { distilled: 0, decayed: 0, pruned: 0, deduped: 0 };

// --- 1. distil recurring episode topics into facts -----------------------------
//
// Heuristic: tokenise summaries from the last N days, count significant stems
// (>=4 chars, non-stop), and promote any stem mentioned in >=3 distinct episodes
// to a learned fact. The value is the episode count + most-recent example.
const STOP = new Set(['the','and','that','this','with','from','have','will','for','was','were',
  'are','his','her','its','their','they','them','our','your','all','any','but','not','can','could',
  'would','should','about','when','where','what','which','also','been','been','some','only','just',
  'into','than','then','more','most','very','over','helm','owner','nice']);
const sinceTs = Math.floor(Date.now() / 1000) - SINCE_DAYS * 86400;
const eps = db.prepare(`SELECT id, ts, summary FROM episodes WHERE ts >= ? ORDER BY ts ASC`).all(sinceTs);
const stemCount = new Map();      // stem -> Set(episode ids)
const stemExample = new Map();    // stem -> latest summary mentioning it
for (const e of eps) {
  const toks = (e.summary || '').toLowerCase().match(/[a-z]{4,}/g) || [];
  for (const w of new Set(toks)) {
    if (STOP.has(w)) continue;
    const stem = w.replace(/ies$/, 'y').replace(/(?:ing|ed|s)$/, '') || w;
    if (!stemCount.has(stem)) stemCount.set(stem, new Set());
    stemCount.get(stem).add(e.id);
    stemExample.set(stem, e.summary);
  }
}
const stmtFindFact = db.prepare(`SELECT id, evidence_count FROM facts WHERE kind = 'learned' AND key = ?`);
const stmtUpsertLearned = db.prepare(
  `INSERT OR REPLACE INTO facts (kind, key, value, source, confidence, evidence_count, last_seen)
   VALUES ('learned', ?, ?, 'consolidate', ?, ?, unixepoch())`
);
const stmtUpdateLearned = db.prepare(
  `UPDATE facts SET value = ?, confidence = ?, evidence_count = ?, last_seen = unixepoch(),
                    updated = unixepoch() WHERE id = ?`
);
for (const [stem, ids] of stemCount) {
  if (ids.size < 3) continue;
  const conf = Math.min(0.9, 0.4 + 0.1 * ids.size);
  const value = `mentioned in ${ids.size} episodes (last: "${(stemExample.get(stem) || '').slice(0, 120)}")`;
  const existing = stmtFindFact.get(stem);
  if (DRY) { stats.distilled++; continue; }
  if (existing) stmtUpdateLearned.run(value, conf, ids.size, existing.id);
  else stmtUpsertLearned.run(stem, value, conf, ids.size);
  stats.distilled++;
}

// --- 2. decay stale low-confidence facts --------------------------------------
//
// Only single-evidence ('soft') facts decay; anything reinforced is held steady.
// CLAUDE.md-sourced facts never decay or prune — they're the persona baseline.
const now = Math.floor(Date.now() / 1000);
const decayStartTs = now - DECAY_DAYS * 86400;
const decayCandidates = db.prepare(
  `SELECT id, confidence, last_seen, evidence_count, source FROM facts
    WHERE evidence_count < 2 AND last_seen < ? AND confidence > ?
      AND (source IS NULL OR source != 'CLAUDE.md')`
).all(decayStartTs, FLOOR);
// Also advance last_seen by the number of stale weeks consumed so the same decay
// step is not re-applied on every subsequent nightly run within the same week bucket.
const stmtSetConf = db.prepare(
  `UPDATE facts SET confidence = ?, last_seen = last_seen + ? WHERE id = ?`
);
for (const f of decayCandidates) {
  const weeksStale = Math.floor((now - f.last_seen - DECAY_DAYS * 86400) / (7 * 86400));
  if (weeksStale <= 0) continue;
  const newConf = Math.max(FLOOR / 2, f.confidence * Math.pow(0.9, weeksStale + 1));
  if (newConf < f.confidence - 0.01) {
    if (!DRY) stmtSetConf.run(newConf, weeksStale * 7 * 86400, f.id);
    stats.decayed++;
  }
}

// Prune anything below floor that was never reinforced.
const pruneIds = db.prepare(
  `SELECT id FROM facts WHERE confidence < ? AND evidence_count < 2
    AND (source IS NULL OR source != 'CLAUDE.md')`
).all(FLOOR).map(r => r.id);
if (!DRY && pruneIds.length) {
  db.exec(`DELETE FROM facts WHERE id IN (${pruneIds.join(',')})`);
}
stats.pruned = pruneIds.length;

// --- 3. dedupe identical facts within the same kind+key -----------------------
//
// (kind, key) should be unique by application convention. If multiple rows exist
// for the same pair, merge: keep the row with the highest confidence and most
// recent last_seen; sum evidence counts onto it; delete the rest.
const dupGroups = db.prepare(
  `SELECT kind, key, COUNT(*) c FROM facts GROUP BY kind, key HAVING c > 1`
).all();
const stmtGroupRows = db.prepare(
  `SELECT id, confidence, evidence_count, last_seen FROM facts
    WHERE kind = ? AND key = ? ORDER BY confidence DESC, last_seen DESC`
);
for (const g of dupGroups) {
  const rows = stmtGroupRows.all(g.kind, g.key);
  const [keep, ...losers] = rows;
  const totalEvidence = rows.reduce((s, r) => s + (r.evidence_count || 1), 0);
  if (!DRY) {
    db.prepare(`UPDATE facts SET evidence_count = ? WHERE id = ?`).run(totalEvidence, keep.id);
    db.exec(`DELETE FROM facts WHERE id IN (${losers.map(r => r.id).join(',')})`);
  }
  stats.deduped += losers.length;
}

db.close();
console.log(JSON.stringify({ dry_run: DRY, ...stats }, null, 2));
