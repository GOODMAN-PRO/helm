#!/usr/bin/env node
// Tool: screen.recent [--limit N]
// Returns last N screen-change events from events.db.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../senses/screen/events.db');

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10;

if (!existsSync(DB_PATH)) {
  console.log(JSON.stringify([]));
  process.exit(0);
}

const db = new DatabaseSync(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  hash TEXT NOT NULL,
  png_path TEXT NOT NULL,
  ocr_text TEXT
)`);

const rows = db.prepare(
  'SELECT id, ts, hash, png_path, ocr_text FROM events ORDER BY ts DESC LIMIT ?'
).all(limit);

console.log(JSON.stringify(rows));
