#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../scheduler/jobs.db');

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    cron TEXT NOT NULL, last_run INTEGER, next_run INTEGER,
    payload TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);
try { db.exec(`ALTER TABLE jobs ADD COLUMN notify INTEGER NOT NULL DEFAULT 1`); } catch { /* already present */ }

const jobs = db.prepare(`SELECT * FROM jobs ORDER BY id`).all();
db.close();

const formatted = jobs.map(j => ({
  id: j.id,
  name: j.name,
  cron: j.cron,
  enabled: !!j.enabled,
  notify: !!j.notify,
  last_run: j.last_run ? new Date(j.last_run * 1000).toISOString() : null,
  next_run: j.next_run ? new Date(j.next_run * 1000).toISOString() : null,
  payload: j.payload.slice(0, 80) + (j.payload.length > 80 ? '...' : ''),
}));

console.log(JSON.stringify(formatted, null, 2));
