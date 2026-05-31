// Shared session store for Discord + iMessage adapters.
// Both adapters key sessions by the canonical owner key ('owner')
// so they share one Claude conversation thread.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.join(__dirname, 'sessions.db');

const db = new DatabaseSync(DB_PATH);
// Without a busy timeout the second writer gets an immediate SQLITE_BUSY when
// the Discord and iMessage processes both call setSession concurrently.
db.exec(`PRAGMA busy_timeout = 5000`);
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    key        TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    adapter    TEXT,
    updated    INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// One-time migration from legacy JSON files (idempotent — uses INSERT OR IGNORE).
function migrateJson(jsonPath, adapter) {
  if (!existsSync(jsonPath)) return;
  try {
    const map = JSON.parse(readFileSync(jsonPath, 'utf8'));
    // Take the most recent session (last value) as the owner session seed.
    const entries = Object.values(map).filter(Boolean);
    if (entries.length === 0) return;
    const sid = entries[entries.length - 1];
    db.prepare(
      `INSERT OR IGNORE INTO sessions (key, session_id, adapter) VALUES ('owner', ?, ?)`
    ).run(sid, adapter);
  } catch { /* corrupt json — skip */ }
}

// Only run migrations once (when the sessions table is empty).
const count = db.prepare(`SELECT COUNT(*) as n FROM sessions`).get();
if (count.n === 0) {
  migrateJson(path.join(__dirname, '.sessions.json'), 'discord');
  migrateJson(path.join(__dirname, '.imessage-sessions.json'), 'imessage');
}

const stmtGet = db.prepare(`SELECT session_id FROM sessions WHERE key = ?`);
const stmtSet = db.prepare(`
  INSERT INTO sessions (key, session_id, adapter, updated)
  VALUES (?, ?, ?, unixepoch())
  ON CONFLICT(key) DO UPDATE SET session_id=excluded.session_id,
    adapter=excluded.adapter, updated=unixepoch()
`);
const stmtDel = db.prepare(`DELETE FROM sessions WHERE key = ?`);

export function getSession(key = 'owner') {
  const row = stmtGet.get(key);
  return row ? row.session_id : null;
}

export function setSession(key = 'owner', sessionId, adapter = null) {
  if (sessionId == null || sessionId === '')
    throw new Error('setSession: sessionId must be a non-empty string');
  stmtSet.run(key, sessionId, adapter);
}

export function deleteSession(key = 'owner') {
  stmtDel.run(key);
}
