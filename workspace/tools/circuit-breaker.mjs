#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = path.join(__dirname, 'circuit-state.db');
mkdirSync(__dirname, { recursive: true });

const FAIL_THRESHOLD = 5;
const HALF_OPEN_AFTER_MS = 60_000;

let _db = null;
function openDb() {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    _db.exec(`CREATE TABLE IF NOT EXISTS circuits (
      name       TEXT PRIMARY KEY,
      state      TEXT    NOT NULL DEFAULT 'closed',
      failures   INTEGER NOT NULL DEFAULT 0,
      opened_at  INTEGER
    )`);
  }
  return _db;
}

function getRow(name) {
  return openDb()
    .prepare(`SELECT state, failures, opened_at FROM circuits WHERE name = ?`)
    .get(name) ?? { state: 'closed', failures: 0, opened_at: null };
}

function setRow(name, state, failures, opened_at) {
  openDb().prepare(`
    INSERT INTO circuits (name, state, failures, opened_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      state     = excluded.state,
      failures  = excluded.failures,
      opened_at = excluded.opened_at
  `).run(name, state, failures, opened_at ?? null);
}

export class CircuitBreaker {
  constructor(name) {
    this.name = name;
  }


  currentState() {
    const row = getRow(this.name);
    if (row.state === 'open' && row.opened_at &&
        (Date.now() - row.opened_at) >= HALF_OPEN_AFTER_MS) {
      setRow(this.name, 'half-open', row.failures, row.opened_at);
      return 'half-open';
    }
    return row.state;
  }

  onSuccess() {
    setRow(this.name, 'closed', 0, null);
  }

  onFailure() {
    const row = getRow(this.name);
    const failures = (row.failures || 0) + 1;
    if (row.state === 'half-open' || failures >= FAIL_THRESHOLD) {
      setRow(this.name, 'open', failures, Date.now());
    } else {
      setRow(this.name, 'closed', failures, null);
    }
  }


  guard() {
    const s = this.currentState();
    if (s === 'open') {
      const row = getRow(this.name);
      const remaining = row.opened_at
        ? Math.max(0, Math.ceil((HALF_OPEN_AFTER_MS - (Date.now() - row.opened_at)) / 1000))
        : 0;
      return `circuit '${this.name}' is OPEN — ${FAIL_THRESHOLD} consecutive failures; retry in ${remaining}s`;
    }
    return null;
  }
}
