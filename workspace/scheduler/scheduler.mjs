#!/usr/bin/env node
// Helm scheduler daemon. Ticks every 30s, fires due jobs by spawning claude -p.
// Keeps jobs.db at workspace/scheduler/jobs.db.
// Launched by launchd com.helm.scheduler; safe to run manually.

import { DatabaseSync } from 'node:sqlite';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path   from 'node:path';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../..'); // secondme/
const WORKSPACE = path.resolve(__dirname, '..');    // secondme/workspace/

loadEnv({ path: path.join(ROOT, '.env') });

const {
  CLAUDE_BIN     = 'claude',
  MODEL          = 'sonnet',
  PERMISSION_MODE = 'bypassPermissions',
} = process.env;

const DB_PATH  = path.join(__dirname, 'jobs.db');
const PUSH_BIN = path.join(ROOT, 'bin', 'helm-push.mjs');

// Ensure db exists (idempotent init inline so the daemon is self-bootstrapping).
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
// Idempotent: notify column added if missing.
try { db.exec(`ALTER TABLE jobs ADD COLUMN notify INTEGER NOT NULL DEFAULT 1`); } catch { /* already present */ }

function pushOwner(text) {
  try {
    const r = spawnSync(process.execPath, [PUSH_BIN, text], { encoding: 'utf8' });
    if (r.status !== 0) log(`push failed: ${(r.stderr || '').trim()}`);
  } catch (e) {
    log(`push error: ${e.message}`);
  }
}

import { cronMatches, nextCronDate } from './cron.mjs';
import { makeRunDir, appendLog, finaliseRun } from '../runs/runs.mjs';

const log = msg => console.log(`[scheduler] ${new Date().toISOString()}  ${msg}`);

const stmtDue = db.prepare(
  `SELECT * FROM jobs WHERE enabled = 1 AND (next_run IS NULL OR next_run <= unixepoch())`
);
const stmtUpdate = db.prepare(
  `UPDATE jobs SET last_run = unixepoch(), next_run = ? WHERE id = ?`
);
// Bug fix 3: rescheduling a new job that didn't match this tick must NOT touch last_run.
const stmtSchedule = db.prepare(
  `UPDATE jobs SET next_run = ? WHERE id = ?`
);
const stmtDisable = db.prepare(
  `UPDATE jobs SET enabled = 0, next_run = NULL WHERE id = ?`
);

// Bug fix 1: track in-flight job IDs to prevent concurrent execution of the same job.
const running = new Set();

function fireJob(job) {
  running.add(job.id); // Bug fix 1: mark in-flight before async work begins
  const slug = job.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
  const runDir = makeRunDir(slug);

  const persona =
    'You are Helm, running a scheduled background job. ' +
    'Workspace is available; you have full authority over this Mac. Act on the goal, keep output concise. ' +
    'No emojis, no preamble. Confirm before anything destructive or money-spending. ' +
    'NEVER touch ~/helm or the Helm Supabase/daemon (com.helm.agent) — a separate project, strictly off-limits.';

  const args = [
    '-p', '--output-format', 'json',
    '--model', MODEL,
    '--permission-mode', PERMISSION_MODE,
    '--append-system-prompt', persona,
    '--add-dir', WORKSPACE,
    '--add-dir', '/Users/owner', // full home access; ~/helm off-limits per persona
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
  ];

  writeFileSync(path.join(runDir, 'prompt.txt'), job.payload);
  appendLog(runDir, { event: 'start', job: job.name, cron: job.cron });

  const child = spawn(CLAUDE_BIN, args, { cwd: WORKSPACE });
  let out = '', err = '';

  // 2-hour hard cap — prevents a hung job from holding a process reference forever.
  const JOB_TIMEOUT = 2 * 60 * 60 * 1000;
  const killTimer = setTimeout(() => {
    log(`job "${job.name}" exceeded ${JOB_TIMEOUT / 60000}min — killing`);
    child.kill();
  }, JOB_TIMEOUT);

  child.stdout.on('data', d => {
    out += d;
    appendLog(runDir, { event: 'stdout', data: d.toString() });
  });
  child.stderr.on('data', d => {
    err += d;
    appendLog(runDir, { event: 'stderr', data: d.toString() });
  });

  child.stdin.write(job.payload);
  child.stdin.end();

  child.on('close', code => {
    clearTimeout(killTimer);
    running.delete(job.id); // Bug fix 1: clear in-flight on completion
    appendLog(runDir, { event: 'close', code });
    let result = '(no output)';
    try {
      const j = JSON.parse(out);
      result = (j.result ?? '').toString().trim() || '(empty)';
    } catch {
      result = out.trim() || err.trim() || `(exit ${code})`;
    }
    finaliseRun(runDir, result);
    log(`job "${job.name}" finished (code ${code}) → ${runDir}`);
    if (job.notify) {
      const trimmed = result.length > 1700 ? result.slice(0, 1700) + '\n…[truncated]' : result;
      pushOwner(`[${job.name}] ${trimmed}`);
    }
  });

  child.on('error', e => {
    clearTimeout(killTimer);
    running.delete(job.id); // Bug fix 1: clear in-flight on error
    appendLog(runDir, { event: 'error', message: e.message });
    finaliseRun(runDir, `ERROR: ${e.message}`);
    log(`job "${job.name}" error: ${e.message}`);
  });
}

function tick() {
  const now = new Date();
  let due;
  try { due = stmtDue.all(); } catch (e) { log(`db error: ${e.message}`); return; }

  for (const job of due) {
    try {
      // Bug fix 1: skip jobs that are already running to prevent overlap.
      if (running.has(job.id)) {
        log(`job "${job.name}" still in-flight — skipping this tick`);
        continue;
      }

      const next = nextCronDate(job.cron);
      if (!next) {
        log(`WARNING: job "${job.name}" cron "${job.cron}" has no valid next date — disabling`);
        stmtDisable.run(job.id);
        continue;
      }

      // Bug fix 2: a job is overdue when next_run was explicitly set (not NULL) and is now
      // in the past — meaning the daemon was down when it should have fired. Fire it as a
      // catch-up regardless of whether cronMatches the current minute.
      const isOverdue = job.next_run !== null;

      if (!cronMatches(job.cron, now) && !isOverdue) {
        // New job (next_run IS NULL) that doesn't match this minute — schedule it.
        // Bug fix 3: use stmtSchedule (next_run only) so last_run is not poisoned.
        stmtSchedule.run(Math.floor(next.getTime() / 1000), job.id);
        continue;
      }

      if (isOverdue && !cronMatches(job.cron, now)) {
        log(`job "${job.name}" overdue — firing catch-up run`);
      } else {
        log(`firing job "${job.name}"`);
      }
      stmtUpdate.run(Math.floor(next.getTime() / 1000), job.id);
      fireJob(job);
    } catch (e) {
      log(`error firing job "${job.name}": ${e.message}`);
    }
  }
}

log('scheduler started (tick every 30s)');
tick(); // fire once on startup in case anything is overdue
setInterval(tick, 30_000);

// Keep the process alive.
process.on('SIGTERM', () => { log('SIGTERM — shutting down'); db.close(); process.exit(0); });
process.on('SIGINT',  () => { log('SIGINT — shutting down');  db.close(); process.exit(0); });
