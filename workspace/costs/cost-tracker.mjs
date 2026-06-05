#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = path.join(__dirname, 'costs.db');
mkdirSync(__dirname, { recursive: true });

let _db = null;
function openDb() {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    _db.exec(`CREATE TABLE IF NOT EXISTS costs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ts            TEXT    NOT NULL,
      model         TEXT    NOT NULL DEFAULT 'unknown',
      prompt_chars  INTEGER NOT NULL DEFAULT 0,
      output_chars  INTEGER NOT NULL DEFAULT 0,
      est_tokens    INTEGER NOT NULL DEFAULT 0
    )`);
  }
  return _db;
}


function estTokens(promptChars, outputChars) {
  return Math.round(((promptChars || 0) + (outputChars || 0)) / 4);
}


export function appendCost(model, promptChars, outputChars) {
  openDb().prepare(
    `INSERT INTO costs (ts, model, prompt_chars, output_chars, est_tokens)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    new Date().toISOString(),
    model || 'unknown',
    promptChars || 0,
    outputChars || 0,
    estTokens(promptChars, outputChars)
  );
}



export function getCostSummary(since) {
  let sinceTs;
  if (since instanceof Date) sinceTs = since.toISOString();
  else if (typeof since === 'number') sinceTs = new Date(since).toISOString();
  else sinceTs = since ?? '1970-01-01T00:00:00.000Z';

  return openDb().prepare(`
    SELECT
      model,
      COUNT(*)            AS runs,
      SUM(prompt_chars)   AS total_prompt_chars,
      SUM(output_chars)   AS total_output_chars,
      SUM(est_tokens)     AS total_est_tokens
    FROM costs
    WHERE ts >= ?
    GROUP BY model
    ORDER BY total_est_tokens DESC
  `).all(sinceTs);
}
