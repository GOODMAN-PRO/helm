#!/usr/bin/env node
// Multi-step planning subsystem. DB at workspace/plans/plans.db.
// All output is JSON on stdout. Exits 0 on success, 1 on error.
//
// Verbs:
//   create <goal>
//   add-step <plan_id> <task> [--tool <tool_or_cmd>]
//   next <plan_id>
//   complete <plan_id> <step_id> [--result <text>] [--checkpoint <text>]
//   show <plan_id>
//   list

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.join(__dirname, 'plans.db');

mkdirSync(__dirname, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    goal    TEXT    NOT NULL,
    created INTEGER NOT NULL DEFAULT (unixepoch()),
    status  TEXT    NOT NULL DEFAULT 'active'
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
    created     INTEGER NOT NULL DEFAULT (unixepoch()),
    updated     INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

function out(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function die(msg) {
  console.error(JSON.stringify({ error: msg }));
  process.exit(1);
}

function planRow(row) {
  return { id: row.id, goal: row.goal, created: row.created, status: row.status };
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
  };
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

const verb = shift();

// ---- verbs ----

if (verb === 'create') {
  const goal = args.join(' ').trim();
  if (!goal) die('usage: plan.mjs create <goal>');
  const r = db.prepare(`INSERT INTO plans (goal) VALUES (?) RETURNING *`).get(goal);
  out(planRow(r));

} else if (verb === 'add-step') {
  const planId = Number(shift());
  if (!planId) die('usage: plan.mjs add-step <plan_id> <task> [--tool <cmd>]');
  const tool = flagValue('--tool');
  const task = args.join(' ').trim();
  if (!task) die('usage: plan.mjs add-step <plan_id> <task> [--tool <cmd>]');

  const plan = db.prepare(`SELECT id FROM plans WHERE id = ?`).get(planId);
  if (!plan) die(`plan ${planId} not found`);

  const maxRow = db.prepare(`SELECT COALESCE(MAX(idx), -1) as m FROM steps WHERE plan_id = ?`).get(planId);
  const idx = maxRow.m + 1;

  const r = db.prepare(`
    INSERT INTO steps (plan_id, idx, task, tool_or_cmd) VALUES (?, ?, ?, ?) RETURNING *
  `).get(planId, idx, task, tool);

  // Reactivate plan if it was closed — a new pending step makes it active again.
  db.prepare(`UPDATE plans SET status='active' WHERE id=? AND status='done'`).run(planId);

  out(stepRow(r));

} else if (verb === 'next') {
  const planId = Number(shift());
  if (!planId) die('usage: plan.mjs next <plan_id>');

  const plan = db.prepare(`SELECT * FROM plans WHERE id = ?`).get(planId);
  if (!plan) die(`plan ${planId} not found`);
  if (plan.status === 'done') {
    out({ plan_id: planId, status: 'done', step: null });
    process.exit(0);
  }

  const step = db.prepare(`
    SELECT * FROM steps WHERE plan_id = ? AND status = 'pending' ORDER BY idx ASC LIMIT 1
  `).get(planId);

  if (!step) {
    // No pending steps — auto-complete the plan.
    db.prepare(`UPDATE plans SET status = 'done' WHERE id = ?`).run(planId);
    out({ plan_id: planId, status: 'done', step: null });
  } else {
    out({ plan_id: planId, status: plan.status, step: stepRow(step) });
  }

} else if (verb === 'complete') {
  const planId = Number(shift());
  const stepId = Number(shift());
  if (!planId || !stepId) die('usage: plan.mjs complete <plan_id> <step_id> [--result <text>] [--checkpoint <text>]');

  const result     = flagValue('--result');
  const checkpoint = flagValue('--checkpoint');

  const step = db.prepare(`SELECT * FROM steps WHERE id = ? AND plan_id = ?`).get(stepId, planId);
  if (!step) die(`step ${stepId} not found in plan ${planId}`);
  if (step.status !== 'pending') die(`step ${stepId} is already ${step.status}`);

  db.prepare(`
    UPDATE steps SET status='done', result=?, checkpoint=?, updated=unixepoch() WHERE id=?
  `).run(result, checkpoint, stepId);

  // Check if all steps are done → mark plan done.
  const pending = db.prepare(`SELECT COUNT(*) as n FROM steps WHERE plan_id=? AND status='pending'`).get(planId);
  if (pending.n === 0) {
    db.prepare(`UPDATE plans SET status='done' WHERE id=?`).run(planId);
  }

  out(stepRow(db.prepare(`SELECT * FROM steps WHERE id=?`).get(stepId)));

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
  die(`unknown verb: ${verb ?? '(none)'}. verbs: create, add-step, next, complete, show, list`);
}
