#!/usr/bin/env node
// exam-countdown.mjs — exam-proximity notifier (called by the disabled scheduler job).
// Reads exam facts from memory.db; pushes ONE DM when any exam is within DAYS_THRESHOLD days.
// Silent when nothing is close. Registered disabled — owner must enable from chat.

import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT     = path.resolve(__dirname, '../..');
const DB_PATH  = path.resolve(__dirname, '../memory/memory.db');
const PUSH_BIN = path.join(ROOT, 'bin', 'helm-push.mjs');

const DAYS_THRESHOLD = parseInt(process.env.EXAM_DAYS_THRESHOLD || '3', 10);

// Extract the first YYYY-MM-DD from strings like "~1 week away (≈ 2026-06-05/06)".
export function parseExamDate(value) {
  const m = String(value).match(/≈\s*(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// Days from the GMT+7 local date to isoDate. Negative = already past.
export function daysUntil(isoDate, nowMs = Date.now()) {
  const todayGmt7 = new Date(nowMs + 7 * 3600_000).toISOString().slice(0, 10);
  return Math.round((new Date(isoDate).getTime() - new Date(todayGmt7).getTime()) / 86_400_000);
}

// Only execute when run directly (not when imported for testing).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(DB_PATH)) process.exit(0); // memory not initialised yet

  const db = new DatabaseSync(DB_PATH);
  let rows;
  try {
    rows = db.prepare(`SELECT key, value FROM facts WHERE kind = 'exam'`).all();
  } finally {
    db.close();
  }

  const upcoming = rows
    .map(r => ({ name: r.key, date: parseExamDate(r.value) }))
    .filter(e => e.date)
    .map(e => ({ ...e, days: daysUntil(e.date) }))
    .filter(e => e.days >= 0 && e.days <= DAYS_THRESHOLD)
    .sort((a, b) => a.days - b.days);

  if (!upcoming.length) process.exit(0); // nothing close — stay silent

  const lines = upcoming.map(e =>
    e.days === 0
      ? `${e.name} TODAY (${e.date})`
      : `${e.name} in ${e.days} day${e.days === 1 ? '' : 's'} (${e.date})`
  );

  const msg = '[exam-countdown] ' + lines.join('; ');
  const r = spawnSync('/usr/bin/env', ['node', PUSH_BIN, msg], { encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(`push failed: ${(r.stderr || '').trim()}\n`);
    process.exit(1);
  }
}
