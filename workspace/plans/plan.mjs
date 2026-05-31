#!/usr/bin/env node
// Multi-step planning subsystem. DB at workspace/plans/plans.db.
// All output is JSON on stdout. Exits 0 on success, 1 on error.
//
// Verbs:
//   create <goal>
//   add-step <plan_id> <task> [--tool <tool_or_cmd>] [--deps <id1,id2,...>]
//   next <plan_id>
//   complete <plan_id> <step_id> [--result <text>] [--checkpoint <text>] [--failed] [--no-reflexion]
//   show <plan_id>
//   list
//   replan <plan_id> [--failure <text>] [--steps-json <json>]

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.join(__dirname, 'plans.db');

mkdirSync(__dirname, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    goal          TEXT    NOT NULL,
    created       INTEGER NOT NULL DEFAULT (unixepoch()),
    status        TEXT    NOT NULL DEFAULT 'active',
    replan_count  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS steps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id     INTEGER NOT NULL REFERENCES plans(id),
    idx         INTEGER NOT NULL,
    task        TEXT    NOT NULL,
    tool_or_cmd TEXT,
    status      TEXT    NOT NULL DEFAULT 'pending',
    checkpoint  TEXT,
    result      TEXT,
    deps        TEXT    NOT NULL DEFAULT '[]',
    retry_count INTEGER NOT NULL DEFAULT 0,
    created     INTEGER NOT NULL DEFAULT (unixepoch()),
    updated     INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS checkpoints (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id    INTEGER NOT NULL REFERENCES plans(id),
    step_id    INTEGER NOT NULL REFERENCES steps(id),
    state_json TEXT    NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Migrate existing tables — safe no-op if columns already present.
for (const sql of [
  `ALTER TABLE plans ADD COLUMN replan_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE steps ADD COLUMN deps TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE steps ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`,
]) {
  try { db.exec(sql); } catch { /* column already exists */ }
}

// ---- helpers ----

function out(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function die(msg) {
  console.error(JSON.stringify({ error: msg }));
  process.exit(1);
}

function planRow(row) {
  return {
    id: row.id,
    goal: row.goal,
    created: row.created,
    status: row.status,
    replan_count: row.replan_count ?? 0,
  };
}

function stepRow(row) {
  return {
    id: row.id,
    plan_id: row.plan_id,
    idx: row.idx,
    task: row.task,
    tool_or_cmd: row.tool_or_cmd ?? null,
    status: row.status,
    checkpoint: row.checkpoint ?? null,
    result: row.result ?? null,
    deps: JSON.parse(row.deps ?? '[]'),
    retry_count: row.retry_count ?? 0,
  };
}

// Replace {{step.ID.result}} tokens with actual stored results.
function substituteResults(planId, task) {
  return task.replace(/\{\{step\.(\d+)\.result\}\}/g, (match, id) => {
    const s = db.prepare(`SELECT result FROM steps WHERE id = ? AND plan_id = ?`)
      .get(Number(id), planId);
    return s?.result ?? match;
  });
}

// Latest checkpoint row for a step (returns parsed state or null).
function latestCheckpoint(stepId) {
  const row = db.prepare(
    `SELECT state_json FROM checkpoints WHERE step_id = ? ORDER BY created_at DESC LIMIT 1`
  ).get(stepId);
  return row ? JSON.parse(row.state_json) : null;
}

// All pending steps whose deps are fully satisfied (DAG runnable set).
function runnableSteps(planId) {
  const pending = db.prepare(
    `SELECT * FROM steps WHERE plan_id = ? AND status = 'pending' ORDER BY idx ASC`
  ).all(planId);

  const doneIds = new Set(
    db.prepare(`SELECT id FROM steps WHERE plan_id = ? AND status = 'done'`)
      .all(planId).map(r => r.id)
  );

  return pending.filter(step => {
    const deps = JSON.parse(step.deps ?? '[]');
    return deps.every(id => doneIds.has(id));
  });
}

// Run a single-turn claude -p call; returns stdout text or null on failure.
function claudeOneTurn(prompt, timeoutMs) {
  const r = spawnSync(
    'claude',
    ['-p', '--output-format', 'json',
     '--model', 'haiku',
     '--permission-mode', 'bypassPermissions',
     '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
     '--max-turns', '1'],
    { input: prompt, encoding: 'utf8', timeout: timeoutMs }
  );
  if (r.status !== 0) return null;
  try {
    const parsed = JSON.parse(r.stdout.trim());
    return (parsed.result ?? r.stdout).trim();
  } catch {
    return r.stdout.trim() || null;
  }
}

// ---- arg parsing ----

const args = process.argv.slice(2);

function shift() { return args.shift(); }

function flagValue(flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const val = args[i + 1];
  if (val === undefined || val.startsWith('--')) return null;
  args.splice(i, 2);
  return val;
}

function hasFlag(flag) {
  const i = args.indexOf(flag);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

const verb = shift();

// ---- verbs ----

if (verb === 'create') {
  const goal = args.join(' ').trim();
  if (!goal) die('usage: plan.mjs create <goal>');
  const r = db.prepare(`INSERT INTO plans (goal) VALUES (?) RETURNING *`).get(goal);
  out(planRow(r));

} else if (verb === 'add-step') {
  const planId = Number(shift());
  if (!planId) die('usage: plan.mjs add-step <plan_id> <task> [--tool <cmd>] [--deps <id1,id2,...>]');
  const tool    = flagValue('--tool');
  const depsArg = flagValue('--deps');
  const deps    = depsArg
    ? JSON.stringify(depsArg.split(',').map(Number).filter(Boolean))
    : '[]';
  const task = args.join(' ').trim();
  if (!task) die('usage: plan.mjs add-step <plan_id> <task> [--tool <cmd>] [--deps <id1,id2,...>]');

  const plan = db.prepare(`SELECT id FROM plans WHERE id = ?`).get(planId);
  if (!plan) die(`plan ${planId} not found`);

  const maxRow = db.prepare(`SELECT COALESCE(MAX(idx), -1) as m FROM steps WHERE plan_id = ?`).get(planId);
  const idx = maxRow.m + 1;

  const r = db.prepare(`
    INSERT INTO steps (plan_id, idx, task, tool_or_cmd, deps) VALUES (?, ?, ?, ?, ?) RETURNING *
  `).get(planId, idx, task, tool, deps);

  // Reactivate plan if it was closed — a new pending step makes it active again.
  db.prepare(`UPDATE plans SET status='active' WHERE id=? AND status='done'`).run(planId);

  out(stepRow(r));

} else if (verb === 'next') {
  const planId = Number(shift());
  if (!planId) die('usage: plan.mjs next <plan_id>');

  const plan = db.prepare(`SELECT * FROM plans WHERE id = ?`).get(planId);
  if (!plan) die(`plan ${planId} not found`);

  if (plan.status === 'done') {
    out({ plan_id: planId, status: 'done', step: null, steps: [] });
    process.exit(0);
  }
  if (plan.status === 'blocked') {
    out({ plan_id: planId, status: 'blocked', step: null, steps: [] });
    process.exit(0);
  }

  const runnable = runnableSteps(planId);

  if (!runnable.length) {
    const anyPending = db.prepare(
      `SELECT COUNT(*) as n FROM steps WHERE plan_id=? AND status='pending'`
    ).get(planId);
    if (anyPending.n === 0) {
      // No pending steps at all — auto-close.
      db.prepare(`UPDATE plans SET status = 'done' WHERE id = ? AND status != 'blocked'`).run(planId);
      out({ plan_id: planId, status: 'done', step: null, steps: [] });
    } else {
      // Pending steps exist but deps not yet satisfied (or waiting on blocked dep).
      out({ plan_id: planId, status: plan.status, step: null, steps: [] });
    }
  } else {
    const enriched = runnable.map(s => {
      const row = stepRow(s);
      row.task = substituteResults(planId, row.task);
      row.checkpoint_latest = latestCheckpoint(s.id);
      return row;
    });
    out({
      plan_id: planId,
      status: plan.status,
      step: enriched[0],   // backwards-compat: first runnable step
      steps: enriched,     // full parallel set
    });
  }

} else if (verb === 'complete') {
  const planId = Number(shift());
  const stepId = Number(shift());
  if (!planId || !stepId)
    die('usage: plan.mjs complete <plan_id> <step_id> [--result <text>] [--checkpoint <text>] [--failed] [--no-reflexion]');

  const result       = flagValue('--result');
  const checkpoint   = flagValue('--checkpoint');
  const failed       = hasFlag('--failed');
  const noReflexion  = hasFlag('--no-reflexion');

  const step = db.prepare(`SELECT * FROM steps WHERE id = ? AND plan_id = ?`).get(stepId, planId);
  if (!step) die(`step ${stepId} not found in plan ${planId}`);
  if (step.status !== 'pending') die(`step ${stepId} is already ${step.status}`);

  // Always write a checkpoint.
  const stateJson = JSON.stringify({
    status: failed ? 'failed' : 'done',
    result,
    checkpoint,
    ts: Math.floor(Date.now() / 1000),
  });
  db.prepare(
    `INSERT INTO checkpoints (plan_id, step_id, state_json) VALUES (?, ?, ?)`
  ).run(planId, stepId, stateJson);

  if (failed) {
    const retryCount  = step.retry_count ?? 0;
    const MAX_RETRIES = 2;

    if (retryCount < MAX_RETRIES) {
      // Best-effort reflexion via claude.
      let diagnosis = null;
      if (!noReflexion) {
        const prompt =
          `You are a diagnostic AI. A plan step failed.\n` +
          `Reply with exactly ONE line: the diagnosis and a concrete fix.\n\n` +
          `Task: ${step.task}\nError/Output: ${result ?? '(no output)'}`;
        try {
          const txt = claudeOneTurn(prompt, 60_000);
          if (txt) diagnosis = txt.split('\n')[0].trim();
        } catch { /* skip reflexion if claude unavailable */ }
      }

      // Insert retry step.
      const maxRow = db.prepare(
        `SELECT COALESCE(MAX(idx), -1) as m FROM steps WHERE plan_id = ?`
      ).get(planId);
      const newIdx     = maxRow.m + 1;
      const retryTask  = diagnosis
        ? `[retry ${retryCount + 1}] ${step.task} — fix: ${diagnosis}`
        : `[retry ${retryCount + 1}] ${step.task}`;
      const depsJson   = step.deps ?? '[]';

      const retryRow = db.prepare(`
        INSERT INTO steps (plan_id, idx, task, tool_or_cmd, deps, retry_count)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING *
      `).get(planId, newIdx, retryTask, step.tool_or_cmd, depsJson, retryCount + 1);

      // Mark original step as failed (non-permanent; retry is in flight).
      db.prepare(
        `UPDATE steps SET status='failed', result=?, updated=unixepoch() WHERE id=?`
      ).run(result, stepId);

      out({
        ...stepRow(db.prepare(`SELECT * FROM steps WHERE id=?`).get(stepId)),
        reflexion: diagnosis,
        retry_step_inserted: true,
        retry_step: stepRow(retryRow),
      });

    } else {
      // Max retries exceeded — escalate.
      db.prepare(
        `UPDATE steps SET status='blocked', result=?, updated=unixepoch() WHERE id=?`
      ).run(result, stepId);
      db.prepare(`UPDATE plans SET status='blocked' WHERE id=?`).run(planId);

      out({
        ...stepRow(db.prepare(`SELECT * FROM steps WHERE id=?`).get(stepId)),
        escalated: true,
      });
    }

  } else {
    // Success path.
    db.prepare(`
      UPDATE steps SET status='done', result=?, checkpoint=?, updated=unixepoch() WHERE id=?
    `).run(result, checkpoint, stepId);

    const pending = db.prepare(
      `SELECT COUNT(*) as n FROM steps WHERE plan_id=? AND status='pending'`
    ).get(planId);
    if (pending.n === 0) {
      db.prepare(
        `UPDATE plans SET status='done' WHERE id=? AND status != 'blocked'`
      ).run(planId);
    }

    out(stepRow(db.prepare(`SELECT * FROM steps WHERE id=?`).get(stepId)));
  }

} else if (verb === 'replan') {
  const planId = Number(shift());
  if (!planId) die('usage: plan.mjs replan <plan_id> [--failure <text>] [--steps-json <json>]');

  const failureArg   = flagValue('--failure');
  const stepsJsonArg = flagValue('--steps-json');

  const plan = db.prepare(`SELECT * FROM plans WHERE id=?`).get(planId);
  if (!plan) die(`plan ${planId} not found`);

  const MAX_REPLANS = 3;
  const replanCount = plan.replan_count ?? 0;
  if (replanCount >= MAX_REPLANS)
    die(`replan_count cap reached (${MAX_REPLANS}); escalate manually`);

  const completedSteps = db.prepare(
    `SELECT * FROM steps WHERE plan_id=? AND status='done' ORDER BY idx ASC`
  ).all(planId);
  const pendingSteps = db.prepare(
    `SELECT * FROM steps WHERE plan_id=? AND status='pending' ORDER BY idx ASC`
  ).all(planId);

  let newSteps;

  if (stepsJsonArg) {
    try {
      newSteps = JSON.parse(stepsJsonArg);
      if (!Array.isArray(newSteps)) throw new Error('must be an array');
    } catch (e) {
      die(`invalid --steps-json: ${e.message}`);
    }
  } else {
    const progress  = completedSteps.map(s =>
      `  - [done] ${s.task}${s.result ? ` → ${s.result.slice(0, 100)}` : ''}`
    ).join('\n');
    const remaining = pendingSteps.map(s => `  - ${s.task}`).join('\n');

    const prompt =
      `You are a planning AI. A multi-step plan needs to be revised.\n\n` +
      `Goal: ${plan.goal}\n\n` +
      `Completed steps:\n${progress || '  (none)'}\n\n` +
      (failureArg ? `Last failure: ${failureArg}\n\n` : '') +
      `Remaining steps (to be replaced):\n${remaining || '  (none)'}\n\n` +
      `Output ONLY a JSON array, no prose. ` +
      `Each element: {"task":"...","tool_or_cmd":null,"deps":[]}.`;

    const txt = claudeOneTurn(prompt, 120_000);
    if (!txt) die('claude call failed during replan');
    try {
      const match = txt.match(/\[[\s\S]*\]/);
      if (!match) die('claude did not return a JSON array');
      newSteps = JSON.parse(match[0]);
      if (!Array.isArray(newSteps)) die('claude response is not an array');
    } catch (e) {
      die(`failed to parse claude response: ${e.message}`);
    }
  }

  // Delete pending steps and insert the new set.
  db.prepare(`DELETE FROM steps WHERE plan_id=? AND status='pending'`).run(planId);

  const maxIdxRow = db.prepare(
    `SELECT COALESCE(MAX(idx), -1) as m FROM steps WHERE plan_id=?`
  ).get(planId);
  let nextIdx = maxIdxRow.m + 1;

  const inserted = [];
  for (const s of newSteps) {
    const task = String(s.task ?? '').trim();
    if (!task) continue;
    const tool = s.tool_or_cmd ?? null;
    const deps = JSON.stringify(
      Array.isArray(s.deps) ? s.deps.map(Number).filter(Boolean) : []
    );
    const row = db.prepare(`
      INSERT INTO steps (plan_id, idx, task, tool_or_cmd, deps) VALUES (?, ?, ?, ?, ?) RETURNING *
    `).get(planId, nextIdx++, task, tool, deps);
    inserted.push(stepRow(row));
  }

  db.prepare(
    `UPDATE plans SET replan_count = replan_count + 1, status='active' WHERE id=?`
  ).run(planId);

  out({
    plan_id: planId,
    replan_count: replanCount + 1,
    steps_removed: pendingSteps.length,
    steps_inserted: inserted.length,
    steps: inserted,
  });

} else if (verb === 'show') {
  const planId = Number(shift());
  if (!planId) die('usage: plan.mjs show <plan_id>');

  const plan = db.prepare(`SELECT * FROM plans WHERE id=?`).get(planId);
  if (!plan) die(`plan ${planId} not found`);

  const steps = db.prepare(`SELECT * FROM steps WHERE plan_id=? ORDER BY idx ASC`).all(planId);
  out({ ...planRow(plan), steps: steps.map(stepRow) });

} else if (verb === 'list') {
  const plans = db.prepare(`SELECT * FROM plans ORDER BY id DESC`).all();
  out(plans.map(planRow));

} else {
  die(`unknown verb: ${verb ?? '(none)'}. verbs: create, add-step, next, complete, show, list, replan`);
}
