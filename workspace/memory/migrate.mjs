#!/usr/bin/env node
// One-time migration: parse CLAUDE.md Profile + Notes sections into memory.db facts.
// Safe to re-run — uses upsert semantics (existing key is updated, not duplicated).

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE  = path.resolve(__dirname, '..');
const CLAUDE_MD  = path.join(WORKSPACE, 'CLAUDE.md');
const DB_PATH    = path.join(__dirname, 'memory.db');

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS facts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT    NOT NULL DEFAULT 'fact',
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL,
    source     TEXT,
    confidence REAL    NOT NULL DEFAULT 1.0,
    created    INTEGER NOT NULL DEFAULT (unixepoch()),
    updated    INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// A brand-new DB created above (and older DBs) lacks the temporal columns that memory.mjs and
// consolidate.mjs add lazily. Add them idempotently BEFORE the dedup DELETE references expired_at —
// otherwise the first migration on a FRESH DB crashes with "no such column: expired_at".
for (const ddl of [
  `ALTER TABLE facts ADD COLUMN valid_from INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE facts ADD COLUMN expired_at INTEGER`,
  `ALTER TABLE facts ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0`,
]) { try { db.exec(ddl); } catch {} }

// Deduplicate active rows only — keep lowest id per (kind, key) among non-expired rows.
// Expired rows are historical records and must not be touched.
db.exec(`
  DELETE FROM facts WHERE expired_at IS NULL AND id NOT IN (
    SELECT MIN(id) FROM facts WHERE expired_at IS NULL GROUP BY kind, key
  )
`);

// Long-term guard against re-introducing duplicates. Partial index (WHERE expired_at IS NULL)
// enforces uniqueness among active rows only, allowing multiple expired rows per (kind,key).
// CREATE INDEX IF NOT EXISTS is a no-op when the index already exists (from memory.mjs init).
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS facts_kind_key_uniq ON facts(kind, key) WHERE expired_at IS NULL`);

const stmtFind   = db.prepare(`SELECT id FROM facts WHERE kind = ? AND key = ? AND expired_at IS NULL`);
const stmtInsert = db.prepare(
  `INSERT INTO facts (kind, key, value, source, confidence) VALUES (?, ?, ?, 'CLAUDE.md', 1.0)`
);
const stmtUpdateVal = db.prepare(
  `UPDATE facts SET value = ?, source = 'CLAUDE.md', updated = unixepoch() WHERE id = ?`
);

let inserted = 0;

function upsert(kind, key, value) {
  const existing = stmtFind.get(kind, key);
  if (existing) {
    stmtUpdateVal.run(value, existing.id);
  } else {
    stmtInsert.run(kind, key, value);
    inserted++;
  }
}

const text = readFileSync(CLAUDE_MD, 'utf8');

// Extract bullet lines from Profile and Notes sections.
// Pattern: "- **Key:** Value" or "- Value"

// Parse "- **Key:** Value" style lines
for (const [, key, value] of text.matchAll(/^[-*]\s+\*\*([^*]+)\*\*[:\s]+(.+)$/gm)) {
  const k = key.trim();
  const v = value.trim();
  if (k && v) upsert('profile', k, v);
}

// Parse exam lines
for (const [, name, date] of text.matchAll(/\*\*([A-Za-z ]+MCQ[A-Za-z ]*)\*\*\s*[—–-]+\s*([^\n]+)/gm)) {
  upsert('exam', name.trim(), date.trim());
}

// Notes: whole bullet points as standalone facts
const notesMatch = text.match(/## Notes\n([\s\S]*?)(?=\n## |\s*$)/);
if (notesMatch) {
  const notesText = notesMatch[1];
  // Capture multi-line notes as single facts
  const bulletRe = /^- (.+?)(?=\n- |\n{2,}|$)/gms;
  for (const [, body] of notesText.matchAll(bulletRe)) {
    const oneline = body.replace(/\s+/g, ' ').trim();
    if (oneline.length > 10) upsert('note', oneline.slice(0, 80), oneline);
  }
}

db.close();
console.log(`Migration complete. ${inserted} new facts inserted (existing facts updated in place).`);
