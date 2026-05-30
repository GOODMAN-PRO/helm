#!/usr/bin/env node
// Tool: screen.search --query <q> [--limit N]
// Searches ocr_text in events.db. Requires OCR to have been enabled in watcher.
// If no OCR data present, returns a helpful error.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../senses/screen/events.db');

const args = process.argv.slice(2);
const qIdx = args.indexOf('--query');
if (qIdx === -1) { console.error('Usage: screen.search --query <text>'); process.exit(1); }
const query = args[qIdx + 1];
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 20;

if (!existsSync(DB_PATH)) {
  console.log(JSON.stringify({ error: 'Screen watcher has not been run yet. Start watcher.mjs first.' }));
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

// Check whether any OCR data exists
const ocrCount = db.prepare('SELECT COUNT(*) as n FROM events WHERE ocr_text IS NOT NULL').get();
if (!ocrCount || ocrCount.n === 0) {
  console.log(JSON.stringify({
    error: 'No OCR data available. Restart the screen watcher with --ocr flag to enable text extraction.',
    hint: 'node workspace/senses/screen/watcher.mjs --ocr'
  }));
  process.exit(0);
}

const rows = db.prepare(`
  SELECT id, ts, hash, png_path, ocr_text
  FROM events
  WHERE ocr_text LIKE ?
  ORDER BY ts DESC
  LIMIT ?
`).all(`%${query}%`, limit);

console.log(JSON.stringify(rows));
