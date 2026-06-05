#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'jobs.db');

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL UNIQUE,
    cron     TEXT    NOT NULL,
    last_run INTEGER,
    next_run INTEGER,
    payload  TEXT    NOT NULL,
    enabled  INTEGER NOT NULL DEFAULT 0,
    created  INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

db.close();
console.log(`jobs.db ready at ${DB_PATH}`);
