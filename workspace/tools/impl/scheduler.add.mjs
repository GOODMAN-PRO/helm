#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../scheduler/jobs.db');

const args = process.argv.slice(2);
const get = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i+1] : null; };

const name    = get('name');
const cron    = get('cron');
const payload = get('payload');
const enabled = get('enabled') === 'true' ? 1 : 0;

const notify  = get('notify') === 'false' ? 0 : 1;

if (!name || !cron || !payload) {
  console.error('--name, --cron, and --payload required');
  process.exit(1);
}


const { nextCronDate } = await import('../../scheduler/cron.mjs');
const next = nextCronDate(cron);
if (!next) {
  console.error(`impossible cron "${cron}" — no valid next firing date within 366 days`);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    cron TEXT NOT NULL, last_run INTEGER, next_run INTEGER,
    payload TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

try { db.exec(`ALTER TABLE jobs ADD COLUMN notify INTEGER NOT NULL DEFAULT 1`); } catch {  }

const existing = db.prepare(`SELECT id FROM jobs WHERE name = ?`).get(name);
if (existing) {
  db.prepare(
    `UPDATE jobs SET cron=?, payload=?, enabled=?, next_run=?, notify=? WHERE name=?`
  ).run(cron, payload, enabled, next ? Math.floor(next.getTime()/1000) : null, notify, name);
  console.log(JSON.stringify({ action: 'updated', name, cron, enabled: !!enabled, notify: !!notify, next_run: next?.toISOString() }));
} else {
  const r = db.prepare(
    `INSERT INTO jobs (name, cron, payload, enabled, next_run, notify) VALUES (?,?,?,?,?,?)`
  ).run(name, cron, payload, enabled, next ? Math.floor(next.getTime()/1000) : null, notify);
  console.log(JSON.stringify({ action: 'inserted', id: r.lastInsertRowid, name, cron, enabled: !!enabled, notify: !!notify, next_run: next?.toISOString() }));
}
db.close();
