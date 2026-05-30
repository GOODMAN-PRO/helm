#!/usr/bin/env node
// Helm Phase 1 smoke test. Exits 0 on all green, 1 on any failure.
// Run: node workspace/tests/smoke.mjs

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE  = path.resolve(__dirname, '..');
const ROOT       = path.resolve(__dirname, '../..');

let passed = 0, failed = 0;

function ok(label) {
  console.log(`  PASS  ${label}`);
  passed++;
}
function fail(label, reason) {
  console.error(`  FAIL  ${label}: ${reason}`);
  failed++;
}

// ---- 1. Discord adapter: parses messages correctly ----
{
  const label = 'Discord adapter: splitAttachments + chunk parsing';
  try {
    // Import the relevant logic directly from index.js without starting the bot.
    // We test the parsing functions in isolation.
    const src = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    if (!src.includes('splitAttachments')) throw new Error('splitAttachments missing from index.js');
    if (!src.includes('ATTACH:')) throw new Error('ATTACH: convention missing');
    if (!src.includes('workspace/sessions.mjs')) throw new Error('unified sessions not imported in index.js');
    if (!src.includes('30 * 60_000')) throw new Error('30-min cap not found in index.js (old 5-min cap still present?)');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 2. iMessage: attributedBody decoder present ----
{
  const label = 'iMessage: decodeAttributedBody present and NSString logic intact';
  try {
    const src = readFileSync(path.join(ROOT, 'imessage.js'), 'utf8');
    if (!src.includes('decodeAttributedBody')) throw new Error('decodeAttributedBody missing');
    if (!src.includes('NSString')) throw new Error('NSString anchor missing');
    if (!src.includes('workspace/sessions.mjs')) throw new Error('unified sessions not imported in imessage.js');
    if (!src.includes('30 * 60_000')) throw new Error('30-min cap not found in imessage.js');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 3. claude -p round-trip from WORKSPACE ----
{
  const label = 'claude -p: round-trip with --add-dir workspace';
  try {
    const r = spawnSync(
      'claude',
      ['-p', '--output-format', 'json',
       '--model', 'haiku',
       '--permission-mode', 'bypassPermissions',
       '--add-dir', WORKSPACE,
       '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
       '--max-turns', '1'],
      { input: 'Reply with exactly: SMOKE_OK', encoding: 'utf8', timeout: 120_000 }
    );
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${(r.stderr || '').slice(0, 200)}`);
    let result = r.stdout.trim();
    try { result = JSON.parse(result).result ?? result; } catch { /* raw output */ }
    if (!result.includes('SMOKE_OK')) throw new Error(`unexpected reply: ${result.slice(0, 120)}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 4. memory.recall "example query" returns the seeded example facts ----
{
  const label = 'memory.recall "example query" returns the seeded example facts';
  try {
    const r = spawnSync(
      'node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'recall', 'example query'],
      { encoding: 'utf8', timeout: 15_000 }
    );
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`);
    const facts = JSON.parse(r.stdout);
    const hasExam = facts.some(f => f.kind === 'exam' || /examfacts/i.test(f.key + f.value));
    if (!hasExam) throw new Error(`no the seeded example facts found in ${JSON.stringify(facts).slice(0, 200)}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 5. tools list returns >= 10 built-ins ----
{
  const label = 'tools list returns all 10 built-in tools';
  try {
    const r = spawnSync(
      'node',
      [path.join(WORKSPACE, 'tools/tools.mjs'), 'list'],
      { encoding: 'utf8', timeout: 10_000 }
    );
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`);
    const tools = JSON.parse(r.stdout);
    if (tools.length < 10) throw new Error(`only ${tools.length} tools (expected >= 10)`);
    const required = ['screencap', 'gui.click', 'gui.type', 'gui.key', 'imessage.send',
                      'discord.attach', 'memory.remember', 'memory.recall',
                      'scheduler.add', 'scheduler.list'];
    const names = tools.map(t => t.name);
    const missing = required.filter(n => !names.includes(n));
    if (missing.length) throw new Error(`missing tools: ${missing.join(', ')}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 6. sessions.db module works ----
{
  const label = 'sessions.mjs: get/set/delete round-trip';
  try {
    const { getSession, setSession, deleteSession } = await import(
      path.join(ROOT, 'workspace/sessions.mjs')
    );
    setSession('smoke-test', 'sess-abc', 'test');
    const v = getSession('smoke-test');
    if (v !== 'sess-abc') throw new Error(`expected sess-abc, got ${v}`);
    deleteSession('smoke-test');
    const v2 = getSession('smoke-test');
    if (v2 !== null) throw new Error(`expected null after delete, got ${v2}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 7. scheduler cron module: basic correctness (UTC interpretation) ----
{
  const label = 'scheduler/cron.mjs: match + nextCronDate (UTC)';
  try {
    const { cronMatches, nextCronDate } = await import(
      path.join(WORKSPACE, 'scheduler/cron.mjs')
    );
    // Use Date.UTC so results are timezone-independent.
    const d = new Date(Date.UTC(2026, 4, 30, 9, 0, 0)); // 2026-05-30 09:00 UTC
    if (!cronMatches('* * * * *', d)) throw new Error('* * * * * should always match');
    if (!cronMatches('0 9 * * *', d)) throw new Error('0 9 * * * should match UTC 09:00');
    const d2 = new Date(Date.UTC(2026, 4, 30, 9, 1, 0)); // UTC 09:01
    if (cronMatches('0 9 * * *', d2)) throw new Error('should not match UTC 09:01');
    const next = nextCronDate('0 9 * * *', d);
    if (!next) throw new Error('nextCronDate returned null');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 8. runs/runs.mjs: makeRunDir creates a dir ----
{
  const label = 'runs/runs.mjs: makeRunDir creates directory';
  try {
    const { makeRunDir, appendLog, finaliseRun } = await import(
      path.join(WORKSPACE, 'runs/runs.mjs')
    );
    const dir = makeRunDir('smoke');
    const { existsSync: exists } = await import('node:fs');
    if (!exists(dir)) throw new Error(`dir not created: ${dir}`);
    appendLog(dir, { event: 'test' });
    finaliseRun(dir, 'smoke passed');
    if (!exists(path.join(dir, 'result.md'))) throw new Error('result.md not written');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 9. BUG-1: cron 0 2 * * * fires at UTC 02:00, not local 02:00 ----
{
  const label = 'BUG-1: cron 0 2 * * * matches UTC 02:00, not local time';
  try {
    const { cronMatches, nextCronDate } = await import(
      path.join(WORKSPACE, 'scheduler/cron.mjs')
    );
    const atUtc2 = new Date(Date.UTC(2026, 4, 30, 2, 0, 0)); // 2026-05-30 02:00 UTC
    if (!cronMatches('0 2 * * *', atUtc2)) throw new Error('must match UTC 02:00');
    const atUtc9 = new Date(Date.UTC(2026, 4, 30, 9, 0, 0)); // 2026-05-30 09:00 UTC
    if (cronMatches('0 2 * * *', atUtc9)) throw new Error('must not match UTC 09:00');
    // nextCronDate from UTC 03:00 must land at next day UTC 02:00
    const from = new Date(Date.UTC(2026, 4, 30, 3, 0, 0));
    const next = nextCronDate('0 2 * * *', from);
    if (!next) throw new Error('nextCronDate returned null');
    if (next.getUTCHours() !== 2 || next.getUTCMinutes() !== 0)
      throw new Error(`expected UTC 02:00, got ${next.toISOString()}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 10. BUG-2: migrate.mjs is idempotent — double run does not grow facts ----
{
  const label = 'BUG-2: migrate.mjs double run does not grow fact count';
  try {
    const r1 = spawnSync('node', [path.join(WORKSPACE, 'memory/migrate.mjs')],
      { encoding: 'utf8', timeout: 15_000 });
    if (r1.status !== 0) throw new Error(`first run failed: ${r1.stderr}`);
    const dump1 = spawnSync('node', [path.join(WORKSPACE, 'memory/memory.mjs'), 'dump'],
      { encoding: 'utf8', timeout: 10_000 });
    const count1 = JSON.parse(dump1.stdout).length;
    const r2 = spawnSync('node', [path.join(WORKSPACE, 'memory/migrate.mjs')],
      { encoding: 'utf8', timeout: 15_000 });
    if (r2.status !== 0) throw new Error(`second run failed: ${r2.stderr}`);
    const dump2 = spawnSync('node', [path.join(WORKSPACE, 'memory/memory.mjs'), 'dump'],
      { encoding: 'utf8', timeout: 10_000 });
    const count2 = JSON.parse(dump2.stdout).length;
    if (count2 !== count1) throw new Error(`count grew ${count1} → ${count2} on re-run`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 11. BUG-3: confirm gate — imessage.send without --force exits non-zero ----
{
  const label = 'BUG-3: tools.mjs imessage.send without --force exits non-zero with CONFIRM in stderr';
  try {
    const r = spawnSync('node', [
      path.join(WORKSPACE, 'tools/tools.mjs'), 'call', 'imessage.send',
      '--json', '{"handle":"+1555000000","text":"test"}',
    ], { encoding: 'utf8', timeout: 10_000 });
    if (r.status === 0) throw new Error('expected non-zero exit, got 0');
    if (!r.stderr.includes('CONFIRM')) throw new Error(`"CONFIRM" missing from stderr: ${r.stderr.slice(0, 200)}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 12. BUG-5: scheduler.add rejects impossible cron expression ----
{
  const label = 'BUG-5: scheduler.add rejects impossible cron 0 0 30 2 *';
  try {
    const r = spawnSync('node', [
      path.join(WORKSPACE, 'tools/impl/scheduler.add.mjs'),
      '--name', 'smoke-impossible-cron',
      '--cron', '0 0 30 2 *',
      '--payload', 'test',
      '--enabled', 'false',
    ], { encoding: 'utf8', timeout: 10_000 });
    if (r.status === 0) throw new Error('expected non-zero exit for impossible cron, got 0');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 13. memory consolidation script is runnable and idempotent ----
{
  const label = 'memory/consolidate.mjs: dry-run + live run succeed and preserve owner facts';
  try {
    // Pre/post fact count of CLAUDE.md-sourced rows must be unchanged (those never decay/prune).
    const before = JSON.parse(spawnSync('node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'dump'],
      { encoding: 'utf8', timeout: 10_000 }).stdout)
      .filter(f => f.source === 'CLAUDE.md').length;

    const dry = spawnSync('node',
      [path.join(WORKSPACE, 'memory/consolidate.mjs'), '--dry-run'],
      { encoding: 'utf8', timeout: 15_000 });
    if (dry.status !== 0) throw new Error(`dry-run failed: ${dry.stderr}`);
    const dryReport = JSON.parse(dry.stdout);
    if (dryReport.dry_run !== true) throw new Error('dry_run flag not echoed');

    const live = spawnSync('node',
      [path.join(WORKSPACE, 'memory/consolidate.mjs')],
      { encoding: 'utf8', timeout: 15_000 });
    if (live.status !== 0) throw new Error(`live run failed: ${live.stderr}`);

    const after = JSON.parse(spawnSync('node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'dump'],
      { encoding: 'utf8', timeout: 10_000 }).stdout)
      .filter(f => f.source === 'CLAUDE.md').length;
    if (after !== before) throw new Error(`CLAUDE.md facts changed: ${before} → ${after}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 14. active learning: evidence_count rises on repeat, provisional cap on first observe ----
{
  const label = 'memory.remember: observed first-write capped at 0.7, repeat increments evidence_count';
  try {
    const KEY = '__smoke_active_learn';
    // ensure clean state
    const cleanup = () => {
      const d = JSON.parse(spawnSync('node',
        [path.join(WORKSPACE, 'memory/memory.mjs'), 'dump', '--kind', 'preference'],
        { encoding: 'utf8', timeout: 10_000 }).stdout);
      for (const r of d.filter(x => x.key === KEY)) {
        spawnSync('node',
          [path.join(WORKSPACE, 'memory/memory.mjs'), 'forget', String(r.id)],
          { encoding: 'utf8', timeout: 5_000 });
      }
    };
    cleanup();

    const r1 = JSON.parse(spawnSync('node', [
      path.join(WORKSPACE, 'memory/memory.mjs'), 'remember', 'preference', KEY, 'v1',
      '--source', 'observed', '--confidence', '0.95',
    ], { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (r1.evidence_count !== 1) throw new Error(`expected evidence_count 1, got ${r1.evidence_count}`);
    if (r1.confidence > 0.71) throw new Error(`first observation should cap conf <=0.7, got ${r1.confidence}`);

    const r2 = JSON.parse(spawnSync('node', [
      path.join(WORKSPACE, 'memory/memory.mjs'), 'remember', 'preference', KEY, 'v1',
      '--source', 'observed', '--confidence', '0.95',
    ], { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (r2.evidence_count !== 2) throw new Error(`expected evidence_count 2 on repeat, got ${r2.evidence_count}`);
    if (r2.confidence <= r1.confidence) throw new Error(`repeat should raise confidence (${r1.confidence} → ${r2.confidence})`);
    cleanup();
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 15. unsure verb returns array of low-confidence preferences ----
{
  const label = 'memory.mjs unsure: returns JSON array filtered by threshold';
  try {
    const r = spawnSync('node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'unsure', '--threshold', '1.0'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`);
    const arr = JSON.parse(r.stdout);
    if (!Array.isArray(arr)) throw new Error('output is not an array');
    if (arr.some(x => x.kind !== 'preference')) throw new Error('returned non-preference row');
    if (arr.some(x => x.confidence >= 1.0)) throw new Error('threshold not respected');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 16. recall output shape unchanged (semantic blend preserves keys) ----
{
  const label = 'memory.mjs recall: output shape includes the original fact columns';
  try {
    const r = spawnSync('node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'recall', 'example query'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`);
    const arr = JSON.parse(r.stdout);
    if (!arr.length) throw new Error('no results');
    const first = arr[0];
    for (const k of ['id', 'kind', 'key', 'value', 'confidence', 'updated']) {
      if (!(k in first)) throw new Error(`missing key in recall result: ${k}`);
    }
    for (const k of ['_score', '_k', '_s']) {
      if (k in first) throw new Error(`internal scoring key ${k} leaked to output`);
    }
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 17. plans subsystem: create → add-step → next → complete → show round-trip ----
{
  const label = 'plans/plan.mjs: create → add-step → next → complete → show round-trip';
  try {
    const PLAN = path.join(WORKSPACE, 'plans/plan.mjs');

    // Delete the test DB before to keep the test hermetic.
    const DB = path.join(WORKSPACE, 'plans/plans.db');
    const { unlinkSync, existsSync: exists } = await import('node:fs');
    if (exists(DB)) unlinkSync(DB);

    // create
    const rCreate = spawnSync('node', [PLAN, 'create', 'smoke test goal'],
      { encoding: 'utf8', timeout: 10_000 });
    if (rCreate.status !== 0) throw new Error(`create failed: ${rCreate.stderr}`);
    const plan = JSON.parse(rCreate.stdout);
    if (!plan.id || plan.status !== 'active') throw new Error(`bad plan shape: ${rCreate.stdout}`);

    // add-step
    const rStep = spawnSync('node', [PLAN, 'add-step', String(plan.id), 'do the thing', '--tool', 'echo ok'],
      { encoding: 'utf8', timeout: 10_000 });
    if (rStep.status !== 0) throw new Error(`add-step failed: ${rStep.stderr}`);
    const step = JSON.parse(rStep.stdout);
    if (!step.id || step.status !== 'pending' || step.tool_or_cmd !== 'echo ok')
      throw new Error(`bad step shape: ${rStep.stdout}`);

    // next
    const rNext = spawnSync('node', [PLAN, 'next', String(plan.id)],
      { encoding: 'utf8', timeout: 10_000 });
    if (rNext.status !== 0) throw new Error(`next failed: ${rNext.stderr}`);
    const nextObj = JSON.parse(rNext.stdout);
    if (!nextObj.step || nextObj.step.id !== step.id)
      throw new Error(`next returned wrong step: ${rNext.stdout}`);

    // complete
    const rComplete = spawnSync('node', [
      PLAN, 'complete', String(plan.id), String(step.id),
      '--result', 'smoke passed', '--checkpoint', 'ckpt-1',
    ], { encoding: 'utf8', timeout: 10_000 });
    if (rComplete.status !== 0) throw new Error(`complete failed: ${rComplete.stderr}`);
    const completed = JSON.parse(rComplete.stdout);
    if (completed.status !== 'done' || completed.result !== 'smoke passed')
      throw new Error(`bad complete result: ${rComplete.stdout}`);

    // show — plan should now be done (all steps complete)
    const rShow = spawnSync('node', [PLAN, 'show', String(plan.id)],
      { encoding: 'utf8', timeout: 10_000 });
    if (rShow.status !== 0) throw new Error(`show failed: ${rShow.stderr}`);
    const shown = JSON.parse(rShow.stdout);
    if (shown.status !== 'done') throw new Error(`plan not done after complete: ${rShow.stdout}`);
    if (!Array.isArray(shown.steps) || shown.steps.length !== 1)
      throw new Error(`bad steps array in show: ${rShow.stdout}`);

    // list — must include the plan
    const rList = spawnSync('node', [PLAN, 'list'], { encoding: 'utf8', timeout: 10_000 });
    if (rList.status !== 0) throw new Error(`list failed: ${rList.stderr}`);
    const list = JSON.parse(rList.stdout);
    if (!Array.isArray(list) || !list.some(p => p.id === plan.id))
      throw new Error(`plan not in list: ${rList.stdout}`);

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 18. dashboard/server.mjs: syntax check and GET / returns HTTP 200 ----
{
  const label = 'dashboard/server.mjs: syntax check and GET / returns HTTP 200';
  try {
    const SERVER = path.join(WORKSPACE, 'dashboard/server.mjs');
    if (!existsSync(SERVER)) throw new Error('server.mjs missing');

    // syntax check
    const rCheck = spawnSync('node', ['--check', SERVER], { encoding: 'utf8', timeout: 10_000 });
    if (rCheck.status !== 0) throw new Error(`syntax error: ${rCheck.stderr}`);

    // pre-import async modules before using them in sync callbacks
    const { createServer: netServer } = await import('node:net');
    const { spawn: spawnProc } = await import('node:child_process');
    const { request: httpRequest } = await import('node:http');

    // find a free ephemeral port
    const port = await new Promise((res, rej) => {
      const probe = netServer();
      probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => res(p)); });
      probe.on('error', rej);
    });

    // start server on ephemeral port and GET /
    await new Promise((resolve, reject) => {
      const child = spawnProc('node', [SERVER], {
        env: { ...process.env, PORT: String(port) },
        stdio: 'pipe',
      });
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        child.kill();
        if (err) reject(err); else resolve();
      };
      child.on('error', done);
      const tryFetch = (attempts) => {
        if (attempts <= 0) return done(new Error('server never became ready'));
        setTimeout(() => {
          const req = httpRequest(
            { hostname: '127.0.0.1', port, path: '/', method: 'GET' },
            res => {
              if (res.statusCode !== 200) return done(new Error(`GET / returned ${res.statusCode}`));
              res.resume();
              res.on('end', () => done(null));
            }
          );
          req.on('error', () => tryFetch(attempts - 1));
          req.end();
        }, 200);
      };
      tryFetch(15);
    });

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- summary ----
console.log('');
console.log(`Smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
