#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../senses/screen/events.db');

const args = process.argv.slice(2);
const tsIdx = args.indexOf('--ts');
if (tsIdx === -1) {
  console.error('Usage: screen.at --ts <unix_ms>');
  process.exit(1);
}
const ts = parseInt(args[tsIdx + 1], 10);
if (isNaN(ts)) {
  console.error('--ts must be a valid integer (Unix ms)');
  process.exit(1);
}

if (!existsSync(DB_PATH)) {
  console.log(JSON.stringify(null));
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


const row = db.prepare(`
  SELECT id, ts, hash, png_path, ocr_text
  FROM events
  ORDER BY ABS(ts - ?) ASC
  LIMIT 1
`).get(ts);

console.log(JSON.stringify(row ?? null));
